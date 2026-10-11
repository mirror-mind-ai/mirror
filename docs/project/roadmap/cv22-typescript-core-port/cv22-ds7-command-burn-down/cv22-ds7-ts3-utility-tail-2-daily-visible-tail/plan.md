[< Story](index.md)

# Plan — CV22.DS7.TS3 — Ops/utility tail 2: daily-visible tail

## Objective

Port `welcome` (card and per-turn status line) and the read-only `runtime`
subcommands — `status`, `version`, `diagnose`, `release-notes` — to the
TypeScript core with proven parity, **including read-only git inspection**
(Navigator decision, option 2, 2026-09-08), and route them to TS ungated. Two
live reasons on top of burn-down: the per-turn status refresh became a
front-door call under CR059 and pays ~190 ms of Node+Python startup until
`welcome` answers from TS; and Python's `runtime diagnose` misreports the
TS-owned schema, flagging the TS-authored `017_journey_parent_column` as
`core_migration_unknown` on every install that has run the TS engine.

## Terrain (facts, read before planning)

- **`welcome.py` (542 lines).** `compose_welcome` renders four plain lines
  (`◇ Mirror · <user>`, `Version <v>`, a stats line from the DB, an optional
  update line) plus the invitation. `compose_status_line` — the per-turn call —
  reads **only the cache** (`runtime/update-check.json`, 6 h TTL), the mode
  segment (`get_active_mode` from the DB, journey display name), and an
  environment segment; no git, no network. The cache refresh, which does touch
  git and the network, runs only from the full card and honors
  `MIRROR_WELCOME_REMOTE_UPDATE_CHECK=off|0|false|no`.
- **What `welcome` imports from `runtime.py`:** `package_version` (importlib
  metadata, else the `version =` line walked up from `pyproject.toml`),
  `inspect_update_channel`, `inspect_git`, `inspect_git_update_plan`,
  `check_runtime_update_availability` (`git ls-remote` under a 120 s network
  budget), `_run_git` for `_remote_tag_for_commit`, and the local release-note
  reader for `_local_release_title`.
- **`runtime` read subcommands** — exactly four: `status`, `version`,
  `diagnose`, `release-notes [latest|<version>|pending]`. (`latest` and
  `pending` are *arguments* of `release-notes`, not subcommands; the 2026-09-07
  decision text and the ledger's § table listed them as subcommands and are
  corrected in this story.) `release-notes pending` fetches (`git fetch
  origin stable`); `release-notes <version>` reads a note from a git ref via
  `git show`. `status` and `diagnose` both build `RuntimeStatusReport`: git
  state, mirror home, `db_path_for_home`, `_migrations` vs known core ids,
  extension health (`memory.extensions.migrations.inspect_migration_files`, 359
  lines — TS4 territory), node version detection; `diagnose` adds worktree
  dirtiness, `root_state_findings` (legacy state under the homes root), and
  `probe_model_pins`, which calls OpenRouter's model list — a **live provider
  call** that yields no findings when it cannot fetch.
- **Git operations in the read paths** (all read-only): `rev-parse
  --show-toplevel`, `branch --show-current`, `rev-parse [--short] HEAD`,
  `status --porcelain`, `rev-parse --verify <upstream>`, `show <ref>:<path>`,
  `ls-remote <remote> refs/heads/<branch>`, `fetch <remote> <branch>` (for
  `release-notes pending` only). Mutating operations (`merge --ff-only`,
  `tag`, `branch --force`, push) live only under `update`, `release-promote`,
  and `backup`, which are DS10's and out of scope.
- **Existing TS to reuse:** `resolveDbPath`/`resolveMirrorHome`,
  `KNOWN_MIGRATION_IDS` and `schemaState.ts` (the TS migration manifest — the
  authority that fixes the false alarm), `detectNodeVersion`-equivalent in the
  front door's preflight, the DS5 provider substrate for the model catalog under
  replay, `#mode` for the active-mode read, `journeyListing` for display names.
  `ts/src/extensions/` has only the context runtime; extension migration
  inspection does not exist in TS yet.
- **Callers.** Since CR059 every caller already enters the front door
  (`welcome`, `welcome --status-line --session-id`, the skills
  `mm-welcome`/`mm-release-notes`/`mm-update`), so the flip is routing only;
  the two skill docs switch their invocation to the front door for consistency.

## Scope

**A. `welcome`, whole.**
1. `ts/src/welcome/statusLine.ts` — `composeStatusLine({mirrorHome, sessionId})`:
   home name, environment segment, mode segment (active mode + journey display
   name), update marker from the cache (`⬆ <version>` or `✓`). Hot path: no
   git, no network, one read connection.
2. `ts/src/welcome/updateCache.ts` — read/write/TTL/staleness of
   `runtime/update-check.json`, byte-compatible with Python's JSON (sorted
   keys, indent 2, trailing newline) so both cores read each other's cache.
3. `ts/src/welcome/card.ts` — `composeWelcome`: user, version, stats line,
   update line via the refresh path (git + `ls-remote`, TTL-guarded, disabled
   by `MIRROR_WELCOME_REMOTE_UPDATE_CHECK`), invitation.

**B. Read-only git and runtime inspection.**
4. `ts/src/runtime/git.ts` — the read operations above over `spawnSync git`
   with Python's two timeouts (2 s local, 120 s network) and its `(code,
   stdout, stderr)` tolerance; `GitStatus`, worktree entries, update plan,
   update-availability check. **No mutating git verb exists in this module,
   by construction and by test.**
5. `ts/src/runtime/version.ts` — package version (`pyproject.toml` walk; TS
   has no importlib metadata, so the walk is the shared source), update channel
   inspection, semver key.
6. `ts/src/runtime/releaseNotes.ts` — local notes via `git show`, the pending
   bundle with fetch, renderers.
7. `ts/src/runtime/status.ts` — `RuntimeStatusReport`: core migrations graded
   against **TS's manifest** (`KNOWN_MIGRATION_IDS`), extension health (a port
   of `inspect_migration_files`' read side into `ts/src/extensions/migrations.ts`
   for TS4 to reuse), node detection, root-state findings, `diagnose_runtime`
   rules, model-pin probe behind the DS5 provider substrate (replay or
   inconclusive), and the three renderers.

**C. Front door, routing, evidence.**
8. `runWelcome`, `runRuntimeRead` in a `runtimeRoute.ts`; routing entries for
   `welcome` and for `runtime status|version|diagnose|release-notes`
   allowlisted by subcommand — `update|pull|stable|backup|release-doctor|
   release-promote` stay Python by explicit refusal, never by inheritance
   (RS009's rule). Gates `MIRROR_TS_WELCOME` and `MIRROR_TS_RUNTIME_READS`,
   default off until the flip, `=0` after.
9. Goldens from Python on a **fixture git repository with a `file://` bare
   remote** built by the generator (commits, a tag, a stable branch, a release
   note file, a dirty worktree variant), a fixture mirror home, frozen clock,
   TZ=UTC; both generators join the determinism gate. Real-DB-copy coverage:
   the status line and stats line over the demo copy in the read-side harness.
   Lifecycle smoke extended: `welcome`, `welcome --status-line`, `runtime
   status|version|diagnose` through both engines on the disposable home.
10. Flip, ledger, `mm-welcome` and `mm-release-notes` skill docs; correction
    of the `latest|pending` wording in the ledger § table and the 2026-09-07
    decision entry.

## Non-Goals

- **No git mutation.** `update`, `pull`, `stable`, `backup`, `release-doctor`,
  `release-promote` are DS10's; `merge`, `tag`, `branch --force`, and push
  do not appear in `ts/src/runtime/`.
- **No live provider call.** The model-pin probe runs under the DS5 replay
  substrate or reports inconclusive; a live catalog fetch is DS8's. Stated
  divergence: on an install with a live key, Python's `diagnose` can warn
  `model_pin_unresolved` while TS cannot until DS8. Recorded as a DS8 input.
- **No behavior change** except the one the story exists for: `diagnose`
  grades core migrations against the TS manifest, so a TS-authored migration
  is known, not "unknown". That is the moving-target rule applied — TS is the
  schema authority since DS6 — and the golden pins TS's answer on a database
  carrying `017`, with Python's differing output recorded beside it.
- No extension catalog commands (`extensions`, `ext`, `list extensions`,
  `inspect extension|runtime-catalog`) — TS4; TS3 ports only the migration-file
  read that `status`/`diagnose` need and leaves it where TS4 will find it.
- No Windows-specific work beyond what the suite already covers; git
  detection on Windows follows the same `spawnSync` path.

## Acceptance Behavior

```text
Given a mirror home with a fresh update cache and an active Builder session
When `welcome --status-line --session-id <s>` runs through the front door
Then the line equals Python's byte for byte (home · env · mode/journey · ✓ or ⬆ v)
And no git process was spawned (asserted by the test's spawn spy)

Given the fixture repository, a file:// remote one commit ahead on stable,
  and a stale or absent cache
When `welcome` runs with the clock frozen
Then the card equals Python's byte for byte, the update line names the remote
  tag, and the cache file is rewritten with the same JSON bytes Python writes

Given MIRROR_WELCOME_REMOTE_UPDATE_CHECK=off
When `welcome` runs
Then no ls-remote happens and the card matches Python's disabled-check output

Given the fixture repository on a branch with a dirty worktree
When `runtime status`, `runtime version`, and `runtime diagnose` run
Then each render equals Python's, except that a database carrying the
  TS-authored 017 migration is reported clean by TS (`core_migration_unknown`
  absent) — the recorded, intended divergence

Given the fixture remote with a stable branch and release notes
When `runtime release-notes latest`, `<version>`, and `pending` run
Then the notes and the pending bundle equal Python's

Given MIRROR_TS_WELCOME=0 or MIRROR_TS_RUNTIME_READS=0
When any of the above runs
Then Python answers with identical output, and the front-door log says python

Given `runtime update --check`
When it runs through the front door
Then the route is Python by explicit refusal (reason names DS10), not inheritance
```

## Parity Contract And Known Divergence Classes (pinned by golden)

- Month abbreviations and date rendering (`_MONTH_ABBR`, `_iso_now`) — Python
  formats by hand; TS reproduces the table, never `toLocaleDateString`.
- `_semver_key` tuple ordering and `_commits_match` prefix rule.
- JSON cache bytes: sorted keys, indent 2, `ensure_ascii` off, trailing newline.
- Git stdout trimming, exit-code tolerance, and the porcelain parse.
- Stats line pluralization and counts over the demo copy.
- Node version string with the leading `v` stripped.
- `diagnose` exit code: 0 only with no findings — TS's clean answer on a
  TS-migrated DB therefore also changes the exit code from 1 to 0 on such
  installs; intended and pinned.

## Validation Route

Automated: goldens + determinism gate (3.10/3.12, TZ=UTC, offline — the
`file://` remote never leaves the machine); unit tests with a spawn spy that
`statusLine.ts` spawns nothing and `ts/src/runtime/git.ts` contains no mutating
verb; routing tests including the explicit refusal of the DS10 subcommands;
read-side harness for the status/stats lines; the smoke through both engines;
`.pi` typecheck; oracle registration of `welcome.py` and `runtime.py`.

Navigator route (real home; all read-only):
1. `… cli.ts welcome` and `uv run python -m memory welcome` — expected:
   identical card, same update line, one shared cache file.
2. `… cli.ts runtime diagnose` — expected: the `017_journey_parent_column`
   attention finding is **gone**, `loose_permissions` (if still present)
   remains, exit code reflects the remaining findings; Python's output beside
   it still shows the false alarm — the divergence you asked for.
3. `… cli.ts runtime release-notes latest` vs Python — identical.
4. A new Pi session after the flip: status line renders as before; the
   post-turn refresh is visibly no slower than the pre-CR059 baseline;
   `front-door.log` shows `welcome ts`.

Pass: 1 and 3 identical; 2 differs only by the absent false alarm; 4 feels
like before with `welcome ts` in the log. Fail: any other difference.

E2E decision: **required** — item 4 is the story's whole reason.

## Implementation Contract

Plateaus, one commit each; nothing routes until plateau 6:

1. `runtime/git.ts` + `version.ts` with the fixture-repo golden generator
   (repo, bare `file://` remote, tag, stable branch, dirty variant).
2. `runtime/releaseNotes.ts` + renderers; `runtime version` and
   `release-notes` goldens.
3. `runtime/status.ts` (+ `extensions/migrations.ts` read side): `status`
   and `diagnose` goldens including the intended `017` divergence.
4. `welcome/`: cache, status line, card; welcome golden with frozen clock,
   disabled-check variant, stale-cache refresh against the fixture remote.
5. Front door + routing (gated off), read-harness probe, smoke extension,
   CI gate entries, ledger pre-flip entry.
6. Flip: gates default on, skill docs, ledger, decision/ledger wording fix.

Rules as in TS1; plus: `ts/src/runtime/` gets a test that greps its own source
for `merge|tag |branch --force|push` and fails if any appears.

## Persona Review (plan stage — full panel, story is well above a small slice)

**◇ engineer** — Cohesion: `welcome/` and `runtime/` are two directories, not
one; the git module is the shared seam and must stay read-only by test, not by
comment. The extension-migration read belongs under `extensions/` from day one
so TS4 extends rather than moves it. Reuse `KNOWN_MIGRATION_IDS`; do not copy
the manifest. Flag: `welcome.py` reaches into `runtime.py` privates
(`_run_git`); TS exposes the git module's public surface only.

**◇ quality-assurance** — Blocking: the diagnose divergence must be a
*scenario in the golden* with both outputs recorded, not a skipped assertion.
The status line is the most-executed surface in the product; its golden needs
the mode × journey × update-marker matrix, not one happy path. The
spawn-spy assertion ("status line spawns nothing") is the guard against the
latency regression sneaking back. Fixture remote via `file://` keeps CI
offline; assert no network by running the git golden with `GIT_CONFIG_*`
proxy variables set to an unreachable host.

**◇ database-architect** — `inspect_core_migrations` reads `_migrations`
through a raw connection in Python; TS reads through the seam with the
read-only handle and must not bootstrap or migrate on open (a diagnose that
migrates the database it is diagnosing is a defect). Extension health reads
extension migration files and compares to `_migrations` rows — same
read-only discipline. The stats line counts must use the same SQL as Python.

**◇ devops-engineer** — Two gates, independently revertible; the DS10
subcommands refused explicitly with a reason naming DS10. The 120 s network
budget for `ls-remote` is inherited; the per-turn path must never reach it.
Redaction: `welcome` output can carry a journey display name — stdout only;
the log line stays command/engine. The cache file is shared by both engines
during the transition: byte-compatible JSON is a hard requirement, not a
nicety, or the two cores will thrash the TTL.

**◇ security-engineer** — Git commands take repository-derived arguments
(`ref`, remote name, branch): pass them as separate argv, never a shell
string; refuse refs that start with `-` (argument injection into git). The
release-note reader shows file contents from a git ref — content is rendered,
never executed or interpolated. The model-pin probe under replay must not
read `OPENROUTER_API_KEY`; the inconclusive path must be the default when
unconfigured.

**◇ ai-engineer** — The model-pin probe is model-in-the-loop only in the sense
of a catalog fetch; keep it behind the DS5 substrate and record the
divergence as a DS8 input rather than inventing a TS-side live call.

Consolidated: proceed; the blocking inputs are the read-only-by-test git
module, the recorded diagnose divergence, the spawn-spy on the status line,
byte-compatible cache JSON, argv-only git invocation, and no live provider.

## Debt / CRs To Capture At Debt Review (candidates)

- `welcome` reaches into `runtime` privates in Python (`_run_git`) — cleaned by
  construction in TS; nothing to carry.
- The model-pin live probe divergence until DS8 — DS8 input, not a CR.
- If `inspect_migration_files` turns out to carry write paths, the write side
  is TS4's and is left in Python with an explicit refusal.

## Stop Conditions

- scope_change_detected — any mutating git verb becomes "needed"; any
  extension-catalog command wants to ride along.
- plan_rule_conflict — the cache JSON cannot be made byte-compatible.
- failing_required_check_without_clear_fix — the fixture-repo golden differs
  across git versions on CI (git output format drift): stop and pin the
  format, do not loosen the golden.
- navigator_decision_needed — a second intended divergence appears beyond the
  `017` false alarm.

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
