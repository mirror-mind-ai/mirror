[< S6 index](index.md)

# CV9.E4.S6 — Plan: Cross-Reference Audit

---

## Approach

Manual audit, not automated link checking. The doc set is not large enough to
warrant a link checker, and a human reading through catches more than broken
links — stale context, wrong framing, a pointer that resolves technically but
points to the wrong section. The value of S6 is coherence, not just
correctness.

The audit is a structured checklist. Work through it top to bottom without
deciding what to look at next. Check each item, fix what is broken, and mark
it done.

---

## Checklist

### docs/index.md — the map

The docs index is the navigation hub. After S1–S5 and S7 it must reflect the
new structure exactly.

- [ ] Reference section includes `docs/product/architecture.md` (created in S3)
- [ ] Reference section includes `docs/product/api.md` (created in S7)
- [ ] Process section includes `docs/process/engineering-principles.md` (created in S4)
- [ ] `docs/product/principles.md` is described as product behavior principles only (no Code/Testing/Process)
- [ ] No reference to content that has moved (personas table, Mirror Mode procedure, etc.)

### README.md — documentation section

- [ ] "Documentation" section links accurately to the current doc layout
- [ ] No inline commands table — pointer to `REFERENCE.md` only
- [ ] No directory tree — pointer to `docs/product/architecture.md` (repo structure section)
- [ ] Pointers to Getting Started, Briefing, Decisions, Roadmap, Development Guide, REFERENCE all resolve

### REFERENCE.md — three sections only

- [ ] Contains only: commands table, configuration variables, legacy migration workflow
- [ ] Legacy migration workflow carries the removal candidate note:
  > **Note:** This workflow exists for users migrating from Portuguese-era
  > databases (pre-CV0). Most early users have already completed this
  > migration. This section is a removal candidate for a future CV.
- [ ] No personas table
- [ ] No Mirror Mode procedure
- [ ] No extensions operational guide — pointer to `docs/product/extensions/` only
- [ ] No Python API — pointer to `docs/product/api.md` only
- [ ] No database schema — pointer to `docs/product/architecture.md` only

### docs/getting-started.md — onboarding only

- [ ] No legacy migration workflow
- [ ] No extension install/expose/clean cycle — one paragraph + pointer only
- [ ] "What's next" section present with pointers to REFERENCE, architecture.md, extensions docs
- [ ] Pointers to `docs/product/architecture.md` resolve (file exists after S3)
- [ ] Pointers to `docs/product/api.md` resolve (file exists after S7)

### CLAUDE.md / AGENTS.md — minimal context

- [ ] No full commands table — pointer to `REFERENCE.md`
- [ ] No architecture description — pointer to `docs/product/architecture.md`
- [ ] No detailed skill procedure steps — each SKILL.md path listed only
- [ ] Mirror Operating Instructions and Project Context sections clearly labelled
- [ ] Skills list is complete (all skills present with correct SKILL.md paths)

### docs/product/architecture.md — new file (S3)

- [ ] File exists
- [ ] Breadcrumb (`[< Docs]`) points to `docs/index.md`
- [ ] Eight sections present: system overview, repo structure, layer model,
  identity model, memory model, runtime model, database schema, runtime session model
- [ ] "See also" links resolve

### docs/product/api.md — new file (S7)

- [ ] File exists
- [ ] Breadcrumb points to `docs/index.md`
- [ ] All public `MemoryClient` methods covered
- [ ] "See also" links resolve

### docs/process/engineering-principles.md — new file (S4)

- [ ] File exists
- [ ] Breadcrumb points to `docs/process/` or `docs/index.md`
- [ ] Code, Testing, and Process sections present (moved from principles.md)
- [ ] "Service layer is the architecture" points to `docs/product/architecture.md` for
  import direction detail (not duplicating content moved in S3)

### docs/product/principles.md — product only

- [ ] Contains only the Product section
- [ ] No Code, Testing, or Process sections
- [ ] "See also" points to `docs/process/engineering-principles.md`

### docs/product/envisioning/index.md — exploratory label

- [ ] Carries an explicit label at the top marking it as exploratory synthesis:
  > **Status: Exploratory synthesis.** This document captures a product
  > architecture direction that emerged from an active session. It contains
  > open design questions and is not a stable spec. Design questions graduate
  > to specs when their CV begins planning.

### Breadcrumbs across all docs/

Walk the directory tree. For every `.md` file under `docs/`:

- [ ] Breadcrumb (`[< Parent]`) points to an existing file
- [ ] Breadcrumb destination is the correct logical parent

Files most likely to have stale breadcrumbs after E4:
- `docs/product/principles.md` (content moved; parent unchanged but description changed)
- `docs/process/engineering-principles.md` (new file; breadcrumb must be set)
- `docs/product/architecture.md` (new file; breadcrumb must be set)
- `docs/product/api.md` (new file; breadcrumb must be set)

### "See also" sections across all docs/

For every "See also" section in docs/:

- [ ] Every link resolves to an existing file
- [ ] Every link points to the correct destination (not a renamed or moved file)

### Pointers introduced in S1–S5 and S7

Each story introduced new pointers replacing removed content. Verify each:

- [ ] README → Getting Started (S1)
- [ ] README → REFERENCE for commands (S1)
- [ ] Getting Started → REFERENCE for commands (S2)
- [ ] Getting Started → `docs/product/architecture.md` (S2, S3)
- [ ] Getting Started → `docs/product/extensions/` (S2)
- [ ] REFERENCE → `docs/product/architecture.md` for schema and session model (S3)
- [ ] REFERENCE → `docs/product/extensions/` replacing extensions guide (S3)
- [ ] REFERENCE → `docs/product/api.md` replacing Python API (S3)
- [ ] REFERENCE → `uv run python -m memory list personas --verbose` replacing personas table (S3)
- [ ] `docs/product/principles.md` → `docs/process/engineering-principles.md` (S4)
- [ ] `docs/process/engineering-principles.md` → `docs/product/architecture.md` for import direction (S4)
- [ ] CLAUDE.md → REFERENCE for commands (S5)
- [ ] CLAUDE.md → `docs/product/architecture.md` for architecture (S5)

---

## What S6 Does Not Do

- S6 does not write new content. If the audit reveals a gap that requires new
  writing, that is a new story.
- S6 does not change roadmap story indexes beyond fixing broken breadcrumbs.
- S6 does not touch skill SKILL.md files.

---

## See also

- [S6 index](index.md)
- [S1 — README Reduction](../cv9-e4-s1-readme-reduction/index.md)
- [S2 — Getting Started Consolidation](../cv9-e4-s2-getting-started-consolidation/index.md)
- [S3 — REFERENCE Split](../cv9-e4-s3-reference-split/index.md)
- [S4 — Principles Reorganization](../cv9-e4-s4-principles-reorganization/index.md)
- [S5 — CLAUDE.md Reduction](../cv9-e4-s5-claude-md-reduction/index.md)
- [S7 — Python API Doc](../cv9-e4-s7-api-doc/index.md)
