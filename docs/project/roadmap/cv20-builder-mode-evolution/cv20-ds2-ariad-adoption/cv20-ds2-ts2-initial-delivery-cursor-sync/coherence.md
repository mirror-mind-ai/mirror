[< Story](index.md)

# Coherence — CV20.DS2.TS2 Initial Delivery Cursor Sync

## Process

The story followed the approved Ariad flow:

- Pull selected the remaining DS2 sync gap.
- Prepare identified runtime cursor persistence as technical substrate.
- Plan was approved before implementation.
- Implementation added a contained cursor helper and CLI command.
- Validation included focused automated tests, lint, formatting, mypy, and CLI smoke.
- Review found no pay-now debt.

## Project

Roadmap state is now aligned with DS2's adoption substrate:

- `CV20.DS2.TS1` records and reads adopted Builder methods.
- `CV20.DS2.US1` lets a journey adopt Ariad.
- `CV20.DS2.US2` prepares method-declared Ariad templates.
- `CV20.DS2.TS2` syncs the initial runtime delivery cursor.

`CV20.DS2` can close after this story because its done condition names adoption preparation plus checked/generated/configured/synced reporting, all now represented by the DS2 children.

## Product

The cursor sync behavior preserves the product boundary. It stores operational resume state in SQLite while leaving historical roadmap truth in files. It does not infer active items, execute lifecycle events, transition story status, commit, push, or release.

## Validation Alignment

Validation evidence in `test-guide.md` matches the plan. CLI smoke with `sandbox-pet-store` confirmed the expected cursor state and lifecycle boundary.

## Follow-Up

`CV20.DS3 — Builder Resume Surface` should consume this cursor state and render the Builder resume moment. Active roadmap item resolution and checkpoint inference belong there or in DS4, not in DS2.

## Result

Coherent. The story and DS2 can be marked Done.
