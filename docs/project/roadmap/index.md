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
| [CV13](cv13-mirror-web-console/index.md) | Mirror Web Console | 🟡 Planned |
| [CV14](cv14-stateful-extensions/index.md) | Stateful Extension System | 🟢 E1–E2 Done · E3–E4 provisional |

---

## CV9 — Mirror Mind 1.0

In progress. Mirror Mind 1.0 focuses on refactoring, stabilization, release
hardening, documentation polish, process/versioning alignment, web visibility,
and public readiness. Documentation Polish (CV9.E4), Process & Versioning
Alignment (CV9.E5), and Distribution & Tooling (CV9.E3) are complete. Web
Visibility (CV9.E6) is complete: the read-only Identity and Workspace
perspectives were validated against the personal Mirror, including a repaired Pi
Builder journey-association bug that had made Workspace conversation data look
stale. Boundary Hardening and Stabilization remain planned before the full CV9
done condition is met.

---

## CV10 — Coherence Engine

Planned. CV10 makes coherence a natural Builder lifecycle capability. Builder
will automatically evaluate Units of Coherence for the active journey's
`project_path`, surface blocking gaps before implementation, and refresh a
project-visible coherence index. See the [CV10 index](cv10-coherence-engine/index.md).

## CV11 — Localization

Future. Localization is a Mirror-wide surface, not a coherence-specific feature.
It starts with `en-US` and `pt-BR` and changes language, not semantics. See the
[CV11 index](cv11-localization/index.md).

## CV12 — Audience Modes

Future. Audience modes adapt explanation depth and vocabulary for technical and
non-technical users without changing facts, standards, or coherence rules. See
the [CV12 index](cv12-audience-modes/index.md).

## CV13 — Mirror Web Console

Planned/deferred. The local web interface work is currently advancing inside
CV9.E6 Web Visibility so the 1.0 release can ship read-only Identity and
Workspace perspectives first. CV13 remains the broader post-1.0 web console
track for future inspection/editing expansion. See the [CV13 index](cv13-mirror-web-console/index.md).

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

## Radar

Forward-looking improvements that have been identified but are not yet
committed to a CV or Epic. Items here are surfaced for visibility, not
planned for a specific cycle. When one of these becomes urgent or fits a
larger arc, it graduates into a CV/Epic and leaves the radar.

Add new items at the top. Each entry should name the problem (not just the
solution), point at evidence or source, and sketch the rough shape of the
work.

### Agentic web console for controlled Mirror operations

**Source:** CV9.E6 web visibility exploration and Navigator product discussion
**Surfaced:** 2026-05-24

After the read-only web visibility surface is useful, Mirror could grow a local
agentic web console where users ask for updates in natural language and watch a
headless agent run in the browser. The strategic goal is to avoid building CRUD
forms for every Mirror mutation: identity, personas, journeys, memory
consolidation, and shadow cultivation are semantic operations better handled
through proposals, approval, controlled service calls, and audit trails.

This should not be folded into CV9.E6. It likely needs its own future CV because
it changes the web surface from read-only visibility into controlled agentic
operation. See [Agentic Web Console](../../product/envisioning/agentic-web-console.md).

Possible first slices:

- Headless agent run spike with no writes.
- Browser event timeline for a read-only agent explanation run.
- Proposal-only flow for identity/persona updates.
- Approval-gated writes through Mirror Core services, not raw SQL.
- Audit trail connecting requested intent, run events, before/after state, and evidence.

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
