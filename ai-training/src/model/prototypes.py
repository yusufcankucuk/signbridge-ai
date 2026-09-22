"""Belirti sınıfları için sınıf merkezi (prototip) skorlaması.

Neden: Belirti sınıfları kişi başına 1–3 videoya dayanır; son katman (softmax) bu az sayıda
kişiyi ezberler (eğitim doğruluğu %99,8). Modelin ara temsili (`encoder_bigru_64`) ise kişiden
bağımsız kalır. Her sınıfın **gerçek** (sentetik olmayan) eğitim örneklerinin ortalama temsili
alınıp birim uzunluğa getirilir; tahminde kamera kaydının temsili hangi merkeze daha yakınsa
(kosinüs) o sınıf seçilir.

Bağlamlı kliplerde ölçüm (eğitimde görülmeyen kişiler, 498 örnek):
softmax 305/498 (%61,2) → prototip 341/498 (%68,5); ilk üç öneri 402 → 416 (%83,5).
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

PROTOTYPE_LAYER = "encoder_bigru_64"
PROTOTYPE_VERSION = "class-centroid-v1"
# Kosinüs benzerliğini olasılığa çevirirken kullanılan sıcaklık; yalnız güven sayısını etkiler,
# sıralamayı değiştirmez.
DEFAULT_TEMPERATURE = 15.0


def embedding_model(model):
    import tensorflow as tf

    return tf.keras.Model(model.inputs, model.get_layer(PROTOTYPE_LAYER).output)


def _unit(vectors: np.ndarray) -> np.ndarray:
    norm = np.linalg.norm(vectors, axis=-1, keepdims=True)
    return vectors / np.maximum(norm, 1e-9)


def build_prototypes(model, features: np.ndarray, labels: np.ndarray,
                     class_ids: dict[int, str]) -> dict[str, list[float]]:
    """Her sınıf için birim uzunlukta merkez üretir (verilen örnekler zaten süzülmüş olmalıdır)."""
    if len(features) != len(labels):
        raise ValueError("Örnek ve etiket sayısı aynı olmalıdır.")
    embeddings = _unit(np.asarray(embedding_model(model).predict(features, verbose=0), dtype=np.float64))
    prototypes: dict[str, list[float]] = {}
    for index in sorted(set(int(value) for value in labels)):
        centre = embeddings[labels == index].mean(axis=0)
        if not np.isfinite(centre).all() or np.linalg.norm(centre) < 1e-6:
            continue
        prototypes[class_ids[index]] = [float(value) for value in _unit(centre)]
    return prototypes


def write_prototypes(path: Path, prototypes: dict[str, list[float]], *, model_version: str,
                     vocabulary_version: str) -> None:
    dimensions = {len(vector) for vector in prototypes.values()}
    if len(dimensions) != 1:
        raise ValueError("Prototip boyutları aynı olmalıdır.")
    path.write_text(json.dumps({
        "schemaVersion": "1.0",
        "prototypeVersion": PROTOTYPE_VERSION,
        "layer": PROTOTYPE_LAYER,
        "dimensions": dimensions.pop(),
        "temperature": DEFAULT_TEMPERATURE,
        "modelVersion": model_version,
        "vocabularyVersion": vocabulary_version,
        "classes": prototypes,
    }, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def load_prototypes(path: Path, *, model_version: str, vocabulary_version: str) -> dict[str, object]:
    bundle = json.loads(Path(path).read_text(encoding="utf-8"))
    if bundle.get("schemaVersion") != "1.0" or bundle.get("layer") != PROTOTYPE_LAYER:
        raise ValueError("Desteklenmeyen prototip dosyası.")
    if bundle.get("modelVersion") != model_version or bundle.get("vocabularyVersion") != vocabulary_version:
        raise ValueError("Prototip dosyası model paketiyle uyumsuz.")
    classes = bundle.get("classes")
    if not isinstance(classes, dict) or not classes:
        raise ValueError("Prototip dosyasında sınıf bulunamadı.")
    dimensions = int(bundle["dimensions"])
    for class_id, vector in classes.items():
        if not isinstance(vector, list) or len(vector) != dimensions:
            raise ValueError(f"Prototip vektörü geçersiz: {class_id}")
    temperature = float(bundle.get("temperature", DEFAULT_TEMPERATURE))
    if not np.isfinite(temperature) or temperature <= 0:
        raise ValueError("Prototip sıcaklığı geçersiz.")
    return {"classes": classes, "dimensions": dimensions, "temperature": temperature,
            "prototypeVersion": bundle.get("prototypeVersion", PROTOTYPE_VERSION)}


def prototype_probabilities(model, batch: np.ndarray, bundle: dict[str, object],
                            labels: list[dict[str, object]], indexes: list[int]) -> np.ndarray:
    """Verilen sınıf indeksleri üzerinde prototip kosinüslerinden olasılık üretir.

    `batch` tahmin girdisidir (ayna kopyası dahil olabilir); temsiller ortalanır.
    Dönen vektör yalnız `indexes` konumlarında doludur, diğerleri sıfırdır.
    """
    classes = bundle["classes"]
    usable = [index for index in indexes if labels[index]["classId"] in classes]
    if not usable:
        raise ValueError("Bağlamdaki hiçbir sınıfın prototipi yok.")
    embedding = _unit(np.asarray(embedding_model(model).predict(batch, verbose=0), dtype=np.float64))
    mean = _unit(embedding.mean(axis=0))
    matrix = np.asarray([classes[labels[index]["classId"]] for index in usable], dtype=np.float64)
    similarity = matrix @ mean
    scaled = np.exp((similarity - similarity.max()) * float(bundle["temperature"]))
    probabilities = np.zeros(len(labels), dtype=np.float64)
    probabilities[usable] = scaled / scaled.sum()
    return probabilities
