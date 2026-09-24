[< Parent](../index.md)

# CV22.DS10.TS5 — Python core deletion

**Status:** 🟢 In Progress — pulled 2026-09-23; Plan panel-reviewed and
approved; plateaus 0, 1, and 2 of 5 done — **the fallback is gone; Python is
present and unreachable**. Next: tag `cv22-last-python-bearing`, then plateau 3

---

## Technical Story

In order to close the strangler,
As the TypeScript core that already answers every command,
I want the Python core, its tests, its oracle harness, its interpreter surface,
and every path that still reaches for it deleted,
So that Mirror Mind is a single-language codebase whose only runtime is Node,
and US3 can package it without shipping a second engine.

## Outcome

`git ls-files '*.py'` is empty. No workflow installs Python or `uv`. No hook,
launcher, skill, script, or source file this repository ships invokes
`python`, `python3`, `uv`, `python -m memory`, or `memory.*` internals — and a
Node guard fails CI if one returns. The front door has no fallback engine: every
route answers from TypeScript, and a name TypeScript does not own answers with
a TypeScript-owned usage error rather than a spawn. Existing `memory.db` files
keep working, migrated by the TypeScript engine as sole custodian. The three
debts assigned here are paid.

The plan is [plan.md](plan.md); the validation route is
[test-guide.md](test-guide.md).

## What The Inventory Found

Taken at Pull, 2026-09-23, against `2adf2951` — before this story's own
`index.md` existed, because the file the runtime pulled was the generated
placeholder. This is the fourth story in DS10 whose authored gate named one
layer and whose inventory found more.

### The denominator is ~110,000 lines, ten times the largest deletion so far

| Where | Files | Lines |
|---|---|---|
| `src/memory/` | 135 | 37,805 |
| `tests/` | 187 | 35,361 |
| `ts/parity/` (76 `.py`, 15 `.ts`, one baseline) | 92 | 33,593 |
| `scripts/*.py` | 5 | 906 |
| `spikes/ts-search-parity/` | 6 | 601 |
| `uv.lock` | 1 | 1,423 |
| `ts/test/fixtures/**/*.py` (inert bodies, TS2's note) | 6 | — |
| `pyproject.toml` | 1 | — |

402 tracked `.py` files. TS4, the previous record, removed ~7,700 lines.

### The runtime hooks still spawn Python — twelve files the Skill gate could not see

The [Skill Invocation Gate](../index.md#skill-invocation-gate) was satisfied by
US2: no skill invokes `uv run python -m memory`, and the guard that proves it
scans the packaged plugin "whole — manifest, commands, hooks, skills". Its
regex is `/uv run python -m memory/`. **The hooks do not say `uv run`.** They
say `python3 -m memory`, and they also call Python internals that were never
commands:

| Runtime | Files | What they invoke |
|---|---|---|
| Claude Code (`.claude/hooks/`) | `session-start.sh`, `log-user-prompt.sh`, `mirror-inject.sh`, `log-session-end.sh`; `.claude/settings.json` allowlists `python3 -m memory*` | `python3 -m memory conversation-logger …`, `python3 -m memory backup --silent`, `python3 -c "from memory.cli.conversation_logger import hook_user_prompt; …"`, `python3 -m memory.hooks.extract_prompt`, `python3 -m memory.hooks.mirror_state … needs-inject\|get persona\|get journey` |
| Packaged plugin (`plugins/mirror-mind/hooks/`) | the same four, under the CV21 contract "`memory` is installed and importable" | the same |
| Gemini CLI (`.gemini/hooks/`) | `log-user.sh`, `log-assistant.sh`, `session-end.sh` | `python3 -c` JSON extraction, then the front door |
| Codex (`scripts/codex-mirror.sh`) | one wrapper | `uv run python -m memory conversation-logger session-start\|backfill-codex-session\|session-end-pi`, `backup --silent` |
| MCP launcher (`plugins/mirror-mind/mcp/launch.sh`) | one | `exec python3 -m memory mcp` behind `MIRROR_TS_MCP=0` |

`mirror-inject.sh` spawns the interpreter up to five times per user prompt.
`memory.hooks.mirror_state` (144 lines) and `memory.hooks.extract_prompt`
(25 lines) have no TypeScript equivalent and were never in DS7's denominator
of 29, because they are modules, not commands. The Pi extension
(`.pi/extensions/mirror-logger.ts`) is clean: it spawns `node` only.

### `pyproject.toml` has two TypeScript readers, and one of them is a safety guard

- `ts/src/runtime/version.ts` — `packageVersion` walks upward for
  `pyproject.toml`'s `version =` line. It is THE version (US2 decision D2):
  the updater, release doctor, welcome card, `runtime version|status`, and
  the MCP server's `initialize` all read it. The comment says US3 re-points it
  at `package.json`; the [Zero Python gate](../index.md#zero-python-gate) says
  `pyproject.toml` is deleted in **TS5**. Both cannot hold.
- `ts/src/frontDoor/cloneRoleGuard.ts` — `isMirrorMindCheckout` identifies a
  Mirror Mind checkout as *the first directory holding both `pyproject.toml`
  and `src/memory/`*. **Deleting `src/memory/` alone silently disables the
  production clone-role guard** — the check that stops Builder from mutating
  the production clone — with no test failing, because the guard would simply
  answer "not a Mirror Mind checkout".

### The migration engine still defers to a custodian that will not exist

`ts/src/db/migrateOnOpen.ts` returns `deferredToPython` when any migration it
does not consider TS-authored is pending, and `runtime migrate` then prints
`nothing pending` with exit 0 — [D-025](../../../../debt.md#d-025--a-declined-migration-reports-success).
The TypeScript engine carries **all seventeen** known migrations
(`001`–`017`); Python carries sixteen. After this story there is no second
custodian, so "defer" is not a verdict — and the two `SchemaStateError`
messages in `schemaState.ts` that end with *"Run any Python `uv run python -m
memory` command once"* would instruct the user to run a program that no
longer exists.

### The front door has one spawn site and ~35 routes that still name Python

`cli.ts:206` is the only place the product spawns the interpreter
(`fallbackPython`). `routing.ts` (1,310 lines) resolves `engine: "python"`
for: every `MIRROR_TS_<FAMILY>=0` revert gate (sixteen families),
`transport.ts`'s `revertVar` and `incomplete_replay` composition, the
`conversation-logger` close-tail transport, and eleven **"not ported"
fallthroughs** — unknown top-level commands and unknown subcommands within
`identity`, `extensions`, `inspect`, `list`, `descriptor`, `week`, `mirror`,
`mode`, `soul`, `explore`, `build`, `tasks`, `consolidate`, `shadow`. Every
Python command has a TS route (verified: `_dispatch`'s 32 names ⊆ routing's
handled set; `mcp` is served by the plugin launcher, not the front door), so
the fallthroughs only ever reach Python's own `Unknown command` or argparse's
`invalid choice`. **That answer has no oracle after deletion.** TypeScript
must own it.

### Sixty-one goldens lose their generators

`ts/test/goldens/*.golden.json` are generated by `ts/parity/generate_*.py`
and the CI "regenerate must be a no-op" gate proves the port has not drifted
from the oracle. After this story they are **frozen fixtures**: a deliberate
behavior change means editing a golden by hand with a recorded reason. That
is the correct end state of a strangler — the oracle is gone because it was
replaced — but it must be written down where the next reader of a golden will
look.

### `scripts/` — the count is five, and three of them are guards that must outlive the deletion

`check_retired_surfaces.py` (447 lines) mechanically enforces every retirement
TS1–TS4 performed; `check_doc_links.py` (57) runs in `docs.yml`;
`build_claude_plugin.py` (41) is assigned to US3 by the gate but is a `.py`
file, so it cannot survive TS5's own done condition; `check_oracle_drift.py`
(73) dies with the oracle; `reset_sandbox_pet_store.py` (288) has **no
caller** anywhere but the worklog.

### The docs still teach the interpreter

`REFERENCE.md` (30 lines), the runtime-interface spec (32), `getting-started`
(13), the extension authoring guide (8) and testing guide (5), the development
guide (7), `AGENTS.md`/`CLAUDE.md` (4 each — *"Use `uv run` for all project
Python commands and tests"*, which this story's own Plan scaffold repeated
back as an implementation-contract line), architecture (2), engineering
principles (1). The extension template still ships `extension.py.template`
and `cli.py.template` for an Extension API that TS2 froze at `1.1` because it
is retiring.

### Thirty of 233 TypeScript test files assert Python outcomes

Route assertions (`engine: "python"`), the fallback path itself
(`fallbackRoute`, `fallbackFailureModes`, `noPythonSpawn`), the revert matrix,
the MCP launcher's Python branch, and the updater's cross-engine migrate test.
The `ts` CI job installs Python 3.12 and `uv` "for the fallback e2e".

## Known Risks Accepted At Plan

Named here rather than discovered later. Both were raised by the panel
([plan.md — Review](plan.md#review)).

### The installed-plugin hook window is broken by design between TS5 and US3

The packaged plugin's hooks resolve their Node entry from `$BASH_SOURCE`,
which is correct inside this repository and wrong for a user who installed
the plugin somewhere else. The durable fix is the npm `bin`, and that is
US3's by decision D4. So between this story and US3 the *installed*
plugin's hook path does not work — while the in-repo path, which is what
every runtime used during this migration, does.

This is acceptable only because **CV22 releases once, at the end**: no user
ever runs a build from this window. It is written down because a broken
journey that nobody named is how a migration ships a regression.

Consequence for validation: `scripts/smoke_claude_plugin.sh` either points at
the in-repo plugin, or is skipped with the reason in the step name. A smoke
that passes because it never ran the hooks is worse than one that says why it
did not run.

### `frame/` and `installer/` still call Python when this story closes

Nine call sites, re-homed to US3 by US2 decision D4. The Zero Python claim
made here is for **the repository**; the claim for **the shipped artifact**
is US3's to make. Stated in [Scope](#scope) and repeated in the cutoff.

## Decisions This Story Must Take

Recorded in [plan.md — Decisions](plan.md#decisions-this-plan-asks-the-navigator-to-take),
with recommendations. In one line each:

- **D1** — `pyproject.toml` is deleted here; version authority and checkout
  detection move to `ts/package.json` here, US3 renames.
- **D2** — the oracle-free answers: unknown command and unknown subcommand
  shapes and exit codes.
- **D3** — the `MIRROR_TS_*` revert gates are deleted; `*_REPLAY` fixture
  gates stay; stale gates are reported by `runtime diagnose`, not obeyed.
- **D4** — the hooks are rewritten over one Node entry per hook, resolved
  relative to the hook file, as `launch.sh` already does.
- **D5** — `ts/parity/` dies with the oracle; single-engine smokes move to
  `ts/smoke/`; the goldens freeze.
- **D6** — `scripts/`: two guards and the plugin builder port to Node; the
  oracle-drift check and the orphan reset script are deleted.
- **D7** — the Python extension templates are deleted with the API they
  taught.
- **D8** — D-023, D-024, D-025 are paid here.

## Acceptance Behavior

```text
Given a checkout of Mirror Mind after this story
When `git ls-files '*.py'` is run
Then it prints nothing
And no file under .github/workflows/ installs Python or uv
And `node ts/scripts/checkRetiredSurfaces.ts` passes with a `python-core` row

Given the front door on a machine with no Python interpreter on PATH
When any of the 32 top-level commands is invoked with valid arguments
Then it answers from TypeScript with the same bytes and exit code as before
And the process tree contains no child named python, python3, or uv

Given the front door on a machine with no Python interpreter on PATH
When an unknown command or unknown subcommand is invoked
Then it answers with a TypeScript-owned usage error and the exit code D2 records
And nothing is spawned

Given a real memory.db copy that is behind on one or more known migrations
When any front-door command opens it
Then the TypeScript engine applies every pending migration, backup-first
And `runtime migrate` reports `applied`, `nothing pending`, or `declined`
And `declined` exits non-zero and fails the updater's migrate stage

Given the Claude Code, Gemini CLI, Codex, and packaged-plugin hooks
When a session starts, a prompt is submitted, and the session ends
Then the same rows land in the same tables as before the rewrite
And every hook resolves its Node entry point relative to its own file

Given a user's .env still carrying MIRROR_TS_<FAMILY>=0 from the transition
When `runtime diagnose` runs
Then it names the variable as inert since CV22.DS10.TS5
And no front-door route changes because of it
```

## Scope

- Everything under [plan.md — Scope](plan.md#scope), slices A–H.
- The `frame/` and `installer/` Python call sites are **not** here: re-homed
  to US3 by US2 decision D4, because their shape depends on the npm artifact.
  The Zero Python claim for the *repository* is made here; for the *shipped
  artifact* it is made at US3.

## Out Of Scope

- Package rename, npm `bin`, publication, dist-tags, stable promotion, tag,
  release — US3 and the CV22 release gate.
- Replacing `plugins/mirror-mind/mcp/launch.sh` with an npm entry point — US3.
  This story removes its Python branch and gate only.
- Mirror Desktop. It pins to the last Python-bearing release
  ([recorded](../index.md#mirror-desktop-is-outside-the-migration)).
- Any port of a Python behavior that is not already answered by TypeScript.
  If the inventory at plateau 0 finds one, it is a stop condition, not scope.
- New behavior. The only oracle-free choices are the ones D2 records.

## Gate Items (from the [DS10 package](../index.md#zero-python-gate))

| Gate item | Where this story answers it |
|---|---|
| `git ls-files '*.py'` is empty | slice F; guard row in slice G |
| no workflow installs Python | slice G |
| no shipped artifact contains a `.py` file or a `uv` invocation | slice G for the repository; US3 for the npm artifact (`frame/`, `installer/`) |
| `ts/parity/` deleted with the oracle after the last golden is regenerated | plateau 0 regenerates; slice F deletes |
| `check_retired_surfaces.py` outlives the deletion it proves | slice B, Node port running beside the original before it goes |
| `check_doc_links.py` → TS5 | slice B |
| `check_oracle_drift.py` deleted with the oracle | slice F |
| `reset_sandbox_pet_store.py` disposition | D6: deleted, no caller |
| `ts/test/fixtures/**` six inert bodies convert | slice F, as TS2 converted the dispatch tree |
| `.github/workflows/tests.yml`, `docs.yml` Node-only | slice G |
| `pyproject.toml`, `uv.lock` | D1; slice F |

## Validation

[test-guide.md](test-guide.md). The Navigator route is the four-runtime hook
walk on a real database copy with the interpreter shadowed, plus the
unknown-command and behind-schema checks, before and after the deletion.

## Plateau Progress

Five plateaus are defined in
[plan.md — Plateaus](plan.md#plateaus); each closes with a handoff statement
in this section.

### Plateau 0 — Freeze and guard — ✅ done

**What is now true.** The two inventories are complete
([inventory.md](inventory.md)) and found **no stop condition**: every one of
Python's 32 top-level names routes to TypeScript or to a retired refusal, and
the 15 fallthroughs are argv shapes, not features. The oracle is frozen with
its closing record — Python 2091 passed, TypeScript 2578 passed,
oracle-drift clean, retired surfaces clean, skill parity clean. The
per-family capture is taken: 29 families, 29 non-empty answers, every one
deterministic, digest `fc7fde5c…`. `cv22-ts5-baseline` is pushed at
`2adf2951`.

**Slice B landed too.** All three guards are Node, each with tests, each
running beside its Python original and agreeing byte-for-byte on a clean tree
and on seeded regressions: `checkDocLinks.ts` (+26 cases carried),
`checkRetiredSurfaces.ts` (+20, and the staged `python-core` row), and
`buildClaudePlugin.ts` (+13, byte-identical output). The interpreter-shadow CI
step is wired `continue-on-error` and names plateau 2's work list on every
run.

**Four findings, all folded into the Plan.** F1: the docs-link checker's only
test is 26 Python cases, and the port as first written would have shipped
untested. F2: two dead fallback branches that TS4's `retired` route shadows,
verified by running them. F3: the unknown-subcommand answer leaks
`__main__.py`. F4: six goldens sit outside the CI determinism gate, and one of
them cannot regenerate to its own bytes.

**Evidence.** [test-guide.md — Validation Evidence](test-guide.md#validation-evidence).

### Plateau 1 — Self-sufficient — ✅ done

TypeScript now answers for itself everywhere Python used to be required, while
Python is still present to be measured against. Three commits, `b2b16955`,
`c8c74361`, `bdd63e00`.

**What is now true.**

- **Identity and version left `pyproject.toml`** (D1). `ts/package.json`
  carries `0.31.14`, matching pyproject exactly so no rendered byte moves.
  `packageIdentity.ts` holds one walk and one constant; US3 changes that
  constant. The regression this prevented is the one no test could have
  caught: `isMirrorMindCheckout` required `src/memory/`, so deleting the
  Python core would have made the **production clone-role guard answer "not a
  checkout" and stop refusing**, silently.
- **TypeScript is the sole migration custodian, and D-025 is paid.**
  Migrate-on-open applies every pending migration rather than deferring;
  `TS_AUTHORED_MIGRATION_IDS` is deleted, not shrunk; `runtime migrate` has
  three verdicts and exits non-zero on `declined`, which turns the updater's
  migrate stage from passing to failing on a database nothing migrated.
  `assertSchemaState` tightened to match, safe because `ensureDatabaseReady`
  runs before it on every serving path.
- **Every runtime hook is Node** (D4). Twelve wrappers, one entry point,
  generated from one template. `mirror_state` and `extract_prompt` are gone as
  Python modules. `launch.sh` lost its `MIRROR_TS_MCP` gate and Python branch.
  The Claude allowlist is scoped **by path**, never `Bash(node *)`. Node
  resolution is explicit and its absence is logged, because `|| true` was safe
  for an interpreter that is always present and is not safe for one that often
  is not.

**Evidence.** Hook row-diff **10/10 identical** across both families and five
cases (happy, muted, empty prompt, missing session id, cp1252). Per-family
capture **29/29 identical** to the pre-TS5 baseline after each of the three
commits. Fixture-graded custody proofs pass with no Python: migration
structural parity 334/334, bootstrap custody PASS. Suite 2677 passed; CI green
on both platforms at every commit.

**What is intentionally undone.** Everything plateau 2 owns. Nothing is
half-applied: each of the three pieces is complete and independently
revertible.

**One cost accepted, measured not asserted.** `mark-injected` now takes the
front door's verified pre-write snapshot, which Python's ungated write did
not: **95 ms** on a real 53 MB database, on the one prompt per Mirror Mode
session that owes an injection. The ordinary turn returns before opening a
writable handle. Revisit if it is ever felt.

**Next plateau.** Plateau 2 — the fallback goes. The shadow step already names
the work: **five tests, seven spawn attempts**, not the thirty test files the
inventory estimated.

### Plateau 2 — Unreachable — ✅ done, 2026-09-24

It stopped once, at the Plan's first stop condition, and resumed on the
Navigator's four decisions (recorded in [plan.md](plan.md#taken-at-plateau-2-navigator-2026-09-24)).
Twelve commits, `ea619df5` to the handoff.

**What is now true.**

- **Nothing reaches for the interpreter.** `fallbackPython`, its timeout knob,
  the twenty-one `MIRROR_TS_<FAMILY>` revert gates, `revertVar`,
  `liveBlockedBy`, the `"python"` transport mode, and the logger's
  `{ handled: false }` hand-back are deleted; `FrontDoorEngine` is `"ts"`
  alone. The interpreter-shadow CI step is **required**, and its verdict
  includes an **empty stub log**, not only a passing suite: 2650 passed, 3
  skipped (the opt-in extension-Python shim suite), **0 spawn attempts**.
- **TypeScript owns every answer** (D2). An unknown command gets the front
  door's usage (stdout, exit 1); a family's unknown or missing subcommand gets
  argparse's shape with the family's own name (stderr, exit 2) — US2's
  `runtime` renderer, generalized byte-for-byte; `-h`/`--help` answers the
  usage with exit 0. A third before-dispatch route, `usage`, sits beside
  `retired`. `mcp` routes to the TypeScript server (F9).
- **Flag-first invocations answer from TypeScript** (F5). `argvShape.ts`
  moves a family's leading options after its subcommand once, before
  routing, for the seven families whose oracle accepts them. It also closed
  two silent writes on routes that were already TypeScript: `tasks
  <options> add|done|…` printed the list, and `journey <options> update`
  rendered a status read. Proven pairwise against Python: 26/28 identical,
  2 named deviations, 0 spawns.
- **Half a replay fixture is refused by name** in every family, one line and
  exit 2. A plain family used to route it to Python, which had no replay
  transport and would have called the live provider.
- `runtime status` has no `Python:` line (F7), on both engines, the golden
  regenerated. `runtime diagnose` names the retired gates by an **explicit
  list** (F8): two live controls the prefix match called inert —
  `MIRROR_TS_MCP_GUARDS`, `MIRROR_TS_CONSULT_CONTEXT` — are no longer
  reported, and a test fails if a retired gate is still read in `src/`.
- **D-023 and D-024 are paid**, each on both engines with a pure-deletion
  golden regeneration; **D-025** (paid at plateau 1) is closed in the ledger,
  which still read "Carried".
- The skills, the Pi extension, and the regenerated plugin stop offering
  reverts and a timeout that no longer exist. `route_matrix.ts` and
  `ts4_home_copy_route.ts` are deleted; `conversation_lifecycle_smoke.ts`
  dropped the steps that proved Python could read TypeScript's writes — the
  property that made a revert safe — and grades the archive with the
  product's own verifier.

**Evidence.** [test-guide.md — plateau 2](test-guide.md#plateau-2--the-fallback-is-gone).
Per-family capture replayed against plateau 0: **27/29 identical**, and both
differences explained — `unknown-command` is D2 by design; `build-pull-candidates`
reads the repository's roadmap, which moved (TS5 left "Planned"), and the
plateau-0 engine renders the same bytes as today's against today's docs.

**What is intentionally undone.** Everything plateau 3 owns. Python is still in
the tree, unreachable — the recovery point is one tag away.

**Found and captured, not fixed:** [CR096](../../../../refinement/rs009-cv22-front-door-routing-correctness/cr096-conversations-lists-instead-of-appending-when-options-come-first.md)
— `conversations <options> append` renders the listing and drops the payload;
the oracle rejected that shape, so it is a TypeScript leniency, not a parity
gap.

**Two lessons, both paid in this plateau.** *An equality check is satisfied by
two things that did not happen*: the flag-first harness reported clean twice
before it was right — both engines on an empty `memory_test.db`, then both
exiting 127 because `env` cannot exec a shell function — and each row now
reports whether the invocation changed its copy, with 126/127 a harness
failure. *The retired-surface sweep reads the git index*: a test that spelled
out a retired flag passed locally while untracked and turned CI red on push,
on both guards at once; the suite now runs after staging, and the docs link
check joined the pre-commit set when it caught a link to a deleted script.

## Where To Resume

**Plateau 2 is done; nothing is in flight.** Before plateau 3's first deletion:

1. push, and tag **`cv22-last-python-bearing`** at the last plateau-2 commit
   (annotated, pushed) — the recovery point the Plan names; record its commit
   SHA here and in `decisions.md`;
2. confirm CI green on both platforms, the now-required shadow step included.

Then plateau 3, in the Plan's order (F, one commit per row; then G):

- F.1–F.7 as written, plus three things plateau 2 found:
  `scripts/ts5/flag_first_pairwise.sh` and `hook_rowdiff.sh` go with the
  Python they compare against; `extensionCatalogRouting.test.ts` **reads
  `src/memory/cli/ext.py` and `extensions.py`** to audit its allowlists and
  needs a disposition (freeze the audited literals); and CI's
  `MIRROR_TEST_EXTENSION_PYTHON` goes with the shim template (D7).
- G: port `generate_demo_memory_db.py` first — `smoke_runtime_update.sh`
  still generates its database with it, which is why the `ts` job still
  installs `uv`.
- The plateau-3 replay: `build-pull-candidates` (and any family that reads
  repository documents) is compared by the **controlled method** — the
  plateau-2 engine from a worktree at the tag and HEAD, against the same
  docs — not against the plateau-0 hash, because the roadmap will have moved
  again.

Standing instruments: `bash scripts/ts5/capture_family_outputs.sh
"$PWD/tmp/ts5/pristine.db"` (latest: `tmp/ts5/capture-plateau2.tsv`). The
pristine copy is local and gitignored; recreate it from the real database if
the tree is cleaned.
