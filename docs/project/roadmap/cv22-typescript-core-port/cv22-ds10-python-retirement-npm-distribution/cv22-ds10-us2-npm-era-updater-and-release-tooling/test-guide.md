[< Story](index.md)

# Test Guide — CV22.DS10.US2

Panel findings folded 2026-09-23: the Navigator route now runs on the production clone
across the Python → TS hop; the smoke asserts ledger and integrity rather than file bytes;
the throw-fallback and the pending-migration case have routes.

## Automated Validation

Run from the repository root unless noted. Every item is part of the pre-push set for
this story; `npm test` plus `pytest` alone say nothing about items 3–6.

1. **TypeScript suite** — `cd ts && npm test`. New files, **reconciled 2026-09-23 with
   what was actually built**: this list was written at Plan time and named five files
   that do not exist (`updatePipeline.test.ts`, `strategies/clone.test.ts`,
   `strategies/package.test.ts`, `releaseDoctor.test.ts`, `releasePromote.test.ts`). The
   tests exist; the split does not. A test guide that names files nobody wrote is the
   same defect this story spent six plateaus finding elsewhere, so it is corrected to the
   artifact rather than the artifact renamed to it.

   - `test/runtime/installKind.test.ts` (7 tests) — `clone` from a work tree whose root
     holds `ts/package.json`; `package` only when the path is under the injected
     `npm root -g`; **a project-local `node_modules/` resolves to `unknown`**; a path that
     merely shares a string prefix with the global root is not inside it; npm absent; a
     `.git` without `ts/package.json` is not this project's clone; and the real front door
     in this checkout detects as a clone.
   - `test/runtime/update.test.ts` (14 tests) — the pipeline's decisions and both apply
     strategies, driven through injected git and npm seams so no test reaches a remote or
     a registry. Stages in the oracle's order; an up-to-date clone takes **no backup at
     all**; `apply` unreachable unless `capture` and `verify backup` passed; diverged
     fails at `plan` with nothing moved; the recovery block carries the **captured value**;
     `migrate` spawns a fresh process after the fast-forward; the gate refuses a not-ready
     status and allows migration drift alone; and for packages — the dist-tag resolves to
     an **exact version** in the install argv, an already-current package does nothing, a
     failed install names the captured version as the way back, and an unreadable
     `npm view` answer fails at `plan` before any backup.
   - `test/runtime/migrate.test.ts` (4 tests) — a fully migrated database reports nothing
     pending with an unchanged ledger; a missing database fails with its path rather than
     a stack trace; a file that is not a database is an error, not a silent no-op.
   - `test/runtime/backup.test.ts` (8 tests) — characterization of Python's five checks,
     including **a crafted zip with an absolute entry and one with `..`, both refused**;
     the eight golden scenarios byte-identical to the oracle; and the TS-only
     `quick_check` case, asserted in both directions so the deviation is retired rather
     than forgotten if the oracle ever changes.
   - `test/runtime/release.test.ts` (9 tests) — the doctor's checks in pass/warn/fail
     against scratch repositories; that it creates no tag, moves no branch, writes no
     file; a dry-run promotion that performs none of its steps; promotion tagging HEAD and
     fast-forwarding stable without pushing; a misplaced tag stopping promotion at the
     doctor; and a diverged `stable` refused.
   - Routing pins in `test/frontDoor/routing.test.ts` and CLI behavior in
     `test/frontDoor/runtimeTailCli.test.ts` — the unknown-subcommand answer, the
     updater family's single revert gate, the two independent backup gates, and the
     release chain answering `retired` **before dispatch**, so `--push` reaches nothing.

   Not covered by any of the above, and named rather than implied: there is **no
   `dev`-role refusal**, because neither engine has one — `run_runtime_update` never reads
   `clone_role`.

2. **Python suite** — `uv run pytest tests/unit/ tests/integration/ -m "not live"`. Only
   `tests/unit/memory/cli/test_runtime.py:831,849,850` change (the two neutral strings).
3. **Parity generators** — `uv run python ts/parity/generate_runtime_git_golden.py`
   (regenerated after Python's strings change; the diff must touch only the two
   recommendation lines) and the new `uv run python ts/parity/generate_runtime_backup_golden.py`;
   then `npm test` green against both.
4. **The smoke** — `scripts/smoke_runtime_update.sh`. Isolation: a bare scratch origin
   cloned from this repository; a scratch production clone with
   `.mirror-clone-role=production` and `.mirror-update-channel=main`; a scratch mirror home
   with a demo database (`ts/parity/generate_demo_memory_db.py`); **a scratch env-file, never
   the repository's `.env`**, which holds the OpenRouter key. The real `npm` and `git` paths
   are captured with `command -v` **before** PATH is shadowed.

   Assertions, in order:
   - `runtime update --check` → `update_available`; recommendation lines contain no
     `uv run python`; exit 0.
   - `runtime update --dry-run` → ready; exit 0; `git rev-parse HEAD` unchanged.
   - `runtime update` → stages in order; `capture` records the pre-update commit;
     `backup` and `verify backup` pass, and the archive is independently accepted by
     `runtime backup --verify`; `fast-forward` pass; **`migrate` ran in a fresh process
     and printed the ledger**; `post-update status` pass; exit 0; `HEAD == origin/main`.
   - **Database truth, not bytes** (the draft's "SHA unchanged" is not an invariant —
     SQLite rewrites pages on open): `_migrations` ledger rows before and after are equal
     when nothing is pending, or differ by exactly the expected ids when something is;
     `PRAGMA integrity_check` returns `ok`; row counts on the core tables are equal.
   - **Pending-migration case:** when a TS-authored migration exists that the scratch
     database predates, the clone starts before it and the `migrate` stage is observed
     applying exactly that id. When no such migration exists at implementation time, this
     is recorded here as an **accepted risk** — migration-carrying updates are covered by
     `migrateOnOpen`'s own suite, and the smoke pins only the nothing-pending case.
   - **No interpreter:** `python`, `python3`, and `uv` are shadowed on PATH with stubs
     that exit 66, the technique CI's *Extension suites need no interpreter* step uses.
   - **One log line** appended to the scratch home's `front-door.log`, naming kind,
     channel, from → to, and exit.
   - Diverged clone → `plan` fails "branch diverged"; `HEAD` equals the captured commit;
     the ledger is unchanged; the `Recovery:` block contains `git reset --hard <captured
     sha>` **with the real sha**; exit 1.
   - `--repair-updater --no-fetch` on the behind clone → ff applied, `migrate skip`,
     message names `runtime update`, exit 0.
   - **Package half — CORRECTED 2026-09-23 to describe what ships.** The smoke runs
     `npm pack`, installs the tarball into an isolated prefix with the captured real npm,
     and asserts the installed package is discoverable. It does **not** resolve a
     dist-tag, install over a previous version, migrate, or validate. The package *update
     path* has unit coverage only — four tests in `update.test.ts` driving the injected
     npm seam — and its operational coverage is carried to **US3**, which publishes the
     package that makes a real resolution possible. This paragraph previously described
     the fuller half, which was planned and not built.
5. **Guards** — on the plateau-5 commit where both exist: `uv run python
   scripts/check_skill_command_parity.py` and `node ts/scripts/check-skill-command-parity.ts`
   both clean, and both failing identically when a `uv run python -m memory` line is added
   to `.pi/skills/mm-update/SKILL.md` and reverted. Thereafter Node alone. Plus
   `check_retired_surfaces.py`, `check_oracle_drift.py`, `check_doc_links.py`.
6. **Determinism gate and the other smokes** — unchanged, run as the workflow lists them.

## E2E Decision

**Required.** The story's subject is an operational chain that moves a real tree and
touches a real database's backup. Unit tests with a scripted runner prove the decisions;
only a real update on a real clone proves the chain — and only the two-hop route below
proves the seam between the updater being replaced and the one replacing it.

## Navigator Validation

### Plateau 3 — the real update, across the Python → TS hop

**BLOCKED until this branch reaches `main` — recorded 2026-09-23 at plateau 3.** The
production clone can only fast-forward to a ref its origin publishes: `origin/stable` is
`b2d710eb` and `origin/main` is `193dc0f4`, and this story's work is on the
`mirror-ts-core` branch, which is an ancestor of neither. So hop 1 cannot deliver the TS
updater to that clone, and hop 2 has nothing to run. The route below is correct and stays
as written; it becomes executable only after the branch merges to `main`, which is its own
Navigator gate. Until then the evidence for this plateau is the scratch-clone run recorded
in the story index, which exercises the same pipeline with the interpreters shadowed but
is automated evidence rather than a Navigator observation.

**The clone is `~/dev/workspace/mirror`**, not this checkout. This repository is
`.mirror-clone-role=dev`, and the updater refuses `dev` by design — running `/mm-update`
here validates a refusal. The production clone is role-default (production),
channel-default (stable), and its HEAD predates every DS10 story, so it still carries the
**Python** updater. That is not an obstacle; it is the journey every existing user will
take, and it is only observable once.

1. **Baseline.** On the production clone: `uv run python -m memory runtime status` is
   ready; record `git rev-parse HEAD` and the `_migrations` ledger.
2. **Hop 1 — the last Python-driven update.** `uv run python -m memory runtime update
   --channel main` brings the clone to plateau 3's commit on `main`. *This is the final
   act of the old updater.* Expected: it succeeds as it always has.
3. **Set up the second hop.** `git fetch && git reset -q --hard origin/main~1`, leaving the
   clone one commit behind on `main`, clean, with `runtime status` ready.
4. **Hop 2 — the first TS-driven update.** In a Pi session on that clone: `/mm-update`.
5. **Expected observation:** the stage list (`status gate`, `capture`, `backup`,
   `verify backup`, `plan`, `fetch`, `fast-forward`, `migrate`, `post-update status`); a
   `backup` line naming an archive under the mirror home; the `migrate` stage printing the
   `_migrations` ledger before and after; `post-update status` pass; **no `uv` or Python
   line anywhere**; exit 0; `git log -1` at `origin/main`.
6. **Pass:** all of 5, and `runtime backup --verify <that archive>` accepts it, and
   `front-door.log`'s last line names the update.
   **Fail:** any stage fails on a clean behind clone; any Python invocation appears;
   `HEAD` did not move; no archive exists; the `migrate` stage did not print a ledger
   (it did not really run); the post-update status came from the pre-update code.
7. **Restore.** Return the clone's channel marker to its original state (it had none;
   remove the override) and update it to the current `stable` when the release lands.
8. **The failure path, on a scratch clone only** — never on the production clone: commit a
   local change, run `/mm-update`, observe the `plan` failure, the `Recovery:` block
   **containing the real captured sha**, exit 1, and an unchanged tree and ledger.

### Plateau 5 — the release chain

1. `cd ts && npm run release:doctor -- --target v0.31.14` on the production clone.
2. **Expected observation:** the eight-line checklist Python rendered in the plateau-0
   baseline for the same target, `[✓]`/`[!]`/`[✗]` identical per check.
3. `npm run release:promote -- --target v0.31.14 --dry-run` prints the ordered steps and
   changes nothing (`git status` clean, no tag created).
4. **Pass:** checklist identical to baseline; dry-run wrote nothing.
   **Fail:** any check state differs from Python's for the same tree; dry-run created a
   tag or moved a branch.
5. `NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts runtime
   release-doctor --target v0.31.14` → one line naming `npm run release:doctor`, exit 1.

## Validation Evidence

**Accepted 2026-09-23. Navigator decision: the operational smoke is this story's E2E
evidence, and the two-hop route below is a post-merge obligation rather than a blocker.**

What was actually run, on the last pushed commit (`86e18d00`), CI green on both workflows:

| Evidence | Result |
|---|---|
| TypeScript suite | 2578 pass, 0 fail |
| Python suite | 2091 pass, on both the 3.10 and 3.12 legs |
| `scripts/smoke_runtime_update.sh` | **34 assertions, 0 failures, on ubuntu AND macOS**, with `python`/`python3`/`uv` shadowed to exit 66 |
| `runtime update --check` | byte-identical to the oracle on the same tree |
| `runtime backup` | all 8 golden scenarios byte-identical to the oracle |
| `npm run release:doctor` | all 8 check states identical to the oracle for the same target |
| The two skill guards | agreed in CI on a clean tree, and locally on a seeded regression, before the Python one was deleted |
| Repository checks | doc links, oracle drift, retired surfaces, Node skill parity — all clean |

The smoke is what carries the E2E claim: it moves a real tree, writes and verifies a real
archive, applies a real migration through a fresh process, and asserts the database by its
`_migrations` ledger and `PRAGMA integrity_check` rather than by file bytes. It also
covers the three failure paths — diverged, dry-run, repair lane.

### Post-merge obligation (carried, not waived)

The Navigator-visible two-hop route above has **not** been run, because it cannot be: on
`86e18d00` this branch is not an ancestor of `origin/main` (`193dc0f4`) or `origin/stable`
(`b2d710eb`), so the production clone cannot fast-forward to code that contains the TS
updater.

**When `mirror-ts-core` merges to `main`, run the route in *Plateau 3* above on
`~/dev/workspace/mirror` before the CV22 release.** It is the only place the seam between
the outgoing Python updater and the incoming TypeScript one is observable, and it is
observable exactly once. Accepting the smoke as this story's evidence does not retire that
observation; it sequences it after a gate this story does not own.
