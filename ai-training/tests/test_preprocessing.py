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


def test_translation_and_proportional_scale_invariance():
    keypoints, confidence = _visible_sequence()
    original = preprocess_pose_sequence(keypoints, confidence)
    transformed = preprocess_pose_sequence(keypoints * 3.25 + np.array([7.0, -4.0]), confidence)
    np.testing.assert_allclose(original["landmarks"], transformed["landmarks"], atol=1e-5)
    np.testing.assert_array_equal(original["mask"], transformed["mask"])


def test_left_and_right_hands_are_not_swapped():
    keypoints, confidence = _visible_sequence()
    keypoints[:, 33:54, 0] = -3.0
    keypoints[:, 54:75, 0] = 5.0
    processed = preprocess_pose_sequence(keypoints, confidence)
    assert processed["landmarks"][:, 4:25, 0].mean() < processed["landmarks"][:, 25:46, 0].mean()


def test_missing_points_are_zero_and_masked():
    keypoints, confidence = _visible_sequence()
    confidence[:, 33] = 0.0
    keypoints[:, 33] = (999.0, 999.0)
    processed = preprocess_pose_sequence(keypoints, confidence)
    assert not processed["mask"][:, 4].any()
    assert not processed["landmarks"][:, 4].any()


def test_resampling_is_deterministic():
    keypoints, confidence = _visible_sequence(frames=19)
    first = preprocess_pose_sequence(keypoints, confidence)
    second = preprocess_pose_sequence(keypoints, confidence)
    np.testing.assert_array_equal(first["landmarks"], second["landmarks"])
    np.testing.assert_array_equal(first["mask"], second["mask"])


def test_non_finite_and_missing_shoulders_are_rejected():
    keypoints, confidence = _visible_sequence()
    keypoints[0, 0, 0] = np.nan
    assert assess_quality(keypoints, confidence).reason == "non_finite_value"
    keypoints, confidence = _visible_sequence()
    confidence[:, 11:13] = 0
    assert assess_quality(keypoints, confidence).reason == "low_shoulder_visibility"
    with np.testing.assert_raises(ValueError):
        preprocess_pose_sequence(keypoints, confidence)


def test_static_hands_and_camera_jitter_are_rejected_by_motion_gate():
    keypoints, confidence = _visible_sequence()
    keypoints[:, 33:75, 0] = -0.25
    static = assess_quality(keypoints, confidence, minimum_motion_score=0.12)
    assert static.reason == "insufficient_motion"
    assert static.motion_score == 0.0

    offsets = np.where(np.arange(len(keypoints)) % 2, 0.002, -0.002).astype(np.float32)
    jittered = keypoints + offsets[:, None, None]
    jitter = assess_quality(jittered, confidence, minimum_motion_score=0.12)
    assert jitter.reason == "insufficient_motion"


def test_one_and_two_hand_motion_passes_motion_gate():
    keypoints, confidence = _visible_sequence()
    assert assess_quality(keypoints, confidence, minimum_motion_score=0.12).status == "approved"
    confidence[:, 54:75] = 0.0
    assert assess_quality(keypoints, confidence, minimum_motion_score=0.12).status == "approved"
