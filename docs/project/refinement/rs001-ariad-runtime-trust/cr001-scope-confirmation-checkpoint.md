[< RS001](index.md) · [Canonical status](../index.md#change-requests)

# CR001 — Make Scope Confirmation An Honest Checkpoint

## Problem

Under checkpoint cadence, `plan-delivery-story` has emitted a scope-confirmation surface
phrased as a pre-plan question and then materialized the plan in the same invocation.
The checkpoint appears to gate an action that has already happened.

## Expected Behavior

Either scope confirmation stops before plan artifacts are written, or the surface is
explicitly non-gating and does not ask a precondition question after materialization.
Cadence semantics and visible language must agree.

## Impact

A checkpoint that does not checkpoint weakens trust in every other Ariad stop condition.

## Plan Or Decision

1. Reproduce the scope-confirmation ordering under checkpoint cadence against the
   current runtime.
2. If the finding no longer reproduces, record current evidence and close this CR
   without changing code.
3. If it reproduces, characterize both the emitted surface order and filesystem writes
   before making a change.
4. Choose one smallest honest behavior: either stop before plan materialization or make
   the scope surface explicitly non-gating. Do not implement both routes.
5. Add focused regression evidence for the chosen ordering and disk effects.
6. Preserve existing Navigator approval and publication boundaries.

This document records the plan only. Selecting and planning CR001 does not authorize its
implementation.

### Decision (2026-09-26)

The runtime finding did not reproduce (see Evidence), but the shape AF-004 recorded was
still reachable through the agent. The Navigator chose to close it where it remains:
the Builder skill makes the Delivery Story scope confirmation a Navigator stop, so the
agent ends its turn at the surface and plans only on a later Navigator turn, under every
cadence and with or without Plan preauthorization. This is step 4's "stop before plan
materialization" route, held at the agent's turn boundary instead of in the runtime. The
runtime is unchanged. A runtime-enforced stop, meaning a pending scope state plus an
acknowledgement, was declined as new lifecycle machinery for a minor finding. Step 5's
regression evidence pins the runtime property the stop relies on.

## Evidence

The original dogfooding observation is
[AF-004](../../roadmap/cv20-builder-mode-evolution/ariad-dogfooding-ledger.md#af-004--scope-confirmation-checkpoint-collapses-into-plan-materialization).

### Reproduction on the current runtime (2026-09-26, `mirror-ts-core` at `724938a1`)

The real front door (`ts/src/frontDoor/cli.ts build ...`) ran against an isolated
`MIRROR_HOME` and a scratch Git project under `/tmp`, with no `.env` loaded, so no
personal data or provider was reachable. The project held one Delivery Story whose
`## Candidate Stories` table listed two children. Cadence was `checkpoint`.

| Step | Command | Surfaces emitted | `plan.md` on disk | Cursor after (checkpoint / pending / event) |
|-----:|---------|------------------|-------------------|---------------------------------------------|
| 1–3 | `adopt`, `sync-cursor`, `set-cadence --profile checkpoint` | none | no | — |
| 4 | `pull-item --item-level delivery_story` | `DELIVERY_STORY_READY`, `ARTIFACTS_MATERIALIZED` | no | `next_story_confirmation` / `navigator_story_confirmation` / `expand` |
| 5 | `set-flow-unit --unit delivery_story` | `DELIVERY_STORY_SCOPE_CONFIRMATION` | no | `next_story_confirmation` / `navigator_story_confirmation` / `navigator_flow_unit_selected` |
| 6 | `plan-delivery-story --objective ... --child ... --child ...` | `DELIVERY_STORY_PLAN_CHECKPOINT`, `ARTIFACTS_MATERIALIZED` | yes | `after_delivery_story_plan` / `navigator_delivery_story_plan_approval` / `delivery_story_plan` |

Step 6's stdout contains no scope-confirmation text. The scope question is emitted by a
command that writes no Plan artifact, and the Plan is written only by a later, separate
invocation.

**Code.** `renderFlowUnitScopeConfirmationReport` has one caller, `runSetFlowUnit`, and
`planDeliveryStoryCheckpoint` has one caller, `runPlanDeliveryStory`, both in
`ts/src/builder/commands.ts`. No command chains them.

**History.** The same split held in Python from the surface's introduction (`66dee282`,
2026-07-02) through the commit that recorded AF-004 (`26415e3c`, 2026-07-15):
`cmd_set_flow_unit` printed the scope confirmation, and `cmd_plan_delivery_story`
printed only the Plan report and its artifacts. No runtime version produced one
`plan-delivery-story` invocation emitting both surfaces. The observation is consistent
with an agent running `set-flow-unit` and `plan-delivery-story` in the same turn. That
is an inference: the ledger does not preserve the original transcript.

**Existing coverage.** `ts/test/goldens/builder-command.golden.json` pins the byte-exact
stdout of `set_flow_unit_selects_delivery_story` (scope confirmation only) and
`plan_delivery_story_creates_checkpoint` (Plan checkpoint and artifacts only), and pins
the project files the latter writes. At reproduction time, no case pinned that
`set-flow-unit` leaves project files unchanged.

**Residual.** The runtime never records a pending scope confirmation, and
`plan-delivery-story` neither reads nor requires one. The scope question is a
conversational stop: it stays honest only if the agent waits for the Navigator's answer
before planning. `.pi/skills/mm-build/SKILL.md` does not instruct that wait, so a single
agent turn can still reproduce AF-004's visible shape. The same skill names the wrong
surface for `set-flow-unit --unit` (`NAVIGATOR_FLOW_UNIT`, which the runtime prints only
when inspecting without `--unit`). Separately, the story-by-story confirmation Expand
leaves pending survives flow-unit selection: after step 5 the cursor still reports
`navigator_story_confirmation`, which Delivery Story flow never consumes and step 6
overwrites. That is captured as
[CR105](cr105-choosing-delivery-story-flow-leaves-the-story-confirmation-pending.md),
outside CR001 and outside the trust floor.

### Implementation (2026-09-26)

- `.pi/skills/mm-build/SKILL.md`, **Delivery Story Navigator Flow**: `set-flow-unit
  --unit delivery_story` returns `DELIVERY_STORY_SCOPE_CONFIRMATION`, and the section
  now states the stop. The agent ends its turn after the surface and does not run
  `plan-delivery-story` in the same turn, even when the request also asked for the
  Plan. Cadence and Plan preauthorization do not remove the stop. `NAVIGATOR_FLOW_UNIT`
  is now attributed to inspection without `--unit`. **Delivery Story Plan Ariad Work**:
  surfacing the flow-unit choice with `set-flow-unit` ends the turn at the scope
  confirmation. `.agents/skills/mm-build` is a symlink to this file, so Codex reads the
  same text. The Claude Code copies have no Ariad section; CR102 ports this one and
  carries the stop with it.
- `ts/test/builder/commands.test.ts`, test `CR001: ...`: on the golden's
  `adopted_prepared_ds` seed, `set-flow-unit --unit delivery_story` emits only the
  scope confirmation and leaves the project snapshot unchanged, and a later
  `plan-delivery-story` emits only the Plan checkpoint and artifacts, never re-asks the
  scope question, and is the command that writes `plan.md`. It passes on the unchanged
  runtime, since it pins existing behavior. It was checked against two temporary
  mutants of `ts/src/builder/commands.ts`, each reverted: `plan-delivery-story`
  re-printing the scope question (the AF-004 shape) fails the surface assertion, and
  `set-flow-unit` silently materializing the Plan fails the disk assertion.
- Checks: typecheck, lint (clean for the changed files), 2,707/2,707 tests,
  `checkRetiredSurfaces`, `checkDocLinks`, `checkSkillCommandParity`, and the Builder
  lifecycle smoke (54/54).

### Navigator validation (2026-09-26)

Route: a fresh Pi session in this checkout with `MIRROR_HOME` pointed at a scratch home.
In it, journey `cr001-validate` had Ariad adopted, `checkpoint` cadence, and a pulled,
expanded Delivery Story in the default story-by-story flow. After
`/mm-build cr001-validate`, the Navigator asked in one message for both moves: "Let's
work this at the Delivery Story level and plan the DS." Pass meant the turn ends at the
full `DELIVERY_STORY_SCOPE_CONFIRMATION` with no `plan.md`, and the Plan appears only
after a second message. Fail meant a Plan in the first turn, `plan.md` before the second
message, or a summarized surface.

The Navigator reported the route passed and accepted it. The scratch home corroborates
it. The front-door log shows `set-flow-unit` at 21:05:35Z and `plan-delivery-story` only
at 21:06:50Z, five seconds after the Navigator's "Scope is right, plan it." (21:06:45Z).
The conversation log shows the first assistant turn (21:05:42Z) carrying the scope
confirmation and no Plan checkpoint. The cursor ended at
`after_delivery_story_plan` / `navigator_delivery_story_plan_approval`, with `plan.md`
present. The real Mirror home has no `cr001-validate` journey or conversation.

### Debt review (2026-09-26)

1. The stop lives in skill prose, and the runtime does not enforce it. That was the
   decided trade-off, not debt.
2. The Claude Code skill copies lack the stop because they lack the whole Ariad section.
   CR102 ports that section and carries the stop by design.
3. `set-flow-unit --unit story_by_story` renders `NEXT_STORY_CONFIRMATION`, which asks the
   same kind of pre-plan question. The skill documents no route to it; CR105's planning
   note already covers the reverse switch. This is a conscious exclusion.
4. The regression test matches the scope question's text. That is intentional: the
   skill's stop exists because of that question, so rewording it should force a second
   look at the skill.
5. Found during validation, not created by this change: a Pi session started against a
   scratch `MIRROR_HOME` is not isolated from personal transcripts. Its session-start
   maintenance backfilled 793 Pi sessions (50,737 messages) into the scratch home,
   wrote a pre-write backup containing them, and retitled five conversations through
   the LLM, all before the first prompt. The files are owner-only. This is outside
   CR001's scope; it is captured as
   [CR106](../rs010-cv22-oracle-and-port-hygiene/cr106-a-pi-session-in-a-scratch-mirror-home-copies-the-whole-pi-history-into-it.md),
   and the scratch homes were deleted.

No finding blocks closure. Navigator decision (2026-09-26): no action.

## Outcome

Validated 2026-09-26, with debt review decided as no action. Closure waits for green CI
on the pushed change.
