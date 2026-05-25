"""User-home preferences for the local Mirror web surface."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

Perspective = Literal["atlas", "workspace"]
VALID_PERSPECTIVES: tuple[Perspective, ...] = ("atlas", "workspace")


@dataclass(frozen=True)
class PreferenceRead:
    default_perspective: Perspective | None
    warning: str | None = None


class WebPreferenceStore:
    """Persist web preferences in the user's Mirror home."""

    def __init__(self, mirror_home: str | Path | None) -> None:
        self.mirror_home = Path(mirror_home).expanduser() if mirror_home is not None else None

    @property
    def path(self) -> Path | None:
        if self.mirror_home is None:
            return None
        return self.mirror_home / "web" / "preferences.json"

    def read(self) -> PreferenceRead:
        path = self.path
        if path is None:
            return PreferenceRead(
                default_perspective=None,
                warning="Mirror home is not configured; default perspective cannot be persisted.",
            )
        if not path.exists():
            return PreferenceRead(default_perspective=None)

        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            return PreferenceRead(
                default_perspective=None,
                warning=f"Default perspective preference could not be read: {exc}",
            )

        value = payload.get("default_perspective") if isinstance(payload, dict) else None
        if value in VALID_PERSPECTIVES:
            return PreferenceRead(default_perspective=value)
        return PreferenceRead(
            default_perspective=None,
            warning="Default perspective preference is invalid; choose Atlas or Workspace again.",
        )

    def write_default_perspective(self, perspective: str) -> PreferenceRead:
        if perspective not in VALID_PERSPECTIVES:
            raise ValueError("default_perspective must be 'atlas' or 'workspace'")
        path = self.path
        if path is None:
            return PreferenceRead(
                default_perspective=None,
                warning="Mirror home is not configured; default perspective cannot be persisted.",
            )
        payload: dict[str, Any] = {"default_perspective": perspective}
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        return PreferenceRead(default_perspective=perspective)  # type: ignore[arg-type]
