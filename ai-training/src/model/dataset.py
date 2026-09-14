from __future__ import annotations

import csv
from pathlib import Path

import numpy as np


def sequence_to_features(landmarks: np.ndarray, mask: np.ndarray) -> np.ndarray:
    if landmarks.shape != (60, 46, 2) or mask.shape != (60, 46):
        raise ValueError(f"Beklenen (60,46,2)/(60,46), gelen {landmarks.shape}/{mask.shape}")
    if not np.isfinite(landmarks).all() or not np.isfinite(mask).all():
        raise ValueError("Girdi sonlu olmalıdır.")
    if not np.isin(mask, [0, 1]).all() or not mask.any():
        raise ValueError("Mask yalnızca 0/1 içermeli ve tamamen boş olmamalıdır.")
    mask_float = mask.astype(np.float32)
    coordinates = landmarks.astype(np.float32) * mask_float[..., None]
    return np.concatenate([coordinates, mask_float[..., None]], axis=-1).reshape(60, 138)


def load_split(manifest_path: Path, data_root: Path) -> tuple[np.ndarray, np.ndarray, list[dict[str, str]]]:
    features: list[np.ndarray] = []
    labels: list[int] = []
    accepted_rows: list[dict[str, str]] = []
    with manifest_path.open("r", encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            if row["quality_status"] != "approved" or row["training_status"] != "trainable":
                continue
            with np.load(data_root / Path(row["landmark_path"]), allow_pickle=False) as data:
                features.append(sequence_to_features(data["landmarks"], data["mask"]))
            labels.append(int(row["model_index"]))
            accepted_rows.append(row)
    if not features:
        raise ValueError(f"Onaylı örnek bulunamadı: {manifest_path}")
    return np.stack(features), np.asarray(labels, dtype=np.int64), accepted_rows
