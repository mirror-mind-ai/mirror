[< CV19](../index.md)

# CV19.DS4 — Confirmation And Safe Identity Mutation

**Status:** 🟢 Implemented · awaiting Pi validation

**User-visible outcome:** A proposal can be applied only after explicit confirmation.

## Scope

- Add confirmed identity application for `self`, `shadow`, `ego`, and `persona`.
- Require explicit `--confirm APPLY`.
- Preserve existing identity content by default.
- Store each confirmed integration as an individual record.
- Append the exact proposed content under the target layer's integration section.
- Render a visible identity-updated surface.

## Acceptance Behavior

Given the user has not explicitly confirmed, no identity is changed.

Given the user confirms, Mirror creates an individual identity integration record, appends the exact proposed content to the target layer/key, and renders confirmation.

Given persona is targeted, a persona key is required.

## Non-goals

- No automatic mutation.
- No journey identity mutation.
- No hidden proposal persistence before confirmation.
- No replacement of existing identity content unless a future explicit replacement flow is designed.
