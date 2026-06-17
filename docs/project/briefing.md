[< Docs](../index.md)

# Project Briefing

Stable architectural premises. Not a task list. These decisions are set; they
do not get re-litigated in each session. When a decision needs to change, it
is recorded in [Decisions](decisions.md) first.

---

## Foundational Decisions

### D1 — Local-first architecture

**Decision:** The memory and identity system runs locally. SQLite is the
database. There is no application server, no authentication layer, and no
hosted service.

**Rationale:** The mirror holds private identity — values, tensions,
vulnerabilities, financial context. Local-first is not a constraint; it is a
value. The system should work without any external dependency beyond the AI
provider APIs.

**Consequence:** Backup, recovery, and portability are the user's
responsibility. Multi-device sync is not a built-in feature. A hosted version
is a future, separate track.

---

### D2 — Python as the core language

**Decision:** The memory system (`src/memory/`) is written in Python 3.10+.
All CLI commands, hooks, and skill scripts are Python.

**Rationale:** Python is the right language for the data pipeline work this
system does: embedding generation, LLM extraction, SQLite access, YAML parsing,
and hybrid search. It has the ecosystem and the tooling (pytest, ruff, pyright).

**Consequence:** Any Pi interface extension that dispatches to the memory
system must invoke Python. The TypeScript Pi extension is a thin caller; logic
stays in Python.

---

### D3 — Database is the runtime source of truth

**Decision:** Identity, journeys, personas, memories, conversations, and tasks
are all stored in and read from the user's mirror home, with `memory.db` as the
runtime source of truth. During CV4 the target layout becomes:
`~/.mirror-minds/<user>/memory.db` for runtime state and `~/.mirror-minds/<user>/identity/`
for user-owned seed YAMLs. The repository will keep only generic templates under
`templates/identity/` — not live user identity.

**Rationale:** The database is for the mirror at runtime. User identity must be
owned by the user, outside the repository checkout. Repository templates are
for bootstrap and version control; the user home is for real identity and local
runtime state. Separating these concerns makes Mirror Mind reusable as a
framework without baking one person's identity into the repo.

**Consequence:** After editing a user-owned YAML file, `/mm:seed` must be run to
propagate changes. The database can evolve (via migrations) without touching
those YAML files. New installs will bootstrap from `templates/identity/` into a
user home under `~/.mirror-minds/<user>/` before seeding. Legacy migration tooling
must target the user-home layout rather than the old in-repo identity model.

---

### D4 — English as the internal language

**Decision:** All code, variable names, CLI commands, schema columns, identity
layer keys, skill script filenames, and documentation are in English.
User-facing content (journal entries, journey descriptions written by the user)
may be in any language.

**Rationale:** The system was built initially in Portuguese, which coupled the
API surface to the author's language. The migration (CV0) removed that coupling.
English makes the codebase readable to any contributor and consistent with the
tool ecosystem.

**Consequence:** Legacy Portuguese names (`memoria`, `travessia`, `.espelho`)
remain only in migration/import code for upgrading old databases and layouts.
They do not appear in normal runtime paths. No new Portuguese names are
introduced.

---

### D5 — Jungian identity architecture

**Decision:** Identity is organized as layers inspired by Jungian psychology:
`self` (soul, purpose), `ego` (operational identity, behavior), `persona`
(domain specialists), `shadow` (tensions and blind spots — planned).

**Rationale:** These are not decorative labels. The model reflects how a
person's psyche actually operates: a deep unchanging core, a day-to-day
operational self, and contextual roles activated in different domains. Using
this as the structural model makes the mirror coherent — it speaks from one
voice, not as multiple disconnected agents.

**Consequence:** Personas are lenses, not separate agents. The ego activates a
persona; the voice remains unified. Shadow work is a future layer — the
architecture has a place for it.

---

### D6 — Claude Code and Pi are two interfaces over one core

**Decision:** The `memory` Python package is the only implementation of
identity, conversation, memory extraction, search, and task management. Claude
Code and Pi are thin interfaces that call this shared core.

**Rationale:** Without this decision, Pi support would require duplicating or
forking the memory logic. Duplication drifts. The right model is one
implementation with two frontends.

**Consequence:** Skill logic must move from `.claude/skills/mm:*/run.py` into
`src/memory/skills/` so both interfaces can call it. Claude skills and Pi
skills become thin wrappers (CV1.E1). Neither interface owns behavior.

---

### D7 — Automatic extraction requires a journey and at least four messages

**Decision:** `end_conversation(extract=True)` fires the memory and task
extraction pipeline only when: (1) the conversation has a journey set, and (2)
the conversation has at least four messages.

**Rationale:** Short or journey-less conversations produce low-quality
extractions. The quality guard prevents noise accumulation in the memory bank.
Four messages is the minimum for a substantive exchange.

**Consequence:** Casual, one-off conversations do not pollute the memory bank.
A journey must be set for extraction to fire — this is intentional. The session
hook respects this guard automatically.

---

### D8 — Skill logic belongs in `src/memory/skills/`

**Decision:** All non-trivial skill behavior — load context, switch
conversations, log sessions, run backups — is implemented as importable Python
modules in `src/memory/skills/`. Interface-specific entry points (Claude skill
`run.py`, Pi skill `run.py`) are thin wrappers that call these modules.

**Rationale:** This is the structural consequence of D6. Without it, adding Pi
support requires copying `.claude/skills/mm:*/run.py` into `.pi/skills/mm-*/run.py`,
creating two copies of the same logic that will diverge.

**Consequence:** CV1.E1 (Shared Command Core) is a prerequisite for CV1.E2
(Pi Skill Surface). The Pi skill wrappers cannot be written until the shared
modules exist.

---

## Current Builder Baseline

### Ariad governs Builder delivery for Mirror Mind

**State as of v0.28.0:** Mirror Mind has adopted Ariad prospectively at the
parent `mirror-mind` journey level. Builder Mode remains backward-compatible for
journeys that have not adopted Ariad, but Mirror Mind delivery work now uses
Ariad runtime checkpoints, deterministic marked surfaces, and explicit hard
gates.

**Completed release boundary:** `v0.28.0 — Ariad Delivery Story Lifecycle`
closed `CV20.DS5`. Builder supports both Navigator flow units:

- `story_by_story`: child User/Technical Stories are Navigator-facing lifecycle
  units.
- `delivery_story`: the parent Delivery Story is the Navigator-facing lifecycle
  unit while child User/Technical Stories remain traceable Driver work packages.

In `delivery_story` flow, Builder can plan, approve, validate, review, check
coherence, and close the Delivery Story as one aggregate lifecycle. Canonical
checkpoint artifacts are materialized in the roadmap package as `plan.md`,
`validation.md`, `review.md`, `coherence.md`, and `done.md`. Navigator-facing
Ariad surfaces should render with the visual card grammar, not only as plain
marked text blocks.

**Release state:** `main` and `stable` were published for `v0.28.0`. `main` then
received one CI-stabilization commit for a path-wrapping assertion. GitHub
Actions passed on `main` after that fix. The `v0.28.0` tag and `stable` point at
the release commit before the test-only stabilization commit.

**Next Builder work:** Continue with `CV20.DS6 — Refinement Workbench And Flow`.
That work should make Ariad Refinement visible inside Builder through Workbench,
Refinement Stories, Change Requests, and a two-level refinement flow. Release and
push governance moves to `CV20.DS7 — Release And Push Policies`; do not assume
push/release permission from ordinary Done, and keep release and stable promotion
as separate Navigator-authorized hard gates.

---

## Glossary

| Term | Meaning |
|------|---------|
| **journey** | An ongoing project, life arc, or area where the mirror carries context |
| **journey path** | A living status document for a journey, stored in the database |
| **persona** | A specialized lens the ego activates in a specific domain |
| **ego** | The operational identity — how the mirror manifests day-to-day |
| **self / soul** | The deep, unchanging identity — purpose, values, worldview |
| **shadow** | Recurring tensions and blind spots (planned layer) |
| **interface** | A way to interact with the mirror — Claude Code, Pi, or future |
| **spike** | A time-boxed technical investigation recorded as a historical document |
| **CV** | Capability Value — a major delivery stage with clear user-visible impact |
| **worklog** | Operational progress record — current state, not history |

---

**See also:** [Decisions](decisions.md) · [Roadmap](roadmap/index.md) · [Principles](../product/principles.md)
