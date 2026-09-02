[< Parent](../index.md)

# CV20.DS15.TS1 — Driver-Owned Plan Fidelity And Completion

**Status:** ✅ Done
**Type:** Technical Story

---

## Technical Story

In order to keep Plan approval truthful,
as the Ariad Driver,
I want Plan materialization to preserve existing authored content and detect an
incomplete Plan before conditional approval,
so that Navigator authority governs the implementation contract rather than a
generic scaffold.

## Outcome

`plan-delivery-story` creates `plan.md` only when absent. `plan-item` likewise
creates only missing `index.md`, `plan.md`, and `test-guide.md` artifacts. Existing
Driver-authored package files are reported as existing and remain byte-identical.
Conditional approval requires all five aggregate Plan contract sections to exist
and rejects empty, `Pending`, TODO/TBD, or placeholder bodies before changing the
approval checkpoint. Ordinary explicit approval retains its compatibility warning
behavior.

## Acceptance Behavior

```text
Given a Driver-authored non-empty plan.md
When Delivery Story planning is invoked
Then the file remains byte-identical
And the artifact surface reports it as existing
```

```text
Given a conditionally preauthorized Plan with an unresolved required section
When receipt consumption is attempted
Then approval remains blocked
And the bounded reason is plan_incomplete
```

## Scope

- Insert-if-absent Plan scaffold materialization.
- Structural required-section completeness inspection.
- Conditional-only completeness blocking.

## Out Of Scope

- Semantic judgment of Plan quality.
- Changing ordinary explicit approval into a universal completeness gate.

## Validation

Focused tests: `tests/unit/memory/builder/test_delivery_story_plan.py`,
`tests/unit/memory/builder/test_lifecycle.py`, and
`tests/unit/memory/cli/test_build.py`. Aggregate validation was accepted by the
Navigator at the parent Delivery Story checkpoint.
