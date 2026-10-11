# Architecture

This document explains how the extension system is wired into the mirror's
core. It covers the layers, the dispatch sequence, the runtime integration
points, and the trust boundary.

Until CV22.DS10.TS2 the core imported an extension's Python `extension.py` and
called its `register(api)`; since then it runs the processes a manifest
declares, and since CV22.DS10.TS5 the core is TypeScript alone. The
[API reference](api-reference.md#retired-extensionpy-registerapi-and-extensionapi)
records what retired.

## Big picture

```
┌─────────────────────────────────────────────────────────────────┐
│ User space                                                      │
│                                                                 │
│   <extensions-root>/<id>/          ← source (versioned by user) │
│         │                                                       │
│         │  mirror extensions install                            │
│         ▼                                                       │
│   ~/.mirror-minds/<user>/extensions/<id>/   ← runtime copy      │
│         │                                                       │
│         │  read when an extension surface is invoked            │
│         ▼                                                       │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │  Mirror core (ts/src/extensions/)                         │  │
│   │   ├─ validate manifest                                   │  │
│   │   ├─ run pending migrations        (install, ext migrate)│  │
│   │   └─ run the declared runtime process                    │  │
│   └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ Extension processes                                             │
│                                                                 │
│   mirror-cli-v1      ←── mirror ext <id> <subcommand>           │
│                          argv + user's stdio, context in env    │
│   mirror-context-v1  ←── Mirror Mode prompt assembly            │
│                          one JSON request in, one JSON out      │
│                                                                 │
│   both may open the shared SQLite file (own-prefix writes)      │
└─────────────────────────────────────────────────────────────────┘
```

## Layers

The system is intentionally thin and made of four layers, each with a single
responsibility.

### 1. Manifest layer — `skill.yaml`

Declares the extension's identity, kind, runtime command names, and (for
`command-skill`) the capabilities it exposes and the process that answers
each one. Pure data, no behavior. Schema is defined in
[`api-reference.md`](api-reference.md).

### 2. Code layer — declared runtime processes

Every capability declares its own runtime in the manifest — `mirror-cli-v1`
for subcommands, `mirror-context-v1` for context providers — and the core
spawns that command and nothing else. Both protocols are language-neutral: an
extension may own any executable runtime, Python included.

An extension that still has `register(api)` handlers from the Python era keeps
them by shipping its own shim that provides the `api` object and dispatches the
subcommand. The reference implementation,
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

## Dispatch sequence

The core does **not** load extensions on every command. It reads an extension
only when one of its surfaces is invoked:

- `mirror ext <id> <subcommand>` — that one extension's manifest.
- Mirror Mode prompt assembly — the manifests of the extensions with a binding
  for the active persona or selected journey.
- `extensions install <id>` — validates and migrates, and runs no extension
  code at all.

Concretely, a dispatch runs these steps in order:

1. **Resolve.** Find `~/.mirror-minds/<user>/extensions/<id>/skill.yaml`.
2. **Validate.** Parse the manifest, check `kind: command-skill`, validate the
   `ext_<id>_*` prefix matches `id`.
3. **Dispatch.** Validate the declared runtime and invoke it — `mirror-cli-v1`
   for a subcommand, `mirror-context-v1` for a context provider, in stable
   binding order. A capability with no declared runtime refuses (subcommand)
   or is skipped with a diagnostic (provider). There is no fallback.

Migrations run at install and on `mirror ext <id> migrate`, never on dispatch
([migrations.md](migrations.md)).

During `extensions install`, the source tree is copied with a fixed
ignore list (`.git`, `__pycache__`, `.venv`, `.pytest_cache`,
`.ruff_cache`, `.mypy_cache`, `node_modules`, `*.pyc`, `.DS_Store`).
This lets authors install directly from a real Git checkout without
tripping over Git's read-only pack files on re-install, and keeps the
installed tree free of generated noise.

If any step fails, the failure is confined to that extension. A failure in
one extension never blocks others.

## Runtime integration points

The mirror exposes exactly three integration points to extensions.

### CLI dispatch — `mirror ext`

The front door's `ext` family dispatches `ext <id> <subcommand>` to the process
the manifest declares for that subcommand. It also answers built-in verbs:

```
mirror ext list                # all installed extensions
mirror ext <id> --help         # subcommands of an extension
mirror ext <id> bind <cap> ... # persona and journey binding management
mirror ext <id> migrate        # apply pending migrations
```

Each extension is sandboxed at the dispatch level: a subcommand of
extension A cannot be reached through extension B's namespace.

### Mirror Mode context — persona and journey bindings

When the mirror builds the prompt for a Mirror Mode turn, it performs an
extra step after resolving the active persona:

1. Look up persona and selected-journey bindings in stable order.
2. For each binding, validate the installed manifest capability.
3. Invoke its no-shell `mirror-context-v1` process with the request fields in
   JSON. A capability with no declared runtime is skipped and reported.
4. Validate the bounded JSON result and append non-empty text under
   `=== extension/<id>/<capability> ===`.

Provider failures are caught and reported without raw request/stdout/stderr
payload. Ancestor and descendant journeys never widen selected-journey
bindings.

### Storage — shared SQLite, scoped by convention

Extensions share the user's `memory.db`. A subcommand receives its path in
`MIRROR_DATABASE_PATH`, a context provider in the request's `database_path`,
and both receive the prefix they own (`MIRROR_TABLE_PREFIX`,
`table_prefix`). An extension may read any table — joining with journeys or
identity is legitimate — and writes only under its own prefix.

The core enforces the prefix where it runs the SQL itself: on migration files,
at install. A running extension process holds an ordinary SQLite connection,
so inside it the prefix is the extension's responsibility.

## Trust boundary

The mirror treats extensions as **trusted but constrained code**. The user
installs them explicitly, so we assume they are not adversarial. The
constraints exist to:

- prevent honest mistakes (writing to the wrong table),
- keep extensions auditable (one prefix = one extension's data),
- isolate failures so one extension does not break the mirror.

The constraints are **not** a security boundary. An extension process can
open the database and write outside its prefix. We do not try to prevent this
— we make it visible: every table an extension owns carries its prefix.

## What the extension system owns in the core

`ts/src/extensions/` — manifest validation, the migrations runner, bindings,
dispatch, the context runtime, and the catalog — and the front door's
`extensions` and `ext` families. Mirror Mode prompt assembly calls into the
bindings after persona resolution; that call is a no-op when no bindings
exist for the current persona or journey, so extensions impose zero cost on
users who do not install any.

## What does not change

- Existing tables.
- Existing CLI commands (other than `extensions install`, which runs the
  migrations).
- Existing skills (Mirror Mode, journeys, tasks, memories, etc.).
- `prompt-skill` extensions and the `review-copy` example.

The extension system is additive.
