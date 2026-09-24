# Testing Guide

This document defines the testing standard for the extension system and for
extensions themselves. The mirror project follows TDD for behavior changes;
the same expectation applies to extensions.

## Two scopes

Tests live in two places:

- **Core tests** — under `ts/test/extensions/` in the mirror repo. They cover
  the extension system: manifest validation, the migrations runner, the
  binding registry, subcommand dispatch, context-provider execution, and the
  catalog. They use fixture extensions under `ts/test/fixtures/` that do
  nothing interesting, just exercise the contract.
- **Extension tests** — under `<extension-root>/tests/` in the extension's
  own repo, written in whatever language its commands are. They cover the
  extension's own behavior: schema, importers, reports, context providers.

This document covers both.

## The unit under test is a program

Since CV22.DS10.TS2 an extension's code is not imported by the core: each
subcommand and each context provider is a process the core runs
([API reference](api-reference.md)). That makes an extension easy to test
from outside, exactly as the core will call it:

- **A subcommand** (`mirror-cli-v1`) is run with its arguments and the context
  variables in the environment — `MIRROR_DATABASE_PATH`, `MIRROR_HOME`,
  `MIRROR_EXTENSION_ID`, `MIRROR_EXTENSION_ROOT`, `MIRROR_TABLE_PREFIX` — and
  judged by its stdout, stderr, and exit code.
- **A context provider** (`mirror-context-v1`) is given one JSON request on
  stdin and judged by the one JSON object it writes to stdout.

Until CV22.DS10.TS5 the core also shipped a Python helper, `api_for_test`, that
built an in-process `ExtensionAPI` for tests. It left with the Python core; a
program needs no helper to be run.

## Test database setup

Every test that touches the database creates a fresh SQLite file in a
temporary directory. Tests must not share state.

The extension's migrations are plain SQL, so a test applies them in filename
order to the scratch file and then runs the command against it:

```javascript
// tests/ping.test.mjs  (node --test)
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const ROOT = new URL("..", import.meta.url).pathname;

function scratchDatabase() {
  const path = join(mkdtempSync(join(tmpdir(), "ext-hello-")), "memory.db");
  const db = new DatabaseSync(path);
  for (const file of readdirSync(join(ROOT, "migrations")).sort()) {
    db.exec(readFileSync(join(ROOT, "migrations", file), "utf8"));
  }
  db.close();
  return path;
}

test("ping records one row and says so", () => {
  const database = scratchDatabase();
  const run = spawnSync(process.execPath, ["commands/ping.mjs", "from", "a", "test"], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, MIRROR_DATABASE_PATH: database, MIRROR_EXTENSION_ID: "hello" },
  });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, "ping: from a test\n");
  const db = new DatabaseSync(database, { readOnly: true });
  assert.equal(db.prepare("SELECT count(*) AS c FROM ext_hello_pings").get().c, 1);
  db.close();
});
```

## Standard test layers

### Layer 1 — Schema and migrations

For each migration, write a test that:

1. Starts from the schema state *before* the migration (apply the files up to
   the previous one).
2. Applies the migration.
3. Asserts the resulting schema (tables, columns, indices) with
   `PRAGMA table_info` and `sqlite_master`.
4. If data migration is part of the file, seeds representative rows in step
   1 and asserts their final state in step 3.

### Layer 2 — Store / repository

Pure CRUD tests over the extension's shared code (`lib/`). Insert, read back,
update, delete. No business logic. Each test is a single behavior.

### Layer 3 — Services and reports

Tests that compose store operations into business logic: import flows,
report generators, search. These tests seed a small fixture of rows, run
the function, and assert the structured output.

### Layer 4 — CLI subcommands

Run the declared command as a process, as above: arguments in, context in the
environment, then assert exit code and output shape. This is the contract the
core honors, so it is the one worth testing.

### Layer 5 — Mirror Mode and the installed extension

End to end, through the real front door, in a scratch mirror home:

```bash
# An empty MIRROR_USER outranks the one in .env; without it the resolver
# refuses a MIRROR_HOME whose basename does not match the user.
export MIRROR_HOME="$(mktemp -d)" MIRROR_USER=
mirror extensions install hello --extensions-root <extensions-root>
mirror ext hello ping "end to end"
mirror ext hello bind greeting --persona <persona_id>
```

Then, in a home whose identity is seeded with that persona, `mirror mirror load
--persona <persona_id>` must contain the provider's text under
`=== extension/hello/greeting ===`. The core's own tests of the boundary
between core and extension live in `ts/test/extensions/`, over fixture
extensions.

## Edge cases every extension should cover

- **Empty database.** Every command must succeed (with empty output) when
  no rows exist.
- **Missing related rows.** Reading a foreign-key target that does not
  exist (account deleted but transaction remains) should not crash.
- **Bad input.** A subcommand should print a helpful error to stderr and exit
  non-zero, not crash with a stack trace.
- **Idempotent imports.** Importers should dedupe by a stable id and
  produce the same final state on re-run.
- **UTF-8 and Latin-1.** Files from external systems often come in
  Latin-1. Parsers should detect or be told.
- **Provider returning `null` text.** Mirror Mode skips the capability
  without warning.
- **Provider failing.** A provider that exits non-zero, times out, or writes
  anything but its one JSON object is skipped, and Mirror Mode assembles the
  rest of the prompt. Test that your provider fails that way rather than
  printing a partial answer.

## Conventions

- **One assertion per concept.** Multiple asserts are fine if they describe
  the same outcome; split tests when they describe different outcomes.
- **Fixtures small and inline.** Most tests do not need shared fixtures.
  Inline seed data is easier to read than shared setup machinery.
- **Names describe behavior, not implementation.** `runway uses bills when
  available`, not `runway calls monthlyBurnFromBills`.
- **Run in CI.** Every extension should have a CI workflow that runs its
  tests. Core tests run on every push to the mirror repo.

## Running tests

Inside the mirror repo, the core's extension tests:

```bash
cd ts
node --test test/extensions/
```

Inside an extension repo, with whatever runner its language uses —
`node --test tests/` for the example above.

## What is intentionally not tested

- **Real LLM and embedding calls.** An extension that calls a model owns that
  call, and should mock it at its own boundary. Hitting real APIs in CI is
  wasteful and flaky.
- **Network resources.** Extensions that talk to external services (banks,
  CRMs) should mock at the boundary.
- **Sleep and timing.** Time-dependent code uses an injectable clock.
