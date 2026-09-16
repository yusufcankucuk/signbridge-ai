import json
import runpy
import sys
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient

from src.common import autsl_labels, model_labels
from src.decision_policy import decide, default_policy, validate_policy
from src.evaluate_release import calibration_metrics, candidate_table, select_candidate, threshold_decision, threshold_table
from src.model.predict import predict_landmarks, validate_bundle
from src.package_release import build_package, contained
from src.service import app, state, PredictionRequest, predict
from src.summarize_camera import merge_trials
from src.benchmark_latency import distribution
from src.validate_video import evaluate_raw, finalize_performance_verification, trial_matrix
from src.calibrate_motion import select_motion_threshold


RUNTIME = dict(modelVersion="autsl20-bigru-v0.1.0", preprocessingVersion="landmark46-v1",
               vocabularyVersion="autsl20-v1", confidenceThreshold=.8)
UNIFIED_RUNTIME = dict(modelVersion="signbridge-unified30-bigru-v0.2.0", preprocessingVersion="landmark46-v1",
                       vocabularyVersion="signbridge30-v1", confidenceThreshold=.95)


class FixedModel:
    input_shape = (None, 60, 138)
    output_shape = (None, 20)
    def __init__(self, confidence=.8):
        self.confidence = confidence
        self.calls = 0
    def predict(self, x, verbose=0):
        self.calls += 1
        p = np.full((len(x), 20), (1-self.confidence)/19, dtype=np.float64)
        p[:, 0] = self.confidence
        return p


class VectorModel:
    input_shape = (None, 60, 138)
    output_shape = (None, 30)

    def __init__(self, probabilities):
        self.probabilities = np.asarray(probabilities, dtype=np.float64)

    def predict(self, x, verbose=0):
        return np.repeat(self.probabilities[None, :], len(x), axis=0)


@pytest.fixture
def payload():
    return dict(preprocessingVersion="landmark46-v1", landmarks=np.zeros((60,46,2)).tolist(),
                mask=np.ones((60,46), dtype=int).tolist(), sessionId="synthetic-contract-test")


@pytest.fixture
def client():
    # No lifespan: explicitly synthetic model to isolate validation from TF/files.
    state.update(model=FixedModel(), runtime=RUNTIME.copy(), labels=autsl_labels())
    yield TestClient(app)
    state.clear()


@pytest.mark.parametrize("bad", [-1, 2, 256, 257, .5, 1.0, "1", True])
def test_invalid_mask_before_cast(client, payload, bad):
    payload["mask"][0][0] = bad
    assert client.post("/predict", json=payload).status_code == 422
    assert state["model"].calls == 0


def test_empty_mask(client, payload):
    payload["mask"] = np.zeros((60,46), dtype=int).tolist()
    assert client.post("/predict", json=payload).status_code == 422


@pytest.mark.parametrize("field", ["mask", "landmarks"])
def test_wrong_shape(client, payload, field):
    payload[field].pop()
    assert client.post("/predict", json=payload).status_code == 422


def test_version(client, payload):
    payload["preprocessingVersion"] = "wrong"
    assert client.post("/predict", json=payload).status_code == 409


def test_nan(client, payload):
    from fastapi import HTTPException
    payload["landmarks"][0][0][0] = float("nan")
    with pytest.raises(HTTPException) as e:
        predict(PredictionRequest(**payload))
    assert e.value.status_code == 422


@pytest.mark.parametrize("score,low", [(.799999, True), (.8, False), (.800001, False)])
def test_threshold_boundary(client, payload, score, low):
    state["model"] = FixedModel(score)
    response = client.post("/predict", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["isLowConfidence"] is low
    assert body["classId"] == (None if low else "doktor")
    assert body["rejectionReason"] == ("low_score" if low else None)
    assert body["requiresConfirmation"] is (not low)
    assert body["decisionPolicyVersion"] == "score-threshold-v1"


def test_margin_policy_rejects_ambiguous_prediction():
    policy = {
        **default_policy(RUNTIME),
        "decisionPolicyVersion": "test-margin-v1",
        "method": "score_and_margin",
        "confidenceThreshold": 0.4,
        "marginThreshold": 0.1,
    }
    result = decide(np.array([0.45, 0.40, *([0.15 / 18] * 18)]), policy)
    assert result.accepted is False
    assert result.rejection_reason == "ambiguous_prediction"


def test_policy_must_match_bundle():
    policy = default_policy(RUNTIME)
    validate_policy(policy, RUNTIME)
    with pytest.raises(ValueError):
        validate_policy({**policy, "modelVersion": "wrong"}, RUNTIME)
    with pytest.raises(ValueError):
        validate_policy({**policy, "method": "score_only", "marginThreshold": .2}, RUNTIME)
    with pytest.raises(ValueError):
        validate_policy({**policy, "enabled": "false"}, RUNTIME)
    with pytest.raises(ValueError):
        validate_policy({**policy, "allowedClassIds": ["doktor", "doktor"]}, RUNTIME)


def test_disabled_policy_and_class_allowlist_reject_safely():
    landmarks = np.zeros((60, 46, 2), dtype=np.float32)
    mask = np.ones((60, 46), dtype=np.uint8)
    disabled = {**default_policy(RUNTIME), "enabled": False, "decisionPolicyVersion": "manual-only-v1"}
    result = predict_landmarks(FixedModel(.99), landmarks, mask, RUNTIME, decision_policy=disabled)
    assert result["classId"] is None
    assert result["rejectionReason"] == "policy_disabled"
    assert result["requiresConfirmation"] is False

    unsupported = {
        **default_policy(RUNTIME),
        "allowedClassIds": ["hasta", "evet", "hayir", "ilac"],
        "decisionPolicyVersion": "allowlist-v1",
    }
    result = predict_landmarks(FixedModel(.99), landmarks, mask, RUNTIME, decision_policy=unsupported)
    assert result["classId"] is None
    assert result["rejectionReason"] == "unsupported_class"


def test_manual_only_service_starts_without_model(monkeypatch, tmp_path, payload):
    from src.common import CONFIG_DIR

    monkeypatch.setenv("MODEL_PATH", str(tmp_path / "missing-model"))
    monkeypatch.setenv("RUNTIME_CONFIG_PATH", str(tmp_path / "missing-runtime.json"))
    monkeypatch.setenv("ALLOW_MANUAL_ONLY", "true")
    monkeypatch.setenv("DECISION_POLICY_PATH", str(CONFIG_DIR / "decision_policy.json"))
    with TestClient(app) as manual_client:
        health_response = manual_client.get("/health")
        assert health_response.status_code == 200
        assert health_response.json()["mode"] == "manual_only"
        assert health_response.json()["modelLoaded"] is False
        prediction = manual_client.post("/predict", json=payload)
        assert prediction.status_code == 200
        assert prediction.json()["rejectionReason"] == "policy_disabled"


def test_explicit_missing_policy_fails_before_creating_package(tmp_path):
    model_dir = tmp_path / "model"
    model_dir.mkdir()
    (model_dir / "runtime_config.json").write_text(json.dumps(RUNTIME), encoding="utf-8")
    destination = tmp_path / "release"
    with pytest.raises(ValueError, match="bulunamadı"):
        build_package(tmp_path, model_dir, destination, policy_path=tmp_path / "missing.json")
    assert not destination.exists()


def test_missing_evidence_fails_before_creating_package(tmp_path):
    model_dir = tmp_path / "model"
    model_dir.mkdir()
    (model_dir / "runtime_config.json").write_text(json.dumps(RUNTIME), encoding="utf-8")
    destination = tmp_path / "release"
    with pytest.raises(ValueError, match="Evidence file does not exist"):
        build_package(tmp_path, model_dir, destination, evidence_files=[tmp_path / "missing.json"])
    assert not destination.exists()


def test_bundle_validation():
    labels = autsl_labels()
    validate_bundle(FixedModel(), RUNTIME, labels)
    with pytest.raises(ValueError):
        validate_bundle(FixedModel(), RUNTIME, labels[::-1])
    with pytest.raises(ValueError):
        validate_bundle(FixedModel(), RUNTIME, labels[:19])
    swapped = [dict(x) for x in labels]
    swapped[0]["classId"], swapped[1]["classId"] = swapped[1]["classId"], swapped[0]["classId"]
    with pytest.raises(ValueError):
        validate_bundle(FixedModel(), RUNTIME, swapped)

    unified_labels = model_labels("signbridge30-v1")
    probabilities = np.full(30, 1 / 30)
    validate_bundle(VectorModel(probabilities), UNIFIED_RUNTIME, unified_labels)


def test_symptom_context_maps_seker_to_diabetes_and_forces_experimental_candidate():
    probabilities = np.full(30, 0.001, dtype=np.float64)
    probabilities[0] = 0.50
    probabilities[14] = 0.30
    probabilities[20:] = (1.0 - probabilities[:20].sum()) / 10
    policy = {
        **default_policy(UNIFIED_RUNTIME),
        "decisionPolicyVersion": "signbridge30-team-camera-v1",
        "experimental": True,
    }
    landmarks = np.zeros((60, 46, 2), dtype=np.float32)
    mask = np.ones((60, 46), dtype=np.uint8)
    result = predict_landmarks(
        VectorModel(probabilities), landmarks, mask, UNIFIED_RUNTIME,
        labels=model_labels("signbridge30-v1"), decision_policy=policy,
        recognition_context="symptom",
    )
    assert result["classId"] == "seker"
    assert result["expressionId"] == "diabetes"
    assert result["displayText"] == "Şeker hastasıyım"
    assert result["isLowConfidence"] is True
    assert result["forcedCandidate"] is True
    assert result["requiresConfirmation"] is True
    assert result["recognitionContext"] == "symptom"


def test_general_context_keeps_original_seker_display_and_excludes_symptom_classes():
    probabilities = np.full(30, 0.001, dtype=np.float64)
    probabilities[14] = 0.96
    probabilities[20] = 0.01
    probabilities /= probabilities.sum()
    landmarks = np.zeros((60, 46, 2), dtype=np.float32)
    mask = np.ones((60, 46), dtype=np.uint8)
    result = predict_landmarks(
        VectorModel(probabilities), landmarks, mask, UNIFIED_RUNTIME,
        labels=model_labels("signbridge30-v1"), recognition_context="general",
    )
    assert result["classId"] == "seker"
    assert result["expressionId"] == "seker"
    assert result["displayText"] == "Şeker"


def test_threshold_selection():
    p = np.array([[.8,.2],[.75,.25],[.2,.8],[.7,.3]])
    table = threshold_table(p, np.array([0,0,1,1]))
    assert table[2]["accepted"] == 2
    assert table[2]["wrong_accepted"] == 0
    assert threshold_decision(table)["recommended_threshold"] == .75
    assert threshold_decision([dict(accepted_accuracy=None,coverage=0,threshold=.8)])["target_met"] is False


def test_candidate_selection_prioritizes_ood_then_coverage():
    probabilities = np.array([[.9,.1],[.8,.2],[.1,.9],[.2,.8]])
    labels = np.array([0,0,1,1])
    ood = np.array([[.91,.09],[.55,.45]])
    rows = candidate_table(probabilities, labels, ood, thresholds=[.7,.9], margins=[0,.7])
    selected = select_candidate(rows, minimum_accuracy=.9, minimum_coverage=.5)
    assert selected is not None
    assert selected["ood_wrong_accept_rate"] == 0.5


def test_candidate_selection_requires_ood_measurement():
    rows = [{
        "method": "score_only",
        "confidence_threshold": .8,
        "margin_threshold": 0,
        "accepted_accuracy": .95,
        "coverage": .7,
        "ood_wrong_accept_rate": None,
    }]
    assert select_candidate(rows, minimum_accuracy=.9, minimum_coverage=.5) is None


def test_candidate_table_applies_demo_class_allowlist_to_validation_and_ood():
    probabilities = np.array([[.9, .05, .05], [.05, .9, .05]])
    labels = np.array([0, 1])
    ood = np.array([[.01, .01, .98]])
    rows = candidate_table(
        probabilities, labels, ood, thresholds=[.8], margins=[0], allowed_indices=[0, 1]
    )
    assert rows[0]["coverage"] == 1
    assert rows[0]["ood_wrong_accept_rate"] == 0


def test_calibration_metrics_are_finite():
    scores = np.array([[.8,.2],[.4,.6]])
    metrics, rows = calibration_metrics(scores, np.array([0,1]), bins=2)
    assert metrics["samples"] == 2
    assert np.isfinite(metrics["ece_10_bin"])
    assert np.isfinite(metrics["multiclass_brier_score"])
    assert sum(row["count"] for row in rows) == 2


def test_quality_gate_does_not_predict():
    model = FixedModel()
    for n, confidence in [(4,np.ones((4,75))), (20,np.zeros((20,75)))]:
        result = evaluate_raw(model, RUNTIME, np.zeros((n,75,2)), confidence)
        assert result["status"] == "quality_blocked"
    assert model.calls == 0


def test_matrix_pending():
    rows = trial_matrix()
    assert len(rows) == len({r["trial_id"] for r in rows}) == 50
    assert all(r["status"] == "pending" for r in rows)
    assert sum(r["evaluation_group"] == "development" for r in rows) == 25
    assert sum(r["evaluation_group"] == "holdout" for r in rows) == 25


def test_camera_trial_merge():
    trial_id = "development-p01-doktor-normal-1"
    result = merge_trials([dict(trial_id=trial_id, status="measured", confidence="0.91")])
    first = next(row for row in result if row["trial_id"] == trial_id)
    assert first["status"] == "measured"
    assert first["confidence"] == "0.91"
    assert sum(row["status"] == "pending" for row in result) == 49
    with pytest.raises(ValueError):
        merge_trials([dict(trial_id="not-in-matrix", status="measured")])
    with pytest.raises(ValueError):
        merge_trials([dict(trial_id=trial_id, status="measured")]*2)


def test_per_trial_verification_controls_correctness():
    row = {"expected_class": "doktor", "predicted_class": "doktor"}
    assert finalize_performance_verification(row.copy(), "yes")["correct"] is True
    assert finalize_performance_verification(row.copy(), "unknown")["correct"] == ""


def test_latency_distribution():
    result = distribution([1, 2, 3, 4])
    assert result["n"] == 4
    assert result["p50Ms"] == 2.5
    assert result["maxMs"] == 4


def test_motion_threshold_requires_both_release_gates():
    passing = select_motion_threshold([.5] * 9 + [.001], [0, .001, .002])
    assert passing["targetMet"] is True
    assert passing["staticRejectRate"] == 1
    assert passing["validPassRate"] == .9
    failing = select_motion_threshold([.001] * 9 + [.5], [.01])
    assert failing["targetMet"] is False
    assert failing["cameraAiAllowed"] is False


@pytest.mark.parametrize("path", ["../secret", "C:/secret", "/absolute"])
def test_manifest_path_containment(tmp_path, path):
    with pytest.raises(ValueError):
        contained(tmp_path, path)


def test_modelarts_portable_manifests(tmp_path, monkeypatch):
    from src.common import AI_ROOT
    (tmp_path / "data/manifests").mkdir(parents=True)
    calls = []
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(sys, "argv", ["train_start.py", "--data_url", "data", "--train_url", "new-output", "--smoke"])
    monkeypatch.setattr("subprocess.run", lambda command, **kwargs: calls.append(command))
    runpy.run_path(str(AI_ROOT / "modelarts/train_start.py"), run_name="__main__")
    command = calls[0]
    assert command[command.index("--data-root")+1] == str(tmp_path / "data")
    assert command[command.index("--manifest-dir")+1] == str(tmp_path / "data/manifests")
    assert "--smoke" in command


def test_modelarts_refuses_overwrite(tmp_path, monkeypatch):
    from src.common import AI_ROOT
    (tmp_path / "data/manifests").mkdir(parents=True)
    (tmp_path / "output").mkdir()
    (tmp_path / "output/existing.txt").write_text("keep")
    monkeypatch.setattr(sys, "argv", ["train_start.py", "--data_url", str(tmp_path / "data"), "--train_url", str(tmp_path / "output")])
    with pytest.raises(ValueError):
        runpy.run_path(str(AI_ROOT / "modelarts/train_start.py"), run_name="__main__")
    assert (tmp_path / "output/existing.txt").read_text() == "keep"


def test_video_capture_released_on_failure(monkeypatch):
    import cv2
    import src.extract_landmarks as extractor
    class Capture:
        released = False
        def isOpened(self): return True
        def get(self, _): return 25
        def release(self): self.released = True
    capture = Capture()
    monkeypatch.setattr(cv2, "VideoCapture", lambda _: capture)
    def fail(_): raise RuntimeError("synthetic detector failure")
    monkeypatch.setattr(extractor, "extract_frames", fail)
    with pytest.raises(RuntimeError):
        extractor.extract_raw_pose(Path("synthetic.mp4"))
    assert capture.released


def test_missing_hands_and_shoulders_are_distinct():
    from src.data.preprocessing import assess_quality
    points = np.zeros((20,75,2))
    confidence = np.ones((20,75))
    confidence[:,33:] = 0
    assert assess_quality(points, confidence).reason == "low_hand_visibility"
    confidence[:] = 1
    confidence[:,11:13] = 0
    assert assess_quality(points, confidence).reason == "low_shoulder_visibility"
