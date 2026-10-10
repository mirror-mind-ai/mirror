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

### D2 — TypeScript as the core language, run by Node.js

**Decision:** The core (`ts/src/`) is TypeScript, run directly by Node.js 24 or
newer — `node:sqlite` for the database, native type stripping for the source,
no build step. Every command, hook, and MCP entry is one process into the same
front door (`ts/src/frontDoor/cli.ts`). The repository is the npm package
`mirror-mind`; an installed package has the same paths as a checkout.

**Rationale:** The core was Python 3.10+ from CV0 through v0.31.14, and that
choice was right for the data-pipeline work the system does. What changed is
where the core runs: inside four Node-based agent runtimes, on a machine where
the person installs one thing. One language for the core, the Pi extension, the
hooks, and the MCP server means one runtime to install, one test suite, one
process model — and no second engine to ship. CV22 ported every command one at
a time, each proven against the Python engine before it answered users, and
deleted Python when nothing reached it any more (CV22.DS10.TS5, 2026-09-25;
[decision](decisions.md#the-python-core-is-gone-and-the-answers-nobody-can-grade-any-more-are-the-front-doors-own)).

**Consequence:** Nothing in the product, the package, or the tooling that builds
or checks it spawns an interpreter; two guards in CI hold that for the tree and
for the tarball. A runtime integration calls `mirror`; the Pi extension spawns
the core it ships with. Superseded the Python D2 on 2026-10-09 (CV22.DS10.US3
plateau 6, decision D11).

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

### D6 — Four runtimes are thin interfaces over one core

**Decision:** The TypeScript core is the only implementation of identity,
conversation, memory extraction, search, tasks, and the Builder and Explorer
lifecycles. Pi, Claude Code, Gemini CLI, and Codex are thin interfaces: each
translates its lifecycle events into front-door calls and loads the same
skills, per the [runtime interface contract](../product/specs/runtime-interface/index.md).

**Rationale:** Without this decision, each runtime would need its own copy of
the memory logic, and copies drift. One implementation, four frontends — and a
guard (`checkSkillCommandParity.ts`) that keeps every runtime's copy of a skill
invoking the same entry point the same way.

**Consequence:** A runtime owns no behavior. Adding one is a wiring question:
hooks for its lifecycle events, a place for the skills, and a way to deliver the
Operating Instructions (`AGENTS.md`). Rewritten from "Claude Code and Pi" on
2026-10-09 (CV22.DS10.US3 plateau 6, decision D11); the original D6 dates from
CV1, when those were the two.

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

### D8 — A skill is a prompt that names a front-door command

**Decision:** A skill (`SKILL.md`) carries no logic. It tells the agent which
`mirror <command>` to run and how to present the answer; the behavior is in the
core's domain modules (`ts/src/<domain>/`), reached through the front door's
routing. The Pi copy under `.pi/skills/` is the source; the Claude Code copies
and the packaged plugin are generated from it.

**Rationale:** This is the structural consequence of D6, carried through the
port. The CV1 form of this decision put shared logic in `src/memory/skills/`
so that per-runtime `run.py` wrappers would not diverge; the port removed the
wrappers altogether, so the only thing a skill can diverge on is the invocation
it names — and the parity guard forbids that.

**Consequence:** Changing what a skill does is a change to the core, tested
there. Changing what a skill says is a change to one file, propagated by the
plugin builder. Rewritten on 2026-10-09 (CV22.DS10.US3 plateau 6, D11).

---

## Current Builder Baseline

### Ariad governs Builder delivery for Mirror Mind

**State as of CV22.DS10.US3 (2026-10):** Mirror Mind delivery work runs under
Ariad: runtime checkpoints, deterministic marked surfaces, explicit hard gates,
Delivery Stories expanded into User and Technical Stories, Plan approval before
implementation, Navigator validation before Debt Review, Coherence before Done.
Builder Mode stays backward-compatible for journeys that have not adopted
Ariad. Refinement Work is file-first: `docs/project/refinement/index.md` is the
sole authority (the SQLite Workbench that `v0.29.0` introduced was retired by
CV22.DS10.TS4; its [cutoff](../releases/pending-cutoffs.md#the-sqlite-refinement-workbench)).

**Completed release boundary:** `v0.31.14`, the last Python-bearing release,
tagged `cv22-last-python-bearing`. Everything since is CV22, which
[releases once, when the migration is complete](decisions.md#cv22-releases-once-when-the-migration-is-complete):
the next release is the first whose core is TypeScript alone and whose
distribution is npm.

**Release state:** the CV22 release is gated on the Ariad trust floor (worked
before US3; complete), CR121's decision, and the release gate's own checks (the
production clone's last Python-era hop, F20). Push, tag, stable promotion, and
`npm publish` remain separate, explicitly authorized hard gates; the promotion
script prints the publication step and never runs it.

**Current Builder work:** `CV22.DS10.US3 — npm distribution`, the migration's
last story. Do not assume push or release permission from an ordinary Done.

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
