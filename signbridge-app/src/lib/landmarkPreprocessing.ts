export const PREPROCESSING_VERSION = 'landmark46-v1' as const;
export const TARGET_FRAMES = 60;
export const TOTAL_POINTS = 75;
export const SELECTED_INDICES = [11, 12, 13, 14, ...Array.from({ length: 42 }, (_, index) => index + 33)];

export interface RawPoseFrame {
  keypoints: number[][];
  confidence: number[];
}

export interface QualityResult {
  status: 'approved' | 'needs_review' | 'rejected';
  reason: string;
  shoulderFrameRatio: number;
  handFrameRatio: number;
  motionScore: number;
}

export interface LandmarkPredictionInput {
  preprocessingVersion: typeof PREPROCESSING_VERSION;
  landmarks: number[][][];
  mask: number[][];
}

const finite = (value: number) => Number.isFinite(value);

function validFrame(frame: RawPoseFrame): boolean {
  return frame.keypoints.length === TOTAL_POINTS && frame.confidence.length === TOTAL_POINTS &&
    frame.keypoints.every(point => point.length === 2 && point.every(finite)) && frame.confidence.every(finite);
}

function normalizedSelectedFrames(frames: RawPoseFrame[], minimumConfidence: number) {
  const selected = frames.map(frame => SELECTED_INDICES.map(index => [...frame.keypoints[index]]));
  const selectedConfidence = frames.map(frame => SELECTED_INDICES.map(index => frame.confidence[index]));
  const masks = selectedConfidence.map(frame => frame.map(value => value >= minimumConfidence ? 1 : 0));
  const centers = selected.map(frame => [(frame[0][0] + frame[1][0]) / 2, (frame[0][1] + frame[1][1]) / 2]);
  const scales = selected.map(frame => Math.hypot(frame[0][0] - frame[1][0], frame[0][1] - frame[1][1]));
  const validTransforms = masks.map((mask, index) => Boolean(mask[0] && mask[1] && finite(scales[index]) && scales[index] > 1e-6));
  if (!validTransforms.some(Boolean)) throw new Error('İki omuzun birlikte göründüğü kare bulunamadı.');
  const fallbackCenter = [
    median(centers.filter((_, index) => validTransforms[index]).map(value => value[0])),
    median(centers.filter((_, index) => validTransforms[index]).map(value => value[1])),
  ];
  const fallbackScale = median(scales.filter((_, index) => validTransforms[index]));
  const normalized = selected.map((frame, frameIndex) => {
    const center = validTransforms[frameIndex] ? centers[frameIndex] : fallbackCenter;
    const scale = validTransforms[frameIndex] ? scales[frameIndex] : fallbackScale;
    return frame.map((point, pointIndex) => masks[frameIndex][pointIndex]
      ? [(point[0] - center[0]) / scale, (point[1] - center[1]) / scale]
      : [0, 0]);
  });
  return { normalized, selectedConfidence, masks };
}

export function calculateMotionScore(frames: RawPoseFrame[], minimumConfidence = 0.1): number {
  if (!frames.length || !frames.every(validFrame)) return 0;
  let normalized: number[][][];
  let masks: number[][];
  try {
    const selected = normalizedSelectedFrames(frames, minimumConfidence);
    normalized = selected.normalized;
    masks = selected.masks;
  } catch {
    return 0;
  }

  const handMedianPath = (start: number, end: number) => {
    const paths: number[] = [];
    for (let point = start; point < end; point += 1) {
      let path = 0;
      let segments = 0;
      for (let frame = 1; frame < normalized.length; frame += 1) {
        if (!masks[frame - 1][point] || !masks[frame][point]) continue;
        path += Math.hypot(
          normalized[frame][point][0] - normalized[frame - 1][point][0],
          normalized[frame][point][1] - normalized[frame - 1][point][1],
        );
        segments += 1;
      }
      if (segments) paths.push(path);
    }
    return paths.length ? median(paths) : 0;
  };
  return Math.max(handMedianPath(4, 25), handMedianPath(25, 46));
}

export function assessPoseQuality(
  frames: RawPoseFrame[],
  minimumConfidence = 0.1,
  minimumFrames = 8,
  minimumShoulderRatio = 0.6,
  minimumHandRatio = 0.5,
  minimumMotionScore = 0.12,
): QualityResult {
  if (frames.length < minimumFrames) return { status: 'rejected', reason: 'too_few_frames', shoulderFrameRatio: 0, handFrameRatio: 0, motionScore: 0 };
  if (!frames.every(validFrame)) return { status: 'rejected', reason: 'invalid_or_non_finite_frame', shoulderFrameRatio: 0, handFrameRatio: 0, motionScore: 0 };

  let shoulders = 0;
  let hands = 0;
  for (const frame of frames) {
    if (frame.confidence[11] >= minimumConfidence && frame.confidence[12] >= minimumConfidence) shoulders += 1;
    const left = frame.confidence.slice(33, 54).some(value => value >= minimumConfidence);
    const right = frame.confidence.slice(54, 75).some(value => value >= minimumConfidence);
    if (left || right) hands += 1;
  }
  const shoulderFrameRatio = shoulders / frames.length;
  const handFrameRatio = hands / frames.length;
  const motionScore = calculateMotionScore(frames, minimumConfidence);
  const reasons: string[] = [];
  if (shoulderFrameRatio < minimumShoulderRatio) reasons.push('low_shoulder_visibility');
  if (handFrameRatio < minimumHandRatio) reasons.push('low_hand_visibility');
  if (shoulderFrameRatio >= minimumShoulderRatio && handFrameRatio >= minimumHandRatio && motionScore < minimumMotionScore) reasons.push('insufficient_motion');
  return reasons.length
    ? { status: 'needs_review', reason: reasons.join('+'), shoulderFrameRatio, handFrameRatio, motionScore }
    : { status: 'approved', reason: 'ok', shoulderFrameRatio, handFrameRatio, motionScore };
}

export const RECORDING_FPS = 10;
export const MAX_GAP_FRAMES = 5;
const TRIM_MARGIN_SECONDS = 0.1;
const HAND_BLOCKS: Array<[number, number]> = [[33, 54], [54, 75]];
const POSE_POINTS = [11, 12, 13, 14];

function shortGaps(visible: boolean[], maxGap: number): Array<[number, number]> {
  const gaps: Array<[number, number]> = [];
  let index = 0;
  while (index < visible.length) {
    if (visible[index]) { index += 1; continue; }
    const start = index;
    while (index < visible.length && !visible[index]) index += 1;
    if (start > 0 && index < visible.length && index - start <= maxGap) gaps.push([start, index]);
  }
  return gaps;
}

const handVisible = (frame: RawPoseFrame, [start, end]: [number, number], minimum: number) =>
  frame.confidence.slice(start, end).some(value => value >= minimum);

/**
 * Kayıttaki kareleri eğitim verisiyle aynı biçime getirir (Python `trim_recording` ile aynı):
 * kısa el/omuz kayıplarını doğrusal doldurur, ellerin hiç görünmediği baş ve son kareleri
 * yaklaşık 0,1 sn pay bırakarak atar. Hasta kaydı başlatıp elini kadraja getirene kadar geçen
 * süre ve işaret bittikten sonraki bekleme böylece tahmini ve kalite kapısını bozmaz.
 */
export function prepareRecordedFrames(
  frames: RawPoseFrame[],
  fps = RECORDING_FPS,
  minimumFrames = 8,
  minimumConfidence = 0.1,
): RawPoseFrame[] {
  if (!frames.length || !frames.every(validFrame)) return frames;
  const out = frames.map(frame => ({ keypoints: frame.keypoints.map(point => [...point]), confidence: [...frame.confidence] }));
  for (const block of HAND_BLOCKS) {
    const visible = out.map(frame => handVisible(frame, block, minimumConfidence));
    for (const [start, end] of shortGaps(visible, MAX_GAP_FRAMES)) {
      const before = out[start - 1]; const after = out[end];
      for (let frame = start; frame < end; frame += 1) {
        const weight = (frame - start + 1) / (end - start + 1);
        for (let point = block[0]; point < block[1]; point += 1) {
          out[frame].keypoints[point] = before.keypoints[point].map((value, axis) => value + (after.keypoints[point][axis] - value) * weight);
          out[frame].confidence[point] = Math.min(before.confidence[point], after.confidence[point]);
        }
      }
    }
  }
  for (const point of POSE_POINTS) {
    const visible = out.map(frame => frame.confidence[point] >= minimumConfidence);
    for (const [start, end] of shortGaps(visible, MAX_GAP_FRAMES)) {
      const before = out[start - 1]; const after = out[end];
      for (let frame = start; frame < end; frame += 1) {
        const weight = (frame - start + 1) / (end - start + 1);
        out[frame].keypoints[point] = before.keypoints[point].map((value, axis) => value + (after.keypoints[point][axis] - value) * weight);
        out[frame].confidence[point] = Math.min(before.confidence[point], after.confidence[point]);
      }
    }
  }
  const visible = out.map(frame => HAND_BLOCKS.some(block => handVisible(frame, block, minimumConfidence)));
  const first = visible.indexOf(true);
  if (first < 0) return out;
  const last = visible.lastIndexOf(true);
  const margin = Math.max(1, Math.round(TRIM_MARGIN_SECONDS * fps));
  const start = Math.max(0, first - margin);
  const end = Math.min(out.length, last + 1 + margin);
  return end - start < minimumFrames ? out : out.slice(start, end);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function linearSample(values: number[][][], targetLength: number): number[][][] {
  if (values.length === targetLength) return values.map(frame => frame.map(point => [...point]));
  return Array.from({ length: targetLength }, (_, targetIndex) => {
    const position = targetIndex * (values.length - 1) / (targetLength - 1);
    const left = Math.floor(position);
    const right = Math.min(left + 1, values.length - 1);
    const weight = position - left;
    return values[left].map((point, pointIndex) => point.map((value, axis) =>
      value + (values[right][pointIndex][axis] - value) * weight));
  });
}

function nearestSample(values: number[][], targetLength: number): number[][] {
  if (values.length === targetLength) return values.map(frame => [...frame]);
  return Array.from({ length: targetLength }, (_, targetIndex) => {
    const source = Math.round(targetIndex * (values.length - 1) / (targetLength - 1));
    return [...values[source]];
  });
}

export function preprocessPoseSequence(
  frames: RawPoseFrame[],
  targetLength = TARGET_FRAMES,
  minimumConfidence = 0.1,
): LandmarkPredictionInput {
  if (!frames.length || !frames.every(validFrame)) throw new Error('Geçersiz landmark dizisi.');
  const { normalized, masks } = normalizedSelectedFrames(frames, minimumConfidence);

  const landmarks = linearSample(normalized, targetLength);
  const mask = nearestSample(masks, targetLength);
  landmarks.forEach((frame, frameIndex) => frame.forEach((point, pointIndex) => {
    if (!mask[frameIndex][pointIndex]) point.splice(0, 2, 0, 0);
  }));
  return { preprocessingVersion: PREPROCESSING_VERSION, landmarks, mask };
}
