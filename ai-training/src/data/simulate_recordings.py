"""Gerçek kamera kaydına benzeyen eğitim örnekleri üretir (bekleme + el kaldırma/indirme).

Uygulamada hasta kaydı başlatır, elini kadraja getirir, işareti yapar, elini indirir ve kaydı bitirir.
İnternetten kesilen klipler ise yalnız işaretin kendisini içerir. Bu fark, eğitimde görülmeyen
kişilerde doğruluğu belirgin biçimde düşürür. Bu araç tarayıcıda (MediaPipe Tasks) çıkarılmış ham
landmark dizilerine şunları ekler:

* başta ve sonda ellerin kadraj dışında olduğu bekleme kareleri,
* elin kadrajın altından işaretin başladığı yere gelmesi ve işaret bitince aşağı inmesi.

Ardından canlı uygulamadaki yol aynen uygulanır: kısa boşluk doldurma → baş/son boş kareleri kırpma
(``trim_recording``) → kalite kapısı → ``landmark46-v1``. Örnekler ``source=RECORDING_SIM``,
``signer_id=rec_<kaynak>``, ``derived_signer_id=<kaynak>`` ile ayrı manifeste yazılır; dışarıda
bırakılan kaynaktan türetilenler kişi bağımsız ölçümde eğitimden çıkarılır.
"""
from __future__ import annotations

import argparse
import csv
import json
import zlib
from collections import Counter
from pathlib import Path

import numpy as np

from src.common import AI_ROOT, label_config, preprocessing_config, resolve_data_root, write_json
from src.data.prepare_meb_health import LEFT_HAND, RIGHT_HAND, hand_visible, interpolate_short_gaps
from src.data.preprocessing import assess_quality, preprocess_pose_sequence

OUTPUT_SUBDIR = Path("processed") / "recording_sim" / "landmark46-v1"
LIVE_FPS = 10.0
LIVE_TRIM_MARGIN_SECONDS = 0.1
FIELDNAMES = [
    "sample_id", "class_id", "model_index", "original_class_id", "source", "source_version", "signer_id",
    "consent_id", "split", "raw_path", "landmark_path", "quality_status", "training_status",
    "manual_selectable", "risk_tier", "source_quality_status", "quality_reason", "avatar_id",
    "extractor", "view", "derived_signer_id", "base_sample_id",
]


def trim_recording(keypoints: np.ndarray, confidences: np.ndarray, fps: float = LIVE_FPS,
                   minimum_frames: int = 8) -> tuple[np.ndarray, np.ndarray]:
    """Canlı kayıttaki ön hazırlık (istemcideki `prepareRecordedFrames` ile aynı).

    Kısa el kayıplarını doldurur, ellerin hiç görünmediği baş/son kareleri ~0,1 sn pay bırakarak atar.
    """
    points, conf, _ = interpolate_short_gaps(keypoints, confidences)
    visible = hand_visible(conf, LEFT_HAND) | hand_visible(conf, RIGHT_HAND)
    if not visible.any():
        return points, conf
    margin = max(1, int(round(LIVE_TRIM_MARGIN_SECONDS * fps)))
    indexes = np.flatnonzero(visible)
    start = max(0, int(indexes[0]) - margin)
    end = min(len(conf), int(indexes[-1]) + 1 + margin)
    if end - start < minimum_frames:
        return points, conf
    return points[start:end], conf[start:end]


def _edge_frame(confidences: np.ndarray, last: bool) -> int:
    visible = np.flatnonzero(hand_visible(confidences, LEFT_HAND) | hand_visible(confidences, RIGHT_HAND))
    if not len(visible):
        return len(confidences) - 1 if last else 0
    return int(visible[-1] if last else visible[0])


def pad_recording(keypoints: np.ndarray, confidences: np.ndarray, fps: float, rng: np.random.Generator,
                  rest_seconds: tuple[float, float] = (0.0, 2.0),
                  move_seconds: tuple[float, float] = (0.2, 0.5)) -> tuple[np.ndarray, np.ndarray]:
    """İşaretin önüne/arkasına bekleme ve el getirme/indirme kareleri ekler (ham 0–1 görüntü koordinatı)."""
    def frames(bounds: tuple[float, float]) -> int:
        return int(round(rng.uniform(*bounds) * fps))

    def rest(reference_points: np.ndarray, reference_conf: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        points, conf = reference_points.copy(), reference_conf.copy()
        points[33:75] = 0.0
        conf[33:75] = 0.0
        points[:33] += rng.normal(0.0, 0.003, points[:33].shape)
        points[13:15, 1] += 0.08  # eller aşağıdayken dirsekler de iner
        return points, conf

    def move(reference_points: np.ndarray, reference_conf: np.ndarray, count: int, entering: bool):
        hands = [block for block in (LEFT_HAND, RIGHT_HAND) if hand_visible(reference_conf[None], block)[0]]
        bottom = rng.uniform(0.95, 1.05)
        starts = {block.start: np.array([reference_points[block.start, 0] + rng.uniform(-0.08, 0.08), bottom])
                  for block in hands}
        out = []
        for step in range(count):
            ratio = (step + 1) / (count + 1)
            ratio = ratio if entering else 1.0 - ratio
            points, conf = reference_points.copy(), reference_conf.copy()
            for block in hands:
                shift = (starts[block.start] - reference_points[block.start]) * (1.0 - ratio)
                points[block] = reference_points[block] + shift
                outside = points[block, 1] > 1.0
                conf[block] = np.where(outside, 0.0, conf[block])
            points[13:15, 1] += 0.08 * (1.0 - ratio)
            out.append((points, conf))
        return out

    first, last = _edge_frame(confidences, False), _edge_frame(confidences, True)
    sequence: list[tuple[np.ndarray, np.ndarray]] = []
    sequence += [rest(keypoints[first], confidences[first]) for _ in range(frames(rest_seconds))]
    sequence += move(keypoints[first], confidences[first], max(1, frames(move_seconds)), True)
    sequence += list(zip(keypoints, confidences))
    sequence += move(keypoints[last], confidences[last], max(1, frames(move_seconds)), False)
    sequence += [rest(keypoints[last], confidences[last]) for _ in range(frames(rest_seconds))]
    return (np.stack([item[0] for item in sequence]).astype(np.float32),
            np.stack([item[1] for item in sequence]).astype(np.float32))


def live_sequence(keypoints: np.ndarray, confidences: np.ndarray, fps: float, config: dict,
                  minimum_motion_score: float = 0.12):
    """Canlı uygulama yolu: kırpma → kalite kapısı → landmark46-v1. Reddedilirse (None, neden)."""
    points, conf = trim_recording(keypoints, confidences, fps, config["minimumSequenceFrames"])
    quality = assess_quality(points, conf, minimum_confidence=config["minimumConfidence"],
                             minimum_frames=config["minimumSequenceFrames"], minimum_shoulder_ratio=0.6,
                             minimum_hand_ratio=0.5, minimum_motion_score=minimum_motion_score)
    if quality.status != "approved":
        return None, quality.reason
    return preprocess_pose_sequence(points, conf, target_length=config["sequenceLength"],
                                    minimum_confidence=config["minimumConfidence"]), "ok"


def _raw_sources(data_root: Path, labels: dict[str, dict], manifest_dir: Path) -> list[dict[str, object]]:
    """Tarayıcı ham landmark dosyalarındaki videolar + sınıf/kaynak bilgisi."""
    items: list[dict[str, object]] = []
    external = {}
    for row in csv.DictReader((manifest_dir / "external_health_training.csv").open(encoding="utf-8-sig")):
        external[row["raw_path"].split("/", 1)[1].rsplit(".", 1)[0]] = row
    meb = {}
    for row in csv.DictReader((manifest_dir / "meb_health11_training.csv").open(encoding="utf-8-sig")):
        meb[Path(row["raw_path"]).stem] = row
    for name, lookup, prefix in (("external_browser_raw.json", external, "ext"),
                                 ("meb_health11_browser_raw.json", meb, "meb")):
        path = data_root / "processed" / name
        if not path.exists():
            continue
        for video in json.loads(path.read_text(encoding="utf-8"))["videos"]:
            row = lookup.get(video["source"])
            if row is None or row.get("training_status") != "trainable":
                continue
            items.append({"prefix": prefix, "source": video["source"], "row": row, "views": video["views"],
                          "label": labels[row["class_id"]]})
    return items


def simulate(data_root: Path, manifest_dir: Path, per_view: int, seed: int) -> dict[str, object]:
    config = preprocessing_config()
    labels = {item["classId"]: item for item in label_config("signbridge34-v1")["labels"]}
    out_dir = data_root / OUTPUT_SUBDIR
    out_dir.mkdir(parents=True, exist_ok=True)
    for stale in out_dir.glob("rec_*.npz"):
        stale.unlink()
    rows, rejected = [], Counter()
    for item in _raw_sources(data_root, labels, manifest_dir):
        base = item["row"]
        for view in item["views"]:
            points = np.asarray(view["keypoints"], dtype=np.float32)
            conf = np.asarray(view["confidence"], dtype=np.float32)
            fps = float(view["fps"])
            key = f"{item['prefix']}/{item['source']}/{view['view']}"
            rng = np.random.default_rng([seed, zlib.crc32(key.encode())])
            for index in range(per_view):
                padded_points, padded_conf = pad_recording(points, conf, fps, rng)
                processed, reason = live_sequence(padded_points, padded_conf, fps, config)
                if processed is None:
                    rejected[reason] += 1
                    continue
                safe = item["source"].replace("/", "_").replace("-", "_")
                sample_id = f"rec_{item['prefix']}_{safe}_{view['view'].replace('-', '')}_{index}"
                relative = OUTPUT_SUBDIR / f"{sample_id}.npz"
                label = item["label"]
                np.savez_compressed(data_root / relative, **processed, class_id=np.asarray(label["classId"]),
                                    label_index=np.int64(label["index"]), sample_id=np.asarray(sample_id))
                rows.append({
                    "sample_id": sample_id, "class_id": label["classId"], "model_index": label["index"],
                    "original_class_id": label.get("originalClassId", ""), "source": "RECORDING_SIM",
                    "source_version": "recording-sim-v1", "signer_id": f"rec_{base['signer_id']}",
                    "consent_id": "derived_from_sources", "split": "train", "raw_path": base["raw_path"],
                    "landmark_path": relative.as_posix(), "quality_status": "approved",
                    "training_status": "trainable", "manual_selectable": "true",
                    "risk_tier": label.get("riskTier", "standard"), "source_quality_status": "simulated",
                    "quality_reason": "recording_sim", "avatar_id": base.get("avatar_id", ""),
                    "extractor": "mediapipe-tasks-web", "view": f"recsim-{view['view']}",
                    "derived_signer_id": base["signer_id"], "base_sample_id": base["sample_id"],
                })
    return {"rows": rows, "rejected": dict(rejected)}


def main() -> None:
    parser = argparse.ArgumentParser(description="Gerçek kamera kaydına benzeyen (bekleme + el hareketi) örnekler üretir.")
    parser.add_argument("--data-root")
    parser.add_argument("--manifest-dir", default=str(AI_ROOT / "manifests"))
    parser.add_argument("--output-manifest", default=str(AI_ROOT / "manifests" / "recording_sim_training.csv"))
    parser.add_argument("--per-view", type=int, default=3)
    parser.add_argument("--seed", type=int, default=2026)
    args = parser.parse_args()
    data_root = resolve_data_root(args.data_root)
    result = simulate(data_root, Path(args.manifest_dir), args.per_view, args.seed)
    output = Path(args.output_manifest)
    with output.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDNAMES, lineterminator="\n")
        writer.writeheader()
        writer.writerows(result["rows"])
    summary = {"samples": len(result["rows"]), "rejected": result["rejected"],
               "byClass": dict(Counter(row["class_id"] for row in result["rows"]))}
    write_json(data_root / "reports" / "recording_sim_summary.json", summary)
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
