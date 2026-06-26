# Plan — CV20.DS6 Refinement Workbench And Flow

## Intent

Add Refinement Work to Builder as a proportional path for caring for existing
capability. Builder should no longer force every adjustment into the roadmap
Delivery Story lifecycle or leave small changes as conversation memory.

The runtime should distinguish work fields:

```text
Roadmap   -> Delivery Stories   -> Delivery Work
Workbench -> Refinement Stories -> Refinement Work
Explorer  -> Exploratory Stories -> Exploration / promotion
```

The selected field determines the flow. A roadmap item enters Delivery Work. A
Workbench item enters Refinement Work.

## Method Reference

Ariad introduced Refinement on branch `ariad-refinement-workbench`, commit
`2447705`.

Method concepts to mirror:

- Workbench as the project surface for Refinement Work.
- Change Request, CR, as requested-change unit.
- Refinement Story, RS, as refinement narrative and flow unit.
- Refinement Work as RS-level flow plus CR-level cycles.
- Review and Coherence at RS level.
- Mutations only through CR cycles.

## Scope

DS6 should deliver a minimal end-to-end runtime path:

1. Builder activation can render current Delivery and Refinement fields.
2. The runtime can persist RS and CR records outside roadmap files.
3. The Navigator can create an RS and add CRs to it.
4. The Navigator can pull an RS into active Refinement Work.
5. The Builder can select and traverse CRs one at a time.
6. Each CR can be confirmed, planned, implemented, validated, and marked done.
7. The RS can be reviewed, checked for coherence, and closed.
8. CR outcomes are preserved as implemented, parked, rejected, or promoted.

## Out of Scope

- Signal Field.
- Automatic grouping, clustering, or recommendation of RSs from CRs.
- Web UI for Workbench.
- Full debt ledger storage and refactor loop.
- Release intent, push, tag, stable promotion, or release authorization.
- Project-local method preference override resolution.
- General method marketplace or non-Ariad method implementation.

## Design Notes

### Builder Home

Builder load should evolve from a single resume surface toward a situated work
home. It should show available real work rather than static menu choices.

Initial fields:

- Delivery field: active delivery cursor, next roadmap candidate, checkpoint.
- Refinement field: active RS, draft/open RS count, candidate CR count, next
  refinement move.

### Workbench storage

The first implementation can use Mirror runtime state or dedicated tables. The
choice should be made during TS1 after inspecting current Builder state helpers,
metadata conventions, migration patterns, and query needs.

Storage must preserve:

- RS id, title, description, status, created/updated timestamps.
- CR id, title, request body, status, RS association, order, outcome notes.
- active RS and active CR state per journey where needed.

### Refinement flow

RS flow:

```text
pull
select next CR
CR cycle
select next CR
CR cycle
review
coherence
close
```

CR cycle:

```text
confirm
plan
implement
validate
done note
```

Review must not mutate files directly. If Review finds required changes, those
changes become new CRs or future work.

### Quick refinement

Quick refinement is not a separate unit. It is a short experience that creates a
minimal RS with one CR and pulls it immediately.

## Seed Change Requests

These provisional CRs are captured before Workbench exists. Migrate them into the
Workbench once DS6 provides durable RS/CR storage.

### CR: Roadmap Snapshot focuses CV10 instead of active Builder work

Status: implemented as immediate pre-Workbench refinement.

Context: during Builder activation for `builder-mode-evolution`, `ROADMAP
SNAPSHOT` displayed CV10 because snapshot focus reads
`docs/project/roadmap/index.md` and prioritized textual status `Planned`, while
CV20 is marked `🟢 In Progress`.

Requested change: normalize roadmap status interpretation and/or bias snapshot
focus toward the active journey or current recommended pull so Builder Home shows
the relevant CV20/DS6 field.

Outcome: roadmap snapshot now strips markdown links from roadmap table cells,
treats `In Progress` as active, and uses the recommended pull candidate's CV as
focus when candidates are available. Builder activation now shows CV20 and
CV20.DS6.US1 instead of CV10.

Why it matters: Builder Home must orient the Navigator around the real current
work field. Showing CV10 while recommending CV20.DS6.US1 creates trust drift.

Candidate target: `CV20.DS6.US1 Builder Home Work Fields`.

### CR: Ariad marked surfaces can be summarized instead of rendered

Status: candidate.

Context: during the pull of `CV20.DS6.US1`, the command returned marked Ariad
surfaces for `DELIVERY_STORY_IDENTIFIED` and `PREPARE_FIELD_READING`, but the
assistant summarized them instead of rendering them visibly before commentary.

Requested change: Builder-facing instructions and/or runtime surface handling
should require marked Ariad surfaces to be rendered as product surfaces before
interpretation or summary.

Why it matters: Ariad surfaces are Navigator-facing product output, not command
logs. If they disappear into summaries, the Navigator loses checkpoint evidence
and the method becomes less inspectable.

Implementation reminder: harden this in two places. First, update the `/mm-build`
skill contract with an explicit operational rule requiring visible rendering of
marked Ariad surfaces before commentary. Second, consider a runtime helper that
detects `<<<ARIAD:...>>>` blocks and makes required surface rendering harder to
skip.

Candidate target: `CV20.DS6.US1 Builder Home Work Fields`.

### CR: Builder should show roadmap position after Delivery Work Done

Status: candidate.

Context: after closing `CV20.DS6.US1`, the Navigator asked where we are in the roadmap. The answer required a separate journey/roadmap inspection, even though Done is the exact moment when orientation and next movement become most valuable.

Requested change: after a Delivery Work story reaches Done, Builder should render a roadmap-position surface that shows the current CV/DS/story position, completed item, remaining sibling items, upcoming delivery stories, and the recommended next pull. The surface should be visible before commentary, similar in spirit to Builder Home, and should preserve the Done boundary by not pulling or executing any next item automatically.

Why it matters: Done should not leave the Navigator in a blank operational space. A situated roadmap surface turns closure into orientation, makes progress legible, and helps choose the next movement without requiring a separate status request.

Candidate target: a later DS6 Refinement Story once Workbench storage exists, or promotion to Delivery Work if the surface becomes part of the formal Delivery lifecycle contract.

### CR: Ariad plan command can overwrite detailed human-authored plan content

Status: candidate.

Context: during `CV20.DS6.TS1`, a detailed plan with persistence and storage/API strategy was written to `plan.md`, then the Ariad `plan-item` command regenerated the plan artifact and replaced it with a generic checkpoint-shaped plan. The Navigator noticed the missing persistence and API strategy. This kind of overwrite has happened more than once and creates trust drift because carefully authored plan content can be silently lost.

Requested change: harden plan artifact creation so runtime plan checkpoint commands do not overwrite an existing non-empty `plan.md` without explicit merge/replace confirmation. If a plan already exists, the command should preserve it, append checkpoint metadata elsewhere, or render a `PLAN_ARTIFACT_CONFLICT` surface requiring Navigator choice. The behavior should distinguish between creating a missing plan file and updating lifecycle cursor/checkpoint state.

Why it matters: Plan is the contract for implementation. Losing details during checkpoint rendering weakens approval, increases rework, and can hide important design decisions such as persistence strategy or API boundaries.

Implementation reminder: add regression coverage around `plan-item` when `plan.md` already contains human-authored content. The expected behavior should preserve the existing content unless an explicit replace flag or Navigator-approved overwrite path is used.

Candidate target: a later DS6 Refinement Story once Workbench storage exists, or promotion to Delivery Work if plan artifact safety becomes a formal Ariad lifecycle contract.

### CR: Validation checkpoint must show manual test script for Navigator

Status: candidate.

Context: during `CV20.DS6.US2`, the Validation checkpoint showed automated checks, E2E evidence, expected observation, pass condition, and fail condition, but did not present a concrete step-by-step manual script that the Navigator could run or follow directly. The manual route existed in the test guide and validation command metadata, but the checkpoint surface itself was not operational enough for Navigator validation.

Requested change: every Validation checkpoint should include a Navigator-facing manual test script in addition to automated validation results. The script should be concrete and executable/followable: commands to run, conversational steps to perform when relevant, expected visible surfaces, and what counts as pass/fail. This should be part of the required validation surface, not only hidden in docs or summarized after the checkpoint.

Why it matters: Validation is a Navigator decision point, not just a CI report. The Navigator needs an explicit route to experience or inspect the implemented behavior before accepting validation.

Implementation reminder: extend validation checkpoint data/rendering to include a required `manual test script` or `navigator test script` section. Update tests so validation cannot pass when E2E/manual validation is required but the checkpoint lacks a concrete manual script.

Candidate target: a later DS6 Refinement Story once Workbench storage exists, or promotion to Delivery Work if validation surface completeness becomes a formal Ariad lifecycle contract.

## Risks

- Builder Home can become too broad if it tries to solve all navigation at once.
- Workbench storage can overfit before dogfooding reveals real query needs.
- CR cycles can become too ceremonial if every CR requires the full Delivery
  checkpoint weight.
- Refinement may become a hidden delivery path if promotion rules are not
  enforced.

## Validation Approach

Automated validation should cover:

- Workbench persistence and ordering.
- RS and CR status transitions.
- Builder load surfaces with and without workbench state.
- Pulling an RS into active Refinement Work.
- CR cycle gates and invalid transitions.
- RS review/coherence/close behavior.

Manual validation should dogfood the target workflow:

1. Use a sandbox Builder lifecycle session.
2. In a separate Mirror Builder session, create `RS-001 Builder lifecycle
   end-to-end refinement`.
3. Add multiple CRs from observed lifecycle friction.
4. Pull the RS.
5. Traverse at least one CR cycle end to end.
6. Review, coherence-check, and close the RS or leave it active with clear state.

## Documentation Impact

Update as behavior lands:

- `REFERENCE.md` if new CLI commands are introduced.
- `docs/product/specs/runtime-interface/index.md` if activation or runtime
  lifecycle contracts change.
- `docs/project/briefing.md` for stable Builder baseline changes.
- `docs/project/decisions.md` for the Workbench and Refinement adoption decision.
- `docs/process/development-guide.md` if local working process changes.
- CV20 roadmap and worklog when milestones close.

---

## Aggregate Closure Plan

**Status:** approved
**Navigator Flow Unit:** delivery_story

Close aggregate CV20.DS6 after all Refinement Workbench child stories have completed and been Navigator-validated.

Child work packages:

- CV20.DS6.US1
- CV20.DS6.TS1
- CV20.DS6.US2
- CV20.DS6.US3
- CV20.DS6.TS2
- CV20.DS6.US4
- CV20.DS6.US5

Boundary: aggregate closure records validation, review, coherence, and done only; push and release remain separate hard gates.
