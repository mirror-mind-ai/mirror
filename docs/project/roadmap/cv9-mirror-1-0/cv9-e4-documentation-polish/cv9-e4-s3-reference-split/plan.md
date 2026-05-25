[< S3 index](index.md)

# CV9.E4.S3 — Plan: REFERENCE Split

---

## Two Parallel Tasks

S3 does two things at once: it cuts `REFERENCE.md` down to a pure command
reference, and it builds `docs/product/architecture.md` from scratch. The cutting is
mechanical — we know what leaves and where it goes. The building is the
consequential design work.

---

## docs/product/architecture.md — Design

### Primary reader: the contributor

The architecture doc is written for **Reader A — the contributor** who wants to
add a feature or fix a bug and needs to understand how the system is organized
before touching code. Their question is: *where does my change belong, what
calls what, and what are the boundaries I must not cross?*

This reader is primary over Reader B (the integration developer building
extensions), because Mirror Mind is currently a developer-facing tool and the
extension ecosystem is early. An architecture doc organized for contributors is
also legible to integration developers; the reverse is not always true.

### Structure: coarse to fine

Eight sections, moving from the shape of the whole down to the persistence
layer. A contributor can stop reading when they have enough context for their
task.

```
1. System overview
2. Repository structure
3. Layer model (import direction)
4. Identity model
5. Memory model
6. Runtime model
7. Database schema
8. Runtime session model
```

### Content sources for each section

**1. System overview**
One short paragraph: what Mirror Mind is architecturally — a local-first
memory and identity framework, one Python core, multiple runtime interfaces,
SQLite as the database. Written fresh; currently no single-paragraph system
overview exists anywhere.

**2. Repository structure**
Currently scattered across `README.md` (the directory tree) and
`docs/project/briefing.md` (D6, D8). Pull the tree from README; pull the
rationale from briefing. Remove the tree from README after S3 (README does
not need a directory tree after S1 reduction — it belongs in architecture).

**3. Layer model — import direction**
Currently in `docs/product/principles.md` under "Service layer is the
architecture" (Code section). Move the substance here: the four-layer rule
(`cli` and `hooks` → `services` → `storage` → `db`), the import direction
constraint, and the `MemoryClient` façade model. The principles file retains
a pointer to this doc after S4 removes the Code section.

**4. Identity model**
Currently in `docs/project/briefing.md` (D3, D5) and `REFERENCE.md`
(personas table). Consolidate here: the Jungian layer structure (self, ego,
persona, shadow, journey, journey_path), what each layer owns, the
user-home YAML → database flow, and the seeding model. The personas table
in REFERENCE is removed; this section explains the layer model without
a static persona list (the database is the source of truth;
`uv run python -m memory list personas --verbose` is the live command).

**5. Memory model**
Currently spread across `README.md` (memory layers section) and
`docs/project/briefing.md` (D7). Consolidate here: the memory layers
(self, ego, shadow, persona), extraction pipeline, hybrid search signals,
and the D7 quality guard (journey + ≥4 messages required for extraction).

**6. Runtime model**
Currently in `README.md` ("How it works" section) and
`docs/product/specs/runtime-interface/index.md` (the full runtime contract).
The architecture doc carries the high-level picture: four harnesses (Pi,
Codex, Claude Code, Gemini CLI), one Python core, how each harness connects
to it (shell hooks, wrapper script, TypeScript extension). The runtime
interface spec carries the detailed contract — architecture.md points to it.

**7. Database schema**
Currently in `REFERENCE.md` (Main Tables section). Move the full table
here verbatim. REFERENCE removes it entirely.

**8. Runtime session model**
Currently in `REFERENCE.md` (Runtime Session Model section, CV5). Move
verbatim here, after the schema section it depends on.

---

## REFERENCE.md — After the Split

Three sections remain. This is the entire document after S3.

**1. Commands table**
The authoritative single copy of all commands across all runtimes. Existing
table structure is correct: Pi/Gemini CLI | Codex | Claude Code | Purpose |
Arguments. No changes to the table itself. README and Getting Started point
to this table; they do not reproduce it.

**2. Configuration variables**
Operational lookup. A user who needs to know what `MIRROR_HOME` or
`OPENROUTER_API_KEY` does opens REFERENCE. These stay.

**3. Legacy migration workflow**
Arriving from Getting Started (S2). Marked visibly as a removal candidate:

> **Note:** This workflow exists for users migrating from Portuguese-era
> databases (pre-CV0). Most early users have already completed this migration.
> This section is a removal candidate for a future CV.

---

## What Is Removed (Not Moved)

**Mirror Mode procedure** — currently in REFERENCE, describes how Mirror Mode
operates. This is operational guidance for the AI, already covered in
`CLAUDE.md` and the `mm-mirror` skill file. The REFERENCE copy is a third
duplicate. Remove it; do not move it.

**Personas table** — currently in REFERENCE, lists personas with domain and
inheritance. The database is the source of truth; `uv run python -m memory
list personas --verbose` is the live command. A static copy drifts. Remove it;
replace with a one-line pointer to the CLI command.

**Extensions operational guide** — currently in REFERENCE, summarizes content
that lives in full in `docs/product/extensions/`. Replace with a single pointer
to that section.

---

## Sequencing Note for S4

S3 moves the import direction rule out of `docs/product/principles.md` into
`docs/product/architecture.md`. S4 (Principles Reorganization) then splits what
remains in `principles.md`. S4 must run after S3 to avoid reorganizing content
that S3 has already relocated. The sequencing in the E4 index reflects this.

---

## See also

- [S3 index](index.md)
- [S2 — Getting Started Consolidation](../cv9-e4-s2-getting-started-consolidation/index.md)
- [S4 — Principles Reorganization](../cv9-e4-s4-principles-reorganization/index.md)
- [Runtime Interface Spec](../../../../../product/specs/runtime-interface/index.md)
- [Project Briefing](../../../../../project/briefing.md)
