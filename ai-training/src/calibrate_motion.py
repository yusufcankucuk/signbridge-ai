"""Select and freeze a camera motion threshold from labelled development trials."""
from __future__ import annotations

import argparse
import csv
from pathlib import Path

import numpy as np

from src.common import write_json


def select_motion_threshold(valid_scores: list[float], static_scores: list[float]) -> dict[str, object]:
    if not valid_scores or not static_scores:
        raise ValueError("En az bir valid ve bir static geliştirme kaydı gereklidir.")
    valid = np.asarray(valid_scores, dtype=np.float64)
    static = np.asarray(static_scores, dtype=np.float64)
    if not np.isfinite(valid).all() or not np.isfinite(static).all() or (valid < 0).any() or (static < 0).any():
        raise ValueError("motionScore değerleri sonlu ve sıfırdan büyük/eşit olmalıdır.")

    threshold = float(np.nextafter(static.max(), np.inf))
    valid_pass_rate = float((valid >= threshold).mean())
    static_reject_rate = float((static < threshold).mean())
    target_met = static_reject_rate == 1.0 and valid_pass_rate >= 0.90
    return {
        "schemaVersion": "1.0",
        "targetMet": target_met,
        "minimumMotionScore": threshold if target_met else None,
        "validSamples": int(len(valid)),
        "staticSamples": int(len(static)),
        "validPassRate": valid_pass_rate,
        "staticRejectRate": static_reject_rate,
        "cameraAiAllowed": target_met,
        "reason": (
            "All static samples are rejected and at least 90% of valid development samples pass."
            if target_met
            else "No threshold satisfies both the 100% static rejection and 90% valid pass gates."
        ),
    }


def load_scores(path: Path) -> tuple[list[float], list[float]]:
    valid: list[float] = []
    static: list[float] = []
    with path.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            label = (row.get("motion_label") or "").strip().lower()
            if label not in {"valid", "static"}:
                continue
            try:
                score = float(row["motion_score"])
            except (KeyError, TypeError, ValueError) as exc:
                raise ValueError("Her etiketli satırda geçerli motion_score bulunmalıdır.") from exc
            (valid if label == "valid" else static).append(score)
    return valid, static


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        raise ValueError(f"Dondurulmuş eşik dosyasının üzerine yazılmaz: {args.output}")
    valid, static = load_scores(args.input)
    write_json(args.output, select_motion_threshold(valid, static))


if __name__ == "__main__":
    main()
