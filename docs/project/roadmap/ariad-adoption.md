# Ariad Adoption

This project is prepared for Ariad-governed Builder Mode.

## Method

- adopted method: ariad
- first adoption: 2026-06-14, prospective, after release `v0.27.0 — Ariad Builder Lifecycle Runtime`
- project journey: `mirror`, adopted 2026-10-13
- templates: present; `prepare-templates` on 2026-10-13 checked nine and created none

## Scope

Ariad governs Builder work for this repository from this point forward. Existing
roadmap and story artifacts remain valid historical records unless touched by
active work.

Prospective adoption means:

- new Builder delivery work should use Ariad lifecycle surfaces and runtime gates;
- Delivery Stories expand into User/Technical Stories before Plan;
- Plan, Validation, Debt Review, Coherence, and Done checkpoints are explicit;
- Navigator preferences and project overrides remain future work under CV20.DS9.

## Adoption History

- **2026-06-14 — prospective adoption.** Recorded on a parent journey named
  `mirror-mind`, with the child `builder-mode-evolution` as the first
  dogfooding workstream (CV20).
- **CV22** ran under its own child journey, `mirror-ts-core`, which adopted
  Ariad and closed with the CV22 release on 2026-10-11.
- **2026-10-13 — the `mirror` journey adopts Ariad, and CV21 resumes under it.**
  `mirror` is the journey this repository's Builder sessions load. Until this
  date it carried no method, and the runtime state it lives in has no
  `mirror-mind` journey, so the 2026-06-14 adoption never reached the place the
  work happens.

## Runtime State At Adoption (2026-10-13)

- journey `mirror`: adopted method `ariad`, delivery cursor synced
- cadence profile: `stepwise`; flow unit: `story_by_story`
- active item: none
- last delivery event: template_preparation

The cursor moves with the work; `mirror build show --journey mirror --method ariad`
reports where it stands now.

## Boundaries

Template preparation and cursor sync do not execute story lifecycle work, change
story status, commit, push, or release.

## Next Ariad Movement

CV21.DS12 Runtime Re-Baseline closed on 2026-10-13. CV21's next pull is
[CV21.DS2](cv21-runtime-expansion-ii/cv21-ds2-mirror-plugin-mcp-foundation/index.md),
the canonical plugin made ready for every runtime that takes it. See the
[CV21 index](cv21-runtime-expansion-ii/index.md) for the reshaped sequence.
