"""Freeze a validation-selected score/margin policy and run one OOD holdout check."""
from __future__ import annotations

import argparse
import csv
import hashlib
import platform
import random
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from src.common import AI_ROOT, autsl_labels, load_json, preprocessing_config, write_json
from src.data.convert_autsl import _load_official_autsl_pickle
from src.data.preprocessing import assess_quality, preprocess_pose_sequence
from src.model.dataset import load_split, sequence_to_features
from src.model.predict import validate_bundle


OOD_DEVELOPMENT_IDS = [0, 4, 5, 8, 12, 13, 17, 18, 21, 25]
OOD_HOLDOUT_IDS = [26, 27, 28, 29, 30, 31, 32, 33, 34, 35]
THRESHOLDS = [0.70, 0.75, 0.80, 0.85, 0.90, 0.95]
MARGINS = [0.0, 0.50, 0.70, 0.85]
SELECTION_SEED = 20260911
DEMO_CLASS_IDS = ["doktor", "hasta", "evet", "hayir", "ilac"]


def _score_and_margin(probabilities: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    probabilities = np.asarray(probabilities, dtype=np.float64)
    ordered = np.argsort(probabilities, axis=1)[:, ::-1]
    winners = ordered[:, 0]
    confidence = probabilities[np.arange(len(probabilities)), winners]
    runner_up = probabilities[np.arange(len(probabilities)), ordered[:, 1]]
    return winners, confidence, confidence - runner_up


def _accepted(probabilities: np.ndarray, threshold: float, margin: float) -> np.ndarray:
    _, confidence, gaps = _score_and_margin(probabilities)
    return (confidence >= threshold) & (gaps >= margin)


def threshold_table(probabilities, labels, thresholds=THRESHOLDS):
    predictions, confidence, _ = _score_and_margin(probabilities)
    rows = []
    for threshold in thresholds:
        accepted = confidence >= threshold
        correct = int(((predictions == labels) & accepted).sum())
        count = int(accepted.sum())
        rows.append(
            dict(
                threshold=threshold,
                total=len(labels),
                accepted=count,
                correct_accepted=correct,
                wrong_accepted=count - correct,
                rejected=len(labels) - count,
                accepted_accuracy=correct / count if count else None,
                coverage=count / len(labels),
            )
        )
    return rows


def threshold_decision(rows, current=0.8, minimum_coverage=0.5):
    valid = [
        row
        for row in rows
        if row["accepted_accuracy"] is not None
        and row["accepted_accuracy"] >= 0.9
        and row["coverage"] >= minimum_coverage
    ]
    selected = max(valid, key=lambda row: (row["coverage"], -row["threshold"])) if valid else None
    return {
        "target_met": bool(valid),
        "recommended_threshold": selected["threshold"] if selected else current,
        "current_threshold": current,
        "deployed_threshold_changed": False,
        "selection_source": "validation only",
    }


def candidate_table(
    probabilities: np.ndarray,
    labels: np.ndarray,
    ood_probabilities: np.ndarray,
    thresholds=THRESHOLDS,
    margins=MARGINS,
    allowed_indices: list[int] | None = None,
) -> list[dict[str, object]]:
    predictions, _, _ = _score_and_margin(probabilities)
    allowed = np.ones(len(predictions), dtype=bool) if allowed_indices is None else np.isin(predictions, allowed_indices)
    ood_predictions = _score_and_margin(ood_probabilities)[0] if len(ood_probabilities) else np.zeros(0, int)
    ood_allowed = np.ones(len(ood_predictions), dtype=bool) if allowed_indices is None else np.isin(ood_predictions, allowed_indices)
    candidates: list[dict[str, object]] = []
    seen_outcomes: set[bytes] = set()
    for threshold in thresholds:
        for margin in margins:
            method = "score_only" if margin == 0 else "score_and_margin"
            accepted = _accepted(probabilities, threshold, margin) & allowed
            count = int(accepted.sum())
            correct = int(((predictions == labels) & accepted).sum())
            ood_accepted = (_accepted(ood_probabilities, threshold, margin) & ood_allowed) if len(ood_probabilities) else np.zeros(0, bool)
            outcome = accepted.tobytes() + b"|" + ood_accepted.tobytes()
            if outcome in seen_outcomes:
                continue
            seen_outcomes.add(outcome)
            candidates.append(
                {
                    "method": method,
                    "confidence_threshold": threshold,
                    "margin_threshold": margin,
                    "total": len(labels),
                    "accepted": count,
                    "correct_accepted": correct,
                    "wrong_accepted": count - correct,
                    "rejected": len(labels) - count,
                    "accepted_accuracy": correct / count if count else None,
                    "coverage": count / len(labels),
                    "ood_total": len(ood_probabilities),
                    "ood_wrong_accepted": int(ood_accepted.sum()),
                    "ood_wrong_accept_rate": float(ood_accepted.mean()) if len(ood_accepted) else None,
                }
            )
    return candidates


def select_candidate(
    rows: list[dict[str, object]],
    *,
    minimum_accuracy: float = 0.90,
    minimum_coverage: float = 0.50,
) -> dict[str, object] | None:
    valid = [
        row
        for row in rows
        if row["accepted_accuracy"] is not None
        and row["ood_wrong_accept_rate"] is not None
        and float(row["accepted_accuracy"]) >= minimum_accuracy
        and float(row["coverage"]) >= minimum_coverage
    ]
    if not valid:
        return None
    return min(
        valid,
        key=lambda row: (
            float(row["ood_wrong_accept_rate"]),
            -float(row["coverage"]),
            0 if row["method"] == "score_only" else 1,
            float(row["confidence_threshold"]),
            float(row["margin_threshold"]),
        ),
    )


def calibration_metrics(probabilities: np.ndarray, labels: np.ndarray, bins: int = 10):
    predictions, confidence, _ = _score_and_margin(probabilities)
    correct = predictions == labels
    edges = np.linspace(0, 1, bins + 1)
    reliability = []
    ece = 0.0
    for index in range(bins):
        lower, upper = edges[index], edges[index + 1]
        member = (confidence >= lower) & (confidence < upper if index < bins - 1 else confidence <= upper)
        count = int(member.sum())
        accuracy = float(correct[member].mean()) if count else None
        mean_confidence = float(confidence[member].mean()) if count else None
        if count:
            ece += (count / len(labels)) * abs(accuracy - mean_confidence)
        reliability.append(
            {
                "bin": index + 1,
                "lower": lower,
                "upper": upper,
                "count": count,
                "accuracy": accuracy,
                "mean_confidence": mean_confidence,
            }
        )
    one_hot = np.eye(probabilities.shape[1], dtype=np.float64)[labels]
    brier = float(np.mean(np.sum((probabilities - one_hot) ** 2, axis=1)))
    return {"ece_10_bin": float(ece), "multiclass_brier_score": brier, "samples": len(labels)}, reliability


def _signer(sample_id: str) -> str:
    match = re.match(r"(signer\d+)", sample_id, re.IGNORECASE)
    return match.group(1).lower() if match else sample_id.split("_")[0]


def select_ood_examples(
    rows: list[list[str]], class_ids: list[int], *, max_per_class: int = 10, seed: int = SELECTION_SEED
) -> list[dict[str, object]]:
    selected: list[dict[str, object]] = []
    for class_id in class_ids:
        candidates = [(sample_id, _signer(sample_id)) for sample_id, value in rows if int(value) == class_id]
        random.Random(seed + class_id).shuffle(candidates)
        unique_signer: list[tuple[str, str]] = []
        extra: list[tuple[str, str]] = []
        seen: set[str] = set()
        for item in candidates:
            if item[1] not in seen:
                unique_signer.append(item)
                seen.add(item[1])
            else:
                extra.append(item)
        chosen = (unique_signer + extra)[:max_per_class]
        for sample_id, signer_id in chosen:
            selected.append({"sample_id": sample_id, "original_class_id": class_id, "signer_id": signer_id})
    return selected


def _score_ood(model, data_root: Path, selection, vocabulary):
    cfg = preprocessing_config()
    rows: list[dict[str, object]] = []
    scores: list[np.ndarray] = []
    for item in selection:
        sample_id = str(item["sample_id"])
        points, confidence = _load_official_autsl_pickle(data_root / "AUTSL/val_poses" / f"{sample_id}_color.pkl")
        quality = assess_quality(
            points,
            confidence,
            minimum_confidence=cfg["minimumConfidence"],
            minimum_frames=cfg["minimumSequenceFrames"],
            minimum_shoulder_ratio=cfg["minimumShoulderFrameRatio"],
            minimum_hand_ratio=cfg["minimumHandFrameRatio"],
        )
        row = dict(item, expected=vocabulary[int(item["original_class_id"])], quality=quality.status, quality_reason=quality.reason)
        if quality.status == "approved":
            processed = preprocess_pose_sequence(points, confidence, minimum_confidence=cfg["minimumConfidence"])
            probability = model.predict(
                sequence_to_features(processed["landmarks"], processed["mask"])[None], verbose=0
            )[0]
            _, top, margin = _score_and_margin(probability[None])
            row.update(confidence=float(top[0]), margin=float(margin[0]))
            scores.append(probability)
        rows.append(row)
    return rows, np.asarray(scores, dtype=np.float64)


def write_csv(path: Path, rows: list[dict[str, object]]) -> None:
    if not rows:
        raise ValueError("No rows to report")
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def _hash_path(path: Path) -> str:
    digest = hashlib.sha256()
    paths = [path] if path.is_file() else sorted(p for p in path.rglob("*") if p.is_file())
    for item in paths:
        relative = item.name if path.is_file() else item.relative_to(path).as_posix()
        digest.update(relative.encode())
        digest.update(hashlib.sha256(item.read_bytes()).digest())
    return digest.hexdigest()


def _class_metrics(probabilities, labels, candidates, class_names, allowed_indices=None):
    predictions, _, _ = _score_and_margin(probabilities)
    allowed = np.ones(len(predictions), dtype=bool) if allowed_indices is None else np.isin(predictions, allowed_indices)
    rows = []
    for candidate in candidates:
        accepted = _accepted(
            probabilities,
            float(candidate["confidence_threshold"]),
            float(candidate["margin_threshold"]),
        ) & allowed
        for index, name in enumerate(class_names):
            member = labels == index
            class_accepted = accepted & member
            count = int(class_accepted.sum())
            correct = int(((predictions == labels) & class_accepted).sum())
            rows.append(
                {
                    "method": candidate["method"],
                    "confidence_threshold": candidate["confidence_threshold"],
                    "margin_threshold": candidate["margin_threshold"],
                    "class_id": name,
                    "total": int(member.sum()),
                    "accepted": count,
                    "correct_accepted": correct,
                    "wrong_accepted": count - correct,
                    "accepted_accuracy": correct / count if count else None,
                    "coverage": count / int(member.sum()) if member.any() else None,
                }
            )
    return rows


def _holdout_comparison(
    scores: np.ndarray,
    selected: dict[str, object] | None,
    allowed_indices: list[int] | None = None,
):
    policies = [
        {"name": "current", "method": "score_only", "confidence_threshold": 0.8, "margin_threshold": 0.0}
    ]
    if selected:
        policies.append({"name": "candidate", **selected})
    result = []
    predictions = _score_and_margin(scores)[0] if len(scores) else np.zeros(0, int)
    allowed = np.ones(len(predictions), dtype=bool) if allowed_indices is None else np.isin(predictions, allowed_indices)
    for policy in policies:
        accepted = _accepted(scores, float(policy["confidence_threshold"]), float(policy["margin_threshold"])) & allowed
        result.append(
            {
                "name": policy["name"],
                "method": policy["method"],
                "confidenceThreshold": policy["confidence_threshold"],
                "marginThreshold": policy["margin_threshold"],
                "qualityPassed": len(scores),
                "wrongAccepted": int(accepted.sum()),
                "wrongAcceptRate": float(accepted.mean()) if len(accepted) else None,
            }
        )
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-root", type=Path, required=True)
    parser.add_argument("--model", type=Path, default=Path("outputs/saved_model"))
    parser.add_argument("--runtime", type=Path, default=Path("outputs/runtime_config.json"))
    parser.add_argument("--manifest-dir", type=Path, default=AI_ROOT / "manifests")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--ood-per-class", type=int, default=10)
    parser.add_argument("--trusted-autsl-pickle", action="store_true")
    args = parser.parse_args()
    if not args.trusted_autsl_pickle:
        parser.error("Official trusted PKL confirmation required: --trusted-autsl-pickle")
    if not 1 <= args.ood_per_class <= 10:
        parser.error("--ood-per-class 1 ile 10 arasında olmalıdır.")
    args.output.mkdir(parents=True, exist_ok=False)

    import matplotlib.pyplot as plt
    import tensorflow as tf
    from sklearn.metrics import classification_report, confusion_matrix

    labels = autsl_labels()
    runtime = load_json(args.runtime)
    model = tf.keras.models.load_model(str(args.model))
    validate_bundle(model, runtime, labels)
    x, y, samples = load_split(args.manifest_dir / "autsl20_validation.csv", args.data_root)
    scores = model.predict(x, verbose=0)
    np.savez_compressed(args.output / "validation_scores.npz", scores=scores, labels=y)

    with (args.data_root / "SignList_ClassId_TR_EN.csv").open(encoding="utf-8-sig", newline="") as handle:
        vocabulary = {int(row["ClassId"]): row["TR"] for row in csv.DictReader(handle)}
    with (args.data_root / "AUTSL/validation_labels.csv").open(encoding="utf-8-sig", newline="") as handle:
        source_rows = list(csv.reader(handle))

    in_scope = {int(row["originalClassId"]) for row in labels}
    if (set(OOD_DEVELOPMENT_IDS) | set(OOD_HOLDOUT_IDS)) & in_scope:
        raise ValueError("OOD class overlaps the AUTSL-20 vocabulary")
    development_selection = select_ood_examples(
        source_rows, OOD_DEVELOPMENT_IDS, max_per_class=args.ood_per_class
    )
    holdout_selection = select_ood_examples(source_rows, OOD_HOLDOUT_IDS, max_per_class=args.ood_per_class)
    write_csv(args.output / "ood_development_selection.csv", development_selection)
    write_csv(args.output / "ood_holdout_selection.csv", holdout_selection)

    development_rows, development_scores = _score_ood(model, args.data_root, development_selection, vocabulary)
    write_csv(args.output / "ood_development_results.csv", development_rows)
    demo_indices = [index for index, row in enumerate(labels) if row["classId"] in DEMO_CLASS_IDS]
    demo_members = np.isin(y, demo_indices)
    candidates = candidate_table(
        scores[demo_members], y[demo_members], development_scores, allowed_indices=demo_indices
    )
    write_csv(args.output / "decision_candidates.csv", candidates)
    selected = select_candidate(candidates)

    policy = None
    if selected:
        policy = {
            "schemaVersion": "1.0",
            "decisionPolicyVersion": f"autsl20-{selected['method'].replace('_', '-')}-candidate-v1",
            "enabled": False,
            "allowedClassIds": DEMO_CLASS_IDS,
            "method": selected["method"],
            "confidenceThreshold": selected["confidence_threshold"],
            "marginThreshold": selected["margin_threshold"],
            "modelVersion": runtime["modelVersion"],
            "preprocessingVersion": runtime["preprocessingVersion"],
            "vocabularyVersion": runtime["vocabularyVersion"],
            "selectionCriteria": {
                "minimumAcceptedAccuracy": 0.90,
                "minimumCoverage": 0.50,
                "tieBreak": "lowest development OOD false accept, highest coverage, simpler method",
            },
            "selectedOn": "AUTSL-20 validation plus fixed OOD development list; test not used",
            "frozenAtUtc": datetime.now(timezone.utc).isoformat(),
        }
    calibration, reliability = calibration_metrics(scores, y)
    write_json(args.output / "calibration_metrics.json", calibration)
    write_csv(args.output / "reliability_diagram.csv", reliability)
    plotted = [row for row in reliability if row["count"]]
    plt.figure(figsize=(5.5, 5.5))
    plt.plot([0, 1], [0, 1], "--", color="gray", label="perfect calibration")
    plt.plot([row["mean_confidence"] for row in plotted], [row["accuracy"] for row in plotted], "o-", label="model")
    plt.xlabel("Mean confidence")
    plt.ylabel("Observed accuracy")
    plt.title("AUTSL-20 validation reliability")
    plt.legend()
    plt.tight_layout()
    plt.savefig(args.output / "reliability_diagram.png", dpi=160)
    plt.close()

    report = classification_report(
        y,
        scores.argmax(1),
        labels=list(range(len(labels))),
        target_names=[row["classId"] for row in labels],
        output_dict=True,
        zero_division=0,
    )
    write_json(args.output / "validation_classification.json", report)
    matrix = confusion_matrix(y, scores.argmax(1), labels=list(range(len(labels))))
    weak = []
    for name in ["seker", "igne", "icmek", "ilac"]:
        index = next(i for i, item in enumerate(labels) if item["classId"] == name)
        for predicted, count in enumerate(matrix[index]):
            if predicted != index and count:
                weak.append({"expected": name, "predicted": labels[predicted]["classId"], "count": int(count)})
    write_json(args.output / "weak_class_confusions.json", weak)
    write_csv(
        args.output / "candidate_class_metrics.csv",
        _class_metrics(scores, y, candidates, [row["classId"] for row in labels], demo_indices),
    )

    holdout_rows, holdout_scores = _score_ood(model, args.data_root, holdout_selection, vocabulary)
    write_csv(args.output / "ood_holdout_results.csv", holdout_rows)
    holdout_comparison = _holdout_comparison(holdout_scores, selected, demo_indices)
    write_json(args.output / "ood_holdout_comparison.json", holdout_comparison)
    candidate_holdout = next((row for row in holdout_comparison if row["name"] == "candidate"), None)
    release_target_met = bool(
        selected
        and candidate_holdout
        and candidate_holdout["wrongAcceptRate"] is not None
        and float(candidate_holdout["wrongAcceptRate"]) <= 0.20
    )
    if policy:
        policy["enabled"] = release_target_met
        policy["deploymentStatus"] = "camera_ai_ready" if release_target_met else "manual_only"
        policy["frozenHoldoutResult"] = candidate_holdout
        write_json(args.output / "decision_policy.candidate.json", policy)
    write_json(
        args.output / "decision_selection.json",
        {
            "targetMet": release_target_met,
            "selectedCandidate": selected,
            "activePolicyChanged": False,
            "reason": (
                "All validation, coverage and frozen OOD gates passed; candidate still requires explicit promotion."
                if release_target_met
                else "At least one validation, coverage or frozen OOD gate failed; manual-only mode is required."
            ),
        },
    )

    write_json(
        args.output / "provenance.json",
        {
            "python": platform.python_version(),
            "tensorflow": tf.__version__,
            "commit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=AI_ROOT, text=True).strip(),
            "workingTreeModified": bool(
                subprocess.check_output(["git", "status", "--porcelain"], cwd=AI_ROOT, text=True).strip()
            ),
            "runtime": runtime,
            "validationSamples": len(samples),
            "developmentOodSelected": len(development_selection),
            "developmentOodQualityPassed": len(development_scores),
            "holdoutOodSelected": len(holdout_selection),
            "holdoutOodQualityPassed": len(holdout_scores),
            "selectionSeed": SELECTION_SEED,
            "validationManifestSha256": _hash_path(args.manifest_dir / "autsl20_validation.csv"),
            "modelSha256": _hash_path(args.model),
            "runtimeSha256": _hash_path(args.runtime),
            "testUsedForSelection": False,
            "holdoutUsedForRetuning": False,
            "cloudExecuted": False,
        },
    )
    print({"selected": selected, "calibration": calibration, "holdout": holdout_comparison})


if __name__ == "__main__":
    main()
