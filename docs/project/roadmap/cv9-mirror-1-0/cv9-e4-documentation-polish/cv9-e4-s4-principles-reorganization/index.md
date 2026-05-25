[< CV9.E4 Documentation & Polish](../index.md)

# CV9.E4.S4 — Principles Reorganization

**Status:** —  
**Epic:** CV9.E4 Documentation & Polish

---

## User-Visible Outcome

A contributor looking for engineering and process conventions finds them in one
place under `docs/process/`. A product thinker looking for how the mirror is
supposed to behave finds clean product principles without having to filter out
code style rules. Each document answers one question for one audience.

---

## Problem

`docs/product/principles.md` has four sections: Product, Code, Testing, and
Process. Only the first section is a product document. The other three are
engineering and process content that has no business living under `docs/product/`.

This creates two problems:

1. **Discoverability.** Engineering principles are found by navigating to a
   product document. That is the wrong mental model for a contributor looking
   for code conventions or testing strategy.

2. **Overlap with the development guide.** The "Process" section in
   `principles.md` states rules that `docs/process/development-guide.md` also
   covers — design before code, small stories, docs updated in the same cycle.
   The same guidance appears in two places with no clear division of
   responsibility between them. Over time they drift apart.

The principle/guide relationship should be explicit: **principles state the
rule; the development guide operationalizes it.** A principle says "TDD by
default." The guide says what that means in practice — which commands to run,
when the test should come before the code, what the verification checklist
looks like.

---

## Scope

**In scope:**

- Keep `docs/product/principles.md`. Remove the Code, Testing, and Process
  sections from it. What remains is the Product section only:
  first-person voice, memory as intelligence, journeys as continuity,
  interfaces are thin, one voice many lenses, doing as entry being as discovery.

- Create `docs/process/engineering-principles.md` with the Code, Testing, and
  Process sections moved from `docs/product/principles.md`.

- Audit the overlap between the new `engineering-principles.md` and
  `docs/process/development-guide.md`. Where both cover the same rule:
  - Principles states the rule concisely.
  - Development guide keeps the operational detail — examples, commands,
    verification checklist steps.
  - Remove any operational detail that accidentally ended up in principles.
  - Remove any bare rule restatement that accidentally ended up in the guide
    without operational content.

- Update `docs/index.md` to link `engineering-principles.md` from the Process
  section.

- Update `docs/product/index.md` to remove any reference to the Code, Testing,
  and Process sections.

**Out of scope:**

- Rewriting the content of any principle. This is a reorganization, not a
  content revision.
- Changes to `docs/process/development-guide.md` beyond removing bare rule
  restatements that are now clearly owned by principles.

---

## Done Condition

- `docs/product/principles.md` contains only product behavior principles.
  No Code, Testing, or Process sections.
- `docs/process/engineering-principles.md` exists and contains the Code,
  Testing, and Process sections.
- There is no meaningful overlap between `engineering-principles.md` and
  `development-guide.md`: principles owns the rule, the guide owns the
  operational detail.
- `docs/index.md` links `engineering-principles.md` from the Process section.
- CI remains green.

---

## Dependencies

- S3 must be complete. S3 moves import direction out of `principles.md` into
  `docs/product/architecture.md`. S4 must run after that move to avoid reorganizing
  content that S3 has already relocated.

---

## See also

- [CV9.E4 Documentation & Polish](../index.md)
- [Plan](plan.md)
- [S3 — REFERENCE Split](../cv9-e4-s3-reference-split/index.md)
- [S6 — Cross-Reference Audit](../cv9-e4-s6-cross-reference-audit/index.md)
- [Development Guide](../../../../../process/development-guide.md)
