"""Imports its own helper, which proves `src/` IS copied while the caches are not."""

from __future__ import annotations

from src.helper import LABEL


def register(api) -> None:
    api.register_cli("label", lambda _api, _args: print(LABEL) or 0, summary=LABEL)
