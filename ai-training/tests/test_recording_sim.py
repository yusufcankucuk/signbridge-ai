"""Gerçek kamera kaydı benzetimi ve canlı kayıt kırpma testleri."""
import csv
import json

import numpy as np

from src.common import preprocessing_config
from src.data.preprocessing import assess_quality
from src.data.simulate_recordings import live_sequence, pad_recording, simulate, trim_recording
from src.train_unified import is_derived


def recording_with_idle_edges():
    """İstemci testindeki (`landmark-preprocessing.test.cjs`) dizinin aynısı."""
    points = np.zeros((30, 75, 2), dtype=np.float32)
    conf = np.zeros((30, 75), dtype=np.float32)
    points[:, 11] = [0.4, 0.4]
    points[:, 12] = [0.6, 0.4]
    conf[:, 11:13] = 1.0
    for frame in range(30):
        if 6 <= frame <= 25 and not 12 <= frame <= 14:
            points[frame, 54:75, 0] = frame / 30
            points[frame, 54:75, 1] = 0.5 + np.arange(54, 75) / 1000
            conf[frame, 54:75] = 0.9
    return points, conf


def test_trim_recording_matches_client_contract():
    points, conf = recording_with_idle_edges()
    trimmed_points, trimmed_conf = trim_recording(points, conf)
    assert len(trimmed_points) == 22
    assert abs(float(trimmed_points[13 - 5, 54, 0]) - 13 / 30) < 1e-6
    assert abs(float(trimmed_conf[13 - 5, 54]) - 0.9) < 1e-6
    assert conf[13, 54] == 0.0


def test_long_idle_recording_passes_quality_after_trim():
    points, conf = recording_with_idle_edges()
    points, conf = points[6:26], conf[6:26]
    idle_points, idle_conf = recording_with_idle_edges()
    points = np.concatenate([np.repeat(idle_points[:1], 25, 0), points, np.repeat(idle_points[:1], 15, 0)])
    conf = np.concatenate([np.repeat(idle_conf[:1], 25, 0), conf, np.repeat(idle_conf[:1], 15, 0)])
    raw = assess_quality(points, conf, minimum_hand_ratio=0.5)
    assert raw.reason == "low_hand_visibility"
    assert assess_quality(*trim_recording(points, conf), minimum_hand_ratio=0.5).status == "approved"


def test_pad_recording_adds_idle_and_hand_entry_then_live_path_recovers_sign():
    points, conf = recording_with_idle_edges()
    points, conf = points[6:12], conf[6:12]
    points = np.concatenate([points] * 3)
    conf = np.concatenate([conf] * 3)
    padded_points, padded_conf = pad_recording(points, conf, 10.0, np.random.default_rng(3),
                                               rest_seconds=(1.0, 1.0), move_seconds=(0.3, 0.3))
    assert len(padded_points) == len(points) + 2 * (10 + 3)
    assert padded_conf[:10, 54:75].max() == 0.0  # bekleme: el yok
    entering = padded_points[10:13, 54, 1]
    assert np.all(np.diff(entering) < 0) or np.all(padded_conf[10:13, 54] == 0)  # el aşağıdan yukarı gelir
    processed, reason = live_sequence(padded_points, padded_conf, 10.0, preprocessing_config(), 0.0)
    assert reason == "ok"
    assert processed["landmarks"].shape == (60, 46, 2)
    assert processed["mask"][:, 25:46].mean() > 0.7


def test_simulation_writes_derived_manifest_rows(tmp_path):
    data_root = tmp_path / "data"
    (data_root / "processed").mkdir(parents=True)
    manifests = tmp_path / "manifests"
    manifests.mkdir()
    points, conf = recording_with_idle_edges()
    views = [{"view": "web-10fps-p0", "fps": 10, "keypoints": points.tolist(), "confidence": conf.tolist()}]
    payload = {"schemaVersion": "signbridge-browser-landmarks-v1", "extractor": "mediapipe-tasks-web",
               "videos": [{"source": "fever/kisi_1", "views": views}]}
    (data_root / "processed" / "external_browser_raw.json").write_text(json.dumps(payload), encoding="utf-8")
    fields = ["sample_id", "class_id", "raw_path", "signer_id", "training_status", "avatar_id"]
    with (manifests / "external_health_training.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerow({"sample_id": "ext_fever_kisi_1_web", "class_id": "fever", "raw_path": "harici/fever/kisi_1.mp4",
                         "signer_id": "ext_kisi", "training_status": "trainable", "avatar_id": "fever"})
    with (manifests / "meb_health11_training.csv").open("w", newline="", encoding="utf-8") as handle:
        csv.DictWriter(handle, fieldnames=fields).writeheader()
    result = simulate(data_root, manifests, per_view=2, seed=1)
    rows = result["rows"]
    assert len(rows) + sum(result["rejected"].values()) == 2
    for row in rows:
        assert row["source"] == "RECORDING_SIM" and is_derived(row)
        assert row["signer_id"] == "rec_ext_kisi" and row["derived_signer_id"] == "ext_kisi"
        saved = np.load(data_root / row["landmark_path"])
        assert saved["landmarks"].shape == (60, 46, 2)
    assert not is_derived({"source": "EXTERNAL"})


def test_test_time_mirror_averages_original_and_mirrored_predictions():
    from src.common import model_labels
    from src.model.dataset import mirror_landmarks, sequence_to_features
    from src.model.predict import predict_landmarks

    labels = model_labels("signbridge30-v1")
    right, left = 20, 21  # iki farklı belirti sınıfı

    class SideModel:
        """Etkin el görüntünün solundaysa bir sınıfı, sağındaysa diğerini seçer."""
        input_shape = (None, 60, 138)
        output_shape = (None, 30)

        def predict(self, x, verbose=0):
            out = np.full((len(x), 30), 0.001)
            for row, features in enumerate(x):
                coords = features.reshape(60, 46, 3)
                winner = right if coords[:, 25:46, 0].sum() < 0 else left
                out[row, winner] = 1.0
            return out / out.sum(axis=1, keepdims=True)

    landmarks = np.zeros((60, 46, 2), dtype=np.float32)
    mask = np.zeros((60, 46), dtype=np.uint8)
    landmarks[:, 0] = (0.5, 0.0)
    landmarks[:, 1] = (-0.5, 0.0)
    mask[:, :2] = 1
    landmarks[:, 25:46] = (-0.4, -0.5)
    mask[:, 25:46] = 1
    mirrored, mirrored_mask = mirror_landmarks(landmarks, mask)
    assert mirrored_mask[:, 4:25].all() and not mirrored_mask[:, 25:46].any()
    assert np.allclose(mirrored[:, 4:25], (0.4, -0.5))
    assert np.array_equal(mirror_landmarks(*mirror_landmarks(landmarks, mask))[0], landmarks)
    runtime = {"modelVersion": "signbridge-unified30-bigru-v0.2.0", "preprocessingVersion": "landmark46-v1",
               "vocabularyVersion": "signbridge30-v1", "confidenceThreshold": 0.95}
    plain = predict_landmarks(SideModel(), landmarks, mask, runtime, labels, recognition_context="symptom")
    averaged = predict_landmarks(SideModel(), landmarks, mask, {**runtime, "testTimeMirror": True}, labels,
                                 recognition_context="symptom")
    assert plain["classId"] == labels[right]["classId"] and plain["confidence"] > 0.9
    assert plain["classId"] not in plain["alternatives"] and len(plain["alternatives"]) <= 3
    # Ayna görüntü diğer sınıfı seçtiği için ortalamada iki sınıf yarı yarıya kalır.
    assert averaged["classId"] is None
    assert set(averaged["alternatives"][:2]) == {labels[right]["classId"], labels[left]["classId"]}
    assert len(averaged["alternatives"]) <= 3
    assert averaged["confidence"] < 0.6
    assert sequence_to_features(mirrored, mirrored_mask).shape == (60, 138)


def test_context_clip_evaluation_counts_crops_and_rejections():
    from src.common import label_config
    from src.evaluate_context_clips import crops, evaluate

    assert crops(50, 10.0, 1.5, 0.3) == [(0, 50), (5, 50), (10, 50)]
    assert len(crops(50, 10.0, 1.5, 1.5)) == 9
    labels = label_config("signbridge34-v1")["labels"]
    fever = next(item["index"] for item in labels if item["classId"] == "fever")

    class FeverModel:
        input_shape = (None, 60, 222)

        def predict(self, x, verbose=0):
            out = np.full((len(x), len(labels)), 0.01)
            out[:, fever] = 1.0
            return out / out.sum(axis=1, keepdims=True)

    points, conf = recording_with_idle_edges()
    points[:, 54:75, 1] += np.sin(np.arange(30))[:, None] * 0.05  # hareket kapısı için
    idle_points = np.repeat(points[:1], 20, axis=0)
    idle_conf = np.repeat(conf[:1], 20, axis=0)
    long_points = np.concatenate([idle_points, points, idle_points])
    long_conf = np.concatenate([idle_conf, conf, idle_conf])
    view = {"view": "web-10fps-p0", "fps": 10, "keypoints": long_points.tolist(), "confidence": long_conf.tolist()}
    videos = [{"source": "fever/kisi_1", "views": [view]},
              {"source": "fever/baska_1", "views": [view]}]
    result = evaluate(FeverModel(), videos, {"fever/kisi_1.mp4": (1.5, 1.5)}, {"kisi"})
    assert result["samples"] == 9 and result["clips"] == 1
    # Kırpma olmadan eller kaydın yarısından azında görünür: tümü reddedilir.
    assert result["now"]["top1"] == 0 and sum(result["now"]["rejected"].values()) == 9
    assert result["trim"]["top1"] == 9 and result["trim+mirror"]["top3"] == 9
