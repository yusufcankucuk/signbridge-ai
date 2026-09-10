from __future__ import annotations

import argparse
import csv
import json
from collections import Counter
from pathlib import Path

from src.common import AI_ROOT, resolve_data_root, write_json
from src.extract_landmarks import save_processed_video


def main() -> None:
    parser = argparse.ArgumentParser(description="MEB-16 referans videolarını landmark NPZ biçimine dönüştürür.")
    parser.add_argument("--data-root")
    parser.add_argument("--manifest", default=str(AI_ROOT / "manifests" / "meb16_reference.csv"))
    args = parser.parse_args()
    data_root = resolve_data_root(args.data_root)
    manifest_path = Path(args.manifest).resolve()
    with manifest_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        fieldnames = list(reader.fieldnames or [])
        rows = list(reader)

    statuses: Counter[str] = Counter()
    details: list[dict[str, object]] = []
    for row in rows:
        try:
            metadata = save_processed_video(
                data_root / Path(row["raw_path"]),
                data_root / Path(row["landmark_path"]),
                row["class_id"],
            )
            row["quality_status"] = str(metadata["qualityStatus"])
            statuses[row["quality_status"]] += 1
            details.append({"sampleId": row["sample_id"], **metadata})
        except Exception as exc:
            row["quality_status"] = "rejected"
            statuses["rejected"] += 1
            details.append({"sampleId": row["sample_id"], "error": f"{type(exc).__name__}: {exc}"})

    with manifest_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    report = {"total": len(rows), "statuses": dict(statuses), "details": details}
    write_json(manifest_path.parent / "meb_conversion_summary.json", report)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
