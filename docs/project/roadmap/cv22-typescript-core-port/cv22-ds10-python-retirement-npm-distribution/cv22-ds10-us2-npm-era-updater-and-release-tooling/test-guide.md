[< Story](index.md)

# Test Guide — CV22.DS10.US2

Panel findings folded 2026-09-23: the Navigator route now runs on the production clone
across the Python → TS hop; the smoke asserts ledger and integrity rather than file bytes;
the throw-fallback and the pending-migration case have routes.

## Automated Validation

Run from the repository root unless noted. Every item is part of the pre-push set for
this story; `npm test` plus `pytest` alone say nothing about items 3–6.

1. **TypeScript suite** — `cd ts && npm test`. New files:
   - `test/runtime/installKind.test.ts` — `clone` from a work tree whose root holds
     `ts/package.json`; `package` only when the path is under the injected `npm root -g`;
     **a project-local `node_modules/` resolves to `unknown`, with the reason**; missing
     `npm`; unreadable prefix.
   - `test/runtime/updatePipeline.test.ts` — stages in order; stop at first `fail`;
     `capture` always runs before `backup`, and `apply` never runs unless `capture` and
     `verify backup` passed; the recovery render contains the **captured value**, not a
     placeholder; the log line's fields; **the status gate throwing falls back to the
     repair lane** (the finding with no route in the draft).
   - `test/runtime/strategies/clone.test.ts` — scripted runner: behind → ff; diverged →
     `plan` fail; local ahead → refuse; `dev` role → refuse; dirty tree → refuse;
     `--no-fetch` skips fetch.
   - `test/runtime/strategies/package.test.ts` — `npm view` resolves the dist-tag to a
     concrete version; the install argv carries **the resolved version, never the bare
     tag**; capture reads the installed version first; repair reinstalls the captured one;
     malformed `npm view` JSON fails the stage rather than proceeding.
   - `test/runtime/migrate.test.ts` — `runtime migrate` opens through the DS6 seam,
     applies pending migrations, prints the ledger before and after, exit 0; nothing
     pending → ledger identical, exit 0; unreadable database → exit 1 with the reason.
   - `test/runtime/backup.test.ts` — characterization of Python's five checks, including
     **a crafted zip with an absolute entry and one with `..`, both refused**; plus the
     TS-only `quick_check` case (a well-named archive holding a corrupt database is
     refused here and would pass on Python — deviation recorded in the test's docstring).
   - `test/runtime/releaseDoctor.test.ts`, `test/runtime/releasePromote.test.ts` — the
     eight checks in pass/warn/fail; steps ordered; `--dry-run` writes nothing; `--push`
     pushes tag and branch to a scratch origin.
   - `test/frontDoor/routing.test.ts` — `runtime pull|stable` and any unknown subcommand
     answered **by TypeScript** with usage + exit 2; the two `retired` entries;
     `MIRROR_TS_RUNTIME_UPDATE=0` returns `update`, `migrate`, and `backup` to Python.
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
   - **Package half:** `cd ts && npm pack` → tarball; `npm install -g --prefix
     <scratch-prefix> <tarball>` using the captured real npm; then `npm` shadowed by a stub
     whose `view` answers a fixed `dist-tags`/`version` JSON and whose `install -g`
     delegates to the captured real npm with the tarball. The installed front door's
     `runtime update --check` prints the **resolved version**; `runtime update` captures
     the installed version, applies, migrates and validates in fresh processes, exit 0. If
     this half cannot be made deterministic, it is removed and recorded as a US3 handoff
     (plan stop condition `plan_rule_conflict`).
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

Pending implementation and validation. Recorded per plateau in the story index's
*Plateau Progress* and here at closure.
