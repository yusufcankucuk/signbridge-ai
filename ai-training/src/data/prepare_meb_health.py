"""MEB sağlık referanslarını birleşik 30 sınıflı model için hazırlar.

Her video için:
- kaynak SHA-256, indirme tarihi ve kaynak adresi manifeste yazılır,
- aktif el, el landmark yol uzunluğuyla belirlenir,
- en fazla 5 karelik kısa el/omuz kayıpları doğrusal enterpolasyonla doldurulur
  (daha uzun kayıplar olduğu gibi bırakılır),
- işaretten önceki/sonraki ellerin görünmediği boş kareler kırpılır,
- `landmark46-v1` ön işlemesi uygulanır; yatay çevirme yapılmaz,
- düşük görünürlüklü videolar için iskelet bindirmeli kontrol görseli veri kökünde üretilir,
- isteğe bağlı olarak aynı videoların canlı kameradaki tarayıcı çıkarıcısıyla (MediaPipe Tasks)
  üretilmiş görünümleri de aynı adımlardan geçirilip manifeste eklenir. Bu görünümler yeni
  katılımcı değildir; tek referansın farklı çıkarıcı/kare hızı örnekleridir.

Ham videolar ve NPZ dosyaları Git'e eklenmez; yalnız manifest ve özet depoda tutulur.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from src.common import AI_ROOT, label_config, preprocessing_config, resolve_data_root, write_json
from src.data.preprocessing import assess_quality, preprocess_pose_sequence

SOURCE_URL = "https://orgm.meb.gov.tr/icdep/saglik-tematik-sozlukleri-107"
SOURCE_VERSION = "MEB_Saglik_Tematik_Sozluk_2026-09"
OUTPUT_SUBDIR = Path("processed") / "meb_health11" / "landmark46-v1"
MAX_GAP_FRAMES = 5
TRIM_MARGIN_FRAMES = 3
LEFT_HAND = slice(33, 54)
RIGHT_HAND = slice(54, 75)
POSE_POINTS = (11, 12, 13, 14)
# Plan gereği iskelet bindirmesiyle ayrıca incelenecek videolar.
LEGACY_EXTRACTOR = "mediapipe-holistic-legacy"
WEB_EXTRACTOR = "mediapipe-tasks-web"
REVIEW_OVERLAY_SOURCES = {"kalp-carpintisi", "kalp-krizi", "kusma", "seker-hastaligi"}


@dataclass(frozen=True)
class MebEntry:
    source: str
    class_id: str
    signer_id: str


ENTRIES = (
    MebEntry("bas-donmesi", "dizziness", "meb_official_01"),
    MebEntry("ates", "fever", "meb_official_01"),
    MebEntry("agri", "pain", "meb_official_01"),
    MebEntry("astim", "asthma", "meb_official_02"),
    MebEntry("dokuntu-alerji-icin", "rash", "meb_official_01"),
    MebEntry("kalp-carpintisi", "palpitations", "meb_official_01"),
    MebEntry("kalp-krizi", "heart-attack", "meb_official_01"),
    MebEntry("kanama", "bleeding", "meb_official_01"),
    MebEntry("kusma", "vomiting", "meb_official_01"),
    MebEntry("seker-hastaligi", "seker", "meb_official_01"),
    MebEntry("yanik", "burn", "meb_official_01"),
)

FIELDNAMES = [
    "sample_id", "class_id", "model_index", "original_class_id", "source", "source_version", "signer_id",
    "consent_id", "split", "raw_path", "landmark_path", "quality_status", "training_status",
    "manual_selectable", "risk_tier", "source_quality_status", "quality_reason", "source_url",
    "downloaded_at", "source_sha256", "extractor", "view", "source_fps", "source_frames", "trim_start", "trim_end",
    "used_frames", "active_hand", "interpolated_hand_frames", "raw_hand_frame_ratio", "hand_frame_ratio",
    "motion_score", "review_overlay",
]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def hand_visible(confidences: np.ndarray, block: slice, minimum: float = 0.1) -> np.ndarray:
    return (confidences[:, block] >= minimum).any(axis=1)


def hand_path_length(keypoints: np.ndarray, confidences: np.ndarray, block: slice) -> float:
    visible = hand_visible(confidences, block)
    pairs = visible[:-1] & visible[1:]
    if not pairs.any():
        return 0.0
    centers = keypoints[:, block, :].mean(axis=1)
    steps = np.linalg.norm(np.diff(centers, axis=0), axis=1)
    return float(steps[pairs].sum())


def active_hand(keypoints: np.ndarray, confidences: np.ndarray) -> str:
    left = hand_path_length(keypoints, confidences, LEFT_HAND)
    right = hand_path_length(keypoints, confidences, RIGHT_HAND)
    if left == 0.0 and right == 0.0:
        return "none"
    return "left" if left > right else "right"


def _short_gaps(visible: np.ndarray, max_gap: int) -> list[tuple[int, int]]:
    """İki görünür kare arasında kalan, en fazla `max_gap` uzunluktaki boşluklar."""
    gaps: list[tuple[int, int]] = []
    index = 0
    frames = len(visible)
    while index < frames:
        if visible[index]:
            index += 1
            continue
        start = index
        while index < frames and not visible[index]:
            index += 1
        end = index  # dışlayıcı
        if start > 0 and end < frames and end - start <= max_gap:
            gaps.append((start, end))
    return gaps


def interpolate_short_gaps(
    keypoints: np.ndarray, confidences: np.ndarray, max_gap: int = MAX_GAP_FRAMES
) -> tuple[np.ndarray, np.ndarray, int]:
    points = keypoints.astype(np.float32).copy()
    conf = confidences.astype(np.float32).copy()
    filled = 0
    for block in (LEFT_HAND, RIGHT_HAND):
        visible = hand_visible(conf, block)
        for start, end in _short_gaps(visible, max_gap):
            before, after = points[start - 1, block, :], points[end, block, :]
            for offset, frame in enumerate(range(start, end), start=1):
                weight = offset / (end - start + 1)
                points[frame, block, :] = before + (after - before) * weight
                conf[frame, block] = np.minimum(conf[start - 1, block], conf[end, block])
            filled += end - start
    for point in POSE_POINTS:
        visible = conf[:, point] >= 0.1
        for start, end in _short_gaps(visible, max_gap):
            before, after = points[start - 1, point, :], points[end, point, :]
            for offset, frame in enumerate(range(start, end), start=1):
                weight = offset / (end - start + 1)
                points[frame, point, :] = before + (after - before) * weight
                conf[frame, point] = min(conf[start - 1, point], conf[end, point])
    return points, conf, filled


def trim_bounds(confidences: np.ndarray, minimum_frames: int, margin: int = TRIM_MARGIN_FRAMES) -> tuple[int, int]:
    """Ellerin hiç görünmediği baş/son boş kareleri atar; dışlayıcı bitiş döner."""
    visible = hand_visible(confidences, LEFT_HAND) | hand_visible(confidences, RIGHT_HAND)
    frames = len(confidences)
    if not visible.any():
        return 0, frames
    indexes = np.flatnonzero(visible)
    start = max(0, int(indexes[0]) - margin)
    end = min(frames, int(indexes[-1]) + 1 + margin)
    if end - start < minimum_frames:
        return 0, frames
    return start, end


def draw_overlay(video_path: Path, keypoints: np.ndarray, confidences: np.ndarray,
                 start: int, end: int, output_path: Path, columns: int = 4, rows: int = 2) -> None:
    import cv2

    capture = cv2.VideoCapture(str(video_path))
    frames = []
    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                break
            frames.append(frame)
    finally:
        capture.release()
    if not frames:
        return
    picks = np.linspace(start, max(start, min(end, len(frames)) - 1), columns * rows).astype(int)
    tiles = []
    for pick in picks:
        image = frames[pick].copy()
        height, width = image.shape[:2]
        point = lambda index: (int(keypoints[pick, index, 0] * width), int(keypoints[pick, index, 1] * height))  # noqa: E731
        for a, b in ((11, 12), (11, 13), (12, 14)):
            if confidences[pick, a] >= 0.1 and confidences[pick, b] >= 0.1:
                cv2.line(image, point(a), point(b), (255, 200, 0), 2)
        for block, color in ((LEFT_HAND, (0, 200, 255)), (RIGHT_HAND, (80, 255, 80))):
            for index in range(block.start, block.stop):
                if confidences[pick, index] >= 0.1:
                    cv2.circle(image, point(index), 2, color, -1)
        cv2.putText(image, f"kare {pick}", (8, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
        scale = 320 / width
        tiles.append(cv2.resize(image, (320, int(height * scale))))
    tile_height = min(tile.shape[0] for tile in tiles)
    tiles = [tile[:tile_height] for tile in tiles]
    grid = np.vstack([np.hstack(tiles[row * columns:(row + 1) * columns]) for row in range(rows)])
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(output_path), grid)


def quality_options(config: dict) -> dict[str, float]:
    return dict(
        minimum_confidence=config["minimumConfidence"],
        minimum_frames=config["minimumSequenceFrames"],
        minimum_shoulder_ratio=config["minimumShoulderFrameRatio"],
        minimum_hand_ratio=config["minimumHandFrameRatio"],
        minimum_motion_score=config["minimumMotionScore"],
    )


def prepare_sequence(keypoints: np.ndarray, confidences: np.ndarray, config: dict) -> dict[str, object]:
    """Kısa boşluk doldurma → kırpma → kalite → `landmark46-v1` ön işleme (tüm kaynaklar için ortak)."""
    options = quality_options(config)
    raw_quality = assess_quality(keypoints, confidences, **options)
    filled_points, filled_conf, interpolated = interpolate_short_gaps(keypoints, confidences)
    start, end = trim_bounds(filled_conf, config["minimumSequenceFrames"])
    used_points, used_conf = filled_points[start:end], filled_conf[start:end]
    quality = assess_quality(used_points, used_conf, **options)
    result: dict[str, object] = {
        "raw_quality": raw_quality, "quality": quality, "interpolated": interpolated,
        "start": start, "end": end, "active_hand": active_hand(used_points, used_conf), "processed": None,
    }
    if quality.status != "rejected":
        result["processed"] = preprocess_pose_sequence(
            used_points, used_conf,
            target_length=config["sequenceLength"], minimum_confidence=config["minimumConfidence"],
        )
    return result


def load_browser_landmarks(path: Path) -> dict[str, dict]:
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    if payload.get("schemaVersion") != "signbridge-browser-landmarks-v1" or payload.get("extractor") != WEB_EXTRACTOR:
        raise ValueError("Tarayıcı landmark dosyası beklenen şemada değil.")
    return {item["source"]: item for item in payload["videos"]}


def prepare(data_root: Path, meb_dir: Path, manifest_path: Path, overlay_dir: Path,
            downloaded_at: str, overlay_all: bool = False, browser_landmarks: Path | None = None) -> dict[str, object]:
    from src.extract_landmarks import extract_raw_pose

    config = preprocessing_config()
    unified = label_config("signbridge30-v1")
    labels = {item["classId"]: item for item in unified["labels"]}
    rows: list[dict[str, object]] = []
    details: list[dict[str, object]] = []
    browser = load_browser_landmarks(browser_landmarks) if browser_landmarks else {}
    skipped: list[dict[str, object]] = []

    def prepare_view(entry: MebEntry, video: Path, digest: str, keypoints: np.ndarray, confidences: np.ndarray,
                     fps: float, extractor: str, view: str, sample_id: str, allow_overlay: bool) -> None:
        label = labels[entry.class_id]
        prepared = prepare_sequence(keypoints, confidences, config)
        raw_quality, quality = prepared["raw_quality"], prepared["quality"]
        interpolated, start, end = prepared["interpolated"], prepared["start"], prepared["end"]
        processed = prepared["processed"]
        if processed is None:
            skipped.append({"sampleId": sample_id, "reason": quality.reason})
            return
        relative = OUTPUT_SUBDIR / f"{sample_id}.npz"
        target = data_root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(
            target,
            **processed,
            class_id=np.asarray(entry.class_id),
            label_index=np.int64(label["index"]),
            sample_id=np.asarray(sample_id),
            preprocessing_version=np.asarray(config["preprocessingVersion"]),
            source_sha256=np.asarray(digest),
            extractor=np.asarray(extractor),
            trim=np.asarray([start, end], dtype=np.int64),
        )
        overlay = ""
        if allow_overlay and (overlay_all or entry.source in REVIEW_OVERLAY_SOURCES or quality.status != "approved"):
            overlay_path = overlay_dir / f"{entry.source}.jpg"
            draw_overlay(video, keypoints, confidences, start, end, overlay_path)
            try:
                overlay = overlay_path.relative_to(data_root).as_posix()
            except ValueError:
                overlay = overlay_path.as_posix()
        row = {
            "sample_id": sample_id,
            "class_id": entry.class_id,
            "model_index": label["index"],
            "original_class_id": label.get("originalClassId", ""),
            "source": "MEB",
            "source_version": SOURCE_VERSION,
            "signer_id": entry.signer_id,
            "consent_id": "official_source_permission_unverified",
            "split": "train",
            "raw_path": f"meb/{entry.source}.mp4",
            "landmark_path": relative.as_posix(),
            "quality_status": quality.status,
            "training_status": "trainable",
            "manual_selectable": "true",
            "risk_tier": label.get("riskTier", "standard"),
            "source_quality_status": raw_quality.status,
            "quality_reason": quality.reason,
            "source_url": SOURCE_URL,
            "downloaded_at": downloaded_at,
            "source_sha256": digest,
            "extractor": extractor,
            "view": view,
            "source_fps": round(float(fps), 3),
            "source_frames": len(keypoints),
            "trim_start": start,
            "trim_end": end,
            "used_frames": end - start,
            "active_hand": prepared["active_hand"],
            "interpolated_hand_frames": interpolated,
            "raw_hand_frame_ratio": round(raw_quality.hand_frame_ratio, 4),
            "hand_frame_ratio": round(quality.hand_frame_ratio, 4),
            "motion_score": round(quality.motion_score, 4),
            "review_overlay": overlay,
        }
        rows.append(row)
        details.append({key: row[key] for key in (
            "sample_id", "class_id", "extractor", "view", "quality_status", "source_quality_status",
            "quality_reason", "raw_hand_frame_ratio", "hand_frame_ratio", "used_frames", "source_frames",
            "interpolated_hand_frames", "active_hand", "review_overlay",
        )})

    for entry in ENTRIES:
        video = meb_dir / f"{entry.source}.mp4"
        if not video.is_file():
            raise FileNotFoundError(f"MEB videosu bulunamadı: {video}")
        digest = sha256_file(video)
        keypoints, confidences, fps = extract_raw_pose(video)
        base_id = f"meb_{entry.source.replace('-', '_')}"
        prepare_view(entry, video, digest, keypoints, confidences, fps, LEGACY_EXTRACTOR, "legacy-25fps",
                     f"{base_id}_health01", allow_overlay=True)
        if not browser:
            continue
        record = browser.get(entry.source)
        if record is None:
            raise ValueError(f"Tarayıcı landmark dosyasında {entry.source} yok.")
        if record["sha256"] != digest:
            raise ValueError(f"{entry.source}: tarayıcı landmarkları farklı bir video dosyasından üretilmiş.")
        for view in record["views"]:
            view_points = np.asarray(view["keypoints"], dtype=np.float32)
            view_conf = np.asarray(view["confidence"], dtype=np.float32)
            if view_points.ndim != 3 or view_points.shape[1:] != (75, 2) or view_conf.shape != view_points.shape[:2]:
                raise ValueError(f"{entry.source}/{view['view']}: geçersiz landmark biçimi")
            prepare_view(entry, video, digest, view_points, view_conf, float(view["fps"]), WEB_EXTRACTOR,
                         str(view["view"]), f"{base_id}_{str(view['view']).replace('-', '_')}", allow_overlay=False)

    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    with manifest_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(rows)
    summary = {
        "total": len(rows),
        "referenceVideos": len({row["raw_path"] for row in rows}),
        "extractors": sorted({row["extractor"] for row in rows}),
        "skippedViews": skipped,
        "sourceUrl": SOURCE_URL,
        "downloadedAt": downloaded_at,
        "preprocessingVersion": config["preprocessingVersion"],
        "maxInterpolatedGapFrames": MAX_GAP_FRAMES,
        "trimMarginFrames": TRIM_MARGIN_FRAMES,
        "horizontalFlip": False,
        "statuses": {status: sum(r["quality_status"] == status for r in rows) for status in ("approved", "needs_review")},
        "licenseStatus": "MEB kullanım/dağıtım izni doğrulanmadı; model ağırlıkları açık yayımlanmamalı.",
        "independentTest": False,
        "details": details,
    }
    write_json(manifest_path.with_name("meb_health11_summary.json"), summary)
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="11 MEB sağlık videosunu birleşik model için hazırlar.")
    parser.add_argument("--data-root", help="NPZ çıktılarının yazılacağı veri kökü")
    parser.add_argument("--meb-dir", help="MEB videoları (varsayılan: <data-root>/meb)")
    parser.add_argument("--manifest", default=str(AI_ROOT / "manifests" / "meb_health11_training.csv"))
    parser.add_argument("--overlay-dir", help="İskelet bindirme görselleri (varsayılan: <data-root>/reports/meb_health11_overlays;"
                        " MEB karelerini içerdiği için depoya eklenmez)")
    parser.add_argument("--downloaded-at", default="2026-09-04",
                        help="Videoların MEB sayfasından indirildiği tarih (varsayılan: yerel dosya tarihi)")
    parser.add_argument("--overlay-all", action="store_true")
    parser.add_argument("--browser-landmarks", help="scripts/extract-browser-landmarks.mjs çıktısı (canlı çıkarıcı görünümleri)")
    args = parser.parse_args()
    data_root = resolve_data_root(args.data_root)
    summary = prepare(
        data_root,
        Path(args.meb_dir).resolve() if args.meb_dir else data_root / "meb",
        Path(args.manifest).resolve(),
        Path(args.overlay_dir).resolve() if args.overlay_dir else data_root / "reports" / "meb_health11_overlays",
        args.downloaded_at,
        args.overlay_all,
        Path(args.browser_landmarks).resolve() if args.browser_landmarks else None,
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
