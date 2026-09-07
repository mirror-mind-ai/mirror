[< Parent](../index.md)

# CV22.DS7.TS1 — Ops/utility tail

**Status:** 🟡 Planned
**Type:** Technical Story

---

## Technical Story

In order to support the delivery capability,
As an engineering team/system component,
I want to Ops/utility tail,
So that the expected technical outcome is available.

## Outcome

Navigator can validate Ops/utility tail as an observable behavior.

## Acceptance Behavior

```text
Given the system is ready for Ops/utility tail
When the planned technical change is applied
Then the expected technical outcome is observable
And unrelated Delivery Story scope remains untouched
```

## Scope

Reconciled 2026-09-07 against `src/memory/__main__.py` dispatch and
`ts/src/frontDoor/routing.ts`; the [burn-down ledger](../burn-down-ledger.md)
is the auditable denominator.

- Top-level commands still on Python fallback (0/8): `backup`,
  `repair-encoding`, `extensions`, `ext`, `welcome`, `migrate-legacy`,
  `runtime` (see Open Decisions), `journey-projection`.
- Subcommand branches US1 deferred here: `list extensions|all`,
  `inspect extension|runtime-catalog|llm-calls|embedding-provenance`.
- The `repair-journeys --apply` routing line, which US10 left on Python until
  `backup` is ported (Python gates the mutating repair behind the dated zip
  archive `backup` produces; the front door's fixed-name pre-write snapshot is a
  weaker property).

## Out Of Scope

- `conversation-logger` mute/switch — flipped in US5.
- `transcript-export` — not a command; its live seam (the transcript backfill)
  was ported in US10, and `export_transcript`/`export_last_turn` have no
  production caller. DS10 deletion inventory.
- Sibling DS7 stories (US6–US9); live-provider cutover (DS8); MCP (DS9);
  Python deletion, rename, and npm (DS10).

## Open Decisions (resolve at plan time, not silently)

- `runtime` — ≈3k lines; `update|pull|stable|release-doctor|release-notes|`
  `release-promote` are the safe runtime updater and release-promotion
  machinery, closer to DS10's runtime/package cutover than to the rest of this
  tail. Port here, or hand to DS10 and move the ledger denominator 32 → 31.
- `memory-rehearse-migration` — `cli/migration_rehearsal.py` console script,
  outside the `python -m memory` denominator; open discussion in
  `docs/project/decisions.md` since 2026-04-17. Port here, or DS10 removes it
  and closes the discussion.
- Whether `backup` goes first as its own slice: it unblocks
  `repair-journeys --apply` and is the backup gate the other write ports lean on.

## Validation

Navigator-visible validation route plus automated checks.
