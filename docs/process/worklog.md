[< Docs](../index.md)

# Worklog

Operational progress. This file records what was delivered and what is next.
Update when a meaningful milestone is reached.

Scaling rule: keep this as a single file through the 1.0 readiness cycle. After
1.0, archive by release or year if the file becomes hard to scan.

---

## Done

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

## Done

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

- **CV9 (Planned):** Mirror Mind 1.0 — refactoring, stabilization, and public release preparation.
- **Continuous refinement** of identity based on real usage.

---

**See also:** [Roadmap](../project/roadmap/index.md) · [Decisions](../project/decisions.md)
