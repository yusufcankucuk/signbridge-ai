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


def meb_labels() -> list[dict[str, Any]]:
    return load_json(CONFIG_DIR / "labels.meb16.json")["labels"]


def preprocessing_config() -> dict[str, Any]:
    return load_json(CONFIG_DIR / "preprocessing.json")
