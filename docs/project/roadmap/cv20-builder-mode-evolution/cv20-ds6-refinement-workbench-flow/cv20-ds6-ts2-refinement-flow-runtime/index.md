[< CV20.DS6](../index.md)

# CV20.DS6.TS2 — Refinement Flow Runtime

**Type:** Technical Story  
**Status:** 🟡 Planned

## Story

In order to execute Refinement Work consistently, as the Builder runtime, I want
state transitions for RS-level flow and CR-level cycles so that invalid moves are
blocked and active refinement can resume safely.

## Outcome

Runtime supports RS pull, CR selection, CR confirmation, CR plan, CR validation,
CR done note, RS review, RS coherence, and RS close as explicit stateful steps.

## Notes

Review and Coherence must not mutate files directly. Required changes discovered
there must return to CR cycles or future work.
