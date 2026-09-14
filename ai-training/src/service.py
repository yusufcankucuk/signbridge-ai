from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Optional

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, StrictInt

from src.common import CONFIG_DIR, load_json
from src.decision_policy import load_policy
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
    import tensorflow as tf

    model_path = Path(os.getenv("MODEL_PATH", "/models/saved_model"))
    runtime_path = Path(os.getenv("RUNTIME_CONFIG_PATH", "/models/runtime_config.json"))
    if not model_path.exists() or not runtime_path.is_file():
        raise RuntimeError(f"Model dosyaları bulunamadı: {model_path}, {runtime_path}")
    runtime = load_json(runtime_path)
    state["runtime"] = runtime
    state["model"] = tf.keras.models.load_model(str(model_path))
    label_path = Path(os.getenv("LABELS_PATH", str(CONFIG_DIR / "labels.autsl20.json")))
    label_config = load_json(label_path)
    if label_config["vocabularyVersion"] != runtime["vocabularyVersion"]:
        raise RuntimeError("Etiket sözlüğü sürümü uyumsuz.")
    state["labels"] = label_config["labels"]
    validate_bundle(state["model"], runtime, state["labels"])
    policy_value = os.getenv("DECISION_POLICY_PATH")
    state["decision_policy"] = load_policy(Path(policy_value) if policy_value else None, runtime)
    try:
        yield
    finally:
        state.clear()


app = FastAPI(title="SignBridge AI Inference", version="0.1.0", lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, object]:
    runtime = state.get("runtime")
    if "model" not in state or not runtime:
        raise HTTPException(status_code=503, detail="Model henüz hazır değil.")
    return {
        "status": "ok",
        "service": "signbridge-ai",
        "modelVersion": runtime["modelVersion"],
        "decisionPolicyVersion": state["decision_policy"]["decisionPolicyVersion"],
    }


@app.post("/predict")
def predict(request: PredictionRequest) -> dict[str, object]:
    runtime = state.get("runtime")
    model = state.get("model")
    if model is None or runtime is None:
        raise HTTPException(status_code=503, detail="Model henüz hazır değil.")
    if request.preprocessingVersion != runtime["preprocessingVersion"]:
        raise HTTPException(status_code=409, detail="Ön işleme sürümü modelle uyumlu değil.")

    try:
        landmarks = np.asarray(request.landmarks, dtype=np.float32)
        # Validate BEFORE narrowing: 256 must not wrap into uint8(0).
        mask = np.asarray(request.mask)
        sequence_to_features(landmarks, mask)
    except (ValueError, TypeError, OverflowError):
        raise HTTPException(status_code=422, detail="Geçersiz boyut/sayı veya boş/geçersiz mask.")
    return predict_landmarks(
        model,
        landmarks,
        mask.astype(np.uint8),
        runtime,
        state.get("labels"),
        state.get("decision_policy"),
    )
