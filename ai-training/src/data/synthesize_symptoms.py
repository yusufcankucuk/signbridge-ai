"""Az kaynaklı belirti sınıfları için bileşimsel (sentetik) landmark örnekleri üretir.

TİD'de birçok belirti işareti "yer + hareket" bileşimidir (baş + ağrı = baş ağrısı, karın + ağrı =
karın ağrısı). Bazı sınıflar için internette yalnız bir kişinin videosu bulunduğundan model yeni
kişilerde zorlanır. Bu araç, gerçek landmark dizilerinden iki kontrollü dönüşümle çeşitlilik üretir:

1. ``location``: Kaynak sınıftaki (ör. baş ağrısı) eli baş hizasında olan kareler, hedef sınıfın
   gerçek örneklerinden ölçülen vücut bölgesine (ör. karın) kaydırılır; hareket kısmı korunur.
2. ``handshape``: Hedef sınıfın gerçek örneğinin el yolu (merkez + dirsek) korunur; el biçimi başka
   kişilerin vücuda düz el koyduğu dizilerden alınır (ör. nefes, kalp krizi).

Sentetik örnekler ``source=SYNTHETIC``, ``signer_id=syn_<kaynak>``, ``derived_signer_id`` sütunlarıyla
ayrı manifeste yazılır; gerçek katılımcı veya gerçek kamera başarısı olarak raporlanmaz. Kişi bağımsız
ölçümde, dışarıda bırakılan kaynaktan türetilen sentetik örnekler eğitimden çıkarılır.
"""
from __future__ import annotations

import argparse
import csv
import json
from collections import Counter
from pathlib import Path

import numpy as np

from src.common import AI_ROOT, label_config, resolve_data_root, write_json

OUTPUT_SUBDIR = Path("processed") / "synthetic_health" / "landmark46-v1"
LEFT = slice(4, 25)
RIGHT = slice(25, 46)
FIELDNAMES = [
    "sample_id", "class_id", "model_index", "original_class_id", "source", "source_version", "signer_id",
    "consent_id", "split", "raw_path", "landmark_path", "quality_status", "training_status",
    "manual_selectable", "risk_tier", "source_quality_status", "quality_reason", "avatar_id",
    "extractor", "view", "recipe", "derived_signer_id", "donor_sample_id", "target_sample_id",
]

# hedef avatar -> tarifler. El biçimi aktarımı yalnız hedef işaretin de düz elle vücuda dokunduğu
# sınıflarda kullanılır (el biçimi ayırt edici olan kusma/yanık/çarpıntıda kullanılmaz).
# Sıra önemlidir (örnek numaraları); yeni tarifler sona eklenir.
RECIPES: list[tuple[str, dict[str, object]]] = [
    ("stomachache", {"kind": "location", "from": ["headache"], "region": "belly"}),
    ("stomachache", {"kind": "handshape", "donors": ["shortness-of-breath", "heart-attack", "palpitations"]}),
    ("nausea", {"kind": "handshape", "donors": ["shortness-of-breath", "heart-attack", "stomachache"]}),
    # TİD'de "ağrı" işareti acıyan yerde yapılır: baş ağrısı ≈ başta ağrı, karın ağrısı ≈ karında ağrı.
    # Ağrı işaretini yapan birçok kişinin hareketi ilgili bölgeye taşınarak bu iki sınıfa kişi çeşitliliği eklenir.
    ("headache", {"kind": "relocate", "from": ["pain"], "region": "head"}),
    ("stomachache", {"kind": "relocate", "from": ["pain"], "region": "belly"}),
]


def _hand_centroids(landmarks: np.ndarray, mask: np.ndarray, block: slice) -> tuple[np.ndarray, np.ndarray]:
    points = landmarks[:, block, :]
    visible = mask[:, block].astype(bool)
    counts = visible.sum(axis=1)
    sums = (points * visible[..., None]).sum(axis=1)
    centroid = np.divide(sums, np.maximum(counts, 1)[:, None])
    return centroid, counts >= 5


def active_block(landmarks: np.ndarray, mask: np.ndarray) -> slice:
    best, best_score = RIGHT, -1.0
    for block in (LEFT, RIGHT):
        centroid, ok = _hand_centroids(landmarks, mask, block)
        if ok.sum() < 2:
            continue
        path = np.linalg.norm(np.diff(centroid[ok], axis=0), axis=1).sum() + ok.mean()
        if path > best_score:
            best, best_score = block, path
    return best


def elbow_index(block: slice) -> int:
    return 2 if block == LEFT else 3


def region_anchor(samples: list[dict], region: str) -> np.ndarray:
    """Gerçek hedef örneklerinde elin bulunduğu vücut bölgesinin (omuz normalizasyonlu) ortancası."""
    points = []
    for sample in samples:
        block = active_block(sample["landmarks"], sample["mask"])
        centroid, ok = _hand_centroids(sample["landmarks"], sample["mask"], block)
        if region == "belly":
            chosen = ok & (centroid[:, 1] > 0.8)
        elif region == "head":
            chosen = ok & (centroid[:, 1] < -0.35)
        else:
            chosen = ok
        if chosen.any():
            points.append(np.median(centroid[chosen], axis=0))
    if not points:
        return np.asarray([-0.5, -0.8] if region == "head" else [0.0, 1.4], dtype=np.float32)
    return np.median(np.stack(points), axis=0).astype(np.float32)


def _smooth_weights(flags: np.ndarray, ramp: int = 5) -> np.ndarray:
    weights = flags.astype(np.float32)
    indexes = np.flatnonzero(flags)
    for index in range(len(flags)):
        if flags[index] or not len(indexes):
            continue
        distance = int(np.min(np.abs(indexes - index)))
        if distance <= ramp:
            weights[index] = 1.0 - distance / (ramp + 1)
    return weights


def location_transfer(sample: dict, anchor: np.ndarray, rng: np.random.Generator) -> dict | None:
    landmarks = sample["landmarks"].copy()
    mask = sample["mask"]
    block = active_block(landmarks, mask)
    centroid, ok = _hand_centroids(landmarks, mask, block)
    located = ok & (centroid[:, 1] < -0.35)
    if located.sum() < 3:
        return None
    source_point = np.median(centroid[located], axis=0)
    target = anchor + rng.normal(0.0, [0.12, 0.12])
    shift = (target - source_point).astype(np.float32)
    weights = _smooth_weights(located)
    hand_mask = mask[:, block].astype(bool)
    landmarks[:, block, :] += (weights[:, None, None] * shift) * hand_mask[..., None]
    elbow = elbow_index(block)
    landmarks[:, elbow, :] += weights[:, None] * shift * 0.45 * mask[:, elbow:elbow + 1]
    return {"landmarks": landmarks, "mask": mask.copy()}


def relocate_sign(sample: dict, anchor: np.ndarray, rng: np.random.Generator) -> dict | None:
    """Etkin elin tüm hareketini (biçim ve hareket korunarak) hedef vücut bölgesine taşır."""
    landmarks = sample["landmarks"].copy()
    mask = sample["mask"]
    block = active_block(landmarks, mask)
    centroid, ok = _hand_centroids(landmarks, mask, block)
    if ok.sum() < 5:
        return None
    source_point = np.median(centroid[ok], axis=0)
    target = anchor + rng.normal(0.0, [0.10, 0.10])
    shift = (target - source_point).astype(np.float32)
    hand_mask = mask[:, block].astype(bool)
    landmarks[:, block, :] += shift * hand_mask[..., None]
    elbow = elbow_index(block)
    landmarks[:, elbow, :] += shift * 0.45 * mask[:, elbow:elbow + 1]
    return {"landmarks": landmarks, "mask": mask.copy()}


def _resample(values: np.ndarray, length: int) -> np.ndarray:
    positions = np.linspace(0, len(values) - 1, length)
    lower = np.floor(positions).astype(int)
    upper = np.minimum(lower + 1, len(values) - 1)
    weight = (positions - lower).reshape(-1, *([1] * (values.ndim - 1)))
    return values[lower] * (1 - weight) + values[upper] * weight


def handshape_transplant(target: dict, donor: dict, rng: np.random.Generator) -> dict | None:
    """Hedefin el yolunu korur, el biçimini (merkeze göre) bağışçıdan alır."""
    landmarks = target["landmarks"].copy()
    mask = target["mask"].copy()
    target_block = active_block(landmarks, mask)
    target_centroid, target_ok = _hand_centroids(landmarks, mask, target_block)
    donor_block = active_block(donor["landmarks"], donor["mask"])
    donor_centroid, donor_ok = _hand_centroids(donor["landmarks"], donor["mask"], donor_block)
    if target_ok.sum() < 5 or donor_ok.sum() < 5:
        return None
    donor_frames = np.flatnonzero(donor_ok)
    donor_shapes = donor["landmarks"][donor_frames, donor_block, :] - donor_centroid[donor_frames, None, :]
    if donor_block != target_block:
        donor_shapes = donor_shapes * np.asarray([-1.0, 1.0], dtype=np.float32)
    shapes = _resample(donor_shapes, len(landmarks))
    size = rng.uniform(0.9, 1.1)
    new_hand = target_centroid[:, None, :] + shapes * size
    landmarks[:, target_block, :] = np.where(target_ok[:, None, None], new_hand, landmarks[:, target_block, :])
    mask[:, target_block] = np.where(target_ok[:, None], 1, mask[:, target_block])
    return {"landmarks": landmarks.astype(np.float32), "mask": mask}


def _load(data_root: Path, rows: list[dict[str, str]]) -> list[dict]:
    samples = []
    for row in rows:
        with np.load(data_root / row["landmark_path"], allow_pickle=False) as data:
            samples.append({
                "row": row,
                "landmarks": data["landmarks"].astype(np.float32),
                "mask": data["mask"].astype(np.uint8),
                "confidence": data["confidence"].astype(np.float32),
            })
    return samples


def _avatar_of(row: dict[str, str], labels: dict[str, dict]) -> str:
    if row.get("avatar_id"):
        return row["avatar_id"]
    label = labels[row["class_id"]]
    return label.get("symptomExpressionId", row["class_id"])


def synthesize(data_root: Path, manifests: list[Path], output_manifest: Path, vocabulary: str,
               per_pair: int = 2, seed: int = 2026) -> dict[str, object]:
    config = label_config(vocabulary)
    labels = {item["classId"]: item for item in config["labels"]}
    by_avatar = {labels[c].get("symptomExpressionId", c): labels[c] for c in config["symptomClassIds"]}
    rows: list[dict[str, str]] = []
    for manifest in manifests:
        with manifest.open("r", encoding="utf-8-sig", newline="") as handle:
            for row in csv.DictReader(handle):
                if row["training_status"] == "trainable" and row["quality_status"] in {"approved", "needs_review"}:
                    rows.append(row)
    samples = _load(data_root, rows)
    grouped: dict[str, list[dict]] = {}
    for sample in samples:
        grouped.setdefault(_avatar_of(sample["row"], labels), []).append(sample)

    rng = np.random.default_rng(seed)
    output_rows: list[dict[str, object]] = []
    target_dir = data_root / OUTPUT_SUBDIR
    target_dir.mkdir(parents=True, exist_ok=True)

    def write(avatar: str, recipe: str, result: dict, base: dict, donor: dict | None, index: int) -> None:
        label = by_avatar[avatar]
        derived = (donor or base)["row"]["signer_id"]
        sample_id = f"syn_{avatar}_{recipe}_{index:04d}".replace("-", "_")
        mask = result["mask"].astype(np.uint8)
        result_landmarks = np.where(mask[..., None] == 1, result["landmarks"], 0.0).astype(np.float32)
        relative = OUTPUT_SUBDIR / f"{sample_id}.npz"
        np.savez_compressed(
            data_root / relative, landmarks=result_landmarks, mask=mask,
            confidence=mask.astype(np.float32), original_length=np.int64(60),
            class_id=np.asarray(label["classId"]), label_index=np.int64(label["index"]),
            sample_id=np.asarray(sample_id), preprocessing_version=np.asarray("landmark46-v1"),
        )
        output_rows.append({
            "sample_id": sample_id, "class_id": label["classId"], "model_index": label["index"],
            "original_class_id": label.get("originalClassId", ""), "source": "SYNTHETIC",
            "source_version": recipe, "signer_id": f"syn_{derived}", "consent_id": "derived_from_sources",
            "split": "train", "raw_path": "", "landmark_path": relative.as_posix(),
            "quality_status": "approved", "training_status": "trainable", "manual_selectable": "true",
            "risk_tier": label.get("riskTier", "standard"), "source_quality_status": "synthetic",
            "quality_reason": "synthetic", "avatar_id": avatar,
            "extractor": (donor or base)["row"].get("extractor", ""), "view": f"synthetic-{recipe}",
            "recipe": recipe, "derived_signer_id": derived,
            "donor_sample_id": donor["row"]["sample_id"] if donor else base["row"]["sample_id"],
            "target_sample_id": base["row"]["sample_id"],
        })

    counter = 0
    for avatar, recipe in RECIPES:
        if avatar not in by_avatar:
            continue
        targets = grouped.get(avatar, [])
        if recipe["kind"] in {"location", "relocate"}:
            transfer = location_transfer if recipe["kind"] == "location" else relocate_sign
            anchor = region_anchor(targets, str(recipe["region"]))
            for source_avatar in recipe["from"]:
                for base in grouped.get(source_avatar, []):
                    for _ in range(per_pair):
                        result = transfer(base, anchor, rng)
                        if result is not None:
                            counter += 1
                            write(avatar, str(recipe["kind"]), result, base, None, counter)
        else:
            target_signers = {t["row"]["signer_id"] for t in targets}
            for donor_avatar in recipe["donors"]:
                donors = [d for d in grouped.get(donor_avatar, []) if d["row"]["signer_id"] not in target_signers]
                for target in targets:
                    if not donors:
                        break
                    for donor_index in rng.choice(len(donors), size=min(per_pair, len(donors)), replace=False):
                        result = handshape_transplant(target, donors[int(donor_index)], rng)
                        if result is not None:
                            counter += 1
                            write(avatar, "handshape", result, target, donors[int(donor_index)], counter)

    output_manifest.parent.mkdir(parents=True, exist_ok=True)
    with output_manifest.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDNAMES, lineterminator="\n")
        writer.writeheader()
        writer.writerows(output_rows)
    summary = {
        "vocabularyVersion": vocabulary,
        "samples": len(output_rows),
        "perAvatar": dict(Counter(str(row["avatar_id"]) for row in output_rows)),
        "perRecipe": dict(Counter(f"{row['avatar_id']}:{row['recipe']}" for row in output_rows)),
        "derivedSigners": sorted({str(row["derived_signer_id"]) for row in output_rows}),
        "note": "Sentetik örneklerdir; gerçek katılımcı veya kamera başarısı olarak raporlanmaz.",
    }
    write_json(output_manifest.with_name(output_manifest.stem + "_summary.json"), summary)
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Az kaynaklı belirtiler için bileşimsel sentetik örnek üretir.")
    parser.add_argument("--data-root")
    parser.add_argument("--manifest", action="append", default=[],
                        help="Girdi sağlık manifestleri (varsayılan: MEB + harici)")
    parser.add_argument("--output", default=str(AI_ROOT / "manifests" / "synthetic_health_training.csv"))
    parser.add_argument("--vocabulary", default="signbridge34-v1")
    parser.add_argument("--per-pair", type=int, default=2)
    parser.add_argument("--seed", type=int, default=2026)
    args = parser.parse_args()
    manifests = [Path(item).resolve() for item in args.manifest] or [
        AI_ROOT / "manifests" / "meb_health11_training.csv",
        AI_ROOT / "manifests" / "external_health_training.csv",
    ]
    summary = synthesize(resolve_data_root(args.data_root), manifests, Path(args.output).resolve(),
                         args.vocabulary, args.per_pair, args.seed)
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
