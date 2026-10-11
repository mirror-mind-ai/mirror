[< Story](index.md)

# Test Guide — CV22.DS7.TS3 — Ops/utility tail 2: daily-visible tail

## Automated Validation

```bash
uv run python ts/parity/generate_runtime_git_golden.py
uv run python ts/parity/generate_release_notes_golden.py
uv run python ts/parity/generate_runtime_status_golden.py
uv run python ts/parity/generate_runtime_diagnose_golden.py
uv run python ts/parity/generate_welcome_golden.py
git diff --exit-code ts/test/goldens/
cd ts && npm run typecheck && npm run lint && npm test && cd ..
uv run python scripts/check_oracle_drift.py
MEMORY_ENV=test uv run python ts/parity/real_db_copy_parity.py --source-db tmp/parity/demo-memory.db   # status/stats lines
node ts/parity/conversation_lifecycle_smoke.ts   # welcome, status line, runtime reads through both engines
```

The plan named one generator (`generate_runtime_reads_golden.py`); the port
split it into four as the plateaus landed — git/version, release notes, status,
and diagnose — because each grades a different oracle surface and a single
corpus would have regenerated all of them on any change to one.

`MEMORY_ENV=test` on the real-DB-copy line is not decoration: it is what the
CI parity job sets, and running the harness without it hides any defect that
depends on the environment. The welcome status-line probe is exactly such a
case — `MEMORY_ENV` moves both the line's environment segment and the database
NAME the mode segment looks for.

Expected: every command exits 0; goldens regenerate as a no-op; the smoke's
`welcome`/`runtime` steps route to TS by default and to Python under
`MIRROR_TS_WELCOME=0` / `MIRROR_TS_RUNTIME_READS=0`.

## E2E Decision

**Required** — a real Pi session after the flip is the story's reason.

## Navigator Validation

1. `welcome` through the front door and directly in Python — identical card,
   same update line, one shared cache file.
2. `runtime diagnose` through the front door — the `017_journey_parent_column`
   attention finding is gone; Python's output beside it still shows it. Every
   other finding identical.
3. `runtime release-notes latest` — identical across engines.
4. A new Pi session: status line as before, post-turn refresh no slower than
   before CR059, `front-door.log` shows `welcome ts`.

Pass: 1 and 3 identical; 2 differs only by the absent false alarm; 4 feels
like before with `welcome ts` logged. Fail: any other difference.

## Validation Evidence

Automated (2026-09-08, plateaus 1–6):

- 1296 TS tests green; typecheck and lint clean.
- Five goldens regenerate as a no-op and are byte-identical under Python 3.10
  and 3.12; all five are in the CI determinism gate.
- `cli/runtime.py`, `cli/welcome.py`, and `extensions/migrations.py` registered
  in the oracle-drift tripwire; check clean.
- Real-DB-copy probes `welcome_stats_line` and `welcome_status_line` green on
  the demo copy.
- Lifecycle smoke green at 110 checks: every tail surface through both engines,
  the shipped default with no gate set, each gate reverted independently, and
  the status line proven to leave the database byte-identical.
- Spawn spy (a recording `git` shim first on PATH) proves the status line
  spawns nothing; the card is the control that proves the spy works.

Intended divergence, recorded rather than skipped: on a database carrying the
TS-authored `017_journey_parent_column`, Python reports
`core_migration_unknown` and TS reports the ledger current. The smoke asserts
that every other line still matches — TS removed the false alarm and changed
nothing else.

Navigator route: **pending** — see the four steps above. Step 4 (a new Pi
session) is the story's stated reason and cannot be self-certified.
