"""Doktor sorularına kamerayla yanıt için gereken işaret videolarını eğitime hazırlar.

Klasör düzeni: `<yanıt kökü>/<classId>/<kaynak>_<sıra>.mp4`
(ör. `yanit_ham/sayi-3/meb_1.mp4`, `yanit_ham/sayi-3/sts_1.mp4`).

Belirti videolarından farkı: klasör adı doğrudan sözlükteki `classId`'dir (avatar eşlemesi yoktur)
ve yalnız canlı kameradaki tarayıcı çıkarıcısının (`scripts/extract-browser-landmarks.mjs`)
görünümleri kullanılır — yanıt işaretleri küçük ve kısa olduğu için eski Holistic çıkarıcısının
ek bir katkısı ölçülmedi.

Kullanım izni kullanıcı beyanına dayanır; manifeste `user_reported_permission` yazılır.
"""
from __future__ import annotations

import argparse
import csv
import re
from collections import Counter
from pathlib import Path

import numpy as np

from src.common import AI_ROOT, label_config, preprocessing_config, resolve_data_root, write_json
from src.data.prepare_meb_health import WEB_EXTRACTOR, load_browser_landmarks, prepare_sequence, sha256_file

VIDEO_SUFFIXES = {".mp4", ".webm", ".mov", ".m4v"}
OUTPUT_SUBDIR = Path("processed") / "answer_vocabulary" / "landmark46-v1"
SOURCE_PATTERN = re.compile(r"^([a-z0-9-]+)_([0-9]+)$")
FIELDNAMES = [
    "sample_id", "class_id", "model_index", "original_class_id", "source", "source_version", "signer_id",
    "consent_id", "split", "raw_path", "landmark_path", "quality_status", "training_status",
    "manual_selectable", "risk_tier", "source_quality_status", "quality_reason", "extractor", "view",
    "source_fps", "source_frames", "trim_start", "trim_end", "used_frames", "active_hand",
    "interpolated_hand_frames", "raw_hand_frame_ratio", "hand_frame_ratio", "motion_score",
]


def discover_videos(root: Path) -> list[tuple[str, str, Path]]:
    """(classId, kaynak, dosya) listesi."""
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


def import_videos(data_root: Path, answer_dir: Path, manifest_path: Path, vocabulary: str,
                  browser_landmarks: Path) -> dict[str, object]:
    config = preprocessing_config()
    labels = {item["classId"]: item for item in label_config(vocabulary)["labels"]}
    videos = discover_videos(answer_dir)
    if not videos:
        raise ValueError(f"Video bulunamadı: {answer_dir}")
    unknown = sorted({class_id for class_id, _, _ in videos} - set(labels))
    if unknown:
        raise ValueError(f"Sözlükte ({vocabulary}) karşılığı olmayan klasörler: {unknown}")
    browser = load_browser_landmarks(browser_landmarks)
    rows: list[dict[str, object]] = []
    skipped: list[dict[str, str]] = []

    for class_id, source, video in videos:
        label = labels[class_id]
        digest = sha256_file(video)
        key = video.relative_to(answer_dir).with_suffix("").as_posix()
        record = browser.get(key)
        if record is None:
            raise ValueError(f"Tarayıcı landmark dosyasında {key} yok; aracı yanıt klasörüyle çalıştırın.")
        if record["sha256"] != digest:
            raise ValueError(f"{key}: tarayıcı landmarkları farklı bir dosyadan üretilmiş.")
        for view in record["views"]:
            points = np.asarray(view["keypoints"], dtype=np.float32)
            confidences = np.asarray(view["confidence"], dtype=np.float32)
            if points.ndim != 3 or points.shape[1:] != (75, 2) or confidences.shape != points.shape[:2]:
                raise ValueError(f"{key}/{view['view']}: geçersiz landmark biçimi")
            sample_id = re.sub(r"[^a-z0-9_]", "_", f"ans_{class_id}_{video.stem.lower()}_{view['view']}")
            prepared = prepare_sequence(points, confidences, config)
            quality = prepared["quality"]
            if prepared["processed"] is None:
                skipped.append({"sampleId": sample_id, "reason": quality.reason})
                continue
            relative = OUTPUT_SUBDIR / f"{sample_id}.npz"
            target = data_root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            np.savez_compressed(
                target, **prepared["processed"],
                class_id=np.asarray(label["classId"]), label_index=np.int64(label["index"]),
                sample_id=np.asarray(sample_id), preprocessing_version=np.asarray(config["preprocessingVersion"]),
                source_sha256=np.asarray(digest), extractor=np.asarray(WEB_EXTRACTOR),
                trim=np.asarray([prepared["start"], prepared["end"]], dtype=np.int64),
            )
            rows.append({
                "sample_id": sample_id, "class_id": label["classId"], "model_index": label["index"],
                "original_class_id": label.get("originalClassId", ""), "source": "ANSWER",
                "source_version": source, "signer_id": f"ans_{source}",
                "consent_id": "user_reported_permission", "split": "train",
                "raw_path": f"yanit_ham/{video.relative_to(answer_dir).as_posix()}",
                "landmark_path": relative.as_posix(), "quality_status": quality.status,
                "training_status": "trainable", "manual_selectable": "true",
                "risk_tier": label.get("riskTier", "standard"),
                "source_quality_status": prepared["raw_quality"].status, "quality_reason": quality.reason,
                "extractor": WEB_EXTRACTOR, "view": str(view["view"]),
                "source_fps": round(float(view["fps"]), 3), "source_frames": len(points),
                "trim_start": prepared["start"], "trim_end": prepared["end"],
                "used_frames": prepared["end"] - prepared["start"], "active_hand": prepared["active_hand"],
                "interpolated_hand_frames": prepared["interpolated"],
                "raw_hand_frame_ratio": round(prepared["raw_quality"].hand_frame_ratio, 4),
                "hand_frame_ratio": round(quality.hand_frame_ratio, 4),
                "motion_score": round(quality.motion_score, 4),
            })

    if not rows:
        raise ValueError("Hiçbir video kalite kapısını geçmedi.")
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    with manifest_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDNAMES, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    by_class: dict[str, set[str]] = {}
    for row in rows:
        by_class.setdefault(str(row["class_id"]), set()).add(str(row["signer_id"]))
    answer_classes = set(label_config(vocabulary).get("answerClassIds", []))
    summary = {
        "vocabularyVersion": vocabulary, "videos": len(videos), "views": len(rows),
        "sources": sorted({str(row["signer_id"]) for row in rows}),
        "signersPerClass": {class_id: sorted(sources) for class_id, sources in sorted(by_class.items())},
        "answerClassesWithoutVideo": sorted(answer_classes - set(by_class)),
        "viewsPerClass": dict(Counter(str(row["class_id"]) for row in rows)),
        "skippedViews": skipped, "consent": "user_reported_permission",
    }
    write_json(manifest_path.with_name(manifest_path.stem + "_summary.json"), summary)
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Yanıt sözlüğü videolarını birleşik model için hazırlar.")
    parser.add_argument("--data-root")
    parser.add_argument("--answer-dir", help="Varsayılan: <data-root>/yanit_ham")
    parser.add_argument("--manifest", default=str(AI_ROOT / "manifests" / "answer_vocabulary_training.csv"))
    parser.add_argument("--vocabulary", default="signbridge71-v1")
    parser.add_argument("--browser-landmarks", required=True,
                        help="scripts/extract-browser-landmarks.mjs çıktısı (yanıt klasörü için)")
    args = parser.parse_args()
    data_root = resolve_data_root(args.data_root)
    answer_dir = Path(args.answer_dir).resolve() if args.answer_dir else data_root / "yanit_ham"
    summary = import_videos(data_root, answer_dir, Path(args.manifest).resolve(), args.vocabulary,
                            Path(args.browser_landmarks).resolve())
    print(f"{summary['videos']} video → {summary['views']} görünüm; "
          f"atlanan {len(summary['skippedViews'])}; kaynaklar {summary['sources']}")


if __name__ == "__main__":
    main()
