[< Story](index.md)

# Test Guide — CV22.DS9.US1

## Automated Validation

In `ts/`:

```bash
npm run typecheck && npm run lint && npm test -- test/mcp
```

- `test/mcp/protocol.test.ts` — every case in `test/goldens/mcp-protocol.golden.json`
  deep-equals the Python response (or the absence of one, for notifications), including
  ids `0`, `""`, `null`-present, and string; `tools/list` byte-identical.
- `test/mcp/serve.test.ts` — spawns `src/mcp/main.ts` with **bare `node`, `NODE_OPTIONS`
  unset**, feeds `test/fixtures/mcp-framing.jsonl`, asserts stdout bytes equal the recorded
  Python stdout, stderr empty, exit 0; the large-response-then-EOF case arrives intact; the
  sentinel query string and result marker appear in no log sink.

CI determinism gate: `uv run python ts/parity/generate_mcp_protocol_golden.py` — no diff.
Oracle drift: green with `src/memory/mcp/server.py` and `tools.py` baselined.

## E2E Decision

Not required for US1. The process-level harness is the end-to-end for a protocol story whose
tools are stubs; the real-client session belongs to TS2.

## Navigator Validation

```bash
uv run python ts/parity/generate_mcp_protocol_golden.py          # expect: no diff
cd ts && npm test -- test/mcp && cd ..
uv run python ts/parity/generate_demo_memory_db.py --out tmp/parity/demo-memory.db
DB_PATH=tmp/parity/demo-memory.db uv run python -m memory mcp < ts/test/fixtures/mcp-framing.jsonl > tmp/py.out
DB_PATH=tmp/parity/demo-memory.db node ts/src/mcp/main.ts        < ts/test/fixtures/mcp-framing.jsonl > tmp/ts.out
diff tmp/py.out tmp/ts.out
```

| Observation | Pass | Fail |
|---|---|---|
| `diff` output | empty | any byte differs |
| Both exit codes | 0 | non-zero, or a hang (an `id: 0` request left unanswered) |
| stderr of the TS server (bare `node`) | empty | any line, including an `ExperimentalWarning` |
| `tools/list` in both outputs | identical | any key, order, or text differs |

## Validation Evidence

Pending implementation and validation.
