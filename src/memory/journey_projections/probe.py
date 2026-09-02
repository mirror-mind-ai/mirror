"""Strictly isolated preparation helpers for the consumer-owned v1 probe."""

from __future__ import annotations

import json
import os
from collections.abc import Mapping
from pathlib import Path
from typing import Any

from memory.builder.delivery_cursor import set_delivery_cursor
from memory.client import MemoryClient
from memory.config import db_path_for_home
from memory.journey_projections.errors import ProjectionError, ProjectionErrorCode
from memory.journey_projections.test_guard import (
    configured_production_home,
    require_isolated_test_home,
)

PROBE_JOURNEY_ID = "projection-probe-journey"
PROBE_EXTENSION_ID = "projection-probe"
_TRANSFER_DIR = ".journey-projection-probe"
_CONTROL_FILE = "projection-control.json"
_FIXED_GENERATED_AT = "2030-01-01T00:00:00Z"
_FIXED_SNAPSHOT_ID = "op-probe-0001"
_FIXED_SOURCE_REVISION = "sha256:probe-operational-revision"


def prepare_probe(
    mirror_home: str | Path | None,
    fixture_root: str | Path,
    active_state_path: str | Path,
) -> Mapping[str, Any]:
    """Register the one synthetic Journey after proving test-home confinement."""
    home = require_isolated_test_home(
        mirror_home,
        production_home=configured_production_home(),
    )
    transfer = _safe_directory(home / _TRANSFER_DIR, home)
    fixture = _safe_directory(Path(fixture_root), transfer)
    active_path = _safe_file(Path(active_state_path), fixture)
    descriptor = _read_object(_safe_file(fixture / ".mirror-journey.json", fixture))
    if descriptor.get("id") != PROBE_JOURNEY_ID:
        raise _unavailable()
    active = _read_active_state(active_path)

    database_path = db_path_for_home(home, "test").resolve()
    if not database_path.is_relative_to(home):
        raise _unavailable()
    with MemoryClient(env="test", db_path=database_path) as client:
        opened = client.conn.execute("PRAGMA database_list").fetchall()
        main_paths = [Path(row[2]).resolve() for row in opened if row[1] == "main" and row[2]]
        if main_paths != [database_path]:
            raise _unavailable()
        if client.journeys.get_project_path(PROBE_JOURNEY_ID) is None:
            client.journeys.create_journey(
                slug=PROBE_JOURNEY_ID,
                content=(
                    "# Projection Probe Journey\n\n"
                    "**Status:** active\n\n"
                    "## Description\n\n"
                    "Synthetic contract fixture used only by the isolated black-box probe."
                ),
                project_path=str(fixture),
            )
        else:
            client.journeys.set_project_path(PROBE_JOURNEY_ID, str(fixture))
        set_delivery_cursor(
            client.store,
            journey=PROBE_JOURNEY_ID,
            method="ariad",
            active_item=active["activeItem"],
            active_checkpoint=active["checkpoint"],
            pending_confirmation=active["pendingConfirmation"],
            last_delivery_event=active["status"],
            refresh_projection=False,
        )

    control = {
        "journeyId": PROBE_JOURNEY_ID,
        "fixtureRoot": str(fixture),
        "generatedAt": _FIXED_GENERATED_AT,
        "snapshotId": _FIXED_SNAPSHOT_ID,
        "sourceRevision": _FIXED_SOURCE_REVISION,
    }
    _write_control(home, control)
    return {"status": "prepared", "journeyId": PROBE_JOURNEY_ID}


def load_probe_control(mirror_home: str | Path, journey_id: str) -> Mapping[str, str] | None:
    """Load fixed compiler inputs only inside a previously guarded test home."""
    if os.getenv("MEMORY_ENV") != "test" or journey_id != PROBE_JOURNEY_ID:
        return None
    home = require_isolated_test_home(
        mirror_home,
        production_home=configured_production_home(),
    )
    path = _safe_file(home / _TRANSFER_DIR / _CONTROL_FILE, home / _TRANSFER_DIR)
    value = _read_object(path)
    required = {"journeyId", "fixtureRoot", "generatedAt", "snapshotId", "sourceRevision"}
    if set(value) != required or value.get("journeyId") != journey_id:
        raise _unavailable()
    if not all(isinstance(value[key], str) and value[key] for key in required):
        raise _unavailable()
    fixture = _safe_directory(Path(value["fixtureRoot"]), home / _TRANSFER_DIR)
    if fixture != Path(value["fixtureRoot"]).resolve():
        raise _unavailable()
    return {key: value[key] for key in required}


def require_probe_extension(actor: str | None, target: str | None) -> str:
    """Return the fixed extension identity; caller text never grants authority."""
    if actor != PROBE_EXTENSION_ID or target != PROBE_EXTENSION_ID:
        raise ProjectionError(
            ProjectionErrorCode.NAMESPACE_VIOLATION,
            "Probe publication identity does not match the bound extension authority.",
        )
    return PROBE_EXTENSION_ID


def _read_active_state(path: Path) -> Mapping[str, str]:
    value = _read_object(path)
    required = {"activeItem", "checkpoint", "pendingConfirmation", "status"}
    if set(value) != required or not all(
        isinstance(value[key], str) and value[key].strip() for key in required
    ):
        raise _unavailable()
    return {key: value[key].strip() for key in required}


def _read_object(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise _unavailable() from exc
    if not isinstance(value, dict):
        raise _unavailable()
    return value


def _write_control(home: Path, value: Mapping[str, Any]) -> None:
    directory = _safe_directory(home / _TRANSFER_DIR, home)
    target = directory / _CONTROL_FILE
    temporary = directory / f".{_CONTROL_FILE}.tmp"
    try:
        temporary.write_text(
            json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n",
            encoding="utf-8",
        )
        os.replace(temporary, target)
    except OSError as exc:
        temporary.unlink(missing_ok=True)
        raise _unavailable() from exc


def _safe_directory(path: Path, boundary: Path) -> Path:
    try:
        resolved_boundary = boundary.expanduser().resolve(strict=True)
        resolved = path.expanduser().resolve(strict=True)
    except OSError as exc:
        raise _unavailable() from exc
    if not resolved.is_relative_to(resolved_boundary) or not resolved.is_dir():
        raise _unavailable()
    _reject_symlink_components(path.expanduser(), resolved_boundary)
    return resolved


def _safe_file(path: Path, boundary: Path) -> Path:
    try:
        resolved_boundary = boundary.expanduser().resolve(strict=True)
        resolved = path.expanduser().resolve(strict=True)
    except OSError as exc:
        raise _unavailable() from exc
    if not resolved.is_relative_to(resolved_boundary) or not resolved.is_file():
        raise _unavailable()
    _reject_symlink_components(path.expanduser(), resolved_boundary)
    return resolved


def _reject_symlink_components(path: Path, boundary: Path) -> None:
    current = (path if path.is_absolute() else Path.cwd() / path).absolute()
    candidates: list[Path] = []
    while True:
        try:
            if current.resolve(strict=True) == boundary:
                break
        except OSError as exc:
            raise _unavailable() from exc
        candidates.append(current)
        parent = current.parent
        if parent == current:
            raise _unavailable()
        current = parent
    if any(candidate.is_symlink() for candidate in candidates):
        raise _unavailable()


def _unavailable() -> ProjectionError:
    return ProjectionError(
        ProjectionErrorCode.UNSUPPORTED_CONTRACT,
        "Journey projection probe input is not a proven isolated synthetic fixture.",
    )
