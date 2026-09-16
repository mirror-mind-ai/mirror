[< Story](index.md)

# Test Guide — CV22.DS7.US8 — Builder/Ariad tree

## Automated Validation

Five golden corpora, generated from Python and regenerated as a no-op in the
determinism gate under 3.10 and 3.12 (`TZ=UTC`, offline, demo database only):

| Corpus | Grades | Generator |
|---|---|---|
| Surface | every wrapped and unwrapped `build` render × absent optionals × over-long tokens × CJK / combining marks / NBSP / ideographic space × the `body`-vs-`body + "\n"` call-site split | `ts/parity/generate_builder_surface_golden.py` |
| Cursor transitions | ordered sequences of the full `runtime_sessions` row (all columns, `updated_at` injected) for the story lifecycle, the DS lifecycle, every D3 refusal, each receipt-invalidation reason, receipt drop rules, CAS conflict | `ts/parity/generate_builder_cursor_golden.py` |
| Roadmap parsing | snapshot, candidates, position, story-directory resolution, duplicate headings, both grammars, `legacy/` exclusion, candidate tables (4-col, 5-col, malformed), `/`-chained titles, status glyphs | `ts/parity/generate_builder_roadmap_golden.py` over `ts/parity/fixtures/builder-roadmap/` |
| Artifacts | files written into a scratch project by Plan, Expand, closure, DS Plan, and `prepare-templates`, byte for byte; the preservation rule; folder derivation; the path-confinement matrix; the DS Done preflight | `ts/parity/generate_builder_artifact_golden.py` |
| `load` | the D3.16 scenarios × adopted/unadopted × active-item/none × canonical-index/legacy-Workbench × previous-conversation/none, under replay fixtures; the degraded path; the `llm_calls` ledger rows | `ts/parity/generate_builder_load_golden.py` |

Unit tests close to the code: the argparse refusal matrix (D3.17) — one test
per argument, same inputs, exit 2; the two-level allowlist including all
twenty named Workbench refusals; `MIRROR_TS_BUILD=0`; the provider-isolation
test (26 leaves never reach `resolveFamilyProviders`); the front-door
redaction test (`--why-now`, `--objective`, `--summary`, `--evidence`,
`--debt`, `--limit`, review and validation prose never reach
`front-door.log`; `leaf=` and `calls=` do); the broken-core drill under a
Node loader hook.

Real-DB-copy probes in `ts/parity/real_db_copy_parity.py`:
`builder_cursor_state`, `builder_artifacts` (scratch project),
`builder_load` (replay).

Smokes through the real front door on a disposable home and a scratch
project, both engines, **no gate in the environment**, asserting stdout,
stderr, exit code, the cursor row after every step, the written artifacts,
and the published `operational.json`:

1. Story lifecycle: adopt → prepare-templates → sync-cursor → load →
   pull-candidates → pull-item → prepare-item → plan-item →
   check-implementation → approve-plan → validate-item → review-item →
   coherence-item → done-item → load.
2. Delivery Story flow: set-flow-unit → pull-item (DS, Expand) → child pull →
   plan-delivery-story → approve-delivery-story-plan →
   validate-delivery-story → review-delivery-story → done-delivery-story
   (preflight refusal, then success).
3. Authority and cadence: plan-item --preauthorize-approval → mismatch on a
   coordinate change → cancel → set-cadence accelerated → plan-item →
   approve-plan --use-preauthorization → continue-lifecycle refusing in
   stepwise → release-intent inspect/set.

Each smoke exercises at least one refusal through the process boundary.

Regression in the flip checklist: `conversation_lifecycle_smoke.ts`, the
Explorer smoke, `welcome --status-line` after a `load`, the full TS suite,
the Python suite, `.pi` typecheck, oracle-baseline green.

## E2E Decision

**Required.** Builder is a lived mode, and the self-hosting property — a
complete Ariad lifecycle executed on the ported engine, indistinguishable to
the Navigator — is only observable by running this story's own closure
through the TS front door after Validation is accepted.

## Navigator Validation

In order, on the real home:

| Step | Command(s) | Expected observation | Pass | Fail |
|---|---|---|---|---|
| 1 | `inspect-method ariad`, `inspect-method --journey mirror-ts-core`, `pull-candidates --method ariad --journey mirror-ts-core`, `check-implementation --method ariad --journey mirror-ts-core` — both engines, diffed | Byte-identical stdout, stderr, exit code | identical | any byte |
| 2 | `build load mirror-ts-core --session-id <disposable>` on **two fresh copies** of the real database, one per engine | Identical banner, transition, resume surface, context, trailer; same six entries in the ranked block | identical outside the block, same entries inside | any surface difference or a different entry set |
| 3 | Full story lifecycle on a copy of the real database and a scratch clone of this repository, both engines, cursor row diffed after every step: `scripts/smoke_builder_real_copy.sh --source-db ~/.mirror-minds/<user>/memory.db` | Diff-clean at every step, artifacts identical | diff-clean | any cursor-row or artifact difference at any step |
| 4 | `backup`; restore the dated zip into a scratch home and `build load` there; then this story's own `review-item`, `coherence-item`, `done-item` through the **TS front door**, each dry-run on a copy against Python first | Restore works; each dry-run diff-clean; the real cursor advances on TS with identical surfaces | diff-clean and cursor advances | any difference, or a cursor that Python cannot then read |
| 5 | A live Pi Builder session after the flip: `/mm-build mirror-ts-core`, then `pull-candidates`, then `build change-request capture --title x --body y` | Unchanged experience; `front-door.log` shows `build ts leaf=…`, no `fell_back`, no argument text; the Workbench line says `python` with the DS10 reason | as described | `fell_back`, argument text in the log, a TS answer for a Workbench leaf |
| 6 | `MIRROR_TS_BUILD=0` on `pull-candidates`; then review the CI output of the broken-core drill | Identical output, Python in the log; drill green | identical and green | any difference; drill red |

Providing this route is not acceptance. Validation passes only when the
Navigator has run steps 1–6 and accepted them explicitly.

## Validation Evidence

Plateau 8 automated evidence:

- TypeScript suite: 2,212 tests discovered; the provider-isolation regression
  found while promoting the lazy boundary was corrected by keeping `load.ts`
  outside `builder/index.ts` and rerun green.
- `tsc --noEmit`: clean.
- Builder lifecycle smoke through the real front-door process: **331/331**.
- Conversation/logger + Soul + Explorer regression smoke: green.
- `builder_cursor_state` and `builder_artifacts` write probes: `match: true` on
  the portable demo database; `builder_load` remains the already-green
  1536-wide real-corpus probe and correctly refuses the 8-wide demo.
- Broken-core loader-hook drill: enabled Builder fails at the injected boundary,
  `MIRROR_TS_BUILD=0` reaches Python, unrelated TypeScript command still answers.
- Front-door redaction: all prose-bearing Builder options and the briefing-derived
  `load` query are absent from the log; only `leaf=`, `calls=`, and category
  metadata appear.
- Python unit/integration suite: **2,761 passed**; Ruff and Python formatting
  clean. Repository-wide mypy remains at its pre-existing baseline of 131 errors
  across 29 files; none is in this plateau's changed Python file.
- Oracle-drift tripwire: clean after registering `cli/build.py` and every
  in-scope Builder module; documentation links and roadmap headings clean.

### Navigator route, steps 1–3 and 6 — run 2026-09-16 on the real home

The Driver ran the route and recorded the observations below; **acceptance is
the Navigator's**, and it authorizes plateau 9 explicitly or not at all.

**Step 1 — read-only, both engines, real home.** Python via `uv run python -m
memory build …`; TypeScript via `MIRROR_TS_BUILD=1 node --env-file=.env
ts/src/frontDoor/cli.ts build …`. stdout, stderr, and exit code compared
byte for byte:

| leaf | exit (py / ts) | stdout | verdict |
|---|---|---|---|
| `inspect-method ariad` | 0 / 0 | 4,372 B | identical |
| `inspect-method --journey mirror-ts-core` | 0 / 0 | 134 B | identical |
| `pull-candidates --method ariad --journey mirror-ts-core` | 0 / 0 | 17,100 B | identical |
| `check-implementation --method ariad --journey mirror-ts-core` | 1 / 1 | 1,321 B | identical |

`front-door.log` carried `build ts exit=0 leaf=inspect-method`,
`leaf=pull-candidates`, and `exit=1 leaf=check-implementation` — leaf names
only. The guard's exit 1 is the real cursor's truth, not a defect: see the
cursor finding below.

**Step 2 — `load`, live, on two fresh copies of the real database (51 MB,
snapshotted once with `sqlite3 .backup`, one copy per engine), disposable
session id `nav-step2-disposable`.** All four faces agreed:

- streams: stdout **39,250 B byte-identical** (banner, transition,
  `■ BUILDER RESUME`, context, ranked block, `project_path=` trailer), stderr
  134 B identical, exit 0 both — the ranked block itself matched, not only
  its entry set;
- `runtime_sessions`: the same row for the disposable session
  (`Builder Mode`, `mirror-ts-core`);
- ledger: two `embedding` rows each, `openai/text-embedding-3-small`, 102
  prompt tokens, $0.000002 per call — $0.000008 for the whole step; no close
  tail fired, because a fresh session id has no previous conversation;
- access: the same 7 memories bumped (`use_count` / `last_accessed_at`) and 10
  `memory_access_log` rows added in both copies.

**Step 3 — full story lifecycle on a copy of the real database and a scratch
clone of this repository, both engines.** `scripts/smoke_builder_real_copy.sh
--source-db ~/.mirror-minds/vinicius-ts/memory.db`. Eight steps, four faces
each (streams + exit, cursor metadata bytes, closure artifacts in the clone,
projection receipts): **diff-clean at every step**. The cursor advanced
`prepare → plan → plan_approved → validation_passed → review_complete →
coherence_complete → done_complete` with the same bytes on both engines; four closure artifacts
(`validation.md`, `review.md`, `coherence.md`, `done.md`) were written
identically into both clones; six projection receipts published in each. The
harness bites: a mutant that dropped `--objective` in the TS `plan-item`
mapping was reported at step 2 and the script exited 1. The real cursor was
not touched (still `prepare`, `updated_at 2026-09-15T08:59:25Z`).

**Step 6 — revert.** `MIRROR_TS_BUILD=0` and gate-absent `pull-candidates`
through the front door: stdout identical to Python's, empty stderr, exit 0,
`build python exit=0` in the log. CI run `35071663728` (green on all five
jobs): the broken-core drill passed on ubuntu and macOS, the redaction tests
passed on both, and the parity job reported the lifecycle smoke 331/331.

**Cursor finding (process, not parity).** The real cursor reads
`last_delivery_event: prepare`, `cursor_generation: 16`, updated
2026-09-15T08:59:25Z — where plateau 1 recorded `plan_approved / gen 16` for
the same item. `prepare_lifecycle_item` writes `last_delivery_event="prepare"`
and `active_checkpoint=None` unconditionally, so the resume session's
`prepare-item` on 2026-09-15 silently demoted the approved Plan. Both engines
reproduce this (step 3 starts from exactly that state). Consequence for step
4: this story's real closure must re-run `plan-item` and `approve-plan` (the
latter is a Navigator act) through the TS front door before `validate-item`.
Recorded as a debt candidate in `plan.md`.

**Navigator acceptance of steps 1–3 and 6: given 2026-09-16**, with the
plateau-9 flip authorized in the same breath. The flip landed as commit
`2a597fc5`.

### Step 4 — the self-hosting closure, in flight on the flipped route

Run 2026-09-16 after the flip, with no gate in the environment:

- **`backup`** through the front door: `memory_20260916_112816.zip` (17,072
  KB), `backup ts exit=0` in the log.
- **Restore drill:** the zip restored into a scratch home
  (`pragma integrity_check` → `ok`), then `build load mirror-ts-core
  --session-id restore-drill` against it through the front door: exit 0, the
  full session start (39,250 B, the same size as step 2's), `build ts exit=0
  leaf=load calls=2` in the scratch home's log, two ledger rows. A backup that
  has now been restored and loaded is a backup.
- **Dry run on a copy against Python:** `scripts/smoke_builder_real_copy.sh`
  re-run with the gate absent — all eight events diff-clean on all four faces.
- **Real cursor, through the TS front door:** `plan-item` (`prepare → plan`,
  gen 16, `leaf=plan-item` in the log; the story package's existing artifacts
  preserved) and `approve-plan` (`plan → plan_approved`, `leaf=approve-plan`),
  restoring the approval the Navigator gave on 2026-09-13 and a resume
  session's `prepare-item` had overwritten. `check-implementation` now reports
  `allowed`, and the guard surface Python renders from the TS-written cursor
  is byte-identical to TypeScript's.

Remaining in step 4, after step 5: `validate-item --navigator-accepted`,
`review-item`, `coherence-item`, `done-item` — each already dry-run above.

### Step 5 — the Navigator's live Pi Builder session (2026-09-16, 10:46–10:52 UTC)

Run by the Navigator in a fresh Pi session; the log checked directly by the
Driver afterwards. `front-door.log` for the window, `build` lines only:

```text
10:46:26  build  ts      exit=0  leaf=load calls=2
10:47:20  build  ts      exit=1  leaf=pull-candidates
10:47:23  build  ts      exit=0  leaf=pull-candidates
10:54:22  build  python  exit=1
```

- `/mm-build mirror-ts-core` reached TypeScript: `leaf=load calls=2`, no
  degraded kind, the `■ BUILDER RESUME` surface rendered in the session.
- `pull-candidates` first exited 1: the session's agent ran it without
  `--journey` and got `Error: Builder method pull candidates inspection requires
  a journey. Activate Builder Mode for a journey or pass --journey.` —
  reproduced on both engines byte for byte, exit 1 on both; it is Python's own
  resolution rule and the same lived experience as before the flip. The retry
  with `--journey` rendered the `ROADMAP SNAPSHOT`.
- **The Workbench line was not produced by the session**: asked to run `build
  change-request capture --title … --body …`, the session's agent refused on
  its own grounds — this journey's Refinement Work is file-first
  (`docs/project/refinement/index.md`), so a capture into the legacy SQLite
  Workbench would be a throwaway row in a store the index says is no longer
  consulted. Correct skill behavior, and not the route under test. The Driver
  then exercised the route with a READ-ONLY Workbench leaf on the real home,
  `build refinement-story overview --journey mirror-ts-core
  --refinement-story-id RS-does-not-exist`: `Error: refinement_story_id does
  not exist`, exit 1, identical to invoking Python directly, and `build python
  exit=1` in the log — answered by Python by name, nothing written.
- No `fell_back` anywhere in the day's log; none of the typed argument text
  (the Portuguese title and body, the slug, the option names) appears in it.

**Pass**, with the Workbench observation supplied by the Driver rather than
the session.

**Finding outside this story's scope, recorded for Debt Review.** Every
session start since 2026-09-11 logs two `conversation-logger ts exit=1 Error`
lines. `mirror-logger.log` shows the mechanism: the extension starts
`session-maintenance` as a detached process and, ~50 ms later, `log-user` for
the first prompt; both enter `withMirrorWriteDb`, both `ensureBackup` onto the
same `frontdoor-pre-write-backup.db`, and one of them dies with `disk I/O
error` in `VACUUM INTO` while the other fails `requireBackup` with `recorded
backup hash does not match the backup file`. The hook swallows the failure by
design, so the **first user prompt of every session is not logged**: the
2026-09-16 conversation `642296c0` begins with the assistant's `■ BUILDER
RESUME` and has no `Change to journey mirror-ts-core` row; eight sessions
since 2026-09-11 show the same pair. Not a Builder defect — DS4's single
pre-write backup path under concurrent front-door writes — and not fixed
here.
