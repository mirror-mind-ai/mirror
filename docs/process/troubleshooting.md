[< Process](../index.md#process)

# Troubleshooting

Operational issues that have been diagnosed in the wild, with their root causes
and the fixes that addressed them. The goal is twofold: help future users (and
future us) recognize symptoms quickly, and preserve the reasoning behind each
fix so we don't re-debug the same class of problem.

When you resolve a non-trivial bug, add an entry here. Keep entries scoped to
the smallest reproducible cause. Open problems that have a known workaround
but no fix yet are also welcome (mark them `Status: mitigated`).

---

## Contents

- [Runtime update channel `stable` is not fetched or unavailable](#runtime-update-channel-stable-is-not-fetched-or-unavailable)
- [Changing `.mirror-update-channel` makes the git tree dirty](#changing-mirror-update-channel-makes-the-git-tree-dirty)
- [Welcome shows channel `main` when you expected `stable`](#welcome-shows-channel-main-when-you-expected-stable)
- [`runtime release-notes latest` says release notes were not found](#runtime-release-notes-latest-says-release-notes-were-not-found)
- [Pi Builder conversations appear without journeys](#pi-builder-conversations-appear-without-journeys)
- [Pi logger fails silently when `python3` resolves outside the project venv](#pi-logger-fails-silently-when-python3-resolves-outside-the-project-venv)

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

Pi invokes SKILL.md commands as separate Python processes. `/mm-build` calls:

```bash
uv run python -m memory build load <slug>
```

That process does not always receive `MIRROR_SESSION_ID`. Before the fix,
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
uv run python -m memory conversation-logger repair-journeys
```

This prints high-confidence journeyless conversations whose title or first user
message clearly activates a known journey.

Limit the scan while reviewing:

```bash
uv run python -m memory conversation-logger repair-journeys --limit 250
```

### Repair

Apply only after reviewing the dry-run output:

```bash
uv run python -m memory conversation-logger repair-journeys --apply
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
**Affected component:** `python -m memory runtime update --check|--dry-run|update`
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
uv run python -m memory runtime update --check
```

If the project has not created `origin/stable` yet, switch temporarily to the
integration/dogfooding channel only if you intentionally accept mainline updates:

```bash
printf 'main\n' > .mirror-update-channel
uv run python -m memory runtime update --check
```

### Prevention

User-facing clones default to `stable`. Projects should create and maintain the
remote `stable` branch before recommending self-update to users.

---

## Changing `.mirror-update-channel` makes the git tree dirty

**Date:** 2026-05-22
**Status:** resolved in current versions
**Affected component:** `python -m memory runtime update`
**Severity:** update blocked, no mutation

### Symptom

After writing `.mirror-update-channel`, runtime update refuses to proceed:

```text
[✗] status gate: runtime status is not ready
Recovery:
- Run: python -m memory runtime diagnose
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
uv run python -m memory runtime update
printf 'stable\n' > .mirror-update-channel
uv run python -m memory runtime version
```

Current versions ignore `.mirror-update-channel` in git, so changing it should
not dirty the repository.

---

## Welcome shows channel `main` when you expected `stable`

**Date:** 2026-05-22
**Status:** operational guidance
**Affected component:** `python -m memory welcome`, `python -m memory runtime version`
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
uv run python -m memory runtime version
uv run python -m memory runtime update --check
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
**Affected component:** `python -m memory runtime release-notes`
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

## Pi logger fails silently when `python3` resolves outside the project venv

**Date:** 2026-05-10
**Status:** resolved
**Affected component:** `.pi/extensions/mirror-logger.ts`
**Severity:** silent data-pipeline loss (no conversations or messages persisted to the database during affected sessions)

### Symptom

The Pi runtime appears to work normally. `mm-mirror`, `mm-journeys`, and other
skills run fine. But the conversation history is never persisted:

- `uv run python -m memory conversations --limit 10` shows no rows from the current Pi session
- `runtime_sessions` table is empty (no row with `active = 1` for the current session)
- `mm-recall`, `mm-conversations`, and any feature that depends on the message history return as if the session never happened

The only visible signal that something is wrong is buried in
`~/.mirror-minds/mirror-logger.log`, which accumulates lines like:

```
2026-05-10T23:22:26.518Z [WARN] stderr from [-m memory conversation-logger]:
/Users/alissonvale/.pyenv/versions/3.10.6/bin/python3: No module named memory
```

These appear on **every turn** but never surface to the user because the
extension is designed to swallow failures to avoid blocking Pi.

### Diagnosis

Three checks confirm the issue:

1. Tail the extension log:
   ```bash
   tail -50 ~/.mirror-minds/mirror-logger.log
   ```
   If you see repeated `No module named memory` warnings, you are hitting this bug.

2. Confirm the path of `python3`:
   ```bash
   which python3
   python3 -c "import memory"
   ```
   The first command will usually point at a pyenv shim or a system Python. The
   second will fail with `ModuleNotFoundError`.

3. Confirm the project venv has the package:
   ```bash
   .venv/bin/python -c "import memory; print(memory.__file__)"
   ```
   This should succeed and print the path inside `.venv/lib/.../site-packages`.

If the first two checks indicate `python3` resolves outside the venv but the
third works, you are hitting the bug.

### Root cause

The Pi extension at `.pi/extensions/mirror-logger.ts` invokes the Python CLI
on every conversation turn:

```typescript
const result = await pi.exec("python3", args, { timeout: 30_000 });
```

`pi.exec("python3", ...)` resolves `python3` via the user's `PATH`. On a
machine with pyenv (or any user-level Python manager) ahead of the project
venv in `PATH`, this picks up a Python that does not have the project's
dependencies installed. The `memory` package lives in `.venv/lib/.../site-packages`,
which is only on `sys.path` when the venv interpreter is used.

The extension was specifically designed to **fail silently** (see the
`try/catch` around the exec call and the comment in `runPy`) so that any
failure in the persistence pipeline does not block the user's Pi session.
That design choice is correct for usability, but it also means a bug at this
layer can persist for a long time without any visible signal.

### Fix

Replace `python3` with `uv run python` so the project venv is used regardless
of `PATH` order. This aligns with the project convention (`AGENTS.md`: "Use
`uv run` for project Python commands") and works without requiring any
filesystem-relative path resolution because `uv` discovers the venv from the
process `cwd`.

```typescript
// .pi/extensions/mirror-logger.ts (line ~75)
const result = await pi.exec("uv", ["run", "python", ...args], {
    timeout: 30_000,
});
```

After saving the file, the fix takes effect on the next Pi session. Existing
in-flight sessions still hold the old extension code in memory and continue
to fail until restarted.

### Recovery of affected sessions

The Pi runtime persists each turn to its own session file on disk (independent
of the database). Even when the extension's database push fails, the Pi
session file preserves every user and assistant message. The `session-start`
sub-command of `conversation-logger` scans for orphaned Pi session files and
backfills them into the database.

Run after restarting Pi (or manually any time):

```bash
uv run python -m memory conversation-logger session-start
```

The output reports how many orphaned sessions were ingested. The most recent
incident backfilled 15 sessions accumulated over roughly a month, with no
data loss.

### Prevention

Three avenues are worth considering:

1. **Surface persistence failures.** The current design swallows errors to
   keep Pi responsive. Consider adding a visible indicator (e.g. a one-line
   note in `mm-mirror` output or a status check on `mm-help`) when
   `~/.mirror-minds/mirror-logger.log` shows recent `WARN`/`ERROR` lines.
2. **Document the convention.** The project already mandates `uv run` for
   Python invocations. Any new Pi extension should follow the same rule;
   it is worth calling this out explicitly in the extension author guide
   when one exists.
3. **Periodic backfill.** Even with the fix in place, running
   `conversation-logger session-start` opportunistically catches any future
   regressions before they accumulate.

---

<!-- New entries go above this line. Keep the most recent first. -->
