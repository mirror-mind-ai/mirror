"""Stable, payload-free failures for Journey Projection Contract v1."""

from __future__ import annotations

from enum import Enum


class ProjectionErrorCode(str, Enum):
    UNSUPPORTED_CONTRACT = "unsupported_contract"
    UNKNOWN_JOURNEY = "unknown_journey"
    INVALID_IDENTIFIER = "invalid_identifier"
    UNSAFE_PROJECTION_PATH = "unsafe_projection_path"
    NAMESPACE_VIOLATION = "namespace_violation"
    SCHEMA_VALIDATION_FAILED = "schema_validation_failed"
    SERIALIZATION_FAILED = "serialization_failed"
    PUBLICATION_FAILED = "publication_failed"
    PROJECTION_DIVERGENCE = "projection_divergence"


class ProjectionError(Exception):
    """A bounded public contract failure.

    Messages must describe the violated boundary without interpolating document
    values, roots, environment values, or provider output.
    """

    MAX_MESSAGE_LENGTH = 240

    def __init__(self, code: ProjectionErrorCode, message: str) -> None:
        bounded = " ".join(message.split())[: self.MAX_MESSAGE_LENGTH]
        super().__init__(bounded)
        self.code = code
        self.message = bounded

    def to_dict(self) -> dict[str, str]:
        return {"status": "error", "code": self.code.value, "message": self.message}
