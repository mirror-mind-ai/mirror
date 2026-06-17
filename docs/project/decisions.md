[< Project](briefing.md)

# Decisions

Incremental decisions made as the project evolves. Foundational premises live
in [Briefing](briefing.md). This file captures the decisions that came after —
choices made during delivery, lessons learned, and open questions not yet
resolved.

---

## Completed Decisions

### Builder adds Refinement Work before release/push governance

**Date:** 2026-06-17
**Reference:** [CV20 Builder Mode Evolution](roadmap/cv20-builder-mode-evolution/index.md), [CV20.DS6 Refinement Workbench And Flow](roadmap/cv20-builder-mode-evolution/cv20-ds6-refinement-workbench-flow/index.md), Ariad branch `ariad-refinement-workbench` commit `2447705`

After CV20.DS5 made the Ariad Delivery Story lifecycle traversable end to end,
Mirror needs a way to refine the lived Builder lifecycle through real use without
turning every adjustment into roadmap Delivery Work. Ariad was extended on a
feature branch with a third work area: Refinement. Mirror will implement the
runtime side prospectively in CV20.DS6.

Decision: Builder should support a Workbench outside the roadmap. The Workbench
holds Change Requests and Refinement Stories. Roadmap items remain Delivery Work;
Workbench items become Refinement Work. A quick fix is not a separate flow: it
creates a minimal Refinement Story with one Change Request and pulls it
immediately.

Consequences:

- `CV20.DS6` becomes `Refinement Workbench And Flow`.
- Existing planned release/push governance moves to `CV20.DS7`.
- Debt ledger, method preferences, and Builder documentation move to `CV20.DS8`,
  `CV20.DS9`, and `CV20.DS10` respectively.
- Refinement Review records patterns, debt candidates, or follow-up, but does
  not mutate files directly. All mutations happen through Change Request cycles.
- The first intended dogfooding target after DS6 is `RS-001 Builder lifecycle
  end-to-end refinement`, living in the Workbench rather than the roadmap.

### Mirror Mind adopts Ariad prospectively after v0.27.0

**Date:** 2026-06-14
**Reference:** [CV20 Builder Mode Evolution](roadmap/cv20-builder-mode-evolution/index.md), [Ariad adoption note](roadmap/ariad-adoption.md), [v0.27.0 release note](../releases/v0.27.0.md)

After publishing `v0.27.0 — Ariad Builder Lifecycle Runtime`, Mirror Mind adopts Ariad as the project-level Builder method through the parent `mirror-mind` journey. The Builder Mode Evolution child journey remains adopted as the first dogfooding workstream until method inheritance between parent/child journeys is modeled explicitly. The adoption is **prospective**: existing CV20 roadmap and story artifacts remain valid historical records unless touched by active work, and new Builder delivery work should use Ariad's runtime lifecycle gates and deterministic surfaces.

Consequences:

- Future Mirror Mind Builder work should be pulled, planned, validated, reviewed, checked for coherence, and closed through Ariad Builder commands when possible.
- CV20 remains the first dogfooding area under the project-level adoption.
- The adoption does not retroactively rewrite DS1–DS4 artifacts.
- The current post-adoption priority order is DS5 Delivery Story Level Lifecycle, then DS6 Refinement Workbench And Flow, then DS7 Release And Push Policies, then DS8 Debt Ledger And Refactor Loop, then DS9 Method Preferences And Overrides, then DS10 Builder Documentation And Migration.
- Navigator preference/config override work remains explicitly planned in CV20.DS9 rather than assumed by adoption.

### CV21 converges on a canonical plugin plus MCP server, bridged by import

**Date:** 2026-06-14
**Reference:** [CV21 index](roadmap/cv21-runtime-expansion-ii/index.md), [CV21.E1 Unified Plugin & MCP spike](roadmap/cv21-runtime-expansion-ii/cv21-e1-unified-plugin-mcp-spike/index.md)

The CV21.E1 spike validated — in an isolated scratch directory, mutating no
production runtime config — that the post-CV8 ecosystem convergence is real
enough to package Mirror Mind once instead of maintaining N bespoke adapters.
Decision: **converge** on a canonical package (a Claude-format plugin plus a
Mirror MCP server) propagated per runtime by import/install.

Empirical findings:

1. **A Mirror plugin validates on Claude.** A minimal plugin bundling `mm-*`
   skills + lifecycle hooks passes `claude plugin validate` once unknown manifest
   keys are dropped (the 2.1.114 validator rejects `$schema`, despite the docs).
2. **The same component taxonomy validates on Antigravity.** `agy plugin
   validate` recognizes the identical categories (skills, agents, commands,
   mcpServers, hooks). The formats are structurally aligned but **not
   byte-identical**: Claude uses `.claude-plugin/plugin.json`; `agy` expects
   `plugin.json` at the plugin root and reads hooks/MCP from different locations.
   `agy plugin import claude` is the conversion bridge, so Antigravity consumes
   the Claude plugin rather than a hand-maintained agy-native copy.
3. **Claude `@skills-dir` in-place plugins** load a plugin folder from
   `<repo>/.claude/skills/` (project, trust-gated) or `~/.claude/skills/`
   (personal) with no marketplace and no install step — the cleanest packaging
   path for Mirror's `mm-*` skills + hooks + MCP.
4. **Codex** uses a local marketplace-snapshot model plus a full Claude-style
   hook system and native skills; it consumes the package via a marketplace
   snapshot or project `.codex/` hooks.
5. **MCP is portable but pull-based.** `mcpServers` is declared the same way
   across Claude, Antigravity, and Codex, so a Mirror MCP server is portable as
   the runtime-agnostic command surface. But MCP tools/prompts are invoked on
   demand; MCP **cannot do automatic per-turn Mirror Mode injection**. Automatic
   injection stays in per-runtime `UserPromptSubmit`/`BeforeAgent` hooks (now all
   Claude-shaped and thin). Grok Build, lacking per-turn hooks, caps at L3.

Canonical package shape: a **plugin** (Claude format) bundling `mm-*` skills +
lifecycle hooks, plus an **MCP server** (`python -m memory mcp`) for the
command surface and on-demand context. External extensions bundle into the
plugin's `skills/` and/or expose as MCP tools, so every runtime inherits them and
the `.agents/` exposure gap closes.

Propagation: Claude loads the plugin in place (E2); Antigravity via `agy plugin
import claude` (E6–E7); Codex via marketplace snapshot + native hooks (E3–E5);
Grok via shared MCP + skill discovery, capped at L3 (E9–E10). Live import
execution (which mutates each runtime's config) is deferred to those per-runtime
epics, where that mutation is in scope.

Fallback: if `agy`/`grok` plugin import proves unreliable during implementation,
keep thin per-runtime hook adapters but still share the MCP server and skill
surface. The foundation pays off either way, so no per-runtime epic is blocked on
import working perfectly.

---

### Soul Mode active roadmap narrows after integration and web UI

**Date:** 2026-06-08
**Reference:** [CV18 Soul Mode More Voices](roadmap/cv18-soul-mode-more-voices/index.md)

After validating Wisdom Voice and Beauty Voice, the Soul Mode roadmap is narrowed. Passagem, Return To Center, Closing Day / Daily Soul Ritual, and additional new voices are discarded from the active roadmap. They remain historical exploration context, not planned product commitments.

The future Soul Mode sequence is:

1. Soul Mode Integration: closing rite, review, and safe identity enrichment proposals with explicit confirmation.
2. Soul Mode Web Ritual UI: a web experience for the ritual grammar already validated in text.

Wisdom/Beauty source libraries remain dormant rather than planned. Mirror should not maintain a local canonical library of texts only for Soul Mode. Source/library work may return only if there is a strong API/provider solution that can retrieve or ground sources externally without embedding a bespoke library in the core framework.

Consequences:

- Do not open delivery stories for Passagem, Return To Center, Closing Day, or new voice expansion unless this decision is explicitly revisited.
- Treat references to those rites in older Soul Mode docs as historical/exploratory context.
- Keep source-provider/library ideas out of the active roadmap until an API-based approach is identified.
- Prioritize integration first, then Web Soul Mode UI.

### Explorer persistence splits durable story state from handoff evidence

**Date:** 2026-06-07
**Reference:** [CV16.DS8 Persistence and Visibility](roadmap/cv16-explorer-mode/cv16-ds8-persistence-and-visibility/index.md)

CV16.DS8 is split into two delivery stories. DS8.1, Durable Explorer Stories, persists Exploratory Stories as durable, resumable, visible records with `active`, `archived`, and `promoted` lifecycle states. DS8.2, Editorial Handoff Evidence, adds source conversations, handoff completeness review, and optional privacy-safe `full-conversation.md` material.

Consequences:

- Persistence and lifecycle can ship without waiting for the heavier editorial evidence workflow.
- Handoff evidence no longer blocks Explorer from gaining durable memory.
- Source evidence and raw conversation export remain out of DS8.1.
- DS8.2 can focus on provenance, completeness, and privacy boundaries without redesigning story storage.

### Explorer Mode must route operational mutations through Builder boundary

**Date:** 2026-06-07
**Reference:** [CV16.DS9 Required Surface Rendering and Operational Boundary Contract](roadmap/cv16-explorer-mode/cv16-ds9-required-surface-rendering-contract/index.md)

Explorer Mode preserves uncertainty and thickens Exploratory Stories. It should not directly absorb clear operational requests such as editing files, applying procedures to documents, creating code, or mutating project state. When such a request appears while Explorer Mode is active, Mirror should name the boundary and ask to switch to Builder Mode before executing, unless a future explicit operational override is defined.

Consequences:

- Requests like “apply privacy rules to this generated document” are Builder work, even if the user is currently in Explorer Mode.
- Explorer should not call `story thicken` for operational mutations unless the result also changes the Exploratory Story and the user asks to preserve that change.
- DS9 will harden both required surface rendering and the Explorer-to-Builder operational boundary before the first Explorer release.

### Explorer thickening is for narrative change, not local refinement

**Date:** 2026-06-06
**Reference:** [CV16 Explorer Mode](roadmap/cv16-explorer-mode/index.md)

Explorer Mode should not treat every adjustment as story thickening. `story thicken` is reserved for substantive changes to the Exploratory Story, such as changed attractor, hypothesis, ritual, voice, scope, product concept, experiment, promotion boundary, central tension, or narrative arc. Local refinements like icons, microcopy, wording polish, labels, formatting, and small naming adjustments should remain conversational unless the user explicitly asks to preserve them.

Consequences:

- The Explorer skill now requires a `narrative/substantive` versus `local/refinement` classification before calling `story thicken`.
- If the assistant is uncertain whether a change belongs in the Exploratory Story, it should ask the user before updating story state.
- Explorer preserves discovery; it does not version every editorial polish.

### Explorer surfaces must render before interpretation

**Date:** 2026-06-06
**Reference:** [CV16 Explorer Mode](roadmap/cv16-explorer-mode/index.md)

Explorer Mode surfaces are user-facing product output, not internal command evidence. When a contained Explorer command returns a `△ ...` surface such as `STORY THICKENED`, the assistant must render that surface visibly before commentary or synthesis.

Consequences:

- The Pi skill now makes verbatim first-block rendering mandatory for Explorer story surfaces.
- A future CV16 hardening story will mark required surfaces in CLI output and, if possible, make runtimes preserve or enforce them.
- External validation should check not only that state changes, but that the visible surface appears before assistant interpretation.

### Explorer handoff produces transfer documents for Builder

**Date:** 2026-06-06
**Updated:** 2026-06-07
**Reference:** [CV16.DS7 Promotion Handoff to Builder](roadmap/cv16-explorer-mode/cv16-ds7-promotion-handoff-to-builder/index.md)

Explorer-to-Builder promotion must produce a transfer document set, not only switch modes with contextual memory. The handoff output lives under `docs/project/explorations/<exploratory-story-slug>/` when the active journey has a project path. The folder name is generated from the handoff or Exploratory Story title, without timestamp or opaque id. The set has four documents: `index.md`, `exploratory-story.md`, `handoff-info.md`, and `product-design-proposal.md`.

Consequences:

- Builder receives an editorial synthesis, concrete discovery narrative, caution/boundary document, and product design proposal before roadmap work begins.
- `index.md` orients Builder through the artifact set and carries the editorial synthesis.
- `exploratory-story.md` must preserve continuous story thickening, not only the final state fields.
- The product design proposal describes behavior and product shape, not implementation architecture.
- Promotion remains a two-step process: generate handoff, then confirm Builder.
- DS8 can later persist Exploratory Story records and connect durable story IDs to these artifact directories.

### Explorer Mode first release closes at handoff plus persistence

**Date:** 2026-06-06
**Reference:** [CV16 Explorer Mode](roadmap/cv16-explorer-mode/index.md)

The first Explorer Mode release will close after DS7 Promotion Handoff to Builder and DS8 Persistence and Visibility, followed by release packaging. Multiple simultaneous Exploratory Stories and more advanced Explorer capabilities are intentionally deferred until users can experiment with the first coherent version and generate feedback.

Consequences:

- DS7 and DS8 are the remaining product stories for the first Explorer release.
- Release packaging follows DS8 rather than expanding scope into multiple stories.
- Multiple Exploratory Stories become a future feedback-driven capability, not a prerequisite for the first release.
- The first release promise is a complete single-story flow: enter Explorer, open and thicken a story, name attractors, propose experiments, explicitly hand off to Builder, and recover the exploration beyond fragile runtime state.

### Explorer attractors are visible story state, not hidden detection

**Date:** 2026-06-06
**Reference:** [CV16.DS6 Experiment Proposals and Attractors](roadmap/cv16-explorer-mode/cv16-ds6-experiment-proposals-and-attractors/index.md)

Attractors in Explorer Mode are stored only when surfaced visibly in conversation. They live inside the current in-session Exploratory Story runtime payload, associated with the active journey story, rather than as durable standalone entities. The first implementation does not run hidden detection or an LLM classifier in the Python core.

Consequences:

- The user can ask for an attractor explicitly, and the assistant may propose one conversationally, but the state changes only when the attractor is rendered.
- Correcting an attractor replaces the current visible attractor instead of accumulating hidden competing interpretations.
- Experiment proposals are small learning moves, not Builder delivery plans.
- DS7 remains responsible for explicit Builder handoff after confirmation.

### Explorer Mode starts from Exploratory Story, not signal/radar modeling

**Date:** 2026-06-06
**Reference:** [CV16.DS4 In-Session Exploratory Story](roadmap/cv16-explorer-mode/cv16-ds4-in-session-exploratory-story/index.md), [ES-003 Explorer Mode](exploration/es-003-explorer-mode.md)

The first observable Explorer Mode behavior should preserve one accumulated Exploratory Story per journey rather than model signals and radar upfront. Signal vocabulary remains useful as method language, but the practical product value is the story that is becoming clearer across turns.

Consequences:

- DS4 stores `current_exploratory_story`, `narrative_field_summary`, and `last_story_card` only.
- Signal/radar behavior is deferred until practice proves it adds value.
- DS7 should render story-opening, story-thickening, narrative snapshot, and promotion surfaces before reintroducing a broader signal model.
- Explorer remains a cognitive lens for uncertainty before commitment, not a taxonomy of every exploratory fragment.

### Historical conversation journey repair is explicit and backup-gated

**Date:** 2026-05-25
**Reference:** [CV9.E6.S6 Personal Mirror Validation](roadmap/cv9-mirror-1-0/cv9-e6-web-visibility/cv9-e6-s6-personal-mirror-validation/index.md), [Troubleshooting](../process/troubleshooting.md#pi-builder-conversations-appear-without-journeys)

Mirror Mind must not silently rewrite historical conversation journey
associations. When a runtime bug leaves conversations with `journey = NULL`, the
fix for future sessions belongs in core runtime logging, but historical repair
must be explicit, reviewable, and backup-gated.

The repair path is therefore:

```bash
uv run python -m memory conversation-logger repair-journeys
uv run python -m memory conversation-logger repair-journeys --apply
```

The dry-run lists high-confidence candidates. The apply path creates a database
backup before mutation and only updates `conversations.journey` for rows matched
conservatively from activation language or explicit build commands. Ambiguous
rows remain unchanged.

Consequences:

- The database remains personal memory, not a surface the framework rewrites
  silently.
- User trust is preserved through visible candidates and pre-repair backup.
- Workspace can become truthful again after repair without pretending inference
  is perfect.
- Future repair tools should follow the same policy: diagnose first, backup
  before mutation, apply only reviewed or high-confidence changes.

### Mirror web visibility uses perspectives, starting with Atlas and Workspace

**Date:** 2026-05-24
**Reference:** [Mirror Web Perspectives](../product/envisioning/web-perspectives.md), `mirror-1-0-market-entry` journey

The Mirror Mind 1.0 web visibility surface will be explored through
perspectives rather than fixed user types. A perspective is a viewing mode over
the same Mirror data, not a permanent classification of the user. The two
initial perspectives share Mirror Core but intentionally differ in information
architecture and design rhythm.

The first two perspectives are:

- **Atlas:** identity-first view for exploring identity, personas, memories,
  patterns, journeys, and conversations through an editorial psyche map.
- **Workspace:** work-first view for following journeys, decisions, tasks,
  conversations, and relevant context through an analytical dashboard.

If no default perspective is configured, the web app should ask how the user
wants to look at their Mirror. The selected default can be saved, but the active
perspective must remain visible and switchable.

Consequences:

- The web app should not become a database admin surface.
- Atlas and Workspace should reuse the same underlying data while changing
  layout, density, rhythm, labels, ordering, and interpretive emphasis.
- Identity remains foundational, but it is not forced as the only front door for
  operational users.
- The shared shell, object model, detail grammar, design tokens, and evidence
  pattern create unity across otherwise different perspectives.
- Evidence and provenance should be available as a shared detail pattern before
  becoming a full perspective or graph interface.
- Roadmap work should be derived after iterating the documented metaphor,
  decisions, and wireframes.

### Web visibility uses a Core Surface API, not direct web data access

**Date:** 2026-05-24
**Reference:** [Web Surface Specification](../product/specs/web-surface/index.md), [Mirror Web Perspectives](../product/envisioning/web-perspectives.md)

The Mirror Mind web app should be a thin local interface over Mirror Core. Web
routes must not execute SQL, inspect raw schema details, or compose identity,
memory, journey, conversation, Atlas, or Workspace meaning inline.

Mirror Core will expose a surface composition layer for web read models:

```text
web -> surfaces -> services -> storage -> db
```

Initial surfaces include Atlas home, Workspace home, object detail, evidence,
and search. These surfaces return explicit typed DTOs shaped for the UI. Atlas
and Workspace may have different information architecture and design rhythm, but
they remain read models over the same domain objects.

Consequences:

- Web handlers stay small and transport-focused.
- Domain retrieval remains in services and storage.
- Surface composition owns UI-shaped read models and empty states.
- Atlas and Workspace avoid duplicating data access logic.
- Live LLM calls should not happen during page rendering; synthesis should come
  from persisted data or be absent.
- Tests should cover surface composition independently from the HTTP server.

### Mirror 1.0 web visibility starts with a read-only Atlas vertical slice

**Date:** 2026-05-24
**Reference:** [Mirror Web Perspectives](../product/envisioning/web-perspectives.md), [Web Surface Specification](../product/specs/web-surface/index.md)

The first 1.0 web visibility roadmap should start with a narrow vertical slice,
not a broad inventory of every Mirror object. The slice should prove the full
path from shell to surface composition to services to rendered detail.

Initial slice:

```text
perspective shell
first-run perspective choice
user-home default perspective setting
Atlas psyche map
Identity region with real data
Personas region with real data
supported object detail
evidence placeholder or real provenance where available
```

The web visibility surface remains read-only in 1.0. Editing identity, memories,
conversations, or other runtime state is explicitly out of scope for the first
release.

Data coverage for 1.0 is intentionally uneven and should be represented
honestly:

- Identity and personas are real.
- Memories, journeys, conversations, tasks, and evidence may be partial.
- Decisions may be derived or placeholder until a stronger model exists.
- Search is outside the first vertical slice unless existing retrieval services
  make it cheap.

Success criterion: a user can open the local web app and understand what exists
inside their Mirror without reading the database or using CLI commands.

Consequences:

- Roadmap stories should start with shell, user-home preference, Atlas surface
  DTOs, identity/persona data, detail view, and evidence affordance.
- Workspace should follow after the surface pattern is proven.
- Empty states are part of the product, not a failure.
- The release should be validated manually against the user's real Mirror.

### Release updates use stable/main channels

**Date:** 2026-05-22
**Reference:** [CV9.E3.S10 Stable Release Channel Management](roadmap/cv9-mirror-1-0/cv9-e3-distribution-tooling/cv9-e3-s10-stable-release-channel-management/index.md), [Versioning](../process/versioning.md), [Release Notes](../process/release-notes.md)

Mirror Mind separates integration from published releases. `main` is the integration and dogfooding channel. `stable` is the user-facing release channel. A push to `main` is not a release.

Each clone chooses its update channel through `.mirror-update-channel`, a local gitignored file with valid values `stable` and `main`. Missing, unreadable, or unknown values default to `stable`, because user-facing clones should follow published releases by default.

Consequences:

- `runtime update` uses the configured channel rather than assuming every `main` commit is user-facing.
- `runtime status`, `runtime version`, and `welcome` surface the channel so the user can see whether they are on stable or dogfooding main.
- `stable` should advance only through release promotion: version bump, release note, CI, smoke validation, tag, and fast-forward of the stable branch.
- Release notes are exposed through `runtime release-notes` and the `mm-release-notes` skill, but the user-facing prompt is natural language: "What's new in the latest Mirror Mind release?"
- A future Maestro release doctor can automate promotion checks.

### Documentation IA keeps the docs home first and product surfaces together

**Date:** 2026-05-22
**Updated:** 2026-05-24
**Reference:** [CV9.E5.S2 Documentation Information Architecture](roadmap/cv9-mirror-1-0/cv9-e5-process-versioning-alignment/cv9-e5-s2-documentation-information-architecture/index.md), [Ariad documentation home](https://github.com/mirror-mind-ai/ariad/blob/main/docs/index.md)

Mirror Mind adopts Ariad's documentation pattern for the 1.0 docs home: a short narrative opening, explicit "start here" paths, and the Process / Project / Product triad as the organizing spine. A practical Reference layer is allowed for command, operations, and developer lookup material.

The web docs browser should open on `docs/index.md`, titled "Mirror Mind Documentation", rather than the first alphabetic document. The docs home is the front door and appears as "Home" in the navigation menu.

The project will not move files before 1.0 solely for symmetry, but product-owned surfaces may move when navigation pressure makes the current location confusing. The following locations remain stable for now:

- `docs/releases/` stays top-level as the prospective release-note home.
- `docs/product/architecture.md` lives under Product because architecture is part of the Mirror Core product surface.
- `docs/product/api.md` lives under Product because the Python API is part of the Mirror Core product surface.
- `docs/process/runtime-repair-policy.md` and `docs/process/troubleshooting.md` stay under Process because they describe safe operating policy and repair practice.
- `docs/process/worklog.md` stays single-file through 1.0, with post-1.0 archive-by-release or archive-by-year as the scaling rule if it becomes hard to scan.

Consequences:

- The docs home should make reader paths explicit instead of acting only as an inventory.
- Stable reader paths are preferred over large moves during the 1.0 readiness cycle, but the web navigation experience can justify small IA corrections.
- A future `docs/reference/` or `docs/operations/` subtree remains possible, but it should be justified by accumulated navigation pressure rather than introduced preemptively.

### Mirror Mind clones declare a role

**Date:** 2026-05-22
**Reference:** [CV9.E3.S6 Clone Role Guard](roadmap/cv9-mirror-1-0/cv9-e3-distribution-tooling/cv9-e3-s6-clone-role-guard/index.md)

Mirror Mind code is run from at least two kinds of clones: a production clone used in daily work, and a dev clone used to build the framework. Without an explicit marker, these clones are indistinguishable, and development work can land in the production clone by accident.

Each Mirror Mind clone now declares its role through `.mirror-clone-role` at the repository root. Valid values are `production` and `dev`. The file is local to each clone and ignored by git. When the file is missing, unreadable, or carries an unknown value, the role defaults to `production`.

Consequences:

- Production is the safe default. Dev is the explicit opt-in.
- Builder Mode (`python -m memory build load <slug>`) applies the guard only when the journey `project_path` points at a Mirror Mind source checkout. It refuses a Mirror project checkout marked `production` unless the user passes `--ignore-production-role`, but ordinary journey projects are not blocked by a missing Mirror clone-role marker. If no `project_path` is configured, it falls back to the current directory. The override exists for real-life exceptions and is logged in the command output, not hidden.
- Runtime status and runtime version both report the current clone role, so the boundary is visible in every read-only inspection.
- Production clones receive code through `git pull` today and through `runtime update` later. They are not edited directly.

### Mirror self-update begins with runtime status

**Date:** 2026-05-22
**Reference:** [Ariad coherent update policy](https://github.com/mirror-mind-ai/ariad/blob/main/docs/method/explicit-policies.md), [Runtime status command](../../REFERENCE.md#commands)

Mirror self-update work starts with a read-only runtime status command, not with an update executor.

Rationale: Ariad's coherent update policy requires the current state to be visible before operational updates proceed. Mirror must know its version, repository state, mirror home, database, extensions, Python runtime, and environment before it can safely plan or execute a future self-update.

Consequences:

- `python -m memory runtime status` is the first slice of the self-update track.
- Dirty git state, missing mirror home, missing database, or missing repository information are reported as `attention needed`.
- Future update planning should build on this status surface before adding backup, release discovery, migration execution, or rollback behavior.

### Development process and versioning are explicit and prospective from CV9.E5 onward

**Date:** 2026-05-19
**Reference:** [CV9.E5 Process & Versioning Alignment](roadmap/cv9-mirror-1-0/cv9-e5-process-versioning-alignment/index.md), [Development Guide](../process/development-guide.md), [Versioning](../process/versioning.md), [Release Notes](../process/release-notes.md)

Mirror Mind adopts an explicit development process based on three dimensions
(process, project, product), the expand/collapse operating rhythm, and a story
lifecycle with mandatory checkpoints and a coherence check.

The versioning model is prospective. Versions through `v0.7.0` remain valid
historical project facts and are not semantically reinterpreted. From CV9.E5
onward, future version bumps follow the rule documented in
[Versioning](../process/versioning.md): MAJOR for completed Capability Values,
MINOR for completed Epics, and PATCH for independently released Stories or
maintenance fixes.

Future releases should receive narrative release notes under `docs/releases/`,
following [Release Notes](../process/release-notes.md). Retroactive release
notes for historical tags are optional archival work, not a prerequisite for the
new process.

CV9 completion may become `v1.0.0` as the first prospective major boundary,
because CV9 is the public-release readiness boundary for Mirror Mind 1.0. This
is a forward-looking product boundary, not a rewrite of previous version
history.

### Coherence is a Builder lifecycle capability, not a command-first flow

**Date:** 2026-05-09
**Reference:** [Coherence product architecture](../product/envisioning/index.md), [Coherence runtime spec](../product/specs/coherence-runtime/index.md), [CV10 Coherence Engine](roadmap/cv10-coherence-engine/index.md)

Coherence will be integrated into the natural Builder lifecycle instead of
being exposed primarily as a command users must remember. The user experience
remains: activate Builder Mode for a journey. When coherence is enabled,
Builder runs a preflight against the journey's `project_path`, injects a UoC
summary into the Builder briefing, surfaces blocking gaps before implementation,
and refreshes coherence after meaningful changes.

This keeps the separation clear: Builder executes, coherence governs, lenses
provide opinion, and Mirror remembers.

---

### Maestro is the doing-first product frame over Mirror Core

**Date:** 2026-05-09
**Reference:** [Coherence product architecture](../product/envisioning/index.md)

Maestro is not a separate runtime, not a competing Builder mode, and not a
standalone coherence engine. Maestro is the public product frame for a
software-development audience: Builder plus active software lenses plus the
coherence protocol, powered by Mirror Core.

Mirror remains the underlying architecture: identity, memory, journeys,
personas, attachments, and long-term continuity. Maestro attracts through doing;
Mirror reveals itself through use.

---

### Localization and audience modes are Mirror-wide surfaces

**Date:** 2026-05-09
**Reference:** [CV11 Localization](roadmap/cv11-localization/index.md), [CV12 Audience Modes](roadmap/cv12-audience-modes/index.md)

Coherence exposed two surface concerns: language and audience mode. They are not
owned by the coherence engine. Localization and audience modes are Mirror-wide
capabilities.

Localization changes language, not semantics. Audience mode changes explanation
strategy, not truth. Coherence must stay compatible with both by separating
stable semantic ids from human-facing text, but full localization and audience
mode behavior are planned separately.

---

### `memory` remains the historical package namespace for Mirror Core

**Date:** 2026-05-09
**Reference:** [CV13 Mirror Web Console](roadmap/cv13-mirror-web-console/index.md)

The Python package is still named `memory` for historical reasons, but it now
contains more than the memory subsystem. It is the current namespace for Mirror
Core and runtime interfaces, including skills, CLI dispatch, and the local web
console.

New modules may continue to live under `memory.*` until a future package rename
to `mirror` is intentionally planned. This avoids coupling the current Web
Console PR to a broad package rename.

---

### Mirror Web Console starts as a local read-only docs browser

**Date:** 2026-05-09
**Reference:** [CV13 Mirror Web Console](roadmap/cv13-mirror-web-console/index.md), [CV13.E1 Docs Browser](roadmap/cv13-mirror-web-console/cv13-e1-docs-browser/index.md)

The Mirror Web Console will begin with a small, local-first, read-only slice:
browsing and rendering Markdown documentation. Broader capabilities such as
configuration inspection, identity/persona inspection, and editing workflows are
future epics.

The first implementation binds to `127.0.0.1`, reads only approved documentation
roots, rejects path traversal, and renders Markdown as HTML.

---

### CV8 runtime order inverted: Gemini CLI first, Codex second

**Date:** 2026-04-29
**Reference:** [CV8 index](roadmap/cv8-runtime-expansion/index.md), [CV8.E1 Gemini CLI spike](roadmap/cv8-runtime-expansion/cv8-e1-gemini-cli-runtime-spike/index.md)

The original CV8 plan had Codex first (E1–E3), adapter hardening (E4), then
Gemini CLI second (E5–E7). The order was inverted because:

1. **Gemini CLI was already installed** (0.38.2 via Homebrew). The spike could
   happen immediately without any setup friction.
2. **The spike revealed L4 full parity**. Gemini CLI exposes a complete shell-hook
   lifecycle (`SessionStart`, `BeforeAgent`, `AfterAgent`, `SessionEnd`), a stable
   session UUID via `$GEMINI_SESSION_ID`, transcript path in every hook's stdin,
   per-turn context injection via `BeforeAgent` `additionalContext`, and native
   SKILL.md discovery. The implemented project-local surface is now the shared
   `.agents/skills/` tree, because Gemini CLI can read it and a parallel
   `.gemini/skills/` tree conflicts — still satisfying every Mirror Mind runtime
   requirement.
3. **Gemini CLI's hook model is closer to Claude Code** than Pi is. This makes the
   Gemini CLI adapter a cleaner first test of the general runtime contract: it exercises
   the same shell-hook path Claude Code uses, proving the contract generalizes to a
   second shell-hook runtime without modification.
4. **Deferred extraction is already battle-tested** from Pi. `SessionEnd` is best-effort
   in Gemini CLI, but deferring extraction to the next `SessionStart` is the exact model
   Pi uses — no new mechanism needed.

Codex remains second. It benefits from the adapter hardening that Gemini CLI forces
before Codex work begins.

---

### Shadow is both a structural layer and a memory destination

**Date:** 2026-04-26
**Reference:** [CV7 §5.5 of draft-analysis](roadmap/cv7-intelligence-depth/draft-analysis.md), [CV7 index](roadmap/cv7-intelligence-depth/index.md), [CV7.E4](roadmap/cv7-intelligence-depth/cv7-e4-memory-depth/index.md)
**Source:** Mirror Mode session with the therapist persona (recorded
conversation, 2026-04-26)

In the Jungian frame, shadow is not a category of content; it is a region
of the psyche defined by its relationship to ego consciousness. The
architectural consequence:

- **Memory destination side** — raw shadow material (tensions, avoidances,
  contradictions, repeated emotional vocabulary) accumulates as extracted
  memories with `layer = shadow`. Already partly in our schema; extraction
  discipline (CV7.E3) sharpens what lands here.
- **Structural layer side** — a `shadow` layer in the `identity` table,
  peer to `self` and `ego`. Holds consolidated, ready-to-surface shadow
  observations. Composes into the prompt under its own conditions.
- **Consolidation as integration** — the bridge. Raw memories cluster,
  get reviewed, distilled into structural content; raw memories remain as
  provenance.

Readiness states (`observed → candidate → surfaced → acknowledged →
integrated`) live as a column on memories. Reception gains a
`touches_shadow` axis distinct from `touches_identity`. Composition is
asymmetric: shadow surfaces with provenance and only when evidence
supports it, never as a verdict.

The remaining sub-question — the promotion mechanism (auto by
repetition, manual by acknowledgment, or hybrid) — is parked for the
CV7.E4.S3 / E4.S4 planning pass.

---

### Expression pass and `mode` axis deferred from CV7

**Date:** 2026-04-26
**Reference:** [CV7 §8.1 of draft-analysis](roadmap/cv7-intelligence-depth/draft-analysis.md), [CV7.E2](roadmap/cv7-intelligence-depth/cv7-e2-reception/index.md)

Reception in CV7.E2 ships with four axes (`personas, journey,
touches_identity, touches_shadow`), not five. The `mode` classification
(conversational / compositional / essayistic) and the post-generation
expression pass that Alisson built as the form-shaping mechanism in
`mirror-mind` CV1.E7.S1 are **deferred from CV7**.

**Rationale.** The expression pass solves *proportionality* — short
messages getting back essays, casual asks getting back lectures. We do
not have evidence yet that this is among our top complaints, and we do
not have the instrumentation to measure it honestly. Building the cure
before measuring the disease is the over-engineering CV7 is trying to
avoid.

**Watch criterion.** Once CV7.E1 lands, a *proportionality probe* gets
added to the eval harness: short, casual, lived-in messages with the
expectation that responses stay short and proportional. If responses
systematically over-shape (essays for one-line messages, lectures for
casual asks), the expression pass earns its way back into the roadmap as
a focused mini-CV or epic in CV8 with its own success criteria.

**Anti-trap.** "Stamp `mode` on the assistant message now, build the
expression pass later" is rejected. A mode stamp without a downstream
consumer is dead metadata. When we revisit, classification and
consumption come back together — or neither.

---

### Consolidation promotion mechanism: manual-by-acknowledgment for S3

**Date:** 2026-04-29
**Reference:** [CV7.E4.S3](roadmap/cv7-intelligence-depth/cv7-e4-memory-depth/index.md), [CV7 §5.4 and §6 of draft-analysis](roadmap/cv7-intelligence-depth/draft-analysis.md)
**Source:** Engineering planning pass — the E4 index and draft-analysis both flag this as the highest-leverage decision in CV7.

**Decision: manual-by-acknowledgment.**

The three options were:
- **Auto-by-repetition**: system automatically promotes a memory when access_count or use_count crosses a threshold
- **Manual-by-acknowledgment**: user reviews proposals and explicitly accepts, edits, or rejects
- **Hybrid**: auto-surface candidates, require explicit acknowledgment to promote

**Why manual-by-acknowledgment for S3:**

1. **We don't know what the promotion mechanism wants to be.** The draft-analysis says this explicitly. Auto-by-repetition needs calibration data we don't have: which threshold? which signals? Implementing auto before we have data from real consolidation sessions means tuning blind — the same anti-pattern CV7.E1 was designed to prevent.

2. **Consolidation is not memory hygiene; it is integration.** The Jungian frame matters here. Promoting a pattern into structural identity (or shadow) is a meaningful act — it changes how the mirror will respond to future conversations. That act deserves human judgment, at least until we understand the failure modes.

3. **Provenance is safer with explicit acknowledgment.** When a user accepts a proposal, they know what entered the structural layer and why. When the system auto-promotes, the user has no clear moment of ownership. Confusion about "why does the mirror believe X" is a high-cost failure.

**How it works in S3:**
- `mm-consolidate scan` clusters similar memories and calls an LLM to propose one of: merge, identity_update, or shadow_candidate
- Proposals are stored in the `consolidations` table with `status='pending'`
- User reviews each proposal in conversation and issues `mm-consolidate apply <id>` or `mm-consolidate reject <id>`
- On acceptance: identity is updated, source memories advance to `readiness_state='acknowledged'`, provenance is preserved
- On rejection: proposal is marked `rejected`, memories stay at their current state

**Hybrid deferred:** The hybrid approach (auto-surface + manual acknowledgment) is what S3 implements — scan is automatic, promotion is not. Full auto-by-repetition (skip the review loop) is a future extension once we have data from real sessions showing which proposals users consistently accept.

---

### English domain language is complete and tagged

**Date:** 2026-04-17
**Commits:** `fb0bcf6` through `d425b52`

All runtime paths — Python API, CLI, schema, config, seed, hooks, skills,
identity YAMLs, and docs — use English names. The migration took 9 sessions and
~40 commits. Compatibility aliases and runtime fallbacks have been removed.
Migration-only support remains in database migrations and migration rehearsal
code to allow upgrading old databases.

See also: [CV0 English Foundation](roadmap/cv0-english-foundation/index.md).

---

### Pi adoption ports interface ideas from `mirror-pi`, not the old `memoria` core

**Date:** 2026-04-17
**Reference:** [CV1 Pi Runtime](roadmap/cv1-pi-runtime/index.md)

The `~/dev/workspace/mirror-pi` spike (Henrique's project) is pre-English-migration
and still uses `memoria`, `travessia`, `.espelho`. It is useful as a working
spike — particularly the `.pi/extensions/mirror-logger.ts` pattern and the Pi
session lifecycle handling — but it should not be ported wholesale.

The right move: adapt the Pi interface ideas against the current English
`memory` core. `mirror` becomes dual-interface; `mirror-pi` is a reference,
not the source.

---

### `mirror` stays local-first; client-server is a future/parallel track

**Date:** 2026-04-17

Alisson's `mirror-mind` is a greenfield server version with bearer token auth
and a web interface. That is a valid and separate direction.

`mirror` is the mature local runtime. Making it model/runtime agnostic
(Pi support, CV1) does not require adding a server. Client-server remains a
future track or a parallel project — not a CV1 concern.

---

### Skill logic extraction is a prerequisite for Pi

**Date:** 2026-04-17
**Reference:** Briefing D8

Pi skills cannot be thin wrappers until the shared `src/memory/skills/` modules
exist. CV1.E1 (Shared Command Core) must complete before CV1.E2 (Pi Skill
Surface) can begin. This sequencing is explicit in the CV1 roadmap.

---

### Documentation scaffold before Pi implementation

**Date:** 2026-04-17

Adopted the planning and documentation style from Alisson's `mirror-mind` repo.
The docs scaffold (index, briefing, decisions, roadmap, principles, process) is
created before writing any CV1 code. This gives every future story a place to
live: a plan, a test guide, and a verification moment — before a line of
implementation is written.

---

### Skill layer principle: Python/CLI owns DB; Agent owns filesystem; no run.py

**Date:** 2026-04-18
**Reference:** CV3.E4 Skill Architecture Cleanup

Every skill in both runtimes (Claude Code and Pi) calls `python -m memory <command>` directly from SKILL.md. No `run.py` intermediary exists under `.claude/skills/` or `.pi/skills/`.

The principle: **Python/CLI owns** everything that touches the database — identity, memories, conversations, metadata. **The agent owns** conditional logic, multi-step workflows, and filesystem reading. A `run.py` is only justified if the logic cannot be expressed as a `python -m memory <command>` call — which has not been the case for any skill to date.

Before CV3.E4, skills accumulated `run.py` wrappers that duplicated CLI modules, mixed DB operations with filesystem traversal, and drifted from one another. CV3.E4 eliminated all 23 run.py files across both runtimes, extracted the remaining logic into canonical CLI modules (`cli/build.py`, `cli/journeys.py`, `cli/consult.py`), and moved banner/icon output into `memory.skills.mirror.main()`.

The `mm:build` hybrid illustrates the pattern: `python -m memory build load <slug>` does all DB work and emits `project_path` as its final output line; Claude Code then reads the docs directory natively using its file tools. Neither side duplicates the other's capability.

---

### CV4 direction: framework/user separation with user homes under `~/.mirror-minds/<user>`

**Date:** 2026-04-18

The next roadmap capability after CV3 is **CV4 — Framework/User Separation**. Mirror Mind should evolve from a repo that contains one user's live identity into a reusable framework with user-owned homes outside the repo.

Target direction:
- the repository keeps only generic identity templates under `templates/identity/`
- real user identity lives under `~/.mirror-minds/<user>/identity/`
- runtime state lives beside it in `~/.mirror-minds/<user>/memory.db`
- default subdirectories `backups/` and `exports/` also live under the user home, but remain configurable to other locations
- legacy Portuguese-era assets (for example `memoria.db`) migrate into this user-home layout

This decision resolves the previously open `MIRROR_USER_DIR` discussion in principle. The implementation details still belong to CV4 planning and stories, but the architectural direction is now set: framework in the repo, real identity and runtime state in the user home.

`uv` is explicitly out of scope for CV4. It may be revisited later as a tooling improvement, but it is not part of the framework/user separation capability.

---

## Open Discussions

### Migration rehearsal — long-term status

**Status:** Open
**Raised:** 2026-04-17

`src/memory/cli/migration_rehearsal.py` and its tests exist to allow safe dry-run
testing of database migrations. It was built during the English migration to
validate schema changes without touching production.

Question: should this stay permanently? Or should it be removed once the
English migration is clearly stable and the upgrade path for old databases is
no longer a concern?

**Why not urgent:** The cost of keeping it is low. The risk of removing it
prematurely is higher. Revisit when legacy database upgrade support is no longer
needed.

---

### User-home selection and runtime-state direction were finalized in CV4

**Date:** 2026-04-19

The CV4 implementation settled the operational details that were still open on
2026-04-18.

Final direction:
- the active user is selected explicitly via CLI override first, then
  `MIRROR_HOME`, then `MIRROR_USER`
- conflicting `MIRROR_HOME` and `MIRROR_USER` values fail hard
- user-scoped commands accept `--mirror-home` where explicit single-home
  targeting matters
- in production, both the default runtime database path and `MEMORY_DIR`-derived
  runtime-state files default under the resolved mirror home
- transcript export is user-scoped, outside the repo by default, and automatic
  export is opt-in through `TRANSCRIPT_EXPORT_AUTOMATIC`

This closes the earlier open discussion about user-home selection/profile
bootstrap details as a CV4 planning question. Future work may refine the UX,
but the architectural and operational direction is no longer open.

---

### Default mirror home directory renamed from `~/.mirror` to `~/.mirror-minds`

**Date:** 2026-05-18
**Reference:** [Architecture — Database Schema](../architecture.md#7-database-schema), [REFERENCE — Identity (CV4 user home)](../../REFERENCE.md)

The default container for user mirror homes was renamed from `~/.mirror` to
`~/.mirror-minds`. Two motivations:

1. **Disambiguation.** The personal install of the framework typically lives
   at `~/mirror`. Having data at `~/.mirror` (visible vs hidden, same root
   word) creates persistent visual collision when reading the home tree.
2. **Plural matches structure.** The directory is a container of user homes
   (`alisson-vale/`, `veronica/`, …) — semantically plural. The singular
   name was a vestige; `~/.mirror-minds` says what the directory actually is.

The corresponding pair becomes coherent: **the mirror (singular program)
reflects the minds (plural data)**. This pairs with the convention of keeping
authored code under `~/Code/` and used-but-not-edited installs at `~/`.

**Legacy path compatibility (permanent, not deprecated).**

To avoid silently breaking installs that relied on the old default through
`MIRROR_USER` resolution, the framework permanently supports the legacy path
under a clear contract:

- If `MIRROR_USER` is used, `~/.mirror-minds/<user>/` does not exist, and
  `~/.mirror/<user>/` does, the legacy path is resolved and used.
- A one-time warning per legacy path is emitted to stderr identifying the
  path in use and the migration command (`mv ~/.mirror ~/.mirror-minds`).
- This is supported behavior, not deprecated. There is no sunset date. The
  cost is a single fallback check in `resolve_mirror_home`; the gain is that
  a default rename never breaks a working install.

**Not affected:**

- Anyone setting `MIRROR_HOME` explicitly (path is absolute, unaffected).
- Installs with explicit homes outside the default container (for example,
  demo and dev installs under `~/.mirror-demo/<user>` or `~/.mirror-dev`).

---

### CLI parsing consistency and future `argparse` adoption

**Status:** Open
**Raised:** 2026-04-18

Several commands already use `argparse`, while some older entry points still
parse `sys.argv` directly. Long term, the CLI surface should be standardized on
`argparse` for consistency, clearer help text, safer option parsing, and easier
command evolution.

This is worth doing, but not as opportunistic churn during CV4 feature work.
Revisit it during a future CLI/tooling modernization pass. That pass may happen
near other tooling discussions (for example `uv`), but the decisions should not
be artificially coupled.

---

**See also:** [Briefing](briefing.md) · [Roadmap](roadmap/index.md) · [Worklog](../process/worklog.md)
