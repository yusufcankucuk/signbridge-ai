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

export function assessPoseQuality(
  frames: RawPoseFrame[],
  minimumConfidence = 0.1,
  minimumFrames = 8,
  minimumShoulderRatio = 0.6,
  minimumHandRatio = 0.5,
): QualityResult {
  if (frames.length < minimumFrames) return { status: 'rejected', reason: 'too_few_frames', shoulderFrameRatio: 0, handFrameRatio: 0 };
  if (!frames.every(validFrame)) return { status: 'rejected', reason: 'invalid_or_non_finite_frame', shoulderFrameRatio: 0, handFrameRatio: 0 };

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
  const reasons: string[] = [];
  if (shoulderFrameRatio < minimumShoulderRatio) reasons.push('low_shoulder_visibility');
  if (handFrameRatio < minimumHandRatio) reasons.push('low_hand_visibility');
  return reasons.length
    ? { status: 'needs_review', reason: reasons.join('+'), shoulderFrameRatio, handFrameRatio }
    : { status: 'approved', reason: 'ok', shoulderFrameRatio, handFrameRatio };
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

  const landmarks = linearSample(normalized, targetLength);
  const mask = nearestSample(masks, targetLength);
  landmarks.forEach((frame, frameIndex) => frame.forEach((point, pointIndex) => {
    if (!mask[frameIndex][pointIndex]) point.splice(0, 2, 0, 0);
  }));
  return { preprocessingVersion: PREPROCESSING_VERSION, landmarks, mask };
}
