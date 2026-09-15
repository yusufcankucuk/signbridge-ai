from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

from src.common import load_json


SUPPORTED_METHODS = {"score_only", "score_and_margin"}


@dataclass(frozen=True)
class Decision:
    accepted: bool
    winner_index: int
    confidence: float
    margin: float
    rejection_reason: str | None


def default_policy(runtime: dict[str, Any]) -> dict[str, Any]:
    """Build the legacy-compatible score-only policy from the runtime config."""
    return {
        "schemaVersion": "1.0",
        "decisionPolicyVersion": "score-threshold-v1",
        "enabled": True,
        "allowedClassIds": None,
        "method": "score_only",
        "confidenceThreshold": float(runtime["confidenceThreshold"]),
        "marginThreshold": 0.0,
        "modelVersion": runtime["modelVersion"],
        "preprocessingVersion": runtime["preprocessingVersion"],
        "vocabularyVersion": runtime["vocabularyVersion"],
    }


def validate_policy(policy: dict[str, Any], runtime: dict[str, Any]) -> dict[str, Any]:
    required = {
        "schemaVersion",
        "decisionPolicyVersion",
        "method",
        "confidenceThreshold",
        "marginThreshold",
        "modelVersion",
        "preprocessingVersion",
        "vocabularyVersion",
    }
    missing = required - set(policy)
    if missing:
        raise ValueError(f"Karar politikası alanları eksik: {sorted(missing)}")
    if policy["schemaVersion"] != "1.0" or policy["method"] not in SUPPORTED_METHODS:
        raise ValueError("Desteklenmeyen karar politikası şeması veya yöntemi.")
    if not isinstance(policy["decisionPolicyVersion"], str) or not policy["decisionPolicyVersion"].strip():
        raise ValueError("Karar politikası sürümü geçersiz.")
    enabled = policy.get("enabled", True)
    if not isinstance(enabled, bool):
        raise ValueError("Karar politikası enabled alanı boolean olmalıdır.")
    allowed = policy.get("allowedClassIds")
    if allowed is not None and (
        not isinstance(allowed, list)
        or not allowed
        or any(not isinstance(item, str) or not item.strip() for item in allowed)
        or len(set(allowed)) != len(allowed)
    ):
        raise ValueError("Karar politikası allowedClassIds alanı geçersiz.")
    for field in ("modelVersion", "preprocessingVersion", "vocabularyVersion"):
        if policy[field] != runtime[field]:
            raise ValueError(f"Karar politikası {field} ile model paketi uyumsuz.")
    confidence = float(policy["confidenceThreshold"])
    margin = float(policy["marginThreshold"])
    if not np.isfinite(confidence) or not 0 <= confidence <= 1:
        raise ValueError("Karar politikası güven eşiği geçersiz.")
    if not np.isfinite(margin) or not 0 <= margin <= 1:
        raise ValueError("Karar politikası skor farkı eşiği geçersiz.")
    if policy["method"] == "score_only" and margin != 0:
        raise ValueError("score_only politikası marginThreshold=0 kullanmalıdır.")
    return dict(
        policy,
        enabled=enabled,
        allowedClassIds=allowed,
        confidenceThreshold=confidence,
        marginThreshold=margin,
    )


def load_policy(path: Path | None, runtime: dict[str, Any]) -> dict[str, Any]:
    if path is None:
        return default_policy(runtime)
    if not path.is_file():
        raise ValueError(f"Karar politikası bulunamadı: {path}")
    return validate_policy(load_json(path), runtime)


def decide(
    probabilities: np.ndarray,
    policy: dict[str, Any],
    winner_class_id: str | None = None,
) -> Decision:
    scores = np.asarray(probabilities, dtype=np.float64)
    if scores.ndim != 1 or len(scores) < 2 or not np.isfinite(scores).all():
        raise ValueError("Karar politikası için geçersiz skor vektörü.")
    ordered = np.argsort(scores)[::-1]
    winner = int(ordered[0])
    confidence = float(scores[winner])
    margin = confidence - float(scores[int(ordered[1])])
    if not policy.get("enabled", True):
        return Decision(False, winner, confidence, margin, "policy_disabled")
    allowed = policy.get("allowedClassIds")
    if allowed is not None and winner_class_id is not None and winner_class_id not in allowed:
        return Decision(False, winner, confidence, margin, "unsupported_class")
    if confidence < float(policy["confidenceThreshold"]):
        return Decision(False, winner, confidence, margin, "low_score")
    if policy["method"] == "score_and_margin" and margin < float(policy["marginThreshold"]):
        return Decision(False, winner, confidence, margin, "ambiguous_prediction")
    return Decision(True, winner, confidence, margin, None)
