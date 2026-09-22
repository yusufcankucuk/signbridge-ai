"""Birleşik 30 sınıflı model: MEB hazırlığı, eğitim yardımcıları, servis ve deneme raporu testleri."""
import csv
import json

import numpy as np
import pytest
from fastapi.testclient import TestClient

from src.common import CONFIG_DIR, label_config, model_labels
from src.data.prepare_meb_health import (
    ENTRIES, LEFT_HAND, RIGHT_HAND, _short_gaps, active_hand, interpolate_short_gaps, trim_bounds,
)
from src.decision_policy import load_policy
from src.model.predict import predict_landmarks
from src.summarize_symptom_trials import summarize, write_report
from src.train_unified import OLD_CLASS_COUNT, _distillation_targets, context_predictions, regression_rows

UNIFIED_RUNTIME = dict(modelVersion="signbridge-unified30-bigru-v0.2.0", preprocessingVersion="landmark46-v1",
                       vocabularyVersion="signbridge30-v1", confidenceThreshold=.95)
POLICY = CONFIG_DIR / "decision_policy.unified30-team-camera.json"


class VectorModel:
    input_shape = (None, 60, 138)
    output_shape = (None, 30)

    def __init__(self, probabilities):
        self.probabilities = np.asarray(probabilities, dtype=np.float64)

    def predict(self, x, verbose=0):
        return np.repeat(self.probabilities[None, :], len(x), axis=0)


def _vector(winner: int, score: float) -> np.ndarray:
    probabilities = np.full(30, (1 - score) / 29)
    probabilities[winner] = score
    return probabilities


def test_meb_entries_cover_every_symptom_class_once():
    config = label_config("signbridge30-v1")
    assert sorted(entry.class_id for entry in ENTRIES) == sorted(config["symptomClassIds"])
    sugar = next(entry for entry in ENTRIES if entry.class_id == "seker")
    assert sugar.source == "seker-hastaligi"
    assert all(label["index"] == index for index, label in enumerate(config["labels"]))
    assert [label["classId"] for label in config["labels"][:20]] == [
        label["classId"] for label in label_config("autsl20-v1")["labels"]
    ]


def test_short_gap_interpolation_only_fills_up_to_five_frames():
    frames = 30
    keypoints = np.zeros((frames, 75, 2), dtype=np.float32)
    confidences = np.zeros((frames, 75), dtype=np.float32)
    keypoints[:, 54:75, 0] = np.linspace(0, 1, frames)[:, None]
    confidences[:, 54:75] = 1
    confidences[5:10, 54:75] = 0   # 5 karelik boşluk → doldurulur
    confidences[15:21, 54:75] = 0  # 6 karelik boşluk → korunur
    confidences[:, 11:13] = 1
    assert _short_gaps(np.array([1, 0, 0, 1, 0], bool), 5) == [(1, 3)]
    points, conf, filled = interpolate_short_gaps(keypoints, confidences)
    assert filled == 5
    assert (conf[5:10, 54:75] > 0).all()
    assert (conf[15:21, 54:75] == 0).all()
    np.testing.assert_allclose(points[7, 54, 0], keypoints[7, 54, 0], atol=1e-6)
    # Sol el hiç görünmediği için dokunulmaz.
    assert (conf[:, LEFT_HAND] == 0).all()


def test_trim_and_active_hand():
    frames = 40
    keypoints = np.zeros((frames, 75, 2), dtype=np.float32)
    confidences = np.zeros((frames, 75), dtype=np.float32)
    confidences[10:25, 33:54] = 1
    keypoints[10:25, 33:54, 1] = np.linspace(0, 0.5, 15)[:, None]
    confidences[10:25, 54:75] = 1  # sağ el görünür ama hareketsiz
    assert trim_bounds(confidences, minimum_frames=8) == (7, 28)
    assert trim_bounds(np.zeros((40, 75)), minimum_frames=8) == (0, 40)
    assert active_hand(keypoints, confidences) == "left"
    assert RIGHT_HAND.start == 54


def test_distillation_targets_and_context_helpers():
    teacher = np.full((2, OLD_CLASS_COUNT), 1 / OLD_CLASS_COUNT, dtype=np.float32)
    targets = _distillation_targets(teacher, np.array([3, 14]), 30)
    np.testing.assert_allclose(targets.sum(axis=1), 1.0, atol=1e-6)
    assert targets[:, OLD_CLASS_COUNT:].sum() == 0
    assert targets[0, 3] == pytest.approx(0.5 + 0.5 / OLD_CLASS_COUNT)
    probabilities = np.vstack([_vector(0, 0.9), _vector(21, 0.9)])
    symptom = [14, 20, 21]
    assert context_predictions(probabilities, symptom).tolist()[1] == 21
    labels = model_labels("signbridge30-v1")
    rows = regression_rows(labels, np.array([0, 0, 14]), np.vstack([_vector(0, .9)] * 3),
                           np.vstack([_vector(0, .9), _vector(20, .9), _vector(14, .9)]))
    assert rows[0]["teacherCorrect"] == 2 and rows[0]["studentCorrect"] == 1 and rows[0]["shiftedToNewClasses"] == 1
    assert rows[14]["delta"] == 1.0  # öğretmen yanlış, öğrenci doğru


def test_symptom_context_never_returns_general_only_class():
    labels = model_labels("signbridge30-v1")
    policy = load_policy(POLICY, UNIFIED_RUNTIME)
    landmarks = np.zeros((60, 46, 2), dtype=np.float32)
    mask = np.ones((60, 46), dtype=np.uint8)
    # En yüksek skor genel "doktor" sınıfında; belirti bağlamı onu aday gösteremez.
    probabilities = _vector(0, 0.90)
    probabilities[21] = 0.05
    probabilities /= probabilities.sum()
    result = predict_landmarks(VectorModel(probabilities), landmarks, mask, UNIFIED_RUNTIME, labels, policy, "symptom")
    assert result["classId"] == "fever"
    assert result["expressionId"] == "fever"
    assert result["forcedCandidate"] is True and result["requiresConfirmation"] is True
    assert "doktor" not in result["alternatives"]
    # Yüksek skorlu belirti kabul edilir; genel bağlamda aynı vektör belirti döndürmez.
    accepted = predict_landmarks(VectorModel(_vector(29, .99)), landmarks, mask, UNIFIED_RUNTIME, labels, policy, "symptom")
    assert accepted["isLowConfidence"] is False and accepted["classId"] == "burn" and accepted["forcedCandidate"] is False
    general = predict_landmarks(VectorModel(_vector(29, .99)), landmarks, mask, UNIFIED_RUNTIME, labels, policy, "general")
    assert general["classId"] is None and general["rejectionReason"] == "low_score"
    assert all(item not in general["alternatives"] for item in ("burn", "fever"))


def test_manual_only_with_unified_labels_file_still_starts(monkeypatch, tmp_path):
    from src.service import app

    monkeypatch.setenv("MODEL_PATH", str(tmp_path / "missing"))
    monkeypatch.setenv("RUNTIME_CONFIG_PATH", str(tmp_path / "missing.json"))
    monkeypatch.setenv("ALLOW_MANUAL_ONLY", "true")
    monkeypatch.setenv("LABELS_PATH", str(CONFIG_DIR / "labels.signbridge30.json"))
    monkeypatch.setenv("DECISION_POLICY_PATH", str(POLICY))
    with TestClient(app) as client:
        body = client.get("/health").json()
    assert body["mode"] == "manual_only"
    assert body["cameraAiEnabled"] is False
    assert body["preprocessingVersion"] == "landmark46-v1"


def _trial_row(expression, predicted, shown, correct, confirmed, outcome="accepted"):
    return {
        "trial_id": f"yunus-{expression}-1", "participant": "yunus", "expected_expression_id": expression,
        "expected_class_id": expression, "outcome": outcome, "predicted_class_id": predicted, "shown_avatar": shown,
        "confidence": "0.97" if predicted else "", "forced_candidate": "false", "latency_ms": "120",
        "model_version": "signbridge-unified30-bigru-v0.2.0", "correct": "true" if correct else "false",
        "user_confirmed": "" if confirmed is None else ("true" if confirmed else "false"),
    }


def test_trial_summary_levels(tmp_path):
    config = label_config("signbridge30-v1")
    rows = []
    for class_id in config["symptomClassIds"]:
        expression = next(l for l in config["labels"] if l["classId"] == class_id)["symptomExpressionId"]
        rows.append(_trial_row(expression, class_id, expression, True, True))
    rows.append(_trial_row("fever", "", "", False, None, outcome="quality_rejected"))
    summary = summarize(rows)
    assert summary["experimentalDemoPassed"] is True
    assert summary["technicalIntegrationPassed"] is True
    assert summary["sekerShownAsDiabetes"] == 1
    assert summary["qualityRejectedAttempts"] == 1
    # seker yanlış avatarla gösterilirse teknik entegrasyon başarısız olur; burn hiç tanınmazsa demo başarısız.
    rows[0] = _trial_row("diabetes", "seker", "fever", True, True)
    rows[-2] = _trial_row("burn", "fever", "fever", False, False)
    summary = summarize(rows)
    assert summary["technicalIntegrationPassed"] is False
    assert summary["failedClasses"] == ["burn"]
    report = tmp_path / "report.md"
    write_report(report, summary)
    assert "BAŞARISIZ" in report.read_text(encoding="utf-8")
    with (tmp_path / "rows.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    assert json.loads(json.dumps(summary))["completedTrials"] == 11


def test_augmentation_keeps_shape_and_mirrors_hands_consistently():
    tf = pytest.importorskip("tensorflow")
    from src.train_unified import augment_feature

    features = np.zeros((60, 138), dtype=np.float32)
    sequence = features.reshape(60, 46, 3)
    sequence[:, 25:, 0] = np.linspace(0.4, 0.8, 60)[:, None]  # sağ el pozitif x
    sequence[:, 25:, 2] = 1
    tf.random.set_seed(1)
    mirrored = plain = 0
    for _ in range(40):
        output, _target = augment_feature(tf.constant(features), tf.constant([1.0]))
        values = output.numpy().reshape(60, 46, 3)
        assert values.shape == (60, 46, 3)
        left, right = values[:, 4:25], values[:, 25:]
        if (left[..., 2] > 0).any():
            mirrored += 1
            assert (right[..., 2] == 0).all()           # ayna: el bloğu tamamen yer değiştirir
            assert (left[..., 0][left[..., 2] > 0] < 0).all()
        else:
            plain += 1
            assert (right[..., 0][right[..., 2] > 0] > 0).all()
    assert mirrored > 0 and plain > mirrored              # ~%30 ayna


def test_synthesis_moves_head_location_to_belly_and_keeps_labels(tmp_path):
    from src.data.synthesize_symptoms import synthesize

    def sample(path, class_id, index, avatar, signer, ys, x=-0.5):
        landmarks = np.zeros((60, 46, 2), dtype=np.float32)
        mask = np.zeros((60, 46), dtype=np.uint8)
        landmarks[:, 0] = (0.5, 0.0)
        landmarks[:, 1] = (-0.5, 0.0)
        mask[:, :4] = 1
        offsets = np.linspace(-0.05, 0.05, 21)[:, None]
        landmarks[:, 25:46, 0] = x + offsets[:, 0]
        landmarks[:, 25:46, 1] = np.asarray(ys, dtype=np.float32)[:, None] + offsets[:, 0]
        mask[:, 25:46] = 1
        target = tmp_path / path
        target.parent.mkdir(parents=True, exist_ok=True)
        np.savez(target, landmarks=landmarks, mask=mask, confidence=mask.astype(np.float32), original_length=60)
        return {"sample_id": target.stem, "class_id": class_id, "model_index": index, "source": "EXTERNAL",
                "signer_id": signer, "landmark_path": path, "quality_status": "approved",
                "training_status": "trainable", "avatar_id": avatar, "extractor": "mediapipe-tasks-web"}

    head = [0.0] * 10 + [-1.3] * 20 + [0.0] * 30
    belly = [0.0] * 10 + [1.2] * 20 + [0.0] * 30
    rows = [
        sample("p/h1.npz", "headache", 30, "headache", "ext_a", head),
        sample("p/s1.npz", "stomachache", 31, "stomachache", "ext_b", belly),
        sample("p/n1.npz", "shortness-of-breath", 33, "shortness-of-breath", "ext_c", [0.3] * 60),
        sample("p/q1.npz", "nausea", 32, "nausea", "ext_d", [1.1] * 60),
    ]
    manifest = tmp_path / "in.csv"
    with manifest.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    output = tmp_path / "syn.csv"
    summary = synthesize(tmp_path, [manifest], output, "signbridge34-v1", per_pair=1, seed=1)
    produced = list(csv.DictReader(output.open(encoding="utf-8-sig")))
    assert summary["perRecipe"]["stomachache:location"] == 1
    assert {row["avatar_id"] for row in produced} == {"stomachache", "nausea"}
    assert all(row["source"] == "SYNTHETIC" and row["signer_id"].startswith("syn_") for row in produced)
    location = next(row for row in produced if row["recipe"] == "location")
    assert location["derived_signer_id"] == "ext_a" and location["model_index"] == "31"
    data = np.load(tmp_path / location["landmark_path"])
    ys = data["landmarks"][:, 25:46, 1].mean(axis=1)
    assert ys[15:25].mean() > 0.6                     # baş hizası karın bölgesine taşındı
    assert abs(ys[45:].mean()) < 0.05                 # hareket (ağrı) kısmı korunur
    nausea = next(row for row in produced if row["avatar_id"] == "nausea")
    assert nausea["derived_signer_id"] != "ext_d"     # el biçimi başka kişiden


def test_pain_sign_is_relocated_to_head_and_belly(tmp_path):
    from src.data.synthesize_symptoms import synthesize

    def sample(path, class_id, index, signer, y):
        landmarks = np.zeros((60, 46, 2), dtype=np.float32)
        mask = np.zeros((60, 46), dtype=np.uint8)
        landmarks[:, 0] = (0.5, 0.0)
        landmarks[:, 1] = (-0.5, 0.0)
        mask[:, :4] = 1
        wiggle = 0.1 * np.sin(np.linspace(0, 6, 60))[:, None]
        landmarks[:, 25:46, 0] = -0.4 + wiggle + np.linspace(-0.05, 0.05, 21)
        landmarks[:, 25:46, 1] = y + np.linspace(-0.05, 0.05, 21)
        mask[:, 25:46] = 1
        target = tmp_path / path
        target.parent.mkdir(parents=True, exist_ok=True)
        np.savez(target, landmarks=landmarks, mask=mask, confidence=mask.astype(np.float32), original_length=60)
        return {"sample_id": target.stem, "class_id": class_id, "model_index": index, "source": "EXTERNAL",
                "signer_id": signer, "landmark_path": path, "quality_status": "approved",
                "training_status": "trainable", "avatar_id": class_id, "extractor": "mediapipe-tasks-web"}

    rows = [
        sample("p/pain.npz", "pain", 20, "ext_p", 0.3),
        sample("p/head.npz", "headache", 30, "ext_h", -0.9),
        sample("p/belly.npz", "stomachache", 31, "ext_s", 1.2),
    ]
    manifest = tmp_path / "in.csv"
    with manifest.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    output = tmp_path / "syn.csv"
    summary = synthesize(tmp_path, [manifest], output, "signbridge34-v1", per_pair=2, seed=3)
    assert summary["perRecipe"]["headache:relocate"] == 2
    assert summary["perRecipe"]["stomachache:relocate"] == 2
    produced = [row for row in csv.DictReader(output.open(encoding="utf-8-sig")) if row["recipe"] == "relocate"]
    original = np.load(tmp_path / "p/pain.npz")["landmarks"][:, 25:46]
    for row in produced:
        assert row["derived_signer_id"] == "ext_p"
        moved = np.load(tmp_path / row["landmark_path"])["landmarks"][:, 25:46]
        y = moved[..., 1].mean()
        assert (y < -0.6) if row["avatar_id"] == "headache" else (y > 0.9)
        # hareket ve el biçimi korunur (yalnız öteleme)
        assert np.allclose((moved - moved.mean(axis=(0, 1))), (original - original.mean(axis=(0, 1))), atol=1e-5)


def _synthetic_pose(frames=40, seed=0):
    rng = np.random.default_rng(seed)
    keypoints = np.zeros((frames, 75, 2), dtype=np.float32)
    confidences = np.zeros((frames, 75), dtype=np.float32)
    keypoints[:, 11] = (0.4, 0.5)
    keypoints[:, 12] = (0.6, 0.5)
    keypoints[:, 13] = (0.35, 0.65)
    keypoints[:, 14] = (0.65, 0.65)
    confidences[:, 11:15] = 1
    t = np.linspace(0, 1, 30)[:, None, None]
    keypoints[5:35, 54:75] = 0.5 + t * 0.2 + rng.normal(0, 0.002, (30, 21, 2))
    confidences[5:35, 54:75] = 1
    return keypoints, confidences


def test_prepare_adds_browser_views_and_verifies_source_hash(tmp_path, monkeypatch):
    import hashlib

    import src.extract_landmarks as extractor
    from src.data.prepare_meb_health import prepare

    meb = tmp_path / "meb"
    meb.mkdir()
    videos = []
    for entry in ENTRIES:
        video = meb / f"{entry.source}.mp4"
        video.write_bytes(entry.source.encode())
        keypoints, confidences = _synthetic_pose()
        videos.append({
            "source": entry.source, "file": video.name, "sha256": hashlib.sha256(video.read_bytes()).hexdigest(),
            "views": [{"view": "web-10fps-p0", "fps": 10, "phaseMs": 0,
                       "keypoints": keypoints.tolist(), "confidence": confidences.tolist()}],
        })
    browser = tmp_path / "browser.json"
    browser.write_text(json.dumps({"schemaVersion": "signbridge-browser-landmarks-v1",
                                   "extractor": "mediapipe-tasks-web", "videos": videos}), encoding="utf-8")
    monkeypatch.setattr(extractor, "extract_raw_pose", lambda path: (*_synthetic_pose(), 25.0))
    manifest = tmp_path / "manifests" / "meb_health11_training.csv"
    summary = prepare(tmp_path, meb, manifest, tmp_path / "overlays", "2026-09-04", browser_landmarks=browser)
    assert summary["total"] == 22 and summary["referenceVideos"] == 11
    assert summary["extractors"] == ["mediapipe-holistic-legacy", "mediapipe-tasks-web"]
    with manifest.open(encoding="utf-8-sig") as handle:
        rows = list(csv.DictReader(handle))
    assert {row["view"] for row in rows} == {"legacy-25fps", "web-10fps-p0"}
    assert all(row["trim_start"] == "2" and row["trim_end"] == "38" for row in rows)
    assert all(len(row["source_sha256"]) == 64 and row["source_url"].startswith("https://orgm.meb.gov.tr") for row in rows)
    sugar = [row for row in rows if row["class_id"] == "seker"]
    assert len(sugar) == 2 and all(row["model_index"] == "14" for row in sugar)

    videos[0]["sha256"] = "0" * 64
    browser.write_text(json.dumps({"schemaVersion": "signbridge-browser-landmarks-v1",
                                   "extractor": "mediapipe-tasks-web", "videos": videos}), encoding="utf-8")
    with pytest.raises(ValueError, match="farklı bir video"):
        prepare(tmp_path, meb, manifest, tmp_path / "overlays", "2026-09-04", browser_landmarks=browser)


def test_external_videos_import_maps_avatars_and_sources(tmp_path, monkeypatch):
    import hashlib

    import src.extract_landmarks as extractor
    from src.data.import_external_videos import discover_videos, import_videos

    external = tmp_path / "harici"
    for avatar, name in [("headache", "tidsozluk_1.mp4"), ("diabetes", "isaretdiliogren_1.MP4"), ("nausea", "tidsozluk_2.webm")]:
        (external / avatar).mkdir(parents=True)
        (external / avatar / name).write_bytes(f"{avatar}-{name}".encode())
    (external / "OKUBENI.txt").write_text("not", encoding="utf-8")
    monkeypatch.setattr(extractor, "extract_raw_pose", lambda path: (*_synthetic_pose(), 25.0))
    keypoints, confidences = _synthetic_pose()
    browser = tmp_path / "browser.json"
    browser.write_text(json.dumps({
        "schemaVersion": "signbridge-browser-landmarks-v1", "extractor": "mediapipe-tasks-web",
        "videos": [
            {"source": path.relative_to(external).with_suffix("").as_posix(),
             "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
             "views": [{"view": "web-10fps-p0", "fps": 10, "keypoints": keypoints.tolist(), "confidence": confidences.tolist()}]}
            for _, _, path in discover_videos(external)
        ],
    }), encoding="utf-8")
    manifest = tmp_path / "external.csv"
    summary = import_videos(tmp_path, external, manifest, "signbridge34-v1", browser)
    assert summary["videos"] == 3 and summary["views"] == 6
    assert summary["sources"] == ["ext_isaretdiliogren", "ext_tidsozluk"]
    assert "stomachache" in summary["avatarsWithoutVideo"]
    with manifest.open(encoding="utf-8-sig") as handle:
        rows = list(csv.DictReader(handle))
    by_avatar = {row["avatar_id"]: row for row in rows}
    assert by_avatar["diabetes"]["class_id"] == "seker" and by_avatar["diabetes"]["model_index"] == "14"
    assert by_avatar["headache"]["model_index"] == "30"
    assert by_avatar["nausea"]["model_index"] == "32"
    assert {row["consent_id"] for row in rows} == {"user_reported_permission"}

    with pytest.raises(ValueError, match="karşılığı olmayan"):
        import_videos(tmp_path, external, manifest, "signbridge30-v1")
    (external / "headache" / "bozukad.mp4").write_bytes(b"x")
    with pytest.raises(ValueError, match="<kaynak>_<sıra>"):
        discover_videos(external)


def test_unified34_vocabulary_extends_unified30():
    from src.train_unified import VARIANTS, select_variant

    unified30 = label_config("signbridge30-v1")
    unified34 = label_config("signbridge34-v1")
    assert unified34["labels"][:30] == unified30["labels"]
    assert [label["classId"] for label in unified34["labels"][30:]] == ["headache", "stomachache", "nausea", "shortness-of-breath"]
    assert len(unified34["symptomClassIds"]) == 15
    policy = load_policy(CONFIG_DIR / "decision_policy.unified34-team-camera.json",
                         dict(UNIFIED_RUNTIME, modelVersion="signbridge-unified34-bigru-v0.5.0", vocabularyVersion="signbridge34-v1"))
    assert set(unified34["symptomClassIds"]) <= set(policy["allowedClassIds"])
    assert select_variant("signbridge34-v1") == 34
    assert select_variant("signbridge30-v1") == 30
    assert select_variant("signbridge71-v1") == 71
    assert set(VARIANTS) == {"signbridge30-v1", "signbridge34-v1", "signbridge71-v1"}


def test_hand_local_features_are_scale_invariant_and_model_selects_width():
    from src.model.dataset import features_for_model, hand_local_features, sequence_to_features

    rng = np.random.default_rng(3)
    landmarks = rng.normal(0, 0.3, (60, 46, 2)).astype(np.float32)
    mask = np.ones((60, 46), dtype=np.uint8)
    mask[5:8, 25:46] = 0
    local = hand_local_features(landmarks, mask)
    moved = hand_local_features(landmarks * 1.7 + 0.4, mask)
    assert local.shape == (60, 84)
    assert np.allclose(local, moved, atol=1e-5)          # konum ve ölçekten bağımsız el biçimi
    assert (local.reshape(60, 42, 2)[5:8, 21:] == 0).all()  # görünmeyen el sıfır
    assert np.array_equal(sequence_to_features(landmarks, mask, hand_local=True)[:, :138],
                          sequence_to_features(landmarks, mask))

    class Wide(VectorModel):
        input_shape = (None, 60, 222)

    assert features_for_model(Wide(_vector(0, .9)), landmarks, mask).shape == (60, 222)
    assert features_for_model(VectorModel(_vector(0, .9)), landmarks, mask).shape == (60, 138)


def test_best_model_is_selected_only_after_minimum_epochs(tmp_path):
    tf = pytest.importorskip("tensorflow")
    from src.train_unified import _BestAfterEpoch

    model = tf.keras.Sequential([tf.keras.layers.Input(shape=(2,)), tf.keras.layers.Dense(1)])
    model.compile(optimizer="sgd", loss="mse")
    path = tmp_path / "best.keras"
    callback = _BestAfterEpoch(str(path), start_epoch=3)
    callback.set_model(model)
    callback.set_params({"epochs": 5})
    callback.on_epoch_end(0, {"val_loss": 0.1})   # erken ve en düşük kayıp: yok sayılır
    assert not path.exists()
    callback.on_epoch_end(2, {"val_loss": 0.5})   # 3. epoch: kaydedilir
    assert path.exists() and callback.best == 0.5
    callback.on_epoch_end(3, {"val_loss": 0.7})
    assert callback.best == 0.5
