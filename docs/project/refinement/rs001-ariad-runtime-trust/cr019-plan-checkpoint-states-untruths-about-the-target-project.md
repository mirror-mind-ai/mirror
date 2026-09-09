[< RS001](index.md) · [Canonical status](../index.md#change-requests)

# CR019 — The Plan checkpoint states things that are not true for the target project

## Problem

Two content defects in `PLAN_CHECKPOINT` (and the `plan.md` scaffold it
materializes), both observed on every Technical Story of `kia-desktop`
CV8.DS4 on 2026-09-07:

1. **The parent is listed as a sibling.** The non-goals section reads
   `Do not implement sibling roadmap item: Higiene de dead code: o que não
   roda sai do repositório` — that is the active story's **own Delivery
   Story**. It appeared alongside the genuine siblings (the other TSs of the
   DS, by their truncated titles per CR018) and alongside the next Delivery
   Story (`CV8.DS5`). A story cannot have its parent as a non-goal; the line
   is noise a reader has to explain away.

2. **Mirror's own development rules leak into another project's contract.**
   The Implementation Contract section carries
   `Use uv run for Python commands and tests.` — the Mirror Mind repository's
   convention, injected into the plan of a Tauri/React project whose gates are
   `npm`, `cargo` and `python3 scripts/…`. The consuming project's
   `CLAUDE.md` says nothing about `uv`; the line is false there, and the Driver
   has to delete it from every generated plan.

Both make the Navigator's approval decision rest on a document that is partly
wrong on its face, and both are deterministic — they recur on every plan.

## Expected Behavior

- The non-goals list names sibling work items only: children of the same
  parent that are not the active item, and (optionally) the next item at the
  parent's level. The active item's ancestors never appear as non-goals.
- The Implementation Contract carries method-level rules (TDD/characterization,
  scope to the active story, no `git add .`, descriptive English commits) and
  **project-level** rules only when the project declares them — read from the
  local development guide the Prepare step already looks for
  (`docs/process/development-guide.md` was reported `missing` for this
  project, so the correct behavior was to emit none). Mirror's `uv run` rule
  belongs to Mirror's own guide, not to the default.

## Impact

Small per occurrence, systematic across projects: every Ariad-adopted project
that is not Mirror Mind inherits a false contract line, and every child story
inherits its parent as a forbidden sibling. The trust cost is the same shape
as CR009's — a surface that is *almost* right trains the reader to skim it,
and the checkpoint is the one surface that should be read closely.

## Plan Or Decision

Pending. Two small changes: exclude ancestors when computing sibling
non-goals; source project-level contract lines from the resolved local guide
(or a per-project method configuration) instead of a hard-coded default.
Regression fixtures: a child story under a Delivery Story with two siblings; a
project with no development guide.

## Evidence

`PLAN_CHECKPOINT` surfaces for `CV8.DS4.TS1`, `TS2` and `TS3` (session of
2026-09-07, journey `kia-desktop`); the generated `plan.md` scaffolds for the
same stories, whose `## Non-Goals` and `## Implementation Contract` sections
the Driver rewrote before each approval. The Prepare surface for each story
reported `○ docs/process/development-guide.md: missing`.

## Outcome

Pending.
