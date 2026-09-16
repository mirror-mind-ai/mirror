"""Fixture extension for the `ext <id> <subcommand>` dispatch corpus.

Every handler here exists to pin ONE dispatch outcome that the TypeScript
dispatcher and the compat host's `cli` mode must reproduce: argv arriving
verbatim, a non-zero exit code surviving, an `ExtensionError` becoming a
printed line, an unhandled exception becoming a traceback, both streams
reaching the caller, and a write landing in the extension's own table.

Nothing here is a real capability. Keep it deterministic: no clock, no
network, no randomness -- the golden records its bytes.
"""

from __future__ import annotations

from memory.extensions.api import ExtensionAPI
from memory.extensions.errors import ExtensionError


def register(api: ExtensionAPI) -> None:
    api.register_cli("echo", _cmd_echo, summary="Print the argv it received")
    api.register_cli("fail", _cmd_fail, summary="Exit with code 3")
    api.register_cli("boom", _cmd_boom, summary="Raise an ExtensionError")
    api.register_cli("crash", _cmd_crash, summary="Raise an unhandled exception")
    api.register_cli("streams", _cmd_streams, summary="Write to stdout and to stderr")
    api.register_cli("stringy", _cmd_stringy, summary="Return its exit code as a string")
    api.register_cli("nothing", _cmd_nothing, summary="Return None")
    api.register_cli("write", _cmd_write, summary="Insert a row in its own table")
    api.register_cli("documented", _cmd_documented, summary="Summary that loses to the docstring")
    api.register_cli("bare", _cmd_bare)


def _cmd_echo(api: ExtensionAPI, args: list[str]) -> int:
    print(f"argv[{len(args)}]: {' '.join(args)}")
    return 0


def _cmd_fail(api: ExtensionAPI, args: list[str]) -> int:
    print("failing on purpose")
    return 3


def _cmd_boom(api: ExtensionAPI, args: list[str]) -> int:
    raise ExtensionError("deliberate extension error", extension_id="tools")


def _cmd_crash(api: ExtensionAPI, args: list[str]) -> int:
    raise RuntimeError("deliberate unhandled crash")


def _cmd_streams(api: ExtensionAPI, args: list[str]) -> int:
    import sys

    print("on stdout")
    print("on stderr", file=sys.stderr)
    return 0


def _cmd_stringy(api: ExtensionAPI, args: list[str]) -> int:
    print("returning '7'")
    return "7"  # type: ignore[return-value]


def _cmd_nothing(api: ExtensionAPI, args: list[str]) -> int:
    print("returning None")
    return None  # type: ignore[return-value]


def _cmd_write(api: ExtensionAPI, args: list[str]) -> int:
    note = " ".join(args) or "(empty)"
    api.execute("INSERT INTO ext_tools_notes (note) VALUES (?)", (note,))
    api.commit()
    print(f"wrote: {note}")
    return 0


def _cmd_documented(api: ExtensionAPI, args: list[str]) -> int:
    """First line of the docstring.

    The second line must never reach the listing.
    """
    return 0


def _cmd_bare(api: ExtensionAPI, args: list[str]) -> int:
    return 0
