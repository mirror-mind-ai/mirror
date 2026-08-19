# API Reference

This document specifies the contract between the mirror core and a
`command-skill` extension. The contract is composed of three things:

1. The shape of `skill.yaml`.
2. The shape of `extension.py`.
3. The `ExtensionAPI` object passed to `register(api)`.

Everything outside this contract is considered an internal detail of the core
and may change. Anything documented here is stable and changes only with a
deprecation cycle.

## 1. The manifest — `skill.yaml`

```yaml
# Required fields
id: <slug>                  # lowercase, dash-separated; must match folder name
name: <human name>
category: extension
kind: command-skill         # or prompt-skill (see authoring-guide.md)
summary: <one-line summary>

# Required for command-skill
table_prefix: ext_<id>_     # must equal "ext_" + id + "_"; enforced at install
entrypoint:
  module: extension         # filename without .py
  function: register        # default; can be omitted

# Required: at least one runtime entry
runtimes:
  pi:
    command_name: ext-<id>          # must start with "ext-"
    skill_file: SKILL.md
  claude:
    command_name: ext:<id>          # must start with "ext:"
    skill_file: SKILL.md
  # gemini, codex, etc. optional

# Optional: capabilities for Mirror Mode integration
mirror_context_providers:
  - id: <capability_id>             # lowercase, dash-separated, unique within extension
    description: <one-line description>
    suggested_personas: [<persona_id>, ...]  # hint only, never auto-binds
    provider_runtime:               # TS-owned Mirror context provider
      protocol: mirror-context-v1
      command: [node, context/<capability_id>.mjs]

# Optional: declared CLI subcommands (informational; the runtime source of
# truth is what extension.py registers via api.register_cli)
cli:
  subcommands:
    - name: <subcommand>
      summary: <one-line>
```

### Validation rules

- `id` matches `^[a-z][a-z0-9-]*$`.
- `table_prefix` equals `f"ext_{id.replace('-', '_')}_"`.
- `kind` is one of `prompt-skill`, `command-skill`.
- For `command-skill`: `entrypoint.module` must resolve to a `.py` file
  inside the extension folder.
- Each `runtimes.<name>.command_name` follows the runtime's convention
  (`ext:<...>` for Claude, `ext-<...>` for Pi).
- Each `mirror_context_providers[].id` is unique within the extension.
- `provider_runtime.protocol`, when present, is exactly `mirror-context-v1`.
- `provider_runtime.command` is a non-empty argv array. It is never interpreted by a shell;
  path-like arguments must remain inside the installed extension root.

Manifests that fail validation are rejected at install time and at every
subsequent load.

## 2. The entrypoint — `extension.py`

```python
from memory.extensions.api import ExtensionAPI


def register(api: ExtensionAPI) -> None:
    """Called once per process when the extension is loaded.

    Use api to register CLI subcommands and Mirror Mode context providers.
    Do not perform expensive work here — registration only.
    """
    api.register_cli("accounts", _cmd_accounts)
    api.register_cli("runway",   _cmd_runway)
    api.register_mirror_context("financial_summary", _provide_financial_summary)


def _cmd_accounts(api: ExtensionAPI, args: list[str]) -> int:
    ...
    return 0  # exit code


def _provide_financial_summary(api: ExtensionAPI, ctx: "ContextRequest") -> str | None:
    ...
```

### Rules for `register`

- Must be idempotent (may be called more than once in a long-running test).
- Must not raise on missing user data (an empty extension is valid).
- Must not perform any DB writes.
- Must not make network calls.

### Rules for handlers

- CLI handlers receive `(api, args)` and return an `int` exit code.
- Context providers receive `(api, ContextRequest)` and return `str | None`.
- Exceptions in handlers are caught by the core; the handler is free to
  raise on user errors with informative messages.

## 3. The API — `ExtensionAPI`

```python
class ExtensionAPI:
    extension_id: str        # e.g. "finances"
    table_prefix: str        # e.g. "ext_finances_"

    # --- Database access ---

    db: sqlite3.Connection
    """Raw connection. Discouraged for writes; use execute() instead."""

    def execute(self, sql: str, params: tuple = ()) -> sqlite3.Cursor: ...
    """Run a write or read query. Write operations to tables outside
    table_prefix raise ExtensionPermissionError."""

    def read(self, sql: str, params: tuple = ()) -> sqlite3.Cursor: ...
    """Read-only query over any table. Raises if SQL contains a write."""

    def executemany(self, sql: str, seq: Iterable[tuple]) -> sqlite3.Cursor: ...
    """Bulk write. Same prefix rules as execute()."""

    def transaction(self) -> ContextManager[None]: ...
    """Context manager wrapping conn.commit/rollback. Nested calls reuse."""

    # --- Embeddings ---

    def embed(self, text: str) -> bytes: ...
    """Generate an embedding using the project's standard model
    (text-embedding-3-small). Returns bytes (np.float32) suitable for
    storing in a BLOB column."""

    def cosine(self, a: bytes, b: bytes) -> float: ...
    """Cosine similarity between two embedding blobs."""

    # --- LLM access ---

    def llm(
        self,
        prompt: str,
        *,
        family: str = "gemini",
        tier: str = "flash",
        json_mode: bool = False,
        system: str | None = None,
    ) -> str: ...
    """Send a prompt through the project's LLM router. Returns the text
    response. Costs are logged to the same place core LLM calls log."""

    # --- Registration ---

    def register_cli(
        self,
        subcommand: str,
        handler: Callable[["ExtensionAPI", list[str]], int],
        *,
        summary: str | None = None,
    ) -> None: ...

    def register_mirror_context(
        self,
        capability_id: str,
        provider: Callable[["ExtensionAPI", "ContextRequest"], str | None],
    ) -> None: ...
    """capability_id must be declared in skill.yaml under
    mirror_context_providers."""

    # --- Migrations ---

    def run_migrations(self, migrations_dir: Path) -> int: ...
    """Apply pending migrations. Returns count of newly applied files.
    Called automatically at install; can be re-run manually."""

    # --- Logging ---

    def log(self, level: str, msg: str, **fields: object) -> None: ...
    """Structured log. Routed to the same logger as core code."""
```

## ContextRequest

The object passed to Mirror Mode context providers:

```python
@dataclass(frozen=True)
class ContextRequest:
    persona_id: str | None     # active persona, if any
    journey_id: str | None     # active journey, if any
    user: str                  # active user (from MIRROR_USER / config)
    query: str | None          # the user's query, when available
    binding_kind: str          # 'persona' | 'journey' | 'global'
    binding_target: str | None # the target_id that triggered this call
```

Providers may use any combination of these fields. They should never assume
all are populated; in particular, `query` and `journey_id` may be `None`.

## TypeScript provider runtime — `mirror-context-v1`

The TS core owns Mirror context binding selection and invokes each declared provider command
in deterministic binding order. The command runs with the installed extension root as CWD,
receives one JSON request on stdin, and must return one JSON object on stdout.

Request fields preserve `ContextRequest` and add runtime coordinates:

```json
{
  "protocol": "mirror-context-v1",
  "extension_id": "hello",
  "capability_id": "greeting",
  "extension_root": "/installed/extensions/hello",
  "table_prefix": "ext_hello_",
  "database_path": "/mirror/memory.db",
  "persona_id": "engineer",
  "journey_id": "mirror-ts-core",
  "user": "user",
  "query": null,
  "binding_kind": "journey",
  "binding_target": "mirror-ts-core"
}
```

Success response:

```json
{"protocol":"mirror-context-v1","text":"context to inject"}
```

Use `"text": null` to skip. Raw stdout must contain only this JSON result; write extension
diagnostics to stderr. The core never forwards raw provider stdout/stderr into operational
logs. Execution is no-shell, bounded to 60 seconds and 1 MiB of stdout per binding, and
sequential in stable binding order. Missing, malformed, timed-out, or failing providers are
skipped so Mirror Mode can continue.

The installed extension is trusted executable code, as `extension.py` already is. A process
provider may open `database_path`; extension authors remain responsible for the documented
table-prefix boundary. Prefer read-only context providers and short deterministic work.

### Python provider migration window

A capability without `provider_runtime` currently runs through the temporary CV22 legacy
host. The complete `mirror load` command still stays in TS; the host invokes only that named
Python provider. This compatibility host is deprecated and must be removed by CV22.DS10.
Authors should add a `mirror-context-v1` command before that cutoff. After removal, an
unmigrated capability will produce explicit migration diagnostics rather than being silently
omitted.

## Errors

```python
class ExtensionError(Exception): ...
class ExtensionValidationError(ExtensionError): ...     # bad manifest
class ExtensionPermissionError(ExtensionError): ...     # write outside prefix
class ExtensionMigrationError(ExtensionError): ...      # SQL or checksum failure
class ExtensionLoadError(ExtensionError): ...           # import / register failure
```

All extension-related errors inherit from `ExtensionError`. The core catches
`ExtensionError` at the boundary and logs it; an extension can raise its own
subclasses and they will be treated uniformly.

## Versioning and stability

The API is versioned as `extension_api_version` and exposed at
`memory.extensions.api.VERSION`. Phase 1 ships `1.0`. Backward-incompatible
changes increment the major version and trigger a deprecation cycle of at
least one minor release.

Extensions may declare a minimum version in `skill.yaml`:

```yaml
requires:
  extension_api: ">=1.0,<2.0"
```

Installs against an incompatible core fail fast at validation.
