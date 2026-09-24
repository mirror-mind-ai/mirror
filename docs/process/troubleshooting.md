[< Process](../index.md#process)

# Troubleshooting

Operational issues that have been diagnosed in the wild, with their root causes
and the fixes that addressed them. The goal is twofold: help future users (and
future us) recognize symptoms quickly, and preserve the reasoning behind each
fix so we don't re-debug the same class of problem.

Entries written before CV22.DS10.TS5 name the Python core's code as it was at
the time; the behavior each fix established is kept by the TypeScript core,
and every command below is written for it (`mirror` is the front door — see
[Running a command](../../REFERENCE.md#running-a-command)).

When you resolve a non-trivial bug, add an entry here. Keep entries scoped to
the smallest reproducible cause. Open problems that have a known workaround
but no fix yet are also welcome (mark them `Status: mitigated`).

---

## Contents

- [`runtime update` blocks on a migration from a newer version](#runtime-update-blocks-on-a-migration-from-a-newer-version)
- [`runtime update` blocks with `unable to open database file`](#runtime-update-blocks-with-unable-to-open-database-file)
- [Runtime update channel `stable` is not fetched or unavailable](#runtime-update-channel-stable-is-not-fetched-or-unavailable)
- [Changing `.mirror-update-channel` makes the git tree dirty](#changing-mirror-update-channel-makes-the-git-tree-dirty)
- [Welcome shows channel `main` when you expected `stable`](#welcome-shows-channel-main-when-you-expected-stable)
- [`runtime release-notes latest` says release notes were not found](#runtime-release-notes-latest-says-release-notes-were-not-found)
- [Portuguese accents appear as mojibake on Windows](#portuguese-accents-appear-as-mojibake-on-windows)
- [Pi Builder conversations appear without journeys](#pi-builder-conversations-appear-without-journeys)
- [Hooks skip when a runtime cannot find `node`](#hooks-skip-when-a-runtime-cannot-find-node)
- [Pi logger fails silently when `python3` resolves outside the project venv](#pi-logger-fails-silently-when-python3-resolves-outside-the-project-venv)
- [The front door misbehaves: telling it apart, restoring data](#the-front-door-misbehaves-telling-it-apart-restoring-data)
- [`extensions install` writes migrations to the wrong database outside production](#extensions-install-writes-migrations-to-the-wrong-database-outside-production)
- [`extensions install` copies through a symlinked extension path](#extensions-install-copies-through-a-symlinked-extension-path)
- [`extensions install` collapses the runtime skill catalog to one extension](#extensions-install-collapses-the-runtime-skill-catalog-to-one-extension)

---

## `runtime update` blocks on a migration from a newer version

**Date:** 2026-05-27
**Status:** fixed after CV9.E2.S3
**Affected component:** `runtime update`, `runtime status`, core migrations
**Severity:** update blocked, no data mutation

### Symptom

A production clone detects a newer stable release, but `runtime update` refuses
before fetching or fast-forwarding:

```text
[✗] status gate: runtime status is not ready
Core migrations: attention needed (... unknown 012_create_operation_run_events)
```

This can happen when the user's database has already been opened by a newer
runtime, such as a development or web surface, while the production clone still
runs older code.

### Root cause

The updater used the current checkout's full `runtime status` as a hard
pre-update gate. Old code cannot recognize migrations introduced by newer code,
so it blocked the update that would have restored coherence.

### Fix

`runtime status` remains strict, but `runtime update` now has a narrow
update-safe preflight lane. It may proceed past the initial status gate when the
only blocker is core migration drift and the surrounding safety boundaries are
clean: mirror home resolved, git clean, database exists, and extension health is
ready.

The normal update path still creates and verifies a backup before migrations,
fast-forwards only, applies migrations through `MemoryClient`, and requires
post-update status to be ready.

### Validation evidence

The personal production Mirror moved from `0.15.0` to `0.16.0` through the
corrected updater path with backup
`memory_20260527_183259.zip`, fast-forward `976b421 -> 5e805ae`, migrations
applied, and post-update status ready.

---

## `runtime update` blocks with `unable to open database file`

**Date:** 2026-05-25
**Status:** fixed in `v0.10.6`; older updaters may need one repair update
**Affected component:** `runtime status`, `runtime update`, local web/runtime surfaces
**Severity:** update blocked, no data mutation

### Symptom

`runtime update` refuses to continue because status is not ready, and status
shows the production database as unavailable:

```text
[✗] status gate: runtime status is not ready
Core migrations: attention needed (... unable to open database file)
Extension health: attention needed (... database unavailable)
```

A common trigger is a local Mirror process — an MCP server session, or a runtime
holding a connection — that has recently opened the production database.

### Current behavior

From `v0.10.6` onward, `runtime update` detects this class of status-gate
failure, attempts a safe `MemoryClient` bootstrap, rebuilds status, and continues
if the runtime becomes ready. The same recovery runs during post-update status.
Final users should not need to kill processes or run a one-off Python snippet for
this common case.

### Older updater recovery

If the production clone is still on an older updater and cannot reach `v0.10.6`
through the normal path, run the updater repair lane once. A clone that old
predates the TypeScript core, so run these subcommands through the entry point
its own documentation names:

```bash
mirror runtime update --repair-updater
mirror runtime update
```

If repair is unavailable or still blocked, inspect status and diagnosis:

```bash
mirror runtime status
mirror runtime diagnose
```

### Manual fallback

Manual process inspection should be a last resort, mostly for developers:

```bash
lsof /path/to/memory.db
lsof -i :8765
```

Do not ask final users to do this as the normal update path. If this remains
necessary after `v0.10.6`, treat it as a runtime lifecycle bug.

---

## Portuguese accents appear as mojibake on Windows

**Date:** 2026-06-16
**Status:** mitigated; explicit repair command added
**Affected component:** local SQLite user text, Windows console/runtime compatibility
**Severity:** display/prompt-context degradation; user data should not be mutated silently

### Symptom

Portuguese text appears with mojibake sequences such as:

```text
BioVault Ã© um projeto...
EstratÃ©gia Luvia...
transiÃ§Ã£o...
```

The same symptom can appear in journey lists, identity context, conversation
history, or access-log context snippets.

### Root cause

Older local Windows/runtime combinations could persist UTF-8 text after decoding
it through a legacy code page (Latin-1 or Windows-1252). This is distinct from a
terminal-printing issue: the current CLI entry point already reconfigures
`stdout`/`stderr` to UTF-8 when possible, but previously stored database content
may still contain mojibake.

### Diagnosis

Run the explicit repair command in dry-run mode:

```bash
mirror repair-encoding
```

For another Mirror home:

```bash
mirror repair-encoding --mirror-home C:/Users/you/.mirror/Name
```

The command scans known user-text columns (`identity`, `attachments`, `messages`,
`conversations`, `memories`, `tasks`, `memory_access_log`) and prints repairable
rows without changing the database.

### Repair

Apply only after reviewing the dry-run output:

```bash
mirror repair-encoding --apply
```

The apply path creates a database backup first and aborts if backup fails. Use
`--no-backup` only in disposable test databases.

### Policy

This is not an automatic migration. The repair mutates user-owned text, so it
must remain explicit, previewable, and backup-gated. It repairs only reversible
mojibake patterns (`Ã©` → `é`, `Ã‰` → `É`, etc.) and deliberately leaves normal
Portuguese such as `Âncora` unchanged.

---

## Pi Builder conversations appear without journeys

**Date:** 2026-05-25
**Status:** fixed for future sessions; historical data may need explicit repair
**Affected component:** Pi `/mm-build`, conversation logging, Workspace web surface
**Severity:** Workspace and journey history can look stale or incomplete

### Symptom

Workspace shows few or no conversations for recently active journeys. The
conversation rows exist and contain messages, but `conversations.journey` is
`NULL`.

Common examples:

```text
/mm-build mirror-mind
/mm-build maestro
/mm-build sandbox-pet-store
```

The session is logged, but the journey-specific Workspace tab does not show the
conversation because it filters by the `journey` column.

### Root cause

Pi invoked SKILL.md commands as separate processes (Python ones, at the time).
`/mm-build` called:

```bash
mirror build load <slug>
```

That process did not always receive `MIRROR_SESSION_ID`. Before the fix,
`switch_conversation()` returned without changing the active runtime session
when no explicit session id was available. The Pi extension still logged user
and assistant messages, but they remained attached to a conversation with
`journey = NULL`.

### Fix

The core conversation logger now falls back to the most recently updated active
runtime session when no explicit session id is available. Pi user-message
logging also refreshes the runtime session's `updated_at`, so the fallback
selects the active session more reliably.

This fixes future Pi Builder activations. It does not silently rewrite
historical conversations.

### Diagnosis

Run a dry-run repair scan:

```bash
mirror conversation-logger repair-journeys
```

This prints high-confidence journeyless conversations whose title or first user
message clearly activates a known journey.

Limit the scan while reviewing:

```bash
mirror conversation-logger repair-journeys --limit 250
```

### Repair

Apply only after reviewing the dry-run output:

```bash
mirror conversation-logger repair-journeys --apply
```

The apply path creates a database backup first and refuses to continue if backup
fails. The repair is conservative: it only updates `conversations.journey` for
high-confidence matches. Ambiguous rows remain unchanged and should be reviewed
manually.

### Prevention

Use a version containing the core fix before relying on Workspace as the source
of truth for recent Pi Builder activity. If Workspace still looks stale after
updating, run the dry-run repair command and inspect the candidates.

---

## Runtime update channel `stable` is not fetched or unavailable

**Date:** 2026-05-22
**Status:** mitigated
**Affected component:** `runtime update --check|--dry-run|update`
**Severity:** update blocked, no mutation

### Symptom

Runtime update planning or checking reports that the stable channel cannot be
resolved, for example:

```text
update channel stable is not fetched
```

or:

```text
Upstream: origin/stable @ unknown
Availability: unknown
```

### Root cause

The local clone is configured to follow the `stable` update channel, but the
local git checkout has not fetched `origin/stable`, or the remote stable branch
does not exist yet.

### Fix

Fetch the stable branch and retry the check:

```bash
git fetch origin stable
mirror runtime update --check
```

If the project has not created `origin/stable` yet, switch temporarily to the
integration/dogfooding channel only if you intentionally accept mainline updates:

```bash
printf 'main\n' > .mirror-update-channel
mirror runtime update --check
```

### Prevention

User-facing clones default to `stable`. Projects should create and maintain the
remote `stable` branch before recommending self-update to users.

---

## Changing `.mirror-update-channel` makes the git tree dirty

**Date:** 2026-05-22
**Status:** resolved in current versions
**Affected component:** `runtime update`
**Severity:** update blocked, no mutation

### Symptom

After writing `.mirror-update-channel`, runtime update refuses to proceed:

```text
[✗] status gate: runtime status is not ready
Recovery:
- Run: mirror runtime diagnose
```

Diagnosis reports a dirty git tree containing `.mirror-update-channel`.

### Root cause

Older Mirror Mind versions did not ignore `.mirror-update-channel`. Writing the
local marker made the repository dirty, and the updater correctly refused to run
with local uncommitted changes.

### Fix

If the installed updater is old, remove the marker, update first, then recreate
it:

```bash
rm -f .mirror-update-channel
mirror runtime update
printf 'stable\n' > .mirror-update-channel
mirror runtime version
```

Current versions ignore `.mirror-update-channel` in git, so changing it should
not dirty the repository.

---

## Welcome shows channel `main` when you expected `stable`

**Date:** 2026-05-22
**Status:** operational guidance
**Affected component:** `welcome`, `runtime version`
**Severity:** user confusion, no data risk

### Symptom

The welcome shows:

```text
Version 0.7.0 · channel main
```

but the clone should follow stable releases.

### Fix

Write the stable marker and verify it:

```bash
printf 'stable\n' > .mirror-update-channel
mirror runtime version
mirror runtime update --check
```

Expected output includes:

```text
Update channel: stable
```

### Note

The local git branch may still be `main`. The update channel controls the update
target (`origin/stable` or `origin/main`); it does not necessarily rename the
local branch.

---

## `runtime release-notes latest` says release notes were not found

**Date:** 2026-05-22
**Status:** expected before first prospective release note
**Affected component:** `runtime release-notes`
**Severity:** informational

### Symptom

```text
Mirror runtime release notes

Release notes: not found
```

### Root cause

Runtime release notes are prospective from CV9.E5 onward. Historical versions
through `v0.7.0` are recorded by Git tags and the worklog, but do not require
retroactive narrative release notes.

### Fix

No fix is required before the first prospective release note exists under:

```text
docs/releases/vMAJOR.MINOR.PATCH.md
```

After the first post-adoption release is published, `runtime release-notes
latest` should render that release note.

---


## The front door misbehaves: telling it apart, restoring data

Every command enters Mirror Mind through the front door
(`ts/src/frontDoor/cli.ts`). Until CV22.DS10.TS5 an unported or reverted
command fell back to a frozen Python engine, and this entry explained how to
tell the two engines apart and how to roll a skill back to Python. There is no
second engine any more, so there is nothing to roll back to: a misbehaving
command is a bug to report, and a bad write is undone from a backup.

### Symptoms — what the front door's own failures look like

- Error lines prefixed `Mirror TS front door:` (configuration, schema-state
  guard) or `Mirror TS front door could not find database:` — exit code 2.
- Schema-guard messages name migrations explicitly: `database schema is older
  than this TS core (pending migrations: …)` → run `mirror runtime migrate`;
  `… newer than this TS core (unknown migrations: …)` → update the checkout
  (`git pull`) so the code matches the database.
- A name the front door does not own answers with its own usage error (exit 1
  for an unknown command, exit 2 for an unknown subcommand), and a retired
  command answers in one line naming its
  [cutoff](../releases/pending-cutoffs.md), exit 1.
- Node-level stack traces or `node: command not found` — the runtime
  prerequisite (Node ≥ 24), not Mirror data.

### Recovery — restore the pre-write snapshot

Every front-door live write first takes a WAL-safe snapshot at
`<mirror home>/backups/frontdoor-pre-write-backup.db`. It holds the state
immediately before the **most recent** routed write (fixed name, overwritten
per write — an undo, not an archive). To restore, with **no session or
process holding the database open**:

```bash
cd <mirror home>
cp backups/frontdoor-pre-write-backup.db memory.db
rm -f memory.db-wal memory.db-shm   # stale sidecars must not replay over the restore
chmod 600 memory.db
```

The restore semantics (verify, copy back, clear sidecars) are implemented and
tested in `ts/src/frontDoor/liveBackup.ts` (`restoreFromBackup`); the manual
steps above are their operator form. For scheduled archives use `mm-backup` —
the pre-write snapshot only rewinds the last routed write.

### Verify — prove the state you restored

```bash
mirror journeys
mirror identity get ego behavior | head -2
```

If the schema guard refuses after a restore, the snapshot and the checkout are
from different eras — run `mirror runtime migrate`, or update the checkout,
before writing anything.

---


## Hooks skip when a runtime cannot find `node`

**Date:** 2026-09-24
**Status:** mitigated by design; diagnosable
**Affected component:** every hook wrapper under `.claude/hooks/`, `.gemini/hooks/`, and `plugins/mirror-mind/hooks/`
**Severity:** silent loss of logging, context injection, and the close tail, if nobody reads the log

### Symptom

A runtime launched from the desktop rather than a terminal works normally, but
its sessions are missing from `mirror conversations`, Mirror Mode context is
not injected, and conversations never get titles or memories.
`<mirror home>/hooks.log` holds lines like:

```text
2026-09-24T10:12:03Z claude:session-start: node not found on PATH; hook skipped. Set MIRROR_NODE.
```

### Root cause

Since CV22.DS10.TS5 every hook wrapper runs one Node entry
(`ts/src/hooks/main.ts`). `node` usually lives under nvm or Homebrew, and a
GUI-launched runtime often does not inherit the `PATH` that holds it. The
Python hooks never met this — `/usr/bin/python3` is on every macOS — which is
why their `|| true` was safe and the Node wrappers' silence would not have
been: the same class of failure as the [2026-05 Pi logger
incident](#pi-logger-fails-silently-when-python3-resolves-outside-the-project-venv),
waiting to happen again.

### Diagnosis

```bash
tail -20 ~/.mirror-minds/<user>/hooks.log
mirror runtime diagnose
```

`runtime diagnose` resolves Node the way the wrappers do and reports when it
cannot.

### Fix

Set `MIRROR_NODE` to the absolute path of `node` in the environment the runtime
is launched with:

```bash
which node   # in a terminal where it works
```

Without it, a wrapper tries `command -v node`, then `~/.nvm/current/bin/node`,
`/opt/homebrew/bin/node`, and `/usr/local/bin/node`. A wrapper that finds
none skips the hook, exits 0 so the user's turn is never broken, and writes
the line above instead of failing silently.

### Recovery of affected sessions

The turns a skipped hook never saw are not in the database, and Mirror has no
backfill for Claude Code or Gemini CLI transcripts: fix the Node resolution and
logging resumes from the next session. Pi and the Codex wrapper do not go
through these wrappers: both spawn `node` from the terminal they were started
in, which normally has it on its `PATH`.

---

## Pi logger fails silently when `python3` resolves outside the project venv

**Date:** 2026-05-10
**Status:** resolved; superseded by the TypeScript core (CV22). The class of
failure is not — see [Hooks skip when a runtime cannot find
`node`](#hooks-skip-when-a-runtime-cannot-find-node).
**Affected component:** `.pi/extensions/mirror-logger.ts`
**Severity:** silent data-pipeline loss (no conversations or messages persisted to the database during affected sessions)

### Symptom

The Pi runtime appeared to work normally — `mm-mirror`, `mm-journeys`, and
other skills ran fine — but the conversation history was never persisted: no
rows in `conversations` from the current session, no active
`runtime_sessions` row, and `mm-recall` and `mm-conversations` answered as
if the session never happened. The only signal was buried in
`~/.mirror-minds/mirror-logger.log`, which accumulated one `No module named
memory` warning per turn that the extension, by design, never surfaced.

### Root cause

The extension spawned the Python core with a bare `python3` resolved from the
user's `PATH`. On a machine with pyenv (or any user-level Python manager)
ahead of the project virtualenv, that interpreter did not have the `memory`
package, and every turn failed silently. The extension swallowed failures on
purpose so a persistence problem could never block a Pi session — correct for
usability, and exactly why the bug lived for a month.

### Fix and recovery

The extension was changed to run the interpreter through `uv`, which found
the project virtualenv regardless of `PATH` order. The Pi session files on
disk still held every turn, and the `conversation-logger session-start`
backfill ingested the 15 orphaned sessions with no data loss.

Since CV22 the extension spawns `node` and the front door, and since
CV22.DS10.TS5 there is no interpreter to resolve. The lesson outlived the code:
**a runtime's `PATH` is not your shell's `PATH`, and a hook that fails
silently needs somewhere to say so.** The Node-era rewrite of every hook was
built around it.

---

## `extensions install` writes migrations to the wrong database outside production

**Date:** 2026-07-16
**Status:** fixed
**Affected component:** `extensions install`, `extensions uninstall`
**Severity:** extension unusable outside production; stray database file

### Symptom

In a non-production environment (`MEMORY_ENV=development` or `test`), installing
a command-skill extension appears to succeed, but the extension's tables are
missing at runtime. Extension subcommands (`mirror ext <id> ...`)
fail with `no such table: ext_<id>_*`, and a stray `<mirror home>/memory.db`
appears next to the real `memory_dev.db`.

### Root cause

The install path (`_post_install_command_skill`) and the uninstall binding
sweep hardcoded `<mirror home>/memory.db` for their migration, register, and
binding-cleanup steps, ignoring `MEMORY_ENV`. Extension *dispatch* (`ext.py`)
already resolved the env-aware database (`db_path_for_home`, CV9.E2.S6), so
install wrote schema into one file while the runtime read another. The two
straddled different databases for every environment except production.

### Fix

`extensions install` and `extensions uninstall` now resolve the database with
`db_path_for_home(mirror_home)` — the same one-(mirror home, environment)→one
database rule the dispatch path uses. Migrations, register validation, and the
binding sweep all land in the database the runtime actually reads.

A companion test-harness fix pins `MEMORY_ENV` to the production default in
`tests/conftest.py`, so a developer's `.env` (which may set
`MEMORY_ENV=development`) can no longer make env-aware tests pass locally while
diverging from CI.

### Validation evidence

New regression tests in
`tests/unit/memory/extensions/test_install_env_database.py` assert that
installing under `MEMORY_ENV=development` creates `memory_dev.db` (not
`memory.db`) with the extension's tables, and that uninstall sweeps bindings
from the same env database. Full suite green, ruff clean. The personal dev
Mirror (`vinicius-dev`) then had `admin`, `meta-ads`, `session-export`, and
`video-processing` migrated into `memory_dev.db`, reaching parity with the
production Mirror's installed-extension set.

---

## `extensions install` copies through a symlinked extension path

**Date:** 2026-07-16
**Status:** fixed
**Affected component:** `extensions install`
**Severity:** external directory mutated, or install aborts with a same-file error

### Symptom

Re-installing an extension whose installed path under
`<mirror home>/extensions/<id>` is a symlink either aborts with a `shutil`
"are the same file" error, or silently writes the source tree *through* the
symlink into an unrelated directory. The production layout links installed
extensions straight at their source repos, so an install could overwrite a real
source repo or hit the self-copy error.

### Root cause

`install_extension` called `shutil.copytree(source, target, dirs_exist_ok=True)`
unconditionally. When `target` resolves to the same tree as `source` (a symlink
back at the source, or `--extensions-root` pointing at the installed dir),
copytree copies files onto themselves and raises. When `target` is a symlink to
a *different* directory, `dirs_exist_ok=True` makes copytree write into the
link's target.

### Fix

A pre-copy guard (`_should_copy_source_tree`) resolves both paths. It skips the
copy when source and target are the same tree (the install proceeds to
migrations, register, and runtime sync through the link, leaving the symlink
intact), and refuses with a clear `ExtensionValidationError` when the target is
a symlink pointing outside the source — pointing the user at
`ext <id> migrate` to re-run migrations without copying.

### Validation evidence

Regression tests in `tests/unit/memory/extensions/test_install_e2e.py` cover all
three shapes: symlink-to-source (copy skipped, symlink preserved, install
completes), source == installed dir (idempotent, no same-file error), and
symlink-to-external (refused, external directory untouched). Full suite green,
ruff clean.

---

## `extensions install` collapses the runtime skill catalog to one extension

**Date:** 2026-07-17
**Status:** fixed
**Affected component:** `extensions install`, Pi `resources_discover`, `expose-claude`
**Severity:** silent loss of extension visibility (installed extensions become unreachable by the runtime)

### Symptom

After installing several extensions one at a time, only the **last-installed**
extension is available to the runtime. On Pi, `resources_discover` loads a single
external skill; on Claude, `expose-claude` copies only one `ext:*` skill into
`.claude/skills/`. The other extensions' `SKILL.md` directories still exist under
`<mirror home>/runtime/skills/<runtime>/`, and `extensions list` (which scans the
extensions source dir) still shows every extension — but the runtime catalog
lists only one:

```bash
mirror inspect runtime-catalog pi --mirror-home <home>
# extensions: admin -> ext-admin        (only one, though 7 ext-* dirs exist)
```

### Root cause

`install_extension` refreshed the runtime catalog by calling
`sync_extensions_for_runtime([installed_manifest], ...)` — a single manifest.
`sync_extensions_for_runtime` ends by overwriting `extensions.json` with exactly
the manifests it is given, so each single install truncated the catalog to that
one extension. The copy step never removes sibling skill directories, so the
`SKILL.md` files remained on disk while the catalog — the sole discovery source
for Pi (`resources_discover`, no directory-scan fallback) and Claude
(`expose-claude`) — dropped them. `uninstall_extension` already merged correctly
via `_prune_catalog_for_extension`; only the install path clobbered.

### Fix

`install_extension` now rebuilds each affected runtime catalog from the **full**
set of installed extensions (`discover_extensions` over the mirror-home
extensions dir) instead of the single installed manifest. This fixes the
eviction and self-heals a catalog a previous single-install run had already
truncated. The CLI install report still lists only the just-installed extension,
and `--runtime <name>` still rebuilds only that runtime's catalog.

### Recovery

A full sync per runtime rebuilds the complete catalog without a code change (it
also runs automatically on the next install once the fix is present):

```bash
mirror extensions sync --runtime pi \
  --mirror-home <home> --target-root <home>/runtime/skills/pi
mirror extensions sync --runtime claude \
  --mirror-home <home> --target-root <home>/runtime/skills/claude
```

### Validation evidence

Red-first `test_second_install_preserves_prior_extensions_in_runtime_catalog` in
`tests/unit/memory/extensions/test_install_e2e.py` installs two extensions and
asserts both survive in the pi and claude catalogs (red → green). Full
unit+integration suite 1863 passed keyless; ruff and format clean; mypy
net-zero. The personal `vinicius-dev` Mirror was repaired live: pi restored to 7
extensions, claude to 6.

---

<!-- New entries go above this line. Keep the most recent first. -->
