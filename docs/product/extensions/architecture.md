# Architecture

This document explains how the extension system is wired into the mirror's
core. It covers the layers, the loading sequence, the runtime integration
points, and the trust boundary.

## Big picture

```
┌─────────────────────────────────────────────────────────────────┐
│ User space                                                      │
│                                                                 │
│   <extensions-root>/<id>/          ← source (versioned by user) │
│         │                                                       │
│         │  python -m memory extensions install                  │
│         ▼                                                       │
│   ~/.mirror-minds/<user>/extensions/<id>/   ← runtime copy            │
│         │                                                       │
│         │  imported at every CLI invocation                     │
│         ▼                                                       │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │  ExtensionLoader (memory.extensions.loader)              │  │
│   │   ├─ validate manifest                                   │  │
│   │   ├─ run pending migrations                              │  │
│   │   ├─ import extension.py                                 │  │
│   │   └─ call register(api)                                  │  │
│   └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ Mirror core                                                     │
│                                                                 │
│   ExtensionAPI ──┬─→ shared SQLite (writes scoped to prefix)    │
│                  ├─→ embeddings                                 │
│                  ├─→ LLM router                                 │
│                  ├─→ CLI registry  ────→ python -m memory ext   │
│                  └─→ context registry ──→ Mirror Mode hook      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Layers

The system is intentionally thin and made of four layers, each with a single
responsibility.

### 1. Manifest layer — `skill.yaml`

Declares the extension's identity, kind, runtime command names, and (for
`command-skill`) the capabilities it exposes. Pure data, no behavior. Schema is
defined in [`api-reference.md`](api-reference.md).

### 2. Code layer — `extension.py` and process providers

CLI handlers retain a Python entrypoint with one required function:

```python
def register(api: ExtensionAPI) -> None: ...
```

**CV22.DS10.TS2 retired the core-run `register(api)` path.** Every capability now declares
its own runtime in the manifest — `mirror-cli-v1` for subcommands, `mirror-context-v1` for
context providers — and the TS core spawns that command and nothing else. Both protocols
are language-neutral: an extension may own any executable runtime, Python included.

An extension with existing `register(api)` handlers keeps them by shipping its own shim
that provides the `api` object and dispatches the subcommand. The reference implementation,
[`cli.py.template`](https://github.com/mirror-mind-ai/mirror/blob/cv22-last-python-bearing/docs/product/extensions/template/cli.py.template), left the template with the Python core (CV22.DS10.TS5,
decision D7) and stays readable at the recovery tag. In that arrangement `register` is
called by the extension's own shim, not by Mirror.

### 3. Schema layer — `migrations/*.sql`

Plain SQL files applied in lexicographic order. Each migration must operate
only on tables matching `ext_<id>_*`. The migration runner tracks applied
files by checksum in a core table `_ext_migrations`.

### 4. Documentation layer — `docs/`

Lives inside the extension's own repository. The mirror ships a recommended
template (in [`authoring-guide.md`](authoring-guide.md)) but does not enforce
it. Documentation is the extension author's responsibility.

## Loading sequence

When the user runs any `python -m memory ...` command, the core does **not**
auto-load extensions. Loading happens only when an extension surface is
invoked:

- `python -m memory ext <id> <subcommand>` — loads that one extension.
- Mirror Mode prompt assembly — the TS core resolves bound manifest capabilities and runs
  their declared process providers. A capability that declares no runtime is skipped with a
  `no_provider_runtime` diagnostic and the load continues.
- `extensions install <id>` no longer loads extension code at all.

Concretely, loading runs these steps in order:

1. **Resolve.** Find `~/.mirror-minds/<user>/extensions/<id>/skill.yaml`.
2. **Validate.** Parse the manifest, check `kind: command-skill`, validate the
   `ext_<id>_*` prefix matches `id`.
3. **Migrate.** Run any pending files in `migrations/` (idempotent; tracked
   by checksum).
4. **Import.** `importlib` loads `extension.py` from the installed path.
   Before importing, the loader inserts the extension's own directory on
   `sys.path` (idempotently) so the entrypoint can use
   `from src.foo import bar` against its own helpers with no manual
   prelude.
5. **Register.** Call `register(api)`. The extension declares subcommands and
   context providers.
6. **Dispatch.** Mirror validates the declared runtime and invokes it — `mirror-cli-v1`
   for a subcommand, `mirror-context-v1` for a context provider, in stable binding order.
   A capability with no declared runtime refuses (subcommand) or is skipped with a
   diagnostic (provider). There is no registry-backed fallback.

During `extensions install`, the source tree is copied with a fixed
ignore list (`.git`, `__pycache__`, `.venv`, `.pytest_cache`,
`.ruff_cache`, `.mypy_cache`, `node_modules`, `*.pyc`, `.DS_Store`).
This lets authors install directly from a real Git checkout without
tripping over Git's read-only pack files on re-install, and keeps the
installed tree free of generated noise.

If any step fails, the extension is marked as failed for the current process.
A failure in one extension never blocks others.

## Runtime integration points

The mirror exposes exactly three integration points to extensions.

### CLI dispatch — `python -m memory ext`

A new top-level command in `memory.__main__` dispatches `ext <id> <subcommand>`
to handlers registered by the extension during `register()`. The dispatcher
also supports:

```
python -m memory ext list                # all installed extensions
python -m memory ext <id> --help         # subcommands of an extension
python -m memory ext <id> bind <cap> ... # persona binding management
```

Each extension is sandboxed at the dispatch level: a subcommand of
extension A cannot be reached through extension B's namespace.

### Mirror Mode context — persona hook

When the mirror builds the prompt for a Mirror Mode turn, it now performs an
extra step after resolving the active persona:

1. Look up persona and selected-journey bindings in stable order.
2. For each binding, validate the installed manifest capability.
3. Invoke its no-shell `mirror-context-v1` process with the existing `ContextRequest`
   fields in JSON. A capability with no declared runtime is skipped and reported.
4. Validate the bounded JSON result and append non-empty text under
   `=== extension/<id>/<capability> ===`.

The authoritative integration point is the TS Mirror orchestration. Provider failures are
caught and reported without raw request/stdout/stderr payload. Ancestor and descendant
journeys never widen selected-journey bindings.

### Storage — shared SQLite, scoped writes

Extensions share the user's `memory.db`. The API provides three handles:

- `api.execute(sql, params)` — writes allowed only on tables matching the
  extension's prefix. The runner inspects the SQL with a permissive parser
  (`sqlparse`) and rejects writes to other tables.
- `api.read(sql, params)` — read-only cursor that can query any table,
  including core tables like `journeys` and `identity`. Useful for joining
  with mirror data.
- `api.db` — escape hatch: the raw `sqlite3.Connection`. Required for
  performance-sensitive paths. Bypasses the prefix check; the extension is on
  its honor to stay within its prefix. Documented as discouraged.

## Trust boundary

The mirror treats extensions as **trusted but constrained code**. The user
installs them explicitly, so we assume they are not adversarial. The
constraints exist to:

- prevent honest mistakes (writing to the wrong table),
- keep extensions auditable (one prefix = one extension's data),
- isolate failures so one extension does not break the mirror.

The constraints are **not** a security boundary. An extension that wants to
write outside its prefix can do so by using `api.db` directly or by importing
`sqlite3` itself. We do not try to prevent this — we make it visible.

## What changes in the core

The extension system adds new code under `memory.extensions.*` and one new CLI
command (`ext`). The only change to existing core code is in
`IdentityService.load_mirror_context`, which gains a call to the context
registry after persona resolution. That call is a no-op when no bindings exist
for the current persona — extensions impose zero cost on users who do not
install any.

## What does not change

- Existing tables.
- Existing CLI commands (other than `extensions install`, which gains the
  migration step).
- Existing skills (Mirror Mode, journeys, tasks, memories, etc.).
- `prompt-skill` extensions and the `review-copy` example.

The extension system is additive.
