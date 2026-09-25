[< CV22 TypeScript Core Port](../index.md)

# CV22.DS10 — Python Retirement And npm Distribution

**Status:** 🟢 In Progress — pulled 2026-09-19 with eight approved child stories (**7/8**; TS1
and US1 done 2026-09-19, TS2 2026-09-21, TS3 2026-09-22, TS4 and US2 2026-09-23, **TS5**
2026-09-25). Remaining: **US3** (npm distribution), separately Navigator-authorized. What TS5
leaves it is listed in its [inheritance](cv22-ds10-us3-npm-distribution/inherited.md).
*(Count corrected 2026-09-23 at US2's Pull: it read `3/8` while the candidate table below
already recorded TS3 and TS4 as done — the third instance of the lesson TS4 paid for in US1's
row, and it would have blocked this package's closure preflight.)*
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
| [CV22.DS10.TS1](cv22-ds10-ts1-retire-the-projection-seam-and-subsystem/index.md) | Retire the projection seam and subsystem | Technical Story | TypeScript writes spawn no Python: the `journey-projection refresh` seam and its four TS call sites, the `journey_projections` subsystem, its CLI, its Extension API capability, tests, and fixture are deleted; `.mirror/projections` is no longer published; `mirror.journey-projections@1.0` is sunset with a documented cutoff. Pulled 2026-09-19 as a port (ex-DS7.TS5), re-authored the same day as a retirement after the Navigator placed Mirror Desktop outside the migration | ✅ **Done — 2026-09-19.** TypeScript writes spawn no Python; 5,528 lines removed; cutoff staged; D-018 and D-019 carried |
| [CV22.DS10.US1](cv22-ds10-us1-web-console-retirement/index.md) | Web console retirement | User Story | Cutoff published naming `mirror-gui` as successor; a repository-wide check finds nothing outside `src/memory/web/` depending on the console; `src/memory/web/`, the `web` entry in `__main__.py`, and `tests/unit/memory/web/` deleted; README, REFERENCE, and getting-started updated in the same change; `<mirror-home>/web/` disposition recorded; no TS replacement built | ✅ **Done — 2026-09-19.** `python -m memory web` no longer exists; **5,480 lines across three layers**, two of which the gate never named — the six web-only modules in `src/memory/surfaces/` and `intelligence/scene.py`, whose only consumer was the console. `scripts/check_retired_surfaces.py` asserts the absence mechanically; `<mirror-home>/web/preferences.json` is left inert by explicit decision. **Row corrected 2026-09-23** during CV22.DS10.TS4: US1's own `done.md` recorded that this row had been updated, and it had not |
| [CV22.DS10.TS2](cv22-ds10-ts2-extension-compatibility-host-deletion/index.md) | Extension compatibility-host deletion | Technical Story | `memory.extensions.compat_host` (context and `cli` modes) and every TS launcher branch that invokes it removed; providers without `provider_runtime` fail explicit and fail-soft; the migration cutoff documented; a repository/package check proves every retained provider and command enters through a declared language-neutral runtime | ✅ **Done — 2026-09-21.** Host and all three launcher branches deleted; refusal + `no_provider_runtime` fail-soft landed; `compat-host` row added to the retired-surface check; cutoff published; three daily-use extensions migrated to `mirror-cli-v1` in `automation`; google-ads/meta-ads retired under the cutoff; D-018 decided (VERSION frozen at 1.1) |
| [CV22.DS10.TS3](cv22-ds10-ts3-eval-harness-transfer-to-ts-evals/index.md) | Eval harness transfer to `ts/evals/` | Technical Story | The Python contract carried (`PROBES` and `THRESHOLD` per module, capability discovery for `--all`, JSONL history, threshold exit code); fixtures engine-neutral; each module's disposition recorded (`routing` retired, `scene` follows US1, `retrieval` decided); injection probes individually blocking (D-017); first run diffed against the 2026-09-13 `eval-history/`; development guide and engineering principles name the TS harness; then `evals/` and the `eval` entry deleted | ✅ **Done — 2026-09-22.** Nine modules answer from TS through the live provider; **70/70 probe verdicts identical to Python**, every `prompt_hash` and pinned model byte-identical; D-017 fixed (six blocking injection probes); `routing` and `retrieval` dispositions recorded; `evals/`, its 252 tests, and the `eval` entry deleted behind an `eval-harness` retired-surface row |
| [CV22.DS10.US2](cv22-ds10-us2-npm-era-updater-and-release-tooling/index.md) | npm-era updater and release tooling | User Story | A TS-owned replacement for `runtime update`, `backup`, `release-doctor`, and `release-promote`, designed around versioned installs and dist-tags rather than ported, with operational smoke coverage. *(Surface corrected 2026-09-23 at Pull: this row listed six subcommands, but `runtime pull` and `runtime stable` have never existed on either engine — argparse answers `invalid choice`, exit 2. `pull` is the update planner's action and `stable` is the channel, the same transcription error `runtimeRoute.ts` already corrected for `latest`/`pending`. Four subcommands, and two of six `PYTHON_ALLOWLIST` entries guard commands that never were.)*; `release-promote`'s product-versus-tooling placement decided; `mm-update` stops calling Python; `PYTHON_ALLOWLIST` goes empty and the skill parity check asserts the entry point is absent, including for the packaged plugin | ✅ **Done — 2026-09-23.** `runtime update`, `runtime backup` and the new `runtime migrate` (D8) answer from TypeScript with **no interpreter spawned**, proven by a smoke that shadows `python`/`python3`/`uv` — the updater's first operational coverage since v0.8.0 introduced it, 34 assertions on both CI platforms. **`PYTHON_ALLOWLIST` no longer exists**: the mechanism was deleted, not emptied, and the guard enforcing its absence is itself Node, having run beside the Python original in CI until they agreed. The release chain moved to `npm run release:*` and its old names answer their cutoff *before dispatch*, so a stray `--push` reaches nothing. Two departures from the oracle, both deliberate: `capture` is a stage, so recovery prints a real commit or version; and `migrate` runs in a **fresh process on the newly installed code**, correcting an oracle that migrates in-process with the code it just replaced. Debt **D-025** (a declined migration reports success) is a **blocker for TS5**; D-026 and D-027 go to US3 |
| [CV22.DS10.TS4](cv22-ds10-ts4-retire-the-unported-surfaces-with-cutoffs/index.md) | Retire the unported surfaces with cutoffs | Technical Story | `migrate-legacy`, `memory-rehearse-migration`, the twenty SQLite Refinement Workbench leaves plus the `get_workbench_snapshot` read, the `conversations` metadata-backfill flags, and `journey export-registry` / `journey mutate` (`journey_admin`, 345 lines, arrived in the pause-window merge and never entered the DS7 denominator — see CR089 for the front-door mis-route) removed, each with its cutoff in the release note | ✅ **Done — 2026-09-23 (~7,700 lines).** Five surfaces deleted across both engines behind five published cutoffs and five `check_retired_surfaces` rows. The front door gained a third route shape, **`retired`**: a removed name now answers in one line naming its cutoff and exits 1, before any dispatch — so `journey mutate` never reads the JSON on its stdin and no argument reaches the message or the log. That closed **CR089**, whose silent no-op on a write was the sharpest routing defect this migration produced; its other half turned out to be parity with Python and became **CR095**, after TS5. `build load` is byte-identical for a project with the canonical index; without one the Refinement field now has a single file-first state. The 62 Workbench rows and migrations `015`/`016` are untouched, with the read recipe in the cutoff. Debt: **D-023**/**D-024** carried to TS5 |
| [CV22.DS10.TS5](cv22-ds10-ts5-python-core-deletion/index.md) | Python core deletion | Technical Story | `src/memory/`, its tests, the `uv` and `pyproject` Python surface, the front door's `fallbackPython` path, and the `MIRROR_TS_*` revert gates removed; existing `memory.db` files keep working; every runtime operates over TS only. Separately Navigator-authorized | ✅ **Done — 2026-09-25 (~112,000 lines).** Pulled and planned 2026-09-23, panel-reviewed, five plateaus, Navigator validation accepted on the second walk, the full panel's handoff review, and the Debt Review, all in three days. Plateaus 0–1: the oracle frozen and a 29-family capture taken against a real database copy; three guards ported to Node; identity and version off `pyproject.toml` (D1); **D-025 paid**; every runtime hook Node, 10/10 against the Python hooks by row-diff. **Plateau 2 (2026-09-24): the fallback is gone** — `fallbackPython`, the twenty-one `MIRROR_TS_*` revert gates, and the `"python"` transport mode deleted; TypeScript owns every answer, including unknown names (D2) and flag-first invocations (F5, which also closed two silent writes on live TS routes); the interpreter shadow is a **required** CI check with 0 spawns; **D-023 and D-024 paid**. **Plateau 3 (done, 2026-09-24): the repository holds no Python** — `git ls-files '*.py'` is empty, `pyproject.toml` and `uv.lock` are gone, no workflow installs an interpreter (~112,000 lines), behind the recovery tag `cv22-last-python-bearing` (`b0d34254`); the `python-core` row enforces it. Three Navigator decisions closed it: a command-skill's entrypoint is optional (D10), the Frame's version reads `ts/package.json` (D11), and the front door names itself `mirror` (D12). The per-family capture replays 28/29 identical, the one difference D12's named line. It also found and fixed a plateau-1 regression: Gemini assistant turns were not being logged (F11). **Plateau 4 (2026-09-24): nothing tracked tells anyone to run Python** — the documentation rewritten for a Node-only core (REFERENCE, getting started, architecture, engineering principles, configuration, the runtime-interface spec around the Node hook entries, the extension guides around the two runtime protocols), the Python API page deleted (D15), the docs naming the program `mirror` with one bridge until US3 (D14), the Plan scaffold's `uv` line removed (D13), and the `python-core-mentions` row **live** in CI; the `python-core` cutoff is written. The first Navigator walk (2026-09-25) found a write race between concurrent hooks, fixed since (F21), and a clone-role gap accepted as a known risk until the production clone takes the CV22 release (F20). The second, shorter walk was accepted the same day. The panel's handoff review followed and found one blocker: migrate-on-open never ran the bootstrap schema, so a home from v0.7.0 or earlier broke in Mirror Mode after migrating. It was fixed with every other finding the same day ([handoff review](cv22-ds10-ts5-python-core-deletion/handoff-review.md)). The Debt Review then met a trigger firing live: **CR084**, the bootstrap lock's window for two holders, turned CI red on both attempts, and was paid rather than re-run (`1b947cdd`, green on both legs). It also rejected CR088 and CR092, promoted CR093 to US3, captured CR099, and corrected four ledger records ([review](cv22-ds10-ts5-python-core-deletion/review.md)). What TS5 hands US3 is in US3's [inheritance](cv22-ds10-us3-npm-distribution/inherited.md). Nine inventory findings in [inventory.md](cv22-ds10-ts5-python-core-deletion/inventory.md), the sharpest being that five families' flag-first forms were answered only by Python, a class the slice-A inventory classified by reading and plateau 2 found by running both engines |
| CV22.DS10.US3 | npm distribution | User Story | Package rename and a single-language npm artifact; the Pi, Gemini CLI, Codex, and Claude Code install paths resolve from it; publication, stable promotion, tag, and release remain separate Navigator gates. **Amended 2026-09-23 by US2 (decision D4):** two Python-calling layers are re-homed here, because their new shape depends on the npm artifact's `bin` and install path. `frame/main/command-registry.js` spawns `uv run python -m memory` for **eight** commands (`identity list` twice, `runtime status`, `init`, `seed`, `runtime version`, `journeys`, `detect-persona`) from JavaScript, where neither the skill guard nor the retired-surface check can see it — and the Frame deliberately has no `updateMirror` entry, because the git updater "atualizaria só o clone, deixando o executável instalado operando contra uma minor futura": a versioned install is exactly what that comment is waiting for. `installer/` is six PowerShell files whose stated premise is that Mirror is a git clone *so that* `runtime update` fast-forwards in place | 🟡 Planned |

Eight stories, approved 2026-09-19, in the order the gates below constrain: TS1 first
(the package's own ordering note — the projection cutover is the act that retires
Python's publisher); US1 before the deletion and npm gates open (the roadmap row: after
zero commands, delete the web process, *only then* plan the rest); TS2–TS4 clear the
remaining gates; TS5 and US3 last and separately authorized. The codes are renumbered
under DS10 — the projection story keeps its `DS7.TS5` lineage in its title because that
is how the decisions log and the burn-down ledger refer to it.

## Workspace And Web Retirement Gate

**Satisfied 2026-09-19 by [US1](cv22-ds10-us1-web-console-retirement/index.md).** All six
items below hold; the deletion also reached two layers this gate did not name — the six
web-only modules in `src/memory/surfaces/` and `intelligence/scene.py`, whose only
consumer was the console — and `scripts/check_retired_surfaces.py` now asserts the
absence mechanically, for this surface and for TS1's.

This gate replaced the convergence gate on 2026-09-17. Python core deletion was blocked
until all of the following were true:

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

**Satisfied 2026-09-21 by [TS2](cv22-ds10-ts2-extension-compatibility-host-deletion/index.md).**
All five items below hold, and `scripts/check_retired_surfaces.py` now asserts items 2
and 5 mechanically through a `compat-host` row covering both the module and the
launcher seams that called it. The deletion also reached one layer this gate did not
name: the install-time `register(api)` import, which was the last place the core
loaded extension code.

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

**Satisfied 2026-09-23 by [US2](cv22-ds10-us2-npm-era-updater-and-release-tooling/index.md).**
All three items hold, and the check that proves it is no longer written in the
language it forbids:

1. **No skill copy invokes Python.** `mm-update` was the last one, flipped in
   all three copies at plateau 3. `PYTHON_ALLOWLIST` is **empty** — and then
   deleted, mechanism and all, because an empty dictionary invites the next
   story to add a row to it.
2. **The check asserts ABSENCE**, not agreement. `ts/scripts/checkSkillCommandParity.ts`
   fails on any `uv run python -m memory` line, with no exemption path. It ran
   in CI beside the Python original for exactly one commit and both agreed — on
   a clean tree and on a seeded regression, same exit code, same first problem
   line — before the original was deleted.
3. **The packaged plugin is scanned whole** — manifest, commands, hooks, skills
   — not just `plugins/mirror-mind/skills/`, because an installed user resolves
   that directory rather than this repository's `.pi/`.

One residue is recorded rather than fixed here, because it belongs to another
repository: the **installed-user extension skills** (`ext-session-export`,
`ext-persona-export`) still carry 17 `uv run python -m memory ext ...`
invocations. They are shipped by the `automation` repository through
`extensions sync`, not by this one, and they break at TS5. The note lives with
TS2's cutoff, which already told extension authors to migrate.

The original gate text follows, as written on 2026-09-09.

---

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
4. document the cutoff in [Pending Cutoffs](../../../../releases/pending-cutoffs.md) —
   CV22 releases once, so the retirement stories stage their cutoffs there and the
   single release note carries them: `journey-projection` and
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
| `ts/parity/` | ~~76~~ **0** | ✅ **TS5, 2026-09-24.** The oracle harness and golden generators, deleted with the oracle after the last regeneration at plateau 2, together with the library under them (`ts/src/parity/`, inventory F10). The goldens are frozen fixtures (`ts/test/goldens/README.md`); the two custody proofs that grade TypeScript against committed fixtures moved to `ts/smoke/`, and the demo-database generator was ported to TypeScript |
| `evals/` | ~~17~~ **0** | ✅ **TS3, done 2026-09-22.** Deleted with `tests/unit/memory/evals/` (32 files, 252 tests) and the `python -m memory eval` entry. The three helpers that fed the port — input capture, fixture-equality check, support-golden generator — died with it, since each imported what the story removed |
| `scripts/` | ~~5~~ **5, and the count was wrong** | **Corrected 2026-09-23 by US2.** The gate said 5 and `git ls-files 'scripts/*.py'` said **6**: the missing file was `check_retired_surfaces.py`, added 2026-09-21 by US1 — two days AFTER this table was written — and it is the guard that mechanically enforces every retirement TS1–TS4 performed. It had no disposition in any story. Current dispositions: ~~`check_skill_command_parity.py`~~ ✅ **ported to Node and deleted by US2** (a guard that asserts nothing invokes the interpreter cannot itself need it; both ran side by side in CI and agreed before the Python one went); `check_retired_surfaces.py` (**TS5** — it must outlive the deletion it proves); `check_doc_links.py` (**TS5**); `build_claude_plugin.py` (**US3**); `check_oracle_drift.py` (deleted with the oracle in **TS5**); `reset_sandbox_pet_store.py` (disposition decided in **TS5**). ✅ **TS5, 2026-09-24: 0 left.** The two guards and the plugin builder ported to Node (the builder moved from US3 by decision D6), each agreeing with its original before the original went; `check_oracle_drift.py` and the caller-less `reset_sandbox_pet_store.py` deleted |
| `spikes/ts-search-parity/` | ~~2~~ **0** | ✅ Historical; deleted in **TS5** (2026-09-24) |
| `ts/test/fixtures/**` | ~10 → **6** | Python-bodied fixture extensions for the catalog and dispatch tests. **TS2 converted the dispatch tree** (2026-09-21): five Node commands and one `sh` script, which is what now proves "any executable runtime" — and it proves it better than Python did, because the runtime is no longer the interpreter the core happens to ship. **Six inert bodies remain** in `ext-catalog-writes/` and `extension-catalog/`, and they convert in **TS5**, not TS2. The reason is the one this table already applies to `ts/parity/`: their BYTES are graded by Python-recorded goldens, and Python's manifest validator only resolves `entrypoint.module` to a `.py` file. Converting them would make the Python oracle call the fixture invalid, so the golden could not be regenerated — the fixture and its oracle die together or not at all. They are executed by nothing, imported by nothing (install stopped importing at TS2), and referenced by no declared runtime command. The gate's actual requirement — *CI needs no interpreter* — is met and **mechanically enforced** by the `Extension suites need no interpreter` CI step, which shadows `python`/`python3`/`uv` with stubs that exit 66. ✅ **TS5, 2026-09-24: 0 left** — the six bodies are gone and their fixtures declare no entrypoint, once decision D10 made it optional; the catalog goldens were hand-edited with the reason |
| `frame/`, `installer/` | 0 `.py`, but **9 Python call sites** | **Added 2026-09-23 by US2.** Not a `.py` denominator entry, which is why the original table missed it: `frame/main/command-registry.js` spawns the interpreter for eight commands *in JavaScript*, and `installer/` assumes a `uv`-bearing git clone across six PowerShell files. Both are invisible to `check_skill_command_parity` (skills only) and to `check_retired_surfaces` (paths and imports). Re-homed to **US3** by decision D4; recorded here so the zero-Python claim cannot be made while they stand. **Still open at TS5's close, by design:** they also find their root by the deleted `pyproject.toml` (TS5 F12, D11), and the `python-core-mentions` guard exempts their files by name, with this reason, until US3 |
| `.github/workflows/tests.yml`, `docs.yml` | 2 | ✅ **TS5, 2026-09-24.** `uv`/Python steps removed; CI runs on Node alone, the `python-core` row fails any workflow that installs an interpreter, and the whole suite runs a second time with the interpreters shadowed |
| `pyproject.toml`, `uv.lock` | ~~2~~ **0** | ✅ **TS5, 2026-09-24.** Deleted (D11). Version authority moved to `ts/package.json` in TS5 itself (D1), not US3; US3 renames the package and drops `private` |

The check is mechanical and lands in CI at TS5: `git ls-files '*.py'` is empty, no
workflow installs Python, and no shipped artifact contains a `.py` file or a `uv`
invocation.

**Satisfied for the repository, 2026-09-24 (CV22.DS10.TS5).** `git ls-files '*.py'`
is empty; `pyproject.toml` and `uv.lock` are absent; no workflow installs an
interpreter; and both halves of the `python-core` row run in CI — absence since
plateau 3, mentions since plateau 4. **Not yet satisfied for the shipped
artifact:** `frame/` and `installer/` still call Python, which is US3's to close
when it defines the npm package they install.

## Eval Harness Deletion Gate

**Satisfied 2026-09-22 by [TS3](cv22-ds10-ts3-eval-harness-transfer-to-ts-evals/index.md).**
All six items below hold, and `scripts/check_retired_surfaces.py` now asserts
the absence mechanically through an `eval-harness` row. Two things the gate did
not ask for and got anyway: the first TS suite run agreed with Python on **all
70 probe verdicts in both directions**, and the fixtures were *captured by
executing the Python probes* rather than transcribed, so the transcripts could
not drift silently in translation. One thing the gate asked for and did not
get: the run's actual cost, because eval probes reach the provider without a
ledger hook — carried to Debt Review rather than dropped.

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
   **`scene` was retired on 2026-09-19 with the web console** (US1) — the surface
   it graded reached users only through that process, so the disposition is
   settled and the denominator is eleven; and `retrieval` may duplicate
   `ts/test/search/ranker.test.ts`. One question US1 surfaced and left here:
   `eval-history/scene.jsonl` keeps six runs of a module that no longer exists,
   including the run that produced D-017's evidence. Decide whether history
   follows the harness to `ts/evals/`, stays behind as a record, or is dropped —
   deleting a module did not delete its measurements, and nothing has decided
   what should;
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
