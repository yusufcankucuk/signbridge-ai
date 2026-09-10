"""Merge human camera trial CSV files into the fixed 50-row evaluation matrix."""
from __future__ import annotations

import argparse
import csv
from pathlib import Path

from src.common import write_json
from src.validate_video import FIELDS, trial_matrix


def read_rows(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def merge_trials(trial_rows: list[dict[str, str]]) -> list[dict[str, object]]:
    matrix = {row["trial_id"]: row for row in trial_matrix()}
    seen: set[str] = set()
    for row in trial_rows:
        trial_id = row.get("trial_id", "")
        if row.get("status") == "pending":
            continue
        if trial_id not in matrix:
            raise ValueError(f"Bilinmeyen veya matris dışı trial_id: {trial_id}")
        if trial_id in seen:
            raise ValueError(f"Aynı deneme iki kez bulundu: {trial_id}")
        seen.add(trial_id)
        matrix[trial_id].update({key: value for key, value in row.items() if value not in ("", None)})
    return list(matrix.values())


def write_csv(path: Path, rows: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--trial-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if not args.trial_dir.is_dir():
        parser.error("--trial-dir mevcut bir klasör olmalıdır.")
    files = sorted(args.trial_dir.glob("*.csv"))
    if not files:
        parser.error("Deneme CSV'si bulunamadı.")
    rows = merge_trials([row for path in files for row in read_rows(path)])
    write_csv(args.output, rows)
    measured = [row for row in rows if row.get("status") != "pending"]
    verified = [row for row in measured if row.get("performance_verified") == "yes"]
    correct = [row for row in verified if str(row.get("correct", "")).lower() == "true"]
    summary = {
        "expectedTrials": 50,
        "measuredTrials": len(measured),
        "pendingTrials": 50 - len(measured),
        "verifiedPerformanceTrials": len(verified),
        "correctVerifiedTrials": len(correct),
        "complete": len(measured) == 50,
        "limitation": "Doğruluk yalnızca performance_verified=yes satırlarında yorumlanmalıdır.",
    }
    write_json(args.output.with_suffix(".summary.json"), summary)
    print(summary)


if __name__ == "__main__":
    main()
