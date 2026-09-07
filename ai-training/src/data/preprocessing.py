from __future__ import annotations

from dataclasses import dataclass

import numpy as np


SELECTED_INDICES = np.asarray([11, 12, 13, 14, *range(33, 75)], dtype=np.int64)


@dataclass(frozen=True)
class QualityResult:
    status: str
    reason: str
    shoulder_frame_ratio: float
    hand_frame_ratio: float


def assess_quality(
    keypoints: np.ndarray,
    confidences: np.ndarray,
    *,
    minimum_confidence: float = 0.1,
    minimum_frames: int = 8,
    minimum_shoulder_ratio: float = 0.6,
    minimum_hand_ratio: float = 0.5,
) -> QualityResult:
    if keypoints.ndim != 3 or keypoints.shape[1:] != (75, 2):
        return QualityResult("rejected", f"keypoints_shape={keypoints.shape}", 0.0, 0.0)
    if confidences.shape != keypoints.shape[:2]:
        return QualityResult("rejected", f"confidences_shape={confidences.shape}", 0.0, 0.0)
    if len(keypoints) < minimum_frames:
        return QualityResult("rejected", "too_few_frames", 0.0, 0.0)
    if not np.isfinite(keypoints).all() or not np.isfinite(confidences).all():
        return QualityResult("rejected", "non_finite_value", 0.0, 0.0)

    visible = confidences >= minimum_confidence
    shoulder_valid = visible[:, 11] & visible[:, 12]
    left_hand_valid = visible[:, 33:54].any(axis=1)
    right_hand_valid = visible[:, 54:75].any(axis=1)
    hand_valid = left_hand_valid | right_hand_valid
    shoulder_ratio = float(shoulder_valid.mean())
    hand_ratio = float(hand_valid.mean())

    reasons: list[str] = []
    if shoulder_ratio < minimum_shoulder_ratio:
        reasons.append("low_shoulder_visibility")
    if hand_ratio < minimum_hand_ratio:
        reasons.append("low_hand_visibility")
    if reasons:
        return QualityResult("needs_review", "+".join(reasons), shoulder_ratio, hand_ratio)
    return QualityResult("approved", "ok", shoulder_ratio, hand_ratio)


def normalize_selected_landmarks(
    keypoints: np.ndarray,
    confidences: np.ndarray,
    *,
    minimum_confidence: float = 0.1,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    selected = np.asarray(keypoints[:, SELECTED_INDICES, :], dtype=np.float32)
    selected_confidence = np.asarray(confidences[:, SELECTED_INDICES], dtype=np.float32)
    mask = selected_confidence >= minimum_confidence

    shoulders = selected[:, :2, :]
    shoulder_mask = mask[:, 0] & mask[:, 1]
    centers = shoulders.mean(axis=1)
    scales = np.linalg.norm(shoulders[:, 0, :] - shoulders[:, 1, :], axis=1)
    valid_transform = shoulder_mask & np.isfinite(scales) & (scales > 1e-6)
    if not valid_transform.any():
        raise ValueError("Hiçbir karede iki omuz birlikte bulunamadı.")

    fallback_center = np.median(centers[valid_transform], axis=0)
    fallback_scale = float(np.median(scales[valid_transform]))
    centers = np.where(valid_transform[:, None], centers, fallback_center)
    scales = np.where(valid_transform, scales, fallback_scale)

    normalized = (selected - centers[:, None, :]) / scales[:, None, None]
    normalized[~mask] = 0.0
    return normalized.astype(np.float32), selected_confidence, mask.astype(np.uint8)


def _linear_resample(values: np.ndarray, target_length: int) -> np.ndarray:
    source_length = len(values)
    if source_length == target_length:
        return values.copy()
    source_positions = np.linspace(0.0, 1.0, source_length)
    target_positions = np.linspace(0.0, 1.0, target_length)
    flattened = values.reshape(source_length, -1)
    result = np.empty((target_length, flattened.shape[1]), dtype=np.float32)
    for column in range(flattened.shape[1]):
        result[:, column] = np.interp(target_positions, source_positions, flattened[:, column])
    return result.reshape((target_length, *values.shape[1:]))


def _nearest_resample(values: np.ndarray, target_length: int) -> np.ndarray:
    source_indices = np.rint(np.linspace(0, len(values) - 1, target_length)).astype(int)
    return values[source_indices]


def preprocess_pose_sequence(
    keypoints: np.ndarray,
    confidences: np.ndarray,
    *,
    target_length: int = 60,
    minimum_confidence: float = 0.1,
) -> dict[str, np.ndarray | int]:
    normalized, selected_confidence, mask = normalize_selected_landmarks(
        keypoints, confidences, minimum_confidence=minimum_confidence
    )
    landmarks_60 = _linear_resample(normalized, target_length).astype(np.float32)
    confidence_60 = _linear_resample(selected_confidence, target_length).astype(np.float32)
    mask_60 = _nearest_resample(mask, target_length).astype(np.uint8)
    landmarks_60[mask_60 == 0] = 0.0
    return {
        "landmarks": landmarks_60,
        "confidence": confidence_60,
        "mask": mask_60,
        "original_length": int(len(keypoints)),
    }
