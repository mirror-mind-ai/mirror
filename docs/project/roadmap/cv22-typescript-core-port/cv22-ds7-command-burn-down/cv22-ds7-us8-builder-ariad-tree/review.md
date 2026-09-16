# Review — CV22.DS7.US8

## Status

Reviewed

## Debt Findings

- Session-start race on the single pre-write backup drops the first user prompt of every session since 2026-09-11 (DS4 seam / conversation-logger hooks, not Builder); mechanism and evidence in test-guide.md
- prepare-item overwrites an approved Plan unconditionally (Python parity-bound); this story's own cursor was demoted once
- Three readers of the Builder token grammar (buildRoute.ts, two closures in argv.ts); test/helpers/builderInvoke.ts is a pure re-export shim
- Exactly tied search scores are ordered differently by the two engines (search family, not load); load ordering depends on a live clock
- A degraded load is indistinguishable from a healthy one and usually renders an empty memories block (product change, CR candidate)
- DS Done preflight refuses the dated Done status form this repository uses (_is_done endswith rule)
- load embeds the same query twice; two Ariad surfaces print absolute paths raw; surfaces render 'uv run python -m memory build' literals
- Eager front-door route loading defeats per-family reverts (fixed for build by lazy import; general case is a CR under RS009)

## Debt Decision

defer

## Defer Reason

Every finding is a parity-bound reproduction or belongs to another family; none is on the flip's critical path, and each is recorded with its evidence in plan.md and test-guide.md

## Revisit Trigger

DS10 Python retirement; the first Builder leaf that grows an option; or the next report of a lost first prompt

## Missing Decision

- none
