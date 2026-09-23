[< Story](index.md)

# Plan — CV22.DS10.US2

**Status:** drafted 2026-09-23 at the Plan checkpoint; **panel review done 2026-09-23, its
findings folded below**; awaiting Navigator approval of the Plan and D1–D8.
**Driver:** Vinícius. **Delivery:** the `mirror-ts-core` branch (PR link once open).

---

## Objective

Replace the git-clone updater and the release chain that `src/memory/cli/runtime.py`
carries — ~1,459 lines across `update`, `backup`, `release-doctor`, `release-promote` —
with a TypeScript mechanism designed for the world US3 creates (versioned installs
following dist-tags) that still works in the world every user lives in today (a git
clone following `origin/<channel>`). Keep the safety chain in substance: a gate before it
moves, a verified backup, an explicit failure with a printed recovery route, a self-repair
lane. Move the release chain out of the product surface. Empty `PYTHON_ALLOWLIST`, make
the parity guard assert *absence* in a language that survives TS5, and give the updater the
operational smoke it has never had.

## What Is True Before This Story

The full inventory is in the [story index](index.md#what-the-inventory-found). What the
Plan depends on, including the four facts the panel established:

- **Four subcommands, not six.** `runtime pull` and `runtime stable` do not exist on
  either engine (argparse `invalid choice`, exit 2). `DS10_RUNTIME_SUBCOMMANDS`
  (`ts/src/frontDoor/runtimeRoute.ts:53`) and `PYTHON_ALLOWLIST`
  (`scripts/check_skill_command_parity.py:65`) both carry them.
- **`update --check` is already TypeScript.** `checkUpdateAvailability`,
  `renderRuntimeUpdateAvailability`, and `inspectGitUpdatePlan` in `ts/src/runtime/git.ts`
  are golden-graded against Python (`runtime-git.golden.json`, 11 scenarios) and reached
  only by the welcome card, because the route refuses `runtime update` wholesale.
- **`runtime backup` ≠ `backup`.** `verify_backup_archive`, `render_backup_verification`,
  `render_runtime_backup_created` (`runtime.py:1052-1113`) have no TS counterpart; the
  update pipeline's `_try_runtime_backup` depends on all three.
- **There is no `migrate` verb on either engine.** Python's `_apply_migrations` calls
  `_attempt_database_bootstrap` **in-process** — which means the oracle applies migrations
  with the *old* code it just fast-forwarded away from. `runtime status` opens the database
  read-only (the Frame's registry depends on exactly that), so it cannot stand in for a
  migration step. TS-side, migrate-on-open (`ts/src/db/migrateOnOpen.ts`, DS6) fires only
  through the live-write seam.
- **The pipeline's stages are named and ordered**: `status gate` → `backup` →
  `verify backup` → `plan` → `fetch` → `plan` → `fast-forward` → `migrations` →
  `post-update status` (+ `status recovery` / `post-update status recovery`). The gate's
  relaxed lane (`_status_allows_update_preflight`) lets *only* core-migration ledger drift
  through, so old code cannot block the update that would teach it a newer migration.
- **`verify_backup_archive` checks five things**, and a SQLite header is not among them:
  the file exists; the zip is readable; **no entry is absolute or contains `..`**; `memory.db`
  is present; nothing outside `{memory.db, memory.db-wal, memory.db-shm}` is present.
- **The Python oracle still exists** and the goldens grade against it. Any string this
  story changes in a golden-graded render is either changed on both engines or is a
  recorded deviation.
- **Every DS7 flip shipped with a revert gate** (`MIRROR_TS_*=0` → Python). TS5 removes
  them all.
- **There is no npm package yet.** `ts/package.json` is `mirror-core@0.0.0`, `private`,
  no `bin`. US3 renames and publishes. Whatever this story builds for the `package`
  install kind can be exercised against a packed tarball, never against a registry.
- **The Navigator has exactly one production clone:** `~/dev/workspace/mirror` — role
  default (production), channel default (stable), HEAD `7cfbfbb` (2026-09-02), which
  predates every DS10 story. This repository (`mirror-ts-core`) is `dev`/`main` and the
  updater refuses `dev` by design. Validation must happen on the production clone or it
  validates a refusal.
- **The Frame refused the git updater on purpose** (`frame/main/command-registry.js:47-53`):
  it would update the clone but not the installed executable. It is waiting for a
  versioned-install mechanism.
- **The parity guard already asserts absence when its list is empty.** `allowlisted()`
  returns `None` for every invocation once `PYTHON_ALLOWLIST` is `{}`, and every Python
  invocation then fails. Gate item 2 is satisfied by emptying the list; the remaining
  work is the guard's own language (it is Python) and the packaged plugin's resolution.

## The Design

Stated once, so the design is what was reviewed.

**An install has a kind, detected from where the front door itself lives — never
configured.**

- `clone` — the front door's own path resolves inside a git work tree whose root holds
  `ts/package.json`.
- `package` — the path resolves **under `npm root -g`**, resolved once per run. A
  project-local `node_modules/` is *not* a `package` install: `npm install -g` would then
  update a tree that is not the one running.
- `unknown` — anything else. Every update verb refuses with the reason printed.

**One pipeline, two apply strategies.** The pipeline is what the product promises and what
the smoke proves:

*gate → capture → backup → verify → apply → migrate → validate*

Every stage records `pass | fail | skip` with a detail; the run stops at the first `fail`;
a recovery block is printed on any failure; `--repair-updater` runs a minimal gate (clean
tree or reinstallable package, mirror home resolvable, optional backup), skips migrations,
and tells the user to rerun `runtime update`. Only `apply` differs by kind:

| | `clone` | `package` |
|---|---|---|
| upstream | `origin/<channel>` — as today | dist-tag `<channel>` on the package named by its own `package.json` |
| `--check` | the already-ported `checkUpdateAvailability` | `npm view <name> dist-tags --json` vs the installed `version` |
| `--dry-run` | ancestry plan (`inspectGitUpdatePlan`) + pending release notes | resolved target version from the dist-tag + release note for it when present |
| capture | `git rev-parse HEAD` | installed `version` from the package's own `package.json` |
| apply | `git fetch` + `git merge --ff-only origin/<channel>` | `npm install -g <name>@<resolved-version>` |
| refuses when | `dev` role, dirty tree, diverged, local ahead — as today | `unknown` kind, `npm` absent, path not under `npm root -g` |
| recovery | `git reset --hard <captured sha>` | `npm install -g <name>@<captured version>` |

**`capture` is a stage, not an implementation detail.** It runs before `backup` and records
the exact value the recovery block will print. `npm install -g` is not atomic; a failed
install leaves a broken tree, and a pinned reinstall is the only rollback there is. A
recovery route without values is a sentence, not a route.

**The `package` apply installs a resolved version, never a bare tag.** `npm view` resolves
the dist-tag first; the resolved version is printed by `--check`, by `--dry-run`, and in
the apply stage's detail, and recorded in the log. Following a mutable tag is the normal
posture of `npm update -g`; the proportional control is that the version you got is
visible and reversible, not a signature ceremony.

**Migration is an explicit stage with its own entry point (D8).** The updater's `migrate`
stage spawns the **new** front door — the code that was just installed — on a new
TS-owned verb, `runtime migrate`: it opens the database through the DS6 seam, applies
pending TS-authored migrations behind migrate-on-open's own backup, and prints the
`_migrations` ledger before and after. The `validate` stage then spawns `runtime status`,
which is read-only and reports ready. Two spawns, two stages, two honest names. This is
also a correction of the oracle, which migrates in-process with the pre-update code.

**Channels keep their names and are scoped like their install.** `stable` and `main` are
the product's channels; for a `clone` they resolve to `origin/<channel>` and are read from
the tracked `.mirror-update-channel` marker, as today. A `package` install is one install
per **OS user**, so its channel is read from `${XDG_CONFIG_HOME:-~/.config}/mirror/update-channel`
— one line, default `stable` — and **not** from the Mirror home: this machine already has
more than one home over a single global install, and a per-home channel would let the last
`mm-update` silently re-tag the other. `<home>/runtime/` stays a cache
(`update-check.json`) and gains no configuration. `--channel` overrides both. US3
publishes with `latest` pinned to `stable`.

**One log line per update.** `<mirror-home>/front-door.log` already records every routing
decision. The updater appends one entry — kind, channel, from → to (resolved version or
commit), each stage's result, exit code. Months later that line is the only evidence of
what moved.

**Release tooling leaves the product surface.** `release-doctor` and `release-promote`
are maintainer operations — they need a git checkout, a clean tree, tags, and push rights.
An installed user has none of these and must never be offered them. They move to
`ts/scripts/release-doctor.ts` and `ts/scripts/release-promote.ts`, exposed as
`npm run release:doctor -- --target vX.Y.Z` and `npm run release:promote -- --target
vX.Y.Z [--push]` from `ts/`. The front door answers `runtime release-doctor` and `runtime
release-promote` with TS4's `retired` shape — one line naming the new entry point and the
cutoff, exit 1, before dispatch. Promote is structured as an ordered list of steps so that
US3 appends `npm publish` and `npm dist-tag add` without restructuring it.

**Version authority is one function.** `packageVersion()` in `ts/src/runtime/version.ts`
(today `versionFromPyproject`) is the only place the doctor, the updater, and the welcome
card read the product version. US3 changes its body to read `package.json`; nothing else
moves. No "sources agree" check is added now, because `ts/package.json` is deliberately
not a real package yet.

**The recommendation strings become engine-neutral.** `renderRuntimeUpdateAvailability`
prints `Preview: uv run python -m memory runtime update --dry-run` on both engines. The
invocation prefix was a Python-era assumption; the *command* is the same on both, and the
npm-era invocation does not exist until US3 defines a `bin`. Both engines print
`Preview: runtime update --dry-run` / `Update: runtime update`; the golden is regenerated
from Python after Python's two strings change; parity holds byte-for-byte.

**The guard speaks the language it guards.** `check_skill_command_parity.py` is ported to
`ts/scripts/check-skill-command-parity.ts` with the allowlist mechanism *deleted*, not
emptied: the assertion is "no `uv run python -m memory` in any of the three copies, and
none in the packaged plugin's manifest, commands, or hooks either".

## Scope

### A. Correct the surface, and own the answer nobody owns

- `DS10_RUNTIME_SUBCOMMANDS` → `{update, backup, release-doctor, release-promote}`.
- `PYTHON_ALLOWLIST` loses `runtime pull` and `runtime stable`.
- **`runtime <unknown-subcommand>` becomes a TS answer**: a usage line naming the real
  subcommands, exit 2, matching what argparse renders today closely enough that the pin is
  meaningful. Today `runtime pull` reaches Python by fallthrough; at TS5 that fallthrough
  disappears and nobody owns the answer. Own it here, pin it, and only then delete
  `DS10_RUNTIME_SUBCOMMANDS` (end of §E) — no dead set left behind.
- The runtimeRoute comment that corrected `latest`/`pending` is extended to say the same
  of `pull`/`stable`.

### B. `runtime backup` on TypeScript

- `ts/src/runtime/backup.ts`: `verifyBackupArchive` as a **characterization of Python's
  five checks** — exists; readable zip; **no absolute entry and no `..` component**;
  `memory.db` present; nothing outside `{memory.db, memory.db-wal, memory.db-shm}` — plus
  one addition: the entry is extracted to a temp dir and `PRAGMA quick_check` runs
  read-only against it. A backup that has never been opened is a belief; this is what
  makes `verify backup: pass` mean something, and it costs little on a 50 MB database.
- `renderBackupVerification`, `renderRuntimeBackupCreated`. Reuse DS7.TS1's `#backup/*`
  for creation.
- `runtimeRoute.ts` routes `runtime backup [--mirror-home]` and `runtime backup --verify
  PATH` to TS behind `MIRROR_TS_RUNTIME_UPDATE`. Exit codes as Python: 0 valid, 1
  otherwise; `Database not found:` to stderr.
- Golden `runtime-backup.golden.json` from `ts/parity/generate_runtime_backup_golden.py`:
  create, verify-valid, verify-missing, verify-not-a-zip, **verify-traversal-entry**,
  verify-unexpected-entry, verify-missing-db. The `quick_check` addition is **not** in the
  golden: for every golden scenario the database is intact and both engines print the same
  bytes. A corrupt-database archive is a TS-only test with the deviation recorded in the
  test's docstring — Python would call it valid.

### C. The updater — five modules, not one

`runtime.py` is 2,954 lines because everything about `runtime` lives in one file. The
tests already know the boundaries; the source follows them:

- `ts/src/runtime/installKind.ts` — `detectInstallKind(frontDoorPath)` → discriminated
  union `{kind: "clone", repository} | {kind: "package", root, name, version} |
  {kind: "unknown", reason}`; `npm root -g` resolved once and injected.
- `ts/src/runtime/updatePipeline.ts` — stages as data, the runner that stops at the first
  `fail`, the recovery render (with captured values), the log-line writer.
- `ts/src/runtime/strategies/clone.ts` — check, plan, capture, apply (`fetch` +
  `merge --ff-only`), repair.
- `ts/src/runtime/strategies/package.ts` — check (`npm view`), plan, capture, apply
  (`npm install -g <name>@<resolved>`), repair (reinstall at captured version).
- `ts/src/runtime/updateCheck.ts` — `--check` and `--dry-run` for both kinds, reusing
  `checkUpdateAvailability` / `inspectGitUpdatePlan` for `clone` and the ported
  `buildRuntimeUpdateDryRun` (the read-half omission `status.ts:16` names).
- `ts/src/runtime/migrate.ts` — the `runtime migrate` verb (D8): open through the DS6
  seam, apply pending migrations, print the `_migrations` ledger before and after, exit
  0/1. Spawned by the pipeline; usable directly when an update was interrupted.
- The relaxed gate (`_status_allows_update_preflight`) ported as a pure function with a
  table test: only core-migration ledger drift passes; dirty tree, missing DB, unready
  extension, mirror-home error do not.
- Every git and npm invocation goes through one injectable runner; unit tests drive the
  pipeline with scripted outcomes and never touch a real remote or registry.
- Spawns pass the environment explicitly — `NODE_OPTIONS`, `MIRROR_HOME`, `MIRROR_USER`
  and whatever the env-file supplied — because a spawned front door does not inherit
  `--env-file`.
- `--repair-updater` is also the automatic fallback when the status gate **throws** (not
  merely reports not-ready), which is the failure the lane exists for.
- `runtimeRoute.ts` routes `runtime update` (all four modes) and `runtime migrate` to TS
  behind `MIRROR_TS_RUNTIME_UPDATE`.
- `PYTHON_ALLOWLIST` loses `runtime update`.

### D. `mm-update`, the allowlist, and the guard's language

- `mm-update` in `.pi/skills/`, `.claude/skills/`, `plugins/mirror-mind/skills/` invokes
  `NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts runtime update`.
  The skill keeps its instruction not to substitute `git pull`, and adds:
  "`MIRROR_TS_RUNTIME_UPDATE=0` sends the command back to Python with no code change", as
  `mm-backup` words it.
- `ts/scripts/check-skill-command-parity.ts`: byte-identity of `.claude` and the plugin
  copies; entry-point agreement per command; **absence** of `uv run python -m memory` in
  all three copies and in `plugins/mirror-mind/**` (manifest, commands, hooks, skills).
  No allowlist. Output format kept so `docs.yml`'s expectations do not change.
- One commit runs both guards in `docs.yml`; the next deletes
  `scripts/check_skill_command_parity.py` and its row in the Zero Python gate table
  becomes **done — US2**.

### E. Release tooling — doctor and promote leave the product surface

- `ts/scripts/release-doctor.ts`: the same eight checks (repository, clean tree, package
  version via `packageVersion()`, release note exists, heading, index link, tag state,
  stable-ref relation), the same `[✓] [!] [✗]` checklist, exit 1 on any fail. Read-only.
- `ts/scripts/release-promote.ts`: doctor → create-or-reuse tag at HEAD → create-or-ff
  `stable` → `--push` pushes tag and branch; `--dry-run` prints the steps. Steps as an
  ordered array so US3 appends publish and dist-tag.
- `ts/package.json` `scripts`: `release:doctor`, `release:promote`.
- Front door: `runtime release-doctor` / `runtime release-promote` join TS4's `retired`
  table with a `pending-cutoffs.md` section, *Release tooling leaves the product command
  surface*. `DS10_RUNTIME_SUBCOMMANDS` is deleted here, after §A's unknown-subcommand
  answer exists.
- `PYTHON_ALLOWLIST` is now `{}` — and then, per §D, gone.

### F. The strings that instruct Python

- `ts/src/runtime/git.ts:453,456` and `src/memory/cli/runtime.py:1278-1315`: `Preview:
  runtime update --dry-run` / `Update: runtime update`. Python tests
  (`test_runtime.py:831,849,850`) updated; `runtime-git.golden.json` regenerated **from
  Python after Python changes**, never the other way; TS test passes unchanged.
- `src/memory/cli/welcome.py:268` / `ts/src/welcome/card.ts:311`: already neutral; pinned
  by a test that greps both renders for `uv run python`.

### G. Smoke, docs, gate records

- `scripts/smoke_runtime_update.sh` — see the test guide. Added to the pre-push set in
  the development guide and to `tests.yml`.
- `REFERENCE.md` §Runtime and §Release; `docs/process/engineering-principles.md:565-582`;
  `docs/process/release-notes.md:15`; `docs/process/runtime-repair-policy.md`;
  `docs/process/versioning.md`; `docs/product/architecture.md` where it names the updater.
- DS10 index: Skill Invocation Gate items 1–3 checked with evidence; Zero Python gate
  table corrected (`scripts/` = 6, `check_retired_surfaces.py` → TS5,
  `check_skill_command_parity.py` → done US2, `check_doc_links.py` → TS5); US3's candidate
  row amended per D4; `frame/main/command-registry.js` added as a Zero Python gate row.
- `docs/releases/pending-cutoffs.md`: the release-tooling section (§E) and, per D5, the
  installed-extension-skill note under the TS2 section.

## Non-Goals

- **Deleting `src/memory/cli/runtime.py` or any Python module.** TS5. This story makes
  the update/release half unreachable from every skill and from the front door, and edits
  exactly two Python strings (§F).
- **Package rename, `bin`, `npm publish`, dist-tag creation, registry roundtrip, GitHub
  Release.** US3 and its gates. The `package` strategy is proven against a packed tarball
  with `npm view` shadowed; the registry half is US3's, recorded as a handoff.
- **Changing `runtime status`, `version`, `diagnose`, `release-notes` bytes** (D3).
- **Welcome-card update awareness for `package` installs.** US3, with the package.
- **Rewriting `frame/` or `installer/`** (D4) — recorded, re-homed, not built.
- **Editing the `automation` repository's extension `SKILL.md` files** (D5).
- **Porting `check_retired_surfaces.py` or `check_doc_links.py`** — TS5.
- ~~**Backup retention.**~~ **Withdrawn at plateau 2 — the debt does not exist.** The
  panel recorded "two archives per update, nothing prunes them". Verified against the
  code instead of the claim: `createZipBackup` and Python's `backup()` both sweep a
  **30-day retention** (`RETENTION_DAYS = 30`, `sweepRetention` / the `cutoff` loop), and
  migrate-on-open does not archive at all — it writes one fixed-name snapshot,
  `frontdoor-pre-migration-backup.db`, and `rmSync`s it before each write, so it is a
  single overwritten file that cannot accumulate. An update produces one retained archive
  and one overwritten snapshot; growth is bounded by design on both engines. Nothing is
  carried to Debt Review for this.
- **A Windows smoke.** The smoke is POSIX shell like its six siblings.

## Plateaus

Each closes with a commit, green CI (`gh run watch`), and a handoff line in the story
index's *Plateau Progress*.

0. **Baseline capture.** Before any change, on the **production clone**
   `~/dev/workspace/mirror`: `runtime update --check`, `--dry-run`, `runtime backup`,
   `runtime backup --verify`, `runtime release-doctor --target v0.31.14` saved to
   `ts/tmp/us2-baseline/`; `runtime-git.golden.json` SHA recorded. No commit.
1. **§A + §F.** Surface corrected; the unknown-subcommand answer owned by TS and pinned;
   recommendation strings neutral on both engines; golden regenerated; the two "no
   `uv run python` in a render" pins.
2. **§B.** `runtime backup` answers from TS behind `MIRROR_TS_RUNTIME_UPDATE`, traversal
   refusal and `quick_check` pinned, golden green, allowlist minus one.
3. **§C, `clone` kind + `runtime migrate`.** The five modules, the relaxed gate, capture,
   the two-spawn migrate/validate, the repair lane and its throw-fallback, the log line,
   unit tests on the injectable runner, the smoke's clone half. `mm-update` flipped in all
   three copies. Allowlist minus one. **This plateau is what the Navigator validates on
   the production clone, across the Python → TS hop** (test guide).
4. **§C, `package` kind + §G smoke.** `detectInstallKind` with `npm root -g`, the
   XDG-scoped channel, `npm view` resolution, the npm apply and repair, the smoke's
   package half, the smoke in CI and the pre-push set. If the shadowing proves brittle
   (stop condition below), the package half is recorded as a US3 handoff and this plateau
   closes on the clone smoke alone.
5. **§E + §D guard.** Doctor and promote as scripts; the two `retired` entries;
   `DS10_RUNTIME_SUBCOMMANDS` deleted; the cutoff; the Node guard beside the Python one
   for one commit, then alone; allowlist `{}` and then gone.
6. **§G docs + gate records + handoff.** Process docs; DS10 index rows; US3 row amended;
   `handoff.md`; handoff review by the panel.

## Rollback

- Plateaus 2–4 are behind `MIRROR_TS_RUNTIME_UPDATE=0`, which returns `runtime update`,
  `runtime migrate`, and `runtime backup` to Python with no code change, until TS5.
- Plateau 5's `retired` entries are two table rows; removing them restores the Python
  fallthrough for doctor/promote. The Python scripts are in git history and the last
  Python-bearing release runs them.
- Plateau 1's string change is symmetric on both engines and reverts as one commit.
- Any update this story performs is itself reversible from its own recovery block, which
  prints the captured commit or version.
- The smoke never touches a real remote, a real home, or the real database.

## Acceptance Behavior

```text
Given the production clone on channel <c>, one commit behind origin/<c>
When  the Navigator asks Mirror to update itself
Then  the front door runs the pipeline with no uv or Python process spawned
And   the stages print in order — status gate, capture, backup, verify backup, plan,
      fetch, fast-forward, migrate, post-update status — each pass/fail/skip with detail
And   a backup exists, and verifying it opens the database and passes quick_check
And   the migrate stage ran in a FRESH process on the NEW code and printed the
      _migrations ledger before and after
And   post-update status was reported by a second fresh process
And   one line was appended to front-door.log naming kind, channel, from → to, and exit
And   the exit code is 0 and the tree is at origin/<c>

Given a clone whose installed Mirror predates this story
When  the last Python-driven update brings it to the first TS-bearing commit, and the
      Navigator then updates again
Then  the second hop is answered entirely by TypeScript, and the seam between the two
      updaters is crossed once, in the open

Given the same clone with a local commit that diverged from origin/<c>
When  the Navigator runs runtime update
Then  the pipeline fails at plan with "branch diverged"; the tree is at the captured
      commit and the _migrations ledger is unchanged; a Recovery block prints the
      pasteable route WITH the captured value; the exit code is 1

Given a clone whose status gate throws
When  runtime update runs
Then  it falls back to the repair lane, applies under the minimal gate with migrations
      skipped, and tells the user to rerun runtime update

Given a front door resolved under `npm root -g` with npm available
When  runtime update --check runs
Then  the check resolves the channel's dist-tag to a concrete version, prints that
      version, and reports up_to_date or update_available against the installed one
And   runtime update captures the installed version, installs the RESOLVED version,
      migrates and validates in fresh processes, and its recovery route is
      `npm install -g <name>@<captured version>`

Given a front door under a project-local node_modules/
Then  the kind is unknown and every update verb refuses with the reason printed —
      never an `npm install -g` against a tree that is not the one running

Given two Mirror homes over one global install
Then  the channel is read from the OS-user-scoped config, so updating from one home
      cannot re-tag the other

Given runtime update --check on either kind
Then  the recommendation lines read `runtime update --dry-run` and `runtime update`,
      and no render on either engine contains `uv run python`

Given the three skill copies and plugins/mirror-mind/**
When  the Node parity guard runs
Then  it passes with no allowlist, and fails when a single
      `uv run python -m memory` line is reintroduced anywhere in that set

Given runtime release-doctor or runtime release-promote at the front door
Then  one line names `npm run release:doctor` / `release:promote` and the cutoff, exit 1,
      before any dispatch

Given an unknown runtime subcommand, including pull and stable
Then  TypeScript itself renders the usage line and exits 2 — no Python fallthrough is
      required for the answer to exist
```

## Validation Route

The test guide carries the commands. In outline:

1. **Automated:** `npm test` (new: `installKind`, `updatePipeline`, `strategies/clone`,
   `strategies/package`, `migrate`, `backup`, `releaseDoctor`, `releasePromote`, plus
   routing pins); `uv run pytest`; the parity generators including the new
   `generate_runtime_backup_golden.py` and the regenerated `runtime-git`;
   `scripts/smoke_runtime_update.sh`; both guards on the commit where both exist; the four
   checks.
2. **Navigator-visible, plateau 3 — on `~/dev/workspace/mirror`, across the hop.** The
   last Python-driven update brings the production clone to plateau 3's commit; then the
   first TS-driven `/mm-update` moves it again. That two-hop path is the journey every
   existing user takes, and it is the only place the seam between the two updaters is
   observable.
3. **Navigator-visible, plateau 5:** `npm run release:doctor -- --target v0.31.14` on the
   production clone renders the checklist Python rendered in the plateau-0 baseline.
4. **E2E decision: required.** The story's subject is an operational chain; fixture-level
   evidence alone does not prove it moves a real tree safely.

## Implementation Contract

- TDD: install-kind detection (including the local-`node_modules` refusal), the relaxed
  gate, the pipeline runner, capture-before-apply, the two-spawn migrate/validate, the
  recovery render with values, the throw-fallback, and the two `retired` entries as
  failing tests before the source changes. Backup verify/render as characterization tests
  from Python's outputs before the port.
- Every git and npm call through one injectable runner; no test spawns a real remote or
  registry; the smoke is the only place real `git`/`npm` run, against scratch trees.
- Spawned front doors receive their environment explicitly; nothing relies on `--env-file`
  inheritance.
- `packageVersion()` is the only version read; no new `pyproject.toml` parse anywhere.
- Goldens regenerated from Python after Python's change and before any TS render changes.
- `uv run` for every Python command; `git add` by path; commit per plateau; English
  messages explaining why; `gh run watch` green before the next plateau.
- No `any`; install kind and stage state are discriminated unions; the `retired` entries
  are table rows, not string checks.
- The database is opened by three places only, each named: the backup stage (read), the
  verifier (read-only `quick_check` on an extracted copy), and `runtime migrate` (through
  the DS6 seam). The pipeline process never opens it.
- Nothing in this story pushes, publishes, tags a real release, or moves the real
  `stable`; promote's `--push` is exercised only against a scratch origin.

## Stop Conditions

- **scope_change_detected** — a consumer of `runtime update|backup|release-doctor|
  release-promote` appears outside the inventory; `runtime migrate` cannot apply
  migrations through the DS6 seam without a new seam; the `runtime-git` golden differs
  after regeneration anywhere except the two recommendation lines.
- **navigator_decision_needed** — any of D1–D8 is declined or amended in a way that
  changes §C's shape; the OS-user-scoped channel location is rejected; the panel's
  `quick_check` addition is judged too large a deviation from the oracle.
- **failing_required_check_without_clear_fix** — either suite, a parity generator, the
  determinism gate, or the smoke red after a plateau for a reason outside that plateau.
- **plan_rule_conflict** — the `package` half of the smoke cannot be made deterministic
  with `npm` shadowed (recorded fallback: hand the package half to US3 and close plateau
  4 on the clone smoke).
- **unsafe_operation** — any path in which `apply` could run before `capture` and
  `verify backup` passed, or in which the pipeline writes to a tree that is not the
  install's own.

## Decisions This Plan Asks The Navigator To Take

1. **D1 — `release-doctor` and `release-promote` are release tooling, not product
   commands.** `ts/scripts/`, `npm run release:*`, front-door `retired` answer with the
   successor named. Alternative: keep them as `runtime` subcommands answered by TS — every
   installed user is then offered a command that cannot work for them.
2. **D2 — version authority stays `pyproject.toml` through `packageVersion()`; US3 flips
   the body.** No agree-check now. Alternative: flip to `package.json` here — pre-empts
   US3's rename and makes `0.0.0` the product version for one story.
3. **D3 — the read half does not change in this story.** Install kind is visible only in
   the updater's own output. Alternative: add `Install kind:` to `runtime status` now, as
   a recorded parity deviation.
4. **D4 — `frame/` and `installer/` are re-homed to US3**, and
   `frame/main/command-registry.js` becomes a Zero Python gate row so it cannot be
   forgotten. Alternative: retire both under a cutoff — a product decision this story
   should not take alone.
5. **D5 — the 17 installed-user extension-skill invocations are the `automation`
   repository's**, recorded under TS2's cutoff section. Alternative: a `runtime diagnose`
   finding that names installed skills still invoking Python — useful, but read-half (D3).
6. **D6 — the parity guard ports to Node in US2, allowlist deleted;
   `check_retired_surfaces.py` and `check_doc_links.py` port in TS5.** Alternative: port
   all three here — TS5 would then rewrite the retired-surfaces rows in a file US2 just
   moved.
7. **D7 — the updater keeps serving git clones.** One pipeline, `clone` and `package`
   apply strategies. Decisively: at this story's validation the only install kind that
   exists is a clone. Alternative: refuse clones with a migration instruction — smaller,
   faithful to "not ported", and it makes `mm-update` useless for every existing user
   until US3 and turns this story's validation into a refusal.
8. **D8 — the updater gains an explicit `runtime migrate` verb** (panel finding). The
   `migrate` stage spawns the new code on a named verb that opens through the DS6 seam and
   reports the ledger; `runtime status` stays read-only and is the `validate` stage only.
   This adds one name to the product surface and **corrects the oracle**, which applies
   migrations in-process with the pre-update code. Alternative: keep it an undocumented
   argv only the updater uses — hides an operation a Navigator needs when an update is
   interrupted, and makes the stage untestable from outside.

Approving the Plan approves these eight as recorded; amendments re-open Plan.

## Review

Per the [collaboration strategy](../../collaboration-strategy.md), this story is well
above a small slice: a new subsystem, a live surface on the Navigator's own clone, two
engines' strings, a guard port, and a moved release chain.

- **Plan review, before implementation — done 2026-09-23.** Panel: engineer,
  quality-assurance, devops-engineer, security-engineer, database-architect. Synthesis:
  the shape is sound — one pipeline, two apply strategies, clone-first validation, the
  release chain out of the product surface — with risk concentrated in three things the
  draft mis-described rather than mis-scoped. Findings, all folded above:
  - **the `migrations` stage named a seam that does not migrate** (engineer,
    database-architect) — `runtime status` is read-only by design and there is no
    `migrate` verb; the draft would have inferred a migration from "some command opened
    the file". Now D8, an explicit `runtime migrate`, two stages, ledger printed before
    and after;
  - **the Navigator route named a clone the updater refuses** (quality-assurance) — this
    checkout is `dev`; the production clone is `~/dev/workspace/mirror` at a 2026-09-02
    commit, and the journey that matters is the **Python → TS hop**, now an acceptance
    criterion and the plateau-3 route;
  - **the `package` channel and detection were scoped to the wrong boundary**
    (devops-engineer) — a per-home channel over a per-OS-user install lets one home
    re-tag another, and "under `node_modules/`" would have made a project-local install
    run `npm install -g` against a different tree; now OS-user-scoped config and
    `npm root -g`;
  - **recovery had no values and the run left no trace** (devops-engineer) — `capture` is
    now a stage, the recovery block prints the pasteable route with the captured commit or
    version, and one line lands in `front-door.log`;
  - **the backup port dropped the oracle's only boundary check and invented one**
    (security-engineer) — the traversal refusal is characterized and pinned; the "SQLite
    header" check never existed;
  - **a verified backup was never opened** (database-architect) — `quick_check` on an
    extracted copy, outside the golden because the oracle does not do it;
  - **`SHA unchanged` is not an invariant** (database-architect) — the smoke now asserts
    the `_migrations` ledger, `PRAGMA integrity_check`, and row counts;
  - **the throw-fallback and a pending-migration update had no route** (quality-assurance)
    — the first is pinned in units, the second is exercised or recorded as accepted risk;
  - **`update.ts` as one module repeated `runtime.py`'s failure** (engineer) — five
    modules plus `migrate.ts`;
  - **nobody owned the unknown-subcommand answer after TS5** (engineer) — §A owns it now,
    and `DS10_RUNTIME_SUBCOMMANDS` is deleted only after it exists;
  - **two backups per update with no retention** (database-architect) — named as carried
    debt rather than left silent;
  - smaller: the smoke must capture the real `npm` before shadowing PATH and run with a
    scratch env-file, not the repository's (security-engineer); spawned front doors need
    their environment passed explicitly (devops-engineer).

  Not requested by the Navigator and therefore not run: ai-engineer, prompt-engineer,
  experience-designer, product-designer.
- **Handoff review, after plateau 6 validation:** same panel.

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- Implementation is blocked until the Navigator approves this Plan and D1–D8.
