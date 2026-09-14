from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

from src.common import preprocessing_config
from src.data.preprocessing import assess_quality, preprocess_pose_sequence


def extract_frames(frames) -> tuple[np.ndarray, np.ndarray]:
    try:
        import cv2
        import mediapipe as mp
    except ImportError as exc:
        raise RuntimeError("OpenCV ve MediaPipe kurulmalıdır: pip install -r requirements.txt") from exc

    keypoint_frames: list[np.ndarray] = []
    confidence_frames: list[np.ndarray] = []

    with mp.solutions.holistic.Holistic(
        static_image_mode=False,
        model_complexity=1,
        smooth_landmarks=True,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    ) as holistic:
        for frame in frames:
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            result = holistic.process(rgb)
            points = np.zeros((75, 2), dtype=np.float32)
            confidence = np.zeros((75,), dtype=np.float32)

            if result.pose_landmarks:
                for index, landmark in enumerate(result.pose_landmarks.landmark[:33]):
                    points[index] = (landmark.x, landmark.y)
                    confidence[index] = max(0.0, min(1.0, float(landmark.visibility)))
            if result.left_hand_landmarks:
                for index, landmark in enumerate(result.left_hand_landmarks.landmark):
                    points[33 + index] = (landmark.x, landmark.y)
                    confidence[33 + index] = 1.0
            if result.right_hand_landmarks:
                for index, landmark in enumerate(result.right_hand_landmarks.landmark):
                    points[54 + index] = (landmark.x, landmark.y)
                    confidence[54 + index] = 1.0

            keypoint_frames.append(points)
            confidence_frames.append(confidence)

    if not keypoint_frames:
        raise ValueError("Okunabilir kare bulunamadı.")
    return np.stack(keypoint_frames), np.stack(confidence_frames)


def extract_raw_pose(video_path: Path) -> tuple[np.ndarray, np.ndarray, float]:
    import cv2

    capture = cv2.VideoCapture(str(video_path))
    try:
        if not capture.isOpened():
            raise ValueError(f"Video açılamadı: {video_path}")
        fps = float(capture.get(cv2.CAP_PROP_FPS) or 25.0)
        def frames():
            while True:
                ok, frame = capture.read()
                if not ok:
                    break
                yield frame
        points, confidences = extract_frames(frames())
        return points, confidences, fps
    finally:
        capture.release()


def extract_video(video_path: Path) -> tuple[dict[str, np.ndarray | int], dict[str, object]]:
    config = preprocessing_config()
    keypoints, confidences, fps = extract_raw_pose(video_path)
    quality = assess_quality(
        keypoints,
        confidences,
        minimum_confidence=config["minimumConfidence"],
        minimum_frames=config["minimumSequenceFrames"],
        minimum_shoulder_ratio=config["minimumShoulderFrameRatio"],
        minimum_hand_ratio=config["minimumHandFrameRatio"],
    )
    if quality.status == "rejected":
        raise ValueError(f"Video reddedildi: {quality.reason}")
    processed = preprocess_pose_sequence(
        keypoints,
        confidences,
        target_length=config["sequenceLength"],
        minimum_confidence=config["minimumConfidence"],
    )
    metadata: dict[str, object] = {
        "qualityStatus": quality.status,
        "qualityReason": quality.reason,
        "shoulderFrameRatio": quality.shoulder_frame_ratio,
        "handFrameRatio": quality.hand_frame_ratio,
        "sourceFps": fps,
        "sourceFrames": len(keypoints),
        "preprocessingVersion": config["preprocessingVersion"],
    }
    return processed, metadata


def save_processed_video(video_path: Path, output_path: Path, class_id: str = "unknown") -> dict[str, object]:
    processed, metadata = extract_video(video_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        output_path,
        **processed,
        class_id=np.asarray(class_id),
        sample_id=np.asarray(video_path.stem),
        preprocessing_version=np.asarray(metadata["preprocessingVersion"]),
    )
    return metadata


def main() -> None:
    parser = argparse.ArgumentParser(description="Bir videodan SignBridge landmark NPZ dosyası üretir.")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--class-id", default="unknown")
    args = parser.parse_args()
    metadata = save_processed_video(Path(args.input), Path(args.output), args.class_id)
    print(json.dumps(metadata, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
