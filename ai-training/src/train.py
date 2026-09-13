from __future__ import annotations

import argparse
import json
import os
import random
from pathlib import Path

import numpy as np

from src.common import AI_ROOT, autsl_labels, resolve_data_root, write_json
from src.model.dataset import load_split


MODEL_VERSION = "autsl20-bigru-v0.1.0"


def build_model():
    import tensorflow as tf

    return tf.keras.Sequential(
        [
            tf.keras.layers.Input(shape=(60, 138)),
            tf.keras.layers.Masking(mask_value=0.0),
            tf.keras.layers.Bidirectional(tf.keras.layers.GRU(128, return_sequences=True)),
            tf.keras.layers.Dropout(0.30),
            tf.keras.layers.Bidirectional(tf.keras.layers.GRU(64)),
            tf.keras.layers.Dense(64, activation="relu"),
            tf.keras.layers.Dense(20, activation="softmax"),
        ],
        name="signbridge_autsl20_bigru",
    )


def augment_sample(features, label):
    """Küçük kamera/algılama farklarını taklit eder; yatay çevirme yapmaz."""
    import tensorflow as tf

    sequence = tf.reshape(features, (60, 46, 3))
    coordinates = sequence[..., :2]
    mask = sequence[..., 2:3]

    # Omuz ölçeğiyle normalize edilmiş koordinatlarda küçük zoom ve sensör gürültüsü.
    scale = tf.random.uniform((), 0.95, 1.05)
    jitter = tf.random.normal(tf.shape(coordinates), stddev=0.01)
    coordinates = (coordinates * scale + jitter) * mask

    # Landmark ve kare düşürme MediaPipe'ın kısa süreli kaçırmalarını simüle eder.
    landmark_keep = tf.cast(tf.random.uniform((1, 46, 1)) >= 0.03, tf.float32)
    frame_keep = tf.cast(tf.random.uniform((60, 1, 1)) >= 0.02, tf.float32)
    augmented_mask = mask * landmark_keep * frame_keep
    coordinates *= augmented_mask
    return tf.reshape(tf.concat([coordinates, augmented_mask], axis=-1), (60, 138)), label


def choose_threshold(probabilities: np.ndarray, labels: np.ndarray) -> dict[str, float]:
    predictions = probabilities.argmax(axis=1)
    confidences = probabilities.max(axis=1)
    candidates: list[dict[str, float]] = []
    for threshold in np.arange(0.50, 0.951, 0.05):
        accepted = confidences >= threshold
        coverage = float(accepted.mean())
        precision = float((predictions[accepted] == labels[accepted]).mean()) if accepted.any() else 0.0
        candidates.append({"threshold": round(float(threshold), 2), "precision": precision, "coverage": coverage})
    valid = [item for item in candidates if item["precision"] >= 0.90 and item["coverage"] >= 0.20]
    selected = valid[0] if valid else min(candidates, key=lambda item: abs(item["threshold"] - 0.80))
    return {**selected, "targetPrecision": 0.90, "minimumCoverage": 0.20}


def _plot_history(history: dict[str, list[float]], output_path: Path) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    figure, axes = plt.subplots(1, 2, figsize=(11, 4))
    axes[0].plot(history.get("loss", []), label="train")
    axes[0].plot(history.get("val_loss", []), label="validation")
    axes[0].set_title("Loss")
    axes[0].legend()
    axes[1].plot(history.get("accuracy", []), label="train")
    axes[1].plot(history.get("val_accuracy", []), label="validation")
    axes[1].set_title("Accuracy")
    axes[1].legend()
    figure.tight_layout()
    figure.savefig(output_path, dpi=160)
    plt.close(figure)


def _plot_confusion(matrix: np.ndarray, names: list[str], output_path: Path) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import seaborn as sns

    figure, axis = plt.subplots(figsize=(14, 12))
    sns.heatmap(matrix, cmap="Blues", xticklabels=names, yticklabels=names, ax=axis)
    axis.set_xlabel("Tahmin")
    axis.set_ylabel("Gerçek")
    figure.tight_layout()
    figure.savefig(output_path, dpi=160)
    plt.close(figure)


def _write_model_card(output_path: Path, metrics: dict[str, object], names: list[str]) -> None:
    content = f"""# SignBridge AUTSL-20 model kartı

## Model

- Sürüm: `{metrics['modelVersion']}`
- Mimari: iki katmanlı çift yönlü GRU (BiGRU)
- Girdi: 60 kare × 46 landmark × (x, y, görünürlük maskesi)
- Çıktı: {len(names)} izole Türk İşaret Dili sınıfı
- Sınıflar: {', '.join(names)}

## Veri ve değerlendirme

- Eğitim: AUTSL/OpenHands poz verisi, kişi çakışması olmayan resmî train/validation/test bölümleri
- Eğitim örneği: {metrics['trainSamples']}
- Doğrulama örneği: {metrics['validationSamples']}
- Test örneği: {metrics['testSamples']}
- Test doğruluğu: {metrics['testAccuracy']:.4f}
- Test macro-F1: {metrics['testMacroF1']:.4f}
- Güven eşiği: {metrics['confidenceGate']['threshold']:.2f}
- Eşik üstü test doğruluğu: {metrics['testAcceptedPrecision']:.4f}
- Eşik üstü test kapsamı: {metrics['testAcceptedCoverage']:.4f}

## Amaçlanan kullanım

Bu model SignBridge öğrenci MVP'sinde, tek bir izole işaret için öneri üretmek amacıyla kullanılır.
Sonuç hastaya gösterilir ve hasta onaylamadan sağlık çalışanına kesin ifade olarak aktarılmaz.

## Sınırlar ve güvenlik

- Model kesintisiz işaret dili cümlelerini veya tıbbi tanıyı çözmez.
- AUTSL kontrollü çekimlerden oluştuğu için gerçek klinik ışık, açı, kıyafet ve kamera farklarında başarım düşebilir.
- MEB sağlık videoları bu sürümde yalnızca doğrulanmış sözlük/referans ve manuel seçim kaynağıdır; tek örnek oldukları için eğitime katılmaz.
- Güven eşiğinin altındaki sonuçlarda sistem tahmin yürütmez; yeniden deneme veya manuel seçim ister.
- Acil/riskli ifadelerde ayrıca kullanıcı onayı gerekir. Sistem acil servis veya profesyonel tercüman yerine geçmez.
"""
    output_path.write_text(content, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="SignBridge AUTSL-20 BiGRU baseline modelini eğitir.")
    parser.add_argument("--data-root")
    parser.add_argument("--data_url", dest="data_url", help="ModelArts uyumlu veri girdi yolu")
    parser.add_argument("--manifest-dir")
    parser.add_argument("--output-dir")
    parser.add_argument("--train_url", dest="train_url", help="ModelArts uyumlu eğitim çıktı yolu")
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--learning-rate", type=float, default=0.001)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--no-augmentation", action="store_true")
    parser.add_argument("--smoke", action="store_true", help="1 epoch, <=2 examples/class; NO test-set evaluation")
    args, _unknown = parser.parse_known_args()

    import pandas as pd
    import tensorflow as tf
    from sklearn.metrics import classification_report, confusion_matrix, f1_score

    random.seed(args.seed)
    np.random.seed(args.seed)
    tf.random.set_seed(args.seed)
    os.environ["PYTHONHASHSEED"] = str(args.seed)

    data_root = resolve_data_root(args.data_root or args.data_url)
    manifest_dir = Path(args.manifest_dir).resolve() if args.manifest_dir else AI_ROOT / "manifests"
    output_dir = Path(args.output_dir or args.train_url or (AI_ROOT / "outputs")).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    x_train, y_train, _ = load_split(manifest_dir / "autsl20_train.csv", data_root)
    x_val, y_val, _ = load_split(manifest_dir / "autsl20_validation.csv", data_root)
    if args.smoke:
        def small(x, y):
            indices = np.concatenate([np.flatnonzero(y == label)[:2] for label in np.unique(y)])
            return x[indices], y[indices]
        x_train, y_train = small(x_train, y_train)
        x_val, y_val = small(x_val, y_val)
        args.epochs = 1
    else:
        x_test, y_test, _ = load_split(manifest_dir / "autsl20_test.csv", data_root)

    model = build_model()
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=args.learning_rate),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )
    best_model_path = output_dir / f"{MODEL_VERSION}.keras"
    callbacks = [
        tf.keras.callbacks.EarlyStopping(monitor="val_loss", patience=7, restore_best_weights=True),
        tf.keras.callbacks.ModelCheckpoint(str(best_model_path), monitor="val_loss", save_best_only=True),
    ]
    train_data = tf.data.Dataset.from_tensor_slices((x_train, y_train))
    train_data = train_data.shuffle(len(x_train), seed=args.seed, reshuffle_each_iteration=True)
    if not args.no_augmentation:
        train_data = train_data.map(augment_sample, num_parallel_calls=tf.data.AUTOTUNE)
    train_data = train_data.batch(args.batch_size).prefetch(tf.data.AUTOTUNE)

    history = model.fit(
        train_data,
        validation_data=(x_val, y_val),
        epochs=args.epochs,
        callbacks=callbacks,
        verbose=2,
    )
    model = tf.keras.models.load_model(str(best_model_path))
    if args.smoke:
        model.save(str(output_dir / "saved_model"))
        reloaded = tf.keras.models.load_model(str(output_dir / "saved_model"))
        before = model.predict(x_val[:1], verbose=0)
        after = reloaded.predict(x_val[:1], verbose=0)
        np.testing.assert_allclose(before, after, atol=1e-6)
        write_json(output_dir / "smoke_result.json", {
            "smokeOnly": True, "epochs": 1, "trainSamples": len(x_train), "validationSamples": len(x_val),
            "testAccessed": False, "reloadParity": True, "tensorflow": tf.__version__,
            "notABenchmark": True,
        })
        return
    val_probabilities = model.predict(x_val, verbose=0)
    test_probabilities = model.predict(x_test, verbose=0)
    test_predictions = test_probabilities.argmax(axis=1)
    threshold = choose_threshold(val_probabilities, y_val)
    names = [item["classId"] for item in autsl_labels()]
    report = classification_report(
        y_test,
        test_predictions,
        labels=list(range(len(names))),
        target_names=names,
        output_dict=True,
        zero_division=0,
    )
    matrix = confusion_matrix(y_test, test_predictions, labels=list(range(len(names))))
    accepted = test_probabilities.max(axis=1) >= threshold["threshold"]
    accepted_precision = float((test_predictions[accepted] == y_test[accepted]).mean()) if accepted.any() else 0.0
    metrics = {
        "modelVersion": MODEL_VERSION,
        "seed": args.seed,
        "trainSamples": int(len(x_train)),
        "validationSamples": int(len(x_val)),
        "testSamples": int(len(x_test)),
        "testAccuracy": float((test_predictions == y_test).mean()),
        "testMacroF1": float(f1_score(y_test, test_predictions, average="macro")),
        "confidenceGate": threshold,
        "testAcceptedPrecision": accepted_precision,
        "testAcceptedCoverage": float(accepted.mean()),
        "augmentationEnabled": not args.no_augmentation,
    }
    write_json(output_dir / "metrics.json", metrics)
    pd.DataFrame(report).transpose().to_csv(output_dir / "classification_report.csv", encoding="utf-8-sig")
    _plot_history(history.history, output_dir / "training_history.png")
    _plot_confusion(matrix, names, output_dir / "confusion_matrix.png")
    write_json(
        output_dir / "runtime_config.json",
        {
            "modelVersion": MODEL_VERSION,
            "preprocessingVersion": "landmark46-v1",
            "vocabularyVersion": "autsl20-v1",
            "confidenceThreshold": threshold["threshold"],
        },
    )
    _write_model_card(output_dir / "model_card.md", metrics, names)
    model.save(str(output_dir / "saved_model"))
    print(json.dumps(metrics, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
