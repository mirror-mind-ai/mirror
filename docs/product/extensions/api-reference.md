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

# Optional: declared CLI subcommands. `name` and `summary` are informational
# while a Python entrypoint exists; `runtime` is not — a subcommand that
# declares one is executed directly by the core, in any language.
cli:
  subcommands:
    - name: <subcommand>
      summary: <one-line>
      runtime:                      # optional; core-owned CLI command
        protocol: mirror-cli-v1
        command: [node, commands/<subcommand>.mjs]
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
- `cli.subcommands[].runtime`, when present, uses protocol `mirror-cli-v1` and the same
  argv rules as `provider_runtime.command`. It is read by the dispatcher rather than by
  the manifest validator, so a malformed declaration never invalidates the extension: that
  subcommand simply falls back to the Python handler (see the migration window below).

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

## Journey projections — removed

Extension API `1.1` exposed `api.journey_projections.publish(...)` and
`.inspect(...)` over the `mirror.journey-projections@1.0` contract. **CV22.DS10.TS1
removed the capability**: the contract retired with the Python core, and Mirror no
longer publishes `.mirror/projections`.

Reaching for the attribute raises with that reason. `hasattr(api,
"journey_projections")` returns `False`, so an extension that feature-detects
degrades rather than crashing:

```python
if hasattr(api, "journey_projections"):
    ...  # never true on this version
```

An extension that needs a durable read model of Journey state owns it: a table
under its own prefix, or files under its own directory. See the release note for
the cutoff.


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

### Extension commands

`python -m memory ext <id> <subcommand> [args...]` reaches a subcommand two ways.

A subcommand that declares `cli.subcommands[].runtime` is executed **directly**: the
declared argv runs without a shell, from the installed extension root, with the user's
argv appended verbatim and the user's stdin, stdout, and stderr inherited. Its exit code
is the command's exit code. Context arrives in the environment, never on stdin:

| Variable | Value |
|---|---|
| `MIRROR_HOME` | the resolved mirror home |
| `MIRROR_DATABASE_PATH` | the database the core opened for this home and environment |
| `MIRROR_EXTENSION_ID` | the extension's id |
| `MIRROR_EXTENSION_ROOT` | the installed extension directory |
| `MIRROR_TABLE_PREFIX` | the extension's required table prefix |

A subcommand that declares no runtime — or whose declaration is malformed, which amounts to
the same thing — **refuses**, since CV22.DS10.TS2 deleted the compatibility host that used
to answer it. One line on stderr names the extension, the subcommand, and the fix; stdout
stays empty and the exit code is 1. Nothing is spawned.

Refusal is per SUBCOMMAND, so an extension may migrate one command at a time without
losing the others. A declared command receives all three of the user's streams, including
stdin — which the retired host could never offer, because it spent stdin on its own
request.

The subcommand listing (`ext <id>`, `ext <id> --help`) is rendered from the manifest's
`cli.subcommands[]`, with unmigrated entries flagged `(no runtime declared)`. It therefore
describes what the manifest documents, not what a Python `register` happened to add: a
handler registered but never documented will not appear. Keep the two in step.

### Python provider migration window

A capability without `provider_runtime` is **skipped**, since CV22.DS10.TS2 deleted the
legacy host. The skip is soft and reported: `mirror load` completes with every other
section intact, and a `no_provider_runtime` diagnostic names what went dark. One
unmigrated capability never costs the whole load, and it is never silently omitted
either.

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
`memory.extensions.api.VERSION`. Version `1.1` added the `journey_projections`
façade; **CV22.DS10.TS1 removed it**, which is a backward-incompatible change to
a capability no installed extension used.

**Frozen at `1.1` — decision D-018, CV22.DS10.TS2, 2026-09-21.** The number is
not bumped, and will not be. Two reasons, pointing the same way:

- `1.1`'s only addition never reached a user, so a new number would date a
  change nobody can observe.
- More decisively, **this API is not evolving — it is retiring.**
  CV22.DS10.TS2 deleted the compatibility host that called `register(api)` on
  the core's behalf. Nothing in the Mirror core imports extension code any
  more, at install time or at dispatch time.

### What replaces it

The contract an extension codes against is now the **manifest runtime
protocols**, which carry their own names and their own compatibility story:

| | |
|---|---|
| `mirror-cli-v1` | one subcommand, declared on `cli.subcommands[].runtime` |
| `mirror-context-v1` | one context provider, declared on `mirror_context_providers[].provider_runtime` |

Both are language-neutral: an extension may own any executable runtime,
**Python included**. What ended is the core owning Python as every extension's
permanent compatibility layer. See the
[cutoff](../../releases/pending-cutoffs.md) for the migration path, and
`docs/product/extensions/template/cli.py.template` for a reference shim that
keeps existing `register(api)` handlers working unchanged.

The `VERSION` constant survives only until CV22.DS10.TS5 deletes the Python
core with it. Backward-incompatible changes to the *runtime protocols*
increment their own version suffix (`mirror-cli-v2`) rather than this number.

Extensions may declare a minimum version in `skill.yaml`:

```yaml
requires:
  extension_api: ">=1.0,<2.0"
```

Installs against an incompatible core fail fast at validation.
