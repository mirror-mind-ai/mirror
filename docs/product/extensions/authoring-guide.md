# Authoring Guide

This guide walks through creating a new `command-skill` extension end to end.
It also documents the **recommended layout for an extension's own
repository**, including its documentation structure. The mirror does not
enforce this layout, but every official example follows it and the tooling
assumes it.

For the simpler `prompt-skill` kind, see the
[`examples/extensions/review-copy/`](../../../examples/extensions/review-copy/)
reference instead.

## Naming principles

Before writing anything, internalize the naming rules. They apply to the
extension `id`, table names, CLI subcommands, capability ids, and
documentation titles.

- **No proper nouns.** Banks, vendors, and file formats are parameters, not
  identity. `import-fatura-cartao`, not `import-fatura-itau`.
  `import-extrato --format ofx`, not `import-ofx`.
- **Describe the capability, not the implementation.** `runway` is fine.
  `calculate-runway-from-bills-with-3-month-lookback` is not.
- **English when in doubt.** Identifiers are stable across the system; user
  identity (persona names, journey slugs) may be in any language.
- **Plural for collections, singular for actions.** `accounts`, `transactions`,
  `testimonials`. `bind`, `migrate`, `import-extrato`.

## Recommended repository layout

```
<extension-root>/
  skill.yaml                       # manifest (required)
  SKILL.md                         # prompt for the agent (required)
  extension.py                     # entrypoint (required)
  pyproject.toml                   # optional, if the extension has Python deps
  README.md                        # entry point — points into docs/
  migrations/
    001_init.sql
  src/
    __init__.py
    models.py
    store.py
    ...
  tests/
    test_<feature>.py
  docs/
    architecture.md                # decisions and internal structure
    commands.md                    # full CLI reference
    data-model.md                  # tables, columns, indices, FKs
    bindings.md                    # capabilities and binding instructions
    migrations.md                  # history and strategy
    legacy-migration.md            # optional, when porting from older system
    persona-recipes.md             # optional, suggested persona briefings
    user-stories/
      README.md                    # index
      US-01-<slug>.md              # one file per story
      US-02-<slug>.md
    CHANGELOG.md
```

### Documentation layout (inside the extension)

The mirror suggests this template. Each document has a focused purpose:

- **`README.md`** — what the extension does, why, how to install, and the
  top 3–5 commands. Two minutes of reading. Links to everything else.
- **`docs/product/architecture.md`** — internal design, data flow, decisions.
  Why this schema, why this parser registry, why this LLM prompt shape.
- **`docs/commands.md`** — exhaustive CLI reference. Every subcommand, every
  flag, every example. Generated or hand-written, but complete.
- **`docs/data-model.md`** — every table the extension owns: columns, types,
  constraints, indices, foreign keys. The reader should be able to write SQL
  against the schema from this document alone.
- **`docs/bindings.md`** — every capability the extension exposes, what the
  provider returns, suggested personas, and worked examples of binding.
- **`docs/migrations.md`** — chronological list of migrations with a one-line
  rationale each. Explains the schema's history.
- **`docs/legacy-migration.md`** — only when the extension can ingest data
  from an older system. Step-by-step procedure, including a dry-run.
- **`docs/persona-recipes.md`** — only when the extension expects to be
  paired with specific personas. Suggested briefings the user can adapt.
- **`docs/user-stories/`** — one file per story, named
  `US-NN-<slug>.md`. Each story has three sections: **Story** (narrative,
  who/what/why), **Plan** (technical steps, files touched), **Test Guide**
  (cases, edge cases, acceptance).

## Step-by-step

The following steps build a minimal but complete `command-skill` extension
called `hello`. Replace `hello` with your extension's id.

### 1. Create the source tree

Pick any directory to host your extension source trees — the framework
does not impose a location. The examples below use `<extensions-root>`
as a placeholder.

```bash
mkdir -p <extensions-root>/hello/{migrations,src,tests,docs/user-stories}
cd <extensions-root>/hello
```

### 2. Write the manifest

```yaml
# skill.yaml
id: hello
name: Hello
category: extension
kind: command-skill
summary: Minimal extension example
table_prefix: ext_hello_

entrypoint:
  module: extension

runtimes:
  pi:
    command_name: ext-hello
    skill_file: SKILL.md
  claude:
    command_name: ext:hello
    skill_file: SKILL.md

mirror_context_providers:
  - id: greeting
    description: "A short greeting injected when the bound persona is active."
    suggested_personas: []
```

### 3. Write the initial migration

```sql
-- migrations/001_init.sql
CREATE TABLE ext_hello_pings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  message     TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE INDEX idx_ext_hello_pings_created
  ON ext_hello_pings(created_at);
```

### 4. Write the entrypoint

```python
# extension.py
from datetime import datetime, timezone

from memory.extensions.api import ExtensionAPI


def register(api: ExtensionAPI) -> None:
    api.register_cli("ping", _cmd_ping, summary="Record a ping")
    api.register_cli("list", _cmd_list, summary="List recent pings")
    api.register_mirror_context("greeting", _provide_greeting)


def _cmd_ping(api: ExtensionAPI, args: list[str]) -> int:
    message = " ".join(args) or "hello"
    api.execute(
        "INSERT INTO ext_hello_pings (message, created_at) VALUES (?, ?)",
        (message, datetime.now(timezone.utc).isoformat()),
    )
    print(f"ping: {message}")
    return 0


def _cmd_list(api: ExtensionAPI, args: list[str]) -> int:
    rows = api.read(
        "SELECT message, created_at FROM ext_hello_pings ORDER BY id DESC LIMIT 10"
    ).fetchall()
    for row in rows:
        print(f"{row['created_at']}  {row['message']}")
    return 0


def _provide_greeting(api: ExtensionAPI, ctx) -> str | None:
    row = api.read(
        "SELECT message FROM ext_hello_pings ORDER BY id DESC LIMIT 1"
    ).fetchone()
    if not row:
        return None
    return f"Latest ping: {row['message']}"
```

#### Importing your own helpers

The loader inserts your extension's root directory on `sys.path` before
importing `extension.py`. That means you can split your code into
sub-modules and import them naturally:

```python
# extension.py
from src.store import insert_ping
from src.cli.report import cmd_report
```

No manual prelude is required. The insertion is idempotent (the same
directory is never added twice), but it is global to the process — two
extensions that both ship a top-level package called `src` will resolve
to whichever one was loaded first. Keep public-facing module names
specific to your extension if you ever expect them to be shared.

### 5. Write the prompt skill

```markdown
<!-- SKILL.md -->
---
name: "ext-hello"
description: Minimal example extension
user-invocable: true
---

# Hello

A minimal extension. Supported commands:

- `python -m memory ext hello ping [text]` — record a ping.
- `python -m memory ext hello list` — list recent pings.
```

### 6. Install

```bash
python -m memory extensions install hello \
  --extensions-root <extensions-root>
```

The target mirror home is taken from `MIRROR_HOME` or `MIRROR_USER` in the
active environment. Add `--mirror-home <path>` only when installing into a
non-default home.

The mirror copies the source, runs migrations, imports `extension.py`, and
calls `register`.

### 7. Use

```bash
python -m memory ext hello ping "from the field"
python -m memory ext hello list
```

### 8. Bind to a persona (optional)

```bash
python -m memory ext hello bind greeting --persona <persona_id>
python -m memory ext hello bindings
```

Now any Mirror Mode turn that routes to that persona will include
`=== extension/hello/greeting ===` in the prompt.

## Conventions for evolving an extension

- **Never edit an applied migration.** Add a new file.
- **Bump `CHANGELOG.md` on every release.** Include the date and a short
  rationale.
- **Write a user story before writing code.** Even small features benefit
  from a 10-line Story / Plan / Test Guide document.
- **Test the migration path, not just the new code.** Every migration deserves
  a test that runs it against the previous schema and asserts the resulting
  shape.
- **Keep the API surface narrow.** Subcommands and capabilities are the
  public surface; everything else is internal.

## When to ask for a core change

Most extension needs are satisfied by `ExtensionAPI`. If you find yourself
wanting one of these, the right move is to propose a core change instead of
working around the API:

- a new persona routing knob (e.g., per-extension routing keywords),
- a new identity layer,
- a new core event the extension wants to observe,
- a new memory type.

Core changes go through the project's normal decision process (see
`docs/project/decisions.md`). The extension system is meant to absorb
domain-specific features, not to be a vehicle for changing the mirror's
shape.
