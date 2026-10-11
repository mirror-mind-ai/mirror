# Plan — CV22.DS4.US5

## Objective

Route `journey set-path <slug> <path>` to the TS core through the Pi front door over
the US4 live-write seam, reusing the US2-ported `setProjectPath`, with a new
`normalizeProjectPath` that matches Python's `Path.expanduser().resolve()`. Same
output, no user-visible change. This is the last CLI-write family CV22.DS4 needs to
collapse.

## What already exists

- **US4** — the sanctioned live-write seam (`openDatabaseForWrite`), the backup gate
  (`ensureBackup`), `nowIso()`, and the front-door write-handler pattern in `cli.ts`.
- **US2** — `setProjectPath(db, slug, normalizedPath, nowIso)`: reads the journey
  identity metadata, sets `project_path`, re-serializes with `pyJsonDumps` (json.dumps
  defaults), and `updateIdentityMetadata`. It already takes a **pre-normalized** path.
- **Routing table** — `routing.ts`, currently routing `identity set` + the DS2 reads.

The only genuinely new logic is the **path normalization** that US2 injected.

## The parity crux — path normalization

Python `_normalize_project_path(value)` = `str(Path(value).expanduser().resolve())`:
expands `~`, makes the path absolute, and **resolves symlinks** (non-strict — it
resolves symlinks in existing ancestors and makes the rest absolute even if the full
path does not exist). Node differs: `path.resolve` does not resolve symlinks, and
`fs.realpathSync` throws on a missing path.

Proposed `normalizeProjectPath(value)`:

1. expand a leading `~` to `os.homedir()` (reuse the front door's `expandHome`);
2. `path.resolve(...)` to an absolute path;
3. `fs.realpathSync(...)` to resolve symlinks — **exact** match to Python for an
   existing directory (the normal `set-path` case);
4. on `ENOENT`, fall back to the step-2 absolute path (best-effort, matching Python's
   non-strict behavior closely enough for a non-existent path).

## Scope

- **`normalizeProjectPath`** (new, e.g. `frontDoor/journeyWriteRoute.ts` or a shared
  path util) matching the semantics above.
- **Route `journey set-path`** in `routing.ts`: command `journey` + subcommand
  `set-path` → `ts`; every other `journey` subcommand (`update`, `status`, …) → Python.
- **Front-door handler** for `journey set-path <slug> <path>`: normalize the path,
  `ensureBackup`, `openDatabaseForWrite`, `setProjectPath(db, slug, normalized, nowIso())`,
  then reproduce Python's output — the resolved path to **stdout** and
  `project_path set for '<slug>': <resolved>` to **stderr**. A missing journey
  (`setProjectPath` throws) prints `Error: journey '<slug>' not found.` to stderr and
  exits 1, matching `cmd_set_path`.

## Non-Goals

- Journey **create** (no CLI; created via skills), **content update**, stage/status —
  not ported / not front-door commands.
- Reinforcement routing (CV22.DS5), external-API writes (CV22.DS5), schema change.
- The production `mm-journey` skill cutover — deliberate, post dev-dogfood.

## Acceptance Behavior

```text
Given a memory.db copy with an existing journey <slug>
When `node frontDoor/cli.ts journey set-path <slug> <path>` runs through the front door
Then the TS core normalizes <path> (expanduser + resolve, like Python), writes it into
     the journey's project_path metadata (json.dumps defaults, updated_at stamped),
     prints the resolved path to stdout and the "project_path set for ..." line to stderr
And `set-path` on a missing journey prints `Error: journey '<slug>' not found.` and exits 1
And every other journey / unported command still falls back to Python
```

## Validation Route

- **Automated:** `normalizeProjectPath` tests (`~` expansion, absolute, symlink
  resolution via a real tmp symlink, missing-path fallback); routing tests
  (`journey set-path` → `ts`; `journey update`/`status`/reads → `python`); a handler
  test against a DB copy (existing journey → `project_path` set + resolved returned;
  missing journey → exit 1); a spawn E2E; `tsc` / `biome` clean.
- **Navigator-visible (E2E):** on a dev-DB copy, `journey set-path <existing-slug>
  <dir>` through the front door → resolved path on stdout, metadata updated; a missing
  slug → error + exit 1; confirm `journey update` still routes to Python.
- **E2E decision:** a real front-door journey write against a DB copy / dev DB — a
  genuine (non-fixture) E2E, never production. (Navigator to accept.)

## Implementation Contract

- TDD: `normalizeProjectPath` first (the parity crux), then routing, then the handler.
- Reuse the US4 seam/backup/`nowIso` and US2 `setProjectPath`; do not duplicate them.
- Keep scoped to `CV22.DS4.US5` (`journey set-path` only).
- Use `uv run` for Python; `git add` only story-scoped files; descriptive commits.

## Open Decision (Navigator)

**Missing-path normalization.** Python accepts a non-existent project path (non-strict
resolve). Proposed: `realpathSync` when the path exists (exact Python match), else fall
back to `path.resolve` (absolute, no symlink). Accept this, or require the path to
exist and error otherwise?

## Stop Conditions

- scope_change_detected
- plan_rule_conflict
- failing_required_check_without_clear_fix
- navigator_decision_needed

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
