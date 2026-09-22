"""71 sınıflık yanıt sözlüğü ve soru bazlı tanıma bağlamı testleri."""
import numpy as np
import pytest

from src.common import CONFIG_DIR, label_config, model_labels
from src.decision_policy import load_policy
from src.model.predict import predict_landmarks

RUNTIME = dict(modelVersion="signbridge-unified71-bigru-v0.8.0", preprocessingVersion="landmark46-v1",
               vocabularyVersion="signbridge71-v1", confidenceThreshold=0.8)
POLICY = CONFIG_DIR / "decision_policy.unified71-team-camera.json"
LANDMARKS = np.zeros((60, 46, 2), dtype=np.float32)
MASK = np.ones((60, 46), dtype=np.uint8)


class VectorModel:
    input_shape = (None, 60, 138)
    output_shape = (None, 71)

    def __init__(self, probabilities):
        self.probabilities = np.asarray(probabilities, dtype=np.float64)

    def predict(self, x, verbose=0):
        return np.repeat(self.probabilities[None, :], len(x), axis=0)


def vector(winner: int, score: float) -> np.ndarray:
    probabilities = np.full(71, (1 - score) / 70)
    probabilities[winner] = score
    return probabilities


def index_of(class_id: str) -> int:
    return next(item["index"] for item in model_labels("signbridge71-v1") if item["classId"] == class_id)


def test_vocabulary_extends_signbridge34_without_reordering():
    old = label_config("signbridge34-v1")["labels"]
    new = label_config("signbridge71-v1")["labels"]
    assert len(new) == 71
    assert new[:34] == old
    assert len({item["classId"] for item in new}) == 71


def test_answer_contexts_only_use_known_classes():
    config = label_config("signbridge71-v1")
    known = {item["classId"] for item in config["labels"]}
    assert set(config["answerContexts"]) == {"duration", "intensity", "location", "medication"}
    for context, class_ids in config["answerContexts"].items():
        assert class_ids, context
        assert len(set(class_ids)) == len(class_ids), context
        assert set(class_ids) <= known, context
    # Süre sorusu yalnız sayılardan, ilaç sorusu yalnız onay/ret sınıflarından oluşur.
    assert all(item.startswith("sayi-") for item in config["answerContexts"]["duration"])
    assert config["answerContexts"]["medication"] == ["evet", "hayir", "ilac"]


def test_policy_allows_every_class_in_every_answer_context():
    config = label_config("signbridge71-v1")
    policy = load_policy(POLICY, RUNTIME)
    allowed = set(policy["allowedClassIds"])
    for class_ids in config["answerContexts"].values():
        assert set(class_ids) <= allowed


def test_duration_context_never_returns_a_body_part():
    labels = model_labels("signbridge71-v1")
    policy = load_policy(POLICY, RUNTIME)
    # En yüksek skor "karın" sınıfında; süre sorusunda aday olamaz.
    probabilities = vector(index_of("karin"), 0.9)
    probabilities[index_of("sayi-3")] = 0.05
    probabilities /= probabilities.sum()
    result = predict_landmarks(VectorModel(probabilities), LANDMARKS, MASK, RUNTIME, labels, policy, "duration")
    assert result["classId"] == "sayi-3"
    assert all(item.startswith("sayi-") for item in result["alternatives"])
    assert result["recognitionContext"] == "duration"


def test_location_context_returns_body_parts_and_accepts_high_scores():
    labels = model_labels("signbridge71-v1")
    policy = load_policy(POLICY, RUNTIME)
    result = predict_landmarks(VectorModel(vector(index_of("karin"), 0.99)), LANDMARKS, MASK,
                               RUNTIME, labels, policy, "location")
    assert result["classId"] == "karin" and result["displayText"] == "Karın"
    assert result["isLowConfidence"] is False and result["scoringMode"] == "softmax"


def test_unknown_context_is_rejected():
    labels = model_labels("signbridge71-v1")
    policy = load_policy(POLICY, RUNTIME)
    with pytest.raises(ValueError):
        predict_landmarks(VectorModel(vector(0, 0.9)), LANDMARKS, MASK, RUNTIME, labels, policy, "custom")
