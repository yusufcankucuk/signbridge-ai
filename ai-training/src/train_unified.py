"""AUTSL-20 BiGRU modelini MEB sağlık belirtileriyle 30 çıkışa genişletir.

- İlk 20 sınıfın indeksleri ve çıkış ağırlıkları korunur, 10 yeni sınıf sona eklenir.
- Önce yalnız çıkış katmanı (≤10 epoch, 1e-3), sonra son BiGRU + Dense-64 + çıkış (≤30 epoch, 1e-4).
- AUTSL eğitim verisi eğitimde kalır; eski model ilk 20 çıktı için öğretmen olarak kullanılır.
- MEB örnekleri sınıf dengeli ve güvenli artırımlarla (zaman %80–120, kaydırma, gürültü, ölçek,
  kare/landmark düşürme) çevrim içi çoğaltılır; çevirme/döndürme/MixUp yoktur.
- MEB manifesti aynı videoların eski Holistic ve canlı kameradaki MediaPipe Tasks görünümlerini
  içerebilir; hepsi aynı tek referansın türevidir.
- Birden çok tohum çalıştırılır; en iyi model AUTSL doğrulama doğruluğuna göre seçilir.
- Eski model ve eski metriklerin üzerine yazılmaz; çıktı klasörü boş olmalıdır.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import os
import random
import shutil
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from src.common import AI_ROOT, CONFIG_DIR, label_config, label_filename, resolve_data_root, write_json
from src.model.dataset import BASE_FEATURES, HAND_LOCAL_TOTAL_FEATURES, load_split


MODEL_VERSION = "signbridge-unified30-bigru-v0.2.0"
VOCABULARY_VERSION = "signbridge30-v1"
BASE_VOCABULARY_VERSION = "autsl20-v1"
OLD_CLASS_COUNT = 20
DEFAULT_MEB_AUGMENTATIONS_PER_CLASS = 80
DEFAULT_SEEDS = "42,123,2026"
MAX_AUTSL_ACCURACY_DROP = 0.03
POLICY_FILE = "decision_policy.unified30-team-camera.json"
LABELS_FILE = "labels.signbridge30.json"
# El biçimi özellikleri (el bileğine göre, el boyuyla ölçekli 84 ek değer) açıksa girdi 222 olur.
HAND_LOCAL = False
# Sözlük → (model sürümü, politika dosyası, beklenen sınıf sayısı)
VARIANTS = {
    "signbridge30-v1": ("signbridge-unified30-bigru-v0.2.0", "decision_policy.unified30-team-camera.json", 30),
    "signbridge34-v1": ("signbridge-unified34-bigru-v0.3.0", "decision_policy.unified34-team-camera.json", 34),
}


def select_variant(vocabulary: str) -> int:
    """Rapor ve paket adlarını seçilen sözlüğe göre ayarlar; beklenen sınıf sayısını döndürür."""
    global MODEL_VERSION, VOCABULARY_VERSION, POLICY_FILE, LABELS_FILE
    if vocabulary not in VARIANTS:
        raise ValueError(f"Desteklenmeyen birleşik sözlük: {vocabulary}")
    MODEL_VERSION, POLICY_FILE, class_count = VARIANTS[vocabulary]
    VOCABULARY_VERSION = vocabulary
    LABELS_FILE = label_filename(vocabulary)
    return class_count


def input_width() -> int:
    return HAND_LOCAL_TOTAL_FEATURES if HAND_LOCAL else BASE_FEATURES


def build_model(class_count: int, width: int | None = None):
    import tensorflow as tf

    return tf.keras.Sequential(
        [
            tf.keras.layers.Input(shape=(60, width or input_width())),
            tf.keras.layers.Masking(mask_value=0.0, name="landmark_masking"),
            tf.keras.layers.Bidirectional(
                tf.keras.layers.GRU(128, return_sequences=True), name="encoder_bigru_128"
            ),
            tf.keras.layers.Dropout(0.30, name="encoder_dropout"),
            tf.keras.layers.Bidirectional(tf.keras.layers.GRU(64), name="encoder_bigru_64"),
            tf.keras.layers.Dense(64, activation="relu", name="embedding_64"),
            tf.keras.layers.Dense(class_count, activation="softmax", name="class_probabilities"),
        ],
        name="signbridge_unified30_bigru",
    )


def initialize_from_autsl20(teacher, student) -> None:
    if teacher.output_shape[-1] != OLD_CLASS_COUNT:
        raise ValueError("Başlangıç modeli 20 AUTSL çıktılı olmalıdır.")
    if tuple(teacher.input_shape[1:]) != (60, BASE_FEATURES) or student.input_shape[1] != 60:
        raise ValueError("Başlangıç modeli girdi biçimi birleşik modelle uyumsuz.")
    if len(teacher.layers) != len(student.layers):
        raise ValueError("Başlangıç modeli beklenen BiGRU mimarisiyle uyumsuz.")

    extra = int(student.input_shape[-1]) - BASE_FEATURES
    for source, destination in zip(teacher.layers[:-1], student.layers[:-1]):
        weights = source.get_weights()
        targets = destination.get_weights()
        if extra and weights and [w.shape for w in weights] != [w.shape for w in targets]:
            # İlk BiGRU: ek el biçimi girdilerinin ağırlıkları sıfırla başlar; model başlangıçta
            # AUTSL-20 modeliyle aynı davranır, ek bilgiyi ince ayarda öğrenir.
            padded = []
            for weight, target in zip(weights, targets):
                if weight.shape == target.shape:
                    padded.append(weight)
                else:
                    grown = np.zeros(target.shape, dtype=weight.dtype)
                    grown[:weight.shape[0], ...] = weight
                    padded.append(grown)
            weights = padded
        destination.set_weights(weights)

    source_kernel, source_bias = teacher.layers[-1].get_weights()
    destination_kernel, destination_bias = student.layers[-1].get_weights()
    destination_kernel[:, :OLD_CLASS_COUNT] = source_kernel
    destination_bias[:OLD_CLASS_COUNT] = source_bias
    student.layers[-1].set_weights([destination_kernel, destination_bias])


def _time_warp(coordinates, mask):
    """Hızı %80–120 arasında değiştirir ve başlangıç/bitişi küçükçe kaydırır."""
    import tensorflow as tf

    factor = tf.random.uniform((), 0.8, 1.2)
    new_length = tf.clip_by_value(tf.cast(tf.round(60.0 * factor), tf.int32), 48, 72)
    coordinates = tf.image.resize(coordinates, (new_length, 46), method="bilinear")
    mask = tf.image.resize(mask, (new_length, 46), method="nearest")

    def crop():
        offset = tf.random.uniform((), 0, new_length - 60 + 1, dtype=tf.int32)
        return coordinates[offset : offset + 60], mask[offset : offset + 60]

    def pad():
        total = 60 - new_length
        before = tf.random.uniform((), 0, total + 1, dtype=tf.int32)
        paddings = [[before, total - before], [0, 0], [0, 0]]
        return (
            tf.pad(coordinates, paddings, mode="SYMMETRIC"),
            tf.pad(mask, paddings, mode="SYMMETRIC"),
        )

    coordinates, mask = tf.cond(new_length >= 60, crop, pad)
    return tf.ensure_shape(coordinates, (60, 46, 2)), tf.ensure_shape(mask, (60, 46, 1))


MIRROR_ORDER = [1, 0, 3, 2, *range(25, 46), *range(4, 25)]


def augment_feature(features, target):
    """Sağlık örneklerini kişi/kamera farklarına karşı çeşitlendirir.

    Hız (%80–120), ölçek, küçük döndürme ve kaydırma, ele özgü küçük konum kayması, gürültü,
    kare/landmark düşürme ve %30 olasılıkla ayna (solak işaretleyici: eller ve omuzlar yer değiştirir).
    """
    import tensorflow as tf

    sequence = tf.reshape(features[:, :BASE_FEATURES], (60, 46, 3))
    coordinates, mask = _time_warp(sequence[..., :2], sequence[..., 2:3])
    mirror = tf.random.uniform(()) < 0.3
    mirrored_coordinates = tf.gather(coordinates, MIRROR_ORDER, axis=1) * tf.constant([-1.0, 1.0])
    mirrored_mask = tf.gather(mask, MIRROR_ORDER, axis=1)
    coordinates = tf.where(mirror, mirrored_coordinates, coordinates)
    mask = tf.where(mirror, mirrored_mask, mask)
    angle = tf.random.uniform((), -0.14, 0.14)
    rotation = tf.stack([[tf.cos(angle), -tf.sin(angle)], [tf.sin(angle), tf.cos(angle)]])
    coordinates = tf.einsum("tlc,dc->tld", coordinates, rotation)
    scale = tf.random.uniform((), 0.9, 1.1)
    offset = tf.random.uniform((1, 1, 2), -0.08, 0.08)
    hand_offset = tf.concat([
        tf.zeros((1, 4, 2)),
        tf.tile(tf.random.uniform((1, 1, 2), -0.06, 0.06), (1, 21, 1)),
        tf.tile(tf.random.uniform((1, 1, 2), -0.06, 0.06), (1, 21, 1)),
    ], axis=1)
    jitter = tf.random.normal(tf.shape(coordinates), stddev=0.01)
    landmark_keep = tf.cast(tf.random.uniform((1, 46, 1)) >= tf.random.uniform((), 0.0, 0.03), tf.float32)
    frame_keep = tf.cast(tf.random.uniform((60, 1, 1)) >= tf.random.uniform((), 0.0, 0.05), tf.float32)
    mask = tf.cast(mask >= 0.5, tf.float32) * landmark_keep * frame_keep
    coordinates = (coordinates * scale + offset + hand_offset + jitter) * mask
    output = tf.reshape(tf.concat([coordinates, mask], axis=-1), (60, BASE_FEATURES))
    if HAND_LOCAL:
        output = tf.concat([output, _tf_hand_local(coordinates, mask[..., 0])], axis=-1)
    return output, target


def _tf_hand_local(coordinates, mask):
    """`src.model.dataset.hand_local_features` ile aynı hesap (TensorFlow)."""
    import tensorflow as tf

    parts = []
    for start, end in ((4, 25), (25, 46)):
        points = coordinates[:, start:end, :]
        visible = mask[:, start:end] > 0.5
        relative = points - points[:, :1, :]
        size = tf.norm(relative[:, 9, :], axis=-1)
        valid = (visible[:, 0] & visible[:, 9]
                 & (tf.reduce_sum(tf.cast(visible, tf.int32), axis=1) >= 15) & (size > 1e-4))
        safe = tf.where(valid, size, tf.ones_like(size))
        local = relative / safe[:, None, None] * 0.5
        keep = tf.cast(valid[:, None] & visible, tf.float32)[..., None]
        parts.append(local * keep)
    return tf.reshape(tf.concat(parts, axis=1), (60, 84))


def _distillation_targets(teacher_probabilities: np.ndarray, labels: np.ndarray, class_count: int) -> np.ndarray:
    one_hot = np.eye(class_count, dtype=np.float32)[labels]
    teacher_padded = np.zeros_like(one_hot)
    teacher_padded[:, :OLD_CLASS_COUNT] = teacher_probabilities
    return (0.5 * one_hot + 0.5 * teacher_padded).astype(np.float32)


def context_predictions(probabilities: np.ndarray, indexes: list[int]) -> np.ndarray:
    selected = probabilities[:, indexes]
    return np.asarray(indexes, dtype=np.int64)[selected.argmax(axis=1)]


def _safe_output_directory(path: Path) -> None:
    if path.exists() and any(path.iterdir()):
        raise ValueError(f"Çıktı dizini boş olmalıdır; mevcut sonuçların üzerine yazılmadı: {path}")
    path.mkdir(parents=True, exist_ok=True)


def regression_rows(
    labels: list[dict], y_test: np.ndarray, teacher_probabilities: np.ndarray, student_probabilities: np.ndarray
) -> list[dict[str, object]]:
    teacher_predictions = teacher_probabilities.argmax(axis=1)
    student_predictions = student_probabilities.argmax(axis=1)
    rows = []
    for index in range(OLD_CLASS_COUNT):
        members = y_test == index
        count = int(members.sum())
        teacher_correct = int((teacher_predictions[members] == index).sum())
        student_correct = int((student_predictions[members] == index).sum())
        shifted = int((student_predictions[members] >= OLD_CLASS_COUNT).sum())
        rows.append({
            "index": index,
            "classId": labels[index]["classId"],
            "samples": count,
            "teacherCorrect": teacher_correct,
            "studentCorrect": student_correct,
            "teacherAccuracy": teacher_correct / count if count else None,
            "studentAccuracy": student_correct / count if count else None,
            "delta": (student_correct - teacher_correct) / count if count else None,
            "shiftedToNewClasses": shifted,
        })
    return rows


def evaluate_student(
    student, teacher_probabilities: dict[str, np.ndarray], data: dict[str, tuple[np.ndarray, np.ndarray, list]],
    labels: list[dict], symptom_indexes: list[int], general_indexes: list[int],
) -> dict[str, object]:
    x_validation, y_validation, _ = data["validation"]
    x_test, y_test, _ = data["test"]
    x_meb, y_meb, meb_rows = data["meb"]
    validation_probabilities = student.predict(x_validation, verbose=0)
    test_probabilities = student.predict(x_test, verbose=0)
    meb_probabilities = student.predict(x_meb, verbose=0)
    teacher_accuracy = float((teacher_probabilities["test"].argmax(axis=1) == y_test).mean())
    student_accuracy = float((test_probabilities.argmax(axis=1) == y_test).mean())
    general_test = context_predictions(test_probabilities, general_indexes)
    sugar = next(item["index"] for item in labels if item["classId"] == "seker")
    sugar_members = y_test == sugar
    sugar_symptom = context_predictions(test_probabilities[sugar_members], symptom_indexes)
    meb_context = context_predictions(meb_probabilities, symptom_indexes)
    real_meb = np.asarray([row.get("source") != "SYNTHETIC" for row in meb_rows], dtype=bool)
    meb_details = []
    for row, target, probabilities, context_winner in zip(meb_rows, y_meb, meb_probabilities, meb_context):
        if row.get("source") == "SYNTHETIC":
            continue
        meb_details.append({
            "sampleId": row["sample_id"],
            "expected": labels[int(target)]["classId"],
            "unrestrictedPrediction": labels[int(probabilities.argmax())]["classId"],
            "symptomContextPrediction": labels[int(context_winner)]["classId"],
            "symptomContextConfidence": float(probabilities[int(context_winner)]),
            "sourceQualityStatus": row.get("source_quality_status", row.get("quality_status")),
            "source": row.get("signer_id", ""),
        })
    result = {
        "autslValidationAccuracy": float((validation_probabilities.argmax(axis=1) == y_validation).mean()),
        "teacherAutslValidationAccuracy": float(
            (teacher_probabilities["validation"].argmax(axis=1) == y_validation).mean()
        ),
        "teacherAutslTestAccuracy": teacher_accuracy,
        "studentAutslTestAccuracy": student_accuracy,
        "studentAutslGeneralContextTestAccuracy": float((general_test == y_test).mean()),
        "autslAccuracyDelta": student_accuracy - teacher_accuracy,
        "autslRegressionGatePassed": student_accuracy - teacher_accuracy >= -MAX_AUTSL_ACCURACY_DROP,
        "autslTestSamplesShiftedToNewClasses": int((test_probabilities.argmax(axis=1) >= OLD_CLASS_COUNT).sum()),
        "sekerTestSamples": int(sugar_members.sum()),
        "sekerTeacherAccuracy": float((teacher_probabilities["test"][sugar_members].argmax(axis=1) == sugar).mean()),
        "sekerStudentAccuracy": float((test_probabilities[sugar_members].argmax(axis=1) == sugar).mean()),
        "sekerSymptomContextAccuracy": float((sugar_symptom == sugar).mean()),
        "mebReferenceContextAccuracy": float((meb_context == y_meb)[real_meb].mean()),
        "mebReferenceIsIndependentTest": False,
        "mebReferenceDetails": meb_details,
        "classRegression": regression_rows(labels, y_test, teacher_probabilities["test"], test_probabilities),
    }
    holdout = data.get("holdout")
    if holdout is not None:
        x_holdout, y_holdout, holdout_rows = holdout
        holdout_probabilities = student.predict(x_holdout, verbose=0)
        holdout_context = context_predictions(holdout_probabilities, symptom_indexes)
        per_class_holdout: dict[str, dict[str, int]] = {}
        for target, winner in zip(y_holdout, holdout_context):
            item = per_class_holdout.setdefault(labels[int(target)]["classId"], {"samples": 0, "correct": 0})
            item["samples"] += 1
            item["correct"] += int(winner == target)
        web = np.asarray([row.get("extractor") == "mediapipe-tasks-web" for row in holdout_rows], dtype=bool)
        confusions = Counter(
            (labels[int(t)]["classId"], labels[int(w)]["classId"])
            for t, w in zip(y_holdout, holdout_context) if int(t) != int(w)
        )
        result["holdout"] = {
            "sources": sorted({row.get("signer_id", "") for row in holdout_rows}),
            "samples": int(len(y_holdout)),
            "symptomContextAccuracy": float((holdout_context == y_holdout).mean()),
            "webExtractorSamples": int(web.sum()),
            "webExtractorAccuracy": float((holdout_context[web] == y_holdout[web]).mean()) if web.any() else None,
            "perClass": per_class_holdout,
            "confusions": [
                {"expected": e, "predicted": p, "count": c} for (e, p), c in confusions.most_common()
            ],
        }
    probe = data.get("probe")
    if probe is not None:
        x_probe, y_probe, probe_rows = probe
        probe_probabilities = student.predict(x_probe, verbose=0)
        probe_context = context_predictions(probe_probabilities, symptom_indexes)
        per_class: dict[str, dict[str, int]] = {}
        for target, winner in zip(y_probe, probe_context):
            item = per_class.setdefault(labels[int(target)]["classId"], {"samples": 0, "correct": 0})
            item["samples"] += 1
            item["correct"] += int(winner == target)
        result["probe"] = {
            "description": "Aynı MEB videolarının tarayıcı (MediaPipe Tasks) hattıyla çıkarılmış tekrarları; "
                           "bağımsız kişi testi değildir, çıkarıcı farkını gösterir.",
            "samples": int(len(y_probe)),
            "symptomContextAccuracy": float((probe_context == y_probe).mean()),
            "perClass": per_class,
            "signers": sorted({row.get("signer_id", "") for row in probe_rows}),
        }
    return result


def _write_class_regression(path: Path, rows: list[dict[str, object]]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def _percent(value: object) -> str:
    return "—" if value is None else f"%{float(value) * 100:.2f}".replace(".", ",")


def _views(counts: dict[str, int]) -> str:
    return ", ".join(f"{name}: {count}" for name, count in counts.items()) or "—"


def _points(value: object, digits: int) -> str:
    if value is None:
        return "—"
    return f"{float(value) * 100:+.{digits}f} yp".replace(".", ",")


def write_regression_report(path: Path, summary: dict[str, object]) -> None:
    best = summary["selected"]
    lines = [
        f"# `{MODEL_VERSION}` AUTSL gerileme ve belirti raporu",
        "",
        f"- Oluşturulma: {summary['createdAt']}",
        f"- Tohumlar: {', '.join(str(item['seed']) for item in summary['runs'])}",
        f"- Seçilen tohum: **{best['seed']}** (ölçüt: en yüksek AUTSL doğrulama doğruluğu)",
        f"- Kabul kapısı: eski 20 sınıfta en fazla {MAX_AUTSL_ACCURACY_DROP * 100:.0f} yüzde puan kayıp",
        f"- Sağlık referansları (MEB + harici): {summary.get('mebReferenceVideos', summary['mebReferenceSamples'])} video, "
        f"{summary['mebReferenceSamples']} görünüm ({_views(summary.get('mebViewsByExtractor', {}))}); "
        f"kaynak/kişi: {len(summary.get('healthSources', []))}; sentetik örnek: {summary.get('syntheticSamples', 0)}",
        "",
        "## Tohum karşılaştırması",
        "",
        "| Tohum | AUTSL doğrulama | AUTSL test | Test farkı | Kapı | `seker` test | MEB bağlam doğruluğu |",
        "|---:|---:|---:|---:|:--:|---:|---:|",
    ]
    for run in summary["runs"]:
        lines.append(
            f"| {run['seed']} | {_percent(run['autslValidationAccuracy'])} | {_percent(run['studentAutslTestAccuracy'])} "
            f"| {_points(run['autslAccuracyDelta'], 2)} | {'geçti' if run['autslRegressionGatePassed'] else 'KALDI'} "
            f"| {_percent(run['sekerStudentAccuracy'])} | {_percent(run['mebReferenceContextAccuracy'])} |"
        )
    lines += [
        "",
        "## Seçilen modelde eski 20 sınıf",
        "",
        f"Eski model test doğruluğu {_percent(best['teacherAutslTestAccuracy'])}, birleşik model "
        f"{_percent(best['studentAutslTestAccuracy'])} (genel bağlamda {_percent(best['studentAutslGeneralContextTestAccuracy'])}). "
        f"Yeni belirti sınıflarına kayan AUTSL test örneği: {best['autslTestSamplesShiftedToNewClasses']}.",
        "",
        "| Sınıf | Örnek | Eski doğru | Yeni doğru | Fark | Yeni sınıfa kayan |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for row in best["classRegression"]:
        delta = row["delta"]
        lines.append(
            f"| `{row['classId']}` | {row['samples']} | {row['teacherCorrect']} | {row['studentCorrect']} "
            f"| {_points(delta, 1)} | {row['shiftedToNewClasses']} |"
        )
    lines += [
        "",
        "## `seker` → `diabetes`",
        "",
        f"- AUTSL `seker` test örneği: {best['sekerTestSamples']}",
        f"- Eski model doğruluğu: {_percent(best['sekerTeacherAccuracy'])}; birleşik model: {_percent(best['sekerStudentAccuracy'])}",
        f"- Aynı örnekler belirti bağlamında `seker` (→ `diabetes` avatarı) olarak seçilme oranı: "
        f"{_percent(best['sekerSymptomContextAccuracy'])}",
        "",
        "## Eğitimdeki sağlık referansları (bağımsız test değildir)",
        "",
        "| Örnek | Kaynak | Beklenen | Serbest tahmin | Belirti bağlamı | Skor | Kaynak kalite |",
        "|---|---|---|---|---|---:|---|",
    ]
    for item in best["mebReferenceDetails"]:
        lines.append(
            f"| {item['sampleId']} | {item.get('source', '')} | `{item['expected']}` | `{item['unrestrictedPrediction']}` "
            f"| `{item['symptomContextPrediction']}` | {item['symptomContextConfidence']:.3f} | {item['sourceQualityStatus']} |"
        )
    holdout = best.get("holdout")
    if holdout:
        lines += [
            "",
            "## Dışarıda bırakılan kaynak (kişi bağımsız test)",
            "",
            f"Eğitime hiç girmeyen kaynak(lar): {', '.join(holdout['sources'])}. "
            f"Belirti bağlamı doğruluğu: {_percent(holdout['symptomContextAccuracy'])} ({holdout['samples']} görünüm).",
            "",
            "| Sınıf | Görünüm | Doğru |",
            "|---|---:|---:|",
        ]
        for class_id, item in sorted(holdout["perClass"].items()):
            lines.append(f"| `{class_id}` | {item['samples']} | {item['correct']} |")
        if holdout.get("webExtractorAccuracy") is not None:
            lines += ["", f"Canlı kameradaki tarayıcı çıkarıcısı görünümlerinde doğruluk: "
                      f"{_percent(holdout['webExtractorAccuracy'])} ({holdout['webExtractorSamples']} görünüm)."]
        if holdout.get("confusions"):
            lines += ["", "Karışan sınıflar: " + ", ".join(
                f"`{item['expected']}`→`{item['predicted']}` ×{item['count']}" for item in holdout["confusions"][:10]
            ) + "."]
    probe = best.get("probe")
    if probe:
        lines += [
            "",
            "## Tarayıcı çıkarıcısı probu",
            "",
            probe["description"] + (
                " Tarayıcı çıkarıcısı görünümleri eğitimde de kullanıldığı için bu prob eğitim verisine çok yakındır."
                if "mediapipe-tasks-web" in summary.get("mebViewsByExtractor", {}) else ""
            ),
            "",
            f"Belirti bağlamı doğruluğu: {_percent(probe['symptomContextAccuracy'])} ({probe['samples']} kayıt).",
            "",
            "| Sınıf | Kayıt | Doğru |",
            "|---|---:|---:|",
        ]
        for class_id, item in sorted(probe["perClass"].items()):
            lines.append(f"| `{class_id}` | {item['samples']} | {item['correct']} |")
    lines += [
        "",
        "## Sınırlar",
        "",
        "- Her yeni belirti sınıfı tek MEB referans videosundan artırımla öğrenilmiştir; artırılmış örnekler yeni katılımcı değildir.",
        "- Kişi bağımsız belirti başarımı ancak `camera-trials` kamera denemeleriyle ölçülebilir.",
        "- 46-landmark hattı yüz ifadesi ve ağız hareketini kullanmaz; TİD'de anlamı değiştiren bu bilgiler modelde yoktur.",
        "- Model tıbbi tanı koymaz; bütün sonuçlar hasta onayı ister.",
        "",
    ]
    path.write_text("\n".join(lines), encoding="utf-8")


def _write_model_card(path: Path, summary: dict[str, object]) -> None:
    best = summary["selected"]
    path.write_text(
        f"""# SignBridge birleşik {summary.get('classCount', 30)} sınıflı model kartı

## Model

- Sürüm: `{MODEL_VERSION}` · Sözlük: `{VOCABULARY_VERSION}` · Ön işleme: `landmark46-v1`
- Mimari: mevcut AUTSL-20 BiGRU encoder'ının {summary.get('classCount', 30)} çıktıya genişletilmiş sürümü (ilk 20 indeks korunur)
- Girdi: 60 zaman adımı × 46 landmark × (x, y, maske)
- Genel bağlam: mevcut 20 AUTSL sınıfı
- Belirti bağlamı: {summary.get('symptomClassCount', 11)} belirti avatarı (yeni belirti sınıfları + mevcut `seker`)
- `seker`, belirti ekranında `diabetes` avatarı ve “Şeker hastasıyım” metniyle gösterilir.
- Seçilen tohum: {best['seed']} (denenen: {', '.join(str(item['seed']) for item in summary['runs'])})

## Ölçümler

- Eski model AUTSL test doğruluğu: {best['teacherAutslTestAccuracy']:.4f}
- Birleşik model AUTSL test doğruluğu: {best['studentAutslTestAccuracy']:.4f} (fark {best['autslAccuracyDelta']:+.4f};
  kapı ≥ -{MAX_AUTSL_ACCURACY_DROP:.2f}: {'geçti' if best['autslRegressionGatePassed'] else 'KALDI'})
- AUTSL `seker`: eski {best['sekerTeacherAccuracy']:.4f}, yeni {best['sekerStudentAccuracy']:.4f},
  belirti bağlamında `seker` seçimi {best['sekerSymptomContextAccuracy']:.4f}
- MEB referanslarında belirti-bağlamı doğruluğu: {best['mebReferenceContextAccuracy']:.4f}
  ({summary.get('mebReferenceVideos', summary['mebReferenceSamples'])} video, {summary['mebReferenceSamples']} görünüm:
  {_views(summary.get('mebViewsByExtractor', {}))})

MEB değeri bağımsız test değildir. Her yeni sağlık sınıfında yalnız bir resmî referans video
bulunduğundan artırılmış örnekler ve farklı çıkarıcı (eski Holistic / canlı kameradaki MediaPipe Tasks)
görünümleri aynı işaretçinin türevleridir. Ayrıntılar `regression_report.md`
dosyasındadır.

## Kullanım ve güvenlik

Bu model yalnız SignBridge öğrenci MVP'sindeki deneysel, tek-izole-işaret demosu içindir.
Tıbbi tanı koymaz. Kamera sonucu hastaya aday olarak gösterilir ve hasta onayı olmadan doktora
aktarılmaz. {summary.get('manualOnlyNote', '')}
Model 46 landmark kullanır; TİD'de anlamı değiştirebilen yüz, baş, göz ve gövde hareketlerini görmez.

MEB videolarının yeniden dağıtımı ve bu videolardan türetilen model ağırlıklarının açık yayımlanması,
kullanım izni doğrulanana kadar yapılmamalıdır. Düşük görünürlüklü MEB kaynakları manifestte
`source_quality_status=needs_review` olarak korunur ve iskelet bindirmesiyle incelenmiştir.
""",
        encoding="utf-8",
    )


def train_one_seed(args, seed: int, output_dir: Path, data: dict, labels: list[dict], teacher_path: Path,
                   teacher_probabilities: dict[str, np.ndarray], symptom_indexes: list[int],
                   general_indexes: list[int]) -> dict[str, object]:
    import tensorflow as tf

    random.seed(seed)
    np.random.seed(seed)
    tf.random.set_seed(seed)
    os.environ["PYTHONHASHSEED"] = str(seed)
    class_count = len(labels)
    x_train, y_train, _ = data["train"]
    x_validation, y_validation, _ = data["validation"]
    x_meb, y_meb, _ = data["meb"]

    teacher = tf.keras.models.load_model(str(teacher_path))
    student = build_model(class_count)
    initialize_from_autsl20(teacher, student)

    old_targets = _distillation_targets(teacher_probabilities["train"], y_train, class_count)
    new_targets = np.eye(class_count, dtype=np.float32)[y_meb]
    validation_targets = np.eye(class_count, dtype=np.float32)[y_validation]

    old_dataset = tf.data.Dataset.from_tensor_slices((x_train, old_targets)).shuffle(
        len(x_train), seed=seed, reshuffle_each_iteration=True
    ).repeat()
    # MEB: her sınıf eşit olasılıkla örneklenir (sınıf dengeli örnekleme).
    synthetic = np.asarray([row.get("source") == "SYNTHETIC" for row in data["meb"][2]], dtype=bool)

    def class_dataset(label):
        real = (y_meb == label) & ~synthetic
        fake = (y_meb == label) & synthetic
        parts = [tf.data.Dataset.from_tensor_slices((x_meb[real], new_targets[real])).repeat()]
        if fake.any():
            # Sentetik örnekler sınıfın en fazla yarısını oluşturur; gerçek örnekler baskın kalır.
            parts.append(tf.data.Dataset.from_tensor_slices((x_meb[fake], new_targets[fake])).repeat())
            return tf.data.Dataset.sample_from_datasets(parts, weights=[0.5, 0.5], seed=seed)
        return parts[0]

    per_class = [class_dataset(label) for label in np.unique(y_meb)]
    new_dataset = tf.data.Dataset.sample_from_datasets(per_class, seed=seed).map(
        augment_feature, num_parallel_calls=tf.data.AUTOTUNE
    )
    train_dataset = tf.data.Dataset.sample_from_datasets(
        [old_dataset, new_dataset], weights=[2.0 / 3.0, 1.0 / 3.0], seed=seed
    ).batch(args.batch_size).prefetch(tf.data.AUTOTUNE)
    reference_videos = len({row.get("raw_path") or row["sample_id"] for row in data["meb"][2]
                            if row.get("source") != "SYNTHETIC"})
    steps_per_epoch = max(
        1, math.ceil((len(x_train) + args.meb_augmentations * reference_videos) / args.batch_size)
    )
    if args.smoke:
        steps_per_epoch = 2

    for layer in student.layers[:-1]:
        layer.trainable = False
    student.layers[-1].trainable = True
    student.compile(optimizer=tf.keras.optimizers.Adam(learning_rate=1e-3),
                    loss="categorical_crossentropy", metrics=["accuracy"])
    head_history = student.fit(
        train_dataset, steps_per_epoch=steps_per_epoch,
        validation_data=(x_validation, validation_targets), epochs=args.head_epochs, verbose=2,
    )

    trainable = {"encoder_bigru_64", "embedding_64", "class_probabilities"}
    if HAND_LOCAL:
        # Ek el biçimi girdileri ilk BiGRU'ya bağlıdır; bu katman eğitilmezse sıfır ağırlıklar öğrenilemez.
        trainable.add("encoder_bigru_128")
    for layer in student.layers:
        layer.trainable = layer.name in trainable
    student.compile(optimizer=tf.keras.optimizers.Adam(learning_rate=1e-4),
                    loss="categorical_crossentropy", metrics=["accuracy"])
    best_path = output_dir / f"{MODEL_VERSION}.keras"
    callbacks = [
        tf.keras.callbacks.EarlyStopping(monitor="val_loss", patience=args.patience, restore_best_weights=True),
        tf.keras.callbacks.ModelCheckpoint(str(best_path), monitor="val_loss", save_best_only=True),
    ]
    finetune_history = student.fit(
        train_dataset, steps_per_epoch=steps_per_epoch,
        validation_data=(x_validation, validation_targets), epochs=args.finetune_epochs,
        callbacks=callbacks, verbose=2,
    )
    student = tf.keras.models.load_model(str(best_path))
    result = evaluate_student(student, teacher_probabilities, data, labels, symptom_indexes, general_indexes)
    result.update(
        seed=seed,
        headEpochsRun=len(head_history.history.get("loss", [])),
        finetuneEpochsRun=len(finetune_history.history.get("loss", [])),
        headHistory={k: [float(v) for v in values] for k, values in head_history.history.items()},
        finetuneHistory={k: [float(v) for v in values] for k, values in finetune_history.history.items()},
    )
    student.save(str(output_dir / "saved_model"))
    write_json(output_dir / "metrics.json", {k: v for k, v in result.items() if k != "classRegression"})
    _write_class_regression(output_dir / "class_regression.csv", result["classRegression"])
    return result


def _seed_list(value: str) -> list[int]:
    seeds = [int(item) for item in value.split(",") if item.strip()]
    if not seeds or len(set(seeds)) != len(seeds):
        raise argparse.ArgumentTypeError("Tohumlar virgülle ayrılmış benzersiz tam sayılar olmalıdır.")
    return seeds


def main() -> None:
    parser = argparse.ArgumentParser(description="AUTSL-20 modelini MEB sağlık belirtileriyle 30 sınıfa genişletir.")
    parser.add_argument("--data-root")
    parser.add_argument("--manifest-dir", default=str(AI_ROOT / "manifests"))
    parser.add_argument("--meb-manifest", help="Varsayılan: <manifest-dir>/meb_health11_training.csv")
    parser.add_argument("--probe-manifest", help="Yalnız raporlanan ek belirti probu (eğitime girmez)")
    parser.add_argument("--vocabulary", default="signbridge30-v1", choices=sorted(VARIANTS),
                        help="signbridge30-v1 (11 belirti) veya signbridge34-v1 (15 belirti)")
    parser.add_argument("--extra-manifest", action="append", default=[],
                        help="Ek sağlık manifesti (ör. manifests/external_health_training.csv); tekrarlanabilir")
    parser.add_argument("--holdout-source", action="append", default=[],
                        help="Eğitimden tamamen çıkarılıp kişi bağımsız test olarak raporlanan signer_id")
    parser.add_argument("--base-model", default=str(AI_ROOT / "outputs" / "saved_model"),
                        help="AUTSL-20 SavedModel klasörü (TF 2.15 ile .keras dosyası yüklenemediği için varsayılan)")
    parser.add_argument("--output-dir", help="Varsayılan: outputs/unified30 veya outputs/unified34")
    parser.add_argument("--head-epochs", type=int, default=10)
    parser.add_argument("--finetune-epochs", type=int, default=30)
    parser.add_argument("--patience", type=int, default=7)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--meb-augmentations", type=int, default=DEFAULT_MEB_AUGMENTATIONS_PER_CLASS,
                        help="Epoch başına her MEB referans videosu için artırılmış örnek sayısı")
    parser.add_argument("--seeds", type=_seed_list, default=_seed_list(DEFAULT_SEEDS))
    parser.add_argument("--seed", type=int, help="Tek tohumla çalıştırır (--seeds yerine)")
    parser.add_argument("--smoke", action="store_true", help="Küçük veri, 1+1 epoch; ölçüm değildir")
    parser.add_argument("--hand-local-features", action="store_true",
                        help="El biçimi özelliklerini ekler (girdi 222); servis modele göre otomatik seçer")
    args = parser.parse_args()
    seeds = [args.seed] if args.seed is not None else args.seeds
    expected_classes = select_variant(args.vocabulary)
    global HAND_LOCAL
    HAND_LOCAL = bool(args.hand_local_features)
    if args.output_dir is None:
        args.output_dir = str(AI_ROOT / "outputs" / ("unified30" if expected_classes == 30 else "unified34"))

    import tensorflow as tf

    data_root = resolve_data_root(args.data_root)
    manifest_dir = Path(args.manifest_dir).resolve()
    output_dir = Path(args.output_dir).resolve()
    _safe_output_directory(output_dir)
    teacher_path = Path(args.base_model).resolve()

    labels_config = label_config(VOCABULARY_VERSION)
    labels = labels_config["labels"]
    if len(labels) != expected_classes:
        raise ValueError(f"Birleşik sözlük tam olarak {expected_classes} sınıf içermelidir.")
    base_labels = label_config(BASE_VOCABULARY_VERSION)["labels"]
    if [item["classId"] for item in labels[:OLD_CLASS_COUNT]] != [item["classId"] for item in base_labels]:
        raise ValueError("İlk 20 sınıfın sırası AUTSL-20 ile aynı olmalıdır.")
    symptom_indexes = [int(item["index"]) for item in labels if item["classId"] in labels_config["symptomClassIds"]]
    general_indexes = [int(item["index"]) for item in labels if item["classId"] in labels_config["generalClassIds"]]

    meb_manifest = Path(args.meb_manifest).resolve() if args.meb_manifest else manifest_dir / "meb_health11_training.csv"
    data = {
        "train": load_split(manifest_dir / "autsl20_train.csv", data_root, hand_local=HAND_LOCAL),
        "validation": load_split(manifest_dir / "autsl20_validation.csv", data_root, hand_local=HAND_LOCAL),
        "test": load_split(manifest_dir / "autsl20_test.csv", data_root, hand_local=HAND_LOCAL),
        "meb": load_split(meb_manifest, data_root, allowed_quality_statuses=("approved", "needs_review"),
                          hand_local=HAND_LOCAL),
    }
    health_parts = [data["meb"]] + [
        load_split(Path(item).resolve(), data_root, allowed_quality_statuses=("approved", "needs_review"),
                   hand_local=HAND_LOCAL)
        for item in args.extra_manifest
    ]
    health_x = np.concatenate([part[0] for part in health_parts])
    health_y = np.concatenate([part[1] for part in health_parts])
    health_rows = [row for part in health_parts for row in part[2]]
    if health_y.max() >= len(labels):
        raise ValueError("Sağlık manifestinde sözlük dışı model_index var; --vocabulary değerini kontrol edin.")
    holdout = set(args.holdout_source)
    unknown_holdout = holdout - {row.get("signer_id", "") for row in health_rows}
    if unknown_holdout:
        raise ValueError(f"Manifestlerde bulunmayan --holdout-source: {sorted(unknown_holdout)}")
    held = np.asarray([row.get("signer_id", "") in holdout for row in health_rows], dtype=bool)
    # Dışarıda bırakılan kaynaktan türetilen sentetik örnekler ne eğitime ne ölçüme girer (sızıntı olmasın).
    derived = np.asarray([
        row.get("source") == "SYNTHETIC" and row.get("derived_signer_id", "") in holdout for row in health_rows
    ], dtype=bool)
    if held.any():
        data["holdout"] = (health_x[held], health_y[held], [r for r, h in zip(health_rows, held) if h])
    keep = ~held & ~derived
    data["meb"] = (health_x[keep], health_y[keep], [r for r, k in zip(health_rows, keep) if k])
    real_labels = [int(v) for v, row in zip(data["meb"][1], data["meb"][2]) if row.get("source") != "SYNTHETIC"]
    missing = sorted(set(symptom_indexes) - set(real_labels))
    if missing:
        names = [labels[index]["classId"] for index in missing]
        raise ValueError(f"Eğitim verisinde örneği olmayan belirti sınıfları: {names}")
    if args.probe_manifest:
        data["probe"] = load_split(Path(args.probe_manifest).resolve(), data_root, hand_local=HAND_LOCAL)
    if args.smoke:
        def small(split: str, per_class: int) -> None:
            x, y, rows = data[split]
            keep = np.concatenate([np.flatnonzero(y == label)[:per_class] for label in np.unique(y)])
            data[split] = (x[keep], y[keep], [rows[int(i)] for i in keep])
        small("train", 2)
        small("validation", 1)
        small("test", 1)
        args.head_epochs = 1
        args.finetune_epochs = 1

    teacher = tf.keras.models.load_model(str(teacher_path))
    teacher_probabilities = {
        split: teacher.predict(data[split][0][..., :BASE_FEATURES], verbose=0)
        for split in ("train", "validation", "test")
    }
    del teacher

    runs = []
    for seed in seeds:
        seed_dir = output_dir / "seeds" / f"seed-{seed}"
        seed_dir.mkdir(parents=True)
        print(f"=== tohum {seed} ===", flush=True)
        runs.append(train_one_seed(args, seed, seed_dir, data, labels, teacher_path, teacher_probabilities,
                                   symptom_indexes, general_indexes))
        tf.keras.backend.clear_session()

    eligible = [run for run in runs if run["autslRegressionGatePassed"]] or runs
    selected = max(eligible, key=lambda run: (run["autslValidationAccuracy"], run["mebReferenceContextAccuracy"]))
    selected_dir = output_dir / "seeds" / f"seed-{selected['seed']}"
    shutil.copytree(selected_dir / "saved_model", output_dir / "saved_model")
    shutil.copy2(selected_dir / f"{MODEL_VERSION}.keras", output_dir / f"{MODEL_VERSION}.keras")
    shutil.copy2(selected_dir / "class_regression.csv", output_dir / "class_regression.csv")

    summary = {
        "modelVersion": MODEL_VERSION,
        "vocabularyVersion": VOCABULARY_VERSION,
        "createdAt": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "smokeOnly": bool(args.smoke),
        "baseModel": teacher_path.name,
        "selectionCriterion": "gate-passing run with highest AUTSL validation accuracy",
        "extraManifests": [Path(item).name for item in args.extra_manifest],
        "classCount": len(labels),
        "symptomClassCount": len(symptom_indexes),
        "manualOnlyNote": (
            "Baş ağrısı, karın ağrısı, bulantı ve nefes darlığı bu model sürümünde manuel seçimde kalır."
            if len(symptom_indexes) < 15 else "15 belirti avatarının tamamı kamerayla önerilebilir."
        ),
        "holdoutSources": sorted(holdout),
        "featureLayout": "xy-mask-138+handlocal-84" if HAND_LOCAL else "xy-mask-138",
        "maxAutslAccuracyDrop": MAX_AUTSL_ACCURACY_DROP,
        "autslTrainSamples": int(len(data["train"][1])),
        "autslValidationSamples": int(len(data["validation"][1])),
        "autslTestSamples": int(len(data["test"][1])),
        "mebReferenceSamples": int(sum(row.get("source") != "SYNTHETIC" for row in data["meb"][2])),
        "mebReferenceVideos": len({row.get("raw_path") or row["sample_id"] for row in data["meb"][2]
                                   if row.get("source") != "SYNTHETIC"}),
        "healthSources": sorted({row.get("signer_id", "") for row in data["meb"][2] if row.get("source") != "SYNTHETIC"}),
        "syntheticSamples": int(sum(row.get("source") == "SYNTHETIC" for row in data["meb"][2])),
        "mebViewsByExtractor": {
            name: sum(row.get("extractor", "mediapipe-holistic-legacy") == name for row in data["meb"][2]
                      if row.get("source") != "SYNTHETIC")
            for name in sorted({row.get("extractor", "mediapipe-holistic-legacy") for row in data["meb"][2]
                                if row.get("source") != "SYNTHETIC"})
        },
        "mebAugmentationsPerSamplePerEpoch": args.meb_augmentations,
        "mebNeedsReviewSources": int(sum(
            row.get("source_quality_status") == "needs_review" for row in data["meb"][2]
            if row.get("extractor", "mediapipe-holistic-legacy") == "mediapipe-holistic-legacy"
        )),
        "selectedSeed": selected["seed"],
        "runs": [{k: v for k, v in run.items() if k not in {"classRegression", "mebReferenceDetails",
                                                            "headHistory", "finetuneHistory"}} for run in runs],
        "selected": {k: v for k, v in selected.items() if k not in {"headHistory", "finetuneHistory"}},
    }
    metrics = {k: v for k, v in selected.items() if k not in {"classRegression", "headHistory", "finetuneHistory"}}
    metrics.update({key: summary[key] for key in (
        "modelVersion", "vocabularyVersion", "createdAt", "smokeOnly", "selectedSeed", "autslTrainSamples",
        "autslValidationSamples", "autslTestSamples", "mebReferenceSamples", "mebReferenceVideos",
        "mebViewsByExtractor", "mebNeedsReviewSources",
    )})
    metrics["seedRuns"] = summary["runs"]
    write_json(output_dir / "metrics.json", metrics)
    write_json(output_dir / "training_summary.json", summary)
    write_json(output_dir / "runtime_config.json", {
        "modelVersion": MODEL_VERSION,
        "preprocessingVersion": "landmark46-v1",
        "vocabularyVersion": VOCABULARY_VERSION,
        "confidenceThreshold": 0.95,
        "featureLayout": "xy-mask-138+handlocal-84" if HAND_LOCAL else "xy-mask-138",
    })
    shutil.copy2(CONFIG_DIR / LABELS_FILE, output_dir / LABELS_FILE)
    shutil.copy2(CONFIG_DIR / POLICY_FILE, output_dir / POLICY_FILE)
    write_regression_report(output_dir / "regression_report.md", summary)
    _write_model_card(output_dir / "model_card.md", summary)
    print(json.dumps({k: v for k, v in metrics.items() if k not in {"mebReferenceDetails", "seedRuns"}},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
