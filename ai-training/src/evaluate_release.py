"""Validation-only threshold comparison and preselected out-of-vocabulary probes."""
from __future__ import annotations

import argparse
import csv
import hashlib
import platform
import subprocess
from pathlib import Path

import numpy as np

from src.common import AI_ROOT, autsl_labels, load_json, preprocessing_config, write_json
from src.data.convert_autsl import _load_official_autsl_pickle
from src.data.preprocessing import assess_quality, preprocess_pose_sequence
from src.model.dataset import load_split, sequence_to_features
from src.model.predict import validate_bundle


# Selected by vocabulary meaning, BEFORE scores: family, objects, activities.
OOD_IDS = [0, 4, 5, 8, 12, 13, 17, 18, 21, 25]
THRESHOLDS = [0.70, 0.75, 0.80, 0.85]


def threshold_table(probabilities, labels, thresholds=THRESHOLDS):
    confidence = probabilities.max(axis=1)
    predictions = probabilities.argmax(axis=1)
    rows = []
    for threshold in thresholds:
        accepted = confidence >= threshold
        correct = int(((predictions == labels) & accepted).sum())
        count = int(accepted.sum())
        rows.append(dict(threshold=threshold, total=len(labels), accepted=count, correct_accepted=correct,
                         wrong_accepted=count-correct, rejected=len(labels)-count,
                         accepted_accuracy=correct/count if count else None, coverage=count/len(labels)))
    return rows


def threshold_decision(rows, current=0.8):
    valid = [r for r in rows if r["accepted_accuracy"] is not None and r["accepted_accuracy"] >= .9 and r["coverage"] >= .2]
    selected = max(valid, key=lambda r: (r["coverage"], -r["threshold"])) if valid else None
    return dict(target_met=bool(valid), recommended_threshold=selected["threshold"] if selected else current,
                current_threshold=current, deployed_threshold_changed=False,
                selection_source="validation only; OOD diagnostic, not included in accuracy")


def write_csv(path, rows):
    if not rows:
        raise ValueError("No rows to report")
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-root", type=Path, required=True)
    parser.add_argument("--model", type=Path, default=Path("outputs/saved_model"))
    parser.add_argument("--runtime", type=Path, default=Path("outputs/runtime_config.json"))
    parser.add_argument("--manifest-dir", type=Path, default=AI_ROOT / "manifests")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--trusted-autsl-pickle", action="store_true", help="Only use already trusted official OpenHands files")
    args = parser.parse_args()
    if not args.trusted_autsl_pickle:
        parser.error("Official trusted PKL confirmation required: --trusted-autsl-pickle")
    args.output.mkdir(parents=True, exist_ok=False)
    import tensorflow as tf
    from sklearn.metrics import classification_report, confusion_matrix
    labels = autsl_labels()
    runtime = load_json(args.runtime)
    model = tf.keras.models.load_model(str(args.model))
    validate_bundle(model, runtime, labels)
    x, y, samples = load_split(args.manifest_dir / "autsl20_validation.csv", args.data_root)
    scores = model.predict(x, verbose=0)
    # Persist cached scores, not original landmarks, under ignored runs/.
    np.savez_compressed(args.output / "validation_scores.npz", scores=scores, labels=y)
    table = threshold_table(scores, y)
    write_csv(args.output / "thresholds.csv", table)
    write_json(args.output / "threshold_decision.json", threshold_decision(table, runtime["confidenceThreshold"]))
    report = classification_report(y, scores.argmax(1), labels=list(range(len(labels))),
                                   target_names=[r["classId"] for r in labels], output_dict=True, zero_division=0)
    write_json(args.output / "validation_classification.json", report)
    matrix = confusion_matrix(y, scores.argmax(1), labels=list(range(len(labels))))
    weak = []
    for name in ["seker", "igne", "icmek", "ilac"]:
        idx = next(i for i, item in enumerate(labels) if item["classId"] == name)
        for j, n in enumerate(matrix[idx]):
            if j != idx and n:
                weak.append(dict(expected=name, predicted=labels[j]["classId"], count=int(n)))
    write_json(args.output / "weak_class_confusions.json", weak)
    with (args.data_root / "SignList_ClassId_TR_EN.csv").open(encoding="utf-8-sig", newline="") as f:
        vocabulary = {int(r["ClassId"]): r["TR"] for r in csv.DictReader(f)}
    assert not set(OOD_IDS) & {r["originalClassId"] for r in labels}
    with (args.data_root / "AUTSL/validation_labels.csv").open(encoding="utf-8-sig", newline="") as f:
        candidates = list(csv.reader(f))
    ood = []
    cfg = preprocessing_config()
    for original_id in OOD_IDS:
        # Exactly the first two listed validation examples; no score/quality cherry picking.
        selected = [r for r in candidates if int(r[1]) == original_id][:2]
        if len(selected) != 2:
            raise ValueError(f"Missing OOD examples for {original_id}")
        for sample_id, _ in selected:
            points, confidence = _load_official_autsl_pickle(args.data_root / "AUTSL/val_poses" / f"{sample_id}_color.pkl")
            quality = assess_quality(points, confidence, minimum_confidence=cfg["minimumConfidence"],
                                     minimum_frames=cfg["minimumSequenceFrames"],
                                     minimum_shoulder_ratio=cfg["minimumShoulderFrameRatio"],
                                     minimum_hand_ratio=cfg["minimumHandFrameRatio"])
            row = dict(sample_id=sample_id, original_class_id=original_id, expected=vocabulary[original_id],
                       quality=quality.status, quality_reason=quality.reason, forced_class="", confidence=None)
            for threshold in THRESHOLDS:
                row[f"wrong_accept_{threshold:.2f}"] = False
            if quality.status == "approved":
                p = preprocess_pose_sequence(points, confidence, minimum_confidence=cfg["minimumConfidence"])
                probs = model.predict(sequence_to_features(p["landmarks"], p["mask"])[None], verbose=0)[0]
                row.update(forced_class=labels[int(probs.argmax())]["classId"], confidence=float(probs.max()))
                for threshold in THRESHOLDS:
                    row[f"wrong_accept_{threshold:.2f}"] = float(probs.max()) >= threshold
            ood.append(row)
    write_csv(args.output / "ood_probes.csv", ood)
    approved = [r for r in ood if r["quality"] == "approved"]
    write_json(args.output / "ood_summary.json", dict(total=len(ood), distinct_classes=len(OOD_IDS),
               quality_passed=len(approved), quality_blocked=len(ood)-len(approved),
               wrong_accepts={str(t): sum(r[f"wrong_accept_{t:.2f}"] for r in approved) for t in THRESHOLDS},
               limitation="20 diagnostic pose examples, not live camera or population OOD performance"))
    write_json(args.output / "provenance.json", dict(python=platform.python_version(), tensorflow=tf.__version__,
               commit=subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=AI_ROOT, text=True).strip(),
               working_tree_modified=bool(subprocess.check_output(["git", "status", "--porcelain"], cwd=AI_ROOT, text=True).strip()),
               runtime=runtime, validation_samples=len(samples),
               manifest_sha256=hashlib.sha256((args.manifest_dir / "autsl20_validation.csv").read_bytes()).hexdigest(),
               runtime_sha256=hashlib.sha256(args.runtime.read_bytes()).hexdigest(),
               test_used_for_selection=False, cloud_executed=False))
    print(table)
    print("OOD:", len(approved), "quality-passed;", sum(r["wrong_accept_0.80"] for r in approved), "wrong accepts at 0.80")


if __name__ == "__main__":
    main()
