"""`/camera-trials` ekranından indirilen 55 belirti kamera denemesini raporlar.

Kabul seviyeleri (plan §7):
- Teknik entegrasyon: bütün doğru tahminlerde gösterilen avatar beklenen avatardır ve
  `seker` tahmini `diabetes` avatarıyla gösterilir.
- Deneysel demo: sözlükteki belirtilerin (11 veya 15) her birinde en az bir doğru kamera tahmini ve hasta onayı.
- Hiç doğru tanınmayan sınıflar gizlenmez; raporda başarısız olarak listelenir.
Sonuçlar klinik yeterlilik veya farklı kişilerde doğrulanmış başarı değildir.
"""
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

import numpy as np

from src.common import label_config, write_json

EXPECTED_TRIALS_PER_CLASS = 5
LATENCY_P95_GATE_MS = 2500


def _bool(value: str) -> bool | None:
    if value in {"true", "True", "1"}:
        return True
    if value in {"false", "False", "0"}:
        return False
    return None


def read_rows(paths: list[Path]) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for path in paths:
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            rows.extend(csv.DictReader(handle))
    return rows


def summarize(rows: list[dict[str, str]]) -> dict[str, object]:
    versions = {row.get("vocabulary_version") for row in rows} & {"signbridge30-v1", "signbridge34-v1"}
    if len(versions) > 1:
        raise ValueError("CSV'ler farklı sözlük sürümlerinden geliyor; ayrı ayrı raporlayın.")
    config = label_config(versions.pop() if versions else "signbridge30-v1")
    labels = {item["classId"]: item for item in config["labels"]}
    expected_ids = [labels[class_id].get("symptomExpressionId", class_id) for class_id in config["symptomClassIds"]]
    completed = [row for row in rows if row["outcome"] != "quality_rejected" and _bool(row.get("user_confirmed", "")) is not None]
    quality_rejected = [row for row in rows if row["outcome"] == "quality_rejected"]
    per_class: dict[str, dict[str, object]] = {}
    avatar_errors = []
    for expression_id in expected_ids:
        trials = [row for row in completed if row["expected_expression_id"] == expression_id]
        correct = [row for row in trials if _bool(row["correct"])]
        confirmed_correct = [row for row in correct if _bool(row["user_confirmed"])]
        latencies = [float(row["latency_ms"]) for row in trials if row.get("latency_ms")]
        per_class[expression_id] = {
            "trials": len(trials),
            "correct": len(correct),
            "confirmedCorrect": len(confirmed_correct),
            "forcedCandidates": sum(_bool(row["forced_candidate"]) is True for row in trials),
            "qualityRejected": sum(row["expected_expression_id"] == expression_id for row in quality_rejected),
            "medianConfidenceCorrect": float(np.median([float(r["confidence"]) for r in correct if r["confidence"]])) if correct else None,
            "latencyP95Ms": float(np.percentile(latencies, 95)) if latencies else None,
            "status": "başarılı" if confirmed_correct else "BAŞARISIZ",
        }
    for row in completed:
        if not row.get("predicted_class_id"):
            continue
        label = labels.get(row["predicted_class_id"], {})
        expected_avatar = label.get("symptomExpressionId", row["predicted_class_id"])
        if row.get("shown_avatar") and row["shown_avatar"] != expected_avatar:
            avatar_errors.append(row["trial_id"])
        if row["predicted_class_id"] == "seker" and row.get("shown_avatar") != "diabetes":
            avatar_errors.append(row["trial_id"])
    latencies = [float(row["latency_ms"]) for row in completed if row.get("latency_ms")]
    sugar_rows = [row for row in completed if row["predicted_class_id"] == "seker"]
    failed = [key for key, value in per_class.items() if value["status"] != "başarılı"]
    participants = sorted({row["participant"] for row in rows})
    return {
        "participants": participants,
        "plannedTrials": len(expected_ids) * EXPECTED_TRIALS_PER_CLASS * max(1, len(participants)),
        "completedTrials": len(completed),
        "qualityRejectedAttempts": len(quality_rejected),
        "correct": sum(_bool(row["correct"]) is True for row in completed),
        "accuracy": (sum(_bool(row["correct"]) is True for row in completed) / len(completed)) if completed else None,
        "userConfirmedCorrect": sum(_bool(row["correct"]) is True and _bool(row["user_confirmed"]) is True for row in completed),
        "userConfirmedWrong": sum(_bool(row["correct"]) is False and _bool(row["user_confirmed"]) is True for row in completed),
        "latencyP50Ms": float(np.percentile(latencies, 50)) if latencies else None,
        "latencyP95Ms": float(np.percentile(latencies, 95)) if latencies else None,
        "sekerPredictions": len(sugar_rows),
        "sekerShownAsDiabetes": sum(row.get("shown_avatar") == "diabetes" for row in sugar_rows),
        "avatarMappingErrors": sorted(set(avatar_errors)),
        "technicalIntegrationPassed": not avatar_errors,
        "experimentalDemoPassed": not failed and len(completed) > 0,
        "failedClasses": failed,
        "perClass": per_class,
        "modelVersions": sorted({row["model_version"] for row in completed if row.get("model_version")}),
    }


def _pct(value: object) -> str:
    return "—" if value is None else f"%{float(value) * 100:.1f}".replace(".", ",")


def write_report(path: Path, summary: dict[str, object]) -> None:
    lines = [
        "# Belirti kamera denemeleri raporu",
        "",
        f"- Katılımcı: {', '.join(summary['participants']) or '—'} · Model: {', '.join(summary['modelVersions']) or '—'}",
        f"- Tamamlanan deneme: {summary['completedTrials']}/{summary['plannedTrials']} · kalite reddi (tekrarlanan girişim): {summary['qualityRejectedAttempts']}",
        f"- Doğru: {summary['correct']} ({_pct(summary['accuracy'])}) · kullanıcının onayladığı yanlış öneri: {summary['userConfirmedWrong']}",
        f"- Tahmin gecikmesi p50/p95: {summary['latencyP50Ms'] or '—'} / {summary['latencyP95Ms'] or '—'} ms"
        + ("" if summary["latencyP95Ms"] is None else
           f" (kapı p95 ≤ {LATENCY_P95_GATE_MS} ms: {'geçti' if summary['latencyP95Ms'] <= LATENCY_P95_GATE_MS else 'KALDI'})"),
        f"- `seker` tahmini: {summary['sekerPredictions']}, `diabetes` avatarıyla gösterilen: {summary['sekerShownAsDiabetes']}",
        "",
        "## Kabul seviyeleri",
        "",
        f"- Teknik entegrasyon: **{'başarılı' if summary['technicalIntegrationPassed'] else 'BAŞARISIZ'}**"
        + (f" (avatar hatası: {', '.join(summary['avatarMappingErrors'])})" if summary["avatarMappingErrors"] else ""),
        f"- Deneysel demo (her belirtide ≥1 doğru ve onaylı tahmin): **{'başarılı' if summary['experimentalDemoPassed'] else 'BAŞARISIZ'}**",
        f"- Başarısız sınıflar: {', '.join(summary['failedClasses']) or 'yok'}",
        "",
        "| Belirti | Deneme | Doğru | Onaylı doğru | Düşük güvenli | Kalite reddi | Durum |",
        "|---|---:|---:|---:|---:|---:|---|",
    ]
    for key, item in summary["perClass"].items():
        lines.append(
            f"| `{key}` | {item['trials']} | {item['correct']} | {item['confirmedCorrect']} | {item['forcedCandidates']} "
            f"| {item['qualityRejected']} | {item['status']} |"
        )
    lines += [
        "",
        "Bu sonuçlar tek kişinin denemeleridir; klinik yeterlilik veya farklı kişilerde doğrulanmış başarı olarak sunulmaz.",
        "",
    ]
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Belirti kamera deneme CSV'lerini raporlar.")
    parser.add_argument("csv", nargs="+")
    parser.add_argument("--output", default="reports/symptom-camera-trials.md")
    args = parser.parse_args()
    summary = summarize(read_rows([Path(item) for item in args.csv]))
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    write_report(output, summary)
    write_json(output.with_suffix(".json"), summary)
    print(json.dumps({k: v for k, v in summary.items() if k != "perClass"}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
