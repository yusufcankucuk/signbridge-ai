"""Repeatable isolated-sign video/camera trials; raw frames and landmarks are never persisted."""
from __future__ import annotations

import argparse
import csv
import threading
import time
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from src.common import autsl_labels, load_json, preprocessing_config
from src.data.preprocessing import assess_quality, preprocess_pose_sequence
from src.decision_policy import load_policy
from src.extract_landmarks import extract_frames, extract_raw_pose
from src.model.predict import predict_landmarks, validate_bundle


CLASSES = ["doktor", "hasta", "hayir", "evet", "ilac"]
CONDITIONS = ["normal", "low_light", "far", "slow", "fast"]
FIELDS = [
    "trial_id", "planned", "participant_code", "expected_class", "condition", "repeat",
    "evaluation_group", "performance_verified", "motion_label", "source_kind", "quality_status", "quality_reason",
    "shoulder_ratio", "hand_ratio", "motion_score", "frames", "capture_seconds", "captured_fps", "capture_stop_reason",
    "predicted_class", "confidence", "accepted", "correct", "rejection_reason", "decision_policy_version",
    "model_load_ms", "warmup_ms", "extraction_ms", "preprocessing_ms", "inference_ms",
    "after_capture_ms", "status",
]


@dataclass
class CameraCapture:
    frames: list[np.ndarray]
    timestamps: list[float]
    duration_seconds: float
    stop_reason: str


def trial_matrix(development_participant="p01", holdout_participant="p02"):
    rows = []
    for group, participant in [("development", development_participant), ("holdout", holdout_participant)]:
        for name in CLASSES:
            for condition in CONDITIONS:
                rows.append(
                    {
                        "trial_id": f"{group}-{participant}-{name}-{condition}-1",
                        "planned": True,
                        "participant_code": participant,
                        "expected_class": name,
                        "condition": condition,
                        "repeat": 1,
                        "evaluation_group": group,
                        "performance_verified": "unknown",
                        "status": "pending",
                    }
                )
    return rows


def save_rows(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)


def capture_camera(index=0, max_seconds=12, max_frames=360):
    import cv2

    input("Tek izole işaret için ENTER ile kamerayı başlatın (önerilen süre 2-4 saniye; ham kayıt yazılmaz): ")
    stop = threading.Event()

    def wait_stop():
        input("Kayıt başladı. Hareket bütünüyle bittikten sonra ENTER'a basın (üst sınır 12 saniye): ")
        stop.set()

    capture = cv2.VideoCapture(index)
    frames: list[np.ndarray] = []
    timestamps: list[float] = []
    stop_reason = "user"
    try:
        if not capture.isOpened():
            raise ValueError("Kamera açılamadı.")
        capture.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        capture.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        threading.Thread(target=wait_stop, daemon=True).start()
        started = time.perf_counter()
        while not stop.is_set():
            elapsed = time.perf_counter() - started
            if elapsed >= max_seconds:
                stop_reason = "time_limit"
                break
            if len(frames) >= max_frames:
                stop_reason = "frame_limit"
                break
            ok, frame = capture.read()
            if not ok:
                stop_reason = "camera_read_failure"
                break
            scale = min(640 / frame.shape[1], 480 / frame.shape[0], 1.0)
            frames.append(cv2.resize(frame, (int(frame.shape[1] * scale), int(frame.shape[0] * scale))))
            timestamps.append(time.perf_counter())
        duration = (timestamps[-1] - timestamps[0]) if len(timestamps) >= 2 else time.perf_counter() - started
        if not frames:
            raise ValueError("Kameradan kare alınamadı veya kayıt iptal edildi.")
        return CameraCapture(frames, timestamps, duration, stop_reason)
    finally:
        capture.release()


def warm_up_model(model) -> float:
    started = time.perf_counter()
    model.predict(np.zeros((1, 60, 138), dtype=np.float32), verbose=0)
    return (time.perf_counter() - started) * 1000


def ask_performance_verification() -> str:
    choices = {"e": "yes", "h": "no", "b": "unknown", "": "unknown"}
    while True:
        answer = input(
            "İşaretin referansa uygun uygulandığı ayrıca doğrulandı mı? "
            "[e=evet, h=hayır, b=belirsiz]: "
        ).strip().lower()
        if answer in choices:
            return choices[answer]
        print("Lütfen e, h veya b girin.")


def finalize_performance_verification(row, value):
    verified = ask_performance_verification() if value == "prompt" else value
    row["performance_verified"] = verified
    if verified == "yes" and row.get("expected_class") in {x["classId"] for x in autsl_labels()}:
        row["correct"] = row.get("predicted_class") == row.get("expected_class")
    else:
        row["correct"] = ""
    return row


def evaluate_raw(model, runtime, points, confidences, decision_policy=None):
    config = preprocessing_config()
    started = time.perf_counter()
    quality = assess_quality(
        points,
        confidences,
        minimum_confidence=config["minimumConfidence"],
        minimum_frames=config["minimumSequenceFrames"],
        minimum_shoulder_ratio=config["minimumShoulderFrameRatio"],
        minimum_hand_ratio=config["minimumHandFrameRatio"],
        minimum_motion_score=config["minimumMotionScore"],
    )
    row = {
        "quality_status": quality.status,
        "quality_reason": quality.reason,
        "shoulder_ratio": quality.shoulder_frame_ratio,
        "hand_ratio": quality.hand_frame_ratio,
        "motion_score": quality.motion_score,
        "frames": len(points),
        "status": "quality_blocked",
        "accepted": False,
    }
    if quality.status != "approved":
        return row
    processed = preprocess_pose_sequence(
        points,
        confidences,
        target_length=config["sequenceLength"],
        minimum_confidence=config["minimumConfidence"],
    )
    row["preprocessing_ms"] = (time.perf_counter() - started) * 1000
    started = time.perf_counter()
    result = predict_landmarks(
        model,
        processed["landmarks"],
        processed["mask"],
        runtime,
        decision_policy=decision_policy,
    )
    row.update(
        inference_ms=(time.perf_counter() - started) * 1000,
        predicted_class=result["classId"],
        confidence=result["confidence"],
        accepted=not result["isLowConfidence"],
        rejection_reason=result["rejectionReason"],
        decision_policy_version=result["decisionPolicyVersion"],
        status="measured",
    )
    return row


def _evaluate_trial(model, runtime, policy, args, template):
    row = dict(template)
    row["source_kind"] = "video" if args.video else "camera"
    try:
        capture = capture_camera(args.camera) if args.camera is not None else None
        started = time.perf_counter()
        if capture is not None:
            points, confidence = extract_frames(capture.frames)
            capture.frames.clear()
            row.update(
                capture_seconds=capture.duration_seconds,
                captured_fps=(len(capture.timestamps) - 1) / capture.duration_seconds
                if len(capture.timestamps) >= 2 and capture.duration_seconds > 0
                else None,
                capture_stop_reason=capture.stop_reason,
            )
        else:
            points, confidence, fps = extract_raw_pose(args.video)
            row.update(capture_seconds=None, captured_fps=fps, capture_stop_reason="file_end")
        extraction_ms = (time.perf_counter() - started) * 1000
        row.update(evaluate_raw(model, runtime, points, confidence, policy))
        row.update(extraction_ms=extraction_ms, after_capture_ms=(time.perf_counter() - started) * 1000)
        if row["performance_verified"] == "yes" and row["expected_class"] in {x["classId"] for x in autsl_labels()}:
            row["correct"] = row.get("predicted_class") == row["expected_class"]
    except (ValueError, RuntimeError) as exc:
        row.update(status="error", quality_reason=f"{type(exc).__name__}: {exc}")
    return row


def _load_model_runtime_policy(args):
    import tensorflow as tf

    started = time.perf_counter()
    model = tf.keras.models.load_model(str(args.model))
    model_load_ms = (time.perf_counter() - started) * 1000
    runtime = load_json(args.runtime)
    validate_bundle(model, runtime, autsl_labels())
    policy = load_policy(args.decision_policy, runtime)
    warmup_ms = warm_up_model(model)
    return model, runtime, policy, model_load_ms, warmup_ms


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--matrix", action="store_true")
    source = parser.add_mutually_exclusive_group()
    source.add_argument("--video", type=Path)
    source.add_argument("--camera", type=int)
    parser.add_argument("--participant-plan", choices=["development", "holdout"])
    parser.add_argument("--model", type=Path, default=Path("outputs/saved_model"))
    parser.add_argument("--runtime", type=Path, default=Path("outputs/runtime_config.json"))
    parser.add_argument("--decision-policy", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--expected-class", default="unknown")
    parser.add_argument("--condition", choices=CONDITIONS + ["reference"], default="reference")
    parser.add_argument("--trial-id", default="trial-1")
    parser.add_argument("--repeat", type=int, default=1)
    parser.add_argument("--signer-code", dest="participant_code", default="anonymous")
    parser.add_argument("--group", choices=["development", "holdout", "reference"], default="development")
    parser.add_argument("--performance-verified", choices=["yes", "no", "unknown", "prompt"], default="unknown")
    parser.add_argument("--motion-label", choices=["valid", "static"], default="valid")
    args = parser.parse_args()

    if args.matrix:
        save_rows(args.output, trial_matrix())
        return
    if args.video is None and args.camera is None:
        parser.error("--video veya --camera gerekli.")
    if args.output.exists():
        parser.error("Çıktı zaten var; yeni deneme adı kullanın.")
    if args.participant_plan and (args.camera is None or args.participant_code == "anonymous"):
        parser.error("--participant-plan için --camera ve anonim olmayan --signer-code gereklidir.")

    model, runtime, policy, model_load_ms, warmup_ms = _load_model_runtime_policy(args)
    rows = []
    try:
        if args.participant_plan:
            templates = [
                row
                for row in trial_matrix(
                    development_participant=args.participant_code if args.participant_plan == "development" else "p01",
                    holdout_participant=args.participant_code if args.participant_plan == "holdout" else "p02",
                )
                if row["evaluation_group"] == args.participant_plan
            ]
            for number, template in enumerate(templates, start=1):
                print(
                    f"[{number}/25] {template['expected_class']} / {template['condition']} / "
                    f"katılımcı={template['participant_code']} / grup={template['evaluation_group']}"
                )
                template["performance_verified"] = "unknown" if args.performance_verified == "prompt" else args.performance_verified
                template["motion_label"] = args.motion_label
                template["model_load_ms"] = model_load_ms
                template["warmup_ms"] = warmup_ms if number == 1 else 0.0
                measured = _evaluate_trial(model, runtime, policy, args, template)
                rows.append(measured)
                finalize_performance_verification(measured, args.performance_verified)
        else:
            template = {
                "trial_id": args.trial_id,
                "planned": False,
                "participant_code": args.participant_code,
                "expected_class": args.expected_class,
                "condition": args.condition,
                "repeat": args.repeat,
                "evaluation_group": args.group,
                "performance_verified": args.performance_verified,
                "motion_label": args.motion_label,
                "model_load_ms": model_load_ms,
                "warmup_ms": warmup_ms,
            }
            measured = _evaluate_trial(model, runtime, policy, args, template)
            rows.append(measured)
            finalize_performance_verification(measured, args.performance_verified)
    except KeyboardInterrupt:
        print("Kullanıcı durdurdu; tamamlanan denemeler korunuyor.")
    finally:
        if rows:
            save_rows(args.output, rows)
    for row in rows:
        print({key: value for key, value in row.items() if key != "participant_code"})


if __name__ == "__main__":
    main()
