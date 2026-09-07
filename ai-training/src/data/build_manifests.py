from __future__ import annotations

import argparse
import csv
import json
import re
from collections import Counter
from pathlib import Path

from src.common import AI_ROOT, autsl_labels, meb_labels, resolve_data_root, write_json


AUTSL_SPLITS = {
    "train": ("train_labels.csv", "train_poses"),
    "validation": ("validation_labels.csv", "val_poses"),
    "test": ("test_labels.csv", "test_poses"),
}
EXPECTED_COUNTS = {"train": 2448, "validation": 380, "test": 318}
FIELDNAMES = [
    "sample_id",
    "class_id",
    "model_index",
    "original_class_id",
    "source",
    "source_version",
    "signer_id",
    "consent_id",
    "split",
    "raw_path",
    "landmark_path",
    "quality_status",
    "training_status",
    "manual_selectable",
    "risk_tier",
]


def _write_csv(path: Path, rows: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(rows)


def _find_autsl_root(data_root: Path) -> Path:
    for candidate in (data_root / "AUTSL", data_root / "autsl"):
        if candidate.is_dir():
            return candidate
    raise FileNotFoundError(f"AUTSL klasörü bulunamadı: {data_root}")


def _signer_id(sample_id: str) -> str:
    match = re.match(r"^(signer\d+)_sample\d+$", sample_id)
    if not match:
        raise ValueError(f"Beklenmeyen AUTSL sample_id: {sample_id}")
    return match.group(1)


def build_autsl_manifests(data_root: Path, output_dir: Path) -> dict[str, object]:
    autsl_root = _find_autsl_root(data_root)
    label_by_original = {int(item["originalClassId"]): item for item in autsl_labels()}
    summary: dict[str, object] = {"splits": {}, "classes": {}}
    class_counts: Counter[str] = Counter()

    for split, (labels_name, poses_name) in AUTSL_SPLITS.items():
        labels_path = autsl_root / labels_name
        poses_dir = autsl_root / poses_name
        if not labels_path.is_file() or not poses_dir.is_dir():
            raise FileNotFoundError(f"AUTSL {split} dosyaları eksik: {labels_path}, {poses_dir}")

        rows: list[dict[str, object]] = []
        with labels_path.open("r", encoding="utf-8-sig", newline="") as handle:
            for sample_id, original_class_id_raw in csv.reader(handle):
                original_class_id = int(original_class_id_raw)
                label = label_by_original.get(original_class_id)
                if label is None:
                    continue
                raw_path = Path("AUTSL") / poses_name / f"{sample_id}_color.pkl"
                absolute_raw_path = data_root / raw_path
                if not absolute_raw_path.is_file():
                    raise FileNotFoundError(f"Manifest örneğinin PKL dosyası yok: {absolute_raw_path}")
                landmark_path = (
                    Path("processed")
                    / "autsl20"
                    / "landmark46-v1"
                    / split
                    / f"{sample_id}.npz"
                )
                rows.append(
                    {
                        "sample_id": sample_id,
                        "class_id": label["classId"],
                        "model_index": label["index"],
                        "original_class_id": original_class_id,
                        "source": "AUTSL",
                        "source_version": "AUTSL_OpenHands_pose_v1",
                        "signer_id": _signer_id(sample_id),
                        "consent_id": "dataset_license",
                        "split": split,
                        "raw_path": raw_path.as_posix(),
                        "landmark_path": landmark_path.as_posix(),
                        "quality_status": "unprocessed",
                        "training_status": "trainable",
                        "manual_selectable": "true",
                        "risk_tier": label.get("riskTier", "standard"),
                    }
                )
                class_counts[label["classId"]] += 1

        expected = EXPECTED_COUNTS[split]
        if len(rows) != expected:
            raise ValueError(f"{split}: beklenen {expected}, bulunan {len(rows)} AUTSL-20 örneği")
        _write_csv(output_dir / f"autsl20_{split}.csv", rows)
        summary["splits"][split] = len(rows)

    summary["classes"] = dict(sorted(class_counts.items()))
    summary["total"] = sum(EXPECTED_COUNTS.values())
    return summary


def build_meb_manifest(data_root: Path, output_dir: Path) -> dict[str, object]:
    meb_root = data_root / "meb"
    if not meb_root.is_dir():
        raise FileNotFoundError(f"MEB klasörü bulunamadı: {meb_root}")

    rows: list[dict[str, object]] = []
    for label in meb_labels():
        raw_path = Path("meb") / label["sourceFile"]
        if not (data_root / raw_path).is_file():
            raise FileNotFoundError(f"MEB videosu bulunamadı: {data_root / raw_path}")
        landmark_path = (
            Path("processed")
            / "meb16"
            / "landmark46-v1"
            / f"{label['classId']}.npz"
        )
        rows.append(
            {
                "sample_id": f"meb_{label['classId']}_ref01",
                "class_id": label["classId"],
                "model_index": "",
                "original_class_id": "",
                "source": "MEB",
                "source_version": "MEB_Saglik_Tematik_Sozluk_2026-09",
                "signer_id": label.get("sourceSignerId", "meb_official_01"),
                "consent_id": "official_source_permission_assumed",
                "split": "reference",
                "raw_path": raw_path.as_posix(),
                "landmark_path": landmark_path.as_posix(),
                "quality_status": "unprocessed",
                "training_status": "reference_only",
                "manual_selectable": str(label.get("manualSelectable", False)).lower(),
                "risk_tier": label.get("riskTier", "standard"),
            }
        )

    _write_csv(output_dir / "meb16_reference.csv", rows)
    return {
        "total": len(rows),
        "manualSelectable": sum(row["manual_selectable"] == "true" for row in rows),
        "trainingStatus": "reference_only",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="SignBridge AUTSL-20 ve MEB-16 manifestlerini üretir.")
    parser.add_argument("--data-root", help="AUTSL ve meb klasörlerini içeren veri dizini")
    parser.add_argument("--output-dir", default=str(AI_ROOT / "manifests"))
    args = parser.parse_args()

    data_root = resolve_data_root(args.data_root)
    output_dir = Path(args.output_dir).resolve()
    summary = {
        # Yerel kullanıcı yolu rapora yazılmaz; aynı manifestler ekipte ve
        # ModelArts'ta SIGNBRIDGE_DATA_ROOT ile taşınabilir kalır.
        "dataRoot": "<SIGNBRIDGE_DATA_ROOT>",
        "autsl20": build_autsl_manifests(data_root, output_dir),
        "meb16": build_meb_manifest(data_root, output_dir),
    }
    write_json(output_dir / "manifest_summary.json", summary)
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
