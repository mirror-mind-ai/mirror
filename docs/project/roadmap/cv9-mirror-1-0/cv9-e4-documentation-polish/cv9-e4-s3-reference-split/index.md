[< CV9.E4 Documentation & Polish](../index.md)

# CV9.E4.S3 — REFERENCE Split

**Status:** —  
**Epic:** CV9.E4 Documentation & Polish

---

## User-Visible Outcome

A user looking for a CLI command finds it in `REFERENCE.md` without wading
through database schema or Python API docs. A contributor trying to understand
the system architecture finds a single authoritative document that gives the
full picture — not a fragment buried inside an operational reference.

---

## Problem

`REFERENCE.md` is a catch-all. Its current contents serve four distinct
audiences and purposes:

- **Command users** need the skills cheatsheet and configuration variables.
- **System debuggers** need the database schema and runtime session model.
- **Architecture readers** need the identity layer model, import direction, and
  repo structure.
- **Developers** need the Python API.

Bundling these together means none of them is easy to find. A user looking for
a CLI flag has to scroll past database tables. A contributor understanding the
architecture has to navigate past command reference material.

There is also content in REFERENCE that is redundant or misplaced:

- The **personas table** duplicates Getting Started and drifts from the
  database, which is the actual source of truth.
- The **Mirror Mode procedure** is operational guidance for the AI, not a
  command reference — it belongs in the skill docs or `CLAUDE.md`.
- The **extensions operational guide** is a summary of content that lives in
  full in `docs/product/extensions/` — it should be a pointer, not a duplicate.

---

## Scope

**In scope:**

**What stays in `REFERENCE.md`** — pure command reference for existing users:
- Skills/commands table (becomes the single authoritative copy across all docs)
- Configuration variables
- Legacy migration workflow (arriving from S2, flagged as a removal candidate
  for a future CV)

**What moves to `docs/product/architecture.md`** (new file):
- Database schema and main tables
- Runtime session model (CV5)
- Identity layers (Jungian model — self, ego, persona, shadow, journey,
  journey_path)
- Repo structure (currently scattered across README and REFERENCE)
- Import direction (currently in `docs/product/principles.md`)

**What is removed from REFERENCE:**
- Personas table — replaced with a pointer to
  `uv run python -m memory list personas --verbose`. The database is the source
  of truth; a static copy drifts.
- Mirror Mode procedure — belongs in the skill docs or `CLAUDE.md`, not in a
  command reference.
- Extensions operational guide — replaced with a pointer to
  `docs/product/extensions/`.

**Out of scope:**

- Python API — that is S7.
- Changes to `docs/product/principles.md` — that is S4.
- Changes to `CLAUDE.md` / `AGENTS.md` — that is S5.

---

## Done Condition

- `REFERENCE.md` contains only: commands table, configuration variables, and
  legacy migration workflow. Nothing else.
- `docs/product/architecture.md` exists and contains: database schema, runtime session
  model, identity layers, repo structure, and import direction. It is the single
  source of truth for system architecture.
- The commands table in `REFERENCE.md` is the only copy across the entire doc
  set. README and Getting Started point to it.
- The personas table is removed from REFERENCE; a pointer to the CLI command
  replaces it.
- All pointers introduced in this story resolve correctly.
- CI remains green.

---

## Dependencies

- S2 must be complete. The legacy migration workflow moves from Getting Started
  to REFERENCE in S2; S3 then organizes REFERENCE around its new contents.

---

## See also

- [CV9.E4 Documentation & Polish](../index.md)
- [Plan](plan.md)
- [S2 — Getting Started Consolidation](../cv9-e4-s2-getting-started-consolidation/index.md)
- [S4 — Principles Reorganization](../cv9-e4-s4-principles-reorganization/index.md)
- [S5 — CLAUDE.md Reduction](../cv9-e4-s5-claude-md-reduction/index.md)
- [S7 — Python API Doc](../cv9-e4-s7-api-doc/index.md)
