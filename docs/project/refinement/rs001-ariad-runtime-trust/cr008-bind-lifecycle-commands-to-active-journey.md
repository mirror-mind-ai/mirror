[< RS001](index.md) · [Canonical status](../index.md#change-requests)

# CR008 — Bind Lifecycle Commands To The Active Builder Journey

## Problem

During a Builder session activated for `kia-backend` (`build load kia-backend`),
`build pull-item --method ariad` invoked **without** `--journey` resolved to a
different journey. The command emitted `DELIVERY_STORY_IDENTIFIED` claiming
`commitment: pulled into active Delivery Work / active item: CV3.DS4.TS2` — a
kia-backend roadmap item — but persisted that commitment to the **kia-desktop**
delivery cursor, overwriting its prior state. The kia-backend cursor was left
untouched, so the surfaced commitment never existed for the journey it named.

Journey resolution was also inconsistent within one session: in a single shell
chain, `prepare-item` (no `--journey`) resolved to a journey and executed, while
the immediately following `plan-item` failed with `Builder method plan requires a
journey`.

Reproduced 2026-08-13 on a **third journey pair** (`amplia-website` → `kia-backend`,
see Evidence), which extends the defect beyond cursor state: `Expand` and
`plan-delivery-story` also **materialized roadmap files into the wrong project's
working tree**. The fallback is therefore not limited to persisted runtime state; it
redirects filesystem writes into an unrelated repository.

## Expected Behavior

Lifecycle commands must bind deterministically to the active Builder journey, or
refuse and ask for `--journey` — never fall back silently to another journey. The
journey a command persists to must be the journey its emitted surface speaks for;
a surface must not claim a commitment that was written elsewhere or not written at
all. Resolution must be consistent across commands within the same session.

## Impact

Silent cross-journey state corruption: one journey's resume state is clobbered
(kia-desktop lost `CV3.DS18.US4 / done_complete`), while the operating journey's
lifecycle blocks on stale state (`Prepare must be completed before Plan` against
an already-done item). Because the surfaces asserted success, the defect was only
discovered by direct storage inspection — a direct breach of the surface-trust
promise RS001 exists to protect.

## Plan Or Decision

**2026-09-25 — first change of the Ariad trust floor** ([decision](../../decisions.md#the-cv22-release-is-gated-on-an-ariad-trust-floor-worked-before-us3)).
Plan approved by the Navigator on 2026-09-25 (`planned`) and started the same
day (`in_progress`; Driver `@viniciusteles`, Delivery `mirror-ts-core`).

### Characterization (read-only, 2026-09-25, TypeScript engine)

The capture asked where the fallback lives. It lives in two hops, and both are
silent:

1. **Session hop** — `resolveRuntimeSessionId` (`ts/src/mirror/runtimeSession.ts`):
   explicit `--session-id`, else `MIRROR_SESSION_ID`, else **the most recently
   updated active `runtime_sessions` row in the whole database** whose
   `interface` is set and is not `global_defaults`. An agent's tool shell does
   not carry `MIRROR_SESSION_ID` (verified: unset in the Builder session that
   wrote this), so every `build` command without `--journey` takes the third
   branch, and "the session" is whichever window or pseudo-session touched the
   table last. Delivery-cursor rows (`__builder_delivery_cursor__:<journey>`,
   `interface = builder_delivery_cursor`, `active = 1`) qualify.
2. **Mode hop** — `getActiveOperatingMode` (`ts/src/mode/operatingMode.ts`):
   that session's operating-mode metadata, else **the global operating-mode
   row** (`__global_operating_mode__`), which holds the last `build load` from
   any window.

`resolveBuilderJourney` (`ts/src/builder/commands.ts`) composes the two: explicit
`--journey`, else the Builder journey of whatever the hops return. Nine `build`
subcommands go through it, plus `inspect-method`'s no-argument branch.

This explains every observation in the Evidence:

- *Cross-journey binding* — the hops return another window's session (still
  stamped Builder Mode for kia-desktop) or the global row (last loaded by
  another window).
- *`prepare-item` succeeds, `plan-item` refuses, same chain* — `prepare-item`
  wrote journey X's cursor row, which became the most recently updated session;
  it carries no operating mode; the global row was empty or deactivated;
  `plan-item` therefore resolved nothing and refused.
- *Files written into another repository* — Expand and Plan resolve
  `project_path` from the journey the hops returned.

**The write side has the same defect.** `build load <slug>` (`ts/src/builder/load.ts`)
resolves the session through the same hops and stamps `Builder Mode · <slug>`
onto whatever row they return — in an agent shell, the most recently touched
session of *any* window. So a load in window A can rewrite window B's mode, and
B's next lifecycle command binds to A's journey with a surface that names it
truthfully. `explore load` does the same for Explorer Mode (out of scope here;
see Exclusions).

The goldens in `ts/test/goldens/builder-command.golden.json` that exercise
"via active mode" (`pull_candidates_via_active_mode`, `adopt_via_active_mode`,
`inspect_method_active_builder_journey`) all pass an explicit `--session-id`.
The pinned behavior is the known-session path; the two hops are not what the
goldens protect.

### Decision

A Builder command binds to a journey through exactly one of:

- explicit `--journey <slug>`; or
- the Builder Mode of a **known** session — one named by `--session-id` or by
  `MIRROR_SESSION_ID`.

Nothing else. No most-recent-session guess, no global-row fallback. With
neither, the command refuses with the existing Class B text (`Error: Builder
method <action> requires a journey. Activate Builder Mode for a journey or pass
--journey.`), before any read of the cursor or write to disk. `inspect-method`
with no argument and no known session renders the existing no-active-journey
card (never an error, unchanged).

The same rule on the write side: `build load` stamps Builder Mode onto a known
session only; with none it writes the global row, which remains what the
welcome card and `mirror mode status` read. The global row becomes a display
fact, never a binding source for lifecycle commands.

The consequence is deliberate: in an agent shell, where no session is known,
every lifecycle command must carry `--journey`. The Builder skill already knows
the slug — `build load` printed it — so the skill text changes from "pass
`--journey` if the user names a journey" to "always pass `--journey <active
slug>`". The runtime refusal is the defense; the skill change is the
ergonomics. A forgotten `--journey` now costs one refused command instead of
another journey's cursor.

Rejected alternative: fall back to the global row only (drop the session hop,
keep the mode hop). Deterministic within one window, but two windows on two
journeys still bind the later `build load` to both — the exact Evidence
scenario. It does not meet the Expected Behavior's "never fall back silently".

### Scope

- `ts/src/builder/commands.ts` — `resolveBuilderJourney` and `inspect-method`'s
  no-argument branch use a Builder-specific session resolver that accepts only a
  known session; today the six lines are duplicated. The refusal text changes,
  because its first half becomes false in an agent shell: `Activate Builder
  Mode for a journey` no longer makes a command bind unless the session is
  known. New text names both real routes, e.g. `Error: Builder method <action>
  requires a journey. Pass --journey <slug>, or run with a known session
  (--session-id or MIRROR_SESSION_ID) that has Builder Mode active.` Parity is
  gone; the goldens that pin the old sentence are regenerated with intent, not
  copied.
- `ts/src/mode/operatingMode.ts` — a session-only reader
  (`getSessionOperatingMode`) with no global fallback, for the Builder path.
  `getActiveOperatingMode` falls back to the global row internally, so without
  this the plan's "no global fallback" would not be true. It keeps that
  fallback for the welcome status line and `mode status`, which are display,
  not binding.
- `ts/src/builder/load.ts` — `build load` stamps a known session or the global
  row; never a guessed session. `switchConversation` receives the same resolved
  value it does today for a known session and `null` otherwise (verify what the
  conversation switch does with `null` before relying on it — see Validation).
- `ts/src/mirror/runtimeSession.ts` — add `resolveKnownRuntimeSessionId` (explicit,
  else environment, else `null`). `resolveRuntimeSessionId` keeps its current
  behavior for its other callers (conversation logger, soul, explore,
  orchestration); changing it is not this CR.
- `.pi/skills/mm-build/SKILL.md` (`.agents/skills/mm-build` is a symlink to it;
  the `.claude/` and `plugins/` copies are older, shorter variants with no
  Ariad section — their drift is a separate observation, not this CR) — the
  rule is stated once, **and every command block carries `--journey <slug>`**.
  A model follows the examples over the rule sentence; a rule stated once above
  examples that omit it would not hold. The eleven "if the user names a
  specific journey" clauses go. After a refusal, the skill names the read-only
  recovery: `mode status` prints `Builder Mode · <slug>` for the last load in
  this database, and the `■ BUILDER MODE ACTIVE` surface already named it.
- `REFERENCE.md` — the `MIRROR_SESSION_ID` row says Builder commands honor it
  as a binding source and nothing else is guessed; the troubleshooting guide
  gets the refusal and its two remedies.

### Acceptance Behavior

```text
Given two active runtime sessions, A stamped Builder Mode for journey X and
  B stamped Builder Mode for journey Y, with B updated more recently
When any lifecycle command runs with --session-id A and no --journey
Then it binds to X, its surface names X, and only X's cursor changes

Given the same database
When any lifecycle command runs with no --journey, no --session-id, and no
  MIRROR_SESSION_ID
Then it refuses with "requires a journey", exit 1, and no cursor row and no
  project file changes — regardless of the global operating-mode row

Given the same database and MIRROR_SESSION_ID=A
When the command runs with no --journey
Then it binds to X (the environment names a known session)

Given the same database and MIRROR_SESSION_ID naming a session that does not
  exist, or one whose mode is not Builder Mode with a journey
When the command runs with no --journey
Then it refuses — a stale environment is not a license to guess

Given any database
When `build load Y` runs with no known session
Then the global row reads Builder Mode · Y, `mode status` prints it, and no
  other runtime_sessions row's metadata changes

Given any database
When `build load Y` runs with a known session A
Then A's metadata reads Builder Mode · Y and the global row is untouched

Given a database whose only Builder Mode is on the global row
When `inspect-method` runs with no argument and no known session
Then it renders the no-active-journey card, exit 0
```

Every "no cursor row changes" line is asserted over **all** cursor rows in the
database, not the target's alone — the defect wrote to the wrong one. The
existing goldens that pass `--session-id` continue to pass unchanged; the
goldens pinning the old refusal sentence are regenerated.

### Validation Route

Automated: `npm test`, `npm run typecheck`, `npm run lint` from `ts/`; new
cases in `ts/test/builder/commands.test.ts` and `ts/test/builder/loadSurfaces.test.ts`
(or a sibling) for each acceptance line above, written first.

Navigator-visible, on a copy of the real database (never live): activate two
journeys from two shells, run `pull-candidates` without `--journey` in each and
observe the refusal; run with `--journey` and observe the right roadmap; read
both cursor rows before and after and observe no cross-writes. Then one
ordinary Builder session on this journey with the updated skill, to observe
that the ergonomics hold: `build load`, then a read-only lifecycle command with
`--journey mirror-ts-core`.

Checked 2026-09-25: `switchConversation` (`ts/src/conversation/logger.ts`)
re-resolves the session itself through `resolveRuntimeSessionId`, so passing
`null` from `build load` changes nothing there — the conversation attaches
exactly as today. The logger's own guess is the captured exclusion below, not
this CR's dependency.

### Exclusions

- `runtime_sessions` carries three kinds of row — real sessions, delivery-cursor
  pseudo-sessions, and the two global pseudo-sessions — told apart only by id
  prefix and `interface`. The most-recent-session heuristic in
  `resolveRuntimeSessionId` (used by the conversation logger, Soul, Explorer,
  and orchestration) and cursor rows qualifying as "the session" are symptoms
  of that overloading. Captured as one model-level CR, so it is fixed at the
  shape and not by one more `interface !=` exclusion. Not fixed here.
- `explore load` stamping Explorer Mode onto a guessed session — the write-side
  twin for Explorer Mode. Captured separately.
- Naming the target project in artifact surfaces — CR009, which this change
  narrows but does not close.
- Making the Pi extension export `MIRROR_SESSION_ID` into the agent's tool
  shell, which would make `--journey` unnecessary again. A runtime-integration
  question with its own boundary; recorded as a question for the next plateau.

### Panel Plan Review (2026-09-25)

Single-pass review through the technical persona panel. Synthesis: the plan
is sound and small; the risk concentrates in the seam between the runtime
refusal and the agent that must now supply `--journey` on every call. Six
lenses dissented and each finding is folded in above: the Builder path needed
its own mode reader (`getActiveOperatingMode` falls back to the global row
internally, so "no global fallback" was not yet true); the refusal sentence
would have become half-false and is rewritten; a stale `MIRROR_SESSION_ID` is
an acceptance case; "no cursor changes" is asserted over every cursor row; the
skill's examples carry `--journey`, not only its rule; the agent has a named
read-only recovery after a refusal; and the `runtime_sessions` overloading is
captured at the model level. Security, experience, and product lenses raised
nothing: `--journey` binds only to a registered journey and its recorded
project path, so the change narrows the blast radius rather than opening one.

### Authority Boundary

This plan authorizes nothing. Implementation starts after Navigator approval
(`planned`), with Driver `@viniciusteles` and Delivery
`mirror-ts-core` recorded at `in_progress`. No commit, push, or release is
granted by any part of it.

## Evidence

Reproduced 2026-08-04 while operating the kia-backend journey:

```text
# pull-item without --journey — surface claimed kia-backend's item:
commitment: pulled into active Delivery Work
active item: CV3.DS4.TS2

# same output, auto-Prepare terrain read (kia-desktop's terrain — the file
# exists in kia-backend):
○ docs/process/development-guide.md: missing

# persisted cursors afterward:
__builder_delivery_cursor__:kia-desktop  → active_item CV3.DS4.TS2   (clobbered)
__builder_delivery_cursor__:kia-backend  → active_item CV3.DS2.US1   (unchanged)

# same-chain inconsistency:
prepare-item (no --journey) → executed, rendered PREPARE_FIELD_READING
plan-item    (no --journey) → "Builder method plan requires a journey"
```

Recovery: re-running `pull-item` with explicit `--journey kia-backend` persisted
correctly (verified by reading the cursor row). The kia-desktop cursor's prior
value was recovered from `backups/memory_20260804_124634.zip`
(`CV3.DS18.US4`, `done_complete`, `stepwise`) and restored with explicit
Navigator approval.

**2026-08-13 — reproduced from `amplia-website`, with filesystem contamination.**
A Builder session was activated with `build load amplia-website`. Every subsequent
lifecycle command was issued from the Mirror working directory **without**
`--journey`, and all of them resolved to `kia-backend`:

```text
# commands issued (no --journey), active journey was amplia-website:
build pull-item --item-code DS-05 --item-level delivery_story
build set-flow-unit --unit delivery_story
build plan-delivery-story --child DS-05.TS1 --child DS-05.US1 --child DS-05.US2

# files materialized into the WRONG repository:
kia-backend/docs/project/roadmap/ds-05-landing-narrative-v4/index.md
kia-backend/docs/project/roadmap/ds-05-landing-narrative-v4/plan.md
kia-backend/docs/project/roadmap/ds-05-landing-narrative-v4/test-guide.md
kia-backend/docs/project/roadmap/ds-05-landing-narrative-v4/ds-05-us1-.../index.md

# plan.md header names the journey it actually wrote for:
**Journey:** kia-backend
# ...above an objective written for the Projeto Ampl.IA landing page, in Portuguese.

# cursors afterward:
__builder_delivery_cursor__:kia-backend    → DS-05 / Landing Narrative V4 /
                                             plan:pending          (clobbered)
__builder_delivery_cursor__:amplia-website → active_item null /
                                             template_preparation  (never advanced)

# kia-backend cursor before the session (backups/memory_20260813_144238.zip):
active_item CV3.DS8 — "Entrada: resolução de conta no login + sign-up in-app +
auth pré-conta", next_story_confirmation, expand, checkpoint
```

Two aggravating details from this occurrence:

- The Delivery Story package for DS-05 had been **authored by hand** in
  `amplia-website` before Pull, with three candidate stories. `Expand` never saw it
  and generated a generic single-child expansion from the story title instead. The
  authored index survived only because the runtime was operating on a different
  repository entirely — not because no-clobber worked.
- Because `ARTIFACTS_MATERIALIZED` prints **project-relative** paths, the Navigator
  inspected the correct project, found nothing, and reasonably concluded the surface
  was reporting phantom writes. The defect masqueraded as a CR003 regression for the
  remainder of the session. See CR009.

2026-08-14 — Re-verified against `origin/main` @ `688271f`: no commit since 12 Aug touches
`src/memory/cli/build.py` or `src/memory/builder/`; journey resolution is unchanged. Still valid.

## Outcome

Pending.
