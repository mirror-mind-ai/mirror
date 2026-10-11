[< Refinement Campaign](index.md)

# RS004 — DevOps audit of transition-state operations

**Lens:** devops-engineer · **CRs:** CR024–CR029 (6) · **Status:** complete

> *DevOps audit of the CV22 transition state operations (authored by the devops-engineer persona).*

## Framing

This lens owns operational survivability: what happens on real user machines, at
update time, and under incident pressure, with no developer watching. Findings
were verified against `src/memory/config.py` (`_DB_NAMES`, `MEMORY_ENV`,
`MEMORY_PROD_DIR`, backup-dir conventions), `runtime.py` (the status surface),
the user docs, the native-PowerShell installer, and the front-door code. Positive
ledger: the TS runtime has **zero production npm dependencies** (nothing to
install on user machines) and the skills ride the repo, so propagation is a plain
`git pull`.

## Change requests

### CR024 — Environment isolation broken across the seam — `71ca41e`
*(same commit as CR007)* **Problem.** Python selects the database *name* by
environment (`memory.db` / `memory_dev.db` / `memory_test.db`) but the TS front
door hardcoded `memory.db` — so a `MEMORY_ENV=development` session read and
**wrote production** while Python targeted the dev DB. On daily-dogfooded
machines, a live hazard. **Resolution.** Ported the env-aware resolution
(`db_name_for_env`, `MEMORY_PROD_DIR` production-only override) into a pure,
tested `dbPath.ts`, with loud failure when unconfigured (per the CV9.E2.S6
no-homes-root decision) instead of a silent fallback. *This was the single most
urgent finding of the whole campaign.*

### CR025 — Node preflight, prerequisites, platform envelope — `8ca957f`
**Problem.** The TS core needs Node ≥ 24 (`node:sqlite` + type-stripping), but
nothing enforced or communicated it. **Resolution.** A preflight (in an
importable `nodeSupport.ts`) refuses Node < 24 with an actionable message;
`runtime status` detects and reports the Node version; README and getting-started
list the prerequisite; REFERENCE states the platform envelope (POSIX now,
native-Windows front door deferred).

### CR026 — Durable, redacted front-door observability — `18e0138`
**Problem.** The front door was a production write path that left no trace of
backup failures, guard refusals, or `SQLITE_BUSY`. **Resolution.**
`frontDoorLog.ts` appends a metadata-only line per invocation to
`<home>/front-door.log`, fail-quietly. Redaction is *structural* (the entry only
carries command/route/exit/error-category — never argv payloads or content,
proven by a test that runs `identity set` with a secret `--content`). `runtime
diagnose` reads the log and raises an attention finding on recent errors. This
also serves as the interim identity-mutation trail named by SEC/CR032.

### CR027 — Harden the Python fallback spawn — `2075d20`
**Problem.** A missing `uv` produced exit 1 with **zero output**; there was no
timeout. **Resolution.** `spawnSync` errors are translated into actionable
messages (ENOENT names uv/PATH; ETIMEDOUT names the ceiling and the override),
and a generous 10-minute timeout (tunable via
`MIRROR_FRONTDOOR_PYTHON_TIMEOUT_MS`) guarantees a blocked command can't hang a
session forever. Both failure modes are covered by spawn-level tests.

### CR028 — Rollback runbook for the cutover — `05308fb`
**Problem.** The DS4 cutover's rollback path lived only in conversation memory —
nothing an operator under incident pressure could find. **Resolution.** A
`docs/process/troubleshooting.md` section covers distinguishing TS-route failures
from Python failures, rolling the skills back (a `git revert` of the cutover
commit, dry-run-verified to apply cleanly), restoring the pre-write snapshot (the
operator form of CR013's `restoreFromBackup`), and smoke verification.

### CR029 — Align the backup with home conventions + cost model — `9eef942`
*(with CR013 + CR031-TS)* **Problem.** The backup was a sibling dotfile ignoring
the home's `backups/` convention, invisible to backup tooling, taking a full
copy before every write. **Resolution.** Relocated to
`<home>/backups/frontdoor-pre-write-backup.db`; the fixed-name overwrite-window
cost model (an undo, not an archive) is documented at the source; the WAL-safe
`VACUUM INTO` improves the copy story. Mechanism, placement, and permissions
landed as one change with CR013 and CR031.
