"""Authorization boundary for Journey Projection black-box probe helpers."""

from __future__ import annotations

import os
from pathlib import Path

from memory.journey_projections.errors import ProjectionError, ProjectionErrorCode


def configured_production_home() -> Path | None:
    """Return the explicit or convention-derived production home anchor."""
    explicit = os.getenv("MIRROR_PRODUCTION_HOME")
    if explicit:
        return Path(explicit).expanduser()
    user = os.getenv("MIRROR_USER", "").strip()
    if user:
        return Path.home() / ".mirror-minds" / user
    return None


def require_isolated_test_home(
    mirror_home: str | Path | None,
    *,
    production_home: str | Path | None,
    environment: str | None = None,
) -> Path:
    """Return a canonical isolated home or fail closed without path disclosure."""
    active_environment = environment if environment is not None else os.getenv("MEMORY_ENV", "")
    if active_environment != "test" or mirror_home is None:
        raise _unavailable()

    selected = Path(mirror_home).expanduser().resolve()
    if production_home is not None:
        production = Path(production_home).expanduser().resolve()
        if selected == production:
            raise _unavailable()
    return selected


def _unavailable() -> ProjectionError:
    return ProjectionError(
        ProjectionErrorCode.UNSUPPORTED_CONTRACT,
        "Journey projection probe operations require an explicit isolated test home.",
    )
