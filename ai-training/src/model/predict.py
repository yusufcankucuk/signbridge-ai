from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

from src.common import autsl_labels, load_json
from src.model.dataset import sequence_to_features


def validate_bundle(model, runtime: dict[str, object], labels: list[dict[str, object]]) -> None:
    if [x["index"] for x in labels] != list(range(len(labels))):
        raise ValueError("Etiket indeks sırası geçersiz.")
    if len({x["classId"] for x in labels}) != len(labels):
        raise ValueError("Etiketler benzersiz olmalıdır.")
    if tuple(model.input_shape[1:]) != (60, 138) or model.output_shape[-1] != len(labels):
        raise ValueError("Model girdi/çıktı boyutu etiketlerle uyumsuz.")
    threshold = float(runtime["confidenceThreshold"])
    if not np.isfinite(threshold) or not 0 <= threshold <= 1:
        raise ValueError("Güven eşiği geçersiz.")
    if runtime["preprocessingVersion"] != "landmark46-v1" or runtime["vocabularyVersion"] != "autsl20-v1":
        raise ValueError("Desteklenmeyen paket sürümü.")
    if labels != autsl_labels():
        raise ValueError("Paket etiket sırası/sözlüğü mevcut model sözleşmesiyle uyumsuz.")


def predict_landmarks(
    model,
    landmarks: np.ndarray,
    mask: np.ndarray,
    runtime: dict[str, object],
    labels: list[dict[str, object]] | None = None,
) -> dict[str, object]:
    labels = autsl_labels() if labels is None else labels
    features = sequence_to_features(landmarks, mask)
    probabilities = model.predict(features[None, ...], verbose=0)[0]
    if probabilities.shape != (len(labels),) or not np.isfinite(probabilities).all():
        raise ValueError("Model geçersiz skor üretti.")
    if (probabilities < 0).any() or (probabilities > 1).any() or not np.isclose(probabilities.sum(), 1, atol=1e-4):
        raise ValueError("Model skoru olasılık vektörü değil.")
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
    labels = autsl_labels()
    validate_bundle(model, runtime, labels)
    return predict_landmarks(model, landmarks, mask, runtime, labels)


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
