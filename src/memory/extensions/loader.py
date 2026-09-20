"""Load command-skill extensions: validate manifest, import module, register.

The loader is the single entry point that turns a validated extension on
disk into a live ``ExtensionAPI`` ready to dispatch CLI subcommands and
serve Mirror Mode context. It does not own the lifecycle of subcommand
execution — that is the dispatcher's job — but every dispatch path goes
through ``load_extension`` first.

Loading is idempotent within a process: subsequent calls for the same
extension return the cached instance instead of re-importing.
"""

from __future__ import annotations

import importlib.util
import sqlite3
import sys
from collections.abc import Callable
from pathlib import Path

from memory.cli.extensions import (
    ExtensionValidationError,
    load_extension_manifest,
)
from memory.extensions.api import ExtensionAPI
from memory.extensions.errors import ExtensionLoadError

# Cached, keyed by absolute path of the installed extension directory.
# Loading the same extension twice in the same process reuses the API.
_LOADED: dict[str, ExtensionAPI] = {}


def _ensure_on_sys_path(extension_dir: Path) -> None:
    """Make the extension's own directory importable.

    Real extensions split their code into a ``src/`` sub-package (and
    sometimes ``src/cli/``, ``src/parsers/``, etc.). For
    ``from src.foo import bar`` to resolve inside ``extension.py``, the
    extension root must sit on ``sys.path``. Inserting it idempotently
    here saves every author from writing a four-line prelude in their
    entrypoint module.

    The insertion is left in place after import: extensions may import
    their own modules lazily inside CLI handlers, not just at
    module-load time, and a single extra entry on ``sys.path`` is
    negligible.

    Trade-off: two installed extensions that both ship a top-level
    package named ``src`` will compete in ``sys.modules``. The first
    one wins for the duration of the process. The authoring guide warns
    extension authors to keep their public-facing imports under their
    own namespace if they ever need cross-extension imports; for the
    common case of ``src/`` as a private code folder this is fine.
    """
    entry = str(extension_dir.resolve())
    if entry not in sys.path:
        sys.path.insert(0, entry)


def _import_extension_module(
    *,
    extension_id: str,
    module_name: str,
    module_path: Path,
):
    """Import the extension's entrypoint module from its on-disk path.

    Uses ``importlib.util`` so we control exactly which file backs the
    extension entrypoint. The imported module is registered in
    ``sys.modules`` under a namespaced name
    (``memory_ext.<extension_id>.<module_name>``) so any future
    re-imports inside the same process find the same object.

    Before exec'ing the module we add the extension's directory to
    ``sys.path`` so the entrypoint can do ``from src.foo import bar``
    against its own helpers without a manual prelude.
    """
    _ensure_on_sys_path(module_path.parent)
    fq_name = f"memory_ext.{extension_id.replace('-', '_')}.{module_name}"
    spec = importlib.util.spec_from_file_location(fq_name, module_path)
    if spec is None or spec.loader is None:
        raise ExtensionLoadError(
            f"could not build import spec for {module_path}",
            extension_id=extension_id,
        )
    module = importlib.util.module_from_spec(spec)
    sys.modules[fq_name] = module
    try:
        spec.loader.exec_module(module)
    except Exception as exc:
        raise ExtensionLoadError(
            f"failed to import {module_path}: {exc}",
            extension_id=extension_id,
        ) from exc
    return module


def load_extension(
    extension_dir: Path,
    *,
    connection: sqlite3.Connection,
    embed_fn: Callable | None = None,
    llm_fn: Callable | None = None,
    reload: bool = False,
) -> ExtensionAPI:
    """Validate, import, and register a command-skill extension.

    Returns the ``ExtensionAPI`` instance the extension's ``register``
    function received, with its CLI and context registries populated.

    Raises :class:`ExtensionValidationError` for a bad manifest, and
    :class:`ExtensionLoadError` for import or registration failures.
    """
    cache_key = str(Path(extension_dir).resolve())
    if not reload and cache_key in _LOADED:
        return _LOADED[cache_key]

    manifest = load_extension_manifest(Path(extension_dir))
    if manifest.get("kind") != "command-skill":
        raise ExtensionValidationError(
            f"load_extension only supports kind: command-skill (got {manifest.get('kind')!r})"
        )
    extension_id = manifest["id"]
    entrypoint = manifest.get("entrypoint", {})
    module_name = entrypoint.get("module")
    module_path_str = entrypoint.get("module_path")
    if not module_name or not module_path_str:
        # Should have been caught by the manifest validator; defensive.
        raise ExtensionValidationError(f"manifest for {extension_id} is missing entrypoint.module")
    module_path = Path(module_path_str)

    module = _import_extension_module(
        extension_id=extension_id,
        module_name=module_name,
        module_path=module_path,
    )
    register_fn_name = entrypoint.get("function", "register")
    register_fn = getattr(module, register_fn_name, None)
    if not callable(register_fn):
        raise ExtensionLoadError(
            f"entrypoint '{register_fn_name}' not found or not callable in {module_path}",
            extension_id=extension_id,
        )

    api = ExtensionAPI(
        extension_id=extension_id,
        connection=connection,
        embed_fn=embed_fn,
        llm_fn=llm_fn,
    )
    try:
        register_fn(api)
    except Exception as exc:
        raise ExtensionLoadError(
            f"register({register_fn_name}) raised: {exc}",
            extension_id=extension_id,
        ) from exc

    _LOADED[cache_key] = api
    return api


def clear_load_cache() -> None:
    """Drop every cached ExtensionAPI. Primarily for tests."""
    _LOADED.clear()
