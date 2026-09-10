"""Isolated-sign video/camera probe. No raw frames/landmarks are persisted."""
from __future__ import annotations

import argparse
import csv
import threading
import time
from pathlib import Path

import numpy as np

from src.common import autsl_labels, load_json, preprocessing_config
from src.data.preprocessing import assess_quality, preprocess_pose_sequence
from src.extract_landmarks import extract_frames, extract_raw_pose
from src.model.predict import predict_landmarks, validate_bundle


FIELDS = ["trial_id", "expected_class", "condition", "repeat", "signer_code", "evaluation_group",
          "performance_verified", "source_kind", "quality_status", "quality_reason",
          "shoulder_ratio", "hand_ratio", "frames", "predicted_class", "confidence", "accepted",
          "correct", "extraction_ms", "preprocessing_ms", "inference_ms", "after_capture_ms", "status"]


def trial_matrix():
    return [dict(trial_id=f"{name}-{condition}-{repeat}", expected_class=name, condition=condition,
                 repeat=repeat, signer_code="", evaluation_group="development", performance_verified="unknown",
                 status="pending")
            for name in ["doktor", "hasta", "hayir", "evet", "ilac"]
            for condition in ["normal", "low_light", "far", "slow", "fast"] for repeat in [1, 2]]


def save_rows(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)


def capture_camera(index=0, max_seconds=12):
    import cv2
    input("Tek izole işaret için ENTER ile kamerayı başlatın (ham kayıt diske yazılmaz): ")
    stop = threading.Event()
    def wait_stop():
        input("Kayıt başladı. Bitirmek için ENTER (en çok 12 saniye): ")
        stop.set()
    capture = cv2.VideoCapture(index)
    frames = []
    try:
        if not capture.isOpened():
            raise ValueError("Kamera açılamadı.")
        capture.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        capture.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        threading.Thread(target=wait_stop, daemon=True).start()
        started = time.perf_counter()
        while not stop.is_set() and time.perf_counter() - started < max_seconds and len(frames) < 360:
            ok, frame = capture.read()
            if not ok:
                break
            # No mirroring. Limit memory even if driver ignores requested size.
            scale = min(640 / frame.shape[1], 480 / frame.shape[0], 1.0)
            frames.append(cv2.resize(frame, (int(frame.shape[1]*scale), int(frame.shape[0]*scale))))
        return frames
    finally:
        capture.release()


def evaluate_raw(model, runtime, points, confidences):
    config = preprocessing_config()
    start = time.perf_counter()
    quality = assess_quality(points, confidences, minimum_confidence=config["minimumConfidence"],
                             minimum_frames=config["minimumSequenceFrames"],
                             minimum_shoulder_ratio=config["minimumShoulderFrameRatio"],
                             minimum_hand_ratio=config["minimumHandFrameRatio"])
    row = dict(quality_status=quality.status, quality_reason=quality.reason,
               shoulder_ratio=quality.shoulder_frame_ratio, hand_ratio=quality.hand_frame_ratio,
               frames=len(points), status="quality_blocked", accepted=False)
    if quality.status != "approved":
        return row
    processed = preprocess_pose_sequence(points, confidences, target_length=config["sequenceLength"],
                                         minimum_confidence=config["minimumConfidence"])
    row["preprocessing_ms"] = (time.perf_counter() - start) * 1000
    start = time.perf_counter()
    result = predict_landmarks(model, processed["landmarks"], processed["mask"], runtime)
    row.update(inference_ms=(time.perf_counter() - start) * 1000, predicted_class=result["classId"],
               confidence=result["confidence"], accepted=not result["isLowConfidence"], status="measured")
    return row


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--matrix", action="store_true")
    source = parser.add_mutually_exclusive_group()
    source.add_argument("--video", type=Path)
    source.add_argument("--camera", type=int)
    parser.add_argument("--model", type=Path, default=Path("outputs/saved_model"))
    parser.add_argument("--runtime", type=Path, default=Path("outputs/runtime_config.json"))
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--expected-class", default="unknown")
    parser.add_argument("--condition", default="reference")
    parser.add_argument("--trial-id", default="trial-1")
    parser.add_argument("--repeat", type=int, choices=[1, 2], default=1)
    parser.add_argument("--signer-code", default="anonymous")
    parser.add_argument("--group", choices=["development", "holdout", "reference"], default="development")
    parser.add_argument("--performance-verified", choices=["yes", "no", "unknown"], default="unknown")
    args = parser.parse_args()
    if args.matrix:
        save_rows(args.output, trial_matrix())
        return
    if args.video is None and args.camera is None:
        parser.error("--video veya --camera gerekli.")
    if args.output.exists():
        parser.error("Çıktı zaten var; yeni deneme adı kullanın.")
    import tensorflow as tf
    model = tf.keras.models.load_model(str(args.model))
    runtime = load_json(args.runtime)
    validate_bundle(model, runtime, autsl_labels())
    row = dict(trial_id=args.trial_id, expected_class=args.expected_class, condition=args.condition,
               repeat=args.repeat,
               signer_code=args.signer_code, evaluation_group=args.group,
               performance_verified=args.performance_verified, source_kind="video" if args.video else "camera")
    try:
        # For camera the timer starts AFTER capture; model is already loaded.
        frames = capture_camera(args.camera) if args.camera is not None else None
        start = time.perf_counter()
        if frames is not None:
            points, confidence = extract_frames(frames)
            frames.clear()
        else:
            points, confidence, _ = extract_raw_pose(args.video)
        extraction_ms = (time.perf_counter() - start) * 1000
        row.update(evaluate_raw(model, runtime, points, confidence))
        row.update(extraction_ms=extraction_ms, after_capture_ms=(time.perf_counter() - start) * 1000)
        if args.performance_verified == "yes" and args.expected_class in {x["classId"] for x in autsl_labels()}:
            row["correct"] = row.get("predicted_class") == args.expected_class
    except (ValueError, RuntimeError) as exc:
        row.update(status="error", quality_reason=type(exc).__name__)
    save_rows(args.output, [row])
    print({k: v for k, v in row.items() if k not in {"signer_code"}})


if __name__ == "__main__":
    main()
