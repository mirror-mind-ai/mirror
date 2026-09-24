# Authoring Guide

This guide walks through creating a new `command-skill` extension end to end.
It also documents the **recommended layout for an extension's own
repository**, including its documentation structure. The mirror does not
enforce this layout, but every official example follows it and the
[template](template/README.md) starts from it.

For the simpler `prompt-skill` kind, see the
[`examples/extensions/review-copy/`](../../../examples/extensions/review-copy/)
reference instead.

An extension's code is **any executable**. The core runs the command each
capability declares in `skill.yaml`, in whatever language it is written, and
talks to it through two small protocols: `mirror-cli-v1` for a subcommand and
`mirror-context-v1` for a Mirror Mode context provider
([API reference](api-reference.md)). The examples below use Node, because
Mirror already requires it; `command: [python3, commands/ping.py]` is exactly
as valid. Until CV22.DS10.TS2 the core imported a Python `extension.py` and
called its `register(api)` instead — that contract is
[retired](api-reference.md#retired-extensionpy-registerapi-and-extensionapi).

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
  README.md                        # entry point — points into docs/
  commands/                        # one mirror-cli-v1 program per subcommand
    <subcommand>.mjs
  context-provider.mjs             # mirror-context-v1 provider, if any
  migrations/
    001_init.sql
  lib/                             # code the commands share
    ...
  tests/
    ...
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
called `hello`. Replace `hello` with your extension's id. The commands assume
the [`mirror` alias](../../../REFERENCE.md#running-a-command) is defined.

### 1. Create the source tree

Pick any directory to host your extension source trees — the framework
does not impose a location. The examples below use `<extensions-root>`
as a placeholder.

```bash
mkdir -p <extensions-root>/hello/{migrations,commands,tests,docs/user-stories}
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
    provider_runtime:
      protocol: mirror-context-v1
      command: [node, context-provider.mjs]

cli:
  subcommands:
    - name: ping
      summary: Record a ping
      runtime:
        protocol: mirror-cli-v1
        command: [node, commands/ping.mjs]
    - name: list
      summary: List recent pings
      runtime:
        protocol: mirror-cli-v1
        command: [node, commands/list.mjs]
```

A command-skill no longer declares an `entrypoint` (CV22.DS10.TS5, decision
D10); a manifest that still carries one is validated as before.

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

### 4. Write the commands

Each subcommand is an ordinary program. The core runs it without a shell, from
the installed extension root, with the user's arguments appended and the
user's stdin, stdout, and stderr. Context arrives in the environment:
`MIRROR_DATABASE_PATH`, `MIRROR_HOME`, `MIRROR_EXTENSION_ID`,
`MIRROR_EXTENSION_ROOT`, and `MIRROR_TABLE_PREFIX`.

```javascript
// commands/ping.mjs
import { DatabaseSync } from "node:sqlite";

const message = process.argv.slice(2).join(" ") || "hello";
const db = new DatabaseSync(process.env.MIRROR_DATABASE_PATH);
try {
  db.prepare("INSERT INTO ext_hello_pings (message, created_at) VALUES (?, ?)").run(
    message,
    new Date().toISOString(),
  );
  process.stdout.write(`ping: ${message}\n`);
} finally {
  db.close();
}
```

```javascript
// commands/list.mjs
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.env.MIRROR_DATABASE_PATH, { readOnly: true });
try {
  const rows = db
    .prepare("SELECT message, created_at FROM ext_hello_pings ORDER BY id DESC LIMIT 10")
    .all();
  for (const row of rows) process.stdout.write(`${row.created_at}  ${row.message}\n`);
} finally {
  db.close();
}
```

The exit code is the command's. Read and write only your own `ext_hello_*`
tables: the core enforces the prefix on migration SQL at install, and trusts a
running command to keep to it.

### 5. Write the context provider

```javascript
// context-provider.mjs
import { DatabaseSync } from "node:sqlite";

let input = "";
for await (const chunk of process.stdin) input += chunk;
const request = JSON.parse(input);
const db = new DatabaseSync(request.database_path, { readOnly: true });
try {
  const row = db.prepare(
    "SELECT message FROM ext_hello_pings ORDER BY id DESC LIMIT 1"
  ).get();
  process.stdout.write(JSON.stringify({
    protocol: "mirror-context-v1",
    text: row ? `Latest ping: ${row.message}` : null,
  }));
} finally {
  db.close();
}
```

The provider command runs without a shell from the installed extension root. It receives
sensitive context on stdin, so never echo the request or provider result into logs. Keep
stdout reserved for the single protocol JSON object. Failures are isolated by the core.
A capability that omits `provider_runtime` is skipped with a `no_provider_runtime`
diagnostic.

#### Sharing code between commands

Commands are separate processes, so they share code the way any program does:
put it under `lib/` and import it relatively (`import { insertPing } from
"../lib/store.mjs"`). The core resolves nothing on your behalf and adds nothing
to a module path, so two extensions can never collide on a module name.

### 6. Write the prompt skill

An agent runs the commands a skill names in a non-interactive shell, where the
`mirror` alias does not exist, so the skill spells out the front door, exactly
as Mirror's own skills do:

```markdown
<!-- SKILL.md -->
---
name: "ext-hello"
description: Minimal example extension
user-invocable: true
---

# Hello

A minimal extension. Supported commands:

- `NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts ext hello ping [text]` — record a ping.
- `NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts ext hello list` — list recent pings.
```

### 7. Install

```bash
mirror extensions install hello \
  --extensions-root <extensions-root>
```

The target mirror home is taken from `MIRROR_HOME` or `MIRROR_USER` in the
active environment. Add `--mirror-home <path>` only when installing into a
non-default home.

The mirror copies the source, runs the migrations, validates what the manifest
declares, and materializes the skill for each runtime. It does not run your
code: a declared runtime that cannot start is reported when the command runs,
not at install.

### 8. Use

```bash
mirror ext hello ping "from the field"
mirror ext hello list
```

### 9. Bind to a persona (optional)

```bash
mirror ext hello bind greeting --persona <persona_id>
mirror ext hello bindings
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

Most extension needs are satisfied by a runtime process with the database path,
the core's migrations, and its bindings. If you find yourself wanting one of
these, the right move is to propose a core change instead of working around
the contract:

- a new persona routing knob (e.g., per-extension routing keywords),
- a new identity layer,
- a new core event the extension wants to observe,
- a new memory type.

Core changes go through the project's normal decision process (see
`docs/project/decisions.md`). The extension system is meant to absorb
domain-specific features, not to be a vehicle for changing the mirror's
shape.
