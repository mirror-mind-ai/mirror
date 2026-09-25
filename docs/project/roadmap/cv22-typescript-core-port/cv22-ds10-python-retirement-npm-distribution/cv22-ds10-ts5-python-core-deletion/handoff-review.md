[< Story](index.md)

# Handoff Review — CV22.DS10.TS5

**Held:** 2026-09-25, after Navigator validation and before the Debt Review, as
the [collaboration strategy](../../collaboration-strategy.md#the-persona-panel-is-the-standing-second-opinion)
orders the two checkpoints.
**Panel (D9):** engineer, quality-assurance, database-architect,
devops-engineer, security-engineer. `engineer` was not convened at the Plan
review, so this is its first look at the story.
**Scope:** `cv22-ts5-baseline` (`2adf2951`) to `118d4a67`, the last code change —
49 commits; findings F1–F21; decisions D1–D15; the known risks; both walks.
**Method:** read the code and the records, then test each claim that carries
weight by running it. Every probe ran under `tmp/ts5-review/` against scratch
databases: one created by **Python v0.7.0**'s own bootstrap at its tag (schema
only, no data), a fresh TypeScript home, and the walk's copy for one row count.
Nothing wrote to the production home.

## Verdict

**One blocker, five small pay-now items, four deferrable debts, two questions,
and a list the Debt Review owes.**

The deletion itself holds. Nothing calls an interpreter: at `118d4a67`'s code,
the four runtime smokes (`smoke_codex`, `smoke_gemini_cli`,
`smoke_claude_plugin`, `smoke_mirror_mcp`) pass under the interpreter shadow
with 0 spawns. The fallback and its gates were deleted, not disabled. The
records are candid about what went wrong. The blocker is not in what TS5
deleted but in what it made permanent: the TypeScript custodian carries
Python's migration ledger but not the rest of Python's open-time contract, and
TS5 removed the only route by which the rest still ran.

| # | Lens | Finding | Class | Recommendation |
|---|---|---|---|---|
| B1 | database-architect | Migrate-on-open never runs the bootstrap DDL on an existing database; four objects only that DDL ever created | **blocker** | `createSchema` after `runMigrations` on the slow path, plus a migrated-equals-fresh test |
| P1 | security-engineer | `hooks.log` records Gemini prompts and responses; the redaction test cannot fail | pay now | log the subcommand, not argv; test through a failing hook |
| P2 | security-engineer | `Bash(node ts/src/hooks/main.ts *)` grants the model something no hook needs | pay now | remove the entry |
| P3 | quality-assurance | Plan-review blocker 2's real-database half never ran, and the records say it did | pay now | B1's test discharges it; correct the records |
| P4 | quality-assurance | TS5 hands US3 about ten items; US3's package is still the generated placeholder | pay now | a *What US3 inherits* section in US3's package |
| P5 | engineer | The custody seam's comments and remedies contradict its code | pay now | three edits |
| N1 | devops-engineer | A hook that finds a Node it cannot run fails silently | non-blocking debt | log any non-zero exit |
| N2 | devops-engineer | The smokes that exercise the hooks are not in CI; one of them caught F11 | non-blocking debt | add them to the `smoke` job |
| N3 | engineer, devops-engineer | `codex-mirror.sh` sits outside D4's contract and breaks on a path with a space | non-blocking debt | an argv array and the wrappers' Node resolution |
| N4 | database-architect | F21's accepted residue is invisible | non-blocking debt | sweep or report `backups/*.staging` |
| Q1 | database-architect | The recorded mechanism of `UNIQUE constraint failed: messages.id` cannot produce it; 32-bit ids can | question | correct the record; capture a CR |
| Q2 | devops-engineer | Promotion by rename on Windows | question for US3 | US3 decides |

## Blocker

### B1 — the sole custodian inherited the ledger, not the contract (database-architect)

Python's `get_connection` did two things on **every** open, under the
bootstrap lock: `run_migrations(conn)`, then `conn.executescript(SCHEMA)` — in
v0.7.0, in v0.8.0, and at the recovery tag. The second half is what created
every object that has a place in `SCHEMA` and no migration:

| Object | In `SCHEMA` since | Migration |
|---|---|---|
| `_ext_migrations`, `_ext_bindings`, `idx_ext_bindings_target` | v0.8.0 (2026-05-23) — `265f4622`: *"created via the standard bootstrap so every memory.db already carries them"* | none |
| `journey_mutation_receipts` | v0.31.12 (2026-08-29) | none |

TypeScript composes both halves in `bootstrapDatabase`, but only for a
**missing** file. Migrate-on-open (`ensureMigratedOnOpen`, DS6.US3) runs
`runMigrations` alone.

Before TS5, an old database could not reach TypeScript without passing through
Python first. Migrate-on-open deferred any Python-authored migration, and the
schema error told the user to run a Python command once. That Python open ran
both halves. Plateau 1 paid D-025 by applying those migrations in TypeScript
(`c8c74361`), which took over half of the job. The hooks and the fallback,
which also opened homes through Python, left at plateaus 1 and 2.

**Probe.** Python v0.7.0 at its tag created a database with its own bootstrap
(ledger `001`–`010`, no data). The current front door, pointed at a copy:

```text
runtime migrate            applied 7 migration(s): 011 … 017     exit 0
runtime status             Core migrations: current (17/17)
PRAGMA integrity_check     ok
inventory vs a fresh home  missing: _ext_bindings, _ext_migrations,
                           idx_ext_bindings_target, journey_mutation_receipts
mirror load --persona engineer --query …
                           Error: no such table: _ext_bindings    exit 1, uncaught
same command, fresh home   exit 0
```

The columns of every table the two share are identical. The gap is exactly
those four objects.

**Exposure.** A home last opened by v0.7.0 or earlier breaks in Mirror Mode and
on extension install the first time it is used after taking CV22 — while
`runtime status` calls it current. A home last opened by v0.31.11 or earlier
lacks `journey_mutation_receipts`; nothing in TypeScript reads that table, so
that half is silent. **No user is exposed yet**: CV22 releases once.

**Why the evidence did not see it.** The custody proof's fixtures were recorded
from migrations alone, and the proof grades each step against that step's
expected snapshot. Nothing asserts that a migrated chain ends where a fresh
bootstrap does. The one check that would have caught it — the Plan review's
"one real pre-`015` database, migrated forward, schema diffed against current"
— never ran (P3).

**Recommended fix (a).** In `ensureMigratedOnOpen`'s slow path, call
`createSchema(db)` after `runMigrations(db)`. That is the order
`bootstrapDatabase` already uses and the order Python used on every open, so
this restores behavior rather than adding it. The steady state stays one
`_migrations` read. Every Python-era database arrives with `017` pending, so
each one takes the slow path once, under the lock and after the backup.
Probe: running TypeScript's `SCHEMA` twice on the migrated v0.7.0 copy created
exactly the four objects. Integrity was ok, the inventory matched a fresh home,
and `mirror load` exited 0.

Test: commit the v0.7.0 schema as a DDL-only fixture, and assert that
migrate-on-open brings it to the fresh inventory. That is the
**migrated-equals-fresh** invariant the custody proof lacks. If a later fixture
takes Python's old `015` → `016` path, its nullable `display_code` is DS6.TS5's
known divergence: name it in the test, don't mask it.

Alternative (b): a migration `018` that creates the four objects. The ledger
records it, and it also heals a database already at `17/17` without them. Only
TS5-era dev copies can be in that state. The cost is that every `17/17` in the
goldens changes.

**Why a blocker.** It contradicts the story's Outcome ("existing `memory.db`
files keep working, migrated by the TypeScript engine as sole custodian") and
the CV22 done condition. The fix is one line, a fixture, and a test. And
deferring a schema-custody hole into the story that ships is how this journey
lost F21 once already.

## Pay now

### P1 — `hooks.log` records prompts and responses (security-engineer)

`runFrontDoorQuietly` records a failure as `` `${argv.join(" ")}` exited N ``.
The Gemini hooks pass the user's prompt (`log-user`) and the model's response
(`log-assistant`) as argv. Probe, with a database the core refuses:

```text
gemini:log-user: `conversation-logger log-user s-123 MY-PRIVATE-PROMPT about my divorce --interface gemini_cli` exited 2
gemini:log-assistant: `conversation-logger log-assistant s-123 MY-PRIVATE-ANSWER line one --interface gemini_cli` exited 2
```

The Plan's amendment read: "Invariant, tested: nothing a hook entry logs — on
success or on failure — contains prompt or response text." The test calls
`noteHookFailure` with a reason that never held a prompt, then asserts the line
does not match `/prompt/i`. It passes because the leak it guards against never
happened in the test.
The front-door log stayed clean; only `hooks.log` leaks, and it is the file the
new troubleshooting entry tells users to `tail`. The Claude and Codex paths put
no content in argv (checked).

Fix: record only the subcommand (`argv.slice(0, 2)`), as the Pi extension
already does for its own errors. Test it through `geminiLogUser` and
`geminiLogAssistant` against a refusing database, and assert that the payload's
bytes are absent. Gemini is retired, but these hooks still ship.

*Inherited, outside TS5:* the Pi extension logs the first 80 characters of
every prompt to `mirror-logger.log` at INFO
(`.pi/extensions/mirror-logger.ts:403`, since the initial import). Not this
story's; worth a CR.

### P2 — an allowlist entry no hook needs (security-engineer)

Claude Code runs hooks itself; `permissions.allow` governs only the model's
Bash tool. So `Bash(node ts/src/hooks/main.ts *)` authorizes nothing a hook
needs. What it does is let the model run hook entries without asking:
`claude:session-end` closes the session and runs extraction on the live
provider, and `claude:inject` writes injection state. Remove it and flip the
assertion in `hooks.test.ts`.

A related question, not a fix. The other entry,
`Bash(node ts/src/frontDoor/cli.ts *)`, cannot prefix-match what the skills
actually run: `NODE_OPTIONS=--no-warnings node --env-file=.env
ts/src/frontDoor/cli.ts …`. That fits the walk's instruction to "approve the
front-door command if asked". The Python-era entry did not match
`uv run python -m memory` either. Decide whether the grant should match the
real form or go. Either way, the test should check a real invocation rather
than the presence of a string.

### P3 — evidence the records say was produced, and was not (quality-assurance)

- The Plan's Review lists blocker 2 under "Blockers (applied)" as "the
  committed pre-state fixtures **plus one real pre-`015` database**". The
  fixtures were used; the real database never was. Three records disagree:
  - The test guide's migration-custody section still says **Still owed**.
  - Walk step 9's row says "genuinely pre-`015` copy … migrations
    `015`–`017` applied".
  - The runbook actually used a Python database at `016` and applied `017`.

  B1's test discharges the owed check on a v0.7.0 database, which is older
  than pre-`015`. It is the check that found B1.
- `test-guide.md` still opens its evidence section with "Pending
  implementation." and ends it with "### Navigator route — Pending.", after
  both walks were accepted.

This is US2's lesson again: *a reviewed, approved document is not evidence.*

### P4 — US3 inherits about ten things and its package names none of them (quality-assurance)

US3's package is still the generated placeholder ("I want to npm
distribution"). TS5 hands it:

- D14's bridge paragraph in `REFERENCE.md` and getting started;
- the `PROGRAM` constant (`ts/src/util/program.ts`), and the package-identity
  constant and `private` flag (D1);
- D11's Frame and installer root detection, with D4's nine call sites;
- the installed-plugin hook window, and `launch.sh`'s `$BASH_SOURCE`
  resolution;
- F20's closing check: the guard refuses the production clone once that clone
  takes the release;
- CR093's extension-repository half;
- D-026 and D-027 from US2;
- `scripts/ts5/`. Its generator is permanent product tooling filed under a
  story's name. Its capture script is the before/after instrument US3 needs to
  prove "no user-visible change".

These are scattered across TS5's index, plan, inventory, and `decisions.md`.
That is exactly how the session-start race was lost: its revisit trigger fired
in a document nobody was reading. Write a *What US3 inherits* section into
US3's package, as US2's `handoff.md` did for TS5.

### P5 — the custody seam's comments contradict its code (engineer)

- `ensureMigratedOnOpen`'s docstring still says it applies "pending
  TS-authored forward migrations … unless a TS-authored migration is genuinely
  pending with no Python migration behind it". Its module header says the
  opposite.
- `KNOWN_MIGRATION_IDS` is still documented as "Python prefix + TS-authored".
- One condition gets two remedies. For a database newer than the core,
  migrate-on-open says "update this Mirror installation" and
  `assertSchemaState` says "Update this Mirror checkout (git pull)". US3 makes
  the second one wrong.

## Non-blocking debt

### N1 — a Node that is found but cannot run the hook fails silently (devops-engineer)

The wrappers guarantee that an **unresolvable** Node is recorded. They `exec`
the first one they resolve without checking whether it can run `main.ts`. A
`.ts` entry and `--env-file-if-exists` both need a recent Node, and the
repository requires 24. A stale `/usr/local/bin/node` earlier on a GUI
runtime's PATH fails before `main.ts` starts.

Probe, with a stand-in that fails the way an old Node does: hook exit 9,
stderr only, **nothing in `hooks.log`**. Claude Code shows such an exit only in
verbose mode. That is "Mirror stopped remembering", the failure D4's amendment
was written to prevent. Since `main.ts` exits 0 by design, any non-zero exit
means Node itself failed. So drop `exec` and log that exit.

Two related problems. The candidate list lives in two places, the wrapper
template and `hookNodeFindings`, and the copies already disagree
(`/usr/bin/node`). And the diagnose check runs in the caller's shell, not in
the runtime's environment.
**Trigger:** US3, which changes how the wrappers find Mirror anyway. Or now,
since it is small.

### N2 — the smokes that exercise the hooks are not in CI (devops-engineer)

`smoke_gemini_cli.sh` caught F11, a product regression the row-diff passed,
and it runs only when someone remembers to run it. All four runtime smokes are
hermetic, and since plateau 3 they need no interpreter: they passed here under
the shadow with 0 spawns. None of them was in CI before TS5 either. TS5 is
what made them cheap to add. **Trigger:** now, or US3 at the latest.

### N3 — the Codex wrapper is outside D4's contract (engineer, devops-engineer)

`scripts/codex-mirror.sh` has three problems:

- it resolves `node` from PATH alone;
- it ends every call in `>/dev/null 2>&1 || true`;
- it builds `$MIRROR` as a string and expands it unquoted, so a checkout path
  with a space splits into two arguments and every call fails silently.

It is launched from a terminal, so it is less exposed than the GUI-launched
wrappers. **Trigger:** US3, which replaces the invocation.

### N4 — F21's accepted residue cannot be seen (database-architect)

A process killed between its snapshot and its rename leaves a
`backups/*.staging` file the size of the database. Nothing sweeps these files,
and `runtime diagnose` does not report them. **Trigger:** the first one found
on a real home, or the next story that touches the write gate.

## Questions

### Q1 — the `messages.id` failure has a different mechanism than recorded (database-architect)

The inventory records production's `claude:session-start: UNIQUE constraint
failed: messages.id` as "two transcript backfills overlapping". That mechanism
cannot produce this error. On that path, every inserted message draws a fresh
random id, and the session binding is checked inside a transaction.
Overlapping writers therefore duplicate rows or do nothing; they cannot collide
on the key.

What can collide is the id itself. `newId()` is Python's `uuid4().hex[:8]`,
which is 32 bits. The walk's copy holds 33,341 messages, so:

- a single new message collides about once in 129,000;
- a session-start import of several hundred messages collides about once in
  200–500;
- the expected number of collisions over the table's life is already about
  0.13.

The failure is loud, and the next session start retries with fresh ids, so
nothing was lost. But the odds grow with the square of the table, and the only
reason for this id width was parity with the oracle, the same shape as CR095.
Not TS5's debt: correct the record, and capture a CR to widen new ids. They
are `TEXT`, so old rows keep working.

### Q2 — promotion by rename on Windows (devops-engineer, for US3)

`openLiveWriteDatabase` promotes the staging file with `renameSync` onto the
fixed backup. On Windows that rename fails while any process holds the target
open, such as a scanner or a backup tool, and the error handler then aborts
the write. No CI job runs the core on Windows. US3 brings the Frame and the
installer, so it should decide whether a failed promotion aborts the write or
keeps the verified staging file.

## Decisions D13–D15

The Driver took these at plateau 4 and left them open to reversal here.
**No lens reverses them.**

- **D13** (the scaffold's `uv` line removed, not replaced) follows CR019's own
  logic.
- **D15** (`api.md` deleted) removes documentation of an API nobody offers;
  the recovery tag keeps the page readable.
- **D14** (the docs name `mirror`, with one bridge) stands on one condition:
  deleting the bridge is on US3's list (P4).

## Accepted boundaries, reaffirmed

No new information changes F20, the installed-plugin window, or the `frame/`
and `installer/` residue. The panel adds one thing: each needs its closing
check on US3's list (P4).

## What the Debt Review owes

This story fired revisit triggers elsewhere in CV22 that name DS10, TS5, or the
Python retirement. Some ledger rows also have a status line that no longer
matches their text:

| Item | Trigger or state | Why it is owed now |
|---|---|---|
| D-018 | the Extension API version | its subject, Python's `memory.extensions.api.VERSION`, is deleted, and TypeScript carries no such constant |
| D-005, D-017, D-019 | the status line reads "Carried" | their text records Dropped (TS3), Paid (TS3), and Paid (2026-09-21) |
| CR088 | "at DS10, which either deletes the Python path or must decide to fix it first" | the Python path is deleted |
| CR092 | the extension shim template | D7 deleted its subject |
| CR093 | documented Python invocations | this repository's half is done; the extension repositories' half is US3's |
| CR063 | "before DS10 deletes the Python side so both cores can still be compared" | that window closed at plateau 3 |
| CR069, CR070 | "at DS10 … the choice collapses to one core" | it has |
| DS7.TS4 binding idempotence | "when DS10 leaves TypeScript as the only writer of `_ext_bindings`" | TypeScript is now the only writer |
| DS6.TS5 `display_code` nullability | "DS7/DS10 schema consolidation" | TS5 left one custodian; B1's test is where to name it |
| DS7.US3 `--threshold` rendering | "DS8/DS10 hardening work touches this renderer" | D12 edited its strings; likely no action |

## Navigator Decisions

Taken 2026-09-25, the day the review was held:

1. **B1:** fixed as recommended, option (a). The bootstrap schema runs after
   the migrations on migrate-on-open's slow path.
2. **P1–P5:** paid.
3. **N1–N4:** paid, not deferred.
4. **Q1:** captured as a Change Request.
5. The review is committed.

Q2 goes onto US3's list (P4), as the review recommended. Each finding's
disposition is recorded below as it lands.

## Dispositions

All twelve were settled on 2026-09-25, the day the review was held, one commit
each, with the test written red first wherever behavior changed.

| # | Commit | What landed |
|---|---|---|
| B1 | `e400d395` | Migrate-on-open runs `createSchema` after `runMigrations` on its slow path. The v0.7.0 schema is committed as a fixture, and a migrated-equals-fresh test compares the whole canonical inventory. It was red on the four objects and their autoindexes. End to end, a v0.7.0 home migrates to `current (17/17)` and `mirror load` exits 0 |
| P1 | `b60a72f8`, `6f7d6c73` | A failure line names the family and subcommand, never the arguments. The new test drives both Gemini hooks through a real failure, and it was red on the leaked text. Its follow-up pins `MEMORY_ENV`: CI names `memory_test.db`, which the core would not refuse |
| P2 | `c20cb404` | Both node grants removed. The hook-entry grant was the finding. The front-door grant matched no invocation the skills make, and the review left that choice open, so the Driver removed it: users see no change, and auto-approval stays a one-line decision, written in the real form. Open to reversal. The test now checks grants against the skills' real invocations |
| P3 | `2d2ff669` | Correction notes in the Plan's Review, the test guide's custody section and walk step 9, and the evidence section's two leftover "Pending" lines |
| P4 | `4792cfd6` | Twelve items in `cv22-ds10-us3-npm-distribution/inherited.md`, a file the runtime does not generate, with a pointer in US3's index. Q2 is item 11 |
| P5 | `e400d395`, `1b077744` | The docstring was rewritten with B1. `KNOWN_MIGRATION_IDS` and the schema module now say what is true, and the newer-database remedy is "update this Mirror installation" in the core, the test, and the troubleshooting guide |
| N1 | `3dde40eb` | The wrappers no longer `exec`. A non-zero exit from Node is one `hooks.log` line naming the binary and its version. Diagnose reports `hook_failures_recorded` from the log, and its candidate list is pinned to the wrappers' by a test |
| N2 | `885c3548` | The four runtime smokes run in CI's `smoke` job, under the interpreter shadow. The step's exact script passed in a runner-like sandbox: no `.env`, a scratch `HOME`, only `node` on PATH |
| N3 | `b98e4b75` | `codex-mirror.sh` calls two generated wrappers, `scripts/codex-hooks/`, and the logic moved to `ts/src/hooks/codex.ts`. main.ts's two Codex entries had no caller and now have one. The new test runs the real script from a checkout path with a space; the same run against the old script logged nothing |
| N4 | `f384017c` | Each write sweeps a staging file whose process no longer runs and which is ten minutes old. The test leaves recent, live, and unrelated files alone |
| Q1 | `9a8b1dff` | Captured as CR097, and the inventory's record of the mechanism corrected. CR098 captured beside it, from P1's inherited note on the Pi extension |
| Q2 | `4792cfd6` | On US3's list, item 11 |

**Found while paying, and paid in the same commits.**

- **N1:** when the environment lacked `MIRROR_HOME`, the "loud" line went
  to `~/.mirror-minds/default`, a home the core never resolves. That is every
  GUI launch of a checkout configured by `.env`. The wrappers now resolve the
  home as the core does.
- **N2:** `smoke_mirror_mcp.sh` and `smoke_claude_plugin.sh` passed when they
  aborted. On bash 3.2, macOS's `/bin/bash`, an empty array is unbound under
  `set -u`, and each script's EXIT trap turned the abort into exit 0. So on a
  machine with no production home, the production-leak check never ran.
  Separately, the development guide said these smokes need a runtime
  installed. They do not.
- **P1:** the new test passed locally and would have failed in CI, because it
  ran without CI's `MEMORY_ENV=test`. Running the suite as CI runs it, before
  pushing, caught it.

**Evidence at `6f7d6c73`.** The suite passes 2660/2660 with `MEMORY_ENV=test`,
and again under the interpreter shadow with 0 spawn attempts. `tsc`, Biome,
the retired-surface guard, doc links, skill parity, the plugin build, and the
hook-wrapper generator check are clean. Both custody proofs pass. The
migrate-on-open, conversation, builder, and extension-catalog smokes pass, the
updater smoke passes 34/34, and all four runtime smokes pass. Nothing is
pushed yet, so CI has not run these commits.
