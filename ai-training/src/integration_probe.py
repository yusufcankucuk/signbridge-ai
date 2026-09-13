"""Real model parity with HTTP service/proxy. Private evidence goes to ignored runs/."""
from __future__ import annotations

import argparse
import csv
from pathlib import Path

import httpx
import numpy as np

from src.common import AI_ROOT, autsl_labels, load_json, write_json
from src.model.predict import predict_landmarks, validate_bundle


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-root", type=Path, required=True)
    parser.add_argument("--url", default="http://127.0.0.1:8765/predict")
    parser.add_argument("--proxy-url")
    parser.add_argument("--model", type=Path, default=Path("outputs/saved_model"))
    parser.add_argument("--runtime", type=Path, default=Path("outputs/runtime_config.json"))
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    import tensorflow as tf
    with (AI_ROOT / "manifests/autsl20_validation.csv").open(encoding="utf-8-sig", newline="") as f:
        row = next(r for r in csv.DictReader(f) if r["quality_status"] == "approved")
    with np.load(args.data_root / row["landmark_path"], allow_pickle=False) as data:
        landmarks, mask = data["landmarks"], data["mask"]
    runtime = load_json(args.runtime)
    model = tf.keras.models.load_model(str(args.model))
    labels = autsl_labels()
    validate_bundle(model, runtime, labels)
    local = predict_landmarks(model, landmarks, mask, runtime, labels)
    payload = dict(sessionId="validation-probe", preprocessingVersion=runtime["preprocessingVersion"],
                   landmarks=landmarks.tolist(), mask=mask.tolist())
    write_json(args.output / "request.private.json", payload)
    write_json(args.output / "direct.json", local)
    results = {}
    with httpx.Client(timeout=60) as client:
        for name, url in [("service", args.url), ("proxy", args.proxy_url)]:
            if not url:
                results[name] = "not_executed"
                continue
            response = client.post(url, json=payload)
            response.raise_for_status()
            actual = response.json()
            for key in local:
                if key == "confidence":
                    assert abs(actual[key] - local[key]) <= 1e-5
                else:
                    assert actual[key] == local[key], key
            write_json(args.output / f"{name}.json", actual)
            malformed = {**payload, "mask": [[256]*46 for _ in range(60)]}
            bad = client.post(url, json=malformed)
            assert bad.status_code in [400,422]
            results[name] = dict(parity=True, invalid_mask_status=bad.status_code)
    write_json(args.output / "result.json", dict(sample=row["sample_id"], results=results, runtime=runtime,
               data_policy="Private AUTSL-derived request; do not commit or redistribute", clinical_test=False))
    print(results)


if __name__ == "__main__":
    main()
