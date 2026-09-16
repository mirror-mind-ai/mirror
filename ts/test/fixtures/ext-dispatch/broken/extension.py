"""An extension whose `register` always raises.

Pins the load failure that `_dispatch_subcommand` catches: an
`ExtensionLoadError` printed as a plain stdout line at exit 1, on BOTH the
listing path and the dispatch path -- the extension is loaded before either
can answer.
"""

from __future__ import annotations

from memory.extensions.api import ExtensionAPI


def register(api: ExtensionAPI) -> None:
    raise RuntimeError("BOOM")
