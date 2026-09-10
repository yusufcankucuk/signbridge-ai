"""Create local, checksummed release including portable data; never uploads."""
from __future__ import annotations

import argparse
import csv
import hashlib
import shutil
from pathlib import Path, PureWindowsPath

import numpy as np

from src.common import AI_ROOT, CONFIG_DIR, autsl_labels, load_json, write_json
from src.model.dataset import sequence_to_features


def contained(root: Path, relative: str):
    path = Path(relative)
    if path.is_absolute() or PureWindowsPath(relative).is_absolute() or ".." in path.parts:
        raise ValueError("Manifest path must be relative and contained")
    resolved = (root / path).resolve()
    if not resolved.is_relative_to(root.resolve()):
        raise ValueError("Manifest escapes data root")
    return resolved


def build_package(data_root, model_dir, destination, manifest_dir=AI_ROOT / "manifests"):
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
    card = AI_ROOT / "reports/weekly-validation-2026-09-10.md"
    if card.is_file():
        shutil.copy2(card, model / "validation_addendum.md")
    hashes = {p.relative_to(destination).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
              for p in destination.rglob("*") if p.is_file()}
    write_json(destination / "checksums.json", hashes)
    write_json(destination / "package_manifest.json", dict(counts=counts, signerCounts={k:len(v) for k,v in signers.items()},
               runtime=load_json(model / "runtime_config.json"), file_count=len(hashes), cloud_executed=False,
               restricted_data=True, redistribution="Private local use; confirm license/permissions before OBS upload"))
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
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    if args.verify:
        print("Verified files:", verify_package(args.output))
    else:
        if args.data_root is None:
            parser.error("--data-root required")
        print(build_package(args.data_root, args.model_dir, args.output))


if __name__ == "__main__":
    main()
