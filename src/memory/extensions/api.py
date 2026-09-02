"""ExtensionAPI: the stable contract handed to every command-skill extension.

An extension's ``register(api)`` entrypoint receives a single ``ExtensionAPI``
instance. Everything an extension is allowed to do — read and write its own
tables, query core tables read-only, generate embeddings, call an LLM,
register CLI subcommands, register Mirror Mode context providers, publish
namespace-bound Journey projections — flows through this object.

The API enforces the table-prefix contract documented in
``docs/product/extensions/api-reference.md``:

  * ``execute`` / ``executemany`` permit writes only to ``ext_<id>_*``.
  * ``read`` permits read queries against any table (including core ones),
    but rejects writes.
  * ``db`` exposes the raw connection as a documented escape hatch for
    performance-sensitive paths; bypassing the prefix check via ``db`` is
    on the extension's honour.

Embeddings and LLM access wrap the project's existing helpers so the
extension never has to know which OpenRouter route or which OpenAI client
the core uses.
"""

from __future__ import annotations

import re
import sqlite3
from collections.abc import Callable, Iterable
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any

from memory.extensions import version as _extension_api_version
from memory.extensions.errors import ExtensionPermissionError
from memory.extensions.migrations import (
    _extract_table_targets,
    run_migrations,
    table_prefix_for,
)

VERSION = _extension_api_version.VERSION

if TYPE_CHECKING:  # pragma: no cover
    import numpy as np

    from memory.journey_projections.service import JourneyProjectionService


# Statements that mutate data. We forbid these in ``read`` and use them to
# decide whether ``execute`` needs the prefix check (it always does for
# writes; reads are also allowed via ``execute`` for convenience).
_WRITE_KEYWORDS = (
    "INSERT",
    "UPDATE",
    "DELETE",
    "CREATE",
    "ALTER",
    "DROP",
    "REPLACE",
    "TRUNCATE",
)

_LEADING_KEYWORD_RE = re.compile(r"^\s*([A-Za-z]+)")


def _leading_keyword(sql: str) -> str:
    match = _LEADING_KEYWORD_RE.match(sql)
    return match.group(1).upper() if match else ""


def _is_write(sql: str) -> bool:
    return _leading_keyword(sql) in _WRITE_KEYWORDS


@dataclass(frozen=True)
class ContextRequest:
    """Payload handed to a Mirror Mode context provider.

    Providers are called when the binding registry resolves an active
    target (persona, journey, or global) to one of the extension's
    capabilities. The provider receives this request and returns either
    a string to inject into the prompt or ``None`` to skip silently.
    """

    persona_id: str | None
    journey_id: str | None
    user: str
    query: str | None
    binding_kind: str
    binding_target: str | None


CLIHandler = Callable[["ExtensionAPI", list[str]], int]
ContextProvider = Callable[["ExtensionAPI", ContextRequest], "str | None"]


class ExtensionAPI:
    """Runtime façade given to a command-skill extension's ``register``.

    One instance per loaded extension per process. The object is cheap to
    construct; the surrounding loader owns its lifecycle.
    """

    def __init__(
        self,
        *,
        extension_id: str,
        connection: sqlite3.Connection,
        cli_registry: dict[str, CLIHandler] | None = None,
        context_registry: dict[str, ContextProvider] | None = None,
        embed_fn: Callable[[str], np.ndarray] | None = None,
        llm_fn: Callable[..., str] | None = None,
        journey_projection_service: JourneyProjectionService | None = None,
    ) -> None:
        from memory.journey_projections.extension_api import (
            ExtensionJourneyProjections,
            registered_journey_root_resolver,
        )
        from memory.journey_projections.service import JourneyProjectionService

        self.extension_id = extension_id
        self.table_prefix = table_prefix_for(extension_id)
        self._db = connection
        projection_service = (
            journey_projection_service
            if journey_projection_service is not None
            else JourneyProjectionService(registered_journey_root_resolver(connection))
        )
        self.journey_projections = ExtensionJourneyProjections(
            extension_id,
            projection_service,
        )
        self._cli_registry: dict[str, CLIHandler] = cli_registry if cli_registry is not None else {}
        self._context_registry: dict[str, ContextProvider] = (
            context_registry if context_registry is not None else {}
        )
        self._embed_fn = embed_fn
        self._llm_fn = llm_fn

    # --- Database access ------------------------------------------------

    @property
    def db(self) -> sqlite3.Connection:
        """Raw connection. Discouraged for writes; bypass of the prefix check.

        Intended for performance-sensitive read paths and unusual cases the
        ``execute``/``read`` helpers do not cover. Writes outside the
        extension's prefix through this handle are *not* caught — the
        extension is responsible for staying within its boundary.
        """
        return self._db

    def execute(self, sql: str, params: tuple | list = ()) -> sqlite3.Cursor:
        """Run a SQL statement. Writes must target ``ext_<id>_*`` tables."""
        if _is_write(sql):
            self._enforce_prefix(sql)
        return self._db.execute(sql, params)

    def executemany(self, sql: str, seq_of_params: Iterable[tuple | list]) -> sqlite3.Cursor:
        """Bulk write. Same prefix rules as ``execute``."""
        if _is_write(sql):
            self._enforce_prefix(sql)
        return self._db.executemany(sql, seq_of_params)

    def read(self, sql: str, params: tuple | list = ()) -> sqlite3.Cursor:
        """Read-only query. May touch any table; raises if SQL writes."""
        if _is_write(sql):
            raise ExtensionPermissionError(
                "read() refuses write statements; use execute() instead",
                extension_id=self.extension_id,
            )
        return self._db.execute(sql, params)

    @contextmanager
    def transaction(self):
        """Wrap a block in a SAVEPOINT.

        Nested calls reuse the same savepoint structure. Useful for
        importers that batch many rows but want rollback semantics on
        partial failure.
        """
        savepoint = f"ext_api_{self.extension_id.replace('-', '_')}_{id(self):x}"
        self._db.execute(f"SAVEPOINT {savepoint}")
        try:
            yield
        except Exception:
            self._db.execute(f"ROLLBACK TO SAVEPOINT {savepoint}")
            self._db.execute(f"RELEASE SAVEPOINT {savepoint}")
            raise
        else:
            self._db.execute(f"RELEASE SAVEPOINT {savepoint}")
            self._db.commit()

    def commit(self) -> None:
        """Commit the underlying connection. Most extensions never need this."""
        self._db.commit()

    def _enforce_prefix(self, sql: str) -> None:
        targets = _extract_table_targets(sql)
        for table in targets:
            if not table.startswith(self.table_prefix):
                raise ExtensionPermissionError(
                    f"write to '{table}' rejected: outside the required "
                    f"prefix '{self.table_prefix}*'",
                    extension_id=self.extension_id,
                )

    # --- Embeddings -----------------------------------------------------

    def embed(self, text: str) -> bytes:
        """Generate an embedding for ``text``.

        Returns the float32 byte representation suitable for storage in
        a SQLite BLOB column. Uses the project's standard embedding
        model; in tests, the underlying ``generate_embedding`` is
        mocked, so callers receive a deterministic vector.
        """
        if self._embed_fn is None:
            from memory.intelligence.embeddings import (
                embedding_to_bytes,
                generate_embedding,
            )

            vector = generate_embedding(text)
            return embedding_to_bytes(vector)
        from memory.intelligence.embeddings import embedding_to_bytes

        return embedding_to_bytes(self._embed_fn(text))

    # --- LLM access -----------------------------------------------------

    def llm(
        self,
        prompt: str,
        *,
        family: str = "gemini",
        tier: str = "flash",
        system: str | None = None,
        temperature: float | None = None,
    ) -> str:
        """Send ``prompt`` through the project's LLM router.

        Returns the model's text response. Costs are logged to the same
        place core LLM calls log. In tests, ``llm_fn`` is injected so no
        real network call happens.
        """
        if self._llm_fn is not None:
            return self._llm_fn(
                prompt,
                family=family,
                tier=tier,
                system=system,
                temperature=temperature,
            )
        from memory.intelligence.llm_router import resolve_model, send_to_model

        model = resolve_model(family, tier)
        response = send_to_model(
            model=model,
            prompt=prompt,
            system_prompt=system,
            temperature=temperature,
        )
        return response.content

    # --- Registration ---------------------------------------------------

    def register_cli(
        self,
        subcommand: str,
        handler: CLIHandler,
        *,
        summary: str | None = None,
    ) -> None:
        """Register a CLI subcommand under ``python -m memory ext <id>``."""
        if not isinstance(subcommand, str) or not subcommand:
            raise ValueError("subcommand must be a non-empty string")
        if not callable(handler):
            raise ValueError("handler must be callable")
        self._cli_registry[subcommand] = handler
        # ``summary`` is informational for now; surfaced by the dispatcher
        # in --help output once that path is wired.
        handler.__doc__ = handler.__doc__ or summary or ""

    def register_mirror_context(
        self,
        capability_id: str,
        provider: ContextProvider,
    ) -> None:
        """Register a context provider for a Mirror Mode capability."""
        if not isinstance(capability_id, str) or not capability_id:
            raise ValueError("capability_id must be a non-empty string")
        if not callable(provider):
            raise ValueError("provider must be callable")
        self._context_registry[capability_id] = provider

    # --- Migrations -----------------------------------------------------

    def run_migrations(self, migrations_dir: Path) -> int:
        """Apply pending migrations for this extension.

        Thin wrapper around ``memory.extensions.migrations.run_migrations``
        bound to this extension's id and connection. Returns the number
        of newly applied files.
        """
        return run_migrations(
            self._db,
            extension_id=self.extension_id,
            migrations_dir=migrations_dir,
        )

    # --- Logging --------------------------------------------------------

    def log(self, level: str, msg: str, **fields: Any) -> None:
        """Structured log. Routes through the standard logger.

        ``fields`` are appended as ``key=value`` pairs for readability.
        """
        import logging

        logger = logging.getLogger(f"memory.extensions.{self.extension_id}")
        rendered = msg
        if fields:
            extras = " ".join(f"{k}={v!r}" for k, v in fields.items())
            rendered = f"{msg} {extras}"
        getattr(logger, level.lower(), logger.info)(rendered)

    # --- Internal accessors (used by loader/dispatcher) -----------------

    @property
    def cli_registry(self) -> dict[str, CLIHandler]:
        return self._cli_registry

    @property
    def context_registry(self) -> dict[str, ContextProvider]:
        return self._context_registry
