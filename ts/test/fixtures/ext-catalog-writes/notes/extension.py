"""Fixture command-skill: install must run its migration and call register."""

from __future__ import annotations

from memory.extensions.api import ExtensionAPI


def register(api: ExtensionAPI) -> None:
    api.register_cli("add", _cmd_add, summary="Add a note")


def _cmd_add(api: ExtensionAPI, args: list[str]) -> int:
    api.execute("INSERT INTO ext_notes_items (note) VALUES (?)", (" ".join(args) or "(empty)",))
    api.commit()
    return 0
