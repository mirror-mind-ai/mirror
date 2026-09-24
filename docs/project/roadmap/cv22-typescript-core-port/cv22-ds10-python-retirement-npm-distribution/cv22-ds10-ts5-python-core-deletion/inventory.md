[< Story](index.md)

# Inventory — CV22.DS10.TS5, plateau 0

Slice A's two inventories, taken 2026-09-23 against `2adf2951`, before any
deletion. Both are stop-condition detectors: the first asks whether any
assertion dies without a carrier, the second whether any route reaches Python
for a reason the plan did not anticipate.

**Verdict: no stop condition.** Three findings that change the plan are
recorded below and have been applied to [plan.md](plan.md).

---

## 1. Python tests that grade a TypeScript contract

Seventeen Python test files mention a `ts/` path or a golden. Eleven are false
positives — `rg` matching `tests/unit/...` inside the string `ts/unit/...`, or
a docstring naming a sibling Python test. **Six** genuinely grade a
TypeScript-side artifact:

| Python test | What it asserts | Carrier after deletion |
|---|---|---|
| `tests/unit/test_ts_schema_contract.py` (42) | Python `MIGRATIONS` is a **prefix** of TS `KNOWN_MIGRATION_IDS` — a new Python migration cannot land without extending the TS list | **None needed.** The guard exists to stop *Python* from drifting ahead of TS. With no Python migrations, there is nothing to drift. Recorded, not carried. |
| `tests/unit/memory/db/test_schema_inventory_snapshot.py` (94) | `ts/src/db/schemaInventorySnapshot.ts` still matches a freshly-created **Python** database's inventory | **Half carried.** `ts/test/db/schema.test.ts` already asserts a TS-created database equals the snapshot, hermetically. The Python half dies with its oracle; the snapshot becomes a **frozen fixture** and its header comment must be rewritten (it currently names the Python regeneration command as the way to update it). Same treatment as the 61 goldens. |
| `tests/unit/memory/db/test_migration_fixtures_snapshot.py` (86) | The committed migration-transition fixtures have not drifted from `ts/parity/generate_migration_fixtures.py` | **Carried** by `ts/test/db/migrationFixtures.test.ts` and `migration_structural_parity.ts` — both kept (panel amendment). The generator is Python and dies; the fixtures it generated are exactly what the survivors grade against. |
| `tests/unit/memory/test_docs_lint.py` (250, **26 cases**) | The behavior of `scripts/check_doc_links.py`: slugify rules, anchor computation, fenced-code stripping, missing target/anchor detection, template exemptions, repo aggregation, parity-fixture skipping | **No carrier, and the plan did not name one.** See finding F1. |
| `tests/unit/memory/test_oracle_drift.py` (119) | The behavior of `scripts/check_oracle_drift.py` | **None needed** — dies with the oracle it guards. |
| `tests/conftest.py` (121) | Shared fixtures | Dies with the suite. |

### F1 — the docs-link checker's only test is in Python

`scripts/check_doc_links.py` is 57 lines with a single `main`; its real
specification is the **26-case self-test** in `tests/unit/memory/test_docs_lint.py`
— slug punctuation rules, duplicate-heading disambiguation, line-count
preservation when stripping fences, the roadmap-template placeholder
exemption and its deliberate non-extension to `index.md` outside templates,
and the parity-fixture skip.

Slice B said "port `check_doc_links.py` to `ts/scripts/checkDocLinks.ts`, same
side-by-side commit". Ported as written, the Node checker would ship with
**zero tests**, and the docs gate — which this very story leans on while
rewriting ten documentation files — would become unverified at the moment it
is needed most.

**Applied to the plan:** the port carries all 26 cases as
`ts/test/scripts/checkDocLinks.test.ts`, written before the port passes CI.
The same question was asked of `check_retired_surfaces.py` (447 lines): it has
**no** Python self-test, so its Node port's tests are new work either way —
the side-by-side agreement run is what grades it, and that was already in the
plan.

---

## 2. Every `engine: "python"` outcome, classified

40 sites in `routing.ts`, plus 2 in `transport.ts`. Classification as slice A
requires — revert gate, transport revert, unported-argv fallthrough, or
**something else**:

| Class | Count | Disposition at slice D |
|---|---|---|
| **Revert gate** (`MIRROR_TS_<FAMILY>=0`) | 21 | Deleted with the gate (D3) |
| **Unported-argv fallthrough** (unknown command, unknown subcommand, unknown verb/target/action) | 15 | Becomes the TS-owned answer (D2) |
| **Transport revert** (`transport.reason`, the close-tail composition) | 2 + 2 | Deleted with `revertVar`; `liveBlockedBy` is already inert (no spec sets it) |
| **Dead — shadowed by the `retired` route** | 2 | Deleted outright; see F2 |
| **Degenerate** (`argv` empty, `reason: "no command"`) | 1 | Becomes the usage answer (D2) |

### F2 — two dead fallback branches TS4 left behind

Verified empirically, not by reading:

```
$ conversations --metadata-backfill-preview
Mirror: 'conversations --metadata-backfill-preview' was removed in the CV22 migration.
$ build refinement-story pull
Mirror: 'build refinement-story pull' was removed in the CV22 migration.
```

`retiredSurfaceFor()` matches at line 547, **before dispatch**. So:

- `routing.ts:693–699` — the `DS10_BACKFILL_FLAGS` → `engine: "python"` branch
  is unreachable: retired-surface rows 4 and 5 already claim both flags.
- `routing.ts:1166–1175` — the Workbench branch's `known` arm
  (`build refinement-story|change-request <known action>` →
  `"retires unported in DS10"`) is unreachable for all twenty leaves: the
  `build ${family} ${verb}` rows claim them.

Neither is a stop condition — no behavior is missing — but both are the
journey's own recurring shape: **residue hides in the callers, not the deleted
file.** TS4 added the `retired` route and did not remove the fallbacks it
superseded, and nothing failed, because a shadowed branch is invisible to
every test that goes through the front door.

**Applied to the plan:** slice D deletes both explicitly rather than letting
them disappear inside the `FrontDoorEngine` type change, and the Node
retired-surface guard gains a check that no route returns an engine for an
argv shape a retired row already claims — so the next story cannot re-create
the pattern.

The `known` branch's *unknown* arm is **not** dead: `build change-request
frobnicate` reaches Python today.

### F3 — the unknown-subcommand answer leaks the interpreter's filename

```
$ build change-request frobnicate
usage: __main__.py [-h]
                   {load,inspect-method,adopt,prepare-templates,...}
exit=2
```

Python's argparse prints **`__main__.py`** as the program name — an internal
Python filename, surfaced to every user who mistypes a subcommand. D2 already
decided TS owns this answer at exit 2; this fixes the program name as a
side effect rather than reproducing it.

**Applied to the plan:** D2's recorded answer names the command family
(`mirror build change-request`), and the decision entry notes that *not*
reproducing `__main__.py` is deliberate — the one place where oracle-free
means better, not merely different.

---

## 3. Six goldens the determinism gate never checked

Found by running slice A's evidence, not by reading: regenerating all 65
generators changed exactly one committed golden.

### F4 — `task-import-sync.golden.json` records a random temp path, and nothing gates it

```diff
-  "error_message": "File not found: /var/folders/5k/…/T/tmphc2oqbik/does-not-exist.md",
+  "error_message": "File not found: /var/folders/5k/…/T/tmpyl83qq8r/does-not-exist.md",
```

The generator builds the fixture in a `mkdtemp()` directory and the absolute
path lands in the golden, so the file **cannot** regenerate to its own bytes
on any machine, including the one that wrote it.

It was invisible because **the CI determinism gate lists 58 of the 65
generators**. Seven are outside it:

| Generator | Deterministic on regeneration? | Note |
|---|---|---|
| `generate_cluster_golden.py` | yes | ungated, but stable |
| `generate_slug_golden.py` | yes | ungated, but stable |
| `generate_task_parse_golden.py` | yes | ungated, but stable |
| `generate_task_store_golden.py` | yes | ungated, but stable |
| `generate_week_view_golden.py` | yes | ungated, but stable |
| `generate_migration_fixtures.py` | n/a | separately guarded on both sides |
| `generate_task_import_sync_golden.py` | **no** | F4 |

And the field is **dead data**: `ts/test/tasks/taskImportSync.test.ts` builds
its own `missingPath` and asserts the message shape, so the golden's
`error_message` for that scenario is recorded and never compared.

**Not a stop condition.** No oracle drifted; no behavior differs; the story's
assumption is unharmed. It is a fixture defect, and it matters here for one
reason: **at plateau 3 the goldens freeze.** Frozen as-is, this file keeps one
machine's temp directory in the repository permanently, and the goldens
README would be telling future readers that these files are authoritative.

**Applied to the plan:** slice F.5 normalizes that field to a stable
placeholder before the freeze, and the goldens README records the six ungated
generators as the reason the drift went unseen. The working tree was left
clean — the regeneration was reverted, not committed.

## What this inventory did not find

- **No Python behavior without a TypeScript answer.** Every one of the 32
  top-level names routes to TS or to a retired refusal; the 15 fallthroughs
  are argv shapes, not features. *(Corrected at plateau 2 — see
  [F5](#f5--valid-flag-first-invocations-reach-python-through-the-fallthroughs)
  and [F9](#f9--mcp-reaches-python-through-the-unknown-command-fallthrough):
  some of those argv shapes are valid invocations, and one of the 32 names
  reaches Python.)*
- **No golden without a generator** other than the 61 already known.
- **No test whose assertion disappears silently** — the six above are each
  carried, explicitly retired, or converted to a frozen fixture.

Plateau 0's remaining slice-A work — the final parity evidence, the
per-family capture, the recovery tag — is recorded in
[test-guide.md](test-guide.md) as it is produced.

---

## 4. Plateau 2 findings (2026-09-24)

Taken before writing D2's answers, by running every fallthrough on **both**
engines against a generated demo home — the measurement slice A classified by
reading. **F5 is a stop condition** under the Plan's first rule: a Python
behavior TypeScript does not answer. It is a routing gap, not a missing port,
and that is what the evidence below establishes.

### F5 — valid flag-first invocations reach Python through the fallthroughs

Five families accept options **before** the subcommand in Python — `week`'s
own usage line documents it (`week [--mirror-home PATH] [view|plan <text>|save]`).
Routing reads `argv[1]` as the subcommand, sees `--mirror-home`, and classifies
the invocation as an unported argv shape. So today these valid invocations are
answered **only by Python**, and D2 as written would turn each into a usage
error.

TypeScript already produces the same bytes for every one of them once the
same options come after the subcommand — measured pairwise, stdout, stderr and
exit code:

| Python, flag-first | TypeScript, same options after the subcommand |
|---|---|
| `extensions --mirror-home H` / `extensions --mirror-home H list` | identical |
| `list --mirror-home H personas` / `journeys` / (no target) | identical |
| `descriptor --mirror-home H list` | identical |
| `week --mirror-home H view` / `week --mirror-home H` | identical |
| `inspect --mirror-home H persona <id>` / `extension <id>` | identical |
*(The first draft of this table had a `list --verbose` row reading "Python
crashes". It did — because the probe's shell carried a `MIRROR_USER` that
conflicted with the probe's `MIRROR_HOME`. In a hermetic environment the two
engines answer identically. Corrected here rather than silently removed: the
probe was wrong, not the engine.)*

Two families already on TypeScript are worse, because routing sends the
flag-first form to the **wrong TypeScript route**:

- **`tasks --mirror-home H add "x"` creates the task in Python, while
  TypeScript prints the task list, exits 0, and writes nothing** — and the
  same for `done`, `doing`, `block`, and `delete`. The leading-flag rule
  (`argv[1]` starts with `--` → list) was written for `tasks --journey x`,
  and it swallows every subcommand that follows a flag.
- **`journey --mirror-home H update <slug> <content>` updates the journey in
  Python and renders a status read in TypeScript.**

That is the CR055 shape — a write silently answered as a read — live since
DS7.US1/US2. No shipped skill uses the flag-first form, which is why nothing
noticed.

**Disposition (Navigator, 2026-09-24): fixed here, while the oracle can still
grade the fix.** `frontDoor/argvShape.ts` rewrites a family's leading options
to after its subcommand once, before routing, so the router and every handler
read one shape; options alone mean the oracle's default subcommand. Only
options each oracle parser declares before its subcommand move — families
whose oracle rejects a leading option keep their own answer. Proven pairwise
against Python: [test-guide — flag-first pairwise](test-guide.md#plateau-2--flag-first-pairwise-pre-deletion).

Two oracle quirks are deliberately not reproduced: argparse lets the `tasks`
subparser's defaults overwrite the parent's `--journey`/`--status`, so
`tasks --journey x add "t"` creates a task with **no** journey and
`tasks --status done list` lists **open** tasks. TypeScript keeps the value
the user typed — the stance `runTasksRead` already documented for `list`.

Not the same class, and captured separately rather than widened into this
fix: `conversations --mirror-home H append …` is **rejected** by Python
(exit 2), while TypeScript renders the listing, exits 0, and discards the
payload on stdin — the TypeScript listing is lenient where the oracle is
strict.

### F6 — D2's "confirmed" covered the argparse families only

D2 records that exit codes 1 and 2 were *measured, not inferred*. They were
measured for the top level and for argparse families. Seven families answer an
unknown subcommand differently:

| Family | Python, unknown subcommand | Python, no subcommand |
|---|---|---|
| `identity` | usage on **stdout**, exit **1** | usage on stdout, exit **0** |
| `extensions`, `inspect`, `list` | one usage line on **stdout**, exit **1** | `inspect`: same; the others default to a listing |
| `consolidate`, `shadow` | `Unknown subcommand: X` on stderr, exit **1** | usage on stdout, exit 1 |
| `conversation-logger` | **nothing at all, exit 0** | nothing, exit 1 |
| `descriptor` | argparse, exit 2 | help on stdout, exit 1 |
| `tasks`, `week`, `mirror`, `mode`, `soul`, `explore`, `explore story`, `build` | argparse (`usage: __main__.py …`), stderr, exit **2** | argparse `required`, exit 2 |

D2's uniform answer (usage on stderr, exit 2) is argparse's shape and the
majority one, and US2 already gave `runtime` exactly that shape. Adopting it
changes the exit code or stream for the seven families above — in error
paths only, and in `conversation-logger`'s case replacing a silent success
with an error.

### F7 — `runtime status` spawns the interpreter for its `Python:` line

`detectPythonVersion` runs `uv run python -c …` on every `runtime status`
(the updater already bypasses it). The interpreter shadow logs it on every CI
run, and it violates the acceptance block's "no child named python, python3,
or uv". The plan does not list it. `runtime-status.golden.json` pins the line
27 times, and the golden is Python-generated, so removing the line during
plateau 2 needs the oracle's renderer changed too, or the CI determinism gate
goes red.

### F8 — the stale-gate diagnosis names two live controls as inert

Plateau 1's `staleRevertGateFindings` reports every non-`_REPLAY` variable
starting `MIRROR_TS_`. Two of those are not revert gates:
`MIRROR_TS_MCP_GUARDS` (the MCP wallet guards, a TS-to-TS switch) and
`MIRROR_TS_CONSULT_CONTEXT` (consult's context input). `runtime diagnose`
would tell a user to delete a variable that still does something. A prefix is
a claim about names nobody has written yet; the fix is the explicit list of
the gates D3 deletes.

### F9 — `mcp` reaches Python through the unknown-command fallthrough

`mcp` is one of Python's 32 names. The plugin launches the TypeScript server
directly, so the inventory counted it as served — but `cli.ts mcp` itself has
no route and reaches `python -m memory mcp`. The acceptance block requires
every one of the 32 names to answer from TypeScript. Nothing in the
repository invokes `cli.ts mcp`.
