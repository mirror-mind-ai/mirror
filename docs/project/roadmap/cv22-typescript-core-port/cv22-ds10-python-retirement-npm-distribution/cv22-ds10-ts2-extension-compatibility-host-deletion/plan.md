[< Story](index.md)

# Plan — CV22.DS10.TS2

**Authored:** 2026-09-21, from Navigator decision **option 3** (migrate what is in
daily use, retire the rest under the cutoff). Daily-use set: **google-workspace,
session-export, persona-export**. Retired set: **google-ads, meta-ads**.

## Objective

The Mirror core stops owning a Python bridge for extensions. `memory.extensions.compat_host`
and every TypeScript branch that spawns it are deleted. A subcommand or context provider
without a declared runtime refuses **explicitly** (one line naming the fix) and
**fail-soft** (`mirror load` continues; `ext <id> <sub>` exits 1 without a traceback).
The three daily-use extensions are migrated to the declared-runtime protocols so they keep
working the day this lands. The cutoff is documented, and a repository check proves the
bridge is gone and stays gone.

## What Is True Before This Story

- The host has two request kinds on one process: `mirror-context-v1` (DS7.TS2) and
  `mirror-cli-v1` (DS7.TS4, D1). Three TypeScript branches reach it:
  1. `ts/src/extensions/contextRuntime.ts` — `collectExtensionContext` falls back to
     `uv run python -m memory.extensions.compat_host` when a capability has no
     `provider_runtime` (`options.legacyCommand` / `legacyCwd`);
  2. `ts/src/extensions/dispatch.ts` — `runExtensionSubcommand` spawns the host for an
     undeclared subcommand **and for every `--help` listing**, declared or not ("DS10 owns
     the post-retirement listing");
  3. `ts/src/extensions/dispatch.ts` — `validateExtensionRegister` (mode
     `validate_register`), called by `extensions install` through
     `extensionCatalogRoute.ts` and by the install write-parity probe in
     `ts/src/parity/writeParityFixture.ts`.
- Inventory on the Navigator's home (index.md): seventeen capabilities, zero declarations.
- The three daily-use extensions use a **four-member** API surface: `register_cli`,
  `read`, `execute`, `commit`. `session-export` and `persona-export` already import
  `memory` only under `TYPE_CHECKING`; `google-workspace` imports `ExtensionAPI` at
  runtime for typing only. All three shell out to `automation` tools with stdlib only.
  Their source of truth is `~/dev/workspace/automation`, not this repository.
- A declared `mirror-cli-v1` command receives `MIRROR_HOME`, `MIRROR_DATABASE_PATH`,
  `MIRROR_EXTENSION_ID`, `MIRROR_EXTENSION_ROOT`, `MIRROR_TABLE_PREFIX` in its environment,
  argv appended verbatim, all three streams inherited (`declaredEnvironment`).
- Eleven Python-bodied fixtures under `ts/test/fixtures/**` back `catalog.test.ts`,
  `catalogWrites.test.ts`, `contextRuntime.test.ts`, and `dispatch.test.ts`.
- `scripts/check_retired_surfaces.py` has `journey-projections` and `web-console` rows.
  `src/memory/oracle_drift.py` lists `compat_host.py` as a guarded seam.
- `memory.extensions.api.VERSION` still reads `1.1` after TS1 removed
  `journey_projections` (D-018); `docs/product/extensions/api-reference.md` names TS2 as
  the version authority.

## Scope

### A. Delete the bridge (core)

- Delete `src/memory/extensions/compat_host.py` and
  `tests/unit/memory/extensions/test_compat_host.py`; drop the `oracle_drift.py` entry.
- `contextRuntime.ts`: remove the legacy invocation, `legacyCommand`, `legacyCwd`.
- `dispatch.ts`: remove `DEFAULT_HOST_COMMAND`, `spawnHost`, `buildSubcommandRequest`,
  `ExtensionSubcommandRequest`, `validateExtensionRegister`, and the host-related
  `DispatchOptions` (`hostCommand`, `hostCwd`); `extensionCatalogRoute.ts` and
  `writeParityFixture.ts` lose their host plumbing.
- `ts/src/mirror/orchestration.ts` no longer threads a legacy command.

### B. Fail explicit, fail soft

- **Context provider without `provider_runtime`:** new diagnostic kind
  `no_provider_runtime`. The section is skipped, `mirror load` continues, and the
  diagnostic renders through the existing `mirrorModeRoute.ts` diagnostic path so the
  Navigator sees which capability went dark and why.
- **Subcommand without a declared runtime:** one line on stderr, exit 1, no spawn:
  `Mirror TS front door: extension/<id> declares no runtime for '<sub>'. The Python
  compatibility host was retired; declare cli.subcommands[].runtime (mirror-cli-v1) in
  skill.yaml — see docs/releases/pending-cutoffs.md.`
- **`ext <id>` listing (`--help`, `-h`, `help`, no subcommand):** rendered by TypeScript
  from the manifest's `cli.subcommands[]` (name + summary), flagging entries with no
  runtime as `(no runtime declared)`. The format follows Python's
  `_print_subcommand_help` shape where the manifest can supply it; this is a TS-owned
  surface from here on and the goldens are updated, not graded against Python.
- **`extensions install`:** the `register(api)` import is gone. Install validates what
  the manifest declares (every `runtime.command` / `provider_runtime.command` resolves
  inside the root — the rule already in `commandStaysInside` / `validateCommandPaths`) and
  prints one warning line naming subcommands and providers that declare no runtime.
  Install still succeeds for them: a skill-only or partially-migrated extension is legal.

### C. Fixtures without an interpreter

- Rewrite the eleven `ts/test/fixtures/**/*.py` bodies as `.mjs` scripts with declared
  runtimes, so CI needs no Python for the extension suites. The tests keep proving
  "any executable runtime" — one fixture declares a `sh` script — just not Python.
- Tests that asserted host fallback now assert the refusal line, the diagnostic kind, the
  listing, and the install warning.

### D. Migrate the daily-use set (in `~/dev/workspace/automation`)

- Reference shim: `docs/product/extensions/template/cli.py.template` (stdlib only). It
  opens `MIRROR_DATABASE_PATH` with `sqlite3`, exposes `read` (refuses writes), `execute`,
  `executemany`, `commit`, `transaction`, and `register_cli`; imports the extension's
  `register`; dispatches the subcommand named in `argv[1]`; exits with the handler's code.
  Python remains the **extension's** runtime, which the gate permits.
- **The shim carries two properties the core used to own, and they are acceptance
  criteria, not implementation detail** (panel findings S-1, D-1):
  - **Write prefix guard.** Port `_is_write`, `_extract_table_targets`, and
    `_enforce_prefix` from `memory/extensions/api.py`. A write outside `ext_<id>_*` raises,
    exactly as today. The shim exposes **no raw-connection escape hatch** — `api.db`
    does not cross. Without this, migration silently grants every migrated extension
    unconstrained write access to identity, memories, and conversations.
  - **Connection discipline.** `PRAGMA busy_timeout=30000` and `PRAGMA foreign_keys=ON`
    on open, inherited from the core's contract (`ts/src/db/database.ts`). A default
    `sqlite3.connect` gives a 5s timeout and no FK enforcement — a regression against even
    the retired host, which passed `timeout=30`.
- **Interpreter resolution (O-1, Navigator decision 2026-09-21): ambient `python3`.**
  The declaration is `[python3, cli.py, <name>]`, resolved from `PATH`. This is correct
  for the Navigator's own tooling and is **not** presented as the recommended
  third-party pattern: the template is labelled personal tooling, and the constraint it
  carries (a pinned interpreter needs a venv inside the extension root, because
  `commandStaysInside` refuses absolute paths) is documented alongside it. The
  third-party story is deferred to **US3** under [CR092](../../../../refinement/rs010-cv22-oracle-and-port-hygiene/cr092-the-shim-template-resolves-python3-from-ambient-path.md),
  revisit trigger: the first time the template is offered as a supported authoring
  pattern.
- Per extension (google-workspace, session-export, persona-export): copy the shim as
  `cli.py`, add `runtime: {protocol: mirror-cli-v1, command: [python3, cli.py, <name>]}` to
  each `cli.subcommands[]` entry, move `google-workspace`'s `ExtensionAPI` import under
  `TYPE_CHECKING`. Committed in `automation`, not here. The `entrypoint:` field stays —
  the manifest validator is a byte-for-byte port graded by `extensions list`, and the field
  is now tolerated and documented as legacy.
- Documentation: `docs/product/extensions/` gains "Migrating a `register(api)` extension"
  with the shim and the per-capability rule.

### E. Cutoff, check, version authority

- `docs/releases/pending-cutoffs.md` gains a section: what no longer exists (the compat
  host; `register(api)` as a core-served contract), what to do (declare a runtime; the
  shim), and what is retired by decision (google-ads, meta-ads stay installed and refuse
  until their owner migrates them).
- `scripts/check_retired_surfaces.py` gains a `compat-host` row: absent files, residue
  patterns (`compat_host`, `compat-host`, `legacyCommand`, `hostCommand`,
  `validate_register`), history paths excluded. This is gate item 5 and item 2 in one
  mechanical place; the packaged-artifact half is asserted by the same script on the
  tracked-file set the package is built from.
- **D-018 decision (recorded in `decisions.md`):** `VERSION` is **not bumped**. A bump
  advertises a new in-process capability; there is none — the capability moved out of
  process. The api-reference note is rewritten: `1.1`'s `journey_projections` never
  reached a user; the in-process API is frozen at `1.1` and retired with the host; the
  manifest runtime protocols are the contract; the constant survives only until TS5
  deletes the module.
- `README.md`, `REFERENCE.md`, `docs/product/extensions/api-reference.md`, the burn-down
  ledger's TS2/TS4 rows, and the DS10 gate section updated in the same change.

## Non-Goals

- No JavaScript rewrite of any extension; no change to what the handlers do.
- No uninstall of google-ads or meta-ads; retirement is a documented cutoff, not a
  removal from the Navigator's home.
- No change to Python's own `ext` dispatcher (`src/memory/cli/ext.py`) — it dies in TS5.
- No new protocol, no stdin passthrough contract beyond what `declaredEnvironment`
  already gives a declared command, no `MIRROR_SUBCOMMAND` variable (the name rides in
  the declared command).
- No relaxation of the manifest validator (`entrypoint:` stays required where it is
  today); a CR captures the follow-up if the Navigator wants it gone before TS5.
- No `PYTHON_ALLOWLIST` change and no front-door routing change — `ext` and
  `extensions` already answer from TS.

## Plateaus

Resumable in this order; each leaves CI green.

**Corrected 2026-09-21, before code.** The authored plateau 1 ("fixtures to Node, ahead of
the deletion, independent") rested on a false premise. `ts/test/extensions/dispatch.test.ts`
is not a unit test with Python-flavored fixtures: it is a **parity corpus** of 40 cases in
`ext-dispatch.golden.json`, recorded from Python and replayed through the real host seam.
Fixtures and goldens are one artifact, and most of what they grade is the thing being
deleted. Fixtures therefore move **with** the deletion, not ahead of it. This is the
story index's own lesson from TS1 and US1 — the authored gate names one layer and the
inventory finds more.

1. **Delete the bridge, land its replacement, and re-express the corpus — one slice**
   (panel finding E-1, plus the corpus finding above). Tests first, against post-deletion
   behavior: refusal line, `no_provider_runtime`, manifest-rendered listing, install
   warning, partial-migration case. Then remove the Python module, its test, the three TS
   branches, and the parity probe's register step; `oracle_drift.py` updated. Fixtures
   convert in the same slice: `tools/extension.py` → declared `commands/*.mjs`; `broken`,
   `silent`, `malformed` reduce to body-less manifest fixtures; `noisy`, `ext-beta`,
   `ext-mismatch` (install-copy behavior, genuinely host-independent) convert mechanically.
   Extension suites green with no interpreter on `PATH`.
2. **Shim + migration.** Template in this repo, with the prefix guard and pragmas under
   test; three extensions migrated in `automation`; each capability exercised through the
   TS dispatcher on the Navigator's real home.
3. **Cutoff, check, docs, D-018.** `check_retired_surfaces.py` row; pending-cutoffs;
   decisions; api-reference; README/REFERENCE; ledger; DS10 gate section marked.

### Golden corpus disposition (Navigator decision 2026-09-21: **retire with a record**)

Git holds the parity history; a frozen, unread fixture would be dead code. Each group's
fate, recorded here and carried to the burn-down ledger:

| Cases | Group | Fate |
|------:|-------|------|
| 8 | path resolution (`traversal_id`, `absolute_id`, `dot_id`, `trailing_slash`, `empty_id`, `extension_not_installed` ×2) | survive untouched — `pythonPathJoin`, never reached the host |
| 4 | declared runtime (`receives_argv`, `no_argv`, `keeps_flags`, `exit_code`) | survive untouched — already the post-deletion path |
| 10 | host-executed behavior (`echo_*` ×6, `exit_code_is_preserved`, `both_streams_reach_the_caller`, `write_reaches_*` ×2) | migrate to the declared path — argv verbatim, exit code, streams, and writes landing in the right database must still hold |
| 8 | Python-host semantics (`string_exit_code_is_coerced`, `none_return_escapes`, `extension_error_is_a_printed_line`, `unhandled_exception_escapes`, `load_failure_*` ×2, `malformed_manifest_escapes` ×2) | **retire** — CPython coercion and traceback rules; nothing reproduces them once the host is gone |
| 4 | live-registry listing (`listing_empty_registry`, `unknown_subcommand_*` ×2, `declared_listing_comes_from_the_registry`) | **retire and replace** — listing source moves from `api.cli_registry` to the manifest |
| 2 | host fallback (`declared_without_runtime_falls_back`, `declared_but_malformed_falls_back`) | **invert** — same fixtures, opposite expectation: refusal, not fallback |
| 4 | listing shape (`listing_bare_id`, `listing_long_help_flag`, `listing_short_help_flag`, `listing_help_word`) | re-baseline — shape survives, source changes |

## Rollback

This story has **no revert gate**. Every earlier burn-down story shipped behind a
`MIRROR_TS_*` flag; this one deletes source, and `backup` protects the database, not the
bridge. The rollback is `git revert`, and it spans **two repositories** (panel finding
Q-2).

- **Ordered revert: `automation` first, then core.** Restoring the host while the
  extensions still declare runtimes is safe; restoring `register(api)` handlers with no
  host to run them is not.
- **What makes the ordering safe, and must be verified rather than assumed:** a declared
  subcommand never reaches the host (`runExtensionSubcommand` checks `readDeclaredCommands`
  before falling back), so a migrated extension works in **both** worlds. Plateau 3
  verifies this explicitly — the migrated extensions are exercised once *before* the core
  deletion commit, against the host still present. That single fact is what makes this
  deletion reversible.

## Acceptance Behavior

```text
Given an extension with one declared and one undeclared subcommand
When the Navigator runs each and then lists them
Then the declared one runs, the undeclared one refuses, and the listing flags only the second

Given a migrated extension's handler attempting a write outside its table prefix
When the shim executes it
Then the write is rejected the way api.execute rejects it today

Given an installed extension whose subcommand declares no mirror-cli-v1 runtime
When the Navigator runs `ext <id> <sub>`
Then one stderr line names the extension, the subcommand, and the fix
And the exit code is 1, nothing was spawned, and there is no traceback

Given a bound context capability with no provider_runtime
When the Navigator runs `mirror load`
Then the load completes with every other section intact
And a `no_provider_runtime` diagnostic names the capability

Given google-workspace, session-export, and persona-export migrated
When the Navigator runs each of their seven subcommands through the TS front door
Then each answers as it did before, with `uv` and `python -m memory` never spawned

Given the repository after this story
When `scripts/check_retired_surfaces.py` runs
Then the compat-host row reports absent files and zero residue outside history
And `rg compat_host ts/src src` finds nothing
```

## Validation Route

- **Automated:** `cd ts && npm test` (extension suites with a scrubbed `PATH`);
  `uv run pytest tests/unit/memory/extensions`; `uv run python
  scripts/check_retired_surfaces.py`; the pre-push set the workflow already lists (57
  generators, 17 write-parity probes, 3 smokes, both suites, four checks).
- **Navigator-visible route (real home):**
  1. `ext google-ads campaigns` → expected: one refusal line naming the fix, exit 1.
     Fail: a traceback, a hang, or a `uv` spawn.
  2. `mirror load` with the `campaign_status` bindings still present → expected: normal
     load plus one `no_provider_runtime` diagnostic per bound provider. Fail: the load
     aborts or the diagnostic is silent.
  3. `ext google-workspace mail --help`, `ext session-export folder`, `ext persona-export
     owner` (and the other four) → expected: same output as before migration. Fail: any
     refusal, missing table, or changed output.
  4. `ext session-export` → expected: the listing from the manifest, every entry declared.
- **E2E decision: required.** Route 3 is the story's reason for existing under option 3
  and it runs against `~/.mirror-minds/vinicius-ts` with a fresh `backup` taken first.

## Implementation Contract

- TDD for every behavior change in B; characterization for the listing format.
- Two repositories, two commit streams: core changes here, extension migrations in
  `automation`; neither commit references the other's uncommitted state.
- Use `uv run` for Python commands and tests.
- No `git add .`; commit only story-scoped files; descriptive English messages that say
  why.
- Python stays compatibility-only; no new Python code except the shim **template**.

## Stop Conditions

- A daily-use handler turns out to need an API member the shim cannot serve from
  `sqlite3` alone (`navigator_decision_needed`).
- The install write-parity probe cannot grade without the register step
  (`plan_rule_conflict` — Python is compat-only for a ported leaf, but the harness rule
  must be read before it is bent).
- Any core change that would require touching `src/memory/cli/ext.py`
  (`scope_change_detected`).
- Failing pre-push check without a clear fix.

## Review

Above a small slice by the collaboration strategy's definition: it changes failure
semantics and deletes a dispatch host.

**Plan review — done 2026-09-21**, baseline panel (engineer, quality-assurance,
database-architect, devops-engineer, security-engineer). All five dissented. Findings
folded into this Plan:

| # | Lens | Finding | Where it landed |
|---|---|---|---|
| S-1 | security-engineer | Shim omitted `_enforce_prefix` — privilege escalation to the whole database | Scope D, Acceptance |
| D-1 | database-architect | Shim inherits neither `busy_timeout` nor `foreign_keys=ON` | Scope D |
| E-1 | engineer | Plateau 1 could not pass with the host present; would need a dead-code flag | Plateaus (1+3 merged) |
| Q-1 | quality-assurance | Per-capability migration claimed but never tested | Acceptance, test guide route 6 |
| Q-2 | quality-assurance | No rollback story; revert is split across two repos | New `## Rollback` |
| O-1 | devops-engineer | `python3` from ambient PATH replaces a `uv`-pinned interpreter | **decided 2026-09-21** — see below |

Handoff review after validation, same panel.

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
