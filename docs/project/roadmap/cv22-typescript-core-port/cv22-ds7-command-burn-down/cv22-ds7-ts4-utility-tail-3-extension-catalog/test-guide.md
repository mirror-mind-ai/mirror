[< Story](index.md)

# Test Guide — CV22.DS7.TS4

## Automated Validation

- **Goldens** generated from Python before the TypeScript exists, scenarios
  taken from the existing tests (`test_extensions.py`, `test_inspect.py`,
  `test_inspect_llm_calls.py`, `test_inspect_embedding_provenance.py`,
  `test_migrations.py`, `test_cli_dispatch.py`, `test_identity_cmd.py`,
  `test_conversations.py`, `test_conversation_metadata_lifecycle.py`), driven
  through the public CLI in a subprocess, under the determinism gate on 3.10
  and 3.12, offline: catalog reads over a fixture extensions root; ledger reads
  over the demo database; the `ext` dispatcher's refusals and help; the
  migration runner's statement splitting and checksums; `identity edit` with a
  scripted `$EDITOR`; every `apply_metadata_lifecycle` branch and the `demo`
  report.
- **Write probes** on the demo copy in CI: `ext_bindings`, `ext_migrations`,
  `extension_install` (a file-tree probe in the `builder_artifacts` shape),
  `metadata_lifecycle_apply`.
- **Catalog smoke**, both engines, disposable home and disposable target root:
  install `ext-hello` → `ext ext-hello` → bind → bindings → `ext ext-hello
  <sub>` → unbind → migrate → uninstall; trees and rows diffed after every
  step; a second fixture with a declared `commands[].runtime` exercises the
  contract path.
- **Redaction:** extension argv sentinels (an account id, a campaign name, a
  folder path) and an extension `.env` value never reach `front-door.log`.
- **Revert drills** for `MIRROR_TS_EXTENSIONS=0`, `MIRROR_TS_IDENTITY_EDIT=0`,
  `MIRROR_TS_CONVERSATIONS_LIFECYCLE=0`.
- Oracle registration of the nine Python modules named in the Plan; skill
  parity checker with `identity edit` and the lifecycle write faces removed
  from its Python allowlist at the flip.

## E2E Decision

**Required.** `ext <id> <subcommand>` is decided by code Mirror does not own;
only a real installed extension on the real home proves the bridge.

## Navigator Validation

In order, on the real home:

| Step | Command(s) | Expected observation | Pass | Fail |
|---|---|---|---|---|
| 1 | `extensions list`, `ext list`, `list all`, `inspect extension google-ads`, `inspect runtime-catalog pi`, `inspect llm-calls --summary`, `inspect embedding-provenance` — both engines, diffed | Byte-identical stdout, stderr, exit code | identical | any byte |
| 2 | `ext <id>` for every installed extension, both engines | Identical subcommand listings; nothing executed | identical | any difference, or a handler that ran |
| 3 | One read-only extension subcommand through the compat host (`ext session-export folder`) | Identical output and exit code; `ext ts leaf=session-export` in the log, no argument text | as described | any difference, argument text in the log |
| 4 | Catalog lifecycle on a disposable home and target root with `ext-hello`: install → bind → bindings → migrate → unbind → uninstall, both engines | Trees and rows diff-clean at every step | diff-clean | any tree or row difference |
| 5 | `identity edit <layer> <key>` with the Navigator's `EDITOR`, on a copy then the real home | Edited content saved; an unchanged buffer saves nothing; empty content refused | as described | content lost, or a save on no change |
| 6 | `conversations --metadata-lifecycle-demo` both engines; `--metadata-lifecycle-apply` on a copy for a locked-title, a refine-candidate, and a deferred-tags conversation | Identical JSON reports | identical | any difference |
| 7 | Revert: one leaf per family under its `=0` variable | Identical output, Python in the log | identical | any difference |

Providing this route is not acceptance. Validation passes only when the
Navigator has run steps 1–7 and accepted them explicitly.

## Validation Evidence

### Plateau 1 — the refusal matrix, measured

The plan's first act was to run the real CLI rather than read it. All 32 cases
in `ts/test/fixtures/extension-catalog.golden.json` were recorded from
`python -m memory …`, one subprocess each, over a disposable copy of the
fixture home. What the measurement settled:

| Fact | Measured |
|---|---|
| Refusal class for this whole family | usage on **stdout**, exit **1**, `stderr` **empty** — including `list bogus`, `inspect` bare, and `inspect extension <missing>`; no case in the family reaches argparse |
| `extensions validate` / `sync` with an invalid extension | exit 1 from the shared prelude **before** the command's own missing-option message (`sync requires --runtime` is never printed when an extension is invalid) |
| The two INVALID blocks differ | `print_extension_list`'s block has a leading blank line; the validate/sync prelude's does not |
| `ext` bare vs `ext --help` | identical bytes, exit **1** vs **0** |
| Missing or corrupt runtime catalog | rendered as an **empty catalog at exit 0** — `_load_catalog` swallows both |
| Discovery | non-directories and directories without `skill.yaml` are skipped silently; only a present-but-invalid manifest becomes a row |
| `inspect extension` entrypoint order | the keys the author wrote, then the resolved `module_path` Python appends — insertion order is output |

### Plateau 1 — checks

- `ts/test/extensions/catalog.test.ts`: 32 recorded cases replayed through the
  TypeScript composition, all three faces (stdout, stderr, exit code) equal.
- **Five mutants killed** from a green baseline: unsorted runtime parts, a bare
  `ext` exiting 0, a corrupt catalog throwing instead of rendering empty, a
  blank line added to the validate-path INVALID block, and discovery no longer
  skipping directories without a manifest.
- One mutant first reported SURVIVED and was **fiction**: the escaping in the
  mutation script made the replacement a no-op, so nothing was mutated. Re-run
  with the mutation verified as applied, it was killed. Same false-green class
  US8 recorded twice; the lesson is to assert the mutation changed the file.
- TS suite 2,218 pass; `tsc --noEmit` clean; biome clean except the
  pre-existing `routing.ts` warning; golden regeneration is a no-op and joins
  the CI determinism gate with its own `git diff` (it lives beside its fixture,
  not under `ts/test/goldens/`).

Nothing is routed: `routing.ts` still sends every one of these commands to
Python.

### Plateau 2 — the ledger reads

21 cases in `ts/test/fixtures/ledger-inspect.golden.json`, recorded from the
real CLI over a database seeded from `ledger-inspect/rows.json` — the same
file the TypeScript test seeds its own database from, so nothing binary is
committed and both engines provably start from the same values.

What the measurement settled:

| Fact | Measured |
|---|---|
| Refusal class | these two leaves **are** argparse: exit **2**, usage on **stderr** — the opposite of the catalog family under the same `inspect` command |
| `--session` / `--since` | applied by the CLI **after** the store's `LIMIT`: `--session session-gamma` finds a row alone and finds nothing at `--limit 3` |
| `role` / `model` fallback | `NOT NULL` in the schema, so `or "?"` is reachable only through an **empty string** |
| The role column | `{:<18}` pads and never truncates, so `journal_classification` overflows and misaligns its own row |
| An all-unpriced bucket | keeps `—`, never sums to `$0.000000` |
| `repr` of prompts | Python switches to **double quotes** when the text contains `'` and no `"` |
| The 200-character cut | **code points**: the corpus stages an astral character at index 199, where a UTF-16 cut halves the surrogate pair |
| Unknown provenance | sorts before a named model on a count tie, because Python sorts by `str(None)` = `"None"` |

Deliberate divergence, recorded: argparse wraps its usage block to the
terminal's `COLUMNS`, so its TEXT is not a portable contract — the generator
had to pin `COLUMNS=80` just to make the golden stable. TypeScript refuses the
same inputs with exit 2 and a one-line message, and the test grades the class
(input, stream, exit code), not the block. Same rule US8 pinned.

**Checks:** 21/21 cases equal; **six mutants killed** (session filter dropped,
UTF-16 slice, repr never switching quotes, role column truncated, provenance
sorted ascending, unpriced rendered as zero), each one asserted to have changed
the file before its verdict was believed. TS suite 2,220 pass; typecheck clean;
Python `inspect` tests still green. `getLlmCallSummary` — shipped by DS8 with
no caller — got its first one here, and its parameter widened from
`WritableDatabase` to `Database` because the caller opens read-only.

### Plateau 3 — bindings and the migration runner's write half

24 recorded cases in `ext-bindings.golden.json`, each carrying the streams AND
the `_ext_bindings` / `_ext_migrations` rows and extension tables that exist
after the step — a command that prints the right line and writes the wrong row
fails here. Plus the `ext_bindings` **write probe** on a copy of a real
database, running the production functions.

| Fact | Measured |
|---|---|
| A `--global` bind is **not idempotent** | `_ext_bindings`'s primary key includes a nullable `target_id`, and SQLite does not consider two NULLs equal, so `INSERT OR IGNORE` ignores nothing: three global binds leave **three rows**, three persona binds leave one |
| One global unbind clears them all | `(target_id IS ? OR target_id = ?)` matches every duplicate at once |
| `--help` on a built-in verb | describes and **never executes**: `ext <id> migrate --help` leaves the migration unapplied |
| A failing statement | rolls the whole file back — table **and** bookkeeping row — via SAVEPOINT, because SQLite implicitly commits a deferred transaction before DDL |
| The prefix guard reads statements, not text | a block comment naming `memories` and `DROP TABLE conversations` does not trip it; the real out-of-namespace statement does |
| Checksum semantics | a comment-and-whitespace edit is tolerated; changing a string literal is drift and is refused |
| `created_at` / `applied_at` | Python's `isoformat()` with `+00:00`, **not** the `Z` spelling the rest of Mirror writes |

Recorded divergence: the tail of `<file> failed to apply: <message>` is the
SQLite driver's own sentence, and `node:sqlite` does not word it as CPython's
`sqlite3` does. The graded contract is the prefix, the exit code, and the
rollback.

**Checks:** 24/24 cases equal; **seven mutants killed** on the corpus (splitter
losing string literals, prefix guard reading comments, rollback removed, drift
accepted, `IS` → `=`, unbind always claiming success, `Z` timestamps), each
asserted to have changed the file first. `ext_bindings` write probe:
`match: true` on a real-database copy.

**The probe caught its own weakness, twice.** Its first version reimplemented
the binding SQL instead of calling `runBind`/`runUnbind`, so a mutant that
broke the production `IS`-matching **survived** — a probe grading the probe. It
now calls the production functions. Its second version stamped every step from
one frozen instant, which made `INSERT OR REPLACE` indistinguishable from
`INSERT OR IGNORE`; it now derives a distinct stamp per step in both halves.
Both survivors are recorded because finding them required running mutants
against the probe itself, not only against the corpus.

**Known limit, not papered over:** a mutant that removes `RELEASE SAVEPOINT` on
the SUCCESS path still survives. Final rows are identical whether or not the
savepoint was released, so neither the corpus nor the probe can see it; the
failure path's rollback IS graded. Recorded rather than left implicit.

### Scope note recorded at plateau 1

`list all` composes the persona and journey renderers DS7.US1 already ported
with the extension listing this plateau ports. The composition needs a
database, so it is graded at the front-door plateau rather than in this
golden; the extension half is graded here through `list extensions`.

### Plateau 4 — the dispatch

40 recorded cases in `ext-dispatch.golden.json`, each carrying the streams, the
exit code, AND the `ext_tools_notes` rows that exist afterwards — a dispatch
that prints the right line while the handler's write lands in a different
database is the defect this bridge could introduce, and no stream comparison
would see it. Four fixture extensions stage the branches: handlers that pin
each outcome, an extension that registers nothing, one whose `register` raises,
one whose manifest fails validation, and one whose subcommands DECLARE a
`mirror-cli-v1` runtime.

The declared fixture is the one that makes the contract path gradable at all.
Python knows nothing about `cli.subcommands[].runtime` and answers all four of
its subcommands from `register_cli`; TypeScript executes the two that declare a
runtime and falls back to the host for the two that do not. Each declared
command has a Python twin printing the same bytes — including a `rows=` count
read from the extension's own table — so a single corpus recorded from Python
grades both engines, and any drift between a declared command and its handler
fails the build.

| Fact | Measured |
|---|---|
| The installed path | `Path.__truediv__`, never normalized, and then PRINTED: `ext ../../etc ping` keeps its dots, an ABSOLUTE id discards the extensions root (`ext /etc ping` reads `/etc/skill.yaml`), `.` and `''` are the root itself, a trailing slash is dropped |
| Two exception classes, one name | `memory.cli.extensions.ExtensionValidationError(ValueError)` is unrelated to `memory.extensions.errors.ExtensionError`; a failing `register` is a printed line at exit 1, a bad MANIFEST is an uncaught traceback at the same exit code |
| `--mirror-home` | consumed as a pair from ANY position, including the extension's own tail; a trailing one with no value is not a pair and reaches the handler |
| Exit code | the handler's return value through `int()`: `3` exits 3, `"7"` exits 7, `None` raises after the handler printed |
| The listing | sorted; the docstring's FIRST line wins over the registered summary; a handler with neither is just a name; an empty registry prints `(none registered)` |
| `ext <id>` with no subcommand | is a dispatch of `--help`, not a separate command — it loads the extension like any other subcommand, so a broken `register` fails the LISTING too |
| Streams | inherited, not captured: stdout and stderr both reach the caller, interleaved as the handler produced them |

Recorded divergences, graded by class (input, stream, exit code) rather than by
bytes: a CPython traceback cannot be reproduced in TypeScript. A traceback case
records `stderr` as **null** and keeps only `stderr_final_line`, because a
traceback interleaves the INTERPRETER'S own paths and renders frames
differently after 3.10 — recording them made the determinism gate fail on the
first machine that was not this one, which is precisely the failure that gate
exists to produce. The generator is now proven identical on 3.10 and 3.12. Which shape
applies is decided by WHO refuses — the host still IS Python, so a failure it
reaches reproduces Python's traceback down to its last line (the test grades
that line); a refusal TypeScript makes before spawning is one line on stderr at
the same exit code with stdout untouched.

**Checks:** 40/40 cases equal, rows included; **seventeen mutants killed** (a
normalizing `join`, captured streams, a flattened exit code, id validation
dropped, argv truncated, the installed check removed, the host swallowing
handler streams, the database straddle guard removed, and the host dispatching
a resolved home), each asserted to have changed the file before its verdict was
believed. The contract half added eight of them: the declared path never
taken, argv truncated, the wrong cwd, a missing database path, a shell
interpreting the argv, path containment dropped, the protocol check dropped,
and the listing hijacked by a declared command. One mutant SURVIVED and is
equivalent: the listing's `"--help"` replaced by `"help"`, which
`_dispatch_subcommand` treats identically. TS suite 2,233 pass; typecheck clean; biome clean except the pre-existing `routing.ts`
warning; Python extension suite green; golden regeneration is a no-op and joins
the CI determinism gate with its own `git diff`.

**The corpus caught two defects in code that was already green:**

1. `runMigrate` (plateau 3) built its path with `join`, which normalizes, so
   `ext ../../etc migrate` would have printed a repaired path. The bindings
   golden had only ever passed a plain id.
2. The host's first version dispatched a RESOLVED mirror home, which rewrote
   every path Python prints on macOS (`/var` → `/private/var`). It now
   validates resolved and dispatches raw, with a Python test pinning it.

**A third defect, caught by CI rather than locally:** the first version of the
golden recorded whole tracebacks, interpreter paths included, so regeneration
was a no-op only on the machine that recorded it. Fixed by recording the final
line alone and verifying the generator produces identical bytes under both CI
interpreters.

**A fourth, caught by a mutant rather than by a case:** the
foreign-protocol refusal case replaced the protocol AND dropped the argv, so it
would have passed even with the protocol check deleted. Fixed to keep a valid
command, and the mutant is killed.

**Known limit, recorded:** the LEGACY request travels on the host's stdin, so a
legacy handler cannot read the user's stdin through the bridge. Measured before
choosing it — no CLI handler in any installed extension reads stdin — and the
declared path removes the limit rather than inheriting it: a declared command
inherits all three streams, which is one more reason for an author to migrate
before DS10.
