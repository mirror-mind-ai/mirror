# US-00 — Command-Skill Infrastructure

**Status:** Done · 2026-05-11

> Built on the Python core. CV22 ported this infrastructure to TypeScript,
> CV22.DS10.TS2 replaced `register(api)` with language-neutral runtime
> protocols, and CV22.DS10.TS5 deleted the Python core. The commands and the
> evidence below are as they were run at the time and are kept as the record;
> today's contract is the [API reference](../api-reference.md), and today's
> commands are in the [authoring guide](../authoring-guide.md).

## Story

**As a** maintainer of Mirror Mind,
**I want** an infrastructure that supports stateful extensions
(extensions with their own schema, their own CLI, and Mirror Mode
integration),
**so that** features specific to a single user (finance, testimonials,
integrations) can live outside the core without losing access to the
shared infrastructure (database, embeddings, LLM, persona routing).

### Why now

Mirror Mind only had one kind of extension (`prompt-skill`), useful for
orchestrating shell commands but not for anything that needs
persistence, a schema of its own, or Mirror Mode integration. Features
of that kind had no place to live: either they were absorbed into the
core (wrong — that mixes the framework with personal identity), or
they stayed completely outside Mirror Mind (also wrong — they would
lose access to embeddings, the LLM router, persona routing, and Mirror
Mode).

The first concrete motivation is two features that existed in the
legacy mirror (`~/Code/mirror-poc/`) and whose data is still preserved
in the legacy database: the finance module (18 accounts, 554
transactions, 68 balance snapshots, 41 recurring bills) and the
testimonials module (5 records with embeddings). Without this
infrastructure, neither one can come back.

### Acceptance value

When this story is Done, an extension author can:

1. Create a repository with a `skill.yaml`, an `extension.py`, a SQL
   migration, and a `SKILL.md`.
2. Run `python -m memory extensions install <id>` — the mirror copies
   the source tree, runs the migrations, imports the entrypoint, and
   calls `register(api)`.
3. Run `python -m memory ext <id> <subcommand>` — the registered
   subcommand executes.
4. Run `python -m memory ext <id> bind <capability> --persona <p>` —
   the binding is persisted.
5. In a Mirror Mode session with persona `p` active, the text returned
   by the provider appears in the prompt.

## Plan

### New files

```
src/memory/extensions/
  __init__.py
  api.py
  loader.py
  migrations.py
  context.py
  testing.py
  errors.py

src/memory/cli/
  ext.py

tests/extensions/
  __init__.py
  conftest.py
  test_api.py
  test_loader.py
  test_migrations.py
  test_context.py
  test_cli_dispatch.py
  test_mirror_mode_hook.py
  fixtures/
    ext-hello/
      skill.yaml
      SKILL.md
      extension.py
      migrations/001_init.sql
```

### Changed files

- `src/memory/__main__.py` — add `ext` dispatch to
  `memory.cli.ext.cmd_ext`.
- `src/memory/cli/extensions.py` — after copying the source tree, call
  `loader.install(...)` which runs migrations and `register`.
- `src/memory/services/identity.py` — in `load_mirror_context`, after
  resolving the persona, call `context.collect_for_persona(persona_id,
  journey_id, query)` and append the result to the prompt under
  `=== extension/<id>/<capability> ===` sections.
- `src/memory/db/schema.py` — add the creation of `_ext_migrations`
  and `_ext_bindings` (idempotent, in the bootstrap).
- `AGENTS.md` — short "Extensions" section pointing at
  `docs/product/extensions/`.

### Suggested implementation sequence (TDD)

1. **Errors + API skeleton.** Exception types + `ExtensionAPI`
   signatures without implementation. Test that the module imports,
   instantiates (mock), and exposes the expected types.
2. **Schema bootstrap.** `_ext_migrations` and `_ext_bindings` created
   in the database bootstrap. The test reads `sqlite_master` and
   confirms.
3. **Migrations runner.** Applies files in order, checksum, prefix
   enforcement, idempotence. Tests cover: apply from scratch, re-apply
   (skip), checksum mismatch (error), prefix violation (error), DML on
   own table (ok), DML on a foreign table (error).
4. **API DB methods.** `execute`, `read`, `executemany`, `transaction`.
   Tests: write outside the prefix is rejected, read on any table is
   allowed, transaction rollback works.
5. **API embeddings and LLM.** Thin wrappers around
   `intelligence.embeddings` and `intelligence.llm_router`. Tests use
   mocks.
6. **Loader.** Discovers, validates the manifest, imports the
   entrypoint, calls `register`. Tests: valid manifest, invalid
   manifest (each field), missing `register`, `register` raising.
7. **CLI registry and dispatcher.** `register_cli` + `cmd_ext` in
   `memory.cli.ext`. Tests: registered subcommand runs, unknown
   subcommand reports a clear error, `--help` lists subcommands.
8. **Context registry and bindings.** `_ext_bindings` table,
   `bind`/`unbind`/`bindings` methods, `collect_for_persona`
   dispatcher. Tests: CRUD, dispatch calls the provider, provider
   raising is caught, provider returning `None` is skipped.
9. **Mirror Mode hook.** Integration in
   `IdentityService.load_mirror_context`. End-to-end test: install the
   fixture, bind a capability to a persona, call `load_mirror_context`
   with that persona, confirm the text is present.
10. **Full install path.** `python -m memory extensions install`
    invokes the loader which runs migrations and `register`.
    Integration test against the `ext-hello` fixture.
11. **Documentation alignment.** Re-read every document in
    `docs/product/extensions/` and adjust anything that diverged from
    the implementation.

### Inherited decisions (not revisited in this story)

- Forced `ext_<id>_*` table prefix.
- Shared database (a single `memory.db`).
- Binding kinds `persona` and `journey` in Phase 1; `global` is in the
  schema only.
- Bindings do not auto-apply from `suggested_personas` on install.
- An extension failure never breaks Mirror Mode.
- `prompt-skill` keeps working without changes.

## Test Guide

### Cases by component

#### `errors.py`

- Hierarchy: every error inherits from `ExtensionError`.
- Messages include the `extension_id` when applicable.

#### `migrations.py`

- Apply `001_init.sql` on a virgin database; `_ext_migrations` records
  a row.
- Re-running is a no-op.
- Editing `001_init.sql` after it was applied and re-running raises
  `ExtensionMigrationError` with a message mentioning the checksum.
- A migration with `CREATE TABLE foo` (no prefix) is rejected before
  any SQL runs.
- A migration with `INSERT INTO ext_hello_pings ...` applies normally.
- Failure mid-file: nothing persists (transaction); `_ext_migrations`
  is not updated.

#### `api.py`

- `execute("INSERT INTO ext_hello_pings ...")` works.
- `execute("INSERT INTO memories ...")` raises
  `ExtensionPermissionError`.
- `read("SELECT * FROM memories")` works.
- `read("UPDATE memories ...")` raises (read enforcement).
- Nested `transaction()` reuses the savepoint structure.
- `embed("text")` returns non-empty bytes (with a mock).
- `llm(prompt)` returns a string (with a mock).

#### `loader.py`

- Loads the `ext-hello` fixture successfully.
- Manifest without `id` -> clear validation error.
- Manifest with `kind: command-skill` and no `entrypoint` -> error.
- `extension.py` without a `register` function -> error.
- `register` that raises -> wrapped in `ExtensionLoadError`.

#### `context.py`

- `bind("finances", "financial_summary", "persona", "treasurer")`
  inserts into `_ext_bindings`.
- A duplicate `bind` is a no-op (composite PK).
- `unbind` removes the row.
- `bindings("finances")` lists the active bindings.
- `collect_for_persona("treasurer", ...)` invokes the registered
  provider and returns its text.
- A provider that raises: a warning is logged, the text is empty.
- A provider that returns `None`: empty text, no warning.

#### `cli.ext`

- `python -m memory ext list` shows installed extensions.
- `python -m memory ext hello ping foo` inserts and prints
  `ping: foo`.
- `python -m memory ext hello nope` returns a non-zero exit code and
  a clear message.
- `python -m memory ext hello --help` lists subcommands.

#### Mirror Mode hook (end-to-end)

- Install the `ext-hello` fixture.
- Create a `tester` persona in identity (through the API directly).
- Bind `hello.greeting` to the `tester` persona.
- Insert a ping.
- Call `IdentityService.load_mirror_context(persona="tester", ...)`.
- The result contains `=== extension/hello/greeting ===` followed by
  the text the provider produced.

### Edge cases

- Mirror Mode with no active persona: no provider is called.
- A binding pointing at an extension that failed to load: logged once,
  Mirror Mode keeps going.
- A binding pointing at a persona that does not exist: never fires
  (the persona is never the active one).
- Multiple extensions bound to the same persona: all fire, in stable
  order (sorted by `extension_id, capability_id`).

### Done criteria

- [x] All tests above pass.
- [x] `uv run pytest tests/unit/memory/extensions/` green — 76 tests.
- [x] `uv run pytest` (full suite) green — 1103 tests.
- [x] `ext-hello` fixture installable with a single command
      (`python -m memory extensions install hello --extensions-root <path>`).
- [x] AGENTS.md updated.
- [x] Documents under `docs/product/extensions/` consistent with the
      shipped code.
- [ ] CI green after push (to be confirmed).
