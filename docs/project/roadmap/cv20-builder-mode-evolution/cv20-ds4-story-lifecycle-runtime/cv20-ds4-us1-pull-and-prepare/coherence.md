[< Story](index.md)

# Coherence — CV20.DS4.US1 Pull And Prepare

## Process

The story followed the Ariad lifecycle slice:

- Pull selected an active roadmap candidate and stopped before Prepare.
- Prepare read the terrain for the pulled item and stopped before Plan.
- Navigator validation happened in Pi/Mirror for both Pull and Prepare.

## Project

DS4 now has the first executable lifecycle movement after roadmap inspection:

- `CV20.DS4.US0` shows the roadmap and candidates.
- `CV20.DS4.US1` lets the Navigator intentionally pull a candidate and then prepare it.
- `CV20.DS4.US2` remains the next planned step for the Plan checkpoint gate.

## Product

The user-facing behavior matches the boundary. Builder can move from candidate inspection to active Delivery Work without silently advancing into Plan or implementation. Pull and Prepare render Ariad visual grammar surfaces and preserve Navigator control.

## Validation Alignment

Automated validation passed. Pull and Prepare were validated in Pi/Mirror with `sandbox-pet-store`.

## Result

Coherent. The story can be marked Done.
