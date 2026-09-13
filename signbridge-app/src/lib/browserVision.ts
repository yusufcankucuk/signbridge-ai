import type { HolisticLandmarker, HolisticLandmarkerResult, NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { RawPoseFrame } from './landmarkPreprocessing';

let landmarkerPromise: Promise<HolisticLandmarker> | null = null;

export async function getHolisticLandmarker(): Promise<HolisticLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = import('@mediapipe/tasks-vision').then(async ({ FilesetResolver, HolisticLandmarker }) => {
      const vision = await FilesetResolver.forVisionTasks('/mediapipe');
      return HolisticLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: '/models/holistic_landmarker.task' },
        runningMode: 'VIDEO',
        outputFaceBlendshapes: false,
        outputPoseSegmentationMasks: false,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minHandLandmarksConfidence: 0.5,
      });
    }).catch(error => {
      landmarkerPromise = null;
      throw error;
    });
  }
  return landmarkerPromise;
}

function copyPoint(point?: NormalizedLandmark): number[] {
  return point && Number.isFinite(point.x) && Number.isFinite(point.y) ? [point.x, point.y] : [0, 0];
}

export function resultToRawFrame(result: HolisticLandmarkerResult): RawPoseFrame {
  const pose = result.poseLandmarks[0] ?? [];
  const left = result.leftHandLandmarks[0] ?? [];
  const right = result.rightHandLandmarks[0] ?? [];
  const keypoints = Array.from({ length: 75 }, () => [0, 0]);
  const confidence = Array.from({ length: 75 }, () => 0);
  for (let index = 0; index < Math.min(33, pose.length); index += 1) {
    keypoints[index] = copyPoint(pose[index]);
    confidence[index] = Math.max(0, Math.min(1, pose[index].visibility ?? 1));
  }
  for (let index = 0; index < Math.min(21, left.length); index += 1) {
    keypoints[33 + index] = copyPoint(left[index]);
    confidence[33 + index] = 1;
  }
  for (let index = 0; index < Math.min(21, right.length); index += 1) {
    keypoints[54 + index] = copyPoint(right[index]);
    confidence[54 + index] = 1;
  }
  return { keypoints, confidence };
}
