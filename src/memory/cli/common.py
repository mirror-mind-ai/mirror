"""Shared helpers for CLI commands."""

from pathlib import Path

from memory.config import db_path_for_home


def db_path_from_mirror_home(mirror_home: str | Path | None) -> Path | None:
    if mirror_home is None:
        return None
    return db_path_for_home(Path(mirror_home).expanduser())
