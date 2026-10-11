[< Refinement Campaign](index.md)

# RS002 — QA trust audit of the transition state

**Lens:** quality-assurance · **CRs:** CR012–CR017 (6) · **Status:** complete

> *QA trust audit of the CV22 transition state (authored by the quality-assurance persona).*

## Framing

Where the engineer asked "is the code well-built?", QA asked "can it be
**trusted** under failure?" The audit's verdict: DS2–DS4 rigorously answered
*does TS compute the same answer as Python?* but never *does TS fail the same way
Python fails?* Every finding was verified against `src/memory/db/connection.py`
(WAL, 30s busy timeout, `foreign_keys=ON`, schema auto-create), the Python
storage commit discipline, the TS seam, the CI workflow, and the production skill
invocations.

## Change requests

### CR012 — Match Python atomicity + busy-timeout discipline — `e021ae1`
**Problem.** Python opens every connection with a 30s busy timeout and
`foreign_keys=ON` and commits multi-statement writes as one transaction; the TS
seam had none of that, so writes failed instantly under mirror-logger contention
and could fail *between* the two `log_access` statements. **Resolution.** Every
open now applies `busy_timeout=30000` and `foreign_keys=ON`; a `withTransaction`
helper wraps `logAccess`; a real two-connection contention test proves the write
waits ~150ms then fails atomically, plus FK-enforcement and rollback tests.

### CR013 — WAL-correct, relocated, restorable backup — `9eef942`
*(with CR029 + CR031-TS)* **Problem.** The pre-write backup was a raw
`copyFileSync` of a WAL database: committed transactions still in `-wal` were
silently absent, a mid-checkpoint copy could tear, and no restore route existed.
**Resolution.** `snapshotDatabaseTo` uses `VACUUM INTO` (WAL-safe); a new
`frontDoor/liveBackup.ts` writes under `<home>/backups/` with 0700/0600
permissions and adds `restoreFromBackup` (verify hash, copy back, clear stale
sidecars). Tests prove the WAL-capture failure mode, the restore round-trip,
permissions, and tamper refusal.

### CR014 — Fallback happy-path e2e + cwd contract — `1a15129`
**Problem.** The highest-traffic path of the transition state (the Python
fallback) had zero automated coverage. **Resolution.** An e2e test spawns the
front door with an unported command and `--db-path` at a temp location, proving
Python answered and bootstrapped the DB at the translated `DB_PATH` (both
fallback routing and translation in one shot). The cwd invariant is documented at
the module header (uv's upward search makes a hard cwd guard wrong).

### CR015 — Missing-DB first-run contract — `2a9911e`
**Problem.** Python `get_connection` self-heals a missing DB; the TS front door
refused with exit 2, so a new user running `journeys` hit a wall where the
pre-cutover path bootstrapped. **Resolution.** When the DB file is absent, the TS
front door delegates to the Python fallback (which bootstraps and answers) — the
cheapest option, single-sourcing schema creation in Python until DS6. Recorded in
[Decisions](../../../decisions.md); a first-run e2e proves the self-heal.

### CR016 — Freeze rendered output with golden tests — `c71429a`
**Problem.** The text Pi users see (icons, truncation, hierarchy, count-by-type)
was validated once by hand in DS3 and had no regression net. **Resolution.**
Deterministic fixture + spawn-based golden tests for `journeys`/`memories`/
`detect-persona` plus empty-state edges, comparing full stdout to committed
`test/goldens/render/*.txt` (regen via `UPDATE_GOLDENS=1`). Black-box by design,
so it held the CR002 renderer extraction to exact output parity — and generating
it surfaced the `--db-path`-leak bug CR002 then fixed. *(Lifecycle backfilled
after commit — see the campaign index process notes.)*

### CR017 — Real-DB parity + cross-platform e2e in CI — `75fa382`
**Problem.** CI proved synthetic-golden determinism but not realism, ran the `ts`
job on Linux/Node-only, and never exercised the fallback e2e (no uv).
**Resolution.** The `ts` job gains Python+uv and an OS matrix
`[ubuntu-latest, macos-latest]` (un-skipping the fallback/first-run e2e and
guarding the environment-dependent behavior that had bitten CI); a new `parity`
job generates the portable demo DB and runs the redacted real-DB-copy harness,
failing on any mismatch. Commands were validated locally first
(`overall_match: true`).
