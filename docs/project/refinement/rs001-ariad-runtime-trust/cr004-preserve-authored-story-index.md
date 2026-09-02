[< RS001](index.md) · [Canonical status](../index.md#change-requests)

# CR004 — Preserve Authored Story Index During Plan Materialization

## Problem

`build plan-item` replaced a hand-authored story `index.md` with its generic generated
scaffold. This happened while planning both CV20.DS12.TS1 and CV20.DS12.US1. In each
case the authored outcome, boundaries, and acceptance details had to be restored
manually after the command.

Reproduced twice more in a **different project** on 2026-08-08 (see Evidence), which
moves this from a dogfooding artifact to a defect any Ariad-adopted project will hit.

## Expected Behavior

Plan materialization preserves an existing authored story index. It may create a missing
index or update only explicitly runtime-owned fields, but it must not replace authored
content with a generic template.

## Impact

The Plan command can silently destroy the very project context it is meant to preserve.
Repeated manual restoration also makes the generated `updated story index` surface
technically true while the operation remains undesirable.

The loss is quiet in a way that matters: the command reports success, the surface says
`updated story index`, and the destroyed content is only noticed by someone who happens
to reopen the file. In the 2026-08-08 occurrences the authored scope, the recorded
design decisions, and the out-of-scope boundaries were all replaced by placeholder
prose — including the boundaries that existed specifically to stop scope drift during
implementation.

## Plan Or Decision

Pending. Before changing code, characterize create-versus-existing behavior and identify
which, if any, fields are genuinely runtime-owned. Prefer insert-if-absent or a
no-clobber policy over Markdown merging.

## Evidence

Observed twice during document-first DS12 dogfooding and recorded in the
[US1 Debt Review](../../roadmap/cv20-builder-mode-evolution/cv20-ds12-refinement-work-artifacts/cv20-ds12-us1-dogfood-file-only-refinement/review.md).

**2026-08-08 — reproduced outside this repository.** Two further occurrences while
building CV3.DS13 in the `kia-backend` project, an Ariad-adopted journey with its own
roadmap:

- `CV3.DS13.TS1` — the story index was authored by hand before Pull, with scope,
  acceptance behaviour, an out-of-scope list, and open questions for the Plan.
  `build plan-item` replaced all of it with the generic template.
- `CV3.DS13.US1` — same command, same result, on an index authored the same way.

Both were restored by rewriting the file after the command. Two details worth keeping
for whoever characterizes the behaviour:

1. The overwrite happened on an index authored **before Pull**, so "the runtime created
   it, therefore the runtime owns it" does not describe these cases.
2. The generated `Out Of Scope` section listed **sibling roadmap items from unrelated
   Delivery Stories** ("Do not implement sibling roadmap item: Push de uso em dólar",
   and similar). Even setting the overwrite aside, that content is noise in a story
   package: it enumerates the roadmap rather than the story's actual boundaries.

The practical workaround adopted in that project was to author the story index **after**
Plan rather than before — which is a workaround for the defect, not a convention worth
keeping.

## Outcome

Pending.
