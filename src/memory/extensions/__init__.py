"""Extension system for the Mirror Mind core.

This package implements the runtime contract for command-skill extensions:
manifest validation, schema migrations, API surface, CLI dispatch, and
Mirror Mode context injection.

Public surface re-exported here. Internal modules are not part of the
contract and may change between versions.
"""

from memory.extensions.api import ContextRequest, ExtensionAPI
from memory.extensions.errors import (
    ExtensionError,
    ExtensionLoadError,
    ExtensionMigrationError,
    ExtensionPermissionError,
    ExtensionValidationError,
)
from memory.extensions.version import VERSION

__all__ = [
    "VERSION",
    "ContextRequest",
    "ExtensionAPI",
    "ExtensionError",
    "ExtensionLoadError",
    "ExtensionMigrationError",
    "ExtensionPermissionError",
    "ExtensionValidationError",
]
