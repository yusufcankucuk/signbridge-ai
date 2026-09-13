"""Merge camera trial CSVs while preserving planned, failed, pending, and supplemental attempts."""
from __future__ import annotations

import argparse
import csv
import math
from pathlib import Path

from src.common import write_json
from src.validate_video import CLASSES, CONDITIONS, FIELDS, trial_matrix


def read_rows(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def _truth(value) -> bool:
    return str(value).lower() == "true"


def _validate_supplemental(row: dict[str, str]) -> None:
    if row.get("evaluation_group") not in {"development", "holdout", "reference"}:
        raise ValueError(f"Geçersiz evaluation_group: {row.get('evaluation_group')}")
    if row.get("expected_class") not in set(CLASSES) | {"unknown", "agri"}:
        raise ValueError(f"Geçersiz expected_class: {row.get('expected_class')}")
    if row.get("condition") not in set(CONDITIONS) | {"reference"}:
        raise ValueError(f"Geçersiz condition: {row.get('condition')}")
    if not row.get("participant_code"):
        raise ValueError("Katılımcı kodu boş olamaz.")


def merge_trials(trial_rows: list[dict[str, str]]) -> list[dict[str, object]]:
    planned_rows = trial_matrix()
    matrix = {row["trial_id"]: row for row in planned_rows}
    supplemental: list[dict[str, object]] = []
    seen: set[str] = set()
    for row in trial_rows:
        trial_id = row.get("trial_id", "")
        if not trial_id:
            raise ValueError("trial_id boş olamaz.")
        if row.get("status") == "pending":
            continue
        if trial_id in seen:
            raise ValueError(f"Aynı deneme iki kez bulundu: {trial_id}")
        seen.add(trial_id)
        clean = {key: value for key, value in row.items() if value not in ("", None)}
        if trial_id in matrix:
            matrix[trial_id].update(clean)
        else:
            _validate_supplemental(row)
            supplemental.append({"planned": False, **clean})
    return list(matrix.values()) + supplemental


def write_csv(path: Path, rows: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)


def wilson_interval(successes: int, total: int, z: float = 1.959963984540054) -> dict[str, float] | None:
    if total == 0:
        return None
    proportion = successes / total
    denominator = 1 + z * z / total
    centre = (proportion + z * z / (2 * total)) / denominator
    spread = z * math.sqrt(proportion * (1 - proportion) / total + z * z / (4 * total * total)) / denominator
    return {"lower": max(0.0, centre - spread), "upper": min(1.0, centre + spread)}


def group_summary(rows, group):
    planned = [row for row in rows if row.get("evaluation_group") == group and str(row.get("planned")).lower() != "false"]
    measured = [row for row in planned if row.get("status") != "pending"]
    verified = [row for row in measured if row.get("performance_verified") == "yes"]
    accepted = [row for row in verified if _truth(row.get("accepted"))]
    correct = [row for row in accepted if _truth(row.get("correct"))]
    correct_classes = sorted({row.get("expected_class") for row in correct})
    return {
        "expectedTrials": 25,
        "measuredTrials": len(measured),
        "pendingTrials": 25 - len(measured),
        "verifiedPerformanceTrials": len(verified),
        "uncertainPerformanceTrials": len(measured) - len(verified),
        "acceptedVerifiedTrials": len(accepted),
        "correctAcceptedTrials": len(correct),
        "acceptedAccuracy": len(correct) / len(accepted) if accepted else None,
        "acceptedAccuracy95CiWilson": wilson_interval(len(correct), len(accepted)),
        "coverage": len(accepted) / len(verified) if verified else None,
        "coverage95CiWilson": wilson_interval(len(accepted), len(verified)),
        "classesWithCorrectAccept": correct_classes,
        "allFiveClassesHaveCorrectAccept": set(correct_classes) >= set(CLASSES),
        "complete": len(measured) == 25,
    }


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
    planned = [row for row in rows if str(row.get("planned")).lower() != "false"]
    summary = {
        "expectedTrials": 50,
        "measuredTrials": sum(row.get("status") != "pending" for row in planned),
        "pendingTrials": sum(row.get("status") == "pending" for row in planned),
        "supplementalTrials": len(rows) - len(planned),
        "development": group_summary(rows, "development"),
        "holdout": group_summary(rows, "holdout"),
        "complete": all(row.get("status") != "pending" for row in planned),
        "limitation": "Yüzdeler yalnız performance_verified=yes kayıtlarında hesaplanır; iki grup birleştirilmez.",
    }
    write_json(args.output.with_suffix(".summary.json"), summary)
    print(summary)


if __name__ == "__main__":
    main()
