"""Huawei ModelArts özel eğitim işi için giriş dosyası."""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


def _is_obs(path: str) -> bool:
    return path.lower().startswith("obs://")


def _copy_from_obs(source: str, destination: Path) -> None:
    import moxing as mox  # ModelArts ortamında sağlanır

    destination.mkdir(parents=True, exist_ok=True)
    mox.file.copy_parallel(source, str(destination))


def _copy_to_obs(source: Path, destination: str) -> None:
    import moxing as mox

    mox.file.copy_parallel(str(source), destination)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data_url", required=True)
    parser.add_argument("--train_url", required=True)
    parser.add_argument("--epochs", default="50")
    parser.add_argument("--batch-size", default="32")
    parser.add_argument("--manifest-dir", help="Downloaded data manifests; defaults to data_url/manifests")
    args, unknown = parser.parse_known_args()

    ai_root = Path(__file__).resolve().parents[1]
    local_data = Path("/cache/signbridge-data") if _is_obs(args.data_url) else Path(args.data_url).resolve()
    local_output = Path("/cache/signbridge-output") if _is_obs(args.train_url) else Path(args.train_url).resolve()
    if _is_obs(args.data_url):
        _copy_from_obs(args.data_url, local_data)
    local_output.mkdir(parents=True, exist_ok=True)
    if any(local_output.iterdir()):
        raise ValueError("Çıktı dizini boş olmalıdır; mevcut modelin üzerine yazılmaz.")
    manifest_dir = Path(args.manifest_dir).resolve() if args.manifest_dir else local_data / "manifests"
    if not manifest_dir.is_dir():
        raise FileNotFoundError(f"Taşınmış manifest dizini eksik: {manifest_dir}")

    command = [
        sys.executable,
        "-m",
        "src.train",
        "--data-root",
        str(local_data),
        "--manifest-dir",
        str(manifest_dir),
        "--output-dir",
        str(local_output),
        "--epochs",
        args.epochs,
        "--batch-size",
        args.batch_size,
        *unknown,
    ]
    subprocess.run(command, cwd=ai_root, check=True)
    if _is_obs(args.train_url):
        _copy_to_obs(local_output, args.train_url)


if __name__ == "__main__":
    main()
