"""AUTSL (OpenHands poz paketi, 226 işaret) → `landmark46-v1` parça dosyaları.

`AUTSL.zip` içindeki `{train,val,test}_poses/*.pkl` dosyaları açılmadan okunur, `convert_autsl` ile aynı
kalite kapısı ve ön işlemeden geçirilir ve bellek dostu parçalara yazılır:
`<veri kökü>/processed/autsl226/shards/<split>_<başlangıç>.npz`
(landmarks float16 N×60×46×2, mask uint8 N×60×46, sample_id). Parçalar `src.pretrain_autsl226`
tarafından okunur. Uzun süren makinelerde parça parça çalıştırılabilir (--start/--stop);
var olan parça atlanır.

Güvenlik: pickle yalnız kullanıcının güvendiği resmî AUTSL/OpenHands paketinden okunmalıdır.

Örnek (tüm bölümler, 4000'lik parçalar):
    python -m src.data.pack_autsl226 --zip "<yol>/AUTSL.zip" --data-root "<veri kökü>"
"""
from __future__ import annotations

import argparse
import pickle
import zipfile
from pathlib import Path

import numpy as np

from src.common import preprocessing_config, resolve_data_root
from src.data.preprocessing import assess_quality, preprocess_pose_sequence

SPLITS = ("train", "val", "test")


def pack_shard(archive: zipfile.ZipFile, names: list[str], output: Path) -> tuple[int, int]:
    config = preprocessing_config()
    landmarks, masks, ids, rejected = [], [], [], 0
    for name in names:
        payload = pickle.loads(archive.read(name))  # noqa: S301 - güvenilen resmî paket
        keypoints = np.asarray(payload["keypoints"])[..., :2]
        confidences = np.asarray(payload["confidences"])
        quality = assess_quality(
            keypoints, confidences, minimum_confidence=config["minimumConfidence"],
            minimum_frames=config["minimumSequenceFrames"],
            minimum_shoulder_ratio=config["minimumShoulderFrameRatio"],
            minimum_hand_ratio=config["minimumHandFrameRatio"],
        )
        if quality.status != "approved":
            rejected += 1
            continue
        processed = preprocess_pose_sequence(keypoints, confidences, target_length=config["sequenceLength"],
                                             minimum_confidence=config["minimumConfidence"])
        landmarks.append(processed["landmarks"].astype(np.float16))
        masks.append(processed["mask"].astype(np.uint8))
        ids.append(Path(name).name.replace("_color.pkl", ""))
    output.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(output, landmarks=np.stack(landmarks), mask=np.stack(masks), sample_id=np.asarray(ids),
                        rejected=np.int64(rejected), total=np.int64(len(names)))
    return len(ids), rejected


def main() -> None:
    parser = argparse.ArgumentParser(description="AUTSL-226 poz paketini landmark46-v1 parçalarına dönüştürür.")
    parser.add_argument("--zip", required=True, help="AUTSL.zip (OpenHands poz paketi)")
    parser.add_argument("--data-root")
    parser.add_argument("--split", choices=SPLITS, action="append")
    parser.add_argument("--shard-size", type=int, default=4000)
    parser.add_argument("--start", type=int, default=0)
    parser.add_argument("--stop", type=int)
    args = parser.parse_args()
    data_root = resolve_data_root(args.data_root)
    out_dir = data_root / "processed" / "autsl226" / "shards"
    with zipfile.ZipFile(args.zip) as archive:
        all_names = archive.namelist()
        for split in args.split or SPLITS:
            names = sorted(n for n in all_names if n.startswith(f"{split}_poses/") and n.endswith(".pkl"))
            stop = min(args.stop or len(names), len(names))
            for start in range(args.start, stop, args.shard_size):
                output = out_dir / f"{split}_{start:05d}.npz"
                if output.exists():
                    print(f"atlandı (var): {output.name}")
                    continue
                kept, rejected = pack_shard(archive, names[start:min(start + args.shard_size, stop)], output)
                print(f"{output.name}: {kept} örnek, {rejected} kalite reddi", flush=True)


if __name__ == "__main__":
    main()
