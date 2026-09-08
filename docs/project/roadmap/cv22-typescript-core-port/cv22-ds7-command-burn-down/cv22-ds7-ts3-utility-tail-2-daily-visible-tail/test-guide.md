[< Story](index.md)

# Test Guide — CV22.DS7.TS3 — Ops/utility tail 2: daily-visible tail

## Automated Validation

```bash
uv run python ts/parity/generate_runtime_reads_golden.py
uv run python ts/parity/generate_welcome_golden.py
git diff --exit-code ts/test/goldens/
cd ts && npm run typecheck && npm run lint && npm test && cd ..
uv run python scripts/check_oracle_drift.py
uv run python ts/parity/real_db_copy_parity.py --source-db tmp/parity/demo-memory.db   # status/stats lines
node ts/parity/conversation_lifecycle_smoke.ts   # welcome, status line, runtime reads through both engines
```

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

Pending implementation and validation.
