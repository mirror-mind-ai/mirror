[< Project](../briefing.md)

# Roadmap

The roadmap is organized as **CV → Epic → Story**. Each level has its own
folder and index. Stories that are non-trivial have a `plan.md` and a
`test-guide.md` written before implementation begins.

**CV** (Capability Value) — a major delivery stage with clear user-visible impact.  
**Epic** — a cohesive block of work within a CV, with a done condition.  
**Story** — an atomic, user-centric delivery that can be verified end-to-end.

---

## Capability Values

| Code | Capability Value | Status |
|------|-----------------|--------|
| [CV0](cv0-english-foundation/index.md) | English Foundation | ✅ Done |
| [CV1](cv1-pi-runtime/index.md) | Pi Runtime | ✅ Done |
| [CV2](cv2-runtime-portability/index.md) | Runtime Portability | ✅ Done |
| [CV3](cv3-pi-skill-parity/index.md) | Pi Skill Parity | ✅ Done |
| [CV4](cv4-framework-user-separation/index.md) | Framework/User Separation | ✅ Done |
| [CV5](cv5-multisession-safety/index.md) | Multisession Safety | ✅ Done |
| [CV6](cv6-intelligence-runtime-maturity/index.md) | Multi-User Onboarding, Identity Runtime Maturity, and Extensibility | ✅ Done |
| [CV7](cv7-intelligence-depth/index.md) | Intelligence Depth | ✅ Done |
| [CV8](cv8-runtime-expansion/index.md) | Runtime Expansion: Gemini CLI and Codex | ✅ Done |
| [CV9](cv9-mirror-1-0/index.md) | Mirror Mind 1.0 — refactoring, stabilization, and public release preparation | 🟢 In Progress |
| [CV10](cv10-coherence-engine/index.md) | Coherence Engine | 🟡 Planned |
| [CV11](cv11-localization/index.md) | Localization | ⚪ Future |
| [CV12](cv12-audience-modes/index.md) | Audience Modes | ⚪ Future |
| [CV13](cv13-mirror-web-console/index.md) | Mirror Web Experience | ✅ Done |
| [CV14](cv14-stateful-extensions/index.md) | Stateful Extension System | 🟢 E1–E2 Done · E3–E4 provisional |
| [CV15](cv15-cognitive-location/index.md) | Cognitive Location | ✅ Done |
| [CV16](cv16-explorer-mode/index.md) | Explorer Mode | ✅ Done |
| [CV17](cv17-soul-mode/index.md) | Soul Mode | ✅ First Ritual Done |
| [CV18](cv18-soul-mode-more-voices/index.md) | Soul Mode More Voices | ✅ Done |
| [CV19](cv19-soul-mode-integration/index.md) | Soul Mode Integration | ✅ Done |
| [CV20](cv20-builder-mode-evolution/index.md) | Builder Mode Evolution | 🟢 In Progress |
| [CV21](cv21-runtime-expansion-ii/index.md) | Runtime Expansion II: Plugin & MCP Convergence | 🟢 In Progress |
| [CV22](cv22-typescript-core-port/index.md) | TypeScript Core Port (Database-Seam Strangler) | 🟢 In Progress |

---

## CV9 — Mirror Mind 1.0

In progress. Mirror Mind 1.0 focuses on refactoring, stabilization, release
hardening, documentation polish, process/versioning alignment, web visibility,
and public readiness. Documentation Polish (CV9.E4), Process & Versioning
Alignment (CV9.E5), and Distribution & Tooling (CV9.E3) are complete. Web
Visibility (CV9.E6) is complete: the read-only Identity and Workspace
perspectives were validated against the personal Mirror, including a repaired Pi
Builder journey-association bug that had made Workspace conversation data look
stale. Stabilization now includes production updater resilience and conversation
title hardening, released in v0.16.1 and v0.17.0 respectively. Conversation
metadata lifecycle has entered Delivery as CV9.DS7; its dry-run decision path
and evidence-based policy are done, with apply behavior still remaining.
Boundary Hardening and the remaining stabilization stories are still open before
the full CV9 done condition is met.

---

## CV10 — Coherence Engine

Planned. CV10 makes coherence a natural Builder lifecycle capability. Builder
will automatically evaluate Units of Coherence for the active journey's
`project_path`, surface blocking gaps before implementation, and refresh a
project-visible coherence index. See the [CV10 index](cv10-coherence-engine/index.md).

## CV16 — Explorer Mode

Done. CV16 gives Mirror a native exploratory lens for the uncertain middle
between reflection and construction. The first release includes status bar
orientation, mode transition surfaces, discard-current runtime hygiene, explicit
Explorer activation and deactivation, durable Exploratory Stories, story
thickening surfaces, narrative snapshots, experiment proposals, attractors,
Builder handoff artifacts, source-evidence handoff review, required surface
rendering markers, and Builder boundary routing for operational mutation
requests. See the [CV16 index](cv16-explorer-mode/index.md).

## CV17 — Soul Mode

First ritual done. CV17 turns the Soul Mode exploration into the first usable ritual mode for inner life. The first release includes explicit Soul Mode entry, free listening to the living field, situated Possible Listenings, minimal Self Voice and Shadow Voice listening lenses, Fruit In Maturation, Harvested Fruit, and optional single-entry journal persistence. Wisdom Voice and Beauty Voice shipped in CV18. Passagem, Return To Center, Closing Day, and additional new voices are no longer active roadmap items; the remaining Soul Mode horizon is integration followed by Web Soul Mode UI. See the [CV17 index](cv17-soul-mode/index.md).

## CV18 — Soul Mode More Voices

Done. CV18 expands Soul Mode from the first ritual into a fuller listening constellation by making Wisdom Voice and Beauty Voice hearable inside the ritual flow. DS3 refinements were cancelled because the required tuning happened inside DS1/DS2 validation, and DS4 packaged `v0.25.0 — Soul Mode More Voices`. See the [CV18 index](cv18-soul-mode-more-voices/index.md).

## CV19 — Soul Mode Integration

Done. CV19 turns Soul Mode from a ritual that can produce insight into a ritual that can close cleanly, ask what deserves to remain, render a multi-layer Integration Proposal, and apply confirmed identity integrations additively with individual records. The release packaged `v0.26.0 — Soul Mode Integration`. See the [CV19 index](cv19-soul-mode-integration/index.md).

## CV20 — Builder Mode Evolution

In progress. CV20 evolves Builder Mode from a context-loading skill into a disciplined delivery environment governed by a declarative method DSL. Ariad is the inaugural method, with adoption, resume, Delivery lifecycle, Refinement Workbench, debt review, coherence, history, release, and push policies represented as method data rather than hard-coded agent habit. CV20.DS6 Refinement Workbench And Flow is complete; the next planned slice is CV20.DS7 Release And Push Policies. See the [CV20 index](cv20-builder-mode-evolution/index.md).

## CV21 — Runtime Expansion II: Plugin & MCP Convergence

In progress. CV21 is the successor to CV8, driven by one force: the coding-agent ecosystem (Claude, Codex, Antigravity, Grok Build, Gemini) has converged on the same primitives — plugins, hooks, skills, and MCP — and on the same plugin shape, with Claude Code's `.claude-plugin/plugin.json` emerging as the de-facto cross-runtime interchange format (`agy plugin import claude`, `grok plugin import`, Codex marketplaces). Rather than maintain N bespoke adapters, CV21 packages Mirror Mind **once** as a canonical plugin plus an MCP server and propagates it by import/install. Claude is the anchor: already L4, but shipped through the standalone `.claude/` tier when it should be a plugin — converting it produces the canonical package the others consume. Codex is upgraded L3→L4 (0.139.0 now has Claude-style hooks); Antigravity migrates the Gemini lineage (Gemini Code Assist's individual backend is deprecated 2026-06-18); Grok Build is added. External extensions ride the same package. Sequenced by implementation leverage and user base — foundation → Claude → Codex → Antigravity → Grok — not by the Gemini deadline, since few Mirror users are on Gemini. See the [CV21 index](cv21-runtime-expansion-ii/index.md).

## CV22 — TypeScript Core Port (Database-Seam Strangler)

In progress. CV22 is the successor to CV21: where CV21 packaged Mirror's runtime
surface once (plugin + MCP) and propagated it across runtimes, CV22 unifies the
**core language underneath** by porting the Python core (`src/memory/`) to
TypeScript. The motivation is convergence — npm distribution, one language across
core and the already-TypeScript runtimes, a wider contributor pool, and MCP/plugin
alignment. The approach is a **database-seam strangler**, never a big-bang
rewrite: a TS front door over a shared `memory.db`, with the Python core
dissolving one observable command at a time, governed by a rule that new feature
work lands in TS (Python froze to maintenance-only at the CV21.E2.S2 baseline).
The first epic, CV22.E1, validated the riskiest assumption — hybrid-ranker parity
between TS and Python over the same SQLite file, proven on 480 real memories with
1536-dim embeddings and a ~1,700× margin over the near-tie risk. The strategy is
recorded in [Decisions](../decisions.md). See the [CV22 index](cv22-typescript-core-port/index.md).

## CV11 — Localization

Future. Localization is a Mirror-wide surface, not a coherence-specific feature.
It starts with `en-US` and `pt-BR` and changes language, not semantics. See the
[CV11 index](cv11-localization/index.md).

## CV12 — Audience Modes

Future. Audience modes adapt explanation depth and vocabulary for technical and
non-technical users without changing facts, standards, or coherence rules. See
the [CV12 index](cv12-audience-modes/index.md).

## CV13 — Mirror Web Experience

Done. CV13 evolved the post-1.0 web arc from read-only visibility into a fuller
local web experience through staged releases: read-only refinement, multi-Mirror
selection and preferences, configuration surfaces, conversation intelligence,
allowlisted web operations, asynchronous operation runs, event timelines,
controlled command execution, cooperative cancellation, approval checkpoints,
and a bounded read-only agent-run prototype with a polished run console. See the
[CV13 index](cv13-mirror-web-console/index.md).

## CV3 — Pi Skill Parity

Every skill available in Claude Code is also available in Pi. Three epics:
CLI Completeness → Pi Skill Wrappers → Pi Intelligence Skills. See
[CV3 index](cv3-pi-skill-parity/index.md) for skills inventory and sequencing.

## CV4 — Framework/User Separation

Done. CV4 moved Mirror Mind toward a reusable framework with user-owned
identity and runtime state outside the repo. The current state now includes
user-home path resolution, template bootstrap, user-home seeding,
multi-user-safe command targeting, production DB and runtime-state defaults
derived from the resolved mirror home, transcript export aligned with the
user-home model, and an explicit legacy migration workflow for Portuguese-era
databases. See the [CV4 index](cv4-framework-user-separation/index.md).

## CV5 — Multisession Safety

Done. CV5 replaced singleton runtime session state with a database-backed,
session-scoped control plane. Session ↔ conversation binding now lives in
SQLite, mirror state is session-scoped for runtimes that pass explicit session
ids, stale-orphan handling skips all active runtime sessions rather than one
ambient session, and concurrent startup/session creation now has regression
coverage. See the [CV5 index](cv5-multisession-safety/index.md).

## CV6 — Multi-User Onboarding, Identity Runtime Maturity, and Extensibility

Done. CV6 made Mirror Mind ready for broader multi-user use: runtime-relevant
persona metadata persists in the database, persona routing is database backed
and inspectable, repo/personal/runtime boundary leaks have been cleaned up, the
extension model exists with an end-to-end `review-copy` reference path across Pi
and Claude, and new users now bootstrap from meaningful starter identity assets
instead of placeholders.

## CV7 — Intelligence Depth

Done. All four epics shipped: pipeline observability (E1), reception and
conditional composition (E2), extraction quality (E3), and memory depth (E4:
hybrid search, honest reinforcement, consolidation, shadow cultivation).
997 tests. ruff clean. CI green.

## CV8 — Runtime Expansion: Gemini CLI and Codex

Done. CV8 extends Mirror Mind beyond Claude Code and Pi into two additional
coding-agent runtimes. The order was inverted from the original plan: Gemini CLI
shipped first at L4 full parity, and Codex shipped second at L3 parity through a
wrapper script, JSONL backfill, `AGENTS.md`, and `$mm-*` skill invocation. See
the [CV8 index](cv8-runtime-expansion/index.md).

---

## CV15 — Cognitive Location

Done. CV15 turns hierarchical journeys into a cognitive-location surface. It
shipped in two releases: v0.20.0 added one-level journey hierarchy and
hierarchical journey rendering across web and textual surfaces; v0.21.0 added
Current Scene as the Workspace home with grounded persisted orientation over a
bounded read model. See the [CV15 index](cv15-cognitive-location/index.md).

## Radar

Forward-looking improvements that have been identified but are not yet
committed to a CV or Epic. Items here are surfaced for visibility, not
planned for a specific cycle. When one of these becomes urgent or fits a
larger arc, it graduates into a CV/Epic and leaves the radar.

Add new items at the top. Each entry should name the problem (not just the
solution), point at evidence or source, and sketch the rough shape of the
work.

### Mirror Web Experience staged major release

**Source:** CV9.E6 validation, Agentic Web Console exploration, and Navigator product review
**Surfaced:** 2026-05-25
**Status:** Graduated into [CV13 Mirror Web Experience](cv13-mirror-web-console/index.md)

The post-1.0 web work is now organized as CV13. The agentic web console remains
the major-release horizon, but the path now runs through smaller product slices:
read-only refinement, multi-Mirror selection and preferences, configuration
surfaces, conversation intelligence, and allowlisted streamed web operations.

### Mirror self-update and runtime health

**Source:** `mirror-self-update` journey, Ariad coherent update policy, Maestro onboarding/update work  
**Surfaced:** 2026-05-22

Mirror should eventually be able to diagnose its installed state and safely update itself when new releases are available. This is an operational update problem, not just a git command: it involves repository state, local database, migrations, installed extensions, generated runtime skills, backup, validation, and recovery.

First slice delivered: `python -m memory runtime status` reports Mirror version, repository, git state, mirror home, database, installed extensions, Python version, and environment.

Possible next slices:

- `runtime status` health expansion for migrations and extension install state.
- Clean extension reinstall support for `memory extensions install`.
- `runtime update --dry-run` that plans update steps without writing.
- Backup and recovery route before applying runtime or migration changes.
- Release discovery once local status and dry-run planning are reliable.

### Surface silent failures in runtime extensions

**Source:** [Troubleshooting: Pi logger fix](../../process/troubleshooting.md#pi-logger-fails-silently-when-python3-resolves-outside-the-project-venv)  
**Surfaced:** 2026-05-10

Runtime extensions (currently the Pi `mirror-logger`, eventually equivalent
hooks in Gemini CLI and Codex) are designed to **swallow failures** so that a
bug in the persistence pipeline never blocks the user's session. This is the
right call for usability, but it also means defects in that layer can persist
for a long time with no visible signal: the recent Pi logger fix surfaced
only after the bug had been accumulating silent failures for over a month,
and only because someone (the user) verified the database state directly.

The radar item is to add a discreet, non-blocking signal that surfaces
recent persistence failures to the user without breaking the
fail-quietly contract. Possible shapes, in increasing weight:

- A health subcommand: `uv run python -m memory conversation-logger health` that
  scans `~/.mirror-minds/mirror-logger.log` for recent WARN/ERROR lines and reports
  a green/yellow/red status with the last error message.
- An automatic one-line note at the top of `mm-mirror` output when the
  health check is non-green, e.g. `⚠️ Mirror logger has 47 errors in the
  last 24h. Run ‘mm-help diagnose’.`
- A periodic backfill on `session-start` that runs even when no orphaned
  sessions are detected, simply to prove the path is alive.

Scope: small to medium, depending on how much UI integration is desired.
Low-risk because all options are additive and do not change the
fail-quietly behavior of the extensions themselves.

---

**See also:** [Briefing](../briefing.md) · [Decisions](../decisions.md) · [Worklog](../../process/worklog.md) · [Troubleshooting](../../process/troubleshooting.md)
