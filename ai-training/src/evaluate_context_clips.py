"""Bağlamlı kliplerde canlı yol ölçümü (kişi bağımsız, gerçek kayda yakın).

Kesilmiş klipler yalnız işareti içerir; uygulamada kayıt el kadraja gelmeden başlar ve işaret bittikten
sonra biter. Bu araç, ders videolarından işaretin önü/arkası ile kesilmiş kliplerin tarayıcı çıkarıcısı
(`scripts/extract-browser-landmarks.mjs`, 10 kare/sn görünümleri) çıktısını canlı yoldan geçirir:

* `now`: kırpma yok (eski istemci),
* `trim`: `trim_recording` (istemcideki `prepareRecordedFrames`),
* `trim+mirror`: ayrıca ayna görüntüyle ortalama (`runtime_config.testTimeMirror`).

Her klipten kaydın başı/sonu 0 / 0,5 / 1 sn kaydırılarak 9 kesit alınır (bağlam süresi izin verdiği kadar).
Sonuç belirti bağlamında ilk öneri ve ilk 3 öneri (onay ekranında görünen avatarlar) doğruluğudur.

Örnek:
    python -m src.evaluate_context_clips --model-dir outputs/unified34-holdout-b \
        --raw-json "<veri kökü>/processed/baglamli_browser_raw.json" \
        --plan "<veri kökü>/harici_ham/baglamli/plan.csv" \
        --signer serpil-avci --signer filiz-caglar --signer sozluk-b
"""
from __future__ import annotations

import argparse
import csv
import json
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

from src.common import label_config, preprocessing_config
from src.data.preprocessing import assess_quality, preprocess_pose_sequence
from src.data.simulate_recordings import trim_recording
from src.model.dataset import features_for_model, mirror_landmarks

AVATAR_TO_CLASS = {"diabetes": "seker"}
OFFSETS_SECONDS = (0.0, 0.5, 1.0)


def crops(frames: int, fps: float, before: float, after: float) -> list[tuple[int, int]]:
    return [(int(round(a * fps)), frames - int(round(b * fps)))
            for a in OFFSETS_SECONDS for b in OFFSETS_SECONDS if a <= before and b <= after]


def live_input(points: np.ndarray, conf: np.ndarray, trim: bool, config: dict):
    if trim:
        points, conf = trim_recording(points, conf)
    quality = assess_quality(points, conf, minimum_confidence=config["minimumConfidence"],
                             minimum_frames=config["minimumSequenceFrames"], minimum_shoulder_ratio=0.6,
                             minimum_hand_ratio=0.5, minimum_motion_score=0.12)
    if quality.status != "approved":
        return None, quality.reason
    processed = preprocess_pose_sequence(points, conf, target_length=config["sequenceLength"],
                                         minimum_confidence=config["minimumConfidence"])
    return (processed["landmarks"], processed["mask"]), "ok"


def evaluate(model, videos: list[dict], plan: dict[str, tuple[float, float]], signers: set[str]) -> dict:
    labels_config = label_config("signbridge34-v1")
    labels = labels_config["labels"]
    index = {item["classId"]: item["index"] for item in labels}
    symptoms = np.asarray([item["index"] for item in labels if item["classId"] in labels_config["symptomClassIds"]])
    config = preprocessing_config()
    samples = []
    for video in videos:
        avatar, name = video["source"].split("/")
        if name.rsplit("_", 1)[0] not in signers:
            continue
        before, after = plan[f"{avatar}/{name}.mp4"]
        target = index[AVATAR_TO_CLASS.get(avatar, avatar)]
        for view in video["views"]:
            if view["fps"] != 10:
                continue
            points = np.asarray(view["keypoints"], dtype=np.float32)
            conf = np.asarray(view["confidence"], dtype=np.float32)
            for start, end in crops(len(points), 10.0, before, after):
                samples.append((video["source"], target, points[start:end], conf[start:end]))
    result: dict[str, object] = {"samples": len(samples), "clips": len({s[0] for s in samples})}
    for mode, trim in (("now", False), ("trim", True)):
        plain, mirrored, keep, rejected = [], [], [], Counter()
        for _, _, points, conf in samples:
            inputs, reason = live_input(points, conf, trim, config)
            keep.append(inputs is not None)
            if inputs is None:
                rejected[reason] += 1
                continue
            plain.append(features_for_model(model, *inputs))
            mirrored.append(features_for_model(model, *mirror_landmarks(*inputs)))
        keep_mask = np.asarray(keep)
        targets = np.asarray([s[1] for s in samples])
        probabilities = np.zeros((len(samples), len(labels)))
        averaged = probabilities.copy()
        if keep_mask.any():
            probabilities[keep_mask] = model.predict(np.stack(plain), verbose=0)
            averaged[keep_mask] = (probabilities[keep_mask] + model.predict(np.stack(mirrored), verbose=0)) / 2
        for suffix, scores in (("", probabilities), ("+mirror", averaged)):
            ranked = symptoms[np.argsort(-scores[:, symptoms], axis=1)]
            top1 = keep_mask & (ranked[:, 0] == targets)
            top3 = keep_mask & (ranked[:, :3] == targets[:, None]).any(axis=1)
            per_clip = defaultdict(lambda: [0, 0])
            for (source, *_), correct in zip(samples, top1):
                per_clip[source][0] += int(correct)
                per_clip[source][1] += 1
            result[mode + suffix] = {
                "top1": int(top1.sum()), "top3": int(top3.sum()), "rejected": dict(rejected),
                "perClip": {key: f"{a}/{b}" for key, (a, b) in sorted(per_clip.items())},
            }
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Bağlamlı kliplerde canlı yol (kırpma/ayna) ölçümü.")
    parser.add_argument("--model-dir", required=True, help="saved_model içeren klasör")
    parser.add_argument("--raw-json", required=True)
    parser.add_argument("--plan", required=True, help="dosya,kaynak_video,bas,bit,on,son")
    parser.add_argument("--signer", action="append", required=True, help="kaynak adı (ör. serpil-avci)")
    parser.add_argument("--output")
    args = parser.parse_args()
    import tensorflow as tf

    model = tf.keras.models.load_model(str(Path(args.model_dir) / "saved_model"))
    with open(args.plan, encoding="utf-8-sig") as handle:
        plan = {row["dosya"]: (float(row["on"]), float(row["son"])) for row in csv.DictReader(handle)}
    videos = json.loads(Path(args.raw_json).read_text(encoding="utf-8"))["videos"]
    result = evaluate(model, videos, plan, set(args.signer))
    text = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        Path(args.output).write_text(text + "\n", encoding="utf-8")
    print(text)


if __name__ == "__main__":
    main()
