import numpy as np

from src.data.preprocessing import assess_quality, preprocess_pose_sequence
from src.model.dataset import sequence_to_features


def _visible_sequence(frames: int = 24):
    keypoints = np.zeros((frames, 75, 2), dtype=np.float32)
    confidence = np.ones((frames, 75), dtype=np.float32)
    keypoints[:, 11] = (-1.0, 0.0)
    keypoints[:, 12] = (1.0, 0.0)
    for index in range(33, 75):
        keypoints[:, index, 0] = np.linspace(-0.5, 0.5, frames)
        keypoints[:, index, 1] = index / 100.0
    return keypoints, confidence


def test_preprocessing_produces_fixed_finite_features():
    keypoints, confidence = _visible_sequence()
    quality = assess_quality(keypoints, confidence)
    processed = preprocess_pose_sequence(keypoints, confidence)
    features = sequence_to_features(processed["landmarks"], processed["mask"])

    assert quality.status == "approved"
    assert processed["landmarks"].shape == (60, 46, 2)
    assert processed["mask"].shape == (60, 46)
    assert features.shape == (60, 138)
    assert np.isfinite(features).all()


def test_short_sequence_is_rejected():
    keypoints, confidence = _visible_sequence(frames=4)
    assert assess_quality(keypoints, confidence).status == "rejected"
