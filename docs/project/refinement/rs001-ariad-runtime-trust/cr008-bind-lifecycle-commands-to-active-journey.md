[< RS001](index.md) · [Canonical status](../index.md#change-requests)

# CR008 — Bind Lifecycle Commands To The Active Builder Journey

## Problem

During a Builder session activated for `kia-backend` (`build load kia-backend`),
`build pull-item --method ariad` invoked **without** `--journey` resolved to a
different journey. The command emitted `DELIVERY_STORY_IDENTIFIED` claiming
`commitment: pulled into active Delivery Work / active item: CV3.DS4.TS2` — a
kia-backend roadmap item — but persisted that commitment to the **kia-desktop**
delivery cursor, overwriting its prior state. The kia-backend cursor was left
untouched, so the surfaced commitment never existed for the journey it named.

Journey resolution was also inconsistent within one session: in a single shell
chain, `prepare-item` (no `--journey`) resolved to a journey and executed, while
the immediately following `plan-item` failed with `Builder method plan requires a
journey`.

Reproduced 2026-08-13 on a **third journey pair** (`amplia-website` → `kia-backend`,
see Evidence), which extends the defect beyond cursor state: `Expand` and
`plan-delivery-story` also **materialized roadmap files into the wrong project's
working tree**. The fallback is therefore not limited to persisted runtime state; it
redirects filesystem writes into an unrelated repository.

## Expected Behavior

Lifecycle commands must bind deterministically to the active Builder journey, or
refuse and ask for `--journey` — never fall back silently to another journey. The
journey a command persists to must be the journey its emitted surface speaks for;
a surface must not claim a commitment that was written elsewhere or not written at
all. Resolution must be consistent across commands within the same session.

## Impact

Silent cross-journey state corruption: one journey's resume state is clobbered
(kia-desktop lost `CV3.DS18.US4 / done_complete`), while the operating journey's
lifecycle blocks on stale state (`Prepare must be completed before Plan` against
an already-done item). Because the surfaces asserted success, the defect was only
discovered by direct storage inspection — a direct breach of the surface-trust
promise RS001 exists to protect.

## Plan Or Decision

Pending. Capture does not authorize a resolver change. First characterize where
journey fallback lives (conversation session, most-recent runtime session, or
per-command resolution) and why `prepare-item` and `plan-item` disagreed within
one chain.

## Evidence

Reproduced 2026-08-04 while operating the kia-backend journey:

```text
# pull-item without --journey — surface claimed kia-backend's item:
commitment: pulled into active Delivery Work
active item: CV3.DS4.TS2

# same output, auto-Prepare terrain read (kia-desktop's terrain — the file
# exists in kia-backend):
○ docs/process/development-guide.md: missing

# persisted cursors afterward:
__builder_delivery_cursor__:kia-desktop  → active_item CV3.DS4.TS2   (clobbered)
__builder_delivery_cursor__:kia-backend  → active_item CV3.DS2.US1   (unchanged)

# same-chain inconsistency:
prepare-item (no --journey) → executed, rendered PREPARE_FIELD_READING
plan-item    (no --journey) → "Builder method plan requires a journey"
```

Recovery: re-running `pull-item` with explicit `--journey kia-backend` persisted
correctly (verified by reading the cursor row). The kia-desktop cursor's prior
value was recovered from `backups/memory_20260804_124634.zip`
(`CV3.DS18.US4`, `done_complete`, `stepwise`) and restored with explicit
Navigator approval.

**2026-08-13 — reproduced from `amplia-website`, with filesystem contamination.**
A Builder session was activated with `build load amplia-website`. Every subsequent
lifecycle command was issued from the Mirror working directory **without**
`--journey`, and all of them resolved to `kia-backend`:

```text
# commands issued (no --journey), active journey was amplia-website:
build pull-item --item-code DS-05 --item-level delivery_story
build set-flow-unit --unit delivery_story
build plan-delivery-story --child DS-05.TS1 --child DS-05.US1 --child DS-05.US2

# files materialized into the WRONG repository:
kia-backend/docs/project/roadmap/ds-05-landing-narrative-v4/index.md
kia-backend/docs/project/roadmap/ds-05-landing-narrative-v4/plan.md
kia-backend/docs/project/roadmap/ds-05-landing-narrative-v4/test-guide.md
kia-backend/docs/project/roadmap/ds-05-landing-narrative-v4/ds-05-us1-.../index.md

# plan.md header names the journey it actually wrote for:
**Journey:** kia-backend
# ...above an objective written for the Projeto Ampl.IA landing page, in Portuguese.

# cursors afterward:
__builder_delivery_cursor__:kia-backend    → DS-05 / Landing Narrative V4 /
                                             plan:pending          (clobbered)
__builder_delivery_cursor__:amplia-website → active_item null /
                                             template_preparation  (never advanced)

# kia-backend cursor before the session (backups/memory_20260813_144238.zip):
active_item CV3.DS8 — "Entrada: resolução de conta no login + sign-up in-app +
auth pré-conta", next_story_confirmation, expand, checkpoint
```

Two aggravating details from this occurrence:

- The Delivery Story package for DS-05 had been **authored by hand** in
  `amplia-website` before Pull, with three candidate stories. `Expand` never saw it
  and generated a generic single-child expansion from the story title instead. The
  authored index survived only because the runtime was operating on a different
  repository entirely — not because no-clobber worked.
- Because `ARTIFACTS_MATERIALIZED` prints **project-relative** paths, the Navigator
  inspected the correct project, found nothing, and reasonably concluded the surface
  was reporting phantom writes. The defect masqueraded as a CR003 regression for the
  remainder of the session. See CR009.

2026-08-14 — Re-verified against `origin/main` @ `688271f`: no commit since 12 Aug touches
`src/memory/cli/build.py` or `src/memory/builder/`; journey resolution is unchanged. Still valid.

## Outcome

Pending.
