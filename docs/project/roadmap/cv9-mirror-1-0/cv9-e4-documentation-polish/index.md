[< CV9](../index.md)

# CV9.E4 — Documentation & Polish

**Status:** ✅ Done  
**Goal:** Redesign the documentation information architecture so each document has a single, clear responsibility and a single, clear audience. Remove duplication. Fill structural gaps. Make the doc set navigable by someone who does not already know where everything is.

---

## Done Condition

- Every document has a single stated audience and a single stated responsibility.
- Onboarding content lives in one place (`docs/getting-started.md`); `README.md` is reduced to a public hook.
- The skills/commands table exists in one place (`REFERENCE.md`) and is pointed to from everywhere else.
- `REFERENCE.md` is split by audience/purpose: command reference and configuration live in `REFERENCE.md`; system architecture lives in `docs/product/architecture.md`; Python API lives in `docs/product/api.md`.
- `docs/product/principles.md` contains product behavior principles only; engineering and process principles live in `docs/process/engineering-principles.md`.
- `CLAUDE.md` / `AGENTS.md` is a minimal structured context file: operating modes, persona routing, hard constraints, and pointers — no duplicate content.
- `docs/product/architecture.md` exists as the single source of truth for system architecture: layers, components, data flow, import direction, and identity model.
- `docs/product/api.md` exists as the Python API reference for developers integrating with the core.
- `docs/product/envisioning/index.md` is explicitly labeled as exploratory/synthesis, separate from stable specs.
- All cross-references and breadcrumbs are accurate and consistent.
- CI remains green.

---

## Context: The Diagnosis

This epic was planned after a full audit of the documentation corpus in May 2026.
The audit identified seven structural problems.

### Problem 1 — README and Getting Started are nearly the same document

Both contain: prerequisites, installation steps, environment variables, the
12-persona table (verbatim), `memory init` flow, seeding, how to start each
runtime, and extension quick start. Any onboarding change requires two edits.
This is a structural guarantee of future inconsistency.

### Problem 2 — The skills/commands table exists in three places

`README.md`, `REFERENCE.md`, and `CLAUDE.md` / `AGENTS.md` all carry a version
of the commands table. Three formats, slightly different content. No single
source of truth.

### Problem 3 — `REFERENCE.md` has no clear identity

It contains: persona list, skills cheatsheet, database schema, Python API,
runtime session model, configuration variables, extensions guide, and Mirror
Mode procedure. These serve different audiences and purposes. Packaging them
together means none of them is easy to find.

### Problem 4 — `docs/product/principles.md` is misnamed and mis-categorized

It has four sections: Product, Code, Testing, Process. Only the first section
is a product document. The others are engineering and process content living
under `docs/product/` but belonging elsewhere. The "Process" section overlaps
substantially with `docs/process/development-guide.md`.

### Problem 5 — `CLAUDE.md` / `AGENTS.md` is doing two things

It is both a runtime instruction file (operating modes, persona routing, skill
list, available commands) and a partial reference (architecture description,
command table). An AI context file should be a structured prompt with pointers,
not a documentation hub. Its current weight is unnecessary.

### Problem 6 — `docs/product/envisioning/index.md` is a working note, not a stable spec

The document ends with a list of open design questions. That is an exploratory
synthesis, not a stable product document. It is labeled and positioned as if it
is more settled than it is.

### Problem 7 — Architecture has no single home

The system architecture is scattered: repo structure in `README.md`, foundational
decisions in `briefing.md`, database schema in `REFERENCE.md`, import direction
rules in `principles.md`, runtime contract in `docs/product/specs/`. A
contributor wanting to understand the system has to triangulate across five
documents. No `docs/product/architecture.md` exists.

---

## Gaps (what is missing)

1. **No single authoritative architecture document.** The full picture — layers,
   components, data flow, import direction, runtime model, identity model — does
   not exist in one place.

2. **No clear separation between new-user and existing-user docs.** Both groups
   currently face the same wall of onboarding text even after they have completed
   onboarding.

3. **No Python API reference document.** The Python API lives inside `REFERENCE.md`
   bundled with unrelated content, with no dedicated home for developers integrating
   with the core.

4. **Extension system docs are thorough but isolated.** `docs/product/extensions/`
   has excellent content but is not connected to the main doc flow.

---

## Target Information Architecture

The redesign is organized around two axes: **audience** and **responsibility**.

| Document | Audience | Single responsibility |
|---|---|---|
| `README.md` | Stranger on GitHub | The hook — what problem, why different, install pointer |
| `docs/getting-started.md` | New user | Linear onboarding: install → init → seed → first session → verify |
| `REFERENCE.md` | Existing user (lookup) | Command reference: CLI commands, arguments, flags, configuration |
| `docs/product/architecture.md` | Developer / contributor | System architecture: layers, components, data flow, schema |
| `docs/product/api.md` | Developer integrating with the core | Python API reference |
| `CLAUDE.md` / `AGENTS.md` | The AI | Minimal structured context: operating modes, persona routing, hard constraints, skill pointers |
| `docs/project/briefing.md` | Builder | Foundational decisions — stable, not re-litigated |
| `docs/project/decisions.md` | Builder | Incremental decision log |
| `docs/product/principles.md` | Builder | Product behavior principles only |
| `docs/process/engineering-principles.md` | Builder | Code, testing, and process principles |
| `docs/process/development-guide.md` | Builder in active session | How we work session-by-session |
| `docs/process/worklog.md` | Builder reviewing history | Progress record |
| `docs/project/roadmap/` | Builder in active session | CV → Epic → Story planning hierarchy |
| `docs/product/envisioning/` | Builder / future contributor | Exploratory synthesis — explicitly labeled as such |
| `docs/product/specs/` | Builder implementing a capability | Stable, closed-design-question specs |

---

## Stories

| Code | Story | Status |
|------|-------|--------|
| [S1](cv9-e4-s1-readme-reduction/index.md) | README reduction — pare down to a public hook | ✅ |
| [S2](cv9-e4-s2-getting-started-consolidation/index.md) | Getting Started consolidation — single authoritative onboarding document | ✅ |
| [S3](cv9-e4-s3-reference-split/index.md) | REFERENCE split — command reference stays; architecture moves to `docs/product/architecture.md` | ✅ |
| [S4](cv9-e4-s4-principles-reorganization/index.md) | Principles reorganization — product principles vs engineering/process principles | ✅ |
| [S5](cv9-e4-s5-claude-md-reduction/index.md) | CLAUDE.md / AGENTS.md reduction — minimal structured context with pointers | ✅ |
| [S6](cv9-e4-s6-cross-reference-audit/index.md) | Cross-reference audit — all breadcrumbs and links accurate and consistent | ✅ |
| [S7](cv9-e4-s7-api-doc/index.md) | Python API doc — `docs/product/api.md` as dedicated reference for developers | ✅ |

---

## Sequencing

```text
S1 README reduction
  └── S2 Getting Started consolidation
        └── S3 REFERENCE split (→ REFERENCE + architecture.md)
              ├── S4 Principles reorganization
              ├── S5 CLAUDE.md reduction
              └── S7 Python API doc (→ docs/product/api.md)
                    └── S6 Cross-reference audit (runs last, over everything)
```

S1 before S2: README removes content that S2 absorbs into Getting Started.  
S2 before S3: Getting Started is the onboarding anchor before REFERENCE is restructured.  
S3 before S4, S5, S7: the new document destinations must exist before other stories point to them.  
S4, S5, S7 are parallel after S3.  
S6 runs last: verifies all cross-references are consistent after all structural moves.

---

## Decisions made during planning

- **Legacy migration workflow** moves from Getting Started to REFERENCE (S2), flagged as a removal candidate for a future CV. Most early Portuguese-era users have already migrated.
- **Extension content in Getting Started** reduced to a single paragraph with a pointer to `docs/product/extensions/`. No install or expose steps in onboarding.
- **Personas table in REFERENCE** removed. The database is the source of truth; `uv run python -m memory list personas --verbose` is the live command. A static copy drifts.
- **Mirror Mode procedure in REFERENCE** removed. It belongs in the skill docs or `CLAUDE.md`, not in the command reference.
- **`docs/product/principles.md`** split into two files: product principles stay in place; Code, Testing, and Process sections move to `docs/process/engineering-principles.md`. The principle/guide relationship: principles state the rule, `development-guide.md` operationalizes it.
- **Python API doc** scoped as its own story (S7) rather than bundled into S3.
- **`docs/product/envisioning/index.md`** labeled explicitly as exploratory/synthesis in S6. Open design questions are not resolved here; they graduate to specs when their CV begins planning.

---

**See also:** [CV9 index](../index.md) · [Briefing](../../../briefing.md) · [Decisions](../../../decisions.md)
