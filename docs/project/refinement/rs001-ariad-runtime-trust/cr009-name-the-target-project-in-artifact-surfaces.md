[< RS001](index.md) · [Canonical status](../index.md#change-requests)

# CR009 — Name The Target Project In Artifact Materialization Surfaces

## Problem

`ARTIFACTS_MATERIALIZED` reports paths relative to the project root without naming
the project, journey, or absolute root it wrote to. When a path is correct relative
to the wrong project, the surface is literally truthful and practically misleading.

Observed 2026-08-13: lifecycle commands issued for `amplia-website` resolved to
`kia-backend` (CR008) and reported

```text
✓ created plan
docs/project/roadmap/ds-05-landing-narrative-v4/plan.md
```

The Navigator inspected exactly that path inside `amplia-website`, found nothing,
searched two repositories, and concluded the runtime was fabricating write reports —
a suspected regression of the already-closed CR003. The real defect, a journey
resolution fallback, stayed hidden for the rest of the session. The written files
were found only by a timestamped filesystem sweep across the whole workspace.

## Expected Behavior

Every artifact surface names the target it wrote to, so a Navigator can verify the
claim without knowing which journey the runtime resolved internally. Naming the
journey, the project root, or an absolute path all satisfy this; the current
bare project-relative path does not.

The requirement is diagnostic honesty rather than correct resolution: even after
CR008 is fixed, a surface that cannot be verified from its own output leaves the
Navigator unable to distinguish "written elsewhere" from "not written".

## Impact

Path ambiguity converts a loud, locatable defect into a silent one and misdirects
diagnosis toward the wrong Change Request. In this occurrence it also produced a
false accusation against closed work: CR003 was reported as regressed when its
contract had in fact held.

This directly weakens the trust boundary RS001 exists to protect. A deterministic
surface that cannot be checked against disk is not deterministic in any way that
helps the reader.

## Plan Or Decision

Pending. Capture does not authorize a surface change. Decide first whether the
target belongs in the surface header (one line per surface, e.g. a journey and root
line) or per artifact row, and confirm the choice stays readable at the compact
widths the Ariad surfaces already use.

Relationship to CR008 should be settled before implementation: CR008 removes the
wrong-project write, CR009 makes any future wrong target self-evident. They are
complementary, and CR009 retains value as a standalone diagnostic guarantee.

## Evidence

Recorded in [CR008](cr008-bind-lifecycle-commands-to-active-journey.md), occurrence
of 2026-08-13. The surface output, the four files written into `kia-backend`, and
the `**Journey:** kia-backend` header inside the materialized `plan.md` are all
reproduced there.

Cost of the ambiguity in that session: a full working session operated on the belief
that Ariad reported phantom artifacts, and the belief was recorded three separate
times in Navigator-facing summaries before the filesystem sweep disproved it.

2026-08-14 — Re-verified against `origin/main` @ `688271f`: the `ARTIFACTS_MATERIALIZED`
surface still reports bare project-relative paths; no journey/project/root line exists in
the surface code. Still valid.

## Outcome

Pending.
