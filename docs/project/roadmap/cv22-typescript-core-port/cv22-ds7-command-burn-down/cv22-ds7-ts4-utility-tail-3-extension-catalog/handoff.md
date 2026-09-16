[< Story](index.md)

# Handoff — CV22.DS7.TS4 — Ops/utility tail 3: extension catalog

**Status:** plateaus 1-6 of 8 complete. The **catalog reads** answer from
TypeScript — `extensions list|validate` (with the runtime filter and every
usage refusal), `ext list`, `list extensions`, `inspect extension`, and
`inspect runtime-catalog` — graded against 32 recorded Python invocations, and
the **ledger reads** (`inspect llm-calls` rows and `--summary`, `inspect
embedding-provenance`) against 21 more. Plateau 3 adds the family's first
WRITES — `ext <id> bind|unbind|bindings|migrate`, including the migration
runner's write half — graded by 24 recorded cases and by the `ext_bindings`
write probe on a copy of a real database.

Plateau 4 adds the **dispatch** — `ext <id>` and `ext <id> <subcommand>`
through the TypeScript dispatcher, a declared `mirror-cli-v1` command executed
directly, and the compat host's new `cli` mode for everything else — graded by
40 recorded Python invocations that carry the rows each one leaves behind as
well as its streams.

Plateau 5 adds the **catalog writes** — `extensions sync|install|uninstall|
expose-claude|clean-claude` — graded by what they leave ON DISK: 26 recorded
cases carrying the complete file tree of the mirror home, the runtime target
root, and the Claude project root, plus the rows, and a live both-engine
`extension_install` probe on a copy of a real database.

Plateau 6 adds the **editor seam and the ES-001 write faces** — `identity edit`
with a scripted editor, `conversations --metadata-lifecycle-apply` graded on the
report AND the row it leaves, and `--metadata-lifecycle-demo` compared as a
whole document with ids aliased.

**Nothing is routed:** `routing.ts` still sends the whole family to Python,
which is the intended state until plateau 7 adds the routes and plateau 8
flips the gates.

## Resume here

**Next: plateau 7 — the front door (Scope H).** Routes with the three D2 gates
(`MIRROR_TS_EXTENSIONS`, `MIRROR_TS_IDENTITY_EDIT`, and the existing
`MIRROR_TS_CONVERSATIONS_LIFECYCLE`), the two-level allowlist for `ext`
(built-in verbs by name, `<id> <subcommand>` as the dynamic leaf), refusals
through the process boundary, redaction with extension argv sentinels,
`build`-style `leaf=` logging, and oracle registration for the nine Python
modules the Plan names. Then plateau 8 flips the gates.

Everything the family needs is now ported. Nothing is routed: `routing.ts`
still sends all of it to Python.

What landed in plateau 6:

- `ts/src/conversation/lifecycleWrites.ts` — `applyMetadataLifecycle` over the
  engine US10 ported, plus the two title writes the demo scripts and the demo
  report itself;
- `ts/src/identity/identityEdit.ts` — the `$EDITOR` seam, the 0600 buffer, and
  the three refusals, applying through the SAME `applyIdentitySet` that
  `identity set` uses so both commands report one verb from one check;
- `ts/parity/generate_lifecycle_write_golden.py` and
  `ts/parity/generate_identity_edit_golden.py`, both in the CI determinism gate.

What landed in plateau 5:

- `ts/src/extensions/catalogWrites.ts` — the five write verbs, the catalog
  document, the legacy-directory pruning, and the Windows-safe directory
  mapping;
- `ts/src/util/pyGenerators.ts` — `pythonJsonDumpsIndentedOrdered`, because the
  catalog is written with `json.dumps(indent=2)` and the existing indented
  helper carries `sort_keys=True`;
- `src/memory/extensions/compat_host.py` — a `validate_register` mode of the
  same `mirror-cli-v1` request kind: migrations are the TypeScript port's, but
  the entrypoint import still needs an interpreter, and it has to run at
  INSTALL time or a broken `register` fails a week later instead;
- `ts/parity/generate_ext_catalog_writes_golden.py` + its five source
  extensions, and the `extension_install` write probe in both halves.

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

## Rules plateau 6 paid for — do not rediscover them

- **A shipped, flipped face was reading three columns of five.** The US11
  read face selected `id, title, metadata` and handed it to an engine that also
  reads `summary` and `tags`, so every conversation carrying either got a
  different report from each core. Fixed and committed separately; its corpus
  now seeds a conversation that has both.
- **The flag is `--tag`, singular and REPEATABLE**, with `dest="tags"`. There is
  no `--tags`; the plural spelling is an argparse error. A port written from the
  parameter name would offer an option Python refuses.
- **`no_value_provided` is a different fact from `decision_X_not_applied`** and
  is reported as one: the first says nobody offered a value, the second says a
  value was offered and the decision refused it.
- **The summary truncation counts CODE POINTS.** A UTF-16 slice at 1000 cuts a
  surrogate pair in half and stores a lone surrogate; the corpus straddles the
  boundary with an astral character.
- **`identity edit` refuses three ways and saves nothing in all of them**: a
  non-zero editor exit is an abort (`:cq` means discard), blank content is
  refused, and an unchanged buffer writes nothing at all. The temp file is 0600
  and removed on every path, including the refusals.
- **A test that can launch a real editor can hang CI forever.** This file's
  first version resolved one case to `nano`, which opened on the runner's
  terminal and never returned. The replay now refuses to spawn anything but the
  corpus's own scripted editors — a failure is strictly better than a hang,
  because CI has nobody to press Ctrl-X.
- **A killed mutation run can leave a mutant in the tree.** The first mutation
  harness died at the shell timeout before its `finally`, leaving
  `resolveEditor` without its VISUAL fallback — which is exactly what launched
  that `nano`. The harness now keeps a pristine copy outside the tree, restores
  before AND after each mutant, bounds every run, and verifies the tree at the
  end.
- **Two survivors here are equivalent, and the reason is worth keeping.** The
  `tags_ready_after_summary` branch cannot fire: both decisions flip at four
  substantive messages, so `tags: defer` and `summary: create` cannot co-occur.
  A test pins that coupling instead, so a future policy change that separates
  the thresholds makes the branch live and fails loudly. The `previous_title`
  guard is likewise unobservable — when the values are equal the assignment is
  a no-op — and is kept because Python keeps it.

## Rules plateau 5 paid for — do not rediscover them

- **The catalog is `json.dumps(indent=2)`: non-ASCII ESCAPED, keys in INSERTION
  order.** A summary reading `Café notes — a fixture` lands as
  `Caf\u00e9 notes \u2014 a fixture`. `JSON.stringify` writes raw UTF-8, and
  the existing `pythonJsonDumpsIndented` sorts keys — both silently rewrite a
  file the two cores read and rewrite in turn.
- **A Claude command keeps its `:` in the catalog and loses it on disk.**
  `ext:notes` is the runtime command; `ext-notes/` is the directory, because
  `:` is illegal in a Windows path segment. Trailing dots and spaces are
  stripped for the same reason, and a name that is nothing but illegal
  characters still has to produce a directory: `extension`.
- **Install rebuilds each runtime catalog from EVERY installed extension**,
  while the report names only the one installed. Feeding the writer a single
  manifest drops every other extension from the catalog Pi and Claude discover
  through, leaving their SKILL.md files orphaned on disk.
- **The `__pycache__` in an installed tree was not copied.** `__pycache__` is in
  the ignore patterns; it appears because the post-install step IMPORTS the
  extension to validate `register`. Its bytes and its `cpython-3XY` filename
  are interpreter-specific, so the corpus records a marker.
- **`install` lets its validation errors escape as a traceback while
  `uninstall` catches the same class and prints one line.** Same command, two
  refusal shapes, again.
- **`clean-claude` removes only an EMPTY parent directory.** A skills directory
  holding a file a human put there keeps both. Nothing graded that until a
  mutant survived and the corpus grew the case.
- **A probe that grades a fresh corpus while claiming a real one proves
  nothing.** The install probe's first version copied the database beside the
  name `install` resolves, so `install` created an empty database and migrated
  THAT. Two clocks had to be frozen, in two modules, before the probe could
  even repeat itself.

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
