"""Measure model load, cold/warm inference, optional HTTP, and recorded camera latency separately."""
from __future__ import annotations

import argparse
import csv
import time
from pathlib import Path

import numpy as np

from src.common import load_json, write_json
from src.model.dataset import sequence_to_features


def distribution(values) -> dict[str, float | int] | None:
    values = np.asarray(list(values), dtype=np.float64)
    values = values[np.isfinite(values)]
    if not len(values):
        return None
    return {
        "n": int(len(values)),
        "p50Ms": float(np.percentile(values, 50)),
        "p95Ms": float(np.percentile(values, 95)),
        "maxMs": float(values.max()),
    }


def _timed(callable_):
    started = time.perf_counter()
    result = callable_()
    return result, (time.perf_counter() - started) * 1000


def _camera_metrics(path: Path | None):
    if path is None:
        return None
    with path.open(encoding="utf-8-sig", newline="") as handle:
        rows = [row for row in csv.DictReader(handle) if row.get("status") == "measured"]
    fields = ["after_capture_ms", "extraction_ms", "preprocessing_ms", "inference_ms"]
    return {
        field: distribution(float(row[field]) for row in rows if row.get(field) not in (None, ""))
        for field in fields
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", type=Path, default=Path("outputs/saved_model"))
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--runtime", type=Path, default=Path("outputs/runtime_config.json"))
    parser.add_argument("--camera-csv", type=Path)
    parser.add_argument("--service-url")
    parser.add_argument("--iterations", type=int, default=30)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.iterations < 1:
        parser.error("--iterations en az 1 olmalıdır.")
    if args.output.exists():
        parser.error("Çıktı zaten var; yeni bir dosya adı kullanın.")

    import tensorflow as tf

    model, model_load_ms = _timed(lambda: tf.keras.models.load_model(str(args.model)))
    with np.load(args.input, allow_pickle=False) as sample:
        landmarks = np.asarray(sample["landmarks"], dtype=np.float32)
        mask = np.asarray(sample["mask"], dtype=np.uint8)
    features = sequence_to_features(landmarks, mask)
    _, cold_ms = _timed(lambda: model.predict(features[None], verbose=0))
    warm_ms = []
    for _ in range(args.iterations):
        _, elapsed = _timed(lambda: model.predict(features[None], verbose=0))
        warm_ms.append(elapsed)

    http_metrics = None
    if args.service_url:
        import httpx

        runtime = load_json(args.runtime)
        payload = {
            "sessionId": "latency-benchmark",
            "preprocessingVersion": runtime["preprocessingVersion"],
            "landmarks": landmarks.tolist(),
            "mask": mask.astype(int).tolist(),
        }
        values = []
        with httpx.Client(timeout=15) as client:
            for _ in range(args.iterations):
                response, elapsed = _timed(lambda: client.post(args.service_url, json=payload))
                response.raise_for_status()
                values.append(elapsed)
        http_metrics = distribution(values)

    write_json(
        args.output,
        {
            "modelLoadMs": model_load_ms,
            "coldPredictionMs": cold_ms,
            "warmPrediction": distribution(warm_ms),
            "httpRoundTrip": http_metrics,
            "cameraTrials": _camera_metrics(args.camera_csv),
            "iterations": args.iterations,
            "notes": [
                "Warm prediction repeats one fixed NPZ and is not live-camera latency.",
                "Camera metrics are reported only when measured CSV rows are supplied.",
                "HTTP time includes serialization, transport, service validation, and inference.",
            ],
        },
    )


if __name__ == "__main__":
    main()
