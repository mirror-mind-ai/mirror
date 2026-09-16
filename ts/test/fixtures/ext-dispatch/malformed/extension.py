"""Never imported: the manifest fails validation before the module loads.

The manifest omits `summary`, a required field. What makes this fixture worth
keeping is WHICH exception that raises: `memory.cli.extensions` defines its own
`ExtensionValidationError(ValueError)`, unrelated to the `ExtensionError`
hierarchy in `memory.extensions.errors` that the dispatcher catches. So a bad
manifest escapes as a traceback while a failing `register` is a printed line.
"""

from __future__ import annotations


def register(api) -> None:
    return None
