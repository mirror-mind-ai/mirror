[< Docs](../index.md)

# Worklog

Operational progress. This file records what was delivered and what is next.
Update when a meaningful milestone is reached.

Scaling rule: keep this as a single file through the 1.0 readiness cycle. After
1.0, archive by release or year if the file becomes hard to scan.

---

## Done

### 2026-06-25 — GitHub Release publication added to release process

Published the GitHub Release for `v0.29.1 — Windows Compatibility Hardening` from the committed release note and marked it as the latest repository release. The release process now explicitly treats GitHub Releases as the public repository-facing publication surface layered on top of the same Git tag that drives the stable updater channel.

Validation: `gh release create v0.29.1 --latest` succeeded and `gh release view v0.29.1` reports the published release URL. Process docs and command reference now include GitHub Release publication after stable promotion and green CI.

### 2026-06-25 — v0.29.1 Windows Compatibility Hardening prepared

Prepared the patch release boundary for Windows compatibility hardening after homologating the self-update path on the `lucas-vidal` staging mirror. The release preserves Windows-safe Claude and plugin skill directories, UTF-8 runtime output, explicit backup-gated mojibake repair, extension legacy skill cleanup, and cross-platform path rendering without changing user-facing command names.

Validation: PR #24 was merged after local focused tests, full unit tests, ruff, plugin drift check, focused mypy on touched modules, and GitHub Actions passed. Staging self-update on `~/.mirror-minds/lucas-vidal` using `~/mirror-staging` passed before preparing this release boundary. Stable promotion, tag creation, and push remain separate gates.

### 2026-06-21 — CV21.E2.S2 Mirror MCP server completed

Built the Mirror MCP server (`python -m memory mcp`) as a zero-dependency, hand-rolled stdio JSON-RPC 2.0 surface (decision D1 Option B), keeping the lean local-first core intact rather than pulling the official SDK's 18-package tree. The server implements the tools-only subset (`initialize`, `notifications/initialized`, `tools/list`, `tools/call`, `ping`) with a pure `handle_message` dispatch wrapped by a thin stdio loop; diagnostics go to stderr so stdout stays a clean protocol channel. Seven read + on-demand-context tools call the `MemoryClient` façade in-process (layer model `mcp → services`): `mirror_context` (side-effect-free identity, deliberately not `skills.mirror.load`), `list_journeys`, `journey_status`, `search_memories`, `list_conversations`, `recall_conversation`, `detect_persona`. Writes are out of scope by design. The plugin generator now declares the server as an `mcpServers` entry in the manifest, so the canonical package carries it.

Validation: 18 new MCP tests (protocol dispatch + tool handlers, incl. a `mirror_context` no-mutation assertion), drift guard green, `claude plugin validate` passes, mypy clean on the new module. A real stdio round-trip (initialize → tools/list → tools/call) verified end-to-end, and the isolated `scripts/smoke_mirror_mcp.sh` passes leak-free across runs. The contract/REFERENCE docs are intentionally deferred to E2 close (after S3 statusLine and S4 reference smoke).

### 2026-06-21 — CV21.E2.S1b Claude skill parity completed

Authored Claude-tuned versions of the four formerly Pi-only skills (`discard`, `explore`, `soul`, `update`) into `.claude/skills/`, bringing the canonical plugin to full 25-skill parity with the Pi runtime. Applied the established `.pi`→`.claude` tuning derived from existing skill pairs: `mm:` invocation tokens, Claude-only usage blocks, English-only copy (translating Pi's Portuguese triggers), and Claude runtime semantics — `mm:discard` uses `--interface claude_code` (the dispatch is interface-parameterized), and `mm:soul` notes that session ids are hook-owned rather than passing a Pi `--session-id`. Mode-skill contract surfaces (required-surface rendering, Explorer/Soul → Builder boundaries) carried over unchanged. Regenerating the plugin picked the four up automatically (no hardcoded count).

Also hardened `scripts/smoke_claude_plugin.sh`: the S1 production-DB checksum guard false-failed when a live Mirror session wrote to its own production DB during the test window. The guard now asserts that the run's unique session id and message never appear in any production DB — a stronger, non-flaky isolation proof (verified leak-free and stable across repeated runs).

Validation: 11 plugin tests (drift guard + skill-set parity now at 25), `claude plugin validate` passed, English-only content confirmed, and the smoke test passed leak-free across three consecutive runs. Standalone `.claude/` now also carries 25 skills, closing its own gap.

### 2026-06-21 — CV21.E2.S1 Claude plugin conversion completed

Converted Mirror's standalone Claude integration into the canonical Claude-format plugin at `plugins/mirror-mind/` — the package CV21 propagates to the other runtimes. A new generator (`src/memory/plugins/claude.py`, driven by `scripts/build_claude_plugin.py`) materializes the manifest and the 21 Claude-tuned skills from `.claude/skills/` (the runtime-correct source — a diff proved the `.pi` and `.claude` skill bodies are independently tuned, not token-variants), normalizing two skills' lowercase `skill.md` to `SKILL.md`. Four plugin-relative hooks (`${CLAUDE_PLUGIN_ROOT}`, installed-`memory` contract) reproduce the SessionStart/UserPromptSubmit/SessionEnd lifecycle. A drift-guard test fails CI if the committed plugin diverges from `.claude/skills/`.

Decisions (D1–D5): dedicated `plugins/mirror-mind/`; skills generated from `.claude/skills/` with drift guard; ship the 21 existing Claude skills now (the 4 Pi-only skills become sibling story S1b); standalone `.claude/` untouched; hooks assume an installed `python -m memory`.

Validation: 11 focused plugin tests, ruff, format, mypy, and diff checks passed; `claude plugin validate` passed; the isolated smoke test fired all three hooks, logged a user message with `interface='claude_code'` to a sandboxed DB, and left the production DB checksum unchanged; Navigator validated `claude plugin validate` in an isolated `CLAUDE_CONFIG_DIR`. Two latent standalone bugs were documented (lowercase `skill.md` ×2; dangling `mm:save` reference); the plugin auto-fixes the casing. MCP (S2) and `statusLine` (S3) remain.

### 2026-06-17 — v0.29.0 Ariad Refinement Workbench prepared

Prepared the DS6 release boundary as `v0.29.0 — Ariad Refinement Workbench`. The release bumps package metadata, adds the narrative release note, updates the release index and project briefing, and names DS7 Release And Push Policies as the next Builder governance horizon. Push, tag, stable promotion, and publication remain separate hard gates.

### 2026-06-17 — CV20.DS6 Refinement Workbench And Flow completed

Closed the aggregate Refinement Workbench And Flow delivery story. Builder now supports Ariad Refinement Work as a first-class field outside roadmap Delivery: Builder Home shows Delivery and Refinement fields, Workbench storage persists Refinement Stories and Change Requests, Navigator can compose and pull an RS, traverse CR cycles, review/coherence-check/close an RS, and reset sandbox Workbench state.

Validation: all DS6 child stories completed with focused automated checks and Navigator validation on `sandbox-pet-store`. Aggregate DS validation, debt review, coherence, and done artifacts were recorded. Push and release remain separate hard gates.

### 2026-06-17 — CV20.DS6.US5 Close A Refinement Story completed

Completed the RS-level closure slice for Ariad Refinement Work. Builder now guards RS review/coherence/close against the wrong active story or an active CR, refuses to close an RS with unfinished CRs, records RS close surfaces with explicit closure record, clears active Refinement cursor state after close, and preserves CR outcome notes.

Validation: focused Builder and CLI tests passed; ruff, format check, mypy, and diff checks passed. Navigator validation through Mirror/Builder natural language on `sandbox-pet-store` created an RS/CR, traversed the CR to done, reviewed and coherence-checked the RS, closed it, and confirmed Builder Home no longer showed active Refinement Work while Delivery remained unpulled.

### 2026-06-17 — CV20.DS6.US4 Traverse Change Request Cycles completed

Completed the Navigator-facing CR traversal slice on top of the Refinement flow runtime. `REFINEMENT_FLOW_EVENT` surfaces now expose current CR phase, file-mutation boundary, and next conversational move; `/mm-build` guidance now enforces explicit phase order and implementation authorization for CR work.

Validation: focused Builder and CLI tests passed; ruff, format check, mypy, and diff checks passed. Navigator validation through Mirror/Builder natural language on `sandbox-pet-store` traversed a CR through select, confirm, plan, explicit implementation evidence, validation evidence, and done note, with visible Ariad surfaces and no Delivery Work pulled.

### 2026-06-17 — CV20.DS6.TS2 Refinement Flow Runtime completed

Completed the runtime substrate for active Refinement Work. Builder now supports stateful CR transitions from select through done note, RS review/coherence/close transitions, `REFINEMENT_FLOW_EVENT` surfaces, active CR visibility in Builder Home, and natural-language routing guidance for Refinement flow commands. Review and Coherence remain non-mutating; required changes must become CRs or future work.

Validation: focused storage, builder, and CLI tests passed; ruff, format check, mypy, and diff checks passed. Sandbox validation reset `sandbox-pet-store`, traversed a full runtime CR/RS flow, rendered nine `REFINEMENT_FLOW_EVENT` surfaces, and confirmed Builder Home returned to active RS/CR none while Delivery remained unpulled.

### 2026-06-17 — CV20.DS6.US3 Pull A Refinement Story completed

Completed the Refinement Work entry slice. Builder can now pull a composed Refinement Story into active Refinement Work, render `REFINEMENT_STORY_PULLED`, persist active RS cursor state with active CR left empty, and show the active RS on later Builder Home activation. The sandbox reset helper now clears Workbench RS/CR/cursor state for clean dogfooding runs.

Validation: focused storage, builder, and CLI tests passed; ruff, format check, mypy, and diff checks passed. Navigator validation through Mirror/Builder natural language on `sandbox-pet-store` created a contextual RS and CR, pulled the RS, and confirmed Builder Home showed active RS while leaving active CR empty and Delivery work unpulled.

### 2026-06-17 — CV20.DS6.US2 Compose A Refinement Story completed

Completed the first Navigator-facing Refinement composition slice. Builder now supports creating Refinement Stories, capturing Change Requests, attaching CRs to RSs, and rendering `CHANGE_REQUEST_CAPTURED` and `REFINEMENT_STORY_OVERVIEW` Ariad surfaces without pulling an RS or starting CR lifecycle work. `/mm-build` guidance now routes natural-language capture/composition prompts to the Workbench commands and preserves marked surface rendering.

Validation: focused storage, builder, and CLI tests passed; ruff, format check, mypy, and diff checks passed. Navigator validation through Mirror/Builder natural language on `sandbox-pet-store` created an RS, captured a CR into it, showed the RS overview, and confirmed Builder Home durable counts increased without lifecycle execution.

### 2026-06-17 — CV20.DS6.TS1 Workbench Storage Model completed

Completed the durable storage substrate for Ariad Refinement Work. Mirror now creates dedicated Builder Workbench tables for Refinement Stories, Change Requests, and refinement cursors, exposes them through `BuilderWorkbenchStore` on the main `Store` facade, and provides Builder-domain helpers for snapshots and basic RS/CR creation/association. Builder Home now reports Workbench storage as implemented with durable RS/CR counts while preserving the no-execution activation boundary.

Validation: focused migration, storage, builder, and CLI tests passed; ruff, format check, mypy, and diff checks passed. Sandbox validation with `sandbox-pet-store` confirmed Builder Home shows `workbench storage: implemented`, empty durable counts, and no lifecycle work executed.

### 2026-06-17 — CV20.DS6.US1 Builder Home Work Fields completed

Completed the first Refinement Workbench slice. Ariad-adopted Builder activation now renders a `BUILDER_HOME` surface before roadmap and pull-candidate surfaces when a journey has no active item. The home surface shows the current Delivery field, a nascent Refinement field, honest Workbench storage status, seed Change Request count, available moves, and the no-execution activation boundary. The Pi Builder skill contract was tightened so marked Ariad surfaces are rendered before commentary.

Validation: focused Builder unit/CLI tests, ruff, format check, mypy, and diff checks passed. Navigator validation with `sandbox-pet-store` confirmed `BUILDER_HOME`, `ROADMAP_SNAPSHOT`, and `PULL_CANDIDATES` render in order with Delivery and Refinement visible and no lifecycle work executed.

### 2026-06-17 — CV20 Refinement Workbench path planned

Added CV20.DS6 Refinement Workbench And Flow as the next Builder Mode Evolution story after Delivery Story Level Lifecycle. The roadmap now positions Refinement Work before release/push governance, with Workbench, Refinement Stories, Change Requests, CR cycles, and RS-level review/coherence/close as the planned runtime shape. Existing planned CV20 delivery stories were renumbered so Release And Push Policies moves to DS7, Debt Ledger And Refactor Loop to DS8, Method Preferences And Overrides to DS9, and Builder Documentation And Migration to DS10.

Validation: documentation-only roadmap change; `git diff --check` passed.

### 2026-06-16 — v0.28.0 Ariad Delivery Story Lifecycle prepared

Closed CV20.DS5 Delivery Story Level Lifecycle as a release boundary. Builder now supports `delivery_story` as a Navigator-facing Ariad flow unit with aggregate DS Plan, Validation, Debt Review, Coherence, and Done checkpoints while preserving child User/Technical Stories as traceable work packages. DS-level lifecycle artifacts now materialize at canonical roadmap package paths, and Navigator-facing Ariad surfaces for resume, pull candidates, flow-unit selection, DS Plan, and DS closure render with the visual card grammar.

Validation: focused Builder unit/CLI tests passed; ruff, format, mypy, and diff checks passed. Sandbox/Pi validation confirmed that Delivery Story flow creates `plan.md`, `validation.md`, `review.md`, `coherence.md`, and `done.md` in the canonical DS package and no longer requires child-story Navigator closure for aggregate DS Done.

### 2026-06-16 — Windows UTF-8 repair command integrated

Diagnosed a local Windows encoding issue where several Mirror journey descriptions and context snippets appeared as mojibake (`Ã©`, `Ã§`, `Ã£`) after runtime compatibility updates. Confirmed the current CLI already prefers UTF-8 stdio; the remaining issue was historical text persisted incorrectly in SQLite. Backed up the production memory database, repaired the local reversible rows, then added `python -m memory repair-encoding` as an explicit dry-run/apply command with backup before mutation. Documented the policy as user-data repair rather than automatic migration. This is runtime hardening, not a retroactive release boundary.

Validation: local production DB scan ended with `pending reversible mojibake: 0`; command/unit tests cover Latin-1 and Windows-1252 repairs, safe handling of `Âncora`, DB scan/apply, and top-level CLI dispatch.

### 2026-06-14 — v0.27.0 Ariad Builder Lifecycle Runtime prepared

Closed CV20.DS4 Story Lifecycle Runtime as a release boundary. Builder now supports the complete Ariad happy path from Pull through Done with deterministic surfaces, method-level surface transport, story packages, hard Plan/Validation/Review/Coherence/Done gates, conservative higher-autonomy cadence, and repeatable sandbox dogfooding. Release notes for `v0.27.0 — Ariad Builder Lifecycle Runtime` were prepared.

Validation: focused Builder method/lifecycle/cursor/CLI tests passed with `118 passed`; ruff, format, mypy, and diff checks passed before release-preparation commit.

### 2026-06-14 — v0.26.2 Web Conversation Bulk Actions prepared

Prepared emergency patch `v0.26.2 — Web Conversation Bulk Actions`. The main web Conversations view now exposes selected bulk maintenance: each row can be selected, selected conversations can be assigned to an existing journey in one click, and selected conversations can be deleted after explicit confirmation. The implementation reuses the existing safe bulk assignment and deletion APIs and keeps the existing Unassigned conversations maintenance flow intact.

Validation: `uv run pytest tests/unit/memory/web/test_server.py -q`, `uv run ruff check src/memory/web tests/unit/memory/web`, `uv run ruff format --check src/memory/web tests/unit/memory/web`, and `git diff --check` passed before release-candidate commit.

### 2026-06-10 — CV20 Ariad planning lifecycle hardened

Reworked DS4 planning around methodological consistency instead of a narrow Plan gate. Ariad method data now declares `expand`, work item implementability, and cadence profiles; Delivery Stories always expand into User/Technical Stories before Plan. Builder runtime now persists active item title/level/cadence/granularity metadata, automatically prepares and expands pulled Delivery Stories, materializes story packages (`index.md`, `plan.md`, `test-guide.md`) for implementable stories, and supports deterministic Plan approval before implementation is allowed.

Validation: focused Builder method, lifecycle, cursor, CLI, surface, ruff, format, and mypy checks passed.

### 2026-06-10 — CV20 Ariad lifecycle contracts added

Added phase-specific Ariad lifecycle contracts to the Builder method DSL. `ContractDefinition` now lets Ariad declare Pull, Prepare, Plan, Implement, Validation, Debt Review, Coherence, and Done rules as method data, including E2E placement across Plan/Implement/Validation and story-scoped/TDD implementation expectations. Method inspection now surfaces contracts, and Ariad docs were synced in `/Users/alissonvale/Code/ariad/docs/delivery/story-lifecycle.md`.

Validation: focused method-definition, Ariad fixture, and CLI build tests passed; ruff, format, and mypy passed.

### 2026-06-10 — CV20 Ariad roadmap inspection, pull, and prepare added

Implemented the first DS4 lifecycle slice. Ariad-adopted journeys can now show the roadmap field with `ROADMAP SNAPSHOT` plus pull candidates, use method-declared surface routing, pull a candidate into active Delivery Work with `Delivery Story Identified` grammar, and prepare the pulled item with `Prepare Field Reading` grammar. Builder load now shows roadmap/candidates for Ariad journeys with no active item while preserving base Builder behavior for non-Ariad journeys. A reset script was added for the sandbox fixture at `/Users/alissonvale/Code/mirror-dev/scripts/reset_sandbox_pet_store.py`, with wrapper `/Users/alissonvale/reset-sandbox-pet-store.sh`.

Validation: focused lifecycle, pull-candidate, resume, and CLI build tests passed; ruff, formatting, and mypy passed. Pi/Mirror validation with `sandbox-pet-store` passed for roadmap activation, Pull, and Prepare. Ariad visual grammar was updated in `/Users/alissonvale/Code/ariad/docs/delivery/visual-grammar.md` with `Prepare Field Reading`.

### 2026-06-10 — CV20 Builder resume surface added

Implemented CV20.DS3 Builder Resume Surface. Builder now composes Ariad adoption state, runtime delivery cursor state, and compact roadmap position into a resume surface during `memory build load` for adopted journeys. Pi/Mirror validation with `sandbox-pet-store` showed `■ BUILDER RESUME`, method `ariad`, resumability, cursor fields, allowed next actions, and preserved the boundary that no story lifecycle work runs during load.

Validation: focused Builder resume tests and CLI build tests passed with `51 passed`, plus focused `uv run ruff check`, `uv run ruff format --check`, and `uv run mypy src/memory/builder src/memory/cli/build.py`.

### 2026-06-10 — CV20 Ariad initial delivery cursor sync added

Implemented CV20.DS2.TS2 Initial Delivery Cursor Sync and closed CV20.DS2 Ariad Adoption. Builder now persists an initial delivery cursor in SQLite runtime state through `memory build sync-cursor --method ariad`, using `__builder_delivery_cursor__:<journey>` metadata. The cursor records the adopted method, no active item, no active checkpoint, no pending confirmation, and `last_delivery_event=template_preparation`, preserving the boundary that no story lifecycle work is executed.

Validation: `uv run pytest tests/unit/memory/builder/test_delivery_cursor.py tests/unit/memory/cli/test_build.py tests/unit/memory/builder/test_method_adoption.py`, focused `uv run ruff check`, focused `uv run ruff format --check`, `uv run mypy src/memory/builder src/memory/cli/build.py`, and CLI smoke with `sandbox-pet-store` passed.

### 2026-06-10 — CV20 Ariad template preparation added

Implemented CV20.DS2.US2 Adoption Template Generation. Builder method definitions now declare templates through `TemplateDefinition`, Ariad declares its adoption/readiness templates as method data, and `memory build prepare-templates --method ariad` prepares missing files for an adopted journey while preserving existing files. The Pi Builder skill routes natural-language template preparation requests to the contained command.

Validation: `uv run pytest tests/unit/memory/builder/test_template_generation.py tests/unit/memory/cli/test_build.py tests/unit/memory/builder/test_method_adoption.py tests/unit/memory/builder/test_method_definition.py tests/unit/memory/builder/test_ariad_method.py`, focused `uv run ruff check`, focused `uv run ruff format --check`, `uv run mypy src/memory/builder src/memory/cli/build.py`, and Pi/Mirror natural-language validation with `sandbox-pet-store` passed.

### 2026-06-10 — CV20 Ariad adoption command added

Implemented CV20.DS2.US1 Adopt Ariad For A Journey. Builder can now adopt Ariad for an explicit or active Builder journey through `memory build adopt --method ariad`, persist the adopted method using the runtime method state helper, and report adopted Ariad through method inspection. The Pi Builder skill routes natural-language adoption requests to the contained command. Validation passed in Pi/Mirror using the `sandbox-pet-store` journey: adoption reported Ariad as adopted, follow-up inspection showed `adopted method: ariad`, and no templates, delivery cursor, or story lifecycle were executed.

Validation: `uv run pytest tests/unit/memory/cli/test_build.py tests/unit/memory/builder/test_method_adoption.py tests/unit/memory/builder/test_ariad_method.py tests/unit/memory/builder/test_method_definition.py`, focused `uv run ruff check`, focused `uv run ruff format --check`, `uv run mypy src/memory/builder src/memory/cli/build.py`, CLI smoke for `build adopt` and `build inspect-method`, and Pi/Mirror natural-language validation passed.

### 2026-06-10 — CV20 runtime method adoption state added

Implemented CV20.DS2.TS1 Runtime Method State Sync. Builder now has state helpers to record, read, and clear the method adopted by a journey using explicit runtime-session state keyed by journey. The slice is internal substrate only: no adoption command, Pi natural-language route, template generation, delivery cursor, or lifecycle execution was introduced.

Validation: `uv run pytest tests/unit/memory/builder/test_method_adoption.py tests/unit/memory/cli/test_build.py`, focused `uv run ruff check`, focused `uv run ruff format --check`, and `uv run mypy src/memory/builder src/memory/cli/build.py` passed.

### 2026-06-10 — CV20 Method DSL Foundation completed

Completed CV20.DS1 Method DSL Foundation. Builder now has typed method-definition structures, a built-in Ariad `MethodDefinition` fixture, and read-only method inspection through `memory build inspect-method`. The Pi Builder skill now routes natural-language questions about which Builder method governs the active journey to the inspection command. Validation confirmed the journey-not-adopted path: `builder-mode-evolution` reports no adopted Builder method yet while listing Ariad as available, without executing adoption.

Validation: `uv run pytest tests/unit/memory/cli/test_build.py tests/unit/memory/builder/test_ariad_method.py tests/unit/memory/builder/test_method_definition.py`, focused `uv run ruff check`, focused `uv run ruff format --check`, `uv run mypy src/memory/builder src/memory/cli/build.py`, CLI smoke for `build inspect-method`, and Pi/Mirror natural-language validation passed.

### 2026-06-10 — v0.26.1 Soul Mode English Integration Copy packaged

Packaged `v0.26.1 — Soul Mode English Integration Copy`. Replaced Portuguese hard-coded Soul Mode integration prompts with English baseline copy in the Pi skill contract and aligned CV19 documentation. Confirmed identity integration section headings now use English defaults in code and tests: Self `New Incorporated Principles`, Shadow `New Hidden Needs Recognized`, Ego `New Operational Patterns Identified`, and Persona `New Participation Patterns Revealed`. This keeps Soul Mode consistent with Mirror Mind's English internal language until explicit localization exists.

Validation: `uv run pytest tests/unit/ tests/integration/ -m "not live" -q`, `uv run ruff check src tests`, `uv run ruff format --check src tests`, `git diff --check`, `uv run python -m memory runtime release-notes latest`, and `uv run python -m memory runtime release-notes v0.26.1` passed before release-candidate commit.

### 2026-06-09 — CV20 Ariad method fixture added

Implemented CV20.DS1.TS2 Ariad Method Fixture. Ariad is now represented as a built-in `MethodDefinition` with resolution layers, taxonomy, lifecycle, checkpoints, policies, surfaces, and open questions. The fixture preserves Ariad as declarative method data and does not introduce parser, registry, override resolution, adoption, resume, persistence, CLI inspection, or lifecycle execution behavior.

Validation: `uv run pytest tests/unit/memory/builder/test_ariad_method.py tests/unit/memory/builder/test_method_definition.py`, focused `uv run ruff check`, focused `uv run ruff format --check`, and `uv run mypy src/memory/builder` passed.

### 2026-06-09 — v0.26.0 Soul Mode Integration packaged

Packaged `v0.26.0 — Soul Mode Integration`. CV19 is now marked done, release notes were added, the release index was updated, and package metadata was bumped from `0.25.0` to `0.26.0`. The release includes Closing Rite, multi-layer Integration Proposal, explicit confirmation-only apply, additive identity content updates, atomic identity integration records, and the refined fruit-maturation/self-language contracts.

Validation: `uv run pytest tests/unit/ tests/integration/ -m "not live" -q`, `uv run ruff check src tests`, `uv run ruff format --check src tests`, `git diff --check`, `uv run python -m memory runtime release-notes latest`, and `uv run python -m memory runtime release-notes v0.26.0` passed before release-candidate commit.

### 2026-06-08 — Soul identity integrations made additive and atomic

Reworked confirmed Soul identity apply so integration no longer overwrites prompt-facing identity content. Added `identity_integrations` as an atomic record table, with each confirmed Soul integration preserving layer/key/content/origin/provenance metadata. `memory soul apply` now records the individual integration and appends the exact confirmed text under layer-specific sections: Self `New Incorporated Principles`, Shadow `New Hidden Needs Recognized`, Ego `New Operational Patterns Identified`, and Persona `New Participation Patterns Revealed`. Existing identity content is preserved by default.

Validation: `uv run pytest tests/unit/memory/cli/test_soul.py tests/unit/memory/services/test_soul.py -q`, focused `uv run ruff check`, focused `uv run ruff format --check`, and targeted `git diff --check` passed.

### 2026-06-08 — CV20 Builder method definition model added

Opened CV20 Builder Mode Evolution from the Ariad Builder DSL handoff and implemented CV20.DS1.TS1 Method Definition Model. Builder now has internal typed method-definition structures for method metadata, resolution layers, taxonomy, lifecycle events, checkpoints, policies, surfaces, and open questions, plus structural validation for duplicate ids and invalid references. This is model-only substrate: no Ariad fixture, parser, adoption command, runtime persistence, CLI inspection, or Builder load behavior changed.

Validation: `uv run pytest tests/unit/memory/builder/test_method_definition.py`, focused `uv run ruff check`, focused `uv run ruff format --check`, and `uv run mypy src/memory/builder` passed. Full-project `uv run mypy src/memory` was attempted and failed on pre-existing unrelated errors outside the Builder package.

### 2026-06-08 — Soul Self integration language made affirmative

Tightened Soul integration proposal guidance for Self material. Self proposals must be affirmative first-person principles adopted as practice, not possibility language. The contract now explicitly avoids `can`, `may`, `maybe`, or `need to` as the center of the Self statement, preferring language such as `I care for bonds without turning immediate availability into moral proof of love; my inner measure also belongs to care.`

Validation: documentation/skill-contract change; targeted `git diff --check` passed.

### 2026-06-08 — Soul fruit maturation lineage tightened

Tightened the Soul Mode skill contract so Fruit In Maturation thickens across turns instead of being replaced by the newest insight. The fruit should remain singular in form but plural in root: each revision synthesizes the current fruit with all new living elements that deepen the same fruit, while leaving out context, repetition, unrelated material, or unresolved open questions. Updated CV19.DS1 validation guidance to check that harvested fruit preserves lineage.

Validation: documentation/skill-contract change; targeted `git diff --check` passed.

### 2026-06-08 — CV19.DS3 and DS4 psyche proposal/apply implemented

Implemented Soul Mode psyche enrichment proposal and safe confirmed identity mutation. The former Integration Review was simplified into a multi-layer `☾ INTEGRATION PROPOSAL`: it now uses `origin` instead of `journal`, renders `proposal only — nothing changed`, and asks directly `Do you want to record it this way in your identity? Or we can adjust anything you want.` `memory soul propose self|shadow|ego|persona` remains available as a focused single-layer proposal/refinement surface. `memory soul apply self|shadow|ego|persona` writes identity only with `--confirm APPLY`, uses conservative default keys (`self/soul`, `shadow/profile`, `ego/behavior`), requires explicit persona keys, and renders a visible identity-updated card. Journey identity remains excluded. The Pi contract now asks the assistant to load current identity when possible, confirm exact target/content before apply, avoid overwriting longer identity documents with fragments, and use layer-specific language for Self, Shadow, Ego, and Persona proposals.

Validation: `uv run pytest tests/unit/memory/cli/test_soul.py tests/unit/memory/surfaces/test_soul.py -q`, focused `uv run ruff check` / `ruff format --check` on touched files, and targeted `git diff --check` passed. Full-repo validation remains deferred because unrelated parallel Builder files are present in the working tree.

### 2026-06-08 — CV19.DS2 Integration Proposal implemented

Implemented the Soul Mode Integration Proposal. `memory soul review` now renders a `☾ INTEGRATION PROPOSAL` card with optional proposal-only sections for journal, self, shadow, ego behavior, persona, and leave open. The renderer rejects empty reviews, omits empty categories, preserves the `proposal only — nothing changed` footer, and intentionally excludes journey identity because that category is not mature enough for this release. The Pi Soul Mode skill now uses the post-closing invitation `There is living material that may want to remain as part of your Mirror identity. Do you want to integrate it now?` and routes affirmative responses to the review surface without proposing diffs or mutating identity.

Validation: `uv run pytest tests/unit/memory/cli/test_soul.py tests/unit/memory/surfaces/test_soul.py -q`, focused `uv run ruff check` / `ruff format --check` on touched Soul files, targeted `git diff --check`, and CLI smoke for `memory soul review` passed. External Pi validation passed before DS3/DS4 implementation. Full-repo ruff was not used because unrelated untracked Builder files are present in the working tree.

### 2026-06-08 — CV19.DS1 Closing Rite implemented

Implemented the Soul Mode Closing Rite. `memory soul close` now renders a `☾ CLOSING RITE` card with optional sections for what was harvested, what still echoes, what remains open, and what may want integration. The renderer rejects empty closing cards, preserves paragraph breaks, normalizes escaped newlines, and does not save journal entries or mutate identity. The Pi Soul Mode skill now routes natural closing requests to the contained renderer and preserves the boundary that closing is not integration. During validation, the Self Voice contract was tightened to reject one-line aphorisms, and `listening for` was removed from all active voice cards so every voice lives under `the voice says`. Harvest confirmation copy now asks whether to save as-is or change anything first. After a successful journal save, the Pi skill now immediately renders Closing Rite and asks `Is there another theme that filled the day, or shall we close here for today?`; if the user ends, Mirror deactivates Soul Mode and returns to Mirror Mode with a short farewell.

Validation: `uv run pytest tests/unit/memory/cli/test_soul.py tests/unit/memory/services/test_soul_prompt.py tests/unit/memory/surfaces/test_soul.py -q`, `uv run ruff check src tests`, `uv run ruff format --check src tests`, `git diff --check`, CLI smoke for `memory soul close`, and CLI smoke for Self/Shadow cards without `listening for` passed. External Pi validation passed: harvest confirmation asked whether to save as-is or change first, saving to journal automatically rendered Closing Rite, the follow-up asked whether another theme filled the day or whether to end, and ending deactivated Soul Mode back to Mirror Mode with a farewell.

### 2026-06-08 — CV19 Soul Mode Integration opened

Opened CV19 as the next Soul Mode release: `v0.26.0 — Soul Mode Integration`. Added the CV19 roadmap index and the first delivery story, CV19.DS1 Closing Rite, with plan and test guide. The story boundary is explicit: Closing Rite can gather harvested material, echoes, open questions, and possible integration, but it does not classify, propose, write journal entries, or mutate identity.

Validation: documentation-only roadmap change; `git diff --check` passed.

### 2026-06-08 — Soul Mode post-integration roadmap narrowed

Recorded the Soul Mode roadmap decision after v0.25.0 validation: Passagem, Return To Center, Closing Day / Daily Soul Ritual, and additional new voices are discarded from the active roadmap. Wisdom/Beauty source-library work remains dormant and should only return through an API/provider approach, not a local Mirror-maintained library. The remaining Soul Mode horizon is Integration followed by Web Soul Mode UI.

Validation: documentation-only roadmap decision; `git diff --check` passed.

### 2026-06-08 — v0.25.0 Soul Mode More Voices prepared

Completed CV18 and prepared `v0.25.0 — Soul Mode More Voices`. The release adds active Wisdom Voice and Beauty Voice listening lenses, full voice utterances inside ritual cards, no `listening for` field for the new voices, canonical Wisdom/Beauty prompts, source/aesthetic bridge guidance for Mirror outside the card, and safeguards requiring situated `--says` content so placeholder cards do not render. DS3 refinements were cancelled because the necessary tuning happened during direct DS1/DS2 Pi validation.

Validation: `uv run pytest tests/unit/ tests/integration/ -m "not live" --cov=src --cov-report=term-missing -q`, `uv run ruff check src tests`, `uv run ruff format --check src tests`, `git diff --check`, `uv run python -m memory runtime release-notes latest`, and `uv run python -m memory runtime release-notes v0.25.0` passed before release promotion.

### 2026-06-08 — CV18 Wisdom Voice and Beauty Voice implemented

Implemented CV18.DS1 and CV18.DS2 for `v0.25.0 — Soul Mode More Voices`. Soul Mode now supports Wisdom Voice and Beauty Voice as active listening lenses, with ritual cards, canonical voice prompts, CLI prompt rendering, and Pi skill guidance. Possible Listenings retains the expanded voice constellation and the new voices remain non-mutating listening lenses rather than agents or advice engines. Wisdom and Beauty both require situated `--says` content and omit `listening for` so the voice itself lives inside the card.

Validation: `uv run pytest tests/unit/memory/cli/test_soul.py tests/unit/memory/services/test_soul_prompt.py tests/unit/memory/surfaces/test_soul.py -q`, `uv run ruff check src tests`, `uv run ruff format --check src tests`, and `git diff --check` passed. Awaiting external Pi validation in natural conversation. First Pi validation showed Wisdom Voice was too short and source-less, so the Wisdom contract was tightened to require a situated wisdom source, honest citation when reliable, and a deeper response. Second Pi validation showed the source interpretation was happening mostly outside the card; the contract was tightened again so the card contains the solemn voice of the source/text/tradition unfolding its symbolism, omits Wisdom's `listening for` section, and keeps Mirror's practical bridge outside the card in its normal tone. Follow-up validation showed Pi could accidentally render the placeholder Wisdom card by calling `soul rite wisdom` without `--says`; Wisdom now requires a situated `--says` response so the assistant must compose the real voice before rendering the card. Later validation showed escaped `\\n\\n` sequences could leak into the card and the Mirror bridge needed source-origin context; the renderer now normalizes escaped newlines, and the Wisdom contract asks Mirror to explain who said the passage, where it appears, and the relevant historical/textual context when reliable.

### 2026-06-08 — CV18 Soul Mode More Voices planned

Opened CV18 as the next Soul Mode release: `v0.25.0 — Soul Mode More Voices`. The planned delivery arc contains Wisdom Voice, Beauty Voice, pre-release refinements, and release packaging. The roadmap preserves the delivery-story principle: prompts, surfaces, and routing are part of the user-visible voice stories rather than standalone internal deliverables.

Validation: documentation-only roadmap change; `git diff --check` pending.

### 2026-06-08 — v0.24.0 Soul Mode First Ritual prepared

Completed CV17 Soul Mode first ritual and prepared `v0.24.0`. The release adds explicit Soul Mode activation, living-field Possible Listenings, Self and Shadow listening lenses, Fruit In Maturation, Harvested Fruit with confirmation-only journal save, dynamic Self Voice prompt composition from `self/soul`, Soul-to-Builder operational boundary, and pre-release web refinements for Journal memories, formatted journal detail, conversation turn deletion, and top-level Conversations/Journeys navigation. Marked CV17.DS6 done and added release notes.

Validation: `uv run pytest tests/unit/ -q`, `uv run pytest tests/integration/ -q`, `uv run ruff check src tests`, `uv run ruff format --check src tests`, `uv run python -m memory runtime release-notes latest`, `uv run python -m memory runtime release-notes v0.24.0`, and `git diff --check` passed before release promotion.

### 2026-06-08 — Journal memories open as formatted web detail

Updated the web memory surface so Journal appears as its own pinned memory category, journal memory cards open object detail pages, and Markdown journal content renders with headings, blockquotes, lists, code blocks, and safe internal links instead of plain escaped text. This makes Soul Mode harvested-fruit journal records readable in the web app.

Validation: `uv run pytest tests/unit/memory/surfaces/test_objects.py tests/unit/memory/surfaces/test_search.py tests/unit/memory/surfaces/test_atlas.py tests/unit/memory/web/test_server.py -q` passed.

### 2026-06-07 — Pi status line journey label simplified

Updated the compact Pi status line to show the journey display name directly instead of the `Active Journey <slug>` prefix. The status now reads like `◇ alisson-vale · Explorer Mode on ■ Builder Mode · ✓`, using the journey title from identity when available and falling back to the slug when not. Updated focused welcome tests and runtime status-line documentation.

Validation: `uv run pytest tests/unit/memory/cli/test_welcome.py -q` passed.

### 2026-06-07 — CV17 Soul Mode roadmap opened

Opened CV17 Soul Mode from the expanded Builder handoff for Mirror Soul Mode. Added the CV17 roadmap index and six planned delivery stories covering explicit Soul Mode entry, living-field listening with Possible Listenings, minimal active rites for Self Voice and Shadow Voice, Fruit In Maturation, Harvested Fruit with optional journal persistence, and release packaging with a feedback runway. Updated the roadmap index and documentation map so Soul Mode appears as the next planned capability after Explorer Mode.

Validation: documentation-only roadmap change; `git diff --check` passed.

### 2026-06-07 — v0.23.0 release candidate prepared

Prepared `v0.23.0 — Durable Explorer Mode` as the first durable Explorer Mode release candidate. Bumped the package version to `0.23.0`, added `docs/releases/v0.23.0.md`, listed it in the release index, and marked CV16.DS8, DS8.2, DS9, and DS10 done in the Explorer roadmap. Validation handoff artifacts under `docs/project/explorations/` are intentionally kept local for the next Soul Mode implementation and excluded from release packaging.

Validation: release-note smoke renders `v0.23.0` as latest; full tests, ruff, format check, `git diff --check`, and Pi extension TypeScript check passed before packaging.

### 2026-06-07 — Explorer DS8.2 and DS9 completed

Completed Editorial Handoff Evidence and Required Surface Rendering/Operational Boundary hardening. Builder handoffs now link to durable Exploratory Story ids, list source evidence, include a completeness checklist, and optionally write obfuscated full conversation material only with explicit confirmation. Explorer required surfaces are wrapped in stable machine-readable markers for runtime rendering, the Pi Explorer skill renders required cards first while hiding marker lines, stale experimental Explorer availability copy was replaced with active capability wording, and operating-mode status is session-scoped in Pi to prevent footer leakage between simultaneous sessions.

Validation: `uv run pytest tests/unit/ tests/integration/ -m "not live"` passed with 1439 tests; `uv run ruff check src/ tests/`, `uv run ruff format --check src/ tests/`, `git diff --check`, and `cd .pi && npx tsc --noEmit` passed. Smoke validation confirmed two Pi session ids can show independent Builder and Explorer mode status lines.

### 2026-06-07 — Explorer DS8 split into durable stories and handoff evidence

Refined the planned CV16.DS8 Persistence and Visibility story into two delivery stories: DS8.1 Durable Explorer Stories for persistence, resume, lifecycle, and minimal visibility; and DS8.2 Editorial Handoff Evidence for source conversations, completeness review, and privacy-safe full conversation material. Updated the CV16 roadmap, DS8 story docs, plan, test guide, and decision log so implementation can start from a clearer boundary.

Validation: documentation-only planning change; `git diff --check` passed.

### 2026-06-07 — Builder handoff artifact quality improved

Improved the Explorer-to-Builder transfer document set after real Soul Mode validation showed the generated docs did not represent the actual decision or the continuous thickening of the story. Handoff folders now use a slug from the handoff or Exploratory Story title instead of timestamp-plus-journey ids. The transfer set now includes `index.md` for editorial synthesis, plus richer `exploratory-story.md`, `handoff-info.md`, and `product-design-proposal.md` documents. `story handoff` accepts `--editorial-synthesis` so the assistant can transfer the narrative of discovery rather than only dumping stored state fields.

Validation: Explorer handoff, story, surface, and CLI tests passed; ruff checks passed for touched Explorer files; technical smoke confirmed slug folder generation, four document outputs, index synthesis, and continuous thickening narrative.

### 2026-06-06 — Explorer story thickening boundary tightened

Updated the Explorer skill contract so `story thicken` is reserved for narrative/substantive changes, not local refinements such as icons, microcopy, visual labels, formatting, wording polish, or small naming adjustments. Added a decision record and folded this boundary into the planned DS9 required surface rendering contract.

Validation: documentation and skill-contract change only; no automated tests required.

### 2026-06-06 — Explorer required surface rendering instruction hardened

Tightened the Pi Explorer skill after external validation showed a `△ STORY THICKENED` card could be generated by the CLI but omitted from the assistant's visible response. Explorer story surfaces must now be pasted verbatim as the first visible block before commentary. Added a planned CV16.DS9 hardening story for machine-identifiable required surface markers and possible runtime enforcement.

Validation: documentation and skill-contract change only; no automated tests required.

### 2026-06-06 — Builder handoff artifact set added

Added the explicit Explorer-to-Builder transfer boundary. `python -m memory explore story handoff <journey>` now writes a transfer document set under `docs/project/explorations/<es-id>/` when the journey has a project path: `exploratory-story.md`, `handoff-info.md`, and `product-design-proposal.md`. The handoff surface shows artifact paths and preserves the no-silent-promotion boundary. `python -m memory explore story promote <journey>` confirms the stored handoff and then activates Builder through the normal Builder load path.

Validation: Explorer Story service, Explorer handoff artifact, surface, and CLI tests passed; ruff checks passed for touched Explorer files; technical smoke confirmed artifact generation, handoff proposal, promotion to Builder, and cleanup behavior.

### 2026-06-06 — Experiment proposals and attractors added

Extended the in-session Exploratory Story with visible attractors and small experiment proposals. `python -m memory explore story attractors <journey>` now replaces the current surfaced attractor, `story experiment <journey>` stores a proposed learning experiment, and Narrative Field Snapshot includes both. The implementation keeps attractors and experiments inside runtime story state, avoids hidden detection, and does not activate Builder.

Validation: Explorer Story service, surface, and CLI tests passed; ruff checks passed for touched Explorer files; technical smoke confirmed attractor, experiment, snapshot, and cleanup behavior.

### 2026-06-06 — Story thickening surfaces added

Added the first visible Explorer Story surfaces. `python -m memory explore story open|thicken|snapshot <journey>` now renders `△ EXPLORATORY STORY OPENED`, `△ STORY THICKENED`, and `△ NARRATIVE FIELD SNAPSHOT` while updating or reading the in-session Exploratory Story. CV16 was split so attractors and experiment proposals move to DS6, Builder handoff to DS7, and persistence/visibility to DS8.

Validation: Explorer Story surface, service, and CLI tests passed; ruff checks passed for touched Explorer files; manual smoke confirmed open, thicken, snapshot, and cleanup behavior.

### 2026-06-06 — In-session Exploratory Story state added

Added the first observable Explorer behavior after activation. `python -m memory explore story update|show|clear <journey>` now manages one current in-session Exploratory Story per journey using runtime state, and `explore load <journey>` includes that story context when present. DS4 deliberately avoids signal/radar modeling for now because the practical value is in the accumulated Exploratory Story itself.

Validation: Explorer Story service tests and Explorer CLI tests passed; ruff checks passed for touched Explorer Story files.

### 2026-06-06 — Explorer activation contract completed

Added the explicit Explorer Mode entry and exit contract. `python -m memory explore load <slug>` remains the contained activation operation and now has regression coverage for sticky journey context and non-conversation behavior. `python -m memory explore deactivate` provides the semantic exit path, clears only the explicit Explorer lens, and renders a visible return-to-Mirror confirmation while preserving sticky journey context. The Pi skill now documents natural-language entry, exit, and the no-silent-promotion boundary.

Validation: focused Explorer CLI, operating-mode, and welcome status tests passed; ruff checks passed for touched Explorer files; manual smoke confirmed Explorer activation, status-line orientation, deactivation, and fallback to Mirror Mode with journey context preserved.

### 2026-06-06 — Discard current conversation skill added

Added a runtime hygiene path for test sessions: `python -m memory conversation-logger discard-current` deletes the current runtime conversation through the existing conversation deletion service and marks the runtime session so the assistant confirmation is not logged as a new conversation. Added `/mm-discard` for Pi, documented the command, and updated CV16 with DS2 as done.

Validation: discard-current focused tests passed and ruff checks passed for the touched logger files.

### 2026-06-06 — Mode transition surfaces added

Added compact conversational transition surfaces for the three primary Mirror lenses. Mirror Mode now renders `◌ MIRROR MODE ACTIVE` with identity, active journey, persona-routing examples, and available lenses. Builder Mode renders `■ BUILDER MODE ACTIVE` with active journey, stage/path, project path, compact briefing, and boundary. Explorer Mode renders an initial minimal `△ EXPLORER MODE ACTIVE` surface to be refined when Explorer behavior is built. Persona activation now uses `✦ Persona:` instead of reusing the Mirror identity symbol.

Validation: focused mode-transition, Mirror skill, Builder CLI, and Explorer CLI tests passed; ruff checks passed for touched Python files.

### 2026-06-06 — Runtime status bar foundation added

Added explicit Mirror operating mode lifecycle state and connected it to the Pi status line foundation for CV16 Explorer Mode. `python -m memory mode activate|deactivate|status` now records and clears the active operating lens without mutating sticky persona/journey defaults inside the active session. The user-facing mode grouping is now `/mm-mirror`, `/mm-build`, and `/mm-explore`: Mirror load activates `◌ Mirror Mode`, Builder load activates `■ Builder Mode`, and Explorer load activates `△ Explorer Mode` for a selected journey. `welcome --status-line` renders compact orientation such as `◇ alisson-vale · Explorer Mode on ■ Builder Mode · ✓`. When the explicit mode is deactivated but journey context remains sticky, the status line returns to `◌ Mirror Mode`. New runtime session start clears stale explicit mode and sticky journey context so opening Mirror begins from present intention rather than accidental continuity with the last journey. The Pi logger extension refreshes the Mirror footer status at startup and after agent turns, while preserving Pi's built-in footer.

Validation: focused operating-mode, welcome, build, and mode CLI tests passed; ruff checks passed for touched Python files; `.pi` TypeScript type-check passed; CLI smoke confirmed Builder activation, status rendering, explicit deactivation, and restoration.

### 2026-06-02 — v0.20.0 Hierarchical Journey Organization prepared

Prepared `v0.20.0 — Hierarchical Journey Organization`, the first CV15 Cognitive Location release. Journeys now support one-level `parent_journey` metadata with guarded validation; the web console can set parent, title, and status in Journey Settings; New journey can assign a parent; Workspace renders parent/child journeys with session-persistent expand/collapse; paused and completed journeys are visually dimmed; completed journeys are hidden by default behind a toggle while preserving hierarchy when shown; and `mm-journeys` / `python -m memory journeys` render the hierarchy textually.

Validation: Navigator manually validated web hierarchy behavior, parent assignment, title/status editing, completed toggle, paused/completed dimming, expand/collapse, and hierarchical journey-list output. Focused automated tests, ruff lint, ruff format check, JavaScript syntax check, and `git diff --check` passed before release packaging.

### 2026-06-02 — ES-002 promoted into CV15 Cognitive Location

Promoted the Hierarchical Journeys exploration into CV15 Cognitive Location. The promoted capability is split into two release-sized stories: Hierarchical Journey Organization, intended for v0.20.0, and Scene Workspace Home, intended for v0.21.0. The split preserves a stable parent-journey foundation before adding the interpretive Scene surface and grounded LLM synthesis.

Validation: documentation-only promotion; roadmap and exploration links were updated and `git diff --check` passed.

### 2026-06-02 — v0.19.1 CI formatting patch prepared

Prepared `v0.19.1 — Web Console Maintenance CI Formatting` after the v0.19.0 main push failed GitHub Actions at the repository-wide `ruff format --check src/ tests/` gate. The patch preserves the v0.19.0 web-console behavior and applies formatting to the touched Python files so the release line can return to green CI.

Validation: full pytest passed, ruff lint passed, ruff format check passed, web app syntax check passed, release notes rendered, and release doctor passed with only expected pre-tag/pre-stable warnings before promotion.

### 2026-06-02 — Web console journey creation first slice added

Added the first web-console path for creating journeys without reducing journey identity to a brittle CRUD form. Workspace now has a New journey action that collects natural-language description, generates a reviewable markdown draft, lets the user edit slug, metadata, and identity content, then persists a new active journey. The server exposes bounded draft and create endpoints with slug, duplicate, minimum-content, status, and description-section validation.

Validation: focused web server tests passed, ruff checks passed for touched Python files, `node --check` passed for the web app, and the Mirror web server was restarted.

### 2026-06-02 — Web console conversation deletion controls added

Added explicit conversation deletion from the web console maintenance surfaces. Conversation detail now exposes a confirmed delete action, and the Unassigned conversations batch panel now supports deleting selected conversations alongside Assign selected. The server exposes a bounded `/api/conversations/delete` endpoint that deletes selected conversations, removes dependent messages and conversation embeddings, clears runtime-session and LLM-call references, and preserves extracted memories by detaching their conversation id.

Validation: focused web server and conversation service tests passed, ruff checks passed for touched Python files, and `node --check` passed for the web app.

### 2026-05-28 — Builder clone-role guard scoped to journey project path

Fixed a Builder Mode guard regression where `memory build load <slug>` inspected the current Mirror runtime checkout and refused to start when that checkout was marked `production`, even if the selected journey pointed at a separate development project. The guard now loads the journey first and applies clone-role inspection only when the journey `project_path` points at a Mirror Mind source checkout; ordinary journey projects without `.mirror-clone-role` are not blocked. When no project path is configured, Builder falls back to the current directory. Documentation now describes the Mirror-specific boundary.

Validation: focused Builder CLI tests passed and ruff checks passed for the touched files. Prepared v0.17.1 as the behavior patch, v0.17.2 as the follow-up CI-formatting validation patch after the v0.17.1 main run failed at the repository-wide ruff format gate, and v0.17.3 as the completed non-Mirror project fix after production validation showed the remaining false block.

### 2026-05-27 — v0.17.0 conversation title hardening prepared

Prepared `v0.17.0 — Conversation Title Hardening` as a minor release after validating the title-repair arc in production. The release hardens title provenance in the core, marks first-message titles as provisional, retitles safely at conversation close, adds bounded startup maintenance for missed/backfilled conversations, makes batch conversation retitle runnable from the web with dry-run cost estimates and backups, and polishes Operations console feedback for long title-generation runs.

Validation: production batches retitled legacy conversations with backups, dry-run showed remaining counts and estimated cost, the long-run polling failure was diagnosed as a browser timeout rather than backend failure, the web server was restarted after UI changes, focused tests and the full pytest suite passed, and ruff checks passed for touched files.

### 2026-05-27 — v0.16.2 updater validation stub prepared

Prepared `v0.16.2 — Runtime Update Validation Stub` as a minimal stable release after v0.16.1. The release intentionally contains no functional runtime change; it exists to validate the corrected updater installed in production by v0.16.1 executing a normal update to a newer stable release.

Validation: release-note smoke passed, focused runtime tests and ruff checks passed, release doctor was ready with expected pre-promotion warnings, promotion created and pushed tag/stable for `v0.16.2`, and production updated successfully from `0.16.1` to `0.16.2` using the corrected updater with backup `memory_20260527_185039.zip`, fast-forward `b23d869 -> 2c7c3cd`, post-update status ready, and update check reporting `up_to_date`.

### 2026-05-27 — v0.16.1 release candidate prepared

Prepared `v0.16.1 — Runtime Update Preflight Resilience` to publish the CV9.E2.S3 updater hardening fix. The release note explains the production failure mode, the narrow update-safe preflight lane for core migration drift, SQLite WAL sidecar status recovery, and the preserved safety gates.

Validation: release-note smoke passed, release doctor was ready with expected pre-promotion warnings, promotion created and pushed tag/stable for `v0.16.1`, and production updated successfully from `0.16.0` to `0.16.1` with backup `memory_20260527_184143.zip`, fast-forward `5e805ae -> b23d869`, post-update status ready, and update check reporting `up_to_date`. GitHub Actions did not show a new workflow run for the branch or stable push in `gh run list`.

### 2026-05-27 — Runtime update preflight resilience validated in production

Fixed a structural updater fragility where an older production checkout could not update because its strict pre-update status gate rejected a core migration row introduced by the target version. The updater now distinguishes full runtime readiness from a narrow update-safe preflight state: core migration drift may proceed only when git, mirror home, database existence, and extension health are otherwise safe, with backup, migrations, and post-update status still enforced. Runtime status SQLite inspection also recovers WAL sidecar absence by reopening the existing database in bounded read-write mode when strict read-only inspection reports `unable to open database file`.

Validation: runtime CLI tests passed, ruff checks passed, `git diff --check` passed, and the personal production Mirror updated successfully from `0.15.0` to `0.16.0` with backup `memory_20260527_183259.zip`, fast-forward `976b421 -> 5e805ae`, migrations applied, and post-update status ready.

### 2026-05-26 — CV13 final roadmap coherence pass completed

Reconciled CV13 status after the completed E1–E6 web arc. The roadmap root and CV13 index now mark Mirror Web Experience done, with CV13 described as the staged progression from read-only visibility through preferences, configuration, conversation intelligence, operations, asynchronous runs, controlled command execution, cancellation, approvals, and the bounded agent-run prototype. Release readiness remains a separate next step: package version and release notes are not yet prepared for the next published version.

Validation: focused web/service/migration tests passed, ruff checks passed, `node --check` passed for the web app, `git diff --check` passed, and release doctor intentionally surfaced the expected pre-release gaps for `v0.16.0`.

### 2026-05-26 — CV13.E6.S7 run console surface polish validated

Refined the Operations experience from inline audit cards into a dedicated run console. Starting an operation now opens a dominant shell-like console surface with polled lifecycle output, command/agent evidence, side cards for operation metadata and run actions, approval/cancel affordances, and a disabled future-agent input panel for the agent prototype. The copy remains honest that this is polled durable run state rather than true SSE/WebSocket streaming.

Validation: focused web/service/migration tests passed, ruff checks passed, `node --check` passed for the web app, `git diff --check` passed, and the Mirror Web server was restarted for browser validation.

### 2026-05-26 — CV13.E6.S6 agent run prototype validated

Closed the CV13.E6 Async Operations and Agentic Web Console arc with a bounded read-only agent-run prototype. The new `agent-run-prototype` operation accepts a natural-language intent, runs through the same asynchronous operation run lifecycle, records timeline evidence, and returns a proposal with explicit safety boundaries. The prototype proves the agent-shaped product path without autonomous writes, unrestricted Pi/headless runtime embedding, arbitrary shell, SQL, git, update, migration, or file mutation. CV13.E6 is now complete as the first agentic substrate: async runs, event timelines, controlled commands, cooperative cancellation, approval checkpoints, and bounded agent prototype.

Validation: focused web/service/migration tests passed, ruff checks passed, `node --check` passed for the web app, and `git diff --check` passed.

### 2026-05-26 — CV13.E6.S5 approval checkpoint model validated

Added the first approval checkpoint model for asynchronous web operations. Runs can now enter `approval_required`, record approval-required and approved timeline events, and continue only through a guarded approve endpoint. Conversation journey repair apply requests (`dryRun: false`) now pause before persistent database writes and execute only after explicit approval. The Operations UI renders approve actions for approval-required runs while preserving cancellation. No broad mutation approval surface, raw SQL, shell, git, update, migration, or agent execution path was introduced.

Validation: focused web/service/migration tests passed, ruff checks passed, `node --check` passed for the web app, and `git diff --check` passed.

### 2026-05-26 — CV13.E6.S4 cancellation and failure semantics validated

Added cooperative cancellation semantics to asynchronous web operation runs. Runs can now move through `cancellation_requested` and `cancelled` states, cancellation requests are recorded as durable timeline events, terminal runs reject cancellation, and the Operations UI exposes a request-cancel action for active runs. S4 intentionally does not forcibly kill running Python work; it preserves explicit state and evidence so later long-running command and agent operations can cooperate with cancellation safely.

Validation: focused web/service/migration tests passed, ruff checks passed, `node --check` passed for the web app, and `git diff --check` passed.

### 2026-05-26 — CV13.E6.S3 controlled command executor validated

Added a controlled command execution boundary for asynchronous web operations without exposing a browser shell. Server-owned `ControlledCommand` definitions now run with fixed argv, `shell=False`, explicit cwd, sanitized environment, timeout, and bounded stdout/stderr capture. A read-only `runtime-diagnose` operation proves the boundary by running `python -m memory runtime diagnose` for the selected Mirror home and returning command evidence through the existing async run, event timeline, and result surfaces. No user-supplied command string, arbitrary cwd/env, runtime update, git mutation, extension install, migration execution, cancellation, approval checkpoint, or Pi/headless agent integration was introduced.

Validation: focused web/service/migration tests passed, ruff checks passed, `node --check` passed for the web app, and `git diff --check` passed.

### 2026-05-26 — CV13.E6.S2 operation event log and timeline validated

Added durable lifecycle events for asynchronous web operation runs. The core schema and migration now include `operation_run_events`; `OperationRunService` records queued, running, completed, and failed events; single-run inspection returns events in sequence; and the Operations UI renders a compact run timeline beside final result evidence. Polling remains the delivery mechanism, with no SSE/WebSocket, cancellation, approval checkpoint, command executor, Pi/headless agent integration, arbitrary shell command, SQL, git, or runtime update surface introduced.

Validation: focused web/service/migration tests passed, ruff checks passed, `node --check` passed for the web app, and `git diff --check` passed.

### 2026-05-26 — CV13.E6.S1 async operation run model validated

Started the Agentic Web Console arc by moving web operation execution out of the original request path. `POST /api/operations/run` now validates allowlisted operation input, creates a queued durable run, returns a run id immediately, and executes the existing operation implementation in a local background worker. Operation runs now support queued and running states, one-run inspection is available at `/api/operations/runs/<id>`, invalid parameters are rejected before run creation, and the Operations UI polls active runs before showing final evidence. No arbitrary shell command, user-supplied command string, Pi/headless agent integration, approval checkpoint, or runtime mutation path was introduced.

Validation: focused web/service/migration tests passed, ruff checks passed, `node --check` passed for the web app, and `git diff --check` passed.

### 2026-05-26 — CV13.E5.S7 Operations surface polish and release coherence validated

Closed the Web Operations Runner release arc with a more coherent Operations surface. Operation rows now use a compact grid with icon actions, future operations are disabled in place rather than breaking layout, operation configuration lives in a detail panel, results render as readable operation-specific cards with raw JSON collapsed as evidence, runtime health now explains attention-needed causes, and recent audit evidence is a simple low-noise list with status color dots. The release wording was reconciled around a synchronous-first v0.15 scope, leaving job model, streaming, cancellation, and long-running safeguards as explicit future work.

Validation: focused web, service, and migration tests passed, ruff checks passed, `node --check` passed, and `git diff --check` passed. Navigator manually validated the refined Operations grid, recent runs list, runtime health attention details, and final responsive/layout adjustments.

### 2026-05-26 — CV13.E5.S6 Operations Runner surface validated

Added the first visible Operations Runner surface. The web app now has an Operations tab that renders the server-owned operation catalog, exposes runnable controls for runtime health, database backup, and conversation journey repair, keeps dry-run enabled by default for repair, displays inline operation results, and lists recent audit history. Future operations are visible without run controls. Result evidence is intentionally shown as structured raw JSON for this first validation slice; product polish can later render operation-specific result cards.

Validation: focused web, service, and migration tests passed, ruff checks passed, `node --check` passed, and `git diff --check` passed. Navigator manually validated the Operations tab, ran runtime health, confirmed JSON result evidence and accepted the current functional surface.

### 2026-05-26 — CV13.E5.S5 operation audit evidence validated

Added local audit persistence for Web Operations Runner executions. The core schema and migration now include `operation_runs`, `MemoryClient` exposes `operation_runs`, and `POST /api/operations/run` returns a `runId` while recording completed and failed known operation runs. `GET /api/operations/runs` lists recent audit records with operation id, status, outcome, timestamps, sanitized parameters, summary, result evidence, and errors. Execution remains synchronous; no background jobs, streaming, cancellation, retry, or visible UI was introduced.

Validation: focused web, service, and migration tests passed, ruff checks passed, `node --check` passed, and `git diff --check` passed. Manual validation was waived for this API-only story under the current instruction to stop only for surface validation.

### 2026-05-26 — CV13.E5.S4 conversation repair dry-run/apply validated

Added the conversation journey repair operation to the Web Operations Runner. `conversation-journey-repair` is now runnable with `dryRun` defaulting to true and bounded `limit` validation. Dry-run returns high-confidence repair candidates without mutation. Apply requires `dryRun: false`, creates a backup first, then updates only the inferred journey association for matching journeyless conversations. The operation exposes candidate and backup evidence and rejects arbitrary reassignment, SQL, command, or path parameters.

Validation: focused web tests passed, ruff checks passed, `node --check` passed, and `git diff --check` passed. Manual validation was waived for this API-only story under the current instruction to stop only for surface validation.

### 2026-05-26 — CV13.E5.S3 backup operation validated

Added the first bounded write operation to the Web Operations Runner. `database-backup` is now runnable through `POST /api/operations/run`, using the existing Python backup path for the selected Mirror home and optional structural archive verification. The response includes backup path, verification entries, validity, note, and manual recovery route. Unsupported parameters such as arbitrary paths are rejected, and no restore, delete, download, shell, SQL, git, update, or streaming behavior was introduced.

Validation: focused web tests passed, ruff checks passed, `node --check` passed, and `git diff --check` passed. Manual validation was waived for this API-only story under the current instruction to stop only for surface validation.

### 2026-05-26 — CV13.E5.S2 runtime health operation validated

Added the first runnable Web Operations Runner operation. `runtime-health` now appears as runnable in the catalog, and `POST /api/operations/run` executes only that read-only operation through direct Python runtime inspection. Unknown operations, future operations, command-like request fields, and parameters for runtime health are rejected. The response returns structured runtime status data for version, git, Mirror home, database, migrations, extensions, clone role, Python version, environment, and update channel. Explicit `mirror_home` status inspection now overrides ambient environment selection so the web operation follows the selected Mirror.

Validation: focused web tests passed, ruff checks passed, `node --check` passed, and `git diff --check` passed. Manual validation was waived for this API-only story under the current instruction to stop only for surface validation.

### 2026-05-26 — CV13.E5.S1 operation registry and dry-run contract validated

Started the `v0.15.0 — Web Operations Runner` slice with a server-owned, read-only operation catalog. The web API now exposes `GET /api/operations/catalog` with allowlisted maintenance operation metadata, risk level, dry-run behavior, execution availability, and declarative parameters. No operation execution endpoint, subprocess hook, shell command, raw SQL, git mutation, runtime update, or `.env` mutation was added.

Validation: focused web tests passed, ruff checks passed, `node --check` passed, and `git diff --check` passed. Navigator accepted moving to the next story.

### 2026-05-25 — v0.14.0 release candidate prepared

Prepared `v0.14.0 — Conversation Intelligence` as the minor release candidate for
CV13.E4. The release packages readable conversation transcripts, Workspace card
navigation, manual title editing, explicit OpenRouter title suggestions,
configuration reference links, compact configuration icons, Workspace visual
refinements, and read-only journey attachment visibility.

### 2026-05-25 — CV13.E4.S6 journey attachments visibility validated

Added read-only journey attachment visibility to Workspace. The selected journey
now exposes an Attachments tab and attachment metric, backed by `AttachmentService`,
showing attachment name, description/content preview, type, journey, tags, and
created metadata. The story intentionally excludes upload, edit, delete, and LLM
actions. Final Workspace visual tuning also reduced journey metric card size and
used configured journey icons in the sidebar.

Validation: focused Workspace/web tests passed, ruff checks passed,
`node --check` passed, `git diff --check` passed, the web server was restarted,
and Navigator accepted the final Workspace behavior.

### 2026-05-25 — CV13.E4.S5 configuration reference links validated

Closed E4 coherence by adding detailed configuration reference documentation and
linking surfaced Configuration items to the relevant reference sections. The UI
now uses compact required/optional and info-reference icons instead of a large
Reference button. Transcript export directory visibility was removed because it
is not currently a clear product-facing operation.

Validation: focused configuration/web tests passed, ruff checks passed,
`node --check` passed, `git diff --check` passed, the web server was restarted,
and Navigator accepted the configuration reference behavior.

### 2026-05-25 — CV13.E4.S4 single conversation retitle validated

Added an explicit single-conversation title suggestion flow. Transcript pages can
request a title suggestion through `/api/conversations/title-suggestion`, backed
by `ConversationService.suggest_title()` and the existing OpenRouter LLM router
using `EXTRACTION_MODEL`. Suggestions are pproposal-only: they do not save on page
load or after generation, and persistence still requires the manual `Save title`
action from S3.

Validation: focused Workspace/web tests passed, ruff checks passed,
`node --check` passed, `git diff --check` passed, the web server was restarted,
and Navigator browser validation accepted explicit generation, pproposal-only
behavior, use-suggestion fill, and manual save persistence.

### 2026-05-25 — CV13.E4.S3 manual conversation title edit validated

Added a bounded manual title edit path for individual conversations. The
transcript page now exposes a title form backed by `ConversationService.update_title`
and `/api/conversations/title`, with server-side validation and no LLM call. A
focus issue was corrected by separating card navigation attributes from the title
form conversation id, preventing transcript card navigation from capturing textbox
clicks.

Validation: focused Workspace/web tests passed, ruff checks passed,
`node --check` passed, `git diff --check` passed, the web server was restarted,
and Navigator browser validation accepted title edit, persistence, Workspace card
refresh, and stable textbox focus.

### 2026-05-25 — CV13.E4.S2 conversation card navigation validated

Made Workspace conversation cards real navigation controls for the read-only
transcript page introduced in S1. Cards are clickable and keyboard-accessible,
open `#conversation/<id>`, and return to Workspace through the transcript back
action. The story remains navigation-only: no retitle, edit, delete, batch, or
LLM action is exposed.

Validation: focused Workspace/web tests passed, ruff checks passed,
`node --check` passed, `git diff --check` passed, the web server was restarted,
and Navigator browser validation accepted mouse and keyboard navigation.

### 2026-05-25 — CV13.E4.S1 conversation detail page validated

Started the `v0.14.0 — Conversation Intelligence` slice and added a read-only
conversation transcript page. The web API now serves one conversation with
bounded metadata and ordered messages at `/api/conversations/detail`, and the
web app supports direct `#conversation/<id>` navigation. Transcript labels use
`Mirror` for assistant messages and the active web profile display name for user
messages. No retitle, edit, delete, batch, or LLM action is exposed.

Validation: focused Workspace/web tests passed, ruff checks passed,
`node --check` passed, `git diff --check` passed, the web server was restarted,
and Navigator browser validation accepted the direct transcript flow.

### 2026-05-25 — v0.13.0 release candidate prepared

Prepared `v0.13.0 — Configuration Console` as the minor release candidate for
CV13.E3. The release packages the completed S1–S5 arc: read-only configuration
overview, masked environment boundary, Workspace-based journey settings,
safe journey metadata editing, and final configuration coherence validation.

### 2026-05-25 — CV13.E3.S5 configuration coherence validated

Closed the CV13.E3 Configuration Console story arc with final coherence coverage
and browser validation. Configuration now stays scoped to Mirror/runtime settings,
Environment boundary masks secrets, journey settings live in Workspace, selected
journey metadata can be safely edited through service boundaries, and no raw
`.env`, JSON, YAML, database, or journey-content editor is exposed.

Validation: focused Workspace/configuration/web tests passed, ruff checks passed,
`node --check` passed, `git diff --check` passed, and Navigator browser
validation accepted the final end-to-end flow.

### 2026-05-25 — CV13.E3.S4 safe journey metadata edit validated

Added a safe edit path for selected journey metadata from Workspace Settings.
The web app can update project path, sync file, icon, and color through a guarded
`/api/journeys/metadata` endpoint backed by `JourneyService.update_metadata_fields`.
The flow avoids raw JSON/content editors, validates fields server-side, refreshes
the selected journey settings after save, and persists through reload.

Validation: focused Workspace/web tests passed, ruff checks passed,
`node --check` passed, `git diff --check` passed, and Navigator browser
validation accepted edit, save, refresh, reload persistence, and absence of raw
editors.

### 2026-05-25 — CV13.E3.S3 journey settings placement validated

Reworked the journey-configuration story to avoid duplicating journeys in the
global Configuration page. Configuration now remains scoped to Mirror/runtime
settings, while selected journey settings live in Workspace under a read-only
Settings tab with journey id, status, project path, sync file, icon, and color.

Validation: focused Workspace/configuration/web tests passed, ruff checks passed,
`node --check` passed, `git diff --check` passed, and Navigator browser
validation accepted the corrected information architecture and read-only journey
settings placement.

### 2026-05-25 — CV13.E3.S2 environment boundary validated

Added a guarded Environment boundary section to the Configuration page. The web
surface now shows a small allowlist of environment-derived runtime settings,
keeps the configuration page read-only, masks sensitive key/token/secret values,
and uses internal tabs to reduce visual clutter across configuration sections.

Validation: focused configuration/web tests passed, ruff checks passed,
`node --check` passed, `git diff --check` passed, and Navigator browser
validation accepted the tabbed layout, environment section, and secret masking.

### 2026-05-25 — CV13.E3.S1 configuration overview validated

Started the `v0.13.0 — Configuration Console` branch with a read-only,
non-sensitive configuration overview. The web app now has a Configuration tab
backed by `/api/configuration/overview`, showing active Mirror paths, local
directories, and user-facing runtime defaults such as memory search model,
memory extraction model, LLM audit logging, and conversation routing.

Validation: focused configuration/web tests passed, ruff checks passed,
`node --check` passed, `git diff --check` passed, and Navigator browser
validation accepted the read-only page, path status, absence of secrets, and
explanatory labels.

### 2026-05-25 — v0.12.0 release candidate prepared

Prepared `v0.12.0 — Multi-Mirror and Preferences` as the minor release candidate
for CV13.E2. The release packages the completed S1–S5 arc: Mirror selector
foundation, safe local Mirror switching, Mirror-scoped profile preferences,
Mirror-scoped theme preference, and final preference-coherence validation.

### 2026-05-25 — CV13.E2.S5 preference coherence validated

Closed the CV13.E2 story arc with final multi-Mirror/preference coherence. The
web surface now validates end-to-end that Mirror switching, display name, avatar,
and theme preferences remain scoped to each active Mirror home. The Mirror menu
also reads each Mirror's web profile so the selector shows the user's chosen
display name and avatar while keeping the technical directory name as detail.

Validation: focused preference/mirror/web tests passed, ruff checks passed,
`node --check` passed, `git diff --check` passed, and Navigator browser
validation accepted the final cross-Mirror behavior and menu presentation.

### 2026-05-25 — CV13.E2.S4 theme preference validated

Added a Mirror-scoped theme preference to the local web surface. Preferences now
support `system`, `light`, and `dark`, serialize through `/api/shell`, persist in
`<mirror-home>/web/preferences.json`, and apply immediately through the document
root while leaving `system` delegated to the operating system color preference.

Validation: focused preference/web tests passed, ruff checks passed,
`node --check` passed, `git diff --check` passed, and Navigator browser
validation accepted dark, light, system, reload persistence, and per-Mirror
scoping.

### 2026-05-25 — CV13.E2.S3 profile preferences validated

Added a Preferences perspective scoped to the active Mirror. The page shows the
current Mirror context, local preference file path, and a small web-profile form
for display name and avatar symbol. Saved values are stored in
`<mirror-home>/web/preferences.json`, update the header, and remain separate per
Mirror without mutating structural identity.

Validation: focused preference/web tests passed, ruff checks passed,
`node --check` passed, `git diff --check` passed, and Navigator browser
validation accepted the page and storage boundary.

### 2026-05-25 — CV13.E2.S2 local Mirror switching validated

Completed safe local Mirror switching from the web selector. The browser submits
only a discovered Mirror name, the server validates that name against local
Mirror homes with `memory.db`, rejects path traversal and non-Mirror directories,
and reloads surfaces from the selected Mirror database for the running web
session.

Validation: focused web tests passed, ruff checks passed, `node --check` passed,
`git diff --check` passed, and Navigator browser validation confirmed switching,
active marker updates, content reload, no path input, and filtering.

### 2026-05-25 — CV13.E2.S1 mirror selector foundation validated

Started the `v0.12.0 — Multi-Mirror and Preferences` branch with a read-only
Mirror selector foundation. The web shell now discovers local Mirror homes near
the current Mirror boundary, shows the active Mirror as `◇ name (N)`, filters out
non-Mirror directories such as backups, and exposes discovery through `/api/shell`
and `/api/mirrors` without switching databases yet.

Validation: focused web tests passed, ruff checks passed, `node --check` passed,
`git diff --check` passed, and Navigator browser validation accepted the selector
copy, overlay behavior, outside-click close, lowercase label, and filtering.

### 2026-05-25 — v0.11.0 release candidate prepared

Prepared `v0.11.0 — Read-only Web Refinement` as the minor release candidate for
CV13.E1. The release packages the completed S1–S5 arc: Workspace-first shell,
three-letter persona tokens, memory category drilldown, read-only memory search,
and refined Workspace conversation cards.

This uses `v0.11.0` rather than the earlier `v1.1` planning label because CV9 has
not yet closed the first prospective major boundary. Under the versioning rule,
closing an epic before `v1.0.0` increments the current minor version.

### 2026-05-25 — CV13.E1.S5 conversation card refinement validated

Completed the fifth CV13.E1 read-only refinement story. Conversation cards in
Workspace now use a dedicated renderer with a prominent message-count chip,
short relative dates, persona and journey icon chips, and contextual icons that
prefer persona when present. Internal readiness metadata was removed from card
chips so the surface stays user-facing.

Validation: focused Workspace/web tests passed, `node --check` passed, `git diff
--check` passed, and Navigator browser validation accepted the card treatment.

### 2026-05-25 — CV13.E1.S4 search results page validated

Completed the fourth CV13.E1 read-only refinement story. The header search now
opens a read-only results page over recent retained memories, with lexical local
matching, honest empty states, browser Back behavior, full-width result cards,
and memory-card icons that prefer persona context when present before falling
back to the memory layer.

Validation: focused search/surface and web tests passed, `node --check` passed,
`git diff --check` passed, and Navigator browser validation accepted the search
page, card width, and icon behavior.

### 2026-05-25 — CV13.E1.S3 memory category drilldown validated

Completed the third CV13.E1 read-only refinement story. Identity memory category
cards now open a read-only category page backed by surface DTOs, showing recent
memories from the selected category with an honest empty state. The visual cue
uses count plus a low/medium/high presence chip rather than a progress bar, so
volume is represented without implying completion.

Validation: focused search/surface and web tests passed, `node --check` passed,
`git diff --check` passed, and Navigator browser validation accepted category
navigation, browser back behavior, and the presence chip treatment.

### 2026-05-25 — CV13.E1.S2 three-letter persona tokens validated

Completed the second CV13.E1 read-only refinement story. Persona tokens in the
Identity map now use stable three-letter tokens generated by the Atlas surface
read model, for example `Engineer` becomes `ENG` and `Product Designer` becomes
`PRO`, while the existing persona orbit and object-detail behavior remain
unchanged.

Validation: focused Atlas tests passed, ruff checks passed, `git diff --check`
passed, and Navigator browser validation accepted the result.

### 2026-05-25 — CV13.E1.S1 Workspace-first shell cleanup validated

Completed the first CV13 Mirror Web Experience story on the
`cv13/v1.1-read-only-web-refinement` branch. The web app now opens Workspace by
default, orders perspectives as Workspace, Identity, Docs, removes the redundant
perspective badge, removes task noise from Workspace, and gives Docs the same
contextual-bar rhythm as the other perspectives with its navigation inside the
main content frame.

Validation: focused web/surface tests passed, `node --check` passed, `git diff
--check` passed, and Navigator browser validation accepted the result.

### 2026-05-25 — CV13 Mirror Web Experience roadmap framed

Reframed CV13 from the older Mirror Web Console placeholder into **Mirror Web
Experience**, the staged post-1.0 web arc. The roadmap now organizes the
Navigator's web change observations into minor-release themes: read-only web
refinement, multi-Mirror selection and preferences, configuration console,
conversation intelligence, web operations runner, and the agentic web console as
the major-release horizon.

Also recorded the CV13 branch and cadence policy: development branches per minor
release, compressed Navigator intervention, automatic commit after an accepted
story, and automatic push when the next story starts. The Maestro overlay for the
`mirror-mind` journey now reflects the accepted-story push preference and carries
these cadence notes.

This planning keeps CV9.E6 as the completed read-only foundation and moves the
Agentic Web Console exploration out of radar-only status into CV13 without
pulling agent execution into the first implementation slice.

### 2026-05-25 — v0.10.17 release candidate prepared

Production validated `update my Mirror` routing. Prepared `v0.10.17 — Update
Notice Tone` to remove the yellow warning tone from new-version welcome
notifications. The welcome now prefixes available updates with ✨ and the Pi
extension sends the welcome notification as informational even when an update is
available.

### 2026-05-25 — v0.10.16 update-action routing validation stub prepared

Prepared `v0.10.16 — Update Action Routing Validation Stub` after production was
updated to v0.10.15. This minimal version/release-note release exists to test
whether the welcome action `update my Mirror` now invokes the safe runtime
updater directly in a live release-available state.

### 2026-05-25 — v0.10.15 release candidate prepared

Prepared `v0.10.15 — Update Action Routing` to publish the new `mm-update` skill
and documentation updates. The release makes the welcome action `update my
Mirror` route to the safe runtime updater instead of prompting for clarification
between code updates and identity/memory edits.

### 2026-05-25 — Update-my-Mirror routing prepared

Production validation showed the welcome action `update my Mirror` was still too
ambiguous for the agent: it asked whether to update code or identity instead of
running the safe runtime updater. Added an `mm-update` skill that routes natural
language update requests to `uv run python -m memory runtime update` and instructs
agents not to replace it with manual git or migration commands. Documented the
skill in AGENTS, command reference, and help.

### 2026-05-25 — v0.10.14 release candidate prepared

Production validated the full release-awareness cycle: welcome detected a new
stable version, `show pending release notes` rendered cumulative pending notes,
and `update my Mirror` updated the runtime. Prepared `v0.10.14 — Update Prompt
Wording` to replace the technical prompt with `what's new in this update?` while
keeping the same pending release-notes routing.

### 2026-05-25 — v0.10.13 pending-notes ref refresh validation stub prepared

Prepared `v0.10.13 — Pending Notes Ref Refresh Validation Stub` after production
was updated to v0.10.12. This minimal version/release-note release exists to
validate that `show pending release notes` now fetches stable and renders a newly
published release without manual git commands.

### 2026-05-25 — v0.10.12 release candidate prepared

Prepared `v0.10.12 — Pending Release Notes Ref Refresh` to publish the fix for
stale local stable refs in `runtime release-notes pending`. The command now
safely fetches remote-tracking refs before rendering pending notes, with
`--no-fetch` available for local `HEAD` smoke tests. The release also includes
welcome tag matching for short remote commits.

### 2026-05-25 — Pending release notes ref refresh prepared

Production validation of v0.10.11 showed the welcome prompt and skill routing now
work, but `runtime release-notes pending` returned none because it read the local
`origin/stable` ref while welcome had detected the newer remote stable commit
without fetching. Prepared a fix so pending release notes safely fetch
remote-tracking refs before rendering. Also adjusted welcome tag resolution so a
short remote commit from update awareness can match full tag hashes and show the
version label instead of `on stable`.

### 2026-05-25 — v0.10.11 pending-notes validation stub prepared

Prepared `v0.10.11 — Pending Notes Prompt Validation Stub` after production was
updated to v0.10.10. This minimal version/release-note release exists to test the
new final-user flow: opening production Mirror should detect v0.10.11, suggest
`show pending release notes`, and that question should render cumulative pending
release notes instead of git status.

### 2026-05-25 — v0.10.10 release candidate prepared

Prepared `v0.10.10 — Pending Release Notes Prompt` to publish the welcome prompt
and release-notes skill routing change. The release changes the update guidance
from ambiguous `what changed?` wording to `show pending release notes`, and maps
newly available-version questions to `runtime release-notes pending` so users see
the cumulative path from their installed version to stable.

### 2026-05-25 — Welcome update prompt routed toward cumulative notes

Production validation confirmed v0.10.8 release awareness works: opening Mirror
on v0.10.8 showed `New Version Available: v0.10.9` without manual update-check,
fetch, or cache commands. The suggested prompt `what changed?`, however, was too
ambiguous and the agent interpreted it as a working-tree/git question.

Changed welcome guidance to suggest `show pending release notes`, and updated the
`mm-release-notes` skill so questions about the newly available version prefer
`runtime release-notes pending`. The pending view is the correct final-user
answer because it includes every release between the installed version and the
current stable release.

### 2026-05-25 — v0.10.9 release-awareness validation stub prepared

Prepared `v0.10.9 — Release Awareness Validation Stub` after production was
confirmed on `v0.10.8`. This is intentionally a minimal version/release-note
release with no functional runtime changes, so production can validate whether
opening Mirror detects a newly published stable release after the v0.10.8 welcome
cache fix.

### 2026-05-25 — v0.10.8 release candidate prepared

Prepared `v0.10.8 — Welcome Release Awareness` after production validation
showed `runtime update --check` could detect a new stable release while opening
Mirror did not show it. Root cause: a fresh cached `up_to_date` welcome awareness
entry was trusted for the TTL. Stable-channel welcome now refreshes both
`up_to_date` and `update_available` cache entries so newly published stable
releases can appear on open without manual cache or git commands.

Validation: focused welcome tests passed; ruff lint and format checks passed;
`git diff --check` passed.

### 2026-05-25 — v0.10.7 release candidate prepared

Prepared `v0.10.7 — Runtime Operations Documentation` to publish the updater and
release-management documentation coherence work. Bumped package version to
`0.10.7`, added `docs/releases/v0.10.7.md`, and linked it from the release
index.

### 2026-05-25 — Runtime update and release-management docs reconciled

Audited the command reference, release-notes process doc, troubleshooting guide,
runtime repair policy, docs index, and top-level runtime help against the current
updater/release-management command surface. Documented `release-notes pending
[--from] [--ref]`, `release-doctor --stable`, `release-promote --stable --remote
--dry-run --push`, `runtime version --start --channel`, updater repair, and the
v0.10.6 database-unavailable status recovery behavior. Troubleshooting now treats
`unable to open database file` during update as a product resilience path rather
than normal user manual repair.

### 2026-05-25 — v0.10.6 release candidate prepared

Production update to `v0.10.5` exposed a final-user resilience issue: when
runtime status reports `unable to open database file`, the updater blocks at the
status gate and tells the user to run a recovery command. This is too likely when
local Mirror surfaces have recently used the production database.

Prepared `v0.10.6 — Update Status Recovery`: runtime update now detects database
unavailable status-gate failures, attempts the safe `MemoryClient` bootstrap
that previously fixed the issue manually, rebuilds status, and continues if the
runtime becomes ready. The same recovery is applied to post-update status.
Recovery guidance now uses `uv run python -m memory ...`.

Validation: focused runtime tests passed; ruff lint and format checks passed;
`git diff --check` passed.

### 2026-05-25 — v0.10.5 release candidate prepared

Prepared `v0.10.5 — Cumulative Release Notes` after adding
`runtime release-notes pending`. The command lists every release newer than the
current runtime version, supports `--from <version>` for explicit comparisons,
and supports `--ref <git-ref>` for reading notes from a selected source such as
`origin/stable` or `HEAD`.

Validation: focused runtime CLI tests passed; ruff lint and format checks passed;
`node --check .pi/extensions/mirror-logger.ts` passed; `git diff --check` passed;
smoke CLI confirmed `pending --from 0.10.2 --ref HEAD` renders v0.10.3 and
v0.10.4, while current-version pending renders none.

### 2026-05-25 — Pi response counter root cause narrowed

After `v0.10.4`, production and mirror-dev still showed the counter continuing.
Reading Pi's source clarified the remaining issue: `AgentSession._handleAgentEvent`
awaits extension `agent_end` handlers before emitting `agent_end` to the
interactive UI. The UI only stops the working loader/counter in its own
`agent_end` handler. Therefore any blocking Mirror work inside the extension's
`agent_end` handler keeps Pi visually "working" even after the model response is
complete.

Mirror's `agent_end` handler was awaiting `conversation-logger log-assistant`.
Changed assistant logging to detached fire-and-forget, like startup maintenance,
so Pi can receive `agent_end` immediately and stop the counter while memory
persistence continues in the background.

### 2026-05-25 — v0.10.4 release candidate prepared

Production validation of `v0.10.3` confirmed Mirror now opens quickly, but Pi's
startup counter still does not stop. This narrows the remaining issue from
Python maintenance cost to extension lifecycle semantics.

Prepared `v0.10.4 — Pi Startup Lifecycle`: startup maintenance is now launched
as a fully detached fire-and-forget process with ignored stdio and `unref()`,
redirecting output to `mirror-logger.log`. This avoids keeping stdout/stderr
pipes or child close handlers attached to Pi's startup lifecycle.

### 2026-05-25 — v0.10.3 release candidate prepared

Prepared `v0.10.3 — Pi Startup Maintenance` as a patch release candidate after
production validation confirmed conversation maintenance was blocking Pi startup.
Bumped package version to `0.10.3`, added `docs/releases/v0.10.3.md`, and listed
it in the release index.

Release-note smoke renders `v0.10.3` correctly. Validation: 142 focused tests
passed; ruff lint and format checks passed; `node --check
.pi/extensions/mirror-logger.ts` passed; `git diff --check` passed.

### 2026-05-25 — Pi startup maintenance moved to background

Production validation showed Pi startup remained slow and the visible counter
kept running while Mirror performed startup maintenance. The slow path is the
conversation maintenance work, not the release check: session maintenance can
close stale conversations, backfill Pi JSONL sessions, and extract pending
conversations, which may call LLMs.

Added a fast startup path for Pi: `conversation-logger session-start --fast`
unmutes logging and returns immediately. The Pi extension now opens with the
fast path, renders welcome/status, and starts `conversation-logger
session-maintenance` in the background with per-step timing logged when it
finishes. The original `session-start` command remains available for runtimes or
manual use that want blocking maintenance.

Validation: focused conversation logger tests passed; ruff lint and format
checks passed; `node --check .pi/extensions/mirror-logger.ts` passed; `git diff
--check` passed. Manual timing confirmed the blocking maintenance path can exceed
120 seconds on the current personal Mirror, justifying the background split.

### 2026-05-25 — v0.10.2 release candidate prepared

Prepared `v0.10.2 — Fresh Release Awareness` as a patch release candidate after
production validation showed a fresh welcome cache pinned the visible update
notice to `v0.10.0` even after stable advanced to `v0.10.1`. The fix refreshes
visible `update_available` cache entries before rendering while keeping
`up_to_date` cache entries cheap.

Bumped package version to `0.10.2`, added `docs/releases/v0.10.2.md`, and listed
it in the release index. Validation: 122 targeted welcome/runtime tests passed;
ruff lint and format checks passed; `git diff --check` passed.

### 2026-05-25 — v0.10.1 release candidate prepared

Prepared `v0.10.1 — Welcome Startup Clarity` as a patch release candidate after
production validation of v0.10.0. Bumped package version to `0.10.1`, added
`docs/releases/v0.10.1.md`, and listed it in the release index.

Release-note smoke renders `v0.10.1` correctly. Validation: targeted welcome
checks passed; ruff lint and format checks passed; `node --check
.pi/extensions/mirror-logger.ts` passed; `git diff --check` passed.

### 2026-05-25 — Welcome update notice wording and startup status improved

Production validation after publishing v0.10.0 showed two welcome UX frictions:
Pi could spend noticeable time in startup work without saying what it was doing,
and the update notice wording was too operational. Pi now sets an immediate
status message while checking sessions/memories and another while checking
release status. The welcome now says `New Version Available` instead of `Update
available`, and Pi renders that welcome as a warning-level notice for stronger
visual emphasis.

Validation: targeted welcome tests passed; ruff lint and format checks passed;
`git diff --check` passed.

### 2026-05-25 — v0.10.0 release candidate prepared

Prepared `v0.10.0 — Web Visibility` as the minor release candidate for the
completed CV9.E6 epic. Bumped package version to `0.10.0`, added
`docs/releases/v0.10.0.md`, and listed it in the release index.

Release-note smoke renders `v0.10.0` correctly. `runtime release-doctor --target
v0.10.0` passes repository, version, release note, heading, and release index
checks, while correctly failing on the dirty tree until the release candidate
commit is made. Validation: 183 targeted tests passed; ruff lint and format
checks passed; `node --check src/memory/web/static/app.js` passed; `git diff
--check` passed.

### 2026-05-25 — CV9.E6 Web Visibility validated and closed

Completed CV9.E6.S6 and closed the Web Visibility epic. The read-only web
surface now has a validated Identity perspective, shared object detail and
Source Context, and a journey-centric Workspace perspective.

Personal Mirror validation first exposed a release-blocking data-truth issue:
Workspace was rendering the database correctly, but recent Pi Builder
conversations were missing journey associations. After the core fix and
backup-gated historical repair, Navigator visual validation confirmed that
Workspace now reflects Mirror Mind, Maestro, and other journeys correctly.

Validation: 62 focused tests passed; ruff lint and format checks passed;
`node --check src/memory/web/static/app.js` passed; `git diff --check` passed;
Navigator browser validation accepted the repaired Workspace state.

### 2026-05-25 — Pi Builder journey association repaired

During CV9.E6.S6 personal Mirror validation, Workspace revealed a data-truth
bug: recent Pi Builder sessions were logged with messages but without journey
association, so active journeys such as Mirror Mind and Maestro appeared stale
or empty.

Fixed the core conversation logger so SKILL.md commands without an explicit
session id fall back to the latest active runtime session, and Pi user-message
logging refreshes runtime session activity. Added an explicit repair command,
`conversation-logger repair-journeys [--limit N] [--apply]`, with dry-run
review and backup-gated apply for historical conversations.

Applied the repair to the personal Mirror after backup
`memory_20260525_083122.zip`: 45 high-confidence conversations were associated
with journeys, the active validation conversation was attached to `mirror-mind`,
and the `mirror-mind` journey identity was restored to active so Workspace can
list it. Post-repair Workspace selects Mirror Mind and shows recent
conversation cards; Maestro now shows its recent conversations.

Validation: 62 focused tests passed; ruff lint and format checks passed;
`node --check src/memory/web/static/app.js` passed; `git diff --check` passed.

### 2026-05-24 — Journey-centric Workspace dashboard added

Completed CV9.E6.S5. Workspace now opens as a journey-centric operational surface rather than a generic stacked dashboard. The left side shows active journeys ordered by most recent activity; the central area shows the selected journey as a profile-style workspace with Briefing, Conversations, Tasks, Memories, and Decisions tabs.

The selected journey defaults to the most recently worked active journey based on recent conversations, memories, and tasks, and can be changed through the journey sidebar. The Briefing tab renders the real journey identity content as formatted Markdown-like text. Decisions are shown as journey-filtered decision memories when available, with honest empty states otherwise.

Validation: `uv run pytest tests/unit/memory/surfaces tests/unit/memory/web tests/unit/memory/test_public_api.py` passed with 40 tests; Ruff lint and format checks passed; `node --check src/memory/web/static/app.js` passed; manual browser review accepted the Workspace direction.

### 2026-05-24 — Object detail and source context added

Completed CV9.E6.S4. The Identity Map now drills into supported objects through a shared read-only detail view. Self, Ego, Shadow, and personas open into a common page with summary, rendered Markdown-like content, Source context, Related links, and metadata.

The public language moved from technical evidence/provenance affordance to **Source Context**. Identity and persona details show explicit source paths such as `identity/self/soul` or `persona/engineer` and state when content is not inferred from memories. Shadow can open as an honest placeholder when no explicit shadow entry exists. Persona detail titles and icons now use product labels rather than legacy headings inside persona content.

Validation: `uv run pytest tests/unit/memory/surfaces tests/unit/memory/web tests/unit/memory/test_public_api.py` passed with 37 tests; Ruff lint and format checks passed; `node --check src/memory/web/static/app.js` passed; manual browser review accepted the detail experience.

### 2026-05-24 — Agentic web console idea captured

During CV9.E6 web visibility work, captured a future product direction: a browser-based agentic console where users express Mirror update intent in natural language, a headless agent proposes or performs controlled operations, and the browser shows the run timeline, approvals, and evidence.

Created `docs/product/envisioning/agentic-web-console.md` and added the idea to the roadmap radar. This is explicitly outside the current read-only web visibility scope. It should graduate only after the basic visibility foundation is useful and stable.

No runtime behavior changed.

### 2026-05-24 — Identity Map page validated

Completed CV9.E6.S3, renamed from Atlas Identity and Persona Map to **Identity Map Page** after product review clarified that the whole map is an identity surface. The public UI now labels the perspective as Identity while the internal `atlas` route remains stable.

The page renders a reflective map of Self, Ego, Shadow, Personas, and Memories. Self is scoped to `self/soul` and shown as Alma with Purpose/Principles/Values. Ego is Expression with Self-image/Behavior/Constraints. Shadow is Tension with integration-oriented chips. Personas are presented as a social/action team of persona initials and names. Memories are presented as category counts with proportional bars rather than individual memory records.

This matters because the web surface moved from a database-shaped card grid toward a product-shaped identity map. The story also clarified an important taxonomy boundary: the identity table is a broad context registry, not the same thing as Self.

Validation: `uv run pytest tests/unit/memory/surfaces tests/unit/memory/web tests/unit/memory/test_public_api.py` passed with 35 tests; Ruff lint and format checks passed; Navigator browser review accepted the Identity Map page direction.

### 2026-05-24 — Web perspective shell added

Completed CV9.E6.S2 for the local web visibility track. The web app now has a shared shell for Atlas, Workspace, and Docs; a discreet perspective switcher; user-home default perspective persistence in `web/preferences.json`; and shell/surface APIs for Atlas and Workspace. Atlas and Workspace render initial read-only content from `MemoryClient.surfaces`, while Docs remains available as a dedicated mode with the documentation sidebar.

Navigator browser review corrected the shell boundary: the large first-run chooser was removed from the main experience, perspective tabs were made compact, Atlas/Workspace use full viewport width, and the docs sidebar appears only in Docs mode. Deeper Atlas home design is deferred to S3; Workspace dashboard design is deferred to S5.

Validation: `uv run pytest tests/unit/memory/web tests/unit/memory/surfaces tests/unit/memory/test_public_api.py` passed with 35 tests; Ruff lint and format checks passed for web code.

### 2026-05-24 — Web Surface Foundation implemented

Completed CV9.E6.S1 for the local web visibility track. Added `src/memory/surfaces/` as the read-model boundary between web routes and Mirror Core services, with typed DTOs for Atlas, Workspace, object detail, evidence, and search. `MemoryClient` now exposes `mem.surfaces` so future web routes can consume UI-shaped read models without querying SQLite directly or composing domain meaning inline.

The first slice intentionally stays architectural: Atlas and Workspace surfaces return deterministic read models with honest empty states, identity/persona object details are supported, evidence exposes an explicit no-provenance state, and search has a stable skeletal contract. Full UI routing, perspective persistence, and richer evidence remain in later CV9.E6 stories.

Validation: `uv run pytest tests/unit/memory/surfaces tests/unit/memory/web tests/unit/memory/test_public_api.py` passed with 27 tests; Ruff lint and format checks passed for the surface layer and client integration; Navigator manual contract review accepted the boundary.

### 2026-05-23 — v0.9.1 release candidate prepared

Prepared `v0.9.1 — Welcome Release Awareness` as a patch release candidate for S18. Bumped package version to `0.9.1`, added `docs/releases/v0.9.1.md`, and listed it in the releases index.

Release-note smoke renders `v0.9.1` as latest. `runtime release-doctor --target v0.9.1` passes version, release note, heading, and release index checks, while correctly failing on the dirty tree until the release candidate commit is made. Validation: 121 targeted welcome/runtime tests passed; ruff, format check, story-scoped mypy, and `git diff --check` passed.

### 2026-05-23 — Welcome and status release awareness added

Completed CV9.E3.S18. Welcome now has network-tolerant release awareness: it reads and writes `<mirror-home>/runtime/update-check.json`, may refresh stale or missing cache with a lightweight `git ls-remote` check, never fetches or mutates refs, and fails softly when the remote is unavailable. Remote welcome checks can be disabled with `MIRROR_WELCOME_REMOTE_UPDATE_CHECK=off`.

Added `python -m memory welcome --status-line` for compact cache-only runtime status. Pi's `mirror-logger` status bar now uses this command, producing signals such as `◇ alisson-vale · ✓` or `◇ alisson-vale · ⬆ v0.9.0` while keeping detailed explanation in the welcome card.

Validation: 121 targeted welcome/runtime tests passed; ruff, format check, story-scoped mypy, and `git diff --check` passed.

### 2026-05-23 — v0.9.0 stable release published and fresh-user update smoke passed

Published `v0.9.0 — Self-Update Done` to the stable channel. `runtime release-promote --target v0.9.0 --push` pushed both `refs/tags/v0.9.0` and `refs/heads/stable` to commit `fac6da3`.

Ran a fresh-user stable update smoke from a temporary clone pinned at `v0.8.0` with an isolated Mirror home. The clone detected `origin/stable @ fac6da3`, dry-run planned a pull of 8 commits, and `runtime update` fast-forwarded from `4bdff1b` to `fac6da3` with backup, verification, migrations, and post-update status all passing. Post-update `runtime version` reported `0.9.0`, `runtime status` was ready, and `runtime release-notes latest` rendered `v0.9.0 — Self-Update Done`.

This closes CV9.E3's Self-Update Done track. The stable update path has now been validated from one published stable release to the next without manual git intervention in the smoke clone.

### 2026-05-23 — v0.9.0 release candidate prepared

Prepared `v0.9.0 — Self-Update Done` as the release candidate for the CV9.E3 S13–S17 arc. Bumped package version to `0.9.0`, added `docs/releases/v0.9.0.md`, and listed the release in `docs/releases/index.md`.

Release-note smoke renders `v0.9.0` as latest. `runtime release-doctor --target v0.9.0` now passes version, release note, heading, and release index checks, while correctly failing on the dirty tree until the release candidate commit is made. Tag creation and stable promotion remain next steps after commit and final validation.

Validation: 98 targeted runtime tests passed; ruff, format check, story-scoped mypy, and `git diff --check` passed.

### 2026-05-23 — Stable promotion execution path added

Completed CV9.E3.S16. Added `python -m memory runtime release-promote --target vX.Y.Z [--dry-run] [--push]` as the controlled stable promotion path. Promotion runs the release doctor first and blocks on failures, creates a missing release tag at `HEAD`, reuses tags already at `HEAD`, refuses mismatched tags, creates or fast-forwards local `stable` only when safe, and publishes only when `--push` is explicit.

Dry-run does not mutate tags, branches, refs, or files. The command does not fetch, force-push, rewrite tags, bump versions, write release notes, back up, migrate, or update production clones.

Validation: 98 targeted runtime tests passed; ruff, format check, story-scoped mypy, and `git diff --check` passed. Manual dry-run in the dirty dev clone failed safely because `v0.9.0` is not prepared; no tags or branches were created.

### 2026-05-23 — Release promotion doctor added

Completed CV9.E3.S15. Added `python -m memory runtime release-doctor --target vX.Y.Z` as a read-only release promotion preflight. The doctor checks repository availability, clean git state, package version, release-note file, release-note heading, release index link, tag state, and stable ref relationship, then renders a pass/warn/fail checklist.

The command does not fetch, tag, merge, push, edit files, back up, migrate, or modify refs. Warnings return zero because a pre-promotion candidate may legitimately lack a tag or stable advancement; failures return non-zero for incoherent or unsafe states.

Validation: 90 targeted runtime tests passed; ruff, format check, story-scoped mypy, and `git diff --check` passed. Manual smoke in the dirty dev clone showed expected read-only failures for unprepared `v0.9.0` and historical `v0.8.0` tag mismatch against current `HEAD`.

### 2026-05-23 — Release-note skill parity completed

Completed CV9.E3.S14. Release notes are now discoverable across supported runtime skill surfaces: Pi keeps `/mm-release-notes`, Gemini/Codex shared skills expose `mm-release-notes` through `.agents/skills`, and Claude Code has `/mm:release-notes`. Help surfaces, `AGENTS.md`, and `REFERENCE.md` now list the command.

No runtime core behavior changed. The skills remain thin wrappers around `uv run python -m memory runtime release-notes [latest|vX.Y.Z]` and preserve the rule to show output verbatim unless the user asks for a summary.

Validation: structural skill checks passed; `runtime release-notes latest` and `runtime release-notes v0.8.0` both rendered `v0.8.0 — Stable Self-Update Foundation`; 82 targeted runtime tests passed; ruff, format check, and `git diff --check` passed.

The Ariad visualization experiment adopted the inline taxonomy-card grammar: `🟪[CV9]`, `🟦[E3]`, `🟩[S14]`, with method state shown separately through `✓`, `◉`, `○`, and `✕`.

### 2026-05-23 — Release-aware stable update notices added

Completed CV9.E3.S13. Stable-channel update surfaces now prefer release language when local refs contain newer release notes: dry-run can show the target release version, title, digest, and preview/update commands, while successful stable updates include an `Installed release` block after fast-forward. `runtime update --check` remains conservative and non-mutating: it can report an available remote commit through `git ls-remote`, but it does not fetch release-note files and says so when details are unavailable.

Commit-oriented summaries remain as fallback, especially for `main` dogfooding. The updater safety pipeline is unchanged: status gate, backup, verification, fast-forward-only update, migrations, and post-update status still govern mutation.

Validation: 99 targeted runtime and welcome tests passed; ruff, format check, story-scoped mypy, and `git diff --check` passed. Manual smoke in the dev clone confirmed the expected safety boundary (`stable` is `local_ahead`; dry-run is blocked by the dirty dev tree), so end-to-end stable update validation remains for CV9.E3.S17.

Also recorded an Ariad/Maestro visualization experiment for the story. The next visualization cycle should add a bird's-eye `CV → Epic → Story` map and a horizontal board to show cards moving through flow lanes.

### 2026-05-22 — Next release target defined: v0.9.0 Self-Update Done

After publishing `v0.8.0 — Stable Self-Update Foundation`, defined the next release target as `v0.9.0 — Self-Update Done`. The intended scope is CV9.E3.S13–S17: release-aware update notices, release-note skill parity, release promotion preflight/doctor, controlled stable promotion path, and fresh-user stable update smoke.

Updated the `mirror-mind` journey path in the memory database so a future session can resume directly at CV9.E3.S13.

### 2026-05-22 — v0.8.0 stable release published

Published `v0.8.0 — Stable Self-Update Foundation` as the first prospective stable-channel release. Release commit `4bdff1b` was tagged as `v0.8.0` and `origin/stable` was fast-forwarded to the same commit. CI was green before tagging and promotion.

The Navigator manually updated the production clone (`~/mirror`) through the documented stable self-update route. All validation commands succeeded: runtime version, update check, update execution, runtime status, release notes latest, and welcome. Production now confirms version `0.8.0`, update channel `stable`, ready status, and release notes for `v0.8.0`.

### 2026-05-22 — v0.8.0 release candidate prepared

Prepared the first prospective stable-channel release candidate: `v0.8.0 — Stable Self-Update Foundation`. Bumped `pyproject.toml` to `0.8.0`, created `docs/releases/v0.8.0.md`, and added the release to `docs/releases/index.md`.

This release candidate packages the self-update foundation: runtime health, diagnosis, backup, dry-run, update check, safe update execution, updater self-recovery, stable/main channels, welcome version visibility, and runtime release-note access.

### 2026-05-22 — Self-Update Done track opened

Reframed CV9.E3 Distribution & Tooling around the Self-Update Done track. Completed self-update mechanism work now leads into the remaining release-management stories: first stable release publication, release-aware update notices, release-note skill parity, promotion preflight/doctor, stable promotion execution path, and fresh-user stable update smoke.

Opened CV9.E3.S12 First Stable Release Publication with plan and test guide. Proposed release: `v0.8.0 — Stable Self-Update Foundation`.

### 2026-05-22 — Stable channel operations documented

Created `origin/stable` at the validated `6c58e9c` baseline and switched the production clone's update channel to `stable`. `runtime update --check` now reports `origin/stable @ 6c58e9c` and `Availability: up_to_date` in production.

Expanded `REFERENCE.md` with practical channel commands: switch to stable, switch to main, remove the marker, and understand why `Git branch: main` may coexist with `Update channel: stable`. Added troubleshooting entries for missing/unfetched stable channels, older versions treating `.mirror-update-channel` as a dirty file, unexpected main channel display, and missing release notes before the first prospective release.

### 2026-05-22 — Stable/main release channels added

Added local update channel support through `.mirror-update-channel`. Missing or invalid channels default to `stable`; `main` is the integration/dogfooding channel. Runtime status, version, update check, dry-run, update execution, updater repair, and welcome can now surface or use the configured channel.

Added `python -m memory runtime release-notes [latest|vX.Y.Z]` plus the `mm-release-notes` skill so users can ask Mirror: "What's new in the latest Mirror Mind release?" without knowing the underlying CLI command.

Documented the release-management boundary: pushes to `main` are integration, while `stable` advances only through release promotion after versioning, release notes, CI, smoke validation, tagging, and fast-forward.

### 2026-05-22 — Updater self-recovery added

Added a code-only updater repair lane for the case where `runtime update` cannot complete its full status gate because stale updater code crashes before planning. `runtime update` now catches status-gate crashes and falls back automatically; `runtime update --repair-updater` exposes the lane explicitly.

The repair lane uses a minimal safety gate: clean git tree, configured upstream, optional fetch, fast-forward only, optional database backup when the Mirror home and database are available, and migrations skipped. Successful repair prints the next step: rerun `python -m memory runtime update` with the repaired updater.

Verification:

```bash
PYTHONPATH=src uv run pytest tests/unit/memory/cli/test_welcome.py tests/unit/memory/cli/test_runtime.py tests/unit/memory/cli/test_build.py tests/unit/memory/extensions/test_migrations.py
uv run --extra dev ruff check src/ tests/
uv run --extra dev ruff format --check src/ tests/
uv run --extra dev mypy src/memory/cli/runtime.py
```

### 2026-05-22 — Welcome version and update UX added

Added installed version visibility to `python -m memory welcome`. The welcome now shows `Version <version>` and, when local git refs already show the checkout is behind upstream, renders a no-network update notice that points to `runtime update`.

Enhanced `python -m memory runtime update` so successful installs that move to a new commit include an `Installed changes` summary from `git log <previous>..<new>`. This gives the user a compact post-install explanation even before formal release notes exist for every update.

While applying the change to production, the previous self-update command exposed a status robustness bug: extension health inspection could raise `sqlite3.OperationalError` instead of reporting an attention-needed extension health state. The runtime status path now converts extension database table inspection failures into explicit extension health notes.

Verification:

```bash
PYTHONPATH=src uv run pytest tests/unit/memory/cli/test_welcome.py tests/unit/memory/cli/test_runtime.py
uv run --extra dev ruff check src/ tests/
uv run --extra dev ruff format --check src/ tests/
uv run python -m memory welcome --mirror-home /Users/alissonvale/.mirror-minds/alisson-vale
```

### 2026-05-24 — CV9.E6 Web Visibility roadmap created

Added CV9.E6 as the roadmap epic for the Mirror Mind 1.0 web visibility surface. The epic is Ariad-compatible, with six planned stories covering the Web Surface foundation, perspective shell, Atlas identity/persona map, object detail and evidence, Workspace dashboard, and personal Mirror validation. Updated the CV9 and roadmap indexes so the new work is integrated with the existing 1.0 plan.

### 2026-05-24 — Web docs browser opens on docs home

Adjusted the local web docs browser so a session without an explicit `?path=` opens on `docs/index.md` instead of the first alphabetic document. Moved the Python API reference to `docs/product/api.md` and the architecture reference to `docs/product/architecture.md`, then linked both from Product so the web navigation groups Mirror Core product surfaces together. Verified with `uv run pytest tests/unit/memory/web`.

### 2026-05-22 — Documentation information architecture updated

Completed CV9.E5.S2 using Ariad's documentation pattern as the reference: short narrative home, explicit Start Here paths, and the Process / Project / Product triad with a practical Reference layer. `docs/index.md` now routes new users, operators, contributors, and developers to the right surfaces.

Made a conservative pre-1.0 decision not to move files only for symmetry. `docs/releases/`, architecture and Python API references, and operations docs under `docs/process/` remain in explicit reader paths. Added a worklog scaling rule: keep a single file through 1.0, then archive by release or year if needed.

### 2026-05-22 — CV9.E3 closed and CV9.E5.S2 opened

Closed CV9.E3 Distribution & Tooling in the roadmap after completing the full runtime update path: status, diagnosis, backup, version inspection, update availability, dry-run planning, clone role guard, and safe update execution.

Opened CV9.E5.S2 Documentation Information Architecture with a plan and test guide. The story will turn the docs home into a clearer entry point and make runtime operation, project history, process guidance, product docs, and developer references easier to navigate before 1.0.

### 2026-05-22 — Safe runtime update execution added

Added `python -m memory runtime update` as the first mutating self-update command. Execution runs as an ordered pipeline of explicit stages: status gate, fetch upstream, plan, database backup, backup verification, fast-forward only git merge, migrations through a one-shot `MemoryClient` open, and post-update status check. The first failure stops the pipeline and prints a recovery block with the backup path and previous commit when applicable.

Flags: `--no-fetch` skips network and plans from local refs only; `--skip-migrations` applies code without opening the database. `--dry-run` and `--check` remain read-only.

Verification:

```bash
PYTHONPATH=src uv run pytest tests/unit/memory/cli/test_runtime.py tests/unit/memory/cli/test_build.py tests/unit/memory/extensions/test_migrations.py
uv run --extra dev ruff check src/ tests/
uv run --extra dev ruff format --check src/ tests/
```

Result: 85 targeted tests passed. Static checks clean.

### 2026-05-22 — Clone role guard added

Introduced an explicit clone role marker (`.mirror-clone-role`) at the repository root, with values `production` and `dev`. Default is `production` when the file is missing, unreadable, or unknown. `runtime status` and `runtime version` now report the clone role on a dedicated line. `python -m memory build load <slug>` refuses to start Builder Mode in clones marked `production`, exiting with a clear message and an override hint. The override is `--ignore-production-role`, which proceeds with a visible warning to the user.

This matters because development work had been landing in the production clone (`~/mirror`) by accident, with no signal to the user. The role marker, the runtime surfaces, and the Builder Mode guard turn the production/dev boundary into something the system enforces instead of something humans must remember.

Verification:

```bash
PYTHONPATH=src uv run pytest tests/unit/memory/cli/test_runtime.py tests/unit/memory/cli/test_build.py
uv run --extra dev ruff check src/ tests/
uv run --extra dev ruff format --check src/ tests/
uv run python -m memory runtime status
uv run python -m memory build load mirror-mind
```

Result: targeted runtime and build tests pass. Manual smoke confirms the dev clone reports `Clone role: dev` and Builder Mode proceeds; flipping the marker to `production` and rerunning `build load` exits with the expected refusal; `--ignore-production-role` overrides with a visible warning.

### 2026-05-22 — Runtime version and update availability added

Added `python -m memory runtime version` for offline local version visibility and `python -m memory runtime update --check` for explicit remote update discovery. The check uses the configured upstream branch and `git ls-remote`, so it may contact the network but does not fetch, pull, change refs, create backups, run migrations, or touch the database.

Verification:

```bash
PYTHONPATH=src uv run pytest tests/unit/memory/cli/test_runtime.py tests/unit/memory/extensions/test_migrations.py
uv run python -m memory runtime version
uv run python -m memory runtime update --check
```

Result: targeted tests passed. Manual check reported the local runtime up to date with `origin/main`.

### 2026-05-22 — Runtime drift diagnosis and local repair policy added

Integrated the local drift reconciliation work on top of the remote self-update track. `python -m memory runtime diagnose` now classifies repository drift, unknown core migration rows, unknown extension migration rows, pending migrations, checksum drift, and invalid extension manifests into repair-oriented findings without mutating files or the database.

Added `docs/process/runtime-repair-policy.md` and ignored `pi_exports/` so Pi `/export` HTML files can be preserved locally without dirtying the repository. The policy distinguishes Pi's resumable JSONL sessions under `~/.pi/agent/sessions/` from derived HTML exports, and requires backup before any database mutation.

Verification: focused runtime and extension migration tests passed. Local production database drift was repaired under backup before this integration: obsolete personal core migration rows were removed, the retired pre-Ariad Maestro migration row was removed, and the retired `ext_maestro_check_runs` table was dropped.

### 2026-05-22 — Runtime backup and recovery prerequisite added

Added `python -m memory runtime backup` and `python -m memory runtime backup --verify PATH` as the backup/recovery prerequisite for future self-update execution. Runtime backup reuses the existing database backup implementation, structurally verifies the resulting archive, and prints the manual recovery route without restoring files automatically.

Verification checks that backup archives are readable zip files, contain `memory.db`, include only safe relative entries, and reject missing, malformed, or unsafe archives. Recovery remains manual by design in this story.

Verification: focused runtime and backup tests passed, ruff check and format check passed, story-scoped mypy passed for `src/memory/cli/runtime.py`, and isolated manual validation used a temporary Mirror home.

### 2026-05-22 — Runtime update dry-run added

Added `python -m memory runtime update --dry-run` as the planning step before any self-update execution. The command reuses runtime status as its safety gate, inspects the local branch's configured upstream without fetching or mutating refs, and reports whether the runtime is already up to date, behind upstream, ahead of upstream, diverged, missing an upstream, or blocked by unsafe current state.

The dry-run is intentionally non-mutating: it does not fetch, pull, back up, migrate, or edit files. It emits the backup and validation steps that a future real update must perform.

Verification: focused runtime tests passed, ruff check and format check passed, and story-scoped mypy passed for `src/memory/cli/runtime.py`. Manual validation confirmed the dirty-tree gate blocks update planning as expected.

### 2026-05-22 — Runtime status health checks added

Expanded `python -m memory runtime status` with read-only health checks for core database migrations and installed extensions. The command now reports whether the core `_migrations` ledger is current against known migrations and whether installed extensions have valid manifests, pending command-skill migrations, or checksum drift in applied migration files.

This keeps the self-update path conservative: status observes the runtime without applying migrations, repairing extensions, or mutating the database. Future update dry-runs can now start from a stronger current-state diagnosis.

Verification: 1073 tests passed; ruff check and format check passed; story-scoped mypy passed for changed modules; `git diff --check` passed. `mypy src/memory` still fails on pre-existing typing debt in unrelated modules.

### 2026-05-22 — Runtime status command added

Added `python -m memory runtime status` as the first self-update prerequisite. The command is read-only and reports Mirror version, repository path, git branch, commit, dirty tree state, mirror home, database path, installed extensions, Python version, and `MEMORY_ENV`.

This matters because self-update work must start from a known state. A dirty tree, missing mirror home, missing database, or non-git checkout now surfaces as `Status: attention needed` before any update mechanism exists.

Verification:

```bash
uv run pytest tests/unit/memory/cli/test_runtime.py tests/unit/memory/test_main.py
uv run python -m memory runtime status
```

Result: 14 targeted tests passed. Manual status returned `attention needed` while the working tree was dirty, as expected.

### 2026-05-19 — CV9.E5.S1 complete: Development process and prospective versioning

Adopted the Mirror Mind development process and prospective versioning model.
The process guide now uses Driver/Navigator as the structural collaboration
model, explicitly connects it to XP pair programming, adds Engineering Lineage,
WIP discipline, discovery/envisioning work, manual Navigator validation, push
policy, and PR guidance.

Created process docs for the process/project/product triad, expand/collapse,
versioning, release notes, and prospective release documentation. Versioning is
prospective from CV9.E5 onward: historical versions through `v0.7.0` remain
historical and are not reinterpreted; CV9 completion may become the first
prospective major boundary (`v1.0.0`).

Navigator review through the Web Console surfaced a follow-up story,
CV9.E5.S2 Documentation Information Architecture, for the docs home, folder
cover pages, release location, worklog scaling, troubleshooting placement,
architecture/API placement, and envisioning structure.

Verification: 1058 tests passed; ruff check and format check passed; `git diff
--check` passed. `mypy src/memory` currently fails on pre-existing typing debt
in `src/`, not introduced by this documentation/process story.

### 2026-05-19 — Roadmap and journey status reconciled

Aligned the public docs and Builder context after CV9.E4 completion. CV9 now
shows as in progress rather than planning, CV9.E4 is marked done, CV9.E3 is
marked in progress with S1 done, CV14 status reflects E1–E2 done with E3–E4
provisional, and the Builder context now reports version 0.7.0. The
`mirror-mind` journey identity and journey path were updated to match the repo
state.

### 2026-05-15 — CV9.E4 complete: Documentation Polish

All 7 stories shipped. The documentation information architecture is redesigned
around audience and responsibility.

**S1 — README reduction.** Rewrote README.md around the contractor/team
narrative arc. Under 100 lines. Removed persona table, init walkthrough,
per-runtime instructions, commands table, and directory tree. Exits immediately
to Getting Started and REFERENCE.

**S2 — Getting Started consolidation.** Rewrote getting-started.md as a pure
linear onboarding document. Added subscription decision table (Codex Plus /
Claude Code Pro / Gemini AI Pro). Removed legacy migration workflow (REFERENCE
only). Reduced extension content to one paragraph with a pointer. Kept
12-persona table and verification checklist.

**S3 — REFERENCE split.** Created `docs/product/architecture.md` — 8 sections covering
system overview, repo structure, layer model, identity model, memory model,
runtime model, database schema, and runtime session model. REFERENCE.md trimmed
to three sections: commands table, configuration, and legacy migration workflow
(with removal-candidate note). Removed personas table, Mirror Mode procedure,
Python API (→ api.md), extensions operational guide (pointer only).

**S4 — Principles reorganization.** Split `docs/product/principles.md` into two
files. `principles.md` now contains only the six product behavior principles.
New `docs/process/engineering-principles.md` receives Code, Testing, and
Process sections. Updated `docs/index.md` and `docs/product/index.md` to
reflect the new structure.

**S5 — CLAUDE.md reduction.** Rewrote CLAUDE.md as a minimal structured context
file with two sections: Mirror Operating Instructions (all sessions) and Project
Context (Builder Mode on this repo). Replaced architecture description, commands
table, memory system detail, and extension detail with pointers.

**S6 — Cross-reference audit.** Added exploratory/synthesis label to
`docs/product/envisioning/index.md`. Verified all pointers introduced in S1–S5
resolve correctly.

**S7 — Python API doc.** Created `docs/product/api.md` covering all public
`MemoryClient` methods: lifecycle, conversations, memories, identity/journeys,
tasks, and attachments.

1125 tests pass. CI green.

### 2026-05-15 — CV9.E3.S1 complete: Zero-Friction Identity Onboarding

Delivers the first story of CV9.E3. A new user types their name once, runs
two commands, and has a working mirror. No YAML editing required before the
first session.

**`memory init <name>` now substitutes the user's name** into all template
files automatically via `_substitute_user_name()`. The `{{user_name}}` token
in `self/soul.yaml` and `user/identity.yaml` is replaced at init time.

**Templates rewritten as editorial products.** All core identity files —
`self/soul.yaml`, `ego/identity.yaml`, `ego/behavior.yaml`, `ego/constraints.yaml`,
`user/identity.yaml` — now ship with real, opinionated content derived from
lived identity. Biographical specifics stripped; philosophical operating
principles, behavioral postures, and tone rules kept as universals. No
fill-in instructions, no placeholder text.

**Language rules removed from the default templates.** The English-only
constraints previously baked into `ego/behavior.yaml` and `ego/constraints.yaml`
reflected Vinícius's specific setup, not a generic default. Most new users
are Brazilian Portuguese speakers. The mirror now responds in the user's
natural language from session one.

**Persona catalog expanded from 3 to 12.** Nine new personas added:
therapist, strategist, coach, researcher, teacher, doctor, financial,
designer, prompt-engineer. Each ships with identity, approach, capabilities,
briefing, and routing keywords. All are editorial products, not stubs.

**Progressive enhancement as the native narrative.** Onboarding docs
reframed: the first session uses generic identity — that is correct. The
mirror sharpens through use. `/mm-identity edit` is surfaced as the
natural next step, not as a remediation.

**README and Getting Started updated** to reflect the zero-edit flow,
the 12-persona table, and the progressive enhancement path.

10 new tests. 1125 pass. ruff clean. CI green.

### 2026-05-14 — Claude extension projection made explicit

Removed an accidentally generated Claude external-skill overlay from the mirror
repository and hardened the extension CLI so `expose-claude` and `clean-claude`
now require `--target-root`. Claude projection remains an explicit
project-local operation; Pi continues to consume installed external skills from
`~/.mirror-minds/<user>/runtime/skills/pi/`. Added gitignore guards for generated
Claude extension overlays.

### 2026-05-09 — Initial Mirror Web Console docs browser

Added the first local web console slice: a read-only documentation browser. The
console starts with `uv run python -m memory web`, binds to `127.0.0.1`, shows
a hierarchical docs tree matching the docs folders, and renders selected
documents as HTML through the `markdown` package. The docs reader rejects path
traversal and non-doc files outside allowed roots.

This is the first step toward a broader Mirror Web Console for inspecting and
later editing configuration, personas, identity, and journey state.

### 2026-05-09 — Coherence direction documented as Builder lifecycle

Captured the Maestro synthesis as product architecture and roadmap direction.
Maestro is now framed as a doing-first public product frame powered by Mirror
Core, not as a separate runtime or competing Builder mode. Coherence is specified
as a natural Builder lifecycle capability: preflight on Builder activation,
visible Units of Coherence in the Builder briefing, and postflight after
meaningful changes.

Added product and project docs for the path:
- `docs/product/envisioning/index.md`
- `docs/product/specs/coherence-runtime/index.md`
- `docs/project/roadmap/cv10-coherence-engine/`
- future placeholders for CV11 Localization and CV12 Audience Modes

### 2026-04-30 — v0.6.2 released: Gemini CLI skill surface consolidated under `.agents/skills`

Removed the duplicate `.gemini/skills/` symlink tree. Gemini CLI can read the
same project-local `.agents/skills/` surface used by Codex, and keeping both
surfaces creates duplicate/conflicting skill definitions.

Updated the current runtime docs to reflect the new single-surface rule:
`.pi/skills/` remains the source, `.agents/skills/` is the shared Gemini CLI/Codex
surface, Gemini CLI invokes with `/mm-*`, and Codex invokes with `$mm-*`.

### 2026-04-29 — v0.6.1 released: Codex skill syntax documentation fix

Patch release for the Codex runtime docs and skill activation correction.

The important user-facing fix: Codex activates Mirror Mind skills with
`$mm-*` syntax, for example `$mm-build mirror`, not `/mm-*`.

This release also aligns CV8 completion status across docs, fixes stale
Gemini/Codex story numbering from the order inversion, and keeps the verification
gate green after small type/lint cleanup.

### 2026-04-29 — Documentation audit: CV8 status and Codex skill syntax

Audited the public and operational docs after real Codex use showed that Codex
activates Mirror Mind skills with `$mm-*` syntax, not `/mm-*`.

Updated README, Getting Started, REFERENCE, CLAUDE/AGENTS instructions, the
runtime interface contract, the shared `mm-build` skill usage, and CV8 roadmap
pages. The docs now consistently show:
- Pi and Gemini CLI: `/mm-*`
- Codex: `$mm-*`
- Claude Code: `/mm:*`

Also corrected stale CV7/CV8 status in the docs map and roadmap, marked CV8.E6
and CV8.E7 done, and fixed old E1/E5 story-number drift left from the runtime
order inversion.

### 2026-04-29 — CV8.E6 complete: Codex runtime implementation

Added L3 parity for Codex via wrapper script and JSONL backfill.

**`backfill-codex-session` CLI** (`conversation_logger.py`): parses Codex JSONL,
extracts session ID, and logs user/assistant turns. Idempotent check prevents
duplicates.

**`scripts/codex-mirror.sh`**: wrapper script that handles the lifecycle.
`session-start` → `codex` → find newest JSONL for CWD → `backfill-codex-session`
→ `session-end-pi` → `backup`.

**Skill symlinks** (`.agents/skills/mm-*/`): 19 symlinks to `.pi/skills/mm-*/`.
Gives Codex native skill discovery for all Mirror Mind commands.

**`AGENTS.md`**: project-root context file for Codex.

**`codex` interface label**: added to `runtime-interface.md` and CLI.

---

### 2026-04-29 — CV8.E7 complete: Codex operational validation

Smoke test and documentation updated.

**Smoke test** (`scripts/smoke_codex.sh`): isolated DB, fake Codex JSONL,
verifies `backfill-codex-session` correctly logs messages with `interface='codex'`.
PASSED.

**Docs updated**:
- README: four runtimes, Codex in prerequisites and starting section
- Getting Started: four runtimes, Codex section added
- Runtime Interface Contract: Codex reference implementation and L3 details added

CV8 is effectively complete. Both Gemini CLI (L4) and Codex (L3) are now
first-class runtimes.

---

### 2026-04-29 — v0.5.1 released: Gemini CLI hooks tolerate missing `GEMINI_SESSION_ID`

Fixed the Gemini CLI hook integration after real runtime use showed that
`GEMINI_SESSION_ID` may be absent even though `session_id` is present in the
hook JSON payload. `log-user.sh`, `log-assistant.sh`, and `session-end.sh` now
prefer the environment variable when present and fall back to stdin. The Gemini
smoke test now unsets `GEMINI_SESSION_ID` to guard this path explicitly.

### 2026-04-29 — CV8.E1 complete: Gemini CLI spike — L4 full parity confirmed

Inspected Gemini CLI 0.38.2 (installed via Homebrew) against the Mirror Mind
runtime contract. All runtime questions answered in a single spike session.

**Hook system:** Full shell-hook lifecycle via `.gemini/settings.json`. Hooks
communicate over stdin/stdout JSON. Key events: `SessionStart`, `BeforeAgent`,
`AfterAgent`, `SessionEnd`. Every hook receives `session_id`,
`transcript_path`, `cwd`, and `timestamp` on stdin. `$GEMINI_SESSION_ID` is
also available as an env var — no stdin parsing needed for session identity.

**Session ID:** Stable UUID per session. Always present.

**Transcript:** Full JSON at `transcript_path` (`~/.gemini/tmp/<project>/chats/session-*.json`).
Structure mirrors Claude Code: `messages[]` with `type: user | gemini`, full text content.
Per-turn assistant logging via `AfterAgent.prompt_response` is preferred over backfill.

**Mirror Mode injection:** `BeforeAgent` → `hookSpecificOutput.additionalContext` —
text appended to the prompt before model processing. Automatic per-turn injection
without requiring explicit user invocation. Cleaner than Pi, equivalent to Claude Code.

**Skills:** Native SKILL.md discovery at `.gemini/skills/` — same format as Pi.
Model activates on demand via `activate_skill`. Existing Pi skills are directly reusable.

**SessionEnd limitation:** Best-effort — CLI exits without waiting. Mitigated by
deferred extraction (same model as Pi, already battle-tested).

**Target parity: L4 Full Parity.** All five levels satisfied.

**Order inversion decision recorded:** Gemini CLI first, Codex second. Rationale
in `docs/project/decisions.md`. CV8 index and roadmap updated.

**Also: v0.4.0 released** — marks CV7 Intelligence Depth complete. 997 tests,
ruff clean, CI green.

---

### 2026-04-29 — CV7.E4 complete: Memory Depth (S4 — Shadow as structural cultivation)

Four pieces completing the shadow architecture decided in the 2026-04-26
therapist session.

**Shadow composition wiring:** `touches_shadow` now propagates from
reception through `_resolve_defaults()` → `load()` →
`load_mirror_context()` → identity service. The shadow layer composes
asymmetrically: only when `touches_shadow=True` AND `identity.shadow`
has content. Composition includes a provenance framing line.

**`propose_shadow_observations()`** in `intelligence/shadow.py`: scans
shadow-candidate memories (layer=shadow or type=tension/pattern,
readiness_state in observed/candidate), loads existing structural shadow
content for dedup, calls the LLM once with the full pool.
`SHADOW_SCAN_PROMPT` encodes: ground in evidence, don't duplicate
existing structural content, return [] when insufficient. Fail-open.

**`get_shadow_candidate_memories()`** added to `MemoryStore`: one query
for all shadow-candidate memories.

**Bug fixed:** `create_memory()` INSERT now explicitly sets `use_count`
and `readiness_state` from the model — previously always used DB defaults.

**mm-shadow CLI**: scan / apply / reject / list / show.
On apply: writes to `identity.shadow.profile`, sources → `acknowledged`,
provenance recorded in `consolidations` table (action=`shadow_observation`).

**Skills**: `mm-shadow` (Pi) and `mm:shadow` (Claude Code).

CV7.E4 fully done: S1 (hybrid search) + S2 (honest reinforcement) +
S3 (consolidation) + S4 (shadow). CV7 is complete.

997 tests pass. ruff clean. CI green on Python 3.10 and 3.12.

---

### 2026-04-29 — CV7.E4.S3 complete: Consolidation as integration

The move from "the mirror remembers" to "the mirror grows". Raw extracted
memories now have a path into structural identity content.

**Promotion mechanism decision** documented in `decisions.md`:
Manual-by-acknowledgment for S3. Scan is automatic; promotion requires
explicit acceptance. Auto-by-repetition deferred until real sessions
produce calibration data.

**`consolidations` table** (migration 010): tracks proposals with full
provenance — source memory IDs, LLM proposal, user decision, final content,
timestamps. Action types: `merge | identity_update | shadow_candidate`.

**`cluster_memories()`** in `intelligence/consolidate.py`: greedy
single-linkage clustering by cosine similarity. Skips terminal states;
returns clusters of ≥2, capped at 5 per cluster.

**`propose_consolidation()`**: LLM call producing a JSON proposal per
cluster. CONSOLIDATION_PROMPT encodes three-action taxonomy and selection
rules (prefer merge when uncertain). Fail-open on LLM failure.

**CLI** `python -m memory consolidate <scan|apply|reject|list>`:
- `scan`: cluster + proposals, print, persist as pending
- `apply <id> [--content]`: execute (identity update / merge / shadow
  candidate), advance readiness_states, record provenance
- `reject <id>`: mark rejected, leave memories unchanged
- `list [--status]`: consolidation history

**Readiness state transitions on acceptance:**
- merge: originals → `integrated`; merged memory created with embedding
- identity_update: sources → `acknowledged`; identity layer appended
- shadow_candidate: sources → `candidate` for mm-shadow pass (S4)

**Skills**: `mm-consolidate` (Pi) and `mm:consolidate` (Claude Code).

972 tests pass. ruff clean. CI green on Python 3.10 and 3.12.

---

### 2026-04-29 — CV7.E4.S2 complete: Honest reinforcement

Replaces the naive `log1p(access_count)/3` (no decay, no use/retrieval
distinction) with a two-signal honest formula.

**Three new columns on `memories`** (migration 009):
- `last_accessed_at TEXT` — cached when the memory was last retrieved;
  updated atomically in `log_access()` so decay needs no extra query.
- `use_count INTEGER DEFAULT 0` — incremented via `log_use()` when the
  model explicitly draws on a memory in a response. Separate from retrieval.
- `readiness_state TEXT DEFAULT 'observed'` — Jungian progression state
  for S3/S4 consolidation and shadow work. Infrastructure only in S2.

**`reinforcement_score(access_count, use_count, last_accessed_at)`** in
`search.py`: use_signal = min(1, use_count/5); retrieval_signal =
log1p(access_count)/3 * exp(-ln2 * days / DECAY_DAYS). Weights:
USE_WEIGHT=0.7, RETRIEVAL_WEIGHT=0.3, DECAY_DAYS=180. At half-life,
retrieval signal halves; after 2 years it's ~6%.

**`hybrid_score()`** now takes a pre-computed `reinforcement` float
instead of raw `access_count`. Caller computes via `reinforcement_score()`.

**`MemoryClient.log_use(memory_id)`** exposed for skill-layer callers
to mark explicit use (infrastructure; wiring to Mirror Mode skill in S4).

**Config knobs**: `MEMORY_REINFORCEMENT_DECAY_DAYS`,
`MEMORY_REINFORCEMENT_USE_WEIGHT`, `MEMORY_REINFORCEMENT_RETRIEVAL_WEIGHT`.

**`evals/retrieval.py`**: 10 deterministic probes documenting the scoring
behavioral contract. Free to run, no API calls. All 10 pass.

945 tests pass. ruff clean. CI green on Python 3.10 and 3.12.

---

### 2026-04-28 — CV7.E4.S1 complete: Hybrid search 2.0

Adds FTS5 full-text lexical search as a new signal in the hybrid scorer and
MMR deduplication to suppress near-identical results from the ranked list.

**`memories_fts` FTS5 table** (`schema.py`, migration 008): external content
table referencing `memories` via rowid. Three triggers (`ai`, `ad`, `au`)
keep the FTS index in sync with every insert, update, and delete. Migration
skips on fresh databases (SCHEMA handles it); populates from existing rows
on existing databases. Migration 008 is idempotent.

**`fts_search(query, memory_type, layer, journey, limit)`** on `MemoryStore`:
converts the query to a safe FTS5 expression (per-word double-quoting avoids
operator injection), joins back to `memories` to apply structured filters,
returns `(memory_id, rank_score)` pairs where `rank_score = 1/(1+rank)`.
Degrades gracefully to `[]` on any `sqlite3.OperationalError`.

**Updated `SEARCH_WEIGHTS`** in `config.py`: added `lexical: 0.15`;
rebalanced to sum to 1.0 (semantic 0.50, recency 0.15, reinforcement 0.10,
relevance 0.10, lexical 0.15). Added `MMR_DEDUP_THRESHOLD = 0.92`.

**`mmr_dedupe(candidates, limit, threshold)`** in `search.py`: Maximal
Marginal Relevance pass. Iterates candidates in score order; suppresses any
candidate whose max cosine similarity to already-selected results meets or
exceeds threshold. Returns up to `limit` SearchResult values.

**Updated `MemorySearch.search()`**: FTS5 rank scores fetched once per
search call; added to the hybrid score via lexical weight; MMR dedup applied
before logging access and returning results.

917 tests pass. ruff clean.

---

### 2026-04-28 — CV7.E3 complete: Extraction Quality

All four stories shipped. E3 is done.

**S4 — Generated descriptors (sidecar table)**

Adds routing-optimized 1-2 sentence descriptors for personas and journeys,
stored in a new `identity_descriptors` sidecar table keyed by `(layer, key)`.

`identity_descriptors` table: `(layer, key)` primary key, `descriptor TEXT`,
`generated_at TEXT`. Added to `schema.py` and `migrations.py` (007).

`IdentityDescriptor` dataclass in `models.py`. Storage methods on
`IdentityStore`: `upsert_descriptor`, `get_descriptor`, `get_descriptors_by_layer`
(the hot path: one query per layer returns `{key: descriptor}`).

`DESCRIPTOR_PROMPT` in `prompts.py`: adapts rules for persona vs journey;
150-char max; no meta-system references.

`generate_descriptor(content, layer, key, on_llm_call)` in `extraction.py`:
plain text output; returns `""` on empty content or LLM failure.

`mirror.py` reception: loads descriptors via `get_descriptors_by_layer` (one
query per layer before building the candidate list); uses descriptor when
present, falls back to `content[:200]` when absent. No flag needed.

`python -m memory descriptor generate [--layer L] [--key K]`: generates and
stores descriptors via LLM. Default: all personas + all journeys.
`python -m memory descriptor list [--layer L]`: shows stored descriptors.

Eval: `descriptor-quality` probe added to `evals/extraction.py` (10 total).
Tests: 7 unit tests for `generate_descriptor`; 6 storage contract tests in
`test_identity_descriptor.py`.

905 tests pass. ruff clean.

---

### 2026-04-28 — CV7.E3.S3 complete: Per-conversation summary

Replaces the naive message-concatenation stored in `Conversation.summary`
with an LLM-generated 3-4 sentence prose summary.

**`CONVERSATION_SUMMARY_PROMPT`** encodes four rules: open with the main
topic, include the key decision/insight if any, note emotional tone only
when clearly significant, standalone prose (no "we discussed").

**`generate_conversation_summary(messages, user_name, on_llm_call)`** in
`extraction.py`. Plain text output (not JSON). Returns `""` on empty
messages or LLM failure (fail safe).

**`MEMORY_SUMMARIZE=1`** feature flag. Default off. When enabled,
`_run_extraction()` calls the LLM summarizer; falls back to naive
concatenation on empty return. Naive concatenation extracted into private
`_naive_summary()` helper. Summary stored in `Conversation.summary`
(up to 1000 chars, up from 500) and used as the embedding input.

**`mm-recall`** now displays the summary when present, before the `---`
separator.

**Eval** -- `conversation-summary` probe added to `evals/extraction.py`
(9 probes total). Verifies: non-empty, 20-600 chars, on-topic (pricing
terminology), standalone (no "we discussed").

**Tests** -- 6 unit tests for `generate_conversation_summary()`: empty
messages short-circuit, LLM response returned, whitespace stripped,
LLM exception returns `""`, callback behavior.

892 tests pass. ruff clean.

---

### 2026-04-28 — CV7.E3.S2 complete: Two-pass extraction

Adds a curation pass that deduplicates candidate memories against the
user's existing memory pool before storing them.

**`curate_against_existing(candidates, existing, on_llm_call)`** — new
function in `extraction.py`. Storage-free: caller provides pre-fetched
existing memories. Returns a filtered/revised `list[ExtractedMemory]` in
the same shape as extraction output, so downstream code is unchanged.
Fail-open contract: on any LLM error or malformed JSON, returns candidates
unchanged (degrades to single-pass). Short-circuits with no LLM call when
`existing` is empty.

**`CURATION_PROMPT`** — static rules section in `prompts.py`. Encodes
three decisions: keep (genuine new signal), merge (extends existing),
drop (near-duplicate). Default to keep when uncertain.

**`MEMORY_TWO_PASS=1`** feature flag in `config.py`. Default off —
existing behavior completely unchanged when unset.

**Wired into `_run_extraction()`** in `conversation.py`. When enabled:
for each candidate, search existing memories (limit 3, same journey),
dedup by id (cap 15), call `curate_against_existing`. LLM call logged
with `role="curation"` when `MEMORY_LOG_LLM_CALLS=1`.

**Eval** — `two-pass-dedup` probe added to `evals/extraction.py`:
near-duplicate candidate dropped, novel candidate kept. 8 total probes,
threshold 0.80.

**Tests** — 8 unit tests for `curate_against_existing` covering: empty
candidates, empty existing (both short-circuit), valid curation, all
dropped, malformed JSON, LLM exception (last four: fail open), and
callback behavior.

886 tests pass. ruff clean.

---

### 2026-04-28 — CV7.E3.S1 complete: Extraction prompt revision

Rewrote `EXTRACTION_PROMPT` with four structural improvements over the
CV0-era prompt:

1. **Quality bar shift** — "prefer 0–3 memories of real signal over 5
   mediocre ones" replaces the vague upper bound that invited quota-filling
   with trivial observations.
2. **Explicit negative examples** — small talk, immediately-answered
   questions, technical details without insight, obvious facts, anything the
   user would not want to find in search six months from now.
3. **Shadow discipline rule** — `layer=shadow` now requires positive evidence
   of avoidance, contradiction, or circling. "When in doubt between ego and
   shadow, use ego."
4. **Standalone content rule** — each memory's `content` must make sense
   without the conversation; no pronouns without antecedents.

Eval updated: `tension-shadow` tightened to require `layer=shadow`;
`mixed-conversation` and `shadow-layer-discipline` probes added.

**New extraction baseline (7 probes, THRESHOLD=0.80): 7/7 PASS**

| Probe | Result | Notes |
|-------|--------|-------|
| engineering-decision | PASS | 2 memories (was 4) — fewer, higher signal |
| existential-reflection | PASS | 3 memories |
| tension-shadow | PASS | 1 memory, pattern/shadow (shadow discipline working) |
| trivial-no-memory | PASS | 0 memories |
| commitment | PASS | 3 memories |
| mixed-conversation | PASS | 1 memory, decision/ego (small talk suppressed) |
| shadow-layer-discipline | PASS | 1 memory, pattern/shadow |

874 tests pass.

---

### 2026-04-28 — CV7.E2 complete: Reception & Conditional Composition

All three stories shipped. Reception is now the canonical routing source
for persona and journey when `MEMORY_RECEPTION=1`.

**S1 — Reception MVP**
`reception()` in `src/memory/intelligence/reception.py` classifies each
Mirror Mode turn in one LLM call and returns four axes: `personas`,
`journey`, `touches_identity`, `touches_shadow`. Storage-free pattern,
`ReceptionResult.empty()` fallback on any failure. `MEMORY_RECEPTION=1`
feature flag. `evals/reception.py` added: 12 probes, baseline 10/12 (0.83)
PASS.

**S2 — Conditional composition**
`load_mirror_context()` accepts `touches_identity: bool = True`. When
`False`, `self/soul` and `ego/identity` are omitted — only `ego/behavior`
and `user/identity` load. Signal flows: reception → `_resolve_defaults()`
→ `load()` → `load_mirror_context()`. All existing callers unaffected
(default `True`).

**S3 — Reception as canonical routing source**
Restructured `_resolve_defaults()` so reception runs before sticky
defaults. Priority order: explicit args → reception → sticky fallback →
keyword/embedding detection. Reception can now override a session sticky
when the turn clearly belongs to a different persona.

874 tests pass.

---

### 2026-04-28 — CV7.E1 complete: Pipeline Observability & Evals

All five stories shipped. E1 baseline is established.

**S1 — `llm_calls` log table + instrumentation**
Every LLM call in the extraction pipeline now writes a structured row when
`MEMORY_LOG_LLM_CALLS=1`. `send_to_model()` captures latency and prompt.
Extraction refactored: prompts split to `prompts.py`, `ExtractedTask` moved
to `models.py`, `_parse_json_response()` eliminates 4x duplication, all four
functions route through `send_to_model()` with `on_llm_call` callbacks.

**S2 — Evals harness + extraction eval**
`evals/` framework established: `EvalProbe`, `EvalResult`, `EvalReport` types,
a runner with scored output and exit codes, and the first eval (`extraction`)
with 5 probes. `uv run python -m memory eval <name>` is a working command.

**S3 — Routing eval + proportionality eval**
Two more evals: `routing` (15 probes, persona detection behavioral contract)
and `proportionality` (5 probes, casual exchanges should produce 0 memories —
the watch probe for the expression pass).

**S4 — `inspect llm-calls` CLI**
`python -m memory inspect llm-calls` with filters by role, conversation,
session, since-date, and limit. Per-row trace with timestamp, model, token
counts, latency, and prompt/response snippets.

**S5 — Baseline measurement (this entry)**
All three evals run against production LLM. Scores recorded below.

---

#### E1 Baseline Scores (2026-04-28, model: google/gemini-2.5-flash-lite)

| Eval | Score | Threshold | Result | Notes |
|------|-------|-----------|--------|
| `extraction` | 5/5 (1.00) | 0.80 | PASS | All five transcript probes produced correct memory shapes |
| `routing` | 13/15 (0.87) | 0.85 | PASS | Two misses documented below |
| `proportionality` | 5/5 (1.00) | 0.80 | PASS | Zero memories extracted for all casual exchanges |

**Routing misses (keyword routing — expected to improve with E2 LLM classifier):**
- `ambiguous-writing-over-research`: got `researcher` instead of `writer`. Query
  contains both "writing" and "research"; researcher wins on keyword density.
  E2's intent-based classifier should resolve this correctly.
- `null-open-question` ("what is the meaning of freedom"): got `scholar` instead
  of `None`. "meaning" is a routing keyword for scholar. Acceptable false
  positive for keyword matching; E2 should handle open existential questions
  as null.

**Proportionality signal:** Clean baseline — extraction correctly ignores
trivial exchanges. No signal for the expression pass; CV7 ships without it
as planned.

**Next step:** CV7.E2 — Reception & Conditional Composition. E1 baseline
serves as the regression net for all E2 behavioral changes.

---

### 2026-04-26 — CV7 promoted from Planned to Planning

CV7 (Intelligence Depth) has been moved from "named placeholder" to
structured planning. Produced:

- `docs/project/roadmap/cv7-intelligence-depth/draft-analysis.md` —
  comprehensive territorial analysis comparing the current Mirror Mind
  intelligence stack to Alisson's `mirror-mind` reconstruction and to the
  broader field of agent memory and pipelined response systems. Includes
  the success-metric framework (means vs ends, truth vs proxy,
  optimization vs envelope), the four-epic proposal, and explicit
  resolved decisions.
- Rewritten CV7 index with the four epics, done condition, sequencing,
  and resolved/parked decisions.
- Four epic indexes: CV7.E1 (Pipeline Observability & Evals), CV7.E2
  (Reception & Conditional Composition), CV7.E3 (Extraction Quality),
  CV7.E4 (Memory Depth: Search, Reinforcement, Shadow).
- Two architectural decisions recorded in `docs/project/decisions.md`:
  shadow as both structural layer and memory destination (resolved via
  Mirror Mode session with the therapist persona); expression pass /
  `mode` axis deferred from CV7 with explicit watch criterion.
- Roadmap index updated: CV7 status now "Planning".

Next step: detailed planning of CV7.E1.S1 (the `llm_calls` log table) as
the first concrete tracer bullet for the CV.

### 2026-04-26 — GitHub Actions prepared for Node.js 24

Updated the active CI workflow to use Node 24-compatible action versions:
`actions/checkout@v6`, `actions/setup-python@v6`, and
`astral-sh/setup-uv@v8`. Removed the stale duplicate `test.yml` workflow that
still used the old pip-based dependency path and duplicated the active uv-based
workflow.

### 2026-04-26 — Focused storage component tests added

Added component-level characterization tests for the storage contracts that now
carry the persistence boundary: conversation read models, memory read models,
runtime session state, and identity metadata behavior. The tests intentionally
cover focused contract behavior rather than exhaustive CRUD duplication.

This completes the storage-refactor follow-up task. The storage layer is now
split into focused components, CLI code no longer reaches into raw SQL, simple
service read-model SQL lives in storage, and the most important storage
contracts have direct tests.

### 2026-04-26 — Service read-model SQL moved into storage

Moved the conversation and memory reporting SQL introduced during CLI cleanup
from services into their focused storage components. `ConversationService` and
`MemoryService` now expose domain/read-model methods while delegating raw SQL to
`ConversationStore` and `MemoryStore`.

Also routed conversation task-duplicate checks through `TaskService` instead of
calling task storage directly. The only remaining raw DB access in
`src/memory/services` is the explicit transaction in `RuntimeSessionService`,
which remains deferred as a separate transaction-boundary design decision.

### 2026-04-26 — Direct CLI SQL removed from memory reporting

Moved memory listing and memory-type count queries behind `MemoryService`.
Added the `MemorySummary` read model plus service tests for recent listing,
filters, and grouped counts. The `memories` CLI no longer executes SQL
directly.

This completes the direct CLI SQL cleanup for `src/memory/cli`: `rg
"store\\.conn" src/memory/cli` now returns no results.

### 2026-04-26 — Conversation CLI queries moved into service layer

Moved conversation recall and recent-conversation listing queries behind
`ConversationService`. Added the `ConversationSummary` read model plus service
methods for ID-prefix lookup and recent summaries with message counts. The
`recall` and `conversations` CLIs no longer execute SQL directly.

Remaining direct CLI SQL is now isolated to memory reporting in
`src/memory/cli/memories.py`.

### 2026-04-26 — Journey project path metadata moved into service layer

Moved journey `project_path` metadata access into `JourneyService` through
`get_project_path()` and `set_project_path()`. Builder Mode and the journey
`set-path` CLI now use the service instead of direct SQL against the identity
table, removing four direct `mem.store.conn` accesses from CLI code.

Added service and CLI regression tests for project path reads and updates. The
remaining direct CLI SQL is now limited to conversation recall/list reporting
and memory reporting.

### 2026-04-26 — Runtime session workflow moved into service layer

Extracted runtime session conversation binding from storage into
`RuntimeSessionService`. The conversation logger now calls
`mem.runtime_sessions.get_or_create_conversation(...)`, leaving
`RuntimeSessionStore` closer to pure runtime-session persistence.

Added focused service tests for creation, reuse, and stale binding replacement.
The remaining storage/service boundary debt is direct
`mem.store.conn.execute(...)` SQL usage in CLI modules.

### 2026-04-26 — Store split into focused storage components

Refactored `src/memory/storage/store.py` from a 700-line database god object into
a thin façade composed from focused storage components: conversations, runtime
sessions, messages, memories, identity, attachments, and tasks. The public
`Store` API remains unchanged, so services and CLI callers continue to work
without behavioral changes.

This is the first storage-layer cleanup pass. The remaining architectural debt
is to reduce direct `mem.store.conn.execute(...)` SQL usage in CLI modules.

### 2026-04-25 — CV6.E4 onboarding closed with meaningful starter identity

Audited CV6.E4 and found the remaining onboarding friction: fresh users seeded
placeholder `your-persona` / `your-journey` records, which made the documented
verification commands look broken or fake. Replaced those placeholders with
meaningful starter runtime assets: `writer`, `thinker`, `engineer`, and the
`personal-growth` journey.

Updated onboarding docs and template docs so the first seed now produces useful
personas, routing metadata, and a broadly applicable journey. The verification
flow now exercises real database-backed persona detection for writing, thinking,
and engineering queries. CV6.E4 and the overall CV6 roadmap are now marked done.

### 2026-04-22 — credits clarified and Pi repositioned as the preferred runtime

Updated `README.md` and `docs/getting-started.md` to make the project's lineage
explicit. The docs now clearly credit **Alisson Vale** and link to the original
`alissonvale/mirror-poc` repository as the source of the mirror concept and the
first implementation. They also credit **Henrique Bastos** and link to
`henriquebastos/mirror-mind` for the Pi direction that influenced the move
toward a more model-flexible runtime.

The user-facing positioning was also adjusted: Claude Code is now described as
the original harness and still-supported alternative, while Pi is presented as
the preferred runtime because it better supports a multi-model future. README
and getting-started instructions now introduce Pi first and Claude second.

Follow-up corrections aligned the public repository naming with
`viniciusteles/mirror` (no current-project `mirror-poc` references in docs) and
normalized Pi links to the agent package URL:
`https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent`.

---

### 2026-04-22 — onboarding and runtime command docs aligned with uv

Standardized current-facing docs and skill instructions around `uv run` as the
repo command boundary. Updated `docs/getting-started.md`, `README.md`,
`REFERENCE.md`, `CLAUDE.md`, `docs/product/specs/runtime-interface/index.md`, Claude/Pi
skill docs, and local Claude settings so project Python commands and tests run
through the locked uv environment instead of system Python.

Onboarding was also tightened: `docs/getting-started.md` now uses CLI-first
seeding (`uv run python -m memory seed`), adds stronger verification commands
for personas, journeys, persona metadata, and routing, and includes a compact
success checklist for new users. Seed guidance in runtime skills was corrected
to point at user-home identity files rather than repository-owned identity
artifacts.

Committed as `c11acde` (`Standardize uv-run docs and tighten onboarding verification`).
CI green on the push.

---

### 2026-04-20 — sqlite3 connection fd leak fixed in MemoryClient

**Symptom.** After the thread-safety fix, `test_concurrent_memory_client_open_on_fresh_db_is_safe` still failed intermittently with `sqlite3.OperationalError: unable to open database file`, reliably on the user's machine, never on the agent's. Same line (`sqlite3.connect`) every time. A retry-with-backoff guard made failures take 6 s instead of 0 s — the symptom was persistent, not a filesystem flicker.

**Root cause.** Python 3.14's `sqlite3.Connection` does not release its underlying OS file descriptors through refcount-based cleanup. Only explicit `close()` or process exit releases them. The concurrency test creates 32 × 5 = 160 short-lived `MemoryClient` instances with no explicit close, leaking ∼2 fds per client. On a machine where cyclic GC doesn't run often enough between iterations, the process hits `EMFILE` and SQLite reports `unable to open database file`.

**Fix.** Added explicit lifecycle management to `MemoryClient`:
- `close()` closes the SQLite connection. Idempotent.
- `__enter__` / `__exit__` so callers can use `with MemoryClient(...) as mem:`.
- `__del__` as a best-effort safety net for callers that forget to close.
The concurrency test now closes every client it opens. Verified: leaked fds drop to zero without `gc.collect()`, and the test suite runs green across 30+ consecutive invocations on both machines where the failure reproduced.

**Side fix.** `mirror_state.mark_injected` previously constructed two `MemoryClient` instances back-to-back for a single hook invocation (read + write), doubling bootstrap cost. Now reuses one client across both store calls.

**Lesson.** When a fix doesn't work, treat the new timing data as a diagnostic signal. A retry that slows failures from 0 s to 6 s tells you the error is *persistent*, not *transient* — so the hypothesis was wrong, and the retry is masking symptoms of the real cause. Step back and re-instrument rather than iterate on the wrong hypothesis.

624 tests passing. CI green on Python 3.10 and 3.12.

---

### 2026-04-20 — pip replaced with uv; thread-safety race fixed

**uv migration (full, with lock file).** Replaced `setup-python` + `pip install`
with `astral-sh/setup-uv` + `uv sync --frozen` in CI. Generated `uv.lock` and
committed it. New users now get a byte-identical environment on first clone.
README and `docs/getting-started.md` updated: uv added to prerequisites, pip
references removed, stale `mm:save` entries cleaned up.

**Thread-safety race in bootstrap lock fixed.** `fcntl.flock` is a
cross-process primitive and does not serialize threads within the same process.
Under 32 concurrent workers on Python 3.14 this caused
`sqlite3.OperationalError: unable to open database file` during bootstrap.
Fixed by adding a per-db-path `threading.Lock` as an inner layer inside
`_bootstrap_lock`. `flock` remains for cross-process safety; the thread lock
serializes concurrent threads within one process.

**`mm:save` and transcript export removed.** `mm:save` had no practical use
case with `SESSION_LOG_AUTOMATIC` enabled and was removed entirely. The automatic
JSONL→Markdown transcript export (`TRANSCRIPT_EXPORT_AUTOMATIC`) was also
removed. `backfill_assistant_messages` is preserved — it still runs at session
end to capture assistant turns in the DB.

624 tests passing. CI green on Python 3.10 and 3.12.

---

### 2026-04-20 — Session log feature and one-off migration tool removed

Two cleanups driven by real usage findings on Pi.

**Session log removed.** The feature was built assuming the AI would actively
edit a log file during the session — which Claude Code supports but Pi does not.
On Pi, every session produced an empty skeleton with a "session" placeholder topic
and no content. Removed entirely: `src/memory/cli/session_log.py`, config entries
`SESSION_LOG_AUTOMATIC` / `SESSION_LOG_DIR`, all skill step references in both
`.claude/` and `.pi/` skills, the `docs/session-logs/` tree, and associated tests.
Pi's native logging is the replacement. Historical session logs moved to Dropbox.

**`src/memory/tools/` removed.** The `identity_english_migration.py` one-off tool
served its purpose during CV0 English migration and had been dead weight since.
Deleted with its tests.

624 tests passing. CI green.

---

### 2026-04-19 — CV5 audit and follow-up fixes

Independent audit of the CV4 + CV5 implementation. Findings: the CV5.E2.S2
concurrent-startup regression test was flaky (~20% failure rate); `/mm:save`
was silently targeting the wrong transcript after CV5 removed the writers of
`CURRENT_SESSION_PATH`; `backfill_pi_sessions` ignored `mirror_home`; mirror
state CLIs silently no-op'd on missing `--session-id`; `mirror deactivate`
CLI was effectively dead; and several state-file config constants and one
helper module had become dead code.

Landed in six verified commits. Concurrency regression test now passes 50/50
under stress. `REFERENCE.md` now documents the `runtime_sessions` table and
the CV5 session model. Retroactive session log added for the original CV5
implementation plus a log for this audit session.



---

### 2026-04-19 — CV5 Multisession Safety complete

Replaced singleton runtime state with a SQLite-backed `runtime_sessions`
registry. Session ↔ conversation routing is now database-backed and covered by
concurrency regression tests; mirror mode state is session-scoped; stale-orphan
cleanup skips every active runtime session instead of one ambient session; and
Claude hook reinjection now passes explicit `session_id` through the safer
runtime path. Concurrent startup against a fresh database no longer trips
migration integrity failures.

Reference: [CV5 Multisession Safety](../project/roadmap/cv5-multisession-safety/index.md)

---

### 2026-04-17 — CV0 English Foundation complete

Full Portuguese→English migration across all layers: Python API, CLI, runtime
config, schema, seed, hooks, skills, identity YAMLs, and docs. No Portuguese
runtime paths remain outside migration-only code. 519 tests passing. Isolated
smoke test validated.

Key outcome: a stable English foundation for CV1 Pi Runtime.

Reference: [CV0 English Foundation](../project/roadmap/cv0-english-foundation/index.md)

---

### 2026-04-17 — Pi adoption spike complete

Technical investigation of `~/dev/workspace/mirror-pi` (Henrique's project).
Key findings: do not port wholesale — it is pre-English-migration. Port the
interface ideas (Pi session lifecycle, `.pi/` skeleton, mirror-logger extension)
against the current English core.

Implementation sequence and risks documented.

Reference: [CV1 Pi Runtime](../project/roadmap/cv1-pi-runtime/index.md)

---

### 2026-04-17 — Docs scaffold complete

Documentation hierarchy created: index, getting-started, project briefing,
decisions, roadmap (CV0 retrospective + CV1 epics), product principles, process
guide, worklog, and two spike docs.

Adopted planning style from Alisson Vale's `mirror-mind` repo:
CV → Epic → Story with `plan.md` + `test-guide.md` per story, breadcrumbs,
status tables, and narrative worklog.

Reference: Mirror Mind documentation assessment (historical, source no longer in repo)

---

### 2026-04-17 — CV1.E1 Shared Command Core complete

Mirror skill logic extracted from `.claude/skills/mm:mirror/run.py` into
`src/memory/skills/mirror.py`. The Claude skill is now a thin display wrapper.
`python -m memory mirror <subcommand>` and `python -m memory conversation-logger <subcommand>`
added to the unified CLI.

532 tests passing. ruff, pyright, git diff --check all clean.

Reference: [CV1.E1 Shared Command Core](../project/roadmap/cv1-pi-runtime/cv1-e1-shared-command-core/index.md)

---

### 2026-04-17 — CV1.E3 Pi Session Lifecycle complete

Extended `conversation-logger` with full Pi session lifecycle support:
`--interface pi` flag on `log-user`/`log-assistant`, `session-start`
(unmute + stale orphan close + Pi JSONL backfill + pending extraction),
`close_stale_orphans`, and `backfill_pi_sessions`.

Extraction tracking added to `ConversationService` via `metadata.extracted`
JSON field — no schema migration needed. 549 tests passing.

Reference: [CV1.E3 Pi Session Lifecycle](../project/roadmap/cv1-pi-runtime/cv1-e3-pi-session-lifecycle/index.md)

---

### 2026-04-17 — CV1.E2 Pi Skill Surface complete

Added `.pi/` skeleton: `settings.json`, `mm-mirror` thin wrapper calling
`memory.skills.mirror.main()`, `SKILL.md` user guide, and `mirror-logger.ts`
extension ported from mirror-pi with English runtime names. Added
`session-end-pi` CLI command and `backup` route to `__main__.py`.

552 tests passing.

Reference: [CV1.E2 Pi Skill Surface](../project/roadmap/cv1-pi-runtime/cv1-e2-pi-skill-surface/index.md)

---

### 2026-04-17 — CV1.E4 Pi Operational Validation complete

End-to-end smoke test against isolated DB (`MEMORY_DIR=/tmp/cv1-e4`). Pi session
ran `/mm-mirror`, extension logged all turns via `mirror-logger.ts`, `session-start`
triggered extraction, 1 memory extracted from `journal=mirror` conversation.
Production DB untouched (confirmed by checksum). 0 ERROR lines in mirror-logger.log.

Fixed bug: `mirror-logger.ts` hardcoded `~/.mirror-minds/` instead of reading
`MEMORY_DIR` from environment — corrected with `_resolveMemoryDir()`.

CV1 done condition met: dual-interface (Claude Code + Pi), shared Python core,
all four epics complete, 552 tests passing.

Reference: [CV1.E4 Pi Operational Validation](../project/roadmap/cv1-pi-runtime/cv1-e4-pi-operational-validation/index.md)

---

## Earlier Milestones

*Pre-consolidation worklog retained for history. Newer milestones live in the
`## Done` section at the top of this file.*

### 2026-04-29 — CV8.E2 complete: Gemini CLI runtime implementation

Four shell hooks + settings.json + 19 skill symlinks.

**Hooks** (`.gemini/hooks/`, registered in `.gemini/settings.json`):
- `session-start.sh` → `SessionStart`: `conversation-logger session-start`
- `log-user.sh` → `BeforeAgent`: `log-user --interface gemini_cli` + conditional
  `mirror load --context-only` returning identity block as `additionalContext`
- `log-assistant.sh` → `AfterAgent`: `log-assistant --interface gemini_cli`
- `session-end.sh` → `SessionEnd` (best-effort): `session-end-pi` + `backup --silent`

Session ID via `$GEMINI_SESSION_ID` env var — no stdin parsing needed.
Skill invocations (prompts starting with `/`) skip logging in `BeforeAgent`.

**Skills** (`.gemini/skills/mm-*/`): 19 symlinks pointing to `.pi/skills/mm-*/`.
Same SKILL.md format — one source of truth for both runtimes. Verified with
`gemini skills list` — all 19 discovered and enabled.

**No Python changes** — `interface` is a free-text field; `gemini_cli` passes
through unchanged. 997 tests still pass.

Runtime interface doc updated: Gemini CLI added as third runtime.

---

### 2026-04-29 — CV8.E3 complete: Gemini CLI operational validation

Smoke test, production DB safety proof, and public docs updated.

**Smoke test** (`scripts/smoke_gemini_cli.sh`): isolated DB (`DB_PATH` override),
simulates all four hook events, inspects `interface='gemini_cli'` rows, verifies
user and assistant message content, confirms production DB checksum is unchanged.
All checks pass.

**Session-start fix:** hook was printing the Python status line to stdout before
the JSON object, which violated Gemini's hook contract. Fixed to redirect all
Python output to `/dev/null`.

**Docs updated:**
- README: three runtimes, Gemini CLI in prerequisites, commands table now says
  "Pi / Gemini CLI", start-using section includes Gemini CLI
- Getting Started: three runtimes, prerequisites, Gemini CLI start section
- Runtime Interface Contract: Gemini CLI reference implementation table added
- mm-help skill: description updated to mention both Pi and Gemini CLI

**Final parity: L4 Full Parity.** All five levels satisfied. One honest limitation
(SessionEnd best-effort) documented and mitigated by deferred extraction.

---

### 2026-04-29 — CV8.E4 complete: Runtime Adapter Hardening

Seven lessons from the Gemini CLI integration extracted and hardened into
explicit contract language. No premature abstraction — each pattern is
backed by two concrete runtimes.

**L1 — Stdout purity (shell-hook runtimes):** stdout must contain only one JSON
object. Found live in Gemini CLI (status line leaking before JSON). Rule and
correct/wrong examples added to the contract.

**L2 — Session ID delivery:** three delivery models documented (Claude Code
stdin, Gemini CLI stdin+env var, Pi TypeScript context). Preference rule:
use env var when available.

**L3 — Two extraction models:** immediate (`session-end` + transcript) vs
deferred (`session-end-pi`). Tradeoff documented. Both proven in production.

**L4 — Three injection models:** automatic per-turn (Gemini CLI), hook-conditional
(Claude Code), explicit invocation (Pi). Tradeoffs and guidance for new runtimes.

**L5 — Smoke test isolation:** `DB_PATH` is the correct override; `MIRROR_HOME`
conflicts with `MIRROR_USER` from `.env`. Standard smoke test structure documented.

**L6 — Skill symlinks:** SKILL.md-native runtimes share skills via symlinks from
`.pi/skills/`. Zero maintenance — Pi skill updates propagate automatically.

**L7 — Interface label:** free-text field; no Python changes for new runtimes.

**Codex checklist** (`cv8-e5-codex-runtime-spike/codex-checklist.md`): every
known answer and every unknown to answer in the E5 spike. Target parity
prediction matrix included.

---

### 2026-04-29 — CV8.E5 complete: Codex runtime spike — L3 parity

Inspected Codex 0.125.0 against the hardened Mirror Mind runtime contract.

**Central finding: no lifecycle hooks.** Codex has no SessionStart, BeforeAgent,
AfterAgent, or SessionEnd hook system. This bounds the parity level to L3.

**Session ID:** embedded in the JSONL filename
(`~/.codex/sessions/YYYY/MM/DD/rollout-<timestamp>-<uuid>.jsonl`) and in
`session_meta.payload.id`. Not available as an env var. Post-hoc extraction
required.

**Transcript:** full session JSONL. User turns: `event_msg` with
`type: user_message`. Assistant turns: `event_msg` with `type: agent_message`.
Parseable for backfill — same model as Claude Code, triggered by wrapper.

**Skills:** native SKILL.md at `.agents/skills/<name>/SKILL.md` (project-level)
and `~/.codex/skills/` (global). Same format as Pi. Confirmed via
`codex debug prompt-input`. L2 is a symlink operation.

**Context injection:** `AGENTS.md` loaded hierarchically at session start
(global `~/.codex/AGENTS.md` + project `AGENTS.md`, concatenated). Static —
injected once, not per-turn. Mirror Mode uses explicit skill invocation (Pi model).

**Target parity: L3** (with wrapper script):
- L1: wrapper → session-start + JSONL backfill + session-end-pi
- L2: `.agents/skills/mm-*/` symlinks
- L3: `AGENTS.md` + explicit `mm-mirror` skill
- L4: not achievable (no hook support)

Implementation plan produced for E6: `backfill-codex-session` CLI command,
`scripts/codex-mirror.sh` wrapper, skill symlinks, `AGENTS.md`.

---

## Next

- **CV9 (In Progress):** Mirror Mind 1.0 — stabilization, boundary hardening, and the remaining conversation-metadata lifecycle apply work.
- **CV20 (In Progress):** Builder Mode Evolution — the Ariad method DSL (parser, registry, adoption, lifecycle execution).
- **CV21 (In Progress):** Runtime Expansion II — package Mirror once as a canonical plugin + MCP server and propagate it to Claude, Codex, Antigravity, and Grok Build.
- **Continuous refinement** of identity, memory quality, and runtime behavior based on real usage.

The authoritative status of every CV/Epic/Story lives in the
[Roadmap](../project/roadmap/index.md); this list is a pointer, not a second
source of truth.

---

**See also:** [Roadmap](../project/roadmap/index.md) · [Decisions](../project/decisions.md)
