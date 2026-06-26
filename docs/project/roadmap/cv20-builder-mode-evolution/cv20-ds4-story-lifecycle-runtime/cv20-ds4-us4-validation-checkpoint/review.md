[< Story](index.md)

# Review — CV20.DS4.US4 Validation Checkpoint

## Changed Surface

- Added `validate-item` for Ariad-adopted journeys.
- Added deterministic `VALIDATION_CHECKPOINT` surface.
- Validation now distinguishes:
  - automated evidence;
  - E2E decision/evidence;
  - Navigator-visible validation route;
  - explicit Navigator acceptance.
- A validation route is not treated as Navigator acceptance.
- Pending `navigator_validation` can now transition to `validation_passed` when validation is rerun with explicit Navigator acceptance.

## Runtime Behavior

- Validation blocks before implementation completion evidence.
- Validation remains pending when Navigator acceptance is missing.
- Validation passes when automated checks pass, required E2E evidence is present, and Navigator acceptance is explicit.
- Successful validation clears `active_checkpoint` and `pending_confirmation`, and records `last_delivery_event=validation_passed`.
- Validation can materialize `validation.md` in the active story package.

## Surface Transport

Dogfooding exposed that successful validation acceptance must still return the deterministic surface block. This was addressed through `CV20.DS4.TS6 — Surface Transport Contract`, making Ariad surfaces phase-independent runtime artifacts with verbatim transport.

## Debt

- The Validation checkpoint currently accepts evidence as command-line parameters. Future work may improve evidence collection ergonomics and typed evidence artifacts.
- Debt Review and Coherence transitions remain future DS4 stories.

## Decision

Done. Manual validation confirmed both pending and accepted validation flows.
