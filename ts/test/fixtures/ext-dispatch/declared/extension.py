"""Python twins of the declared commands.

Each handler prints exactly what its declared `commands/*.mjs` counterpart
prints. That is the whole point of this fixture: the golden is recorded from
Python, and TypeScript answers the same argv through the DECLARED runtime, so
one corpus grades both paths and any drift between them fails.

`rows=` reads the extension's own table so the comparison also proves both
engines reached the same database file, not merely the same text.
"""

from __future__ import annotations

from memory.extensions.api import ExtensionAPI


def register(api: ExtensionAPI) -> None:
    api.register_cli("greet", _cmd_greet, summary="Greet with the argv it received")
    api.register_cli("fail", _cmd_fail, summary="Exit 3 through the declared runtime")
    api.register_cli(
        "legacy", _cmd_legacy, summary="Declared with no runtime, so the host answers it"
    )
    api.register_cli(
        "broken",
        _cmd_broken,
        summary="A malformed declaration falls back to the host, never executes",
    )


def _rows(api: ExtensionAPI) -> int:
    return int(api.read("SELECT COUNT(*) AS n FROM ext_declared_notes").fetchone()["n"])


def _cmd_greet(api: ExtensionAPI, args: list[str]) -> int:
    print(f"greet[{len(args)}]: {' '.join(args)} | ext={api.extension_id} rows={_rows(api)}")
    return 0


def _cmd_fail(api: ExtensionAPI, args: list[str]) -> int:
    print("declared failure")
    return 3


def _cmd_legacy(api: ExtensionAPI, args: list[str]) -> int:
    print(f"legacy handler, argv={args}")
    return 0


def _cmd_broken(api: ExtensionAPI, args: list[str]) -> int:
    print("the host answered a declaration TypeScript refused to execute")
    return 0
