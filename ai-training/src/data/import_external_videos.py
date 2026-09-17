"""Harici TİD sözlük videolarını (`<veri kökü>/harici/<avatar>/<kaynak>_<sıra>.mp4`) eğitime hazırlar.

- Her video eski Holistic çıkarıcısıyla işlenir; `--browser-landmarks` verilirse canlı kameradaki
  MediaPipe Tasks görünümleri de eklenir (`scripts/extract-browser-landmarks.mjs <veri kökü>/harici ...`).
- MEB hazırlığıyla aynı adımlar uygulanır: ≤5 kare boşluk doldurma, kırpma, kalite kapısı, `landmark46-v1`.
- `signer_id`, dosya adındaki kaynaktır (`ext_<kaynak>`); değerlendirmede bir kaynak tamamen dışarıda
  bırakılabilir (`train_unified --holdout-source ext_<kaynak>`).
- Avatar klasörü sözlükteki sınıfa `symptomExpressionId` ile bağlanır (`diabetes` → `seker`).
- Kullanım izni kullanıcı beyanına dayanır; manifestte `user_reported_permission` yazılır.
"""
from __future__ import annotations

import argparse
import csv
import json
import re
from collections import Counter
from pathlib import Path

import numpy as np

from src.common import AI_ROOT, label_config, preprocessing_config, resolve_data_root, write_json
from src.data.prepare_meb_health import (
    LEGACY_EXTRACTOR, WEB_EXTRACTOR, load_browser_landmarks, prepare_sequence, sha256_file,
)

VIDEO_SUFFIXES = {".mp4", ".webm", ".mov", ".m4v"}
OUTPUT_SUBDIR = Path("processed") / "external_health" / "landmark46-v1"
SOURCE_PATTERN = re.compile(r"^([a-z0-9-]+)_([a-z0-9-]+)$")
FIELDNAMES = [
    "sample_id", "class_id", "model_index", "original_class_id", "source", "source_version", "signer_id",
    "consent_id", "split", "raw_path", "landmark_path", "quality_status", "training_status",
    "manual_selectable", "risk_tier", "source_quality_status", "quality_reason", "avatar_id",
    "source_sha256", "extractor", "view", "source_fps", "source_frames", "trim_start", "trim_end",
    "used_frames", "active_hand", "interpolated_hand_frames", "raw_hand_frame_ratio", "hand_frame_ratio",
    "motion_score",
]


def avatar_classes(vocabulary: str) -> dict[str, dict]:
    config = label_config(vocabulary)
    labels = {item["classId"]: item for item in config["labels"]}
    mapping = {}
    for class_id in config["symptomClassIds"]:
        label = labels[class_id]
        mapping[label.get("symptomExpressionId", class_id)] = label
    return mapping


def discover_videos(root: Path) -> list[tuple[str, str, Path]]:
    """(avatar, kaynak, dosya) listesi; kurala uymayan dosyalar hata verir."""
    found = []
    for folder in sorted(path for path in root.iterdir() if path.is_dir()):
        for video in sorted(folder.iterdir()):
            if not video.is_file() or video.suffix.lower() not in VIDEO_SUFFIXES:
                continue
            match = SOURCE_PATTERN.match(video.stem.lower())
            if not match:
                raise ValueError(f"Dosya adı '<kaynak>_<sıra>' olmalı: {video.relative_to(root)}")
            found.append((folder.name, match.group(1), video))
    return found


def import_videos(data_root: Path, external_dir: Path, manifest_path: Path, vocabulary: str,
                  browser_landmarks: Path | None = None) -> dict[str, object]:
    from src.extract_landmarks import extract_raw_pose

    config = preprocessing_config()
    classes = avatar_classes(vocabulary)
    videos = discover_videos(external_dir)
    if not videos:
        raise ValueError(f"Video bulunamadı: {external_dir}")
    unknown = sorted({avatar for avatar, _, _ in videos} - set(classes))
    if unknown:
        raise ValueError(f"Sözlükte ({vocabulary}) karşılığı olmayan avatar klasörleri: {unknown}")
    browser = load_browser_landmarks(browser_landmarks) if browser_landmarks else {}
    rows: list[dict[str, object]] = []
    skipped: list[dict[str, str]] = []

    def add(avatar: str, source: str, video: Path, digest: str, keypoints: np.ndarray, confidences: np.ndarray,
            fps: float, extractor: str, view: str) -> None:
        label = classes[avatar]
        relative_video = video.relative_to(external_dir).as_posix()
        sample_id = re.sub(r"[^a-z0-9_]", "_", f"ext_{avatar}_{video.stem.lower()}_{view}")
        prepared = prepare_sequence(keypoints, confidences, config)
        quality = prepared["quality"]
        if prepared["processed"] is None:
            skipped.append({"sampleId": sample_id, "reason": quality.reason})
            return
        relative = OUTPUT_SUBDIR / f"{sample_id}.npz"
        target = data_root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(
            target, **prepared["processed"],
            class_id=np.asarray(label["classId"]), label_index=np.int64(label["index"]),
            sample_id=np.asarray(sample_id), preprocessing_version=np.asarray(config["preprocessingVersion"]),
            source_sha256=np.asarray(digest), extractor=np.asarray(extractor),
            trim=np.asarray([prepared["start"], prepared["end"]], dtype=np.int64),
        )
        rows.append({
            "sample_id": sample_id,
            "class_id": label["classId"],
            "model_index": label["index"],
            "original_class_id": label.get("originalClassId", ""),
            "source": "EXTERNAL",
            "source_version": source,
            "signer_id": f"ext_{source}",
            "consent_id": "user_reported_permission",
            "split": "train",
            "raw_path": f"harici/{relative_video}",
            "landmark_path": relative.as_posix(),
            "quality_status": quality.status,
            "training_status": "trainable",
            "manual_selectable": "true",
            "risk_tier": label.get("riskTier", "standard"),
            "source_quality_status": prepared["raw_quality"].status,
            "quality_reason": quality.reason,
            "avatar_id": avatar,
            "source_sha256": digest,
            "extractor": extractor,
            "view": view,
            "source_fps": round(float(fps), 3),
            "source_frames": len(keypoints),
            "trim_start": prepared["start"],
            "trim_end": prepared["end"],
            "used_frames": prepared["end"] - prepared["start"],
            "active_hand": prepared["active_hand"],
            "interpolated_hand_frames": prepared["interpolated"],
            "raw_hand_frame_ratio": round(prepared["raw_quality"].hand_frame_ratio, 4),
            "hand_frame_ratio": round(quality.hand_frame_ratio, 4),
            "motion_score": round(quality.motion_score, 4),
        })

    for avatar, source, video in videos:
        digest = sha256_file(video)
        keypoints, confidences, fps = extract_raw_pose(video)
        add(avatar, source, video, digest, keypoints, confidences, fps, LEGACY_EXTRACTOR, "legacy")
        if not browser:
            continue
        key = video.relative_to(external_dir).with_suffix("").as_posix()
        record = browser.get(key)
        if record is None:
            raise ValueError(f"Tarayıcı landmark dosyasında {key} yok; aracı harici klasörle yeniden çalıştırın.")
        if record["sha256"] != digest:
            raise ValueError(f"{key}: tarayıcı landmarkları farklı bir dosyadan üretilmiş.")
        for view in record["views"]:
            points = np.asarray(view["keypoints"], dtype=np.float32)
            conf = np.asarray(view["confidence"], dtype=np.float32)
            if points.ndim != 3 or points.shape[1:] != (75, 2) or conf.shape != points.shape[:2]:
                raise ValueError(f"{key}/{view['view']}: geçersiz landmark biçimi")
            add(avatar, source, video, digest, points, conf, float(view["fps"]), WEB_EXTRACTOR, str(view["view"]))

    if not rows:
        raise ValueError("Hiçbir video kalite kapısını geçmedi.")
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    with manifest_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(rows)
    videos_by_avatar: dict[str, set[str]] = {}
    for row in rows:
        videos_by_avatar.setdefault(str(row["avatar_id"]), set()).add(str(row["signer_id"]))
    summary = {
        "vocabularyVersion": vocabulary,
        "videos": len(videos),
        "views": len(rows),
        "extractors": sorted({row["extractor"] for row in rows}),
        "sources": sorted({row["signer_id"] for row in rows}),
        "sourcesPerAvatar": {avatar: sorted(sources) for avatar, sources in sorted(videos_by_avatar.items())},
        "avatarsWithoutVideo": sorted(set(classes) - set(videos_by_avatar)),
        "viewsPerClass": dict(Counter(str(row["class_id"]) for row in rows)),
        "skippedViews": skipped,
        "consent": "user_reported_permission",
    }
    write_json(manifest_path.with_name(manifest_path.stem + "_summary.json"), summary)
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Harici TİD videolarını birleşik model için hazırlar.")
    parser.add_argument("--data-root")
    parser.add_argument("--external-dir", help="Varsayılan: <data-root>/harici")
    parser.add_argument("--manifest", default=str(AI_ROOT / "manifests" / "external_health_training.csv"))
    parser.add_argument("--vocabulary", default="signbridge34-v1")
    parser.add_argument("--browser-landmarks", help="scripts/extract-browser-landmarks.mjs çıktısı")
    args = parser.parse_args()
    data_root = resolve_data_root(args.data_root)
    summary = import_videos(
        data_root,
        Path(args.external_dir).resolve() if args.external_dir else data_root / "harici",
        Path(args.manifest).resolve(),
        args.vocabulary,
        Path(args.browser_landmarks).resolve() if args.browser_landmarks else None,
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
