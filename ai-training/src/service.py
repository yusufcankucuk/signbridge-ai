from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Optional

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict

from src.common import load_json
from src.model.predict import predict_landmarks


class PredictionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sessionId: Optional[str] = None
    preprocessingVersion: str
    landmarks: list[list[list[float]]]
    mask: list[list[int]]


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
    yield
    state.clear()


app = FastAPI(title="SignBridge AI Inference", version="0.1.0", lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, object]:
    runtime = state.get("runtime")
    if "model" not in state or not runtime:
        raise HTTPException(status_code=503, detail="Model henüz hazır değil.")
    return {"status": "ok", "service": "signbridge-ai", "modelVersion": runtime["modelVersion"]}


@app.post("/predict")
def predict(request: PredictionRequest) -> dict[str, object]:
    runtime = state.get("runtime")
    model = state.get("model")
    if model is None or runtime is None:
        raise HTTPException(status_code=503, detail="Model henüz hazır değil.")
    if request.preprocessingVersion != runtime["preprocessingVersion"]:
        raise HTTPException(status_code=409, detail="Ön işleme sürümü modelle uyumlu değil.")

    landmarks = np.asarray(request.landmarks, dtype=np.float32)
    mask = np.asarray(request.mask, dtype=np.uint8)
    if landmarks.shape != (60, 46, 2) or mask.shape != (60, 46):
        raise HTTPException(status_code=422, detail="Beklenen şekil landmarks=(60,46,2), mask=(60,46).")
    if not np.isfinite(landmarks).all() or not np.isin(mask, [0, 1]).all():
        raise HTTPException(status_code=422, detail="Landmark değerleri sonlu, mask değerleri 0 veya 1 olmalıdır.")
    return predict_landmarks(model, landmarks, mask, runtime)
