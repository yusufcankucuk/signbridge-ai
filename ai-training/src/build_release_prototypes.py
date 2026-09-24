"""Eğitilmiş bir model paketine sınıf merkezi (prototip) dosyası ekler.

Eğitim sırasında `train_unified` prototipleri kendiliğinden yazar. Bu araç, daha önce eğitilmiş
bir paket için aynı dosyayı üretir: ağırlıklar değişmez, yalnız belirti bağlamındaki skorlama
katmanı eklenir. Eğitimde dışarıda bırakılan kaynaklar burada da dışarıda bırakılmalıdır.

Örnek:
    python -m src.build_release_prototypes --model-dir outputs/unified34 \
        --data-root "<veri kökü>" --extra-manifest manifests/external_health_training.csv \
        --extra-manifest manifests/synthetic_health_training.csv \
        --holdout-source ext_spreadthesign --holdout-source ext_tidsozluk
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np

from src.common import AI_ROOT, label_config, load_json, resolve_data_root
from src.model.dataset import load_split
from src.model.prototypes import build_prototypes, write_prototypes


def health_pool(manifest_dir: Path, data_root: Path, extra: list[str], holdout: set[str],
                with_autsl: bool = True):
    """Eğitimdeki havuzun aynısı: AUTSL-20 + MEB + ek manifestler, dışarıda bırakılanlar çıkarılır."""
    parts = []
    if with_autsl:
        parts.append(load_split(manifest_dir / "autsl20_train.csv", data_root, hand_local=True))
    parts.append(load_split(manifest_dir / "meb_health11_training.csv", data_root,
                            allowed_quality_statuses=("approved", "needs_review"), hand_local=True))
    parts += [load_split(Path(item).resolve(), data_root,
                         allowed_quality_statuses=("approved", "needs_review"), hand_local=True)
              for item in extra]
    features = np.concatenate([part[0] for part in parts])
    labels = np.concatenate([part[1] for part in parts])
    rows = [row for part in parts for row in part[2]]
    unknown = holdout - {row.get("signer_id", "") for row in rows}
    if unknown:
        raise ValueError(f"Manifestlerde bulunmayan --holdout-source: {sorted(unknown)}")
    # Yalnız gerçek (türetilmemiş) ve dışarıda bırakılmamış örnekler merkez hesabına girer.
    keep = np.asarray([
        row.get("signer_id", "") not in holdout
        and row.get("source") not in {"SYNTHETIC", "RECORDING_SIM"}
        for row in rows
    ], dtype=bool)
    if not keep.any():
        raise ValueError("Merkez hesabı için örnek kalmadı.")
    return features[keep], labels[keep]


def main() -> None:
    parser = argparse.ArgumentParser(description="Model paketine prototypes.json ekler.")
    parser.add_argument("--model-dir", required=True, help="saved_model ve runtime_config.json içeren klasör")
    parser.add_argument("--data-root")
    parser.add_argument("--manifest-dir", default=str(AI_ROOT / "manifests"))
    parser.add_argument("--extra-manifest", action="append", default=[])
    parser.add_argument("--holdout-source", action="append", default=[])
    parser.add_argument("--model-version", help="runtime_config.json yerine kullanılacak sürüm adı")
    args = parser.parse_args()

    import tensorflow as tf

    model_dir = Path(args.model_dir).resolve()
    runtime = load_json(model_dir / "runtime_config.json")
    model_version = args.model_version or str(runtime["modelVersion"])
    vocabulary = str(runtime["vocabularyVersion"])
    labels = label_config(vocabulary)["labels"]
    features, indexes = health_pool(Path(args.manifest_dir).resolve(), resolve_data_root(args.data_root),
                                    args.extra_manifest, set(args.holdout_source))
    model = tf.keras.models.load_model(str(model_dir / "saved_model"))
    prototypes = build_prototypes(model, features, indexes,
                                  {int(item["index"]): str(item["classId"]) for item in labels})
    write_prototypes(model_dir / "prototypes.json", prototypes, model_version=model_version,
                     vocabulary_version=vocabulary)
    print(f"{len(prototypes)} sınıf merkezi yazıldı: {model_dir / 'prototypes.json'} ({len(features)} örnek)")


if __name__ == "__main__":
    main()
