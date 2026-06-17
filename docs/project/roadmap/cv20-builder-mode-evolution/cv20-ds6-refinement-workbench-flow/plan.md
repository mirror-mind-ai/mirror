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
