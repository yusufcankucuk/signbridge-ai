from __future__ import annotations

import csv
from collections.abc import Collection
from pathlib import Path

import numpy as np


BASE_FEATURES = 138
HAND_LOCAL_FEATURES = 84
HAND_LOCAL_TOTAL_FEATURES = BASE_FEATURES + HAND_LOCAL_FEATURES
HAND_BLOCKS = ((4, 25), (25, 46))
MIDDLE_MCP = 9


def hand_local_features(landmarks: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """Her elin el bileğine göre, el boyuyla ölçeklenmiş biçimi (60×42×2 → 84).

    Omuz normalizasyonunda el biçimi (yumruk/düz el/işaret parmağı) küçük sayılarla temsil edilir;
    bu ek görünüm farklı kişilerde aynı el biçimini ayırt etmeyi kolaylaştırır.
    """
    output = np.zeros((len(landmarks), 42, 2), dtype=np.float32)
    for block, (start, end) in enumerate(HAND_BLOCKS):
        points = landmarks[:, start:end, :].astype(np.float32)
        visible = mask[:, start:end].astype(bool)
        relative = points - points[:, :1, :]
        size = np.linalg.norm(relative[:, MIDDLE_MCP, :], axis=-1)
        valid = visible[:, 0] & visible[:, MIDDLE_MCP] & (visible.sum(axis=1) >= 15) & (size > 1e-4)
        local = relative / np.where(valid, size, 1.0)[:, None, None] * 0.5
        local = np.where((valid[:, None] & visible)[..., None], local, 0.0)
        output[:, 21 * block:21 * (block + 1), :] = local
    return output.reshape(len(landmarks), HAND_LOCAL_FEATURES)


def sequence_to_features(landmarks: np.ndarray, mask: np.ndarray, *, hand_local: bool = False) -> np.ndarray:
    if landmarks.shape != (60, 46, 2) or mask.shape != (60, 46):
        raise ValueError(f"Beklenen (60,46,2)/(60,46), gelen {landmarks.shape}/{mask.shape}")
    if not np.isfinite(landmarks).all() or not np.isfinite(mask).all():
        raise ValueError("Girdi sonlu olmalıdır.")
    if not np.isin(mask, [0, 1]).all() or not mask.any():
        raise ValueError("Mask yalnızca 0/1 içermeli ve tamamen boş olmamalıdır.")
    mask_float = mask.astype(np.float32)
    coordinates = landmarks.astype(np.float32) * mask_float[..., None]
    base = np.concatenate([coordinates, mask_float[..., None]], axis=-1).reshape(60, BASE_FEATURES)
    if not hand_local:
        return base
    return np.concatenate([base, hand_local_features(coordinates, mask)], axis=-1)


# Ayna görüntü: omuz/dirsek ve iki el yer değiştirir, x ekseni ters çevrilir (solak işaretleyici).
MIRROR_ORDER = [1, 0, 3, 2, *range(25, 46), *range(4, 25)]


def mirror_landmarks(landmarks: np.ndarray, mask: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    mirrored = landmarks[:, MIRROR_ORDER].astype(np.float32) * np.asarray([-1.0, 1.0], dtype=np.float32)
    return mirrored, mask[:, MIRROR_ORDER]


def features_for_model(model, landmarks: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """Modelin girdi boyutuna göre (138 veya 222) özellik üretir."""
    width = int(model.input_shape[-1])
    if width not in {BASE_FEATURES, HAND_LOCAL_TOTAL_FEATURES}:
        raise ValueError(f"Desteklenmeyen model girdi boyutu: {width}")
    return sequence_to_features(landmarks, mask, hand_local=width == HAND_LOCAL_TOTAL_FEATURES)


def load_split(
    manifest_path: Path,
    data_root: Path,
    *,
    allowed_quality_statuses: Collection[str] = ("approved",),
    hand_local: bool = False,
) -> tuple[np.ndarray, np.ndarray, list[dict[str, str]]]:
    features: list[np.ndarray] = []
    labels: list[int] = []
    accepted_rows: list[dict[str, str]] = []
    with manifest_path.open("r", encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            if row["quality_status"] not in allowed_quality_statuses or row["training_status"] != "trainable":
                continue
            with np.load(data_root / Path(row["landmark_path"]), allow_pickle=False) as data:
                features.append(sequence_to_features(data["landmarks"], data["mask"], hand_local=hand_local))
            labels.append(int(row["model_index"]))
            accepted_rows.append(row)
    if not features:
        raise ValueError(f"Onaylı örnek bulunamadı: {manifest_path}")
    return np.stack(features), np.asarray(labels, dtype=np.int64), accepted_rows
