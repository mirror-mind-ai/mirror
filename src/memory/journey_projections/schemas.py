"""Offline JSON Schema 2020-12 validation for Journey projections."""

from __future__ import annotations

import json
from collections.abc import Mapping
from functools import cache, lru_cache
from importlib.resources import files
from typing import Any, Literal

from jsonschema import FormatChecker
from jsonschema.exceptions import SchemaError, ValidationError
from jsonschema.validators import validator_for
from referencing import Registry, Resource
from referencing.exceptions import Unresolvable

from memory.journey_projections.errors import ProjectionError, ProjectionErrorCode

_SCHEMA_FILES = {
    "envelope": "envelope.schema.json",
    "manifest": "manifest.schema.json",
    "operational": "operational.schema.json",
    "extension": "extension-projection.schema.json",
}


@cache
def load_schema(name: str) -> dict[str, Any]:
    try:
        filename = _SCHEMA_FILES[name]
    except KeyError as exc:
        raise ValueError(f"unknown projection schema: {name}") from exc
    path = files("memory.journey_projections.schema_documents").joinpath(filename)
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):  # pragma: no cover - package integrity guard
        raise RuntimeError(f"projection schema is not an object: {filename}")
    return payload


@lru_cache(maxsize=1)
def _registry() -> Registry:
    resources = []
    for name in _SCHEMA_FILES:
        schema = load_schema(name)
        resources.append((schema["$id"], Resource.from_contents(schema)))
    return Registry().with_resources(resources)


def _validate(document: Mapping[str, Any], schema: Mapping[str, Any]) -> None:
    try:
        validator_class = validator_for(schema)
        validator_class.check_schema(schema)
        validator = validator_class(
            schema,
            registry=_registry(),
            format_checker=FormatChecker(),
        )
        validator.validate(document)
    except (ValidationError, SchemaError, Unresolvable) as exc:
        keyword = getattr(exc, "validator", None)
        suffix = f" ({keyword})" if isinstance(keyword, str) and keyword else ""
        raise ProjectionError(
            ProjectionErrorCode.SCHEMA_VALIDATION_FAILED,
            f"Projection document failed schema validation{suffix}.",
        ) from exc


def validate_projection_document(
    document: Mapping[str, Any],
    *,
    domain: Literal["envelope", "operational", "extension"] = "envelope",
    additional_schema: Mapping[str, Any] | None = None,
) -> None:
    if not isinstance(document, Mapping):
        raise ProjectionError(
            ProjectionErrorCode.SCHEMA_VALIDATION_FAILED,
            "Projection document must be a JSON object.",
        )
    _validate(document, load_schema(domain))
    if additional_schema is not None:
        _validate(document, additional_schema)


def validate_manifest_document(document: Mapping[str, Any]) -> None:
    if not isinstance(document, Mapping):
        raise ProjectionError(
            ProjectionErrorCode.SCHEMA_VALIDATION_FAILED,
            "Projection manifest must be a JSON object.",
        )
    _validate(document, load_schema("manifest"))
