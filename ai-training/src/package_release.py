"""Create local, checksummed release including portable data; never uploads."""
from __future__ import annotations

import argparse
import csv
import hashlib
import shutil
from pathlib import Path, PureWindowsPath

import numpy as np

from src.common import AI_ROOT, CONFIG_DIR, autsl_labels, load_json, write_json
from src.decision_policy import load_policy
from src.model.dataset import sequence_to_features


def contained(root: Path, relative: str):
    path = Path(relative)
    if path.is_absolute() or PureWindowsPath(relative).is_absolute() or ".." in path.parts:
        raise ValueError("Manifest path must be relative and contained")
    resolved = (root / path).resolve()
    if not resolved.is_relative_to(root.resolve()):
        raise ValueError("Manifest escapes data root")
    return resolved


def build_package(
    data_root,
    model_dir,
    destination,
    manifest_dir=AI_ROOT / "manifests",
    policy_path: Path | None = None,
    validation_dir: Path | None = None,
    evidence_files: list[Path] | None = None,
):
    runtime = load_json(model_dir / "runtime_config.json")
    if policy_path is None:
        default_path = CONFIG_DIR / "decision_policy.json"
        policy = load_policy(default_path if default_path.is_file() else None, runtime)
    else:
        # An explicitly requested policy must exist and match the model bundle.
        policy = load_policy(policy_path, runtime)
    if validation_dir is not None and not validation_dir.is_dir():
        raise ValueError("Validation evidence directory does not exist")
    evidence_files = evidence_files or []
    for evidence_file in evidence_files:
        if not evidence_file.is_file():
            raise ValueError(f"Evidence file does not exist: {evidence_file}")
        if evidence_file.suffix.lower() not in {".json", ".csv", ".png"}:
            raise ValueError(f"Unsupported evidence file: {evidence_file}")
    destination.mkdir(parents=True, exist_ok=False)
    code = destination / "code"
    code.mkdir()
    # Explicit allowlist: no .env, raw media, virtual environments or repository history.
    for name in ["src", "configs", "modelarts"]:
        shutil.copytree(AI_ROOT / name, code / name, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    for name in ["requirements.txt", "requirements.inference.txt", "requirements.validation.txt"]:
        shutil.copy2(AI_ROOT / name, code / name)
    data = destination / "data"
    (data / "manifests").mkdir(parents=True)
    signers = {}
    counts = {}
    labels = autsl_labels()
    for split in ["train", "validation", "test"]:
        with (manifest_dir / f"autsl20_{split}.csv").open(encoding="utf-8-sig", newline="") as f:
            rows = [r for r in csv.DictReader(f) if r["quality_status"] == "approved" and r["training_status"] == "trainable"]
        if not rows:
            raise ValueError(f"Empty split: {split}")
        signers[split] = {r["signer_id"] for r in rows}
        counts[split] = len(rows)
        for row in rows:
            if row["split"] != split or labels[int(row["model_index"])]["classId"] != row["class_id"]:
                raise ValueError("Manifest split/label mismatch")
            source = contained(data_root, row["landmark_path"])
            target = contained(data, row["landmark_path"])
            with np.load(source, allow_pickle=False) as sample:
                sequence_to_features(sample["landmarks"], sample["mask"])
                if int(sample["label_index"]) != int(row["model_index"]) or str(sample["class_id"]) != row["class_id"]:
                    raise ValueError("NPZ label mismatch")
                if str(sample["preprocessing_version"]) != "landmark46-v1":
                    raise ValueError("NPZ version mismatch")
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
        with (data / "manifests" / f"autsl20_{split}.csv").open("w", encoding="utf-8-sig", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=list(rows[0]))
            writer.writeheader()
            writer.writerows(rows)
    if any(signers[a] & signers[b] for a, b in [("train", "validation"), ("train", "test"), ("validation", "test")]):
        raise ValueError("Signer leakage")
    model = destination / "model"
    shutil.copytree(model_dir / "saved_model", model / "saved_model")
    shutil.copy2(model_dir / "runtime_config.json", model / "runtime_config.json")
    for name in ["labels.autsl20.json", "preprocessing.json"]:
        shutil.copy2(CONFIG_DIR / name, model / name)
    write_json(model / "decision_policy.json", policy)
    model_card = AI_ROOT.parent / "docs/ai-scope-and-model-card-v2.md"
    if model_card.is_file():
        shutil.copy2(model_card, model / "model_card.md")
    validation_report = AI_ROOT / "reports/ai-validation-2026-09-11.md"
    if validation_report.is_file():
        shutil.copy2(validation_report, model / "validation_addendum.md")
    docs = destination / "docs"
    docs.mkdir()
    for name in [
        "ai-contract.md",
        "ai-weekly-validation.md",
        "ai-scope-and-model-card-v2.md",
        "autsl-camera-pose-compatibility.md",
    ]:
        source = AI_ROOT.parent / "docs" / name
        if source.is_file():
            shutil.copy2(source, docs / name)
    if validation_dir is not None or evidence_files:
        evidence = destination / "validation"
        evidence.mkdir()
        sources = []
        if validation_dir is not None:
            sources.extend(
                source
                for source in sorted(validation_dir.iterdir())
                if source.is_file() and source.suffix.lower() in {".json", ".csv", ".png"}
            )
        sources.extend(evidence_files)
        names: set[str] = set()
        for source in sources:
            if source.name in names:
                raise ValueError(f"Duplicate evidence filename: {source.name}")
            names.add(source.name)
            shutil.copy2(source, evidence / source.name)
    write_json(destination / "package_manifest.json", dict(counts=counts, signerCounts={k:len(v) for k,v in signers.items()},
               runtime=runtime, decisionPolicy=policy, cloud_executed=False,
               restricted_data=True, redistribution="Private local use; confirm license/permissions before OBS upload"))
    hashes = {p.relative_to(destination).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
              for p in destination.rglob("*") if p.is_file()}
    write_json(destination / "checksums.json", hashes)
    return counts


def verify_package(root):
    hashes = load_json(root / "checksums.json")
    for name, expected in hashes.items():
        path = contained(root, name)
        if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise ValueError(f"Checksum mismatch: {name}")
    return len(hashes)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-root", type=Path)
    parser.add_argument("--model-dir", type=Path, default=Path("outputs"))
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--decision-policy", type=Path)
    parser.add_argument("--validation-dir", type=Path)
    parser.add_argument("--evidence-file", type=Path, action="append", default=[])
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    if args.verify:
        print("Verified files:", verify_package(args.output))
    else:
        if args.data_root is None:
            parser.error("--data-root required")
        print(build_package(args.data_root, args.model_dir, args.output,
                            policy_path=args.decision_policy, validation_dir=args.validation_dir,
                            evidence_files=args.evidence_file))


if __name__ == "__main__":
    main()
