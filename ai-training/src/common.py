from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any


AI_ROOT = Path(__file__).resolve().parents[1]
CONFIG_DIR = AI_ROOT / "configs"


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def resolve_data_root(explicit: str | None = None) -> Path:
    raw = explicit or os.getenv("SIGNBRIDGE_DATA_ROOT")
    if not raw:
        raise ValueError(
            "Veri dizini bulunamadı. --data-root kullanın veya SIGNBRIDGE_DATA_ROOT ayarlayın."
        )
    path = Path(raw).expanduser().resolve()
    if not path.is_dir():
        raise FileNotFoundError(f"Veri dizini bulunamadı: {path}")
    return path


def autsl_labels() -> list[dict[str, Any]]:
    labels = load_json(CONFIG_DIR / "labels.autsl20.json")["labels"]
    indexes = [item["index"] for item in labels]
    if indexes != list(range(len(labels))):
        raise ValueError("AUTSL model indeksleri 0'dan başlayan kesintisiz sırada olmalıdır.")
    return labels


MODEL_LABEL_FILES = {
    "autsl20-v1": "labels.autsl20.json",
    "signbridge30-v1": "labels.signbridge30.json",
    "signbridge34-v1": "labels.signbridge34.json",
    "signbridge71-v1": "labels.signbridge71.json",
}


def label_filename(vocabulary_version: str) -> str:
    filename = MODEL_LABEL_FILES.get(vocabulary_version)
    if filename is None:
        raise ValueError(f"Desteklenmeyen model sözlüğü: {vocabulary_version}")
    return filename


def label_config(vocabulary_version: str) -> dict[str, Any]:
    config = load_json(CONFIG_DIR / label_filename(vocabulary_version))
    if config.get("vocabularyVersion") != vocabulary_version:
        raise ValueError(f"Sözlük dosyası sürümü uyumsuz: {vocabulary_version}")
    labels = config.get("labels")
    if not isinstance(labels, list) or not labels:
        raise ValueError("Model etiket sözlüğü boş veya geçersiz.")
    indexes = [item.get("index") for item in labels]
    if indexes != list(range(len(labels))):
        raise ValueError("Model indeksleri 0'dan başlayan kesintisiz sırada olmalıdır.")
    class_ids = [item.get("classId") for item in labels]
    if any(not isinstance(item, str) or not item for item in class_ids) or len(set(class_ids)) != len(class_ids):
        raise ValueError("Model sınıf kimlikleri geçersiz veya tekrarlı.")
    return config


def model_labels(vocabulary_version: str) -> list[dict[str, Any]]:
    return label_config(vocabulary_version)["labels"]


def meb_labels() -> list[dict[str, Any]]:
    return load_json(CONFIG_DIR / "labels.meb16.json")["labels"]


def preprocessing_config() -> dict[str, Any]:
    return load_json(CONFIG_DIR / "preprocessing.json")
