from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

from src.common import label_config, load_json, model_labels
from src.decision_policy import decide, default_policy, load_policy, validate_policy
from src.model.dataset import BASE_FEATURES, HAND_LOCAL_TOTAL_FEATURES, features_for_model, mirror_landmarks


def validate_bundle(model, runtime: dict[str, object], labels: list[dict[str, object]]) -> None:
    if [x["index"] for x in labels] != list(range(len(labels))):
        raise ValueError("Etiket indeks sırası geçersiz.")
    if len({x["classId"] for x in labels}) != len(labels):
        raise ValueError("Etiketler benzersiz olmalıdır.")
    if tuple(model.input_shape[1:]) not in {(60, BASE_FEATURES), (60, HAND_LOCAL_TOTAL_FEATURES)} \
            or model.output_shape[-1] != len(labels):
        raise ValueError("Model girdi/çıktı boyutu etiketlerle uyumsuz.")
    threshold = float(runtime["confidenceThreshold"])
    if not np.isfinite(threshold) or not 0 <= threshold <= 1:
        raise ValueError("Güven eşiği geçersiz.")
    if runtime["preprocessingVersion"] != "landmark46-v1":
        raise ValueError("Desteklenmeyen paket sürümü.")
    if labels != model_labels(str(runtime["vocabularyVersion"])):
        raise ValueError("Paket etiket sırası/sözlüğü mevcut model sözleşmesiyle uyumsuz.")


def predict_landmarks(
    model,
    landmarks: np.ndarray,
    mask: np.ndarray,
    runtime: dict[str, object],
    labels: list[dict[str, object]] | None = None,
    decision_policy: dict[str, object] | None = None,
    recognition_context: str = "general",
) -> dict[str, object]:
    labels = model_labels(str(runtime["vocabularyVersion"])) if labels is None else labels
    if recognition_context not in {"general", "symptom"}:
        raise ValueError("Tanıma bağlamı general veya symptom olmalıdır.")
    batch = [features_for_model(model, landmarks, mask)]
    if runtime.get("testTimeMirror") is True:
        # Sağ/sol el farkına karşı: ayna görüntünün olasılıklarıyla ortalama alınır.
        batch.append(features_for_model(model, *mirror_landmarks(landmarks, mask)))
    probabilities = np.asarray(model.predict(np.stack(batch), verbose=0), dtype=np.float64).mean(axis=0)
    if probabilities.shape != (len(labels),) or not np.isfinite(probabilities).all():
        raise ValueError("Model geçersiz skor üretti.")
    if (probabilities < 0).any() or (probabilities > 1).any() or not np.isclose(probabilities.sum(), 1, atol=1e-4):
        raise ValueError("Model skoru olasılık vektörü değil.")
    config = label_config(str(runtime["vocabularyVersion"]))
    context_key = "symptomClassIds" if recognition_context == "symptom" else "generalClassIds"
    configured_ids = config.get(context_key)
    allowed_ids = set(configured_ids if isinstance(configured_ids, list) else [item["classId"] for item in labels])
    context_indexes = [index for index, item in enumerate(labels) if item["classId"] in allowed_ids]
    if not context_indexes:
        raise ValueError("Tanıma bağlamında kullanılabilir sınıf bulunamadı.")
    context_scores = np.full_like(probabilities, -1.0)
    context_scores[context_indexes] = probabilities[context_indexes]
    ordered = np.asarray(context_indexes, dtype=np.int64)[
        np.argsort(probabilities[context_indexes])[::-1]
    ]
    policy = default_policy(runtime) if decision_policy is None else validate_policy(decision_policy, runtime)
    winner_index = int(ordered[0])
    decision = decide(context_scores, policy, str(labels[winner_index]["classId"]))
    winner = decision.winner_index
    forced_candidate = bool(
        not decision.accepted
        and recognition_context == "symptom"
        and policy.get("experimental") is True
        and decision.rejection_reason in {"low_score", "ambiguous_prediction"}
    )
    has_candidate = decision.accepted or forced_candidate
    low_confidence = not decision.accepted
    label = labels[winner]
    expression_id = (
        label.get("symptomExpressionId", label["classId"])
        if recognition_context == "symptom"
        else label["classId"]
    )
    display_text = (
        label.get("symptomDisplayText", label["displayText"])
        if recognition_context == "symptom"
        else label["displayText"]
    )
    return {
        "classId": label["classId"] if has_candidate else None,
        "expressionId": expression_id if has_candidate else None,
        "displayText": display_text if has_candidate else "İşaret kesin olarak anlaşılamadı.",
        "confidence": round(decision.confidence, 6),
        "alternatives": [labels[int(index)]["classId"] for index in ordered[:3]],
        "isLowConfidence": low_confidence,
        "forcedCandidate": forced_candidate,
        "experimental": policy.get("experimental") is True,
        "recognitionContext": recognition_context,
        "predictionMode": "model",
        "modelVersion": runtime["modelVersion"],
        "preprocessingVersion": runtime["preprocessingVersion"],
        "vocabularyVersion": runtime["vocabularyVersion"],
        "decisionPolicyVersion": policy["decisionPolicyVersion"],
        "rejectionReason": decision.rejection_reason if not decision.accepted else None,
        "requiresConfirmation": has_candidate,
    }


def predict_npz(
    model_path: Path,
    input_path: Path,
    runtime_config_path: Path,
    decision_policy_path: Path | None = None,
) -> dict[str, object]:
    import tensorflow as tf

    runtime = load_json(runtime_config_path)
    with np.load(input_path, allow_pickle=False) as data:
        landmarks = data["landmarks"]
        mask = data["mask"]
    model = tf.keras.models.load_model(str(model_path))
    labels = model_labels(str(runtime["vocabularyVersion"]))
    validate_bundle(model, runtime, labels)
    policy = load_policy(decision_policy_path, runtime)
    return predict_landmarks(model, landmarks, mask, runtime, labels, policy)


def main() -> None:
    parser = argparse.ArgumentParser(description="Eğitilmiş SignBridge modelinden JSON tahmini alır.")
    parser.add_argument("--model", required=True)
    parser.add_argument("--input", required=True)
    parser.add_argument("--runtime-config", required=True)
    parser.add_argument("--decision-policy")
    args = parser.parse_args()
    result = predict_npz(
        Path(args.model),
        Path(args.input),
        Path(args.runtime_config),
        Path(args.decision_policy) if args.decision_policy else None,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
