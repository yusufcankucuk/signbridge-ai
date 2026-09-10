from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

from src.common import autsl_labels, load_json
from src.model.dataset import sequence_to_features


def predict_landmarks(model, landmarks: np.ndarray, mask: np.ndarray, runtime: dict[str, object]) -> dict[str, object]:
    labels = autsl_labels()
    features = sequence_to_features(landmarks, mask)
    probabilities = model.predict(features[None, ...], verbose=0)[0]
    ordered = np.argsort(probabilities)[::-1]
    winner = int(ordered[0])
    confidence = float(probabilities[winner])
    low_confidence = confidence < float(runtime["confidenceThreshold"])
    return {
        "classId": None if low_confidence else labels[winner]["classId"],
        "displayText": "İşaret kesin olarak anlaşılamadı." if low_confidence else labels[winner]["displayText"],
        "confidence": round(confidence, 6),
        "alternatives": [labels[int(index)]["classId"] for index in ordered[:3]],
        "isLowConfidence": low_confidence,
        "predictionMode": "model",
        "modelVersion": runtime["modelVersion"],
        "preprocessingVersion": runtime["preprocessingVersion"],
        "vocabularyVersion": runtime["vocabularyVersion"],
    }


def predict_npz(model_path: Path, input_path: Path, runtime_config_path: Path) -> dict[str, object]:
    import tensorflow as tf

    runtime = load_json(runtime_config_path)
    with np.load(input_path, allow_pickle=False) as data:
        landmarks = data["landmarks"]
        mask = data["mask"]
    model = tf.keras.models.load_model(str(model_path))
    return predict_landmarks(model, landmarks, mask, runtime)


def main() -> None:
    parser = argparse.ArgumentParser(description="Eğitilmiş SignBridge modelinden JSON tahmini alır.")
    parser.add_argument("--model", required=True)
    parser.add_argument("--input", required=True)
    parser.add_argument("--runtime-config", required=True)
    args = parser.parse_args()
    result = predict_npz(Path(args.model), Path(args.input), Path(args.runtime_config))
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
