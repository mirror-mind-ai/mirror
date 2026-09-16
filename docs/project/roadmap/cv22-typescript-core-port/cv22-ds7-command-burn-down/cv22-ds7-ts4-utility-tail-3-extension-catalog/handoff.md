[< Story](index.md)

# Handoff — CV22.DS7.TS4 — Ops/utility tail 3: extension catalog

**Status:** plateaus 1-4 of 8 complete. The
**catalog reads** answer from
TypeScript — `extensions list|validate` (with the runtime filter and every
usage refusal), `ext list`, `list extensions`, `inspect extension`, and
`inspect runtime-catalog` — graded against 32 recorded Python invocations, and
the **ledger reads** (`inspect llm-calls` rows and `--summary`, `inspect
embedding-provenance`) against 21 more. Plateau 3 adds the family's first
WRITES — `ext <id> bind|unbind|bindings|migrate`, including the migration
runner's write half — graded by 24 recorded cases and by the `ext_bindings`
write probe on a copy of a real database. Plateau 4 adds the **dispatch** —
`ext <id>` and `ext <id> <subcommand>` through the TypeScript dispatcher and
the compat host's new `cli` mode — graded by 32 recorded Python invocations
that carry the rows each one leaves behind as well as its streams.
**Nothing is routed:** `routing.ts` still sends the whole family to Python,
which is the intended state until plateau 7 adds the routes and plateau 8
flips the gates.

## Resume here

**Next: plateau 5, the catalog writes.** `extensions sync|install|uninstall|
expose-claude|clean-claude`, graded like `builder_artifacts` — file trees
compared byte for byte in a disposable home AND a disposable target root, never
the developer's `.pi`, which the plan-stage panel named explicitly. It can now
be written: a command-skill install calls the extension's own `register(api)`,
and the host this plateau landed is what lets TypeScript complete that.
Two traps already measured and waiting there: `install_extension` uses the
DIRECTORY NAME as the extension id (the repository's own `ext-hello` fixture
fails its own prefix check because of it), and an install failure escapes as an
uncaught traceback.

What landed in plateau 4:

- `src/memory/extensions/compat_host.py` — the `mirror-cli-v1` request kind:
  validation (id, root, and a database that must equal the home's env-aware
  path) separated from execution, so a malformed REQUEST is one host line while
  a handler's own traceback escapes exactly as `python -m memory ext` lets it;
- `ts/src/extensions/dispatch.ts` — `pythonPathJoin`, `installedExtensionDir`,
  the `ExtensionDispatch` decision, and `runExtensionSubcommand`, which spawns
  the host with `["pipe", "inherit", "inherit"]` and no shell;
- `ts/src/extensions/catalogCommands.ts` — `runExtCommand` now returns
  `RenderedCommand | ExtensionDispatch`: it DECIDES, and only a caller allowed
  to spawn executes;
- `ts/src/extensions/dispatch.ts` — `readDeclaredCommands`: the contract half,
  reading `cli.subcommands[].runtime` rather than a parallel `commands[]`
  array, because every installed manifest already lists its subcommands there
  (Navigator amendment, recorded in the Plan and in Decisions);
- `ts/parity/generate_ext_dispatch_golden.py` and its five fixture extensions,
  in the CI determinism gate with their own `git diff` check. The `declared`
  fixture carries a Python twin for every declared command, so ONE corpus
  recorded from Python grades the TypeScript contract path too.

What landed in plateau 3:

- `ts/src/extensions/migrations.ts` — the write half (`splitStatements`,
  `extractTableTargets`, `validatePrefix`, `runMigrations`) extending TS3's
  read half in place, as TS3's comment asked;
- `ts/src/extensions/bindings.ts` — `runBind`, `runUnbind`, `runBindings`,
  `runMigrate`, the binding-tail parser, and `pythonUtcIsoformat`;
- `ts/src/parity/extensionProbes.ts` + `ts/parity/write_parity_extensions.py`
  — the `ext_bindings` write probe, in CI on the demo copy.

What landed before plateau 3:

**Plateau 2 detail (superseded as "next", kept as history):** — `ext <id>
bind|unbind|bindings|migrate`: the `_ext_bindings` insert-or-ignore and delete
with Python's `isoformat()` timestamp bytes, and the WRITE half of the
migration runner (`run_migrations`, `_split_statements`,
`_extract_table_targets`, `_validate_prefix`) extending `migrations.ts` where
TS3 left the seam. `test_migrations.py` (19 tests) is the corpus, and a
real-DB-copy write probe grades `_ext_bindings` and `_ext_migrations` rows.
The database-architect's plan-stage dissent names the risk: a semicolon inside
a string literal or a trigger body splits differently in the two cores, and
each then applies different DDL to the same file. Port it from the tests, and
mutate it.

What landed in plateau 2:

- `ts/src/observability/inspectLedger.ts` — `getLlmCalls`,
  `countMemoriesByEmbeddingModel`, and the three renderers, over DS8's
  `getLlmCallSummary` (whose parameter widened to `Database`: its first caller
  opens read-only);
- `ts/src/util/pythonText.ts` — `pyRepr` widened to Python's real rules (quote
  choice, escapes, printable non-ASCII left alone), because this is the first
  caller that passes arbitrary user text;
- `ts/parity/generate_ledger_inspect_golden.py` and a JSON row fixture both
  engines seed from, in the CI determinism gate.

What landed in plateau 1:

- `ts/src/extensions/catalog.ts` — discovery, the runtime filter, the runtime
  catalog loader, and the four renderers;
- `ts/src/extensions/catalogCommands.ts` — the hand-rolled argument parsing and
  the exact print/refuse/exit order of `cmd_extensions`, `ext list`,
  `cmd_list`'s extension branch, and `cmd_inspect`'s catalog targets;
- `ts/src/extensions/manifest.ts` — **widened** from TS3's `{id, kind}` to the
  fields the renderers print, exactly where TS3 said TS4 would extend it;
- `ts/parity/generate_extension_catalog_golden.py` and its fixture tree, in the
  CI determinism gate with their own `git diff` check.

## Rules plateau 4 paid for — do not rediscover them

- **`Path.__truediv__` is not `join`, and the result is PRINTED.**
  `_installed_extension_dir` never normalizes, so `ext ../../etc ping` answers
  `extension not installed: <home>/extensions/../../etc`, an ABSOLUTE id
  discards the extensions root entirely (`ext /etc ping` reads
  `/etc/skill.yaml`), and `.`, `''`, and a trailing slash each have their own
  answer. Plateau 3 had shipped `join` in `runMigrate`; this measurement caught
  it, because the bindings golden had only ever passed a plain id.
- **Two exception classes share one name.** `memory.cli.extensions` defines
  `ExtensionValidationError(ValueError)`, unrelated to the `ExtensionError`
  family in `memory.extensions.errors` that `_dispatch_subcommand` catches. A
  failing `register` is a printed line at exit 1; a bad or missing MANIFEST is
  an uncaught traceback at the same exit code. One command, two refusal shapes
  — the same trap class as plateau 1's usage refusals.
- **`--mirror-home <value>` is eaten from anywhere in argv**, including the
  extension's own tail, so a handler can never receive it — but a trailing
  `--mirror-home` with no value is not a pair and reaches the handler intact.
- **The handler's return value IS the exit code**, through `int()`: `3` exits
  3, `"7"` exits 7, and `None` raises inside the dispatcher after the handler
  has already printed.
- **Streams are the product.** The context mode redirects a provider's streams
  because its text is a payload inside an envelope; the command mode must
  inherit them. One host, two opposite stream rules, on purpose.
- **Validate resolved, dispatch raw.** The host resolves the home to refuse an
  escape, then hands the ORIGINAL string to the dispatcher. Dispatching the
  resolved path rewrote every message on macOS, where a home under `/var` is
  really `/private/var`. The corpus caught it; review had not.
- **A refused id never reaches a process.** Id validation runs in TypeScript
  before the spawn, so `ext /etc ping` cannot make Python open `/etc`.
- **The declaration is the dispatcher's to read, never the validator's.** The
  manifest validator is a byte-graded port of Python's, and Python ignores
  `cli:` entirely: a TypeScript-only field that could FAIL validation would
  make `extensions list` report an invalid extension where Python reports a
  valid one. Every malformed declaration falls back to the host instead.
- **The listing is not a declared command.** It is answered from the live
  registry through the host, so an extension cannot hijack `ext <id>` by
  declaring a subcommand named `--help`, and the listing never disagrees with
  what the extension can actually run.
- **A test that refuses for the wrong reason grades nothing.** The first
  foreign-protocol case replaced the protocol AND dropped the argv, so a mutant
  deleting the protocol check survived. Same lesson plateau 1 and plateau 3
  each paid for once: assert that the mutant mutated, and that the case
  isolates what it claims to isolate.
- **Equivalent mutant, recorded:** replacing the listing's `"--help"` with
  `"help"` survives, because `_dispatch_subcommand` treats `--help`, `-h`, and
  `help` identically before any registry lookup. A gap in the code's
  distinctions, not in the corpus.

## Rules plateaus 1-3 paid for — do not rediscover them

- **This family does not use argparse.** Every refusal prints usage to
  **stdout** and exits **1**, and `stderr` is empty. A port that sends usage to
  stderr, or exits 2, is wrong for all of `extensions`, `ext`, `list`, and
  `inspect` — even though `inspect llm-calls` (plateau 2) IS argparse and does
  exit 2. Both classes live in one command.
- **An invalid extension masks a usage error.** `validate` and `sync` print the
  INVALID block and exit 1 in a shared prelude, before `sync` can report a
  missing `--runtime`. Fix the fixture's broken manifest and you change what a
  different case prints.
- **The two INVALID blocks are not the same block.** The one inside
  `print_extension_list` has a leading blank line; the prelude's does not.
- **A missing or corrupt runtime catalog is not an error.** `_load_catalog`
  returns an empty catalog for both, so `inspect runtime-catalog` prints
  `(none)` and exits 0. `load_runtime_catalog` — the strict one that raises —
  is a different function with different callers.
- **Entrypoint order is output.** Python mutates the parsed `entrypoint` dict
  by appending `module_path`, and `inspect extension` prints the mapping in
  insertion order. The TS manifest carries an ordered pair list for that
  reason, not an object.
- **A `--global` binding is not idempotent.** `_ext_bindings`'s primary key
  includes a nullable `target_id`; SQLite does not consider two NULLs equal, so
  `INSERT OR IGNORE` ignores nothing and duplicates accumulate. The docstring
  that says "No-op if already present (PK conflict)" is true only for the
  targeted kinds. Parity-bound here, recorded as debt.
- **A probe that reimplements the write grades the probe.** The `ext_bindings`
  probe survived a real mutant until it called `runBind`/`runUnbind` instead of
  copying their SQL — and survived a second until each step carried a distinct
  timestamp. Run mutants against the probe, not only against the corpus.
- **Migration atomicity is a SAVEPOINT, not a transaction**, in both cores:
  SQLite implicitly commits a deferred transaction before DDL, so `BEGIN`/
  `ROLLBACK` would not undo a half-applied `CREATE TABLE`.
- **One `inspect` command, two refusal classes.** `inspect extension` and
  `inspect runtime-catalog` exit 1 with usage on stdout; `inspect llm-calls`
  and `inspect embedding-provenance` are argparse and exit 2 on stderr. A
  single refusal rule for the command would be wrong for half of it.
- **`--session` and `--since` filter AFTER the store's LIMIT.** Reproduced, not
  repaired: `--session X --limit 3` can report no rows while `--session X`
  alone finds one.
- **Verify a mutant actually mutated.** A survivor in this plateau was a
  no-op replacement caused by shell escaping. An unverified SURVIVED verdict
  is worse than no mutation testing.
