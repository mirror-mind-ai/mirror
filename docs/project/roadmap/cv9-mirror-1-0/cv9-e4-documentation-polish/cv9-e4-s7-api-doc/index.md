[< CV9.E4 Documentation & Polish](../index.md)

# CV9.E4.S7 — Python API Doc

**Status:** —  
**Epic:** CV9.E4 Documentation & Polish

---

## User-Visible Outcome

A developer who wants to build an extension, integrate with Mirror Core, or
understand how the Python API works has a dedicated document that covers exactly
that — without having to navigate a command reference or architecture doc to
find it.

---

## Problem

The Python API (`MemoryClient` and its methods) currently lives inside
`REFERENCE.md`, bundled with the CLI commands table, configuration variables,
and the legacy migration workflow. It serves a different audience (developers
integrating with the core) and has no dedicated home.

After S3 reduces `REFERENCE.md` to a pure command reference, the Python API
must go somewhere. That somewhere is `docs/product/api.md` — a focused document for
developers who need to understand the programmatic interface.

The Python API is the primary integration surface for:
- Extension authors building `command-skill` extensions with their own logic
- Contributors adding new capabilities to Mirror Core
- Anyone scripting against the memory system outside of the CLI

These users need a complete, accurate reference — not a fragment buried inside
an operational doc.

---

## Scope

**In scope:**

- Create `docs/product/api.md` as the dedicated Python API reference.
- Content: `MemoryClient` instantiation, and all public methods organized by
  domain — conversations, memories, identity and journeys, tasks, attachments,
  and search.
- For each method: signature, parameters, return type, and a one-line
  description of what it does.
- A brief opening section explaining when to use the Python API vs the CLI
  (the CLI is the runtime interface; the Python API is for programmatic
  integration and extension development).
- Link from `docs/index.md`, `REFERENCE.md` (pointer replacing the removed
  API section), and `docs/product/extensions/` (extension authors need this).

**Out of scope:**

- Full worked examples or tutorials — that is extension authoring guide
  territory, which already exists in `docs/product/extensions/`.
- Internal/private methods or implementation details.
- Coverage of the service layer below `MemoryClient` — the public façade is
  the documented surface.
- Automated API doc generation (e.g. Sphinx, mkdocs) — this is a handwritten
  reference doc, consistent with the rest of the doc set.

---

## Done Condition

- `docs/product/api.md` exists with complete coverage of all public `MemoryClient`
  methods, organized by domain.
- The Python API section is removed from `REFERENCE.md`; a pointer to
  `docs/product/api.md` replaces it.
- `docs/index.md` links to `docs/product/api.md`.
- `docs/product/extensions/` references `docs/product/api.md` where relevant.
- CI remains green.

---

## Dependencies

- S3 must be complete. S3 removes the Python API from `REFERENCE.md` and
  establishes the document layout that S7 fills.

---

## See also

- [CV9.E4 Documentation & Polish](../index.md)
- [Plan](plan.md)
- [S3 — REFERENCE Split](../cv9-e4-s3-reference-split/index.md)
- [S6 — Cross-Reference Audit](../cv9-e4-s6-cross-reference-audit/index.md)
- [Extension docs](../../../../../product/extensions/index.md)
