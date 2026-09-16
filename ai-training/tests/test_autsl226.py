"""AUTSL-226 paketleme, ön eğitim verisi ve kodlayıcı aktarımı testleri."""
import csv
import pickle
import zipfile

import numpy as np
import pytest

from src.data.pack_autsl226 import pack_shard
from src.model.dataset import sequence_to_features
from src.pretrain_autsl226 import load_packed, with_hand_local


def fake_pose(frames=30, seed=0, hands=True):
    rng = np.random.default_rng(seed)
    keypoints = np.zeros((frames, 75, 3), dtype=np.float32)
    confidences = np.zeros((frames, 75), dtype=np.float32)
    keypoints[:, 11, :2] = (0.4, 0.5)
    keypoints[:, 12, :2] = (0.6, 0.5)
    keypoints[:, 13, :2] = (0.35, 0.7)
    keypoints[:, 14, :2] = (0.65, 0.7)
    confidences[:, 11:15] = 1
    if hands:
        t = np.linspace(0, 1, frames)[:, None, None]
        keypoints[:, 54:75, :2] = 0.45 + t * 0.1 + rng.normal(0, 0.01, (frames, 21, 2))
        confidences[:, 54:75] = 1
    return {"keypoints": keypoints, "confidences": confidences}


def test_pack_and_load_autsl226(tmp_path):
    archive_path = tmp_path / "AUTSL.zip"
    with zipfile.ZipFile(archive_path, "w") as archive:
        for index in range(3):
            archive.writestr(f"train_poses/signer0_sample{index}_color.pkl", pickle.dumps(fake_pose(seed=index)))
        archive.writestr("train_poses/signer0_sample9_color.pkl", pickle.dumps(fake_pose(hands=False)))
    data_root = tmp_path / "data"
    (data_root / "AUTSL").mkdir(parents=True)
    with (data_root / "AUTSL" / "train_labels.csv").open("w", newline="") as handle:
        csv.writer(handle).writerows([["signer0_sample0", 5], ["signer0_sample1", 7], ["signer0_sample2", 225],
                                      ["signer0_sample9", 1]])
    shard = data_root / "processed" / "autsl226" / "shards" / "train_00000.npz"
    with zipfile.ZipFile(archive_path) as archive:
        kept, rejected = pack_shard(archive, sorted(n for n in archive.namelist()), shard)
    assert (kept, rejected) == (3, 1)  # elsiz örnek kalite kapısında elenir
    features, targets, ids = load_packed(data_root, "train")
    assert features.shape == (3, 60, 138) and features.dtype == np.float16
    assert targets.tolist() == [5, 7, 225]
    assert ids == ["signer0_sample0", "signer0_sample1", "signer0_sample2"]
    full = with_hand_local(features)
    with np.load(shard) as data:
        expected = sequence_to_features(data["landmarks"][0].astype(np.float32), data["mask"][0], hand_local=True)
    assert full.shape == (3, 60, 222)
    assert np.allclose(full[0], expected, atol=1e-3)


def test_encoder_initialization_maps_autsl20_rows():
    tf = pytest.importorskip("tensorflow")
    import src.train_unified as unified

    unified.HAND_LOCAL = True
    try:
        encoder = unified.build_model(226, 222)
        student = unified.build_model(34, 222)
        old_ids = list(range(100, 120))
        unified.initialize_from_encoder(encoder, student, old_ids)
        for source, destination in zip(encoder.layers[:-1], student.layers[:-1]):
            for a, b in zip(source.get_weights(), destination.get_weights()):
                assert np.array_equal(a, b)
        kernel, bias = encoder.layers[-1].get_weights()
        new_kernel, new_bias = student.layers[-1].get_weights()
        assert np.array_equal(new_kernel[:, :20], kernel[:, old_ids])
        assert np.array_equal(new_bias[:20], bias[old_ids])
        x = np.random.default_rng(0).normal(size=(2, 60, 222)).astype(np.float32)
        full = encoder.predict(x, verbose=0)
        # İlk 20 sınıfın logit sırası korunur (softmax paydası farklı olsa da oranlar aynı).
        student_probabilities = student.predict(x, verbose=0)
        ratio = student_probabilities[:, 0] / student_probabilities[:, 1]
        assert np.allclose(ratio, full[:, 100] / full[:, 101], rtol=1e-3)
        with pytest.raises(ValueError):
            unified.initialize_from_encoder(unified.build_model(226, 138), student, old_ids)
        with pytest.raises(ValueError):
            unified.initialize_from_encoder(encoder, student, [300] * 20)
    finally:
        unified.HAND_LOCAL = False
    del tf
