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

**Disposition (Navigator, 2026-09-24): D2 stays uniform, amended.** The
seven families move to argparse's shape deliberately, and `-h`/`--help`
answers the family's usage with exit 0 at either level, so help does not
become an error. Delivered in `ea95c1de`.

### F7 — `runtime status` spawns the interpreter for its `Python:` line

`detectPythonVersion` runs `uv run python -c …` on every `runtime status`
(the updater already bypasses it). The interpreter shadow logs it on every CI
run, and it violates the acceptance block's "no child named python, python3,
or uv". The plan does not list it. `runtime-status.golden.json` pins the line
27 times, and the golden is Python-generated, so removing the line during
plateau 2 needs the oracle's renderer changed too, or the CI determinism gate
goes red.

**Disposition (Navigator, 2026-09-24): the line leaves both engines.**
Delivered in `48b7772a`: renderer, field, and probe removed on both sides in
one commit, the golden regenerated by the oracle (27 fields and 27 lines, a
pure deletion), the drift baseline re-taken for `runtime.py` alone.

### F8 — the stale-gate diagnosis names two live controls as inert

Plateau 1's `staleRevertGateFindings` reports every non-`_REPLAY` variable
starting `MIRROR_TS_`. Two of those are not revert gates:
`MIRROR_TS_MCP_GUARDS` (the MCP wallet guards, a TS-to-TS switch) and
`MIRROR_TS_CONSULT_CONTEXT` (consult's context input). `runtime diagnose`
would tell a user to delete a variable that still does something. A prefix is
a claim about names nobody has written yet; the fix is the explicit list of
the gates D3 deletes.

**Fixed with D3** (`ceda4a02`): `RETIRED_REVERT_GATES` names the
twenty-one family gates plus the two already inert, a test proves the two
live controls are not reported, and a second test fails if any retired name
is still read or declared in `src/` (comments excluded, so the history they
record can stay).

### F9 — `mcp` reaches Python through the unknown-command fallthrough

`mcp` is one of Python's 32 names. The plugin launches the TypeScript server
directly, so the inventory counted it as served — but `cli.ts mcp` itself has
no route and reaches `python -m memory mcp`. The acceptance block requires
every one of the 32 names to answer from TypeScript. Nothing in the
repository invokes `cli.ts mcp`.

**Disposition (Navigator, 2026-09-24): route it.** `mcp` starts the
TypeScript server through the front door (`ea95c1de`) — the module the plugin
launches, not a second server — so the acceptance block's "any of the 32
top-level commands" holds as written.

---

## 5. Plateau 3 findings (2026-09-24)

Five findings, taken while deleting rather than while reading. Two were fixed
in the plateau; three stopped it at a Navigator decision, taken the same day
([plan.md — taken at plateau 3](plan.md#taken-at-plateau-3-navigator-2026-09-24)).

### F10 — `ts/src/parity/` was the harness under the verifiers slice F.2 named

F.2 listed the TypeScript entry points that compare engines
(`real_db_copy_verify.ts`, `write_parity_verify.ts`,
`schema_structural_parity.ts`). Beneath them sat their library: eleven modules
in `ts/src/parity/` — write-parity probes per family, the real-DB-copy grader,
the fixture loader and its CLI — four test files grading the harness itself,
and nine exports from the package entry point. All of it compared engines.

**Disposition: deleted with F.2** (`89300c72`). Two modules had callers outside
the harness and were test-side code, so they moved rather than died:
`golden.ts` (the hybrid-search golden loader) and `maintenanceReport.ts` (the
timing normalizer the lifecycle smoke and a test share), both to
`ts/test/helpers/`.

### F11 — Gemini assistant turns were dropped since plateau 1

**A product regression from this story, fixed here** (`a9c7ddde`). The Node
port of the Gemini `AfterAgent` hook read the assistant's text from
`response`, `assistant_message`, or `content`. Gemini's payload, and the
Python hook it replaced, name it `prompt_response`. Every Gemini assistant
turn since `bdd63e00` was dropped while the hook printed `{}` and exited 0, so
conversations looked alive with half their messages.

The plateau-1 row-diff reported the Gemini family identical, and it was — for
the cases it ran, none of which carried an `AfterAgent` payload with the real
field. `scripts/smoke_gemini_cli.sh` did, and caught it the moment it was moved
off Python: it passes with two messages at `cv22-ts5-baseline` and fails with
one at `cv22-last-python-bearing`. An audit of every field the other ported
hooks read found no second case: they read the same `prompt` and `session_id`
their Python originals read.

The lesson is the journey's own, one level down: **a comparison can only see
what both sides are given.** The row-diff graded the hooks; the payload shapes
it chose were the unexamined input.

### F12 — `pyproject.toml` has readers D1 did not know about

D1 moved version authority and checkout detection off `pyproject.toml` for the
two TypeScript readers the Pull inventory found. There are three more, all in
components US2's decision D4 re-homed to US3:

| Reader | Reads it for |
|---|---|
| `frame/main/root-resolve.js` | the Mirror root: env override, installed payload, and dev mode all test for `pyproject.toml` |
| `frame/tests/version-sync.test.js` | the Frame's version must equal the one in `pyproject.toml` — run by the Windows workflow |
| `installer/health-check.ps1`, `install.ps1`, `launcher/mirror.cmd` | the checkout marker, and the installed version |

Deleting `pyproject.toml` (F.7) makes the Frame's version test fail wherever
the Windows workflow next runs, and leaves the Frame and installer unable to
find a Mirror root. Both components already call Python (the accepted US3
window), but this is a second, different break the Plan did not name.
**Stop: F.7 waits for D11.**

**Disposition (Navigator, 2026-09-24): D11 as recommended** (`f3786782`). The
file is deleted; the one reader a workflow runs, the Frame's version test,
reads `ts/package.json`; root detection in `frame/` and `installer/` stays
with US3 and is named in the story's known risks beside the nine Python call
sites.

### F13 — the extension manifest still requires a Python entrypoint

`ts/src/extensions/manifest.ts` — a byte-for-byte port of Python's validator —
requires every `command-skill` to declare `entrypoint.module`, and requires it
to resolve to `<module>.py` in the extension directory. Since TS2 the core
never imports that file. TS2 recorded this as the reason its six inert fixture
bodies could not convert; the Plan's F.5 converts them "for the new
`entrypoint` shape" without saying what that shape is.

It also binds D7, which the Plan treats as independent: deleting
`extension.py.template` leaves the template producing command-skills the
validator **rejects**, because the file it demands is the one being deleted.
**Stop: F.5 and F.6 wait for D10.**

**Disposition (Navigator, 2026-09-24): D10 as recommended** (`9c6aad58`).
`entrypoint` is optional for a command-skill and validated exactly as before
when declared. The six fixture bodies and both Python templates are gone, and
a test fills the template in as an author would — which found a defect older
than this story: `table_prefix: ext_<id>_` breaks for the dash-separated ids
the template asks for. It has an explicit `<id_underscored>` placeholder now.

### F14 — slice C's strings bullet was never done, and it conflicts with the golden freeze

Slice C asked for "any other user-facing string naming `python -m memory` or
`uv run`" to change. Plateau 1 closed without it: the front door still tells
users to run `python -m memory …` or `uv run python -m memory …` in usage
lines and hints across nine files — `extensions`, `ext`, `list`, `inspect`,
`build` (adopt, sync-cursor, method surfaces, set-path), `consolidate` and
`shadow` review hints, `journey update`, `init`. Eight goldens recorded those
bytes from the oracle.

Changing them is right — the program they name no longer exists — but the
Plan's Non-Goals also say only D2 and the migrate verdicts change bytes on
purpose, and that exactly two goldens are hand-edited. Both cannot hold.
The staged `python-core` row reports 79 mentions today: 14 in `ts/src` (about
half of them these strings), 25 in `ts/test` (mostly those goldens), ~30 in
documentation that slice H rewrites at plateau 4. **Stop: the row's go-live
waits for D12.**

**Disposition (Navigator, 2026-09-24): D12 as recommended.** Every such string
reads `PROGRAM` (`ts/src/util/program.ts`) and says `mirror` (`02b562fe`);
seven goldens take that one substitution, 49 occurrences, listed in the
goldens README; one captured family moved, `build inspect-method`, by exactly
that line. The row went live in two halves (`20fc4e73`): `python-core` for
absence — retired paths, any tracked `.py`, any workflow installing an
interpreter — and `python-core-mentions`, staged until plateau 4.

## 6. Plateau 4 findings (2026-09-24)

Found while rewriting the documentation, which is the one place a claim about
the product sits beside no test. Four were fixed in the plateau; one needs a
Navigator decision.

### F15 — the documentation described configuration nothing reads

`docs/reference/configuration.md` was written for the local web Configuration
page, which US1 retired, and its "Active in code" lines named Python modules.
Beyond the framing, it documented the twenty-three `MIRROR_TS_<FAMILY>` revert
variables as live, and `REFERENCE.md` and `.env.example.advanced` listed three
path variables — `EXPORT_DIR`, `TRANSCRIPT_EXPORT_DIR`, `DB_BACKUP_PATH` —
that have **no reader** in the TypeScript core (`grep -w` over `ts/src`, 0
hits each). It also said `MEMORY_RECEPTION` is off unless `1`; the front door
treats it as on unless `0`, which is what `REFERENCE.md` already said.

**Disposition: fixed** (`4cf69e4e`). The reference names the file that reads
each value, and lists the inert ones in their own section, so a leftover line
in a `.env` is recognizable rather than trusted. The cutoff names them too.
`MIRROR_NODE`, added at plateau 1, was documented nowhere a user would look; it
is now in the reference, `.env.example.advanced`, getting started, and a new
troubleshooting entry.

### F16 — the guard's own table carried twenty-nine dead exemptions

Fourteen exemptions named Python files plateau 3 deleted, and fifteen named
files that no longer mention what they were exempted for. An exemption
pre-approves whatever lands at its path, so a stale one is a hole, not a note.

**Disposition: fixed** (`c7efc712`), with two self-tests that keep it fixed:
every exemption names a tracked file, and every exemption is still needed.
The second one then removed two more when the extension guides were rewritten
(`b239ee5d`).

### F17 — two claims in the engineering principles had stopped being true

"The TS core ships with zero runtime npm dependencies" — `yaml` has been one
since `seed` was ported (CV22.DS7.US1), with a named justification in its
commit. And "coverage is a ratchet": the `fail_under = 40` floor lived in
`pyproject.toml`, and the TypeScript suite measures no coverage at all.

**Disposition: fixed in the document** (`4cf69e4e`). Both now say what is
true; the missing coverage measurement is named as a gap, not restored — that
would be new scope.

### F18 — D-002 lives on in the port

The debt ledger's D-002 (journey search returns `[]` on an embedding failure)
names a Python class. The TypeScript `detectJourney`
(`ts/src/mirror/defaultResolution.ts`) was ported with the same shape: a
`catch { return []; }` around the query embedding. The debt is still true, in a
different file. **Disposition:** the ledger entry and the engineering
principles now name the TypeScript function; the debt stays carried.

### F19 — `runtime status` still counts migrations the way the oracle did

`inspectCoreMigrations` (`ts/src/runtime/status.ts`) keeps an
`ORACLE_ERA_ONLY` set holding `017_journey_parent_column`, so that a missing
database renders `unknown/16` and a database no TypeScript command has opened
yet renders `current (16/16)` — exactly as the Python oracle did. Its own
comment says the set "goes at plateau 3 with that oracle, and the honest
denominator afterwards is simply every migration this core knows". Plateau 3
did not remove it.

It is the CR095 shape — a parity choice whose only justification was the
oracle — and it changes user-visible bytes: `runtime status` on a missing
database says `unknown/17`, and on a database without 017 it says `attention
needed` and names the missing migration, which `runtime migrate` then applies.
Twenty-seven recorded cases in `runtime-status.golden.json` grade this number.

**Stop: a Navigator decision.** (a) *Recommended:* finish it inside TS5
before validation — delete the set, hand-edit the golden with the reason in
the goldens README, and replay the `runtime-status` capture family; (b)
capture it as a CR beside CR095, for the post-TS5 parity clean-up.

**Disposition (Navigator, 2026-09-24): (a).** `ORACLE_ERA_ONLY` is deleted, and
`inspectCoreMigrations` now requires every known migration — the same rule
`assertSchemaState` has applied since plateau 1, so the codebase has one
definition of a healthy ledger again. The status and diagnose fixtures' current
databases carry 017; the two goldens were hand-edited and recorded in the
goldens README; `ts_migrated` keeps the oracle's answer as the DS6 record. One
test was reversed rather than deleted: it had asserted that a database without
017 renders `current (16/16)`, and now asserts that it renders `attention
needed` naming 017. `runtime status` is not a captured family, so the replay
cannot see this change; the goldens are its grader. The schema guard's
docstring, which still told the reader to run the Python core to migrate, was
corrected in the same commit.

A sibling in the custody proof (`ts/smoke/migration_structural_parity.ts`)
carries the same "goes at plateau 3" note, and there the note was wrong rather
than the code: the frozen end-states predate 017, so the list is a fixture
fact that stays until they are re-recorded. The comment now says so.

### F20 — the clone-role guard does not recognize the production clone

Found while dry-running the Navigator walk, at step 12. `build load mirror` —
the journey whose project path is `~/dev/workspace/mirror`, the production
clone the `mirror-ts` launcher opens for `prod` — **does not refuse**. It prints
the Builder banner and exits 0. Measured on a copy of the real database:

```text
isMirrorMindCheckout(~/dev/workspace/mirror)          false
inspectBuilderCloneRole(~/dev/workspace/mirror)       null   (nothing to say)
```

The production clone is a Python-era tree: `main` at `7cfbfbb7` (2026-09-02),
with `pyproject.toml` (`name = "mirror"`), `src/memory/`, a `ts/package.json`
named `mirror-core` — and no `ts/src/frontDoor/cli.ts`, because the front door
has only ever lived on this branch. It carries no `.mirror-clone-role`, so its
role is `production` by default. The Python guard recognized it by
`pyproject.toml` + `src/memory/`. Plateau 1's D1 moved recognition to the
TypeScript package *and* its front door, which is right for every tree this
branch produces and wrong for every tree it has not reached yet — and until
CV22 releases, that is **every production clone there is**.

This is the regression D1 was written to prevent, arriving from the other
side. D1 guarded against the new tree losing its markers; nothing tested an
old tree against the new rule. Plateau 1 even pinned the gap as intended:
`cloneRoleGuard.test.ts` asserts that *"a tree with the Python markers but no
TypeScript package is not a checkout"*, so that "the move is a MOVE and not an
addition". The real production clone has a TypeScript package but no front
door, so it matches neither rule — and a Builder session started from this
dev clone can open the production clone for mutation without the refusal the
guard exists to give.

**Stop: a Navigator decision**, because the fix reverses a test plateau 1
wrote on purpose.

- **(a) Recommended: recognize both generations of the tree.** A directory is
  a Mirror Mind checkout if it carries the TypeScript markers (as now) *or* the
  Python-era ones (`pyproject.toml` declaring `mirror`, plus `src/memory/`) —
  reading a file, running nothing. The plateau-1 test flips to assert the
  refusal on exactly the shape of the real production clone, and a staged copy
  of that shape joins the corpus. The legacy half can go when no production
  clone predates the CV22 release, which is US3's to judge.
- **(b)** Accept it as a known risk until the production clone takes the CV22
  release, and say so in the story's known risks. Until then the guard is off
  for production clones, from this branch.
