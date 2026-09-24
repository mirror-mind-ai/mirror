[< Story](index.md)

# Plan — CV22.DS10.TS5

**Written:** 2026-09-23, at Pull, against `2adf2951`
**Cadence:** the active Ariad cadence; Plan stops here for the persona panel and
Navigator approval — this story is the largest deletion in the migration and
is not a small slice by any reading of the
[collaboration strategy](../../collaboration-strategy.md#the-persona-panel-is-the-standing-second-opinion).

## Objective

Delete the Python core and everything that exists only to run it or compare
against it, **in the order the callers require rather than the order the files
suggest**, so that at every plateau the tree is green, the product answers
identically, and a session can stop and resume.

The strangler ends when the fallback is gone, not when the files are. The
file deletion is the last mechanical act; the story is the four plateaus
before it that make the deletion safe.

## What Is True Before This Story

- The command surface is finished: DS7 14/14, DS8 5/5, DS9 4/4, DS10 6/8.
  Every one of Python's 32 top-level commands has a TypeScript route
  (`_dispatch` ⊆ `routeMemoryCommand`, checked at Pull); `mcp` is launched by
  the plugin, not routed.
- The product spawns the interpreter in exactly one place:
  `ts/src/frontDoor/cli.ts:206`, `fallbackPython`. Everything that reaches it
  is a revert gate, a provider-transport revert, or an argv shape Python would
  have rejected anyway.
- The TypeScript migration engine already carries every known migration
  (`001`–`017`; Python stops at `016`), bootstraps a missing database, and
  applies the TS-authored tail on open. It declines only when a
  Python-authored migration is pending — a deferral that assumes the other
  engine exists.
- No skill invokes Python (US2). Four hook families and one wrapper still do
  (this story's [inventory](index.md#the-runtime-hooks-still-spawn-python--twelve-files-the-skill-gate-could-not-see)).
- `check_retired_surfaces.py` holds eight retired-surface rows for TS1–TS4
  and is written in the language it forbids. `checkSkillCommandParity.ts` is
  already Node, forbids `uv run python -m memory`, and has no exemption path.
- `ts/package.json` is `mirror-core@0.0.0`, `private`, by US2's deliberate
  choice; `pyproject.toml` is `mirror@0.31.14` and is THE version.
- CV22 releases once, at the end. **This story ships nothing.** The "existing
  `memory.db` files keep working" and "no user-visible change" conditions are
  proven on database copies and the dev clone here, and again at the CV22
  release gate; there is no intermediate release in which a user could be
  between TS5 and US3.
- The working tree is clean at `2adf2951`, branch `mirror-ts-core`, CI green.

## The Design

Five ideas, each answering one thing the inventory found.

**1. Make TypeScript self-sufficient before removing the fallback, and remove
the fallback before deleting Python.** Three plateaus, three different kinds
of evidence. While Python still exists, every rewritten hook can be run
against both engines and the database rows diffed; every re-pointed reader
can be checked against the value Python would have produced. Once the
fallback is gone but Python still exists, the full front-door test suite runs
with `python`/`python3`/`uv` shadowed by exit-66 stubs — TS2's and US2's
technique, widened to the whole surface — and proves by failure that nothing
reaches for them. Only then does the deletion happen, and at that point it
changes no behavior, because nothing was calling what it deletes.

**2. The guard is widened before the deletion, and it is Node.** The Skill
gate's guard missed the hooks because its pattern was `uv run python -m
memory`. The new `python-core` row in the Node port of
`check_retired_surfaces` forbids, across every path this repository ships
(`.pi/`, `.claude/`, `.gemini/`, `plugins/`, `scripts/`, `ts/src/`,
`ts/scripts/`, `ts/evals/`, `.github/`), any line matching `python3?\b`,
`\buv\b`, `python -m memory`, `memory\.hooks`, `from memory\.`, or
`import memory\b` — with the two named exceptions `frame/` and `installer/`
carrying the US3 reference, and no file-level exemption otherwise (TS2's
lesson: a file-level exemption blinds the guard to everything else in that
file). It also asserts `git ls-files '*.py'` is empty, `pyproject.toml` and
`uv.lock` are absent, and no workflow contains `setup-python` or `setup-uv`.
The Node port runs beside the Python original for one commit and both must
agree on a clean tree and on a seeded regression before the original goes —
exactly how US2 retired `check_skill_command_parity.py`.

**3. One custodian, three verdicts.** `migrateOnOpen` loses `deferredToPython`
and the TS-authored/Python-authored split: any pending known migration is
applied, backup-first, under the bootstrap lock, as the TS-authored tail
already is. `runtime migrate` reports `applied`, `nothing pending`, or
`declined` — declined now meaning only the structural cases (no
`_migrations` table; unknown newer migrations) — and `declined` exits
non-zero and fails the updater's migrate stage. The two `SchemaStateError`
messages that say "run any Python command" say "run `runtime migrate`" and
"update this Mirror checkout" instead. That pays D-025 in the place the
ledger said it belongs.

**4. One Node entry per hook, resolved from the hook file.** Each hook shell
script becomes a two-line wrapper that resolves the repository from
`$BASH_SOURCE` (as `launch.sh` does) and `exec`s `node <repo>/ts/src/hooks/<runtime>-<event>.ts`,
which reads the hook JSON from stdin once and does the whole flow in-process
over the front door's own modules — `hookUserPrompt`, `runtimeSession`
metadata for `needs-inject`/persona/journey, `loggerRuntime` for
session start/end, `backup`. `mirror-inject.sh` goes from five interpreter
spawns per prompt to one `node` spawn. The wrappers stay shell because the
runtimes call shell; US3 replaces the `$BASH_SOURCE` resolution with the npm
`bin`. `memory.hooks.mirror_state` and `memory.hooks.extract_prompt` are not
ported as commands: their logic is ≤170 lines and lives inside the hook
entry, which is the only caller they ever had.

**5. The version and the checkout guard read one file, and it is not
`pyproject.toml`.** `packageVersion` reads `ts/package.json`'s `version`;
`isMirrorMindCheckout` identifies a checkout as *the first directory holding
`ts/package.json` whose `name` is the constant next to `packageVersion`, and
`ts/src/frontDoor/cli.ts`*. `ts/package.json` gets the real version
(`0.31.14`) and stays `private` and `mirror-core` until US3 renames it. US3
then changes the name constant and the `private` flag — one place, as US2's
D2 intended. The clone-role guard gets a test that fails if `src/memory/`
is absent and the guard still answers "not a checkout", so that the
regression the inventory predicted cannot land silently.

## Scope

### A. Freeze the oracle (plateau 0)

- Run the full pre-push set one last time and record it as the final parity
  evidence in [test-guide.md](test-guide.md): all ~40 golden generators
  (regenerate must be a no-op), the 17 write-parity probes, the real-DB-copy
  parity on the demo database, the three smokes, both test suites, the
  oracle-drift tripwire, and the retired-surface check.
- Inventory, in the story package, every Python test that grades a
  TypeScript contract and name the TypeScript test that carries each
  assertion forward or the reason none is needed.

  ✅ **Done — [inventory.md §1](inventory.md#1-python-tests-that-grade-a-typescript-contract).**
  Six of seventeen candidates are real; eleven were `rg` false positives.
  Finding **F1** — the docs-link checker's 26-case self-test has no carrier —
  is applied to slice B. `schemaInventorySnapshot.ts` joins the goldens as a
  frozen fixture, and its header, which today instructs the reader to
  regenerate it with a Python command, is rewritten in slice H.
- Inventory every `engine: "python"` outcome in `routing.ts` and
  `transport.ts` and classify it: revert gate, transport revert,
  unported-argv fallthrough, or **something else** — the last is a stop
  condition.
  ✅ **Done — [inventory.md §2](inventory.md#2-every-engine-python-outcome-classified).**
  40 sites in `routing.ts` plus 2 in `transport.ts`: 21 revert gates, 15
  unported-argv fallthroughs, 4 transport, 1 degenerate, and **2 dead
  branches shadowed by the `retired` route** (**F2**, applied to slice D).
  **No stop condition: no Python behavior lacks a TypeScript answer.**
- **Capture the "before" of a real database, per command family** (panel
  amendment, quality-assurance). On a copy of the real database, run one
  representative invocation for each of the 29 ported families and record,
  redacted as the harness already does, the output hash, line count, and exit
  code. This is the only before/after evidence that survives the deletion:
  `real_db_copy_parity.py` and `route_matrix.ts` both die in F, and the frozen
  goldens prove synthetic input only. The capture is replayed at plateau 3
  against the same copy (test-guide, *Plateau 3 — the replay*).

  It must be taken here, at plateau 0, because after plateau 3 the "before"
  cannot be produced at any price.

  Real database artifacts are never committed; the capture file holds hashes,
  counts, and exit codes only, and lives in `tmp/`.
- Tag and push the **baseline** at the start of this plateau:
  `cv22-ts5-baseline` → `2adf2951`, the tree the capture was taken against.
  This is provenance, not recovery.

### B. Guards first (plateau 0)

- Port `scripts/check_retired_surfaces.py` to `ts/scripts/checkRetiredSurfaces.ts`
  with the eight existing rows unchanged and the new `python-core` row
  (design idea 2). Run both in CI for one commit; both must agree on the
  clean tree and on a seeded regression (a re-added `python3 -m memory` line
  in a hook; a re-added `.py` under `src/`).
- Port `scripts/check_doc_links.py` to `ts/scripts/checkDocLinks.ts`, same
  side-by-side commit. `docs.yml` calls the Node one.

  **Carry its 26-case self-test** ([inventory F1](inventory.md#f1--the-docs-link-checkers-only-test-is-in-python)).
  The script is 57 lines with a single `main`; its real specification lives in
  `tests/unit/memory/test_docs_lint.py` — slug punctuation, duplicate-heading
  disambiguation, line-count preservation when stripping fences, the
  roadmap-template placeholder exemption and its deliberate non-extension to
  `index.md` outside templates, and the parity-fixture skip. Ported as first
  written, the Node checker would ship with **zero tests**, and the docs gate
  would go unverified in the very story that rewrites ten documentation
  files. The cases land as `ts/test/scripts/checkDocLinks.test.ts` before the
  port enters CI.

  `check_retired_surfaces.py` has no Python self-test, so its Node port's
  tests are new work either way; the side-by-side agreement run grades it.
- Port `scripts/build_claude_plugin.py` to `ts/scripts/buildClaudePlugin.ts`;
  its output must be byte-identical to the committed `plugins/mirror-mind/`
  tree (D6). US3 changes what it builds, not that it exists.
- Widen `noPythonSpawn.test.ts` into the CI step that runs the **entire**
  `ts/test` suite with `python`, `python3`, and `uv` shadowed by exit-66
  stubs, reusing the mechanism TS2's `Extension suites need no interpreter`
  step already proved on both platforms.

  It is wired **`continue-on-error: true`**, named
  `Interpreter shadow (expected red until CV22.DS10.TS5 plateau 2)`, and made
  required at plateau 2 (panel amendment, devops-engineer). A step that is
  *expected to fail* must not be a *failing required check*: "green CI on
  every push" is the one rule the
  [collaboration strategy](../../collaboration-strategy.md#protect-the-bus-factor)
  applies without exception, and a red-but-tolerated required step teaches
  exactly the habit that lets a real red slip through. Wiring it now still
  gets what the plan wanted — plateau 2's success is a visible flip, not a
  new green.

### C. Self-sufficiency (plateau 1) — Python still present

- **Version and checkout** (design idea 5): `version.ts`, `cloneRoleGuard.ts`,
  `ts/package.json` version, the name constant, tests for both including the
  "src/memory absent" regression test.
- **Migrations** (design idea 3): `migrateOnOpen.ts`, `schemaState.ts`
  messages, `runtime/migrate.ts` three verdicts and exit code, the updater's
  migrate stage failing on `declined`, `runtimeTailCli`/`migrate`/`update`
  tests. `TS_AUTHORED_MIGRATION_IDS` is **deleted**, not shrunk (panel
  amendment, database-architect): with the split gone it has no reader, and a
  one-member set with no reader is the D-023 shape being re-created in the
  story that pays D-023.

  Proven against the **committed pre-state fixtures**
  (`ts/test/fixtures/migrations/migration-NNN-pre-state.sql` →
  `migration-NNN-expected.json`), not against a current database with rows
  deleted from `_migrations`. Fifty `IF NOT EXISTS` guards in `migrations.ts`
  mean a deleted ledger row re-"applies" as a no-op and reports success: that
  fixture proves nothing and passes green. One real-shape case is added on top
  of the fixtures — a demo database generated at a pre-`015` commit, migrated
  forward, and its schema diffed against the current expected snapshot.
- **Hooks** (design idea 4): `ts/src/hooks/` entries for Claude Code
  (`session-start`, `user-prompt`, `inject`, `session-end`), Gemini CLI
  (`log-user`, `log-assistant`, `session-end`), Codex (`codex-mirror`), and the
  packaged plugin (the same four as Claude); the twelve wrappers; the plugin
  builder emits the new hook bodies; the `MIRROR_TS_MCP` gate and
  `exec python3 -m memory mcp` leave `launch.sh`.

  Each hook is validated by running the old and new versions against copies
  of the same database with the same stdin payload and diffing the rows
  (`conversations`, `messages`, `runtime_sessions`) — this is the one
  validation that is *only possible while Python still exists*, and it is why
  the hooks are rewritten at plateau 1 and not plateau 3. The diff covers the
  edge cases this surface has broken on before, not only the happy path
  (panel amendment, quality-assurance): muted state (writes nothing, exits 0),
  `session-start --fast`, an empty prompt, a payload with no `session_id`
  (Python's `mirror_state` fails loud there **by design** — keep that),
  `backfill-codex-session` on an already-backfilled session, and Windows
  cp1252 stdio, since `_prefer_utf8_stdio` lived in the Python entry point and
  the Node entries need the same posture or injected `◇` glyphs arrive as `?`.

  Three constraints the panel added:

  - **The Claude allowlist is scoped by path** (security-engineer).
    `.claude/settings.json` loses `Bash(python3 -m memory*)` and
    `Bash(python3 -c *)` and gains **`Bash(node ts/src/frontDoor/cli.ts *)`
    plus the specific hook entries under `ts/src/hooks/`** — never
    `Bash(node *)`, which is an auto-approved arbitrary-execution grant
    strictly wider than what it replaces. The cutoff records that dropping
    `Bash(python3 -c *)` is a security improvement: it was already arbitrary
    execution, auto-approved.
  - **Redaction is carried into the hook entries** (security-engineer). The
    new entries run in-process over modules and bypass the front-door CLI,
    where `frontDoorLog` and `hookPayloadRedaction.test.ts` enforce it.
    Invariant, tested: nothing a hook entry logs — on success or on failure —
    contains prompt or response text. Otherwise a failing hook writes a user's
    prompt into a file the front door never would have.
  - **`node` is resolved, and its absence is loud** (devops-engineer).
    `/usr/bin/python3` exists on every macOS; `node` usually lives under nvm
    or Homebrew and is **not on the PATH of a GUI-launched runtime**. Today's
    hooks end in `2>/dev/null || true`, so after the rewrite that same silence
    would hide a *new* failure mode — no logging, no inject, no close tail,
    discovered weeks later. Each wrapper resolves `node` through an ordered
    search (`$MIRROR_NODE`, `command -v node`, the nvm current symlink,
    `/opt/homebrew/bin`, `/usr/local/bin`); when none resolves it appends one
    line to `<mirror-home>/hooks.log` instead of failing silently, and
    `runtime diagnose` reports *node resolvable from hook context*.
- **Strings**: the init hints in `cli.ts` (`uv run python -m memory seed`,
  `identity edit`), the `journey update` usage line, and any other
  user-facing string naming `python -m memory` or `uv run`.

### D. The fallback goes (plateau 2) — Python still present, unreachable

- Delete `fallbackPython`, the `pythonTimeoutMs` helper, the `--db-path`
  stripping that existed for it, and `FrontDoorEngine`'s `"python"` member.
  The type change is the inventory: every site that no longer compiles is a
  site that was reaching for Python.
- Every revert gate (`MIRROR_TS_<FAMILY>=0`, sixteen families) and
  `transport.ts`'s `revertVar`/`mode: "python"` are deleted (D3). The
  `*_REPLAY` gates stay — they choose a fixture, not an engine.
- Every "not ported" fallthrough becomes the TypeScript-owned answer D2
  records. The front door owns a `USAGE` text for the unknown-command case.
- **Delete the two dead branches explicitly**
  ([inventory F2](inventory.md#f2--two-dead-fallback-branches-ts4-left-behind)):
  `routing.ts:693-699` (the `DS10_BACKFILL_FLAGS` fallback) and the `known`
  arm of `routing.ts:1166-1175` (the twenty Workbench actions). Both are
  shadowed by `retiredSurfaceFor()`, which matches before dispatch — verified
  by running them, not by reading. They come out as their own commit naming
  the finding, rather than vanishing inside the `FrontDoorEngine` type change,
  and the Node retired-surface guard gains a check that **no route returns an
  engine for an argv shape a retired row already claims**, so the next story
  cannot re-create the pattern.

  The `known` branch's *unknown* arm is not dead: `build change-request
  frobnicate` reaches Python today, and D2 answers it.
- `runtime diagnose` reports any `MIRROR_TS_<FAMILY>` (non-`_REPLAY`)
  variable present in the environment or `.env` as *inert since
  CV22.DS10.TS5* (D3).
- `route_matrix.ts` is retired: its contracts ("every family reverts with one
  variable") are false by design now. Its other half — "what does THIS
  install do right now" — has no engine question left to answer.
- Thirty test files rewritten to assert the new outcomes; `fallbackRoute`,
  `fallbackFailureModes` deleted; the whole-suite shadowed step (B) flips to
  green and becomes required.

### E. Debt (plateau 2)

- **D-023**: remove `backfill_safe` and `backfill_force` from
  `metadataLifecycle.ts`. The Python mirror table and its golden are deleted
  in F, so this is the single-file edit the ledger predicted; the golden is
  regenerated one last time in A *before* this edit, then hand-edited here
  with the reason recorded in its header.
- **D-024**: remove the seed-CR scan from the Refinement field. The field
  without a canonical index then has no conditional at all (D8).
- **D-025**: paid in C. Ledger rows updated to Done with the closure evidence.

### F. Deletion (plateau 3)

In one commit per row so each is reviewable and revertible:

1. `src/memory/` (135 files), `tests/` (187 files), `conftest.py`s.
2. `ts/parity/*.py` (76 — **except** `generate_demo_memory_db.py`, ported in
   G), `oracle-baseline.json`, and the TypeScript that exists only to compare
   engines: `real_db_copy_verify.ts`, `write_parity_verify.ts`,
   `schema_structural_parity.ts`, `ts4_home_copy_route.ts`, `route_matrix.ts`
   (already retired in D).

   **`migration_structural_parity.ts` and `bootstrap_custody_parity.ts` are
   NOT deleted** (panel amendment, database-architect — the blocking one).
   The first draft listed them as engine comparisons. They are not: they grade
   the TypeScript engine against **committed synthetic fixtures**
   (`ts/test/fixtures/migrations/*.sql` → `*-expected.json`), contain no
   Python, and CR051/CR052 wired them into the `ts` job precisely because they
   had silently drifted from the tests they duplicate. The day Python leaves,
   they stop being parity checks and become **the custody proof** — the only
   structural evidence that the sole custodian reproduces each migration step.
   They move to `ts/smoke/` with the single-engine smokes and keep their CI
   steps.

   The single-engine smokes — `key_hygiene.ts`, `live_chat_smoke.ts`,
   `live_embedding_smoke.ts`, `live_long_tail_smoke.ts`,
   `migrate_on_open_smoke.ts`, and the TypeScript halves of
   `builder_lifecycle_smoke.ts`, `conversation_lifecycle_smoke.ts`,
   `extension_catalog_smoke.ts` if the split is mechanical — move to
   `ts/smoke/` (D5). `scripts/mcp_two_engine_diff.sh` dies; the other
   shell smokes lose their Python branches.
3. `scripts/check_oracle_drift.py`, `scripts/reset_sandbox_pet_store.py`,
   and the three ported originals from B.
4. `spikes/ts-search-parity/` (the historical spike; `spikes/windows-frame-mockup/`
   is unrelated and stays).
5. The six inert fixture bodies under `ts/test/fixtures/ext-catalog-writes/`
   and `extension-catalog/` convert to `.mjs`/`.sh` as TS2 converted the
   dispatch tree, with their catalog goldens hand-updated for the new
   `entrypoint` shape and the reason recorded.
6. `docs/product/extensions/template/extension.py.template` and
   `cli.py.template` (D7).
7. `pyproject.toml`, `uv.lock` (D1). `[tool.ruff]`, `[tool.pytest]`,
   `[tool.coverage]`, `[tool.mypy]` have nothing left to configure.

### G. CI and the guard row (plateau 3)

- **Port `ts/parity/generate_demo_memory_db.py` to TypeScript** (panel
  amendment, devops-engineer). The first draft said "demo database from the
  TypeScript generator (or the committed demo fixture, decided at
  implementation)" — there **is** no TypeScript generator, and F deletes the
  only one. The smokes, the hook row-diffs, and the Navigator route all
  consume its output. It is the "portable validation source" the
  [collaboration strategy](../../collaboration-strategy.md#make-validation-portable)
  names; a committed binary fixture cannot be diffed, reviewed, or regenerated
  from nothing. Port it, and prove the port by generating a database that
  satisfies the same smokes.
- `tests.yml`: the `test` job (Python matrix, ruff, pytest, golden
  determinism, oracle drift) is deleted; the `ts` job drops
  `setup-python`/`setup-uv`/"Install Python deps (for the fallback e2e)" and
  keeps its `Migration fixture structural parity` and `Bootstrap custody
  parity` steps, re-pointed at `ts/smoke/`; the `parity` job becomes `smoke` —
  demo database from the ported generator, the retained smokes, the shadowed
  whole-suite step (now required), and the retired-surface check with the
  `python-core` row live.
- `docs.yml`: Node only.
- The goldens: a `README.md` in `ts/test/goldens/` stating that from this
  story on they are frozen fixtures, how to change one deliberately, and
  which story froze them.

### H. Docs and records (plateau 4)

- `REFERENCE.md`, `docs/getting-started.md`, `docs/process/development-guide.md`
  (setup, test commands, the pre-push set, the evals section's Python
  mentions), `docs/process/engineering-principles.md`,
  `docs/product/architecture.md`, `docs/product/specs/runtime-interface/index.md`
  (hooks section rewritten around the Node entries), the extension
  authoring and testing guides and template README (around `mirror-cli-v1`
  and `mirror-context-v1` only), `AGENTS.md` and `CLAUDE.md` developer
  conventions (`uv run` → `node`/`npm test`).
- `docs/releases/pending-cutoffs.md`: the `python-core` cutoff — `python -m
  memory`, `uv run`, and the `MIRROR_TS_*` revert gates no longer exist; the
  hooks are Node; Desktop and any other consumer of Python internals stay on
  the last Python-bearing release; `.env` revert variables are inert.
- DS10 `index.md`: TS5 row, Zero Python gate table dispositions marked, gate
  section marked satisfied for the repository with the US3 residue named.
- `docs/project/debt.md`: D-023, D-024, D-025 closed.
- `docs/project/decisions.md`: one entry for D1/D2/D3 (the oracle-free
  choices and the version move), linking here.
- Worklog milestone; the journey path.

## Non-Goals

- **No port of anything.** If plateau 0 finds a Python behavior that
  TypeScript does not answer, this story stops and the Navigator decides
  whether it is a new story or a recorded cutoff. The strangler is finished;
  this story believes that claim and verifies it, it does not extend it.
- **No npm.** No rename, no `bin`, no publish, no dist-tag, no `frame/`, no
  `installer/`. `launch.sh` keeps its `$BASH_SOURCE` resolution.
- **No new behavior beyond D2.** The unknown-command answer and the
  three-verdict migrate are the only surfaces whose bytes change on purpose.
- **No golden edited except for a recorded reason** (D-023's table, the
  fixture `entrypoint` shape). Every other golden is byte-identical to the
  plateau-0 regeneration.
- **No touch of Mirror Desktop's acceptance kit or the `mirror-desktop`
  repository.**
- **No release.** CV22 releases once.

## Plateaus

| # | Name | Closes with | Python |
|---|---|---|---|
| 0 | Freeze and guard | final parity evidence recorded; per-family real-copy capture taken; recovery tag pushed; both Node guards agreeing with their originals in CI; shadowed whole-suite step wired non-blocking | present, reachable |
| 1 | Self-sufficient | version/guard/migrate/hooks/strings on TS; hook row-diffs recorded; CI green | present, reachable |
| 2 | Unreachable | `fallbackPython` gone; `"python"` not a `FrontDoorEngine`; shadowed step green and required; D-023/D-024 paid | present, **unreachable** |
| 3 | Deleted | F and G landed; `git ls-files '*.py'` empty; `python-core` row live; CI Node-only and green | gone |
| 4 | Recorded | H landed; panel handoff review; Navigator validation | gone |

Each plateau ends with a handoff statement in `index.md` — what is true,
what is intentionally undone, what is next, which evidence. A session that
must stop mid-plateau says so there. The commits are small: one per row in F,
one per hook family in C, one per guard port in B.

## Rollback

- Plateaus 0–2 are ordinary code changes on a branch; `git revert` restores
  the fallback because Python is still in the tree.
- Two tags, and the distinction matters:

  - **`cv22-ts5-baseline`** — pushed at the start of plateau 0, pointing at
    `2adf2951`. It is the provenance of the per-family capture, not a
    recovery point.
  - **`cv22-last-python-bearing`** — pushed at the **end of plateau 2**,
    immediately before F's first commit. *That* is the recovery point.

  The first draft of this amendment put the recovery tag at the end of
  plateau 0, which would have made recovery discard plateaus 1 and 2 — the
  self-sufficiency and fallback-removal work — to escape a problem created
  in plateau 3. The last commit that still *contains* Python is the last
  commit of plateau 2, and that is what "last Python-bearing" has to mean
  for the tag to be worth having. Both are annotated, both are pushed, and
  neither name can match the release doctor's release-tag pattern.

  Both SHAs are recorded in `index.md` and `decisions.md`.

  Pushed, not local (panel amendment, devops-engineer): a local-only tag is a
  single-machine recovery point in a single-owner migration, which is the
  exact bus-factor risk the strategy exists to mitigate. A tag is not a
  release, and pushing one authorizes nothing.
- No user is exposed: this story does not release.

## Acceptance Behavior

The six blocks in [index.md — Acceptance Behavior](index.md#acceptance-behavior),
verbatim. In addition:

```text
Given the plateau-0 golden regeneration
When any golden under ts/test/goldens/ is compared to its committed bytes at Done
Then every golden is identical
Except metadata-lifecycle (D-023) and the extension-catalog fixtures (F.5),
  whose headers name this story and the reason

Given the Node ports of check_retired_surfaces and check_doc_links
When each runs beside its Python original on the clean tree and on a seeded regression
Then both exit codes and both first problem lines agree, in CI, before the original is deleted

Given a clone-role guard test with src/memory/ absent from the fixture
When isMirrorMindCheckout is asked about the fixture root
Then it answers true

Given the plateau-0 per-family capture on a copy of the real database
When the same invocations are replayed at plateau 3 against the same copy
Then every output hash, line count, and exit code is identical

Given a committed pre-state fixture for any migration 001 through 017
When the TypeScript engine migrates it forward
Then the resulting schema equals the committed expected snapshot
And this holds with no Python present
```

## Validation Route

[test-guide.md](test-guide.md) carries the commands. In summary:

- **Automated**: `npm test` in `ts/` (the full suite), the same suite under
  the interpreter shadow, `checkRetiredSurfaces.ts`, `checkDocLinks.ts`,
  `checkSkillCommandParity.ts`, `tsc --noEmit`, `biome check`; on both CI
  platforms.
- **Navigator route** (E2E, required — this story removes an engine; a
  fixture-level route cannot show that a real runtime session survived it):
  on a copy of the real database, **with the shadow-stub directory prepended
  to PATH for the whole walk**, walk one session through each runtime's
  hooks — Pi, Claude Code, Gemini CLI, Codex wrapper, and the packaged
  plugin's MCP launcher — then read the conversation back with `recall`;
  replay the plateau-0 per-family capture; invoke one unknown command and one
  unknown subcommand; migrate a genuinely pre-`015` copy; set
  `MIRROR_TS_BUILD=0` in a scratch `.env` and observe `runtime diagnose` name
  it inert while `build load` still answers from TypeScript.

  Shadow-prepend rather than PATH-strip (panel amendment, devops-engineer):
  the first draft filtered PATH entries matching `python|uv|pyenv|.venv`,
  which does not remove `/usr/bin` — where macOS keeps `python3` — so the
  route's own precondition was false as written.
- **Pass**: every observation matches the acceptance blocks; **the shadow
  stubs' log file is empty**; the replayed capture matches plateau 0 exactly;
  the `recall` transcript contains every hook-logged turn.
- **Fail**: any line in the shadow log (a spawn was attempted), any hook that
  silently no-ops, `nothing pending` on a genuinely behind-schema copy, a
  replay hash mismatch, or a golden diff outside the two named exceptions.

  The log is the verdict, not a `ps` sample: sampling a process tree is
  non-deterministic and a short-lived spawn between samples is invisible.
  A stub that logs cannot be missed.

## Implementation Contract

- TDD for every behavior change: the migrate verdicts, the unknown-command
  answers, the version/guard readers, each hook entry, the `python-core`
  guard row. Characterization first for the hooks (record what Python writes,
  then make Node write the same).
- Keep changes scoped to `CV22.DS10.TS5`; `frame/`, `installer/`, and the
  npm shape are US3.
- **Python commands and tests run with `uv run` only until plateau 3, and
  only to grade TypeScript against the oracle.** After plateau 3 there are
  none. (The runtime scaffold's line "Use uv run for Python commands and
  tests" is the `AGENTS.md` convention this story retires; slice H rewrites
  it.)
- No `git add .`; commit only story-scoped files; one commit per row in F.
- Descriptive English commit messages explaining why.
- After every push, verify GitHub Actions with `gh`; the pre-push set is the
  workflow's own list until G rewrites it, then the new list.
- Check the artifact, not the claim about the artifact (TS4's lesson): at
  Done, the DS10 candidate row, the gate table, the debt ledger rows, and the
  journey path are each opened and read, not assumed updated.

## Stop Conditions

- **A Python behavior TypeScript does not answer** surfaces at plateau 0 or
  later — a route, a hook step, a migration, a test assertion with no TS
  carrier. Stop; Navigator decides port-as-new-story or cutoff.
- **The hook row-diff is not empty** for any hook family and the difference
  is not explained by a timestamp or session id. Stop; do not proceed to
  plateau 2 with a hook that writes different rows.
- **A Node guard disagrees with its Python original** on either the clean
  tree or the seeded regression. Stop; the port is wrong or the original was.
- **The split of a two-engine smoke is not mechanical** — the TypeScript half
  needs new fixtures or logic. Record the smoke as retired with the reason
  instead of porting; do not stop, but do not port either.
- **A golden differs at plateau 0** from its committed bytes. The oracle
  drifted after the last regeneration; stop and reconcile before freezing.
- `scope_change_detected`, `plan_rule_conflict`,
  `failing_required_check_without_clear_fix`, `navigator_decision_needed`.

## Decisions This Plan Asks The Navigator To Take

**D1 — `pyproject.toml` goes here, and the version goes to `ts/package.json` here.**
*Recommended.* Alternatives: (a) keep a version-only `pyproject.toml` until
US3 — rejected: a `pyproject.toml` declaring a Python package with no source
is false, Desktop's binding contract would read it as a valid Python root,
and the Zero Python gate's own table assigns the file to TS5; (b) defer the
file to US3 and let the gate close there — rejected: TS5's done condition
would then be unprovable by TS5. The move contradicts the *sequencing* in
`version.ts`'s comment (US2 D2 said US3), not its *intent* (one body, one
change): US3 still changes exactly one place, the name constant and the
`private` flag.

**D2 — the oracle-free answers.** *Recommended:* unknown top-level command →
`Unknown command: <name>` plus a TypeScript-owned usage text on stdout, exit
**1** (Python's `_dispatch` shape, preserved because it is the one scripts
observed); unknown subcommand within a family → the family's one-line usage
on stderr, exit **2** (argparse's shape, for the same reason). Both recorded
in `decisions.md` as deliberate, and the usage text is the front door's, not
a copy of `__main__.py`'s.

*Confirmed at plateau 0* ([inventory F3](inventory.md#f3--the-unknown-subcommand-answer-leaks-the-interpreters-filename)):
both exit codes are 1 and 2 as assumed — measured, not inferred. One
improvement is taken deliberately: argparse prints **`__main__.py`** as the
program name, leaking an internal Python filename to every user who mistypes
a subcommand. The TypeScript answer names the command family instead. This is
the one place in the story where oracle-free means *better* rather than merely
*different*, and it is recorded as such.

**D3 — revert gates.** *Recommended:* delete every `MIRROR_TS_<FAMILY>`
route gate and `transport.revertVar`; keep every `*_REPLAY` gate; a stale
gate in the environment is **ignored** by routing and **reported** by
`runtime diagnose`. Alternative — the front door warns on every command —
rejected as noise on every invocation for a variable that changes nothing.

**D4 — hooks.** *Recommended:* one Node entry per hook under `ts/src/hooks/`,
shell wrappers resolving the repository from `$BASH_SOURCE`. Alternative —
port `mirror_state` and `extract_prompt` as front-door subcommands and keep
the shell flow — rejected: five spawns per prompt for the Claude hook, and two
commands whose only caller is one script.

**D5 — `ts/parity/` and the goldens.** *Recommended:* the engine-comparison
harness dies with the oracle; single-engine smokes move to `ts/smoke/`; the
61 goldens freeze with a README. Alternative — keep `ts/parity/` as a name —
rejected: parity with what?

*Amended at the panel:* `migration_structural_parity.ts` and
`bootstrap_custody_parity.ts` survive the rename — they grade TypeScript
against committed fixtures, not against Python, and they become the custody
proof once the second engine is gone. `generate_demo_memory_db.py` is ported,
not deleted. The frozen-by note lives in `ts/test/goldens/README.md`, because
JSON goldens cannot carry a header comment; a `_frozen_by` key is added only
if the loaders are confirmed to ignore unknown keys.

**D6 — `scripts/`.** *Recommended:* `check_retired_surfaces`,
`check_doc_links`, and `build_claude_plugin` port to Node in this story
(side-by-side agreement for the guards; byte-identical output for the
builder); `check_oracle_drift` and `reset_sandbox_pet_store` are deleted.
This moves the plugin builder from US3 to here, because a `.py` cannot
survive this story's done condition; US3 still owns what it builds.

**D7 — Python extension templates.** *Recommended:* delete
`extension.py.template` and `cli.py.template`; the template README teaches
`mirror-cli-v1`/`mirror-context-v1` with the `.mjs` template as the shape.
They are not `.py` files, so the gate does not catch them; they teach an API
whose host TS2 deleted.

**D8 — debt.** *Recommended:* pay D-023 (single-file), D-024 (remove the
scan — the field without an index gets zero conditionals), and D-025
(required) here.

**D9 — the panel.** This story is reviewed by the full baseline panel
(engineer, quality-assurance, database-architect, devops-engineer,
security-engineer) at Plan, before approval, and at handoff. `ai-engineer`
is not required: no model-in-the-loop behavior changes.

### Taken at plateau 2 (Navigator, 2026-09-24)

Plateau 2 stopped at the first stop condition before writing D2's answers;
the findings are [F5–F9 in the inventory](inventory.md#4-plateau-2-findings-2026-09-24).
Four decisions, each as recommended:

- **F5 — fixed here.** Valid flag-first invocations are rewritten to the
  subcommand-first shape once, before routing (`frontDoor/argvShape.ts`),
  and proven pairwise against the oracle while it exists. This also fixes
  the two silent-write defects in the same class (`tasks <options> add|done|…`,
  `journey <options> update`).
- **D2 stays uniform, amended by F6.** Every family answers an unknown or
  missing subcommand in argparse's shape — usage and one `error:` line on
  stderr, exit 2, the shape `runtime` already has since US2 — with the
  family's own name as the program. Seven families change exit code or
  stream in that error path, recorded as deliberate. Added: `-h`/`--help`
  after a family answers the family's usage on stdout, exit 0 — argparse's
  help shape — so help does not become an error when Python leaves.
- **F7 — the `Python:` line leaves `runtime status`.** The renderer changes
  on both engines in one commit, so the golden regenerates and the
  determinism gate stays meaningful until plateau 3; the oracle-drift
  baseline is re-taken for the changed file.
- **F9 — `mcp` routes to the TypeScript server.** A front-door entry to the
  server DS9 already ported, not a port; the acceptance block's "any of the
  32 top-level commands" holds as written.

### Asked at plateau 3 (Navigator, pending)

Plateau 3 deleted F.1–F.4 and landed slice G, then stopped at three findings
the Plan did not anticipate ([inventory — plateau 3](inventory.md#5-plateau-3-findings-2026-09-24)).
Each is a Driver recommendation awaiting the Navigator.

**D10 — the command-skill entrypoint contract** (F13; blocks F.5 and F.6).
The validator requires every command-skill's `entrypoint.module` to resolve to
a `.py` file the core has not imported since TS2.

- **(a) Recommended: `entrypoint` becomes optional for command-skills**, and is
  validated exactly as today when present. The six fixtures drop `entrypoint:`
  and their inert bodies; the catalog goldens lose the entrypoint lines and the
  file entries, hand-edited with the reason. D7 proceeds as approved: both
  Python templates go, and the template teaches declared runtimes with no entry
  file. Every installed extension validates as it does today. This removes the
  vestige — a file demanded and never read — rather than generalizing it, and
  TS2 already declared both runtime protocols language-neutral.
- (b) Accept other entry files (`.py`, `.mjs`, `.js`, first that exists). The
  template would then ship an entry file that nothing ever runs.
- (c) Keep the rule and exempt the fixtures by name, as models of extensions
  that may legitimately be Python. The Outcome's `git ls-files '*.py'` is then
  not empty, and D7 shrinks to `cli.py.template`.

Either way D7 has one consequence to confirm: `cli.py.template` is the
documented migration path for extensions still on `register(api)` handlers.
Extensions that already copied it keep their copy, and it stays readable at
the recovery tag.

**D11 — `pyproject.toml`'s readers in `frame/` and `installer/`** (F12; blocks
F.7).

- **(a) Recommended: delete it here, and re-point only the reader a workflow
  runs** — `frame/tests/version-sync.test.js` reads the version from
  `ts/package.json`, as D1 did for the product. Root detection in the Frame and
  the installer stays with US3 and is named in the known risks beside the nine
  Python call sites: they fail together, and the npm artifact decides what a
  "Mirror root" is for both.
- (b) Re-point every reader to `ts/package.json` here. The installer half is
  PowerShell that nothing on this branch can run.
- (c) Keep `pyproject.toml` until US3. Rejected by D1's own reasoning.

**D12 — the user-facing strings, and when the `python-core` row goes live**
(F14).

- **(a) Recommended.** Every user-facing `python -m memory X` or
  `uv run python -m memory X` becomes `mirror X` through D2's `PROGRAM`
  constant — the one place US3 renames — with the recorded goldens hand-edited
  and listed in `test/goldens/README.md`, and the replay naming the families
  whose bytes change, as deliberate. This amends the Non-Goals' "only D2 and
  the migrate verdicts" and "exactly two goldens". The row goes live in two
  halves: **absence** (every retired path) at the end of plateau 3, and
  **mentions** at the end of plateau 4, once slice H has rewritten the
  documentation that holds ~30 of the 79.
- (b) Leave the strings for US3, which names the program, with an expiring
  exemption per file, and take the row live whole at plateau 4.

## Review

**Plan review held 2026-09-23**, before implementation, per the
[collaboration strategy](../../collaboration-strategy.md#the-persona-panel-is-the-standing-second-opinion).
Lenses convened at the Navigator's direction: **database-architect,
security-engineer, devops-engineer, quality-assurance**. `engineer` was not
convened — recorded here rather than assumed, since the baseline panel is
five; its domain (code structure, module boundaries, the `FrontDoorEngine`
type change) is the least novel part of this story, and the four lenses that
ran own the failure modes the inventory surfaced. `ai-engineer` was not
required: no model-in-the-loop behavior changes.

All eight findings were applied to this Plan and to
[test-guide.md](test-guide.md) before the approval gate. None changed the
plateau order or decisions D1–D9.

### Blockers (applied)

1. **database-architect — F.2 deleted its own custody proof.**
   `migration_structural_parity.ts` and `bootstrap_custody_parity.ts` are
   fixture-graded, not engine-graded. Deleting them would have removed the
   only structural evidence that the sole custodian reproduces each migration
   step, in the story that makes it sole custodian. **Kept, moved to
   `ts/smoke/`, CI steps retained.**
2. **database-architect — the behind-schema fixture proved nothing.**
   `DELETE FROM _migrations WHERE id > '014'` leaves a current schema with a
   lying ledger; fifty `IF NOT EXISTS` guards make the re-run a no-op that
   reports `applied`. **Replaced with the committed pre-state fixtures plus
   one real pre-`015` database.**
3. **quality-assurance — nothing compared real output before and after.**
   `real_db_copy_parity` and `route_matrix` die at plateau 3; the Navigator
   route exercised hooks and error shapes but not one of the 29 ported
   families. **Plateau-0 per-family capture on the real copy, replayed at
   plateau 3.**
4. **devops-engineer — the demo-database generator had no port.**
   "Decided at implementation" was deferring a dependency of the smokes, the
   row-diffs, and the Navigator route onto a file F deletes. **Ported in G.**

### Non-blocking, applied

5. **devops-engineer** — the shadow step was wired as a required red check
   across two plateaus, against "green CI on every push". Now
   `continue-on-error` until plateau 2.
6. **security-engineer** — `.claude/settings.json` "gains the `node` form" was
   underspecified; `Bash(node *)` would be a wider grant than the one it
   replaces. Now scoped by path. Redaction carried into `ts/src/hooks/` as a
   tested invariant; row-diff evidence on the real copy is redacted to counts
   and hashes.
7. **devops-engineer** — `node` is frequently absent from a GUI-launched
   runtime's PATH while `python3` never is; the existing `|| true` silence
   would hide a new failure. Ordered resolution, `hooks.log`, and a
   `runtime diagnose` line added. Also: the Navigator route's PATH filter did
   not remove `/usr/bin`, so its precondition was false — now a shadow
   prepend with a log file as the verdict.
8. **quality-assurance** — hook validation covered only the happy path;
   edge cases enumerated (mute, `--fast`, empty prompt, missing `session_id`,
   re-backfill, cp1252 stdio). **database-architect** — delete
   `TS_AUTHORED_MIGRATION_IDS` rather than shrink it.

### Accepted boundaries

- **The installed-plugin window is broken by design between TS5 and US3** and
  is now named as an accepted known risk in
  [index.md](index.md#known-risks-accepted-at-plan), with the smoke's
  disposition decided rather than left to pass vacuously.
- `$BASH_SOURCE` resolution from a hook copied out of the repo resolves to a
  missing file and exits 1 — theoretical, no abuse path, no control added.
- The `frame/`/`installer/` Python call sites stay with US3; the Zero Python
  claim for the shipped artifact is therefore US3's to make, not this
  story's.

### Question carried to the next plateau

- Do the golden loaders ignore unknown keys? If yes, `_frozen_by` goes in the
  two hand-edited goldens; if no, the README is the only record. Answered at
  plateau 0, not guessed here.

The handoff review (after validation, before Done) is the second checkpoint
and has not happened.

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
- **Before approval:** the persona panel Plan review (D9). **Held 2026-09-23;
  findings recorded in [Review](#review) and applied to this Plan and the
  test guide.** Four of the five baseline lenses were convened at the
  Navigator's direction; the omission of `engineer` is recorded, not silent.
- What the Navigator is approving: this Plan as amended, and decisions D1–D9
  as recommended. Approving D1 and D6 also accepts that they move recorded
  work earlier than US2/the gate placed it, for the reasons each states.
