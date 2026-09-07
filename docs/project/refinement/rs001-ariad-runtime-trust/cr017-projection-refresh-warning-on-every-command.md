[< RS001](index.md) · [Canonical status](../index.md#change-requests)

# CR017 — Every mutating Ariad command warns that the Operational projection failed, and names no consequence

## Problem

Across a full Builder session on the `kia-desktop` journey (2026-09-07, three
Technical Stories pulled, planned, validated and closed), every mutating Ariad
command printed one to three copies of:

```text
Operational projection refresh failed after source commit: code=schema_validation_failed
```

Observed on `pull-item` (×3 per call), `set-flow-unit`, `plan-item`,
`approve-plan`, `validate-item`, `review-item`, `coherence-item` and
`done-item`. `build load` and read-only commands did not print it. The source
commit succeeded every time — the surfaces that followed described the right
cursor state, and the next `build load` resumed correctly.

The line comes from `journey_projections/refresh.py`: after source truth is
committed, the Operational projection is recompiled and published; a
`ProjectionError` (here `SCHEMA_VALIDATION_FAILED`, raised for instance when the
compiled document carries no `sourceRevision`) is caught, recorded as a failed
outcome and logged at WARNING. Nothing downstream in the Builder path reacts to
the failed outcome.

What the Navigator sees is a warning with no subject: it does not say what the
Operational projection feeds, whether any consumer (`client.py`, the extensions
API, `journey_projection` CLI) is now reading a stale document, or whether the
condition is transient or permanent for this journey. It repeated for hours and
carried no information after the first occurrence.

## Expected Behavior

One of two honest shapes:

- **It matters.** The command names what is now stale (which consumers read the
  projection, since which revision) and how to repair it (a `journey_projection`
  rebuild, a migration, a schema fix), once per session or once per journey —
  not once per command.
- **It does not matter to Builder work.** The failure goes to the log at the
  appropriate level and never reaches the Builder surface transport; the
  projection's own CLI reports it on inspection.

Either way, `schema_validation_failed` after a successful source commit is a
runtime defect to diagnose, not a steady state to tolerate: the projection of a
journey that is being actively driven should compile.

## Impact

Runtime trust, the RS001 boundary. A warning that fires on every command and
changes nothing teaches the Navigator to ignore warnings — the exact habit that
hides the one that matters. It also leaks into agent transcripts, where it has
to be filtered out of every surface rendering, which is how two other surfaces
in the same session came to be trimmed by mistake (CR020).

## Plan Or Decision

Pending. Diagnose first: why does the compiled Operational document for this
journey fail schema validation while source commits succeed (missing
`sourceRevision`? a compiler path that skips it for journeys with a Builder
cursor?). Then choose the shape above. Capture does not authorize either.

## Evidence

Session of 2026-09-07 on journey `kia-desktop` (Mirror runtime at
`/Users/vinicius/dev/workspace/mirror`, production clone). Representative
excerpt, `pull-item` for `CV8.DS4`:

```text
Operational projection refresh failed after source commit: code=schema_validation_failed
Operational projection refresh failed after source commit: code=schema_validation_failed
Operational projection refresh failed after source commit: code=schema_validation_failed
<<<ARIAD:DELIVERY_STORY_READY>>>
...
```

Every later lifecycle command in the session (TS1, TS2 and TS3 of CV8.DS4)
reproduced it. Code: `src/memory/journey_projections/refresh.py` (`refresh`,
`_failed`, `_revision`), `src/memory/journey_projections/errors.py`
(`SCHEMA_VALIDATION_FAILED`).

## Outcome

Pending.
