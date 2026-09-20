[< CV22 TypeScript Core Port](../index.md)

# CV22.DS10 — Python Retirement And npm Distribution

**Status:** 🟢 In Progress — pulled 2026-09-19 with eight approved child stories (0/8)
**Type:** Delivery Story
**Depends on:** CV22.DS7 command burn-down (done 2026-09-17, 14/14 — its Workspace/web
hierarchy rider was retired unported); CV22.DS8 live-provider cutover (done); CV22.DS9 TS
MCP server

---

## Outcome

Python deletion cannot begin merely because the CLI command denominator reaches zero.
The Python-owned web process, its endpoint inventory, and its static assets must first
carry an explicit disposition. **Since 2026-09-17 that disposition is retirement, not
convergence:** the web console is deleted rather than reimplemented in TypeScript — see
[Decisions — The web console is retired, not ported](../../../decisions.md#the-web-console-is-retired-not-ported-and-ds7-closes-at-1414).
DS10 therefore owns the removal, not a port; `mirror-gui` owns any future graphical surface.

## Candidate Stories

| Code | Story | Type | Outcome | Status |
|------|-------|------|---------|--------|
| [CV22.DS10.TS1](cv22-ds10-ts1-retire-the-projection-seam-and-subsystem/index.md) | Retire the projection seam and subsystem | Technical Story | TypeScript writes spawn no Python: the `journey-projection refresh` seam and its four TS call sites, the `journey_projections` subsystem, its CLI, its Extension API capability, tests, and fixture are deleted; `.mirror/projections` is no longer published; `mirror.journey-projections@1.0` is sunset with a documented cutoff. Pulled 2026-09-19 as a port (ex-DS7.TS5), re-authored the same day as a retirement after the Navigator placed Mirror Desktop outside the migration | 🟢 In Progress — re-planned 2026-09-19 |
| CV22.DS10.US1 | Web console retirement | User Story | Cutoff published in the release note naming `mirror-gui` as successor; a repository-wide check finds nothing outside `src/memory/web/` depending on the console; `src/memory/web/`, the `web` entry in `__main__.py`, and `tests/unit/memory/web/` deleted; README, REFERENCE, and getting-started updated in the same change; `<mirror-home>/web/` disposition recorded; no TS replacement built | 🟡 Planned |
| CV22.DS10.TS2 | Extension compatibility-host deletion | Technical Story | `memory.extensions.compat_host` (context and `cli` modes) and every TS launcher branch that invokes it removed; providers without `provider_runtime` fail explicit and fail-soft; the migration cutoff documented; a repository/package check proves every retained provider and command enters through a declared language-neutral runtime | 🟡 Planned |
| CV22.DS10.TS3 | Eval harness transfer to `ts/evals/` | Technical Story | The Python contract carried (`PROBES` and `THRESHOLD` per module, capability discovery for `--all`, JSONL history, threshold exit code); fixtures engine-neutral; each module's disposition recorded (`routing` retired, `scene` follows US1, `retrieval` decided); injection probes individually blocking (D-017); first run diffed against the 2026-09-13 `eval-history/`; development guide and engineering principles name the TS harness; then `evals/` and the `eval` entry deleted | 🟡 Planned |
| CV22.DS10.US2 | npm-era updater and release tooling | User Story | A TS-owned replacement for `runtime update`, `pull`, `stable`, `backup`, `release-doctor`, and `release-promote`, designed around versioned installs and dist-tags rather than ported, with operational smoke coverage; `release-promote`'s product-versus-tooling placement decided; `mm-update` stops calling Python; `PYTHON_ALLOWLIST` goes empty and the skill parity check asserts the entry point is absent, including for the packaged plugin | 🟡 Planned |
| CV22.DS10.TS4 | Retire the unported surfaces with cutoffs | Technical Story | `migrate-legacy`, `memory-rehearse-migration`, the twenty SQLite Refinement Workbench leaves plus the `get_workbench_snapshot` read, the `conversations` metadata-backfill flags, and `journey export-registry` / `journey mutate` (`journey_admin`, 345 lines, arrived in the pause-window merge and never entered the DS7 denominator — see CR089 for the front-door mis-route) removed, each with its cutoff in the release note | 🟡 Planned |
| CV22.DS10.TS5 | Python core deletion | Technical Story | `src/memory/`, its tests, the `uv` and `pyproject` Python surface, the front door's `fallbackPython` path, and the `MIRROR_TS_*` revert gates removed; existing `memory.db` files keep working; every runtime operates over TS only. Separately Navigator-authorized | 🟡 Planned |
| CV22.DS10.US3 | npm distribution | User Story | Package rename and a single-language npm artifact; the Pi, Gemini CLI, Codex, and Claude Code install paths resolve from it; publication, stable promotion, tag, and release remain separate Navigator gates | 🟡 Planned |

Eight stories, approved 2026-09-19, in the order the gates below constrain: TS1 first
(the package's own ordering note — the projection cutover is the act that retires
Python's publisher); US1 before the deletion and npm gates open (the roadmap row: after
zero commands, delete the web process, *only then* plan the rest); TS2–TS4 clear the
remaining gates; TS5 and US3 last and separately authorized. The codes are renumbered
under DS10 — the projection story keeps its `DS7.TS5` lineage in its title because that
is how the decisions log and the burn-down ledger refer to it.

## Workspace And Web Retirement Gate

This gate replaced the convergence gate on 2026-09-17. Python core deletion is blocked
until all of the following are true:

1. A documented cutoff is published in the release note for the version that removes the
   console, stating that `python -m memory web` no longer exists and naming `mirror-gui`
   as the successor surface.
2. A repository-wide check proves nothing outside `src/memory/web/` depends on the console:
   no runtime, skill, extension, hook, or script invokes `python -m memory web`, and no
   non-web module imports `memory.web.*`. Anything found is reported to the Navigator as a
   possible revisit trigger before deletion, never silently ported.
3. `src/memory/web/` (server, operations, configuration, preferences, mirrors, docs,
   command executor, agent prototype, and `static/`) is deleted, together with the `web`
   entry in `src/memory/__main__.py` and `tests/unit/memory/web/`.
4. User-facing documentation stops advertising the console: `README.md`, `REFERENCE.md`
   (the `python -m memory web` row), and `docs/getting-started.md` (the Web console
   section) are updated in the same change that deletes it.
5. Web-only preferences state under `<mirror-home>/web/` has a recorded disposition —
   left in place as inert, or removed with the cutoff — decided explicitly rather than
   orphaned.
6. No TS replacement is built: there is no TS web server, no ported endpoint inventory,
   and no packaged static assets in the npm artifact. Adding one is a `mirror-gui` decision
   and a new story, not DS10 scope creep.

**Inherited from the retired CV22.DS7.US9.** Its
[story package](../cv22-ds7-command-burn-down/cv22-ds7-us9-workspace-web-hierarchy-parity/index.md)
remains the most accurate description of the released `v0.31.9` hierarchy contract and the
only line-referenced map of the Python producers. DS10 reads it to delete confidently — to
know what is being removed — not to reimplement it. The hierarchy *semantics* survive
independently in TS (`listJourneyOptions`, `resolveParentJourney`, `validateParentJourney`,
`createJourney` / `setParentJourney`) and are not affected by this deletion.

## Extension Compatibility-Host Deletion Gate

CV22.DS7.TS2 transfers extension context dispatch to TS through the language-neutral
`mirror-context-v1` protocol while temporarily preserving Python-only providers through
`memory.extensions.compat_host`. **CV22.DS7.TS4 extends that same host with a `cli`
mode** (Navigator decision D1, 2026-09-16) so `ext <id> <subcommand>` and the
`ext <id>` subcommand listing keep reaching handlers registered through
`api.register_cli` until extensions declare a `mirror-cli-v1` runtime on their
`cli.subcommands[]` entries. One host, one gate:
every item below covers the command bridge as well as the context bridge. Before
Python retirement or npm publication, DS10 must:

1. delete the compatibility host and every TS launcher branch that invokes it;
2. prove the packaged artifact contains no core-owned Python extension-provider bridge;
3. document the final migration cutoff for capabilities without `provider_runtime`;
4. make unmigrated providers fail explicitly and fail-soft rather than silently losing
   context; and
5. run a repository/package check proving every retained extension context provider and
   every retained extension COMMAND enters through a declared language-neutral command.

This gate does not require provider authors to use JavaScript. Extensions may own any
executable runtime; the Mirror core must not own Python as their permanent compatibility
layer.

## Skill Invocation Gate

Python deletion is not only a code question: **the skills invoke it by name.**

[CR071](../../../refinement/rs010-cv22-oracle-and-port-hygiene/cr071-collapse-the-triplicated-skill-command-references.md)
found on 2026-09-09 that eleven skills reached the front door on Pi while still
calling `uv run python -m memory` directly on Claude Code and the published
plugin — including `journeys`, flipped in DS3. The invocations were repaired and
`scripts/check_skill_command_parity.py` now fails CI when a flip updates one
copy and not the others.

That check guarantees the three copies AGREE. It does not guarantee they have
stopped calling Python, and after DS10 they must. Before Python retirement or
npm publication, DS10 must:

1. confirm no skill copy in any runtime invokes `uv run python -m memory`, in
   any of `.pi/skills/`, `.claude/skills/`, or `plugins/mirror-mind/skills/`;
2. give the parity check a second assertion — the Python entry point is not
   merely consistent, it is absent — or replace it with that assertion;
3. verify the packaged plugin's invocation form resolves for an installed user,
   not only inside a runtime clone.

The residue at the time of writing (2026-09-09, corrected the same day by the
CR068 inspection) is larger than CR071 recorded. **Nine skills whose routes
already point at TypeScript still invoke `uv run python -m memory` directly**:
`mm-tasks`, `mm-week`, `mm-consolidate`, `mm-shadow`, `mm-consult`, `mm-mute`,
`mm-new`, `mm-discard`, and `mm-mirror`. Their families were flipped in
DS7.US2–US5 and DS5, but a flipped route reaches a live session only if the
caller enters the front door, and these skills never did — so those flips have
been real for the Pi extension and the smoke, not for the skill a Navigator
types. [CR072](../../../refinement/rs009-cv22-front-door-routing-correctness/cr072-route-every-skill-through-the-front-door.md)
(RS009) owned the repair and brought item 2 above forward: since 2026-09-09
`scripts/check_skill_command_parity.py` carries `PYTHON_ALLOWLIST`, and a skill
may invoke Python only for an allowlisted command that names its owning story.
DS10's job for item 2 is now to require that list to be **empty**.

The remaining residue after CR072 is the unported set: `mm-build` (the Ariad
lifecycle, until DS7.US8), `mm-journal` (until DS7.US11), `mm-update` (the
`runtime` update half, redesigned here), and `mm-identity`'s `identity edit`
(assigned to DS7.TS4 on 2026-09-09 as a `spawnSync($EDITOR)` port — "kept on
Python by design" was never a disposition once Python is deleted). Each needs
an explicit answer here, not an assumption that the burn-down covered them.

## Journey Projection Retirement Gate

**Rewritten 2026-09-19 from a port gate to a deletion gate.** The
[2026-09-09 decision](../../../decisions.md#journey-projection-publication-stays-python-owned-until-the-retirement-window)
kept publication Python-owned for the transition so that a TypeScript publisher would
land in one flip at retirement time; TypeScript Explorer (DS7.US7) and Builder (DS7.US8)
writes delegate the post-commit refresh to Python through `journey-projection refresh`.
That decision assumed a port. On 2026-09-19 the Navigator
[decided there will be none](../../../decisions.md#journey-projections-retire-with-the-python-core-mirror-desktop-is-outside-the-migration):
the subsystem's only reader is Mirror Desktop, which is outside the migration, and no
current Mirror user consumes `.mirror/projections`. The seam is deleted with the
subsystem it fed. Before Python retirement or npm publication, DS10 must:

1. delete the `journey-projection refresh` subcommand and every TypeScript call site
   that spawns it, so that no TypeScript write depends on Python at runtime;
2. delete `src/memory/journey_projections/`, its CLI, its Extension API capability,
   its tests, and its fixture, and drop `filelock`;
3. prove with a guard, not a reading of the code, that Explorer and Builder writes
   spawn no process;
4. document the cutoff in the release note: `journey-projection` and
   `api.journey_projections` no longer exist, `.mirror/projections` is no longer
   published, and `mirror.journey-projections@1.0` consumers stay on the last
   Python-bearing release until Mirror Desktop's integration with the TypeScript core
   defines its read model; and
5. leave existing `.mirror/projections/` trees in place as inert — gitignored, readable
   by the last Python-bearing runtime — with that disposition recorded, as US1 does for
   `<mirror-home>/web/`.

This is **TS1**, and it stays DS10's first act for a reason the port never had: it is
the one place where the TypeScript core still calls Python for its own writes. After it,
every Builder and Explorer write is self-sufficient. `journey-projection` left the DS7
command denominator on 2026-09-09 (30 → 29) and does not return.

## Mirror Desktop Is Outside The Migration

Decided 2026-09-19. [Mirror Desktop](https://github.com/mirror-mind-ai/mirror-desktop)
(the Tauri app formerly Nautilus Harness, alpha, one user) is bound to the Python era in
ways deeper than any command. An inventory taken at TS1's Plan, kept here for the
integration effort that follows the migration:

| Site (`src-tauri/src/`) | Calls | Coupling |
|---|---|---|
| `main.rs:2924` | `journey-projection inspect` | CLI; retired by TS1 |
| `main.rs:2118`, `:2175` | `journey export-registry`, `journey mutate` | CLI; retired by TS4; mis-routed today (CR089) |
| `main.rs:5518` | `conversations append` | CLI; TS-owned since DS7.US10, but called through Python directly |
| `main.rs:1728` | `recall` piped into `pi @file` | CLI via shell; TS-owned, called through Python directly |
| `main.rs:531` → bundled `scripts/mirror_conversation_catalog.py` | `sys.path.insert(mirror_root/src)`; imports `MemoryClient`; `conversations.list_recent`, `find_by_id_prefix`, rename | **Python internals** — no command exists |
| `main.rs:1792` → bundled `scripts/provision_mirror_conversation.py` | same; `runtime_sessions.get_or_create_conversation`, `store.upsert_runtime_session`, `store.update_conversation` | **Python internals** — no command exists |
| `runtime_binding.rs:189–199` | requires `mirror_root/src/memory`, version from `pyproject.toml` in `>=0.31.14,<0.32.0`, `uv` on the trusted path | binding contract |

The migration serves current Mirror users on Pi, Gemini CLI, Codex, and Claude Code, who
do not know Desktop exists. Desktop pins to the last Python-bearing release. Its
integration with the TypeScript core is a separate effort after the migration closes;
that effort owns whatever read model, commands, and binding shape Desktop needs, and
may or may not resurrect a projection contract. The acceptance kit under
`mirror-desktop/contracts/mirror-journey-projections/v1/` is not edited by this journey.

## Zero Python Gate

Navigator constraint, 2026-09-19: **when the migration closes, this version of Mirror
uses no Python at all** — not in the product, not in the package, not in the tooling
that builds or checks it. `src/memory/` and `tests/` are the obvious part. The rest of
the denominator, from `git ls-files '*.py'` on 2026-09-19:

| Where | Files | Disposition |
|---|---|---|
| `ts/parity/` | 76 | The oracle harness and golden generators; they exist to run Python as the oracle. Deleted in **TS5** with the oracle, after the last golden is regenerated |
| `evals/` | 17 | **TS3** |
| `scripts/` | 5 | `check_skill_command_parity.py` (ported to Node — the guard that asserts skills call no Python cannot itself be Python), `check_doc_links.py` (ported), `build_claude_plugin.py` (**US3**), `check_oracle_drift.py` (deleted with the oracle), `reset_sandbox_pet_store.py` (disposition decided in **TS5**) |
| `spikes/ts-search-parity/` | 2 | Historical; deleted in **TS5** |
| `ts/test/fixtures/**` | ~10 | Python-bodied fixture extensions for the catalog and dispatch tests. Rewritten as Node scripts in **TS2** so CI needs no interpreter; the tests still prove "any executable runtime", just not with Python |
| `.github/workflows/tests.yml`, `docs.yml` | 2 | `uv`/Python steps removed in **TS5**; CI runs on Node alone |
| `pyproject.toml`, `uv.lock` | 2 | **TS5**; version authority moves to `package.json` (**US3**) |

The check is mechanical and lands in CI at TS5: `git ls-files '*.py'` is empty, no
workflow installs Python, and no shipped artifact contains a `.py` file or a `uv`
invocation.

## Eval Harness Deletion Gate

The model-behavior release gate is **not a command**, so the burn-down
denominator never covered it and this document did not mention it until
2026-09-13. As written, DS10 would have deleted `evals/` with the Python core
and made the gate unenforceable without anyone deciding to drop it.

The [DS8.TS1 decision](../../../decisions.md#the-eval-harness-transfers-to-typescript-as-a-ds10-gate-not-a-ds8-port)
assigns the harness here. Its subject already moved: every live eval module
imports a Python pipeline function directly, while TypeScript answers eight of
those nine surfaces in production since DS8 (`scene` is the ninth, and reaches
users only through the web process this Delivery Story cuts over). Until the
transfer lands the Python harness remains a valid interim gate, because the
prompts are byte-identical across engines and digest-pinned; its blind spot is
TypeScript-side parsing, coercion, and orchestration, which goldens and unit
tests cover instead.

Before Python retirement or npm publication, DS10 must:

1. land a TypeScript harness at `ts/evals/`, beside `ts/parity/`, carrying the
   Python contract: one module per surface exposing `PROBES` and `THRESHOLD`,
   `--all` discovering modules by capability rather than from a skip-list,
   JSONL run history per eval, and an exit code set by the threshold;
2. run it against the live transport DS8 built, with fixture data moved to
   engine-neutral JSON so both harnesses read the same transcripts while
   Python still exists;
3. decide each module's disposition explicitly, so the `--all` denominator
   shrinks with a reason rather than silently — `routing` is the obvious
   retirement (failing since v0.31.0 on the stale persona fixtures of
   [D-005](../../../debt.md#d-005--evalsroutingpy-fixtures-are-stale-against-the-current-persona-catalog),
   and TypeScript has deterministic `detect-persona` goldens from DS2),
   `scene` follows this story's web cutover, and `retrieval` may duplicate
   `ts/test/search/ranker.test.ts`;
4. **make injection-resistance probes individually blocking rather than
   averaged into a module score**
   ([D-017](../../../debt.md#d-017--injection-resistance-probes-are-averaged-into-a-module-score)).
   The Python contract scores a module as `passed / total` against one
   threshold, so a security probe sits in the same average as quality probes:
   DS8.TS1's validation run reported `scene` **5/6 PASS with
   `scene-injection-resisted` obeyed**. A fence regression on any fenced
   surface can therefore pass the release gate. The TS harness must fail the
   module — and the suite — on any obeyed injection probe, independently of
   the score;
5. update the [development guide](../../../../process/development-guide.md#evals)
   and the [engineering principles](../../../../process/engineering-principles.md)
   so the gate names the TypeScript harness as its subject; and
6. delete `evals/` and the `python -m memory eval` entry point only after items
   1–5 hold.

The baseline to port against exists: DS8.TS1's validation left this home's
first `eval-history/` — twelve JSONL records from the 2026-09-13 `eval --all`
(11/12, `routing` the only failing module). The TS harness's first run is
diffed against those, not against a fresh guess.

The harness is developer tooling, not product surface: it does not ship in the
npm package, and no user-facing command depends on it. That is why it can
transfer at retirement time rather than during the burn-down — but it is also
why nothing else would have caught its deletion.

## Command Surfaces Assigned From DS7 (decision 2026-09-07)

The [DS7.TS1 ops-tail decision](../../../decisions.md#cv22ds7ts1-ops-tail-runtime-splits-rehearsal-and-legacy-migration-retire-in-ds10)
assigns three Python command surfaces to DS10 instead of porting them at parity,
and the [2026-09-09 re-sequencing decision](../../../decisions.md#cv22-makes-the-ported-work-real-before-porting-more)
adds three more (items 4–6). They are excluded from the DS7 burn-down
denominator (29) and served by Python fallback until DS10 acts on them:

1. **`runtime` update/release half** — `update`, `pull`, `stable`, `backup`,
   `release-doctor`, `release-promote`. This is the git-based updater over the
   runtime clone that v0.8.0 introduced (`main` integration, `stable` channel,
   dry-run planning, fast-forward execution, updater self-recovery, tag push).
   npm distribution redesigns the mechanism (versioned installs, dist-tags) rather
   than porting it; whether `release-promote` belongs in the product command
   surface at all, or in release tooling, is a DS10 design decision. The read
   half (`status`, `version`, `diagnose`, `release-notes` — `latest` and
   `pending` are arguments of `release-notes`, not subcommands) is ported by
   DS7.TS3 and is not DS10 scope.
2. **`migrate-legacy`** — the Portuguese-era (`travessia` → `journey`, pre-CV0)
   database conversion. Retired unported, with a documented cutoff in the release
   notes: Portuguese-era databases must be migrated with a pre-DS10 release. The
   tool remains in git history and the last Python-bearing release can still run
   it. Same cutoff pattern as the extension compat host above.
3. **`memory-rehearse-migration`** — the `pyproject.toml` console script
   (`cli/migration_rehearsal.py`) that rehearses the Python migration engine on a
   DB copy. Retired unported: DS6 moved migration custody to TS and proved the TS
   engine over real legacy copies, so the tool validates a retired engine. A TS
   rehearsal tool, if ever wanted, is separate scope against the TS engine.
4. **`journey-projection`** (all subcommands) and the `journey_projections`
   subsystem — CV22.DS7.TS5, reassigned here as a port on 2026-09-09; **retired
   unported on 2026-09-19** as TS1. See the retirement gate above.
5. **The SQLite Refinement Workbench** — `build refinement-story
   create|overview|pull|review|coherence|close|park` (7) and the `build
   change-request` verbs `capture|attach|discard|select|confirm|resume|plan|
   mark-implemented|validate|done|park|reject|promote` (13): **twenty** of the
   Builder tree's **47** leaves. *(Corrected 2026-09-13 at US8 plateau 1, by
   enumerating `cli/build.py`'s subparsers rather than reading the prose: the
   earlier count of fifteen of 42 omitted `refinement-story
   review|coherence|close` and `change-request select|confirm`.)* CV20.DS12
   delivered the document-first Workbench and made
   `docs/project/refinement/index.md` the canonical RS/CR authority; `mm-build`
   reaches the SQLite path only when that index is absent. Retired unported
   with a documented cutoff (US8 decision D1, 2026-09-09): a journey still
   carrying SQLite Workbench rows must adopt the document-first index with a
   pre-DS10 release. Existing rows stay readable through the last
   Python-bearing release. DS7.US8 ports the remaining 27 leaves, refuses these
   twenty **by name**, and must not spend parity effort on them.

   One read survives the retirement and belongs to US8, not here: `build load`'s
   resume and home surfaces render the `🧰 Refinement field` from
   `get_workbench_snapshot` whenever a project has no canonical refinement
   index, so US8 ports that read-only snapshot. DS10 deletes it with the rest.
6. **`conversations --metadata-backfill-preview|-apply`** — the one-shot
   backfill of pre-ES-001 conversation rows (CV9.DS7). Retired unported: the
   lifecycle *engine* is on TS (DS7.US10) and its operator faces are wired by
   DS7.US11; the backfill ran once and validates nothing after that. Cutoff
   documented in the release notes with the others.

## Ownership Boundary

- DS7.US9 *would have* owned recursive hierarchy DTOs, deterministic hierarchy adapters, and
  browser compatibility evidence. It was retired unported on 2026-09-17; nothing inherits
  that ownership, because the surface is deleted rather than transferred.
- DS10 owns the web console's **removal** — process, endpoints, static assets, tests, and
  user documentation — and the Python deletion gate. It does not own a TS web process,
  because there is not going to be one.
- `mirror-gui` owns any future graphical surface over Mirror. DS10 must not pre-empt that
  journey's design by leaving a half-ported web server behind.
- DS10 must not redefine metadata parent authority, recursive ordering, cycle bounds,
  movement validation, conservative removal, or selected-journey isolation. Those semantics
  live in TS independently of the console and survive its deletion; the selected-journey
  isolation contract is re-homed to `mirror-gui`.

## Done Condition

- Every prerequisite selected when DS10 is pulled is done. (DS7.US9 is not among them: it
  was retired unported on 2026-09-17.)
- The web console passes the retirement gate above: cutoff documented, no external
  dependency found, `src/memory/web/` and its `__main__.py` entry and tests deleted, user
  documentation updated, and web-only preferences state given an explicit disposition.
- No web execution path depends on Python — satisfied by deletion, not by replacement.
- The DS7.TS2 legacy extension context host and every core-owned launcher for it are removed.
- The `runtime` update/release path has a TS-owned npm-era replacement with operational
  smoke coverage; `migrate-legacy`, `memory-rehearse-migration`, the SQLite Refinement
  Workbench verbs, and the ES-001 backfill flags are removed with their cutoffs
  documented in the release notes.
- TS1 is done: no TypeScript write spawns Python; the `journey-projection refresh` seam,
  its TS call sites, and the `journey_projections` subsystem are gone; the contract's
  cutoff is in the release note; existing `.mirror/projections/` trees are recorded as
  inert.
- The Zero Python gate holds: `git ls-files '*.py'` is empty, CI installs no Python, and
  the shipped artifact contains none.
- Mirror Desktop is not a prerequisite. Its inventory is recorded above for the
  integration effort that follows.
- No skill copy in any runtime invokes `uv run python -m memory`, and the skill parity
  check asserts the entry point is absent (CR072 brought the assertion forward; DS10
  verifies it holds for the packaged plugin).
- The model-behavior release gate has a TypeScript owner: `ts/evals/` runs against the
  live transport with each module's disposition recorded, the development guide and
  engineering principles name it as the gate's subject, and `evals/` plus the
  `python -m memory eval` entry point are removed only after that holds.
- Python deletion, package rename, npm publication, stable promotion, tag, and release
  remain separate Navigator-authorized actions.

## Out Of Scope Of The Pull

Until 2026-09-19 this document recorded the CR054 convergence owner and deletion gate
only. Pulling DS10 with the candidate table above authorizes planning its child stories,
nothing more: it does not authorize endpoint implementation, define the complete npm
release plan, delete Python, rename packages, publish artifacts, promote stable, tag, or
release. Each of those remains its own Navigator gate inside the story that owns it.
