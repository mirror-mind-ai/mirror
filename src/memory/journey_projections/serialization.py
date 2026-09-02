"""Deterministic JSON bytes for projection documents and receipts."""

from __future__ import annotations

import hashlib
import json
from typing import Any

from memory.journey_projections.errors import ProjectionError, ProjectionErrorCode


def canonical_json_bytes(value: Any) -> bytes:
    try:
        rendered = json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            indent=2,
            allow_nan=False,
        )
    except (TypeError, ValueError) as exc:
        raise ProjectionError(
            ProjectionErrorCode.SERIALIZATION_FAILED,
            "Projection document cannot be serialized as canonical JSON.",
        ) from exc
    return f"{rendered}\n".encode()


def canonical_sha256(value: Any) -> str:
    return f"sha256:{hashlib.sha256(canonical_json_bytes(value)).hexdigest()}"
