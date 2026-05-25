[< CV9.E4 Documentation & Polish](../index.md)

# CV9.E4.S6 — Cross-Reference Audit

**Status:** —  
**Epic:** CV9.E4 Documentation & Polish

---

## User-Visible Outcome

Every link in the documentation resolves. Every "See also" section points to
something that exists and contains what the reader expects. The docs map in
`docs/index.md` accurately reflects reality. A contributor following any
cross-reference lands in the right place.

---

## Problem

S1 through S5 and S7 move content across documents, create new files
(`docs/product/architecture.md`, `docs/product/api.md`, `docs/process/engineering-principles.md`),
remove content from existing files, and add pointers throughout the doc set.
Each of those structural moves leaves a trail of breadcrumbs, "See also" links,
and inline references that pointed to the old structure.

Without a final verification pass, the doc set is internally consistent in
design but inconsistent in practice — links broken, breadcrumbs stale, the
docs map outdated.

There is also one piece of labeling work that belongs here:
`docs/product/envisioning/index.md` ends with a list of open design questions.
It is currently positioned as if it were a stable product document. It should
be explicitly labeled as exploratory synthesis — valuable context, not a settled
spec — so a reader knows how to weight it.

---

## Scope

**In scope:**

- Audit every breadcrumb (`[< Parent]` links) across all docs under `docs/`
  and at the root level. Fix any that point to a moved or renamed document.
- Audit every "See also" section across all docs. Fix any pointer that no
  longer resolves or points to the wrong destination.
- Audit every inline cross-reference (links embedded in body text). Fix broken
  or stale ones.
- Verify `docs/index.md` accurately describes the current doc structure,
  including the new files created in S3, S4, and S7.
- Verify README's "Documentation" section links accurately to the current doc
  layout.
- Verify the pointers introduced in S1–S5 and S7 ("see REFERENCE for commands",
  "see architecture.md for the system", etc.) all resolve correctly.
- Add an explicit label to `docs/product/envisioning/index.md` marking it as
  exploratory synthesis, not a stable spec.
- Flag the legacy migration workflow in `REFERENCE.md` explicitly as a removal
  candidate for a future CV.

**Out of scope:**

- Writing new content. S6 fixes references; it does not add missing docs. If
  the audit reveals a gap that requires new writing, that is a new story.
- Changes to roadmap story indexes under `docs/project/roadmap/` beyond fixing
  broken breadcrumbs.
- Changes to skill SKILL.md files.

---

## Done Condition

- No internal broken links across `README.md`, `REFERENCE.md`, `CLAUDE.md`,
  and all files under `docs/`.
- `docs/index.md` matches the actual doc structure.
- `docs/product/envisioning/index.md` carries an explicit exploratory/synthesis
  label.
- `REFERENCE.md` carries a visible note on the legacy migration section marking
  it as a removal candidate.
- All pointers introduced across S1–S5 and S7 resolve correctly.
- CI remains green.

---

## Dependencies

- All other stories (S1–S5, S7) must be complete. S6 is the final verification
  pass over everything they changed.

---

## See also

- [CV9.E4 Documentation & Polish](../index.md)
- [Plan](plan.md)
- [S1 — README Reduction](../cv9-e4-s1-readme-reduction/index.md)
- [S2 — Getting Started Consolidation](../cv9-e4-s2-getting-started-consolidation/index.md)
- [S3 — REFERENCE Split](../cv9-e4-s3-reference-split/index.md)
- [S4 — Principles Reorganization](../cv9-e4-s4-principles-reorganization/index.md)
- [S5 — CLAUDE.md Reduction](../cv9-e4-s5-claude-md-reduction/index.md)
- [S7 — Python API Doc](../cv9-e4-s7-api-doc/index.md)
