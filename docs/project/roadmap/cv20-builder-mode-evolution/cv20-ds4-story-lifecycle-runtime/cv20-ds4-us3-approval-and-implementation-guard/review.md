[< Story](index.md)

# Review — CV20.DS4.US3 Approval And Implementation Guard

## Changed Surface

- Added deterministic Plan approval transition through `approve-plan`.
- Added deterministic implementation guard surfaces for both allowed and blocked states.
- Strengthened implementation permission so absence of a pending confirmation is not enough; the active item must have `last_delivery_event=plan_approved`.

## Runtime Behavior

- `approve-plan` clears the pending Navigator approval checkpoint and records `plan_approved`.
- `check-implementation` renders an Ariad `IMPLEMENTATION_GUARD` surface.
- When blocked, `check-implementation` exits without mutating project files.
- When allowed, `check-implementation` confirms that implementation may begin under the approved Plan contract.

## Debt

None identified for this lifecycle checkpoint. Later implementation/validation phases will define their own surfaces.

## Decision

Done. The approval transition and implementation guard are deterministic and covered by CLI tests.
