"""AUTSL'nin 226 işaretinin tamamıyla kodlayıcı (encoder) ön eğitimi.

Birleşik model (20 AUTSL kelimesi + 14 belirti) şimdiye kadar yalnız 20 sınıflık AUTSL modelinden
başlıyordu. Belirti işaretleri az kişiden geldiği için modelin yeni kişilere genelleyebilmesi büyük
ölçüde kodlayıcının ne kadar "kişiden bağımsız" hareket/el biçimi öğrendiğine bağlıdır. AUTSL'de
43 işaretleyici ve ~28 bin eğitim örneği vardır; bu betik aynı BiGRU mimarisini (el biçimi
özellikleriyle, 60×222) tüm 226 sınıfta eğitir. Çıktı `train_unified --encoder-init` ile kullanılır.

Girdi: `src/data/pack_autsl226.py` ile üretilen parça dosyaları
(`<veri kökü>/processed/autsl226/shards/{train,val,test}_*.npz`) ve `<veri kökü>/AUTSL/*_labels.csv`.
AUTSL test kişileri ön eğitimde kullanılmaz; birleşik modelin AUTSL-20 test kapısı geçerli kalır.
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import random
from pathlib import Path

import numpy as np

from src.common import resolve_data_root, write_json
from src.model.dataset import BASE_FEATURES, HAND_LOCAL_TOTAL_FEATURES, sequence_to_features

CLASS_COUNT = 226
LABEL_FILES = {"train": "train_labels.csv", "val": "validation_labels.csv", "test": "test_labels.csv"}


def load_packed(data_root: Path, split: str, limit: int | None = None) -> tuple[np.ndarray, np.ndarray, list[str]]:
    """Parça dosyalarını okur. Bellek için yalnız 138 temel özellik (float16) tutulur;
    el biçimi özellikleri eğitimde TensorFlow içinde, ölçümde `with_hand_local` ile eklenir."""
    labels = {}
    with (data_root / "AUTSL" / LABEL_FILES[split]).open(encoding="utf-8-sig") as handle:
        for sample, class_id in csv.reader(handle):
            labels[sample] = int(class_id)
    shards = sorted((data_root / "processed" / "autsl226" / "shards").glob(f"{split}_*.npz"))
    total = 0
    for shard in shards:
        with np.load(shard) as data:
            total += len(data["sample_id"])
    features = np.zeros((min(total, limit or total), 60, BASE_FEATURES), dtype=np.float16)
    targets, ids, seen = [], [], set()
    for shard in shards:
        with np.load(shard) as data:
            for landmarks, mask, sample in zip(data["landmarks"], data["mask"], data["sample_id"]):
                sample = str(sample)
                if sample not in labels or sample in seen or not mask.any():
                    continue
                if len(ids) >= len(features):
                    break
                features[len(ids)] = sequence_to_features(landmarks.astype(np.float32), mask)
                targets.append(labels[sample])
                ids.append(sample)
                seen.add(sample)
    return features[:len(ids)], np.asarray(targets, dtype=np.int32), ids


def with_hand_local(features: np.ndarray) -> np.ndarray:
    """138 temel özellikten 222 özellik (ölçüm için, float32)."""
    out = np.zeros((len(features), 60, HAND_LOCAL_TOTAL_FEATURES), dtype=np.float32)
    for index, row in enumerate(features):
        sequence = row.astype(np.float32).reshape(60, 46, 3)
        out[index] = sequence_to_features(sequence[..., :2], (sequence[..., 2] > 0.5).astype(np.uint8),
                                          hand_local=True)
    return out


def _batches(features: np.ndarray, targets: np.ndarray, batch_size: int = 512):
    for start in range(0, len(features), batch_size):
        yield with_hand_local(features[start:start + batch_size]), targets[start:start + batch_size]


def main() -> None:
    parser = argparse.ArgumentParser(description="AUTSL-226 ile BiGRU kodlayıcı ön eğitimi (60×222).")
    parser.add_argument("--data-root")
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--epochs", type=int, default=30)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--learning-rate", type=float, default=1e-3)
    parser.add_argument("--patience", type=int, default=5)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--smoke", action="store_true", help="Az örnek, 1 epoch (ölçüm değildir)")
    args = parser.parse_args()

    import tensorflow as tf
    import src.train_unified as unified

    random.seed(args.seed)
    np.random.seed(args.seed)
    tf.random.set_seed(args.seed)
    os.environ["PYTHONHASHSEED"] = str(args.seed)
    unified.HAND_LOCAL = True

    data_root = resolve_data_root(args.data_root)
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    limit = 600 if args.smoke else None
    x_train, y_train, _ = load_packed(data_root, "train", limit)
    x_val, y_val, _ = load_packed(data_root, "val", limit)
    x_test, y_test, _ = load_packed(data_root, "test", limit)
    print(f"AUTSL-226: eğitim {len(y_train)}, doğrulama {len(y_val)}, test {len(y_test)}", flush=True)

    rng = np.random.default_rng(args.seed)

    def generate():
        # Veri kopyalanmaz; her epoch'ta yalnız sıra karıştırılır.
        for index in rng.permutation(len(y_train)):
            yield x_train[index], y_train[index]

    def to_example(features, label):
        # augment_feature ilk 138 özelliği kullanır ve el biçimi özelliklerini kendisi ekler.
        return unified.augment_feature(tf.cast(features, tf.float32), tf.one_hot(label, CLASS_COUNT))

    train = (tf.data.Dataset.from_generator(
                generate, output_signature=(tf.TensorSpec((60, BASE_FEATURES), tf.float16), tf.TensorSpec((), tf.int32)))
             .map(to_example, num_parallel_calls=tf.data.AUTOTUNE)
             .batch(args.batch_size).prefetch(4))
    x_val_full = with_hand_local(x_val)
    validation = (x_val_full, tf.one_hot(y_val, CLASS_COUNT).numpy())

    model = unified.build_model(CLASS_COUNT, unified.HAND_LOCAL_TOTAL_FEATURES)
    model._name = "signbridge_autsl226_bigru"
    model.compile(optimizer=tf.keras.optimizers.Adam(args.learning_rate),
                  loss=tf.keras.losses.CategoricalCrossentropy(label_smoothing=0.1), metrics=["accuracy"])
    best = output_dir / "autsl226-encoder.keras"
    history = model.fit(
        train, validation_data=validation, epochs=1 if args.smoke else args.epochs, verbose=2,
        callbacks=[
            tf.keras.callbacks.ModelCheckpoint(str(best), monitor="val_accuracy", save_best_only=True),
            tf.keras.callbacks.ReduceLROnPlateau(monitor="val_accuracy", factor=0.5, patience=2, min_lr=1e-5),
            tf.keras.callbacks.EarlyStopping(monitor="val_accuracy", patience=args.patience),
        ],
    )
    model = tf.keras.models.load_model(str(best))
    test_predictions = np.concatenate([model.predict(x, verbose=0).argmax(1) for x, _ in _batches(x_test, y_test)])
    test_accuracy = float((test_predictions == y_test).mean())
    val_accuracy = float((model.predict(x_val_full, verbose=0).argmax(1) == y_val).mean())
    model.save(str(output_dir / "saved_model"))
    metrics = {
        "modelVersion": "autsl226-bigru-encoder-v0.1.0",
        "featureLayout": "xy-mask-138+handlocal-84",
        "classCount": CLASS_COUNT,
        "trainSamples": int(len(y_train)), "validationSamples": int(len(y_val)), "testSamples": int(len(y_test)),
        "validationAccuracy": val_accuracy, "testAccuracy": test_accuracy,
        "epochsRun": len(history.history.get("loss", [])),
        "history": {k: [float(v) for v in values] for k, values in history.history.items()},
        "smokeOnly": bool(args.smoke),
        "note": "Yalnız kodlayıcı ön eğitimidir; uygulamada doğrudan kullanılmaz.",
    }
    write_json(output_dir / "metrics.json", metrics)
    print(json.dumps({k: v for k, v in metrics.items() if k != "history"}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
