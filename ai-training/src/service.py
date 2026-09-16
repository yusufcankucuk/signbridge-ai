from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Optional

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, StrictInt

from src.common import CONFIG_DIR, load_json
from src.decision_policy import default_policy, load_policy
from src.model.predict import predict_landmarks, validate_bundle
from src.model.dataset import sequence_to_features


class PredictionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sessionId: Optional[str] = None
    preprocessingVersion: str
    landmarks: list[list[list[float]]]
    mask: list[list[StrictInt]]


state: dict[str, Any] = {}


@asynccontextmanager
async def lifespan(_app: FastAPI):
    model_path = Path(os.getenv("MODEL_PATH", "/models/saved_model"))
    runtime_path = Path(os.getenv("RUNTIME_CONFIG_PATH", "/models/runtime_config.json"))
    policy_value = os.getenv("DECISION_POLICY_PATH")
    allow_manual_only = os.getenv("ALLOW_MANUAL_ONLY", "false").lower() == "true"
    assets_available = model_path.exists() and runtime_path.is_file()
    fallback_runtime = Path(os.getenv("MANUAL_RUNTIME_CONFIG_PATH", str(CONFIG_DIR / "runtime.manual.json")))
    if not assets_available and not allow_manual_only:
        raise RuntimeError(
            "Tam AI modu için model dosyaları eksik: "
            f"{model_path}/saved_model.pb ve {runtime_path}. "
            "Kurulum için: node scripts/check-model-assets.mjs"
        )
    runtime = load_json(runtime_path if assets_available else fallback_runtime)
    state["runtime"] = runtime
    label_path = Path(os.getenv("LABELS_PATH", str(CONFIG_DIR / "labels.autsl20.json")))
    label_config = load_json(label_path)
    if label_config["vocabularyVersion"] != runtime["vocabularyVersion"]:
        raise RuntimeError("Etiket sözlüğü sürümü uyumsuz.")
    state["labels"] = label_config["labels"]
    requested_policy_path = Path(policy_value) if policy_value else None
    # A team camera policy is allowed only when the versioned model assets exist.
    # Missing assets must still produce a healthy manual-only service.
    policy_path = requested_policy_path if assets_available else CONFIG_DIR / "decision_policy.json"
    state["decision_policy"] = load_policy(policy_path, runtime)
    if assets_available:
        import tensorflow as tf

        state["model"] = tf.keras.models.load_model(str(model_path))
        validate_bundle(state["model"], runtime, state["labels"])
    elif state["decision_policy"].get("enabled", True):
        raise RuntimeError("Model olmadan yalnız enabled=false karar politikasıyla manual_only modu açılabilir.")
    if assets_available and state["decision_policy"].get("enabled", True):
        state["mode"] = "team_camera" if state["decision_policy"].get("experimental") is True else "camera_ai"
    else:
        state["mode"] = "manual_only"
    try:
        yield
    finally:
        state.clear()


app = FastAPI(title="SignBridge AI Inference", version="0.1.0", lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, object]:
    runtime = state.get("runtime")
    if not runtime or "decision_policy" not in state:
        raise HTTPException(status_code=503, detail="Servis henüz hazır değil.")
    return {
        "status": "ok",
        "service": "signbridge-ai",
        "mode": state.get("mode", "camera_ai"),
        "modelLoaded": "model" in state,
        "cameraAiEnabled": bool("model" in state and state["decision_policy"].get("enabled", True)),
        "modelVersion": runtime["modelVersion"],
        "decisionPolicyVersion": state["decision_policy"]["decisionPolicyVersion"],
        "experimental": state["decision_policy"].get("experimental") is True,
        "warning": state["decision_policy"].get("warning"),
    }


def _policy_disabled_response(runtime: dict[str, Any], policy: dict[str, Any]) -> dict[str, object]:
    return {
        "classId": None,
        "displayText": "Kamera tahmini güvenlik politikası nedeniyle kapalı. Listeden seçim yapın.",
        "confidence": None,
        "alternatives": [],
        "isLowConfidence": True,
        "predictionMode": "model",
        "modelVersion": runtime["modelVersion"],
        "preprocessingVersion": runtime["preprocessingVersion"],
        "vocabularyVersion": runtime["vocabularyVersion"],
        "decisionPolicyVersion": policy["decisionPolicyVersion"],
        "rejectionReason": "policy_disabled",
        "requiresConfirmation": False,
    }


@app.post("/predict")
def predict(request: PredictionRequest) -> dict[str, object]:
    runtime = state.get("runtime")
    model = state.get("model")
    if runtime is None:
        raise HTTPException(status_code=503, detail="Servis henüz hazır değil.")
    policy = state.get("decision_policy") or default_policy(runtime)
    if request.preprocessingVersion != runtime["preprocessingVersion"]:
        raise HTTPException(status_code=409, detail="Ön işleme sürümü modelle uyumlu değil.")

    try:
        landmarks = np.asarray(request.landmarks, dtype=np.float32)
        # Validate BEFORE narrowing: 256 must not wrap into uint8(0).
        mask = np.asarray(request.mask)
        sequence_to_features(landmarks, mask)
    except (ValueError, TypeError, OverflowError):
        raise HTTPException(status_code=422, detail="Geçersiz boyut/sayı veya boş/geçersiz mask.")
    if not policy.get("enabled", True):
        return _policy_disabled_response(runtime, policy)
    if model is None:
        raise HTTPException(status_code=503, detail="Tam AI modu için model dosyaları eksik.")
    return predict_landmarks(
        model,
        landmarks,
        mask.astype(np.uint8),
        runtime,
        state.get("labels"),
        policy,
    )
