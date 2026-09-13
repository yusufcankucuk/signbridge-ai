from __future__ import annotations

import argparse
import csv
import json
import pickle
from collections import Counter
from pathlib import Path

import numpy as np

from src.common import AI_ROOT, preprocessing_config, resolve_data_root, write_json
from src.data.preprocessing import assess_quality, preprocess_pose_sequence


def _load_official_autsl_pickle(path: Path) -> tuple[np.ndarray, np.ndarray]:
    # Pickle güvenli bir biçim değildir. Bu fonksiyon yalnızca resmî AUTSL/OpenHands
    # paketinden indirilen ve kullanıcı tarafından güvenilir kabul edilen dosyalarda kullanılır.
    with path.open("rb") as handle:
        payload = pickle.load(handle)
    if not isinstance(payload, dict) or not {"keypoints", "confidences"}.issubset(payload):
        raise ValueError("PKL keypoints/confidences alanlarını içermiyor.")
    return np.asarray(payload["keypoints"]), np.asarray(payload["confidences"])


def convert_manifest(manifest_path: Path, data_root: Path) -> dict[str, object]:
    config = preprocessing_config()
    statuses: Counter[str] = Counter()
    reasons: Counter[str] = Counter()
    rows: list[dict[str, str]] = []

    with manifest_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        fieldnames = list(reader.fieldnames or [])
        for row in reader:
            raw_path = data_root / Path(row["raw_path"])
            output_path = data_root / Path(row["landmark_path"])
            try:
                keypoints, confidences = _load_official_autsl_pickle(raw_path)
                quality = assess_quality(
                    keypoints,
                    confidences,
                    minimum_confidence=config["minimumConfidence"],
                    minimum_frames=config["minimumSequenceFrames"],
                    minimum_shoulder_ratio=config["minimumShoulderFrameRatio"],
                    minimum_hand_ratio=config["minimumHandFrameRatio"],
                )
                row["quality_status"] = quality.status
                if quality.status == "approved":
                    processed = preprocess_pose_sequence(
                        keypoints,
                        confidences,
                        target_length=config["sequenceLength"],
                        minimum_confidence=config["minimumConfidence"],
                    )
                    output_path.parent.mkdir(parents=True, exist_ok=True)
                    np.savez_compressed(
                        output_path,
                        **processed,
                        label_index=np.int64(row["model_index"]),
                        class_id=np.asarray(row["class_id"]),
                        sample_id=np.asarray(row["sample_id"]),
                        preprocessing_version=np.asarray(config["preprocessingVersion"]),
                    )
                statuses[quality.status] += 1
                reasons[quality.reason] += 1
            except Exception as exc:  # keep batch conversion auditable
                row["quality_status"] = "rejected"
                statuses["rejected"] += 1
                reasons[type(exc).__name__] += 1
            rows.append(row)

    with manifest_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    return {
        "manifest": manifest_path.name,
        "total": len(rows),
        "statuses": dict(statuses),
        "reasons": dict(reasons),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="AUTSL-20 PKL dosyalarını standart NPZ dizilerine dönüştürür.")
    parser.add_argument("--data-root")
    parser.add_argument("--manifest-dir", default=str(AI_ROOT / "manifests"))
    parser.add_argument("--splits", nargs="+", default=["train", "validation", "test"])
    args = parser.parse_args()

    data_root = resolve_data_root(args.data_root)
    manifest_dir = Path(args.manifest_dir).resolve()
    reports = [
        convert_manifest(manifest_dir / f"autsl20_{split}.csv", data_root)
        for split in args.splits
    ]
    report = {"preprocessingVersion": preprocessing_config()["preprocessingVersion"], "reports": reports}
    write_json(manifest_dir / "conversion_summary.json", report)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
