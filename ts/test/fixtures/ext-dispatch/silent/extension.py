"""A valid extension that registers nothing.

Pins the `(none registered)` branch of the subcommand listing, and what an
unknown subcommand looks like when the registry is empty.
"""

from __future__ import annotations

from memory.extensions.api import ExtensionAPI


def register(api: ExtensionAPI) -> None:
    return None
