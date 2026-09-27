[< RS001](index.md) · [Canonical status](../index.md#change-requests)

# CR067 — Render the refused checkpoint, not a hardcoded Implement stage

Carries [CR020](cr020-no-read-only-way-to-re-render-the-active-checkpoint.md) by the
Navigator's decision of 2026-09-26: one plan for both, and CR020 closes with this CR.

## Problem

### As captured (2026-09-08)

`cmd_validate_item` catches **every** `ValueError` raised by
`validate_lifecycle_item` and renders it through one error path
(`src/memory/cli/build.py:1792`):

```python
except ValueError as exc:
    print(render_implementation_guard_blocked(str(exc)))
    sys.exit(1)
```

`render_implementation_guard_blocked` hardcodes its lifecycle ribbon and its
boundary sentence:

```text
Delivery Flow: ✓ Pull → ✓ Prepare → ✓ Expand → ✓ Plan → ◉ Implement → ○ Validate → ○ Debt Review → ○ Done
boundary: No implementation files may be mutated until the guard allows Implement.
```

So a refused Validation is reported as "you have not implemented yet",
whatever the actual reason and whatever the cursor actually says. Observed on
`mirror-ts-core` with the delivery cursor at `last_delivery_event =
coherence_complete`, one step from Done: calling `validate-item` again renders
the surface above, placing the item at **Implement** — five stages behind where
it is. Reproduced twice, deterministic.

The refusal itself is correct: re-validating a completed checkpoint should be
refused, and the raise happens before any persistence, so nothing is mutated
(cursor generation and `last_delivery_event` were verified unchanged after the
reproduction). Only the rendering is wrong.

### As characterized (2026-09-26, TypeScript runtime)

The port kept the defect, and it reaches further than captured. The four story closure
commands (`validate-item`, `review-item`, `coherence-item`, `done-item`) send every
refusal through one helper, `blockedSurface` in `ts/src/builder/commands.ts`, which
renders `IMPLEMENTATION_GUARD` at **Implement** with the boundary "No implementation
files may be mutated until the guard allows Implement." `continue-lifecycle` renders its
refusals the same way. The only command that should render that surface is
`check-implementation`, which still does.

CR020's half reproduces too. A step the cursor has already passed is refused with a
precondition that holds: a second `plan-item` says `Prepare must be completed before
Plan`, and a second `validate-item`, `review-item`, `coherence-item`, or `done-item`
names the step before it. No read-only command shows the active checkpoint again.

Every refusal leaves the stored cursor byte-identical: the refusals are right, and only
what they say is wrong. The [characterization](#characterization-2026-09-26-typescript-runtime-isolated-home)
records each one.

## Expected Behavior

A refused checkpoint renders the lifecycle position the cursor actually holds,
and a boundary sentence describing the refusal that occurred.

`render_implementation_guard_blocked` is the right surface for exactly one
condition — implementation attempted before Plan approval. It is the wrong
surface for "already validated", "pending a different confirmation", or
"missing implementation evidence", which are different refusals at different
stages and currently share one misleading rendering.

From CR020: a refusal names the actual state, not a precondition that already holds, and
a read-only command shows the active checkpoint again, any number of times, without
changing anything.

## Impact

This is a trust-boundary defect, the same family as CR003. Ariad's premise is
that a deterministic surface is the reliable rendering of runtime state; here
the surface contradicts the state it claims to describe.

The concrete cost is a false alarm that looks exactly like a serious one. A
reader who trusts the surface over the database concludes the delivery cursor
was reset or lost, and goes looking for state corruption that never happened.
That is what occurred on CV22.DS7.TS3: the surface was read as evidence of two
diverging cursors, and only a direct read of
`__builder_delivery_cursor__:mirror-ts-core` showed a single healthy row at
`coherence_complete`. An error path that manufactures a plausible-looking
emergency is worse than one that says nothing.

## Plan Or Decision

Drafted by quality assurance on 2026-09-26 and reviewed by the technical panel the same
day ([record below](#panel-review-2026-09-26)); the panel's three changes are folded
into the sections that follow. Navigator decisions, 2026-09-26: option A for
[what `build show` shows](#decision-what-build-show-shows), and the plan approved as
it stands.

### Objective

Every refusal of a story lifecycle command says where the cursor actually stands and
why the request was refused, changes nothing, and names a read-only command that shows
the active checkpoint again.

### Decision: what `build show` shows

The cursor stores position only (active item, last event, pending confirmation, active
checkpoint, cadence, flow). The evidence a checkpoint surface displays (checks, E2E
decision, debt findings, plan content) is not stored with it; it lives in the story
package's `plan.md` and sealed closure records. So no command can re-render a lost
checkpoint surface from the cursor alone.

- **A. Status and records (recommended).** A new `ACTIVE_CHECKPOINT` surface: the ribbon
  at the cursor's stage, the cursor's position, and the story package's records with
  project-relative paths and present or missing marks. It shows where things stand and
  where the full record lives, with no new stored state.
- **B. Replay.** Every lifecycle command also stores the surfaces it emitted, and
  `build show` replays the last ones verbatim while they still match the cursor. This
  recovers exactly what was lost, but it adds stored state, a staleness rule, and a
  fourth kind of row to `runtime_sessions`, the table CR100 already flags for holding
  three.

The Navigator chose A.

### Design

1. **One owner for "where is the cursor".** A new `ts/src/builder/lifecycleRefusal.ts`
   holds the story lifecycle's event order, `lifecycleStageOf(cursor)`, and a
   `LifecycleRefusal` error carrying the requested step, the refusal kind (pending
   confirmation, not reached, already complete, missing evidence, cadence stop), and the
   cursor. `plan.ts`, `closure.ts`, and `continue-lifecycle` throw it instead of a bare
   `Error`.
2. **The stage table.** Events outside it render no stage marker and print the raw
   event, so a new or Delivery Story event is never mislabeled:

   | Last event | Ribbon stage |
   |---|---|
   | `pull` | Prepare |
   | `prepare` | Plan (Expand for a Delivery Story) |
   | `plan` | Plan |
   | `plan_approved` | Implement |
   | `implementation_complete`, `validate` | Validate |
   | `validation_passed`, `review` | Debt Review |
   | `review_complete`, `coherence`, `coherence_complete`, `done`, `done_complete` | Done |

3. **Already complete.** Checked before any other refusal: a step whose completing
   event the cursor has reached or passed is refused as already complete. Plan completes at `plan`, Validation at
   `validation_passed`, Debt Review at `review_complete`, Coherence at
   `coherence_complete`, and Done at `done_complete`. The existing re-entry paths (Debt
   Review and Coherence while their own confirmation is pending) are untouched.
   Pending-confirmation and not-reached refusals keep their current, true reasons.
   The existing guards in `closure.ts` and `plan.ts` stay as written, so the event
   order now has two expressions. A table-driven test runs every command against every
   event in the table and asserts the outcome (proceeds, already complete, not reached,
   or pending), so the two cannot drift apart.
4. **The refusal surface.** A new `CHECKPOINT_REFUSED` replaces `blockedSurface` in the
   four closure commands and `continue-lifecycle`, and replaces `plan-item`'s bare
   `Error:` line. Exit code 1 stays. `check-implementation` keeps
   `IMPLEMENTATION_GUARD`, the one condition it was written for.
5. **`build show`.** A new read-only leaf with the same journey binding as every build
   command (CR008). It renders `ACTIVE_CHECKPOINT` and never writes: no cursor, mode,
   session, or file. With no cursor or no active item it says `no item pulled yet` and
   gives the literal pull command, as CR002's surfaces do.
6. **The copyable command** lives in `scopePhrases.ts` beside `pullExplicitly`, through
   the same `shellWord` quoting, so a slug that is not a plain token cannot run anything
   when pasted (CR104).

### Surface strings

`CHECKPOINT_REFUSED`, with the ribbon at the cursor's stage above the card:

```text
■ REQUEST REFUSED
request
validate-item
reason
Validation is already complete for CV1.DS1.TS1: the cursor is at review_complete.
cursor
CV1.DS1.TS1 · last event review_complete · pending none
to see the checkpoint
mirror build show --journey cr067 --method ariad
boundary
Refused before any change: the cursor and the project files are as they were.
```

The already-complete reason is always
`<Step> is already complete for <item>: the cursor is at <event>.`, with
`, pending <confirmation>` before the period when one is pending.

`ACTIVE_CHECKPOINT`:

```text
■ ACTIVE CHECKPOINT
active item
CV1.DS1.TS1 — First slice
last event
validation_passed
pending confirmation
none
active checkpoint
none
records
✓ docs/project/roadmap/cv1/ds1/ts1/plan.md
✓ docs/project/roadmap/cv1/ds1/ts1/validation.md
○ docs/project/roadmap/cv1/ds1/ts1/review.md
○ docs/project/roadmap/cv1/ds1/ts1/coherence.md
○ docs/project/roadmap/cv1/ds1/ts1/done.md
boundary
Read-only: the cursor and the project files were not changed.
```

### Affected files

- New `ts/src/builder/lifecycleRefusal.ts`, and a renderer for each new surface.
- `ts/src/builder/plan.ts` and `ts/src/builder/closure.ts`: throw `LifecycleRefusal`.
- `ts/src/builder/commands.ts`: the four closure commands, `plan-item`, and
  `continue-lifecycle` render `CHECKPOINT_REFUSED`; `blockedSurface` is deleted; the new
  `show` command.
- `ts/src/builder/scopePhrases.ts`: the copyable `build show` command.
- `ts/src/frontDoor/buildRoute.ts`: the `show` leaf.
- Tests: unit tests for the stage table, the already-complete rule, and both renderers;
  the table-driven agreement test over every command and event; end-to-end tests that walk a story through every stage and refuse at each, proving
  the cursor and the project files unchanged; `build show` tests for read-only,
  idempotent, no cursor, not adopted, missing records, and a quoted slug. The new
  behavior is graded by hand-written expectations, as CR002's scope was, never by
  goldens.
- Goldens: the eleven `builder-command` cases that pin today's refusals (two
  `validate-item`, one each for `review-item`, `coherence-item`, and `done-item`, five
  `continue-lifecycle`, and `plan-item`'s stderr line), with a README row.
- `.pi/skills/mm-build/SKILL.md`: `build show`, `CHECKPOINT_REFUSED` returned verbatim,
  and the recovery rule: a lost surface is recovered with `build show`, never by
  substituting another command's surface.

### Plateaus

1. **Refusal identity:** `lifecycleRefusal.ts`, the stage table, the already-complete
   rule, and the throwing sites, with unit tests. Surfaces unchanged.
2. **Refusal surface:** `CHECKPOINT_REFUSED` at every refusing site, the stage walk
   test, and the golden edits.
3. **`build show`:** the leaf, `ACTIVE_CHECKPOINT`, and its tests.
4. **Close:** the skill, a pasteable validation route, Navigator validation, and the
   handoff review.

### Acceptance criteria

1. Every refusal of `plan-item`, `validate-item`, `review-item`, `coherence-item`,
   `done-item`, and `continue-lifecycle` renders `CHECKPOINT_REFUSED` with the ribbon at
   the cursor's stage from the table, exits 1, and leaves the cursor byte-identical and
   the project files unchanged.
2. A step already complete is refused as already complete, naming the cursor's event,
   never with a precondition that holds.
3. Pending-confirmation, not-reached, missing-evidence, and cadence refusals keep their
   reasons; Debt Review and Coherence re-entry still work.
4. `check-implementation` still renders `IMPLEMENTATION_GUARD`, unchanged.
5. Every refusal names the `build show` command, with the slug quoted when it is not a
   plain token.
6. `build show` changes neither the cursor nor the project files and adds no runtime
   row, and two calls print identical output.
7. For every event in the table and every command, the command's outcome (proceeds,
   already complete, not reached, or pending) agrees with the stage order.
8. `build show` renders the stage, position, and records; with no cursor or no active
   item it says so and exits 0; without `--journey` it refuses like every build command.
9. An event outside the table renders no stage marker and prints the event.
10. `npm test`, `npm run typecheck`, `npm run lint`, and CI are green; each golden edit
   has its README row.

### Validation route

CLI only, in an isolated home with no `.env` and no Pi session (CR106). One story is
walked through every stage, as in the characterization. At each stop, the step already
passed is attempted again and `build show` runs.

Pass: every refusal shows the cursor's stage and a true reason and names `build show`,
and every `build show` matches the stage table and the records on disk. Fail: `◉
Implement` anywhere after Plan approval unless the cursor is there, a precondition that
holds, or any change to the cursor or files.

Runnable from the repository root in bash or zsh. There is no `.env`, so nothing reaches
the real home, and the script deletes its temporary directory. A helper passes the
journey options, because zsh does not split an unquoted variable into words. Each step
prints only the rows the pass condition reads:

```bash
V=$(mktemp -d) && mkdir -p "$V/home" && export MIRROR_HOME="$V/home" NODE_OPTIONS=--no-warnings
cr067() { node ts/src/frontDoor/cli.ts "$@"; }
cr067b() { cr067_leaf=$1; shift; node ts/src/frontDoor/cli.ts build "$cr067_leaf" --journey cr067 --method ariad "$@"; }
cr067_cv() { mkdir -p "$V/p/docs/project/roadmap/$1" && printf '# %s — %s\n\n**Status:** 🟡 Planned\n' "$2" "$3" > "$V/p/docs/project/roadmap/$1/index.md"; }
cr067_pkg() { mkdir -p "$V/p/docs/project/roadmap/$1" && printf '# %s — %s\n\n**Status:** 🟡 Planned\n**Type:** %s\n' "$2" "$3" "$4" > "$V/p/docs/project/roadmap/$1/index.md"; }
cr067_refusal() { sed -n '/Delivery Flow/p;/<<<ARIAD:/p;/│ reason /,/│ mirror build show/p'; }
cr067_show() { cr067b show | sed -n '/Delivery Flow/p;/│ last event/,/│ changed\./p'; }
cr067_validate() { cr067b validate-item --implementation-complete --check "npm test" --checks-status passed --e2e-decision not_required --e2e-evidence "unit-level" --navigator-route "the route" --navigator-accepted --expected-observation "shown" --pass-condition "shown" --fail-condition "not shown"; }
cr067_cv cv1 CV1 "First capability" && cr067_pkg cv1/ds1 CV1.DS1 "Alpha delivery" "Delivery Story" && cr067_pkg cv1/ds1/ts1 CV1.DS1.TS1 "First slice" "Technical Story"
printf '# Roadmap\n' > "$V/p/docs/project/roadmap/index.md" && git -C "$V/p" init -q
printf '# CR067\n' | cr067 identity set journey cr067 > /dev/null && cr067 journey set-path cr067 "$V/p" > /dev/null 2>&1
cr067b adopt > /dev/null && cr067b sync-cursor > /dev/null
cr067b pull-item --item-code CV1.DS1.TS1 --item-title "First slice" --item-level technical_story --why-now "CR067 validation" > /dev/null
cr067b plan-item > /dev/null
echo '--- 1: plan-item again, awaiting Plan approval'
cr067b plan-item | cr067_refusal
echo '--- 2: build show'
cr067_show
cr067b approve-plan > /dev/null && cr067_validate > /dev/null
echo '--- 3: validate-item again'
cr067_validate | cr067_refusal
echo '--- 4: build show'
cr067_show
cr067b review-item --debt "No debt found" --decision no_action > /dev/null && cr067b coherence-item --process p --project p --product p > /dev/null
echo '--- 5: validate-item at coherence_complete, CR067 as captured'
cr067_validate | cr067_refusal
cr067b done-item --history-action h --roadmap-update r --next-recommendation n > /dev/null
echo '--- 6: done-item again'
cr067b done-item --history-action h --roadmap-update r --next-recommendation n | cr067_refusal
echo '--- 7: build show'
cr067_show
unset MIRROR_HOME; rm -rf "$V"
```

| Step | Ribbon | Expected |
|---|---|---|
| 1 | `◉ Plan` | `Plan is already complete for CV1.DS1.TS1: the cursor is at plan, pending navigator_approval.`, then `mirror build show --journey cr067 --method ariad` |
| 2 | `◉ Plan` | `plan`, `navigator_approval`, `after_plan`; `✓ plan.md`, the other four `○` |
| 3 | `◉ Debt Review` | `Validation is already complete for CV1.DS1.TS1: the cursor is at validation_passed.` |
| 4 | `◉ Debt Review` | `validation_passed`; `✓ plan.md`, `✓ validation.md` |
| 5 | `◉ Done` | `Validation is already complete for CV1.DS1.TS1: the cursor is at coherence_complete.` |
| 6 | `◉ Done` | `Done is already complete for CV1.DS1.TS1: the cursor is at done_complete.` |
| 7 | `◉ Done` | `done_complete`; all five records `✓` |

The Driver walked it in bash and zsh on 2026-09-27: both shells printed identical output,
matching every row.

### Conscious exclusions

- Delivery Story leaves: they refuse with plain `Error:` lines, not the Implement guard,
  and their wording was not characterized here.
- Replaying the exact lost surface: the Navigator chose A.
- The roadmap position in `build show`: `build load` and `pull-candidates` render it.
- CR105's stale confirmation: `build show` displays whatever the cursor holds.
- `BUILDER_RESUME`'s allowed next actions.

### Authority boundaries

Plan approval moves CR067 to `planned`. A human Driver and a Delivery reference are
required before `in_progress`. `validated` requires the Navigator to walk the route
and accept it. Each plateau is committed on the Delivery branch and pushed when green,
with GitHub Actions verified after every push. Merge, publication, and release are not
authorized. CR020 moves with CR067 and closes with it.

Navigator decisions, 2026-09-26: Driver `@viniciusteles`, Delivery `mirror-ts-core`, for
both CRs.

### Panel review (2026-09-26)

Plan review before implementation, per the CV22 collaboration strategy: the
quality-assurance draft reviewed by engineer, database-architect, devops-engineer,
security-engineer, ai-engineer, prompt-engineer, experience-designer, and
product-designer. Only dissent was recorded.

Synthesis: sound, and bounded by the characterization. Every refusal site is known,
every refusal is proven to write nothing, and both new surfaces have fixed strings.
Risk concentrates in a second expression of the lifecycle order that could drift from
the hand-written guards, and in two claims the surfaces make. The plan succeeds if
every refusal and every `build show` is as true as the cursor it reads.

| Lens | Dissent | Resolution |
|---|---|---|
| engineer | The stage table and the already-complete rule express the lifecycle order a second time, beside the guards in `closure.ts` and `plan.ts`, and nothing kept the two in agreement | A table-driven test over every command and every event ([Design](#design), acceptance criterion 7) |
| prompt-engineer | The row label "see it again" presumes a lost surface, but most refusals follow nothing the reader missed, such as a step not reached yet | The label is "to see the checkpoint" ([Surface strings](#surface-strings)) |
| devops-engineer | "Read-only: nothing was changed" claims more than the tests prove: the front door may migrate a database on open. A read-only promise has to say what is guaranteed and be verified | The boundary names the cursor and the project files; the tests assert the cursor bytes, the project snapshot, and the count of runtime rows (acceptance criterion 6) |

The database-architect, security-engineer, ai-engineer, experience-designer, and
product-designer lenses raised no objection. Option A adds no stored state, while B's
extra row kind is the cost already named. The copyable command reuses CR002's quoting.
A distinct `CHECKPOINT_REFUSED` id lets agents tell a refusal from a checkpoint. The
new card reports the cursor's real stage and closes on what did not change, which
removes the false alarm CR067 describes. For approving a Plan or accepting a
Validation, the records option A points to are the documents the Navigator actually
needs: `plan.md` holds the Driver's completed plan, while the Plan card shows only the
runtime's defaults.

### Captured proposal (2026-09-08)

Distinguish the refusals instead of collapsing them:

- Give the lifecycle's refusal reasons distinct identities (an exception type
  or a reason code per branch) rather than a bare `ValueError` string.
- Render the guard from the CURSOR — its `last_delivery_event` decides the
  ribbon — so a refusal at Coherence renders at Coherence.
- Keep `render_implementation_guard_blocked` for the implement-before-approval
  condition it was written for, and add a refusal surface for a checkpoint
  declined at its own stage.
- Fix the siblings in the same change. `cmd_review_item`, `cmd_coherence_item`,
  and `cmd_done_item` were checked and carry the identical shape — every
  `ValueError` routed to `render_implementation_guard_blocked`, at two call
  sites each. Together with `cmd_validate_item` that is eight sites, so a
  refusal at Debt Review, Coherence, or Done renders `Implement` exactly as
  Validation does. Whichever stage a reader meets first, the surface is wrong.

The codebase already contains the alternative convention: `cmd_approve_plan`
handles the same exception type with a plain `Error: {exc}` on stderr and no
fabricated ribbon. Adopting that shape would be a strict improvement even
without a new surface; a stage-aware refusal surface is the better end state.

A regression test should assert that a refusal at a known cursor position
renders that position, not a constant one.

## Evidence

### Characterization (2026-09-26, TypeScript runtime, isolated home)

The real front door at `864c1b18` ran against an isolated `MIRROR_HOME`, with no `.env`
and no Pi session. One Technical Story was walked through Pull, Prepare, Plan, approval,
Validation, Debt Review, Coherence, and Done under `checkpoint` cadence, with each
refusal attempted where it bites:

| Attempt | Cursor at | Rendered | Reason given |
|---|---|---|---|
| `plan-item` again | `plan`, pending `navigator_approval` | stderr only | `Prepare must be completed before Plan` |
| `validate-item` | `plan`, pending `navigator_approval` | guard, `◉ Implement` | `Validation is blocked: pending confirmation navigator_approval.` |
| `continue-lifecycle`, stepwise | `plan_approved` | guard, `◉ Implement` | `Stepwise cadence does not continue automatically.` |
| `validate-item` again | `validation_passed` | guard, `◉ Implement` | `Validation requires an approved Plan and completed implementation` |
| `review-item` again | `review_complete` | guard, `◉ Implement` | `Debt Review requires passed Validation` |
| `coherence-item` again | `coherence_complete` | guard, `◉ Implement` | `Coherence requires completed Debt Review` |
| `validate-item` | `coherence_complete` | guard, `◉ Implement` | `Validation requires an approved Plan and completed implementation` |
| `done-item` again | `done_complete` | guard, `◉ Implement` | `Done requires completed Debt Review` |

Every attempt exited 1 and left the stored cursor byte-identical. Every guard render
ended with "No implementation files may be mutated until the guard allows Implement.",
which is false after Plan approval, where implementation is allowed.

### Plateau 1 handoff (2026-09-26)

Now true: `ts/src/builder/lifecycleRefusal.ts` states the story lifecycle's event order
once, maps a cursor to its ribbon stage, and decides when a step is already complete.
`plan.ts` and `closure.ts` check that first and throw `LifecycleRefusal`, whose kind is
already complete, pending confirmation, not reached, or missing evidence. Every existing
reason keeps its text. A finished step now says so: a second `plan-item` reads
`Plan is already complete for CV1.DS1.TS1: the cursor is at plan, pending
navigator_approval.` The error carries the step and the kind. The command reads the
cursor it renders, so the error does not duplicate it. Surfaces are unchanged.

Evidence: the agreement test runs the five real lifecycle functions at all thirteen
events, 65 combinations, and requires "already complete" exactly when the table says
the step is done. It was red first on the plain `Error` the guards threw. A mutant that
drops Done's check fails it at `done_complete`. No golden changed, because no frozen case
re-runs a finished step. The full suite passes (2,718 tests), along with typecheck,
lint, the repository checks, and the smoke.

Next: plateau 2, the `CHECKPOINT_REFUSED` surface.

### Plateau 2 handoff (2026-09-26)

Now true: every refusal of `plan-item`, `validate-item`, `review-item`, `coherence-item`,
`done-item`, and `continue-lifecycle` renders `CHECKPOINT_REFUSED`
(`ts/src/builder/checkpointRefused.ts`). It shows the ribbon at the cursor's stage, the
request, its true reason, and the cursor on one line. It also prints the literal
`mirror build show` command, quoted through `showCheckpoint` in `scopePhrases.ts`, and
says the refusal came before any change. `blockedSurface` is gone, and
`check-implementation` keeps `IMPLEMENTATION_GUARD`. `plan-item` sends only lifecycle
refusals to the surface; its configuration errors keep their `Error:` line. Until
plateau 3, the command the refusals name does not exist yet.

Evidence: an end-to-end walk takes one story from Plan to Done through the real front
door and refuses nine times. Each refusal renders only `CHECKPOINT_REFUSED`, marks the
expected stage, gives the exact reason, and names `build show`, and none changes the
cursor row or the project files. The walk was red first, at its first refusal. Unit
tests cover a slug that is not a plain token, which is quoted, and a missing cursor,
which gets no ribbon. Twelve `builder-command` goldens changed, one more than planned:
`plan_item_refuses_delivery_story` now refuses at `◉ Expand`. Each keeps its exit code,
its exact reason, and its files, checked case by case, with a README row. One of these
tests first seeded the committed fixture project, which gained a Plan package. The two
stray files were deleted, and the test now seeds a scratch copy. The full suite passes
(2,722 tests), along with typecheck, lint, the repository checks, and the smoke. CI was
green on plateau 1.

Next: plateau 3, `build show`.

### Plateau 3 handoff (2026-09-26)

Now true: `mirror build show --journey <slug> --method ariad` renders `ACTIVE_CHECKPOINT`
(`ts/src/builder/activeCheckpoint.ts`). It shows the ribbon at the cursor's stage, the
active item, the last event, the pending confirmation, the active checkpoint, and the
story package's records, then "Read-only: the cursor and the project files were not
changed." The records are the package path once, then `plan.md`, `validation.md`,
`review.md`, `coherence.md`, and `done.md`, each marked present or missing. With no item
pulled it says so and gives the literal pull command, and an event outside the stage
table gets no marker. The leaf is registered in `READ_ONLY_BUILDER_SUBCOMMANDS`, so the
front door runs it on a read-only database handle, and read-only is a property of the
handle, not only of the code. It checks the journey binding and the adopted method as
every build leaf does. `displayPath` is now exported from `artifactSurfaces.ts` and makes
the package path project-relative.

One deviation from the plan's surface strings: the records print the package path once,
then each record by file name, instead of five full paths. A record path is longer than
a card line and has no spaces, so five full paths would each break mid-word across two or
three lines. This repository's package paths run past 100 characters.

Evidence: the tests were red first on the unknown leaf. A walk plans and validates one
story and calls `build show` after each step. Stage, position, and records match the
disk, two calls print the same, and the read-only dispatcher prints the same. The cursor
row, the count of runtime rows, and the project files stay unchanged. Other tests cover
no item pulled, an event outside the table, no journey, and a journey with no adopted
method. Through the real front door, `build show` logs `leaf=show`, exits 0, and leaves
the cursor unchanged. The route test's count of Builder leaves goes from 27 to 28 and now
says `show` was written new, not ported. The full suite passes (2,726 tests), along with
typecheck, lint, the repository checks, and the smoke.

Next: plateau 4, meaning the skill, the pasteable validation route, Navigator validation,
and the handoff review.

## Outcome

Pending.

## Provenance

Found on 2026-09-08 during CV22.DS7.TS3, after a stray `validate-item` call
rendered `Implement` for an item at `coherence_complete`. Captured after that
story's Debt Review closed, as its own finding rather than retrofitted into it.

One adjacent observation, recorded because it is unexplained rather than
diagnosed: a `validate-item` call made without `--journey` in the same session
failed with `Builder method validation requires a journey`, while journey
resolution through `resolve_operating_session_id` / `get_active_mode` verified
correct immediately afterwards and has not reproduced since. It may be
unrelated to this CR.

Update, 2026-09-26: that observation matches CR008's journey binding, done since. A
Builder command without `--journey` binds only to a session named with `--session-id` or
`MIRROR_SESSION_ID`, and refuses with `requires a journey` otherwise.
