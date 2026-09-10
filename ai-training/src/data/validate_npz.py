from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np


def validate_npz(path: Path) -> list[str]:
    errors: list[str] = []
    try:
        with np.load(path, allow_pickle=False) as data:
            required = {"landmarks", "confidence", "mask", "original_length"}
            missing = required - set(data.files)
            if missing:
                return [f"missing_keys={sorted(missing)}"]
            landmarks = data["landmarks"]
            confidence = data["confidence"]
            mask = data["mask"]
            if landmarks.shape != (60, 46, 2):
                errors.append(f"landmarks_shape={landmarks.shape}")
            if confidence.shape != (60, 46):
                errors.append(f"confidence_shape={confidence.shape}")
            if mask.shape != (60, 46):
                errors.append(f"mask_shape={mask.shape}")
            if landmarks.dtype != np.float32:
                errors.append(f"landmarks_dtype={landmarks.dtype}")
            if not np.isfinite(landmarks).all() or not np.isfinite(confidence).all():
                errors.append("non_finite_value")
            if not np.isin(mask, [0, 1]).all():
                errors.append("mask_not_binary")
    except Exception as exc:
        errors.append(f"{type(exc).__name__}: {exc}")
    return errors


def main() -> None:
    parser = argparse.ArgumentParser(description="Bir NPZ dosyasını veya klasör ağacını doğrular.")
    parser.add_argument("path")
    args = parser.parse_args()
    path = Path(args.path)
    files = [path] if path.is_file() else sorted(path.rglob("*.npz"))
    failures = {str(item): errors for item in files if (errors := validate_npz(item))}
    report = {"total": len(files), "valid": len(files) - len(failures), "failures": failures}
    print(json.dumps(report, ensure_ascii=False, indent=2))
    raise SystemExit(1 if failures else 0)


if __name__ == "__main__":
    main()
