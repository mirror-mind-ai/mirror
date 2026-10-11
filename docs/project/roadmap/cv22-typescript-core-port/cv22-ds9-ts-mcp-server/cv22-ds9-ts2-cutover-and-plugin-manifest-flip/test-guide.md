[< Story](index.md)

# Test Guide — CV22.DS9.TS2

## Automated Validation

```bash
cd ts && npm run typecheck && npm run lint && npm test
uv run pytest tests/unit/memory/plugins -q
```

What CI grades that did not exist before this story:

- `ts/test/db/` — the narrow ledger handle refuses `DELETE`, `UPDATE`, a second table,
  `DROP`, and `BEGIN`; accepts `INSERT INTO llm_calls`.
- `ts/test/mcp/` — a query search under a replay provider with non-null usage writes
  exactly one `llm_calls` row: `role=embedding`, Python's model string, empty bodies,
  `cost_usd` numerically equal to the cost authority's figure, null conversation/session;
  the tools' handle still throws on a write.
- `ts/test/mcp/` — spawned `main.ts` on a fixture with a pending TS-authored migration
  applies it (one `_migrations` row, one stderr line) and answers `initialize`; on a
  current fixture stderr is empty; `initialize` reports the pyproject version with
  `MIRROR_MCP_VERSION` unset.
- `ts/test/mcp/` — the launcher from a non-repo cwd: default → TS; `MIRROR_TS_MCP=0` in
  the environment → Python branch (stub `python3` records argv); `MIRROR_TS_MCP=0` in
  `.env` only → Python branch; `.env` `0` + environment `1` → TS; a variable set in both
  reaches `main.ts` with the environment's value.
- `tests/unit/memory/plugins/test_claude.py` — the manifest's `mcpServers.mirror-mind`
  is `${CLAUDE_PLUGIN_ROOT}/mcp/launch.sh` with no `args`, and the drift guard is clean.

Determinism gate and oracle drift: unchanged, no re-baseline.

## E2E Decision

**Required.** Step 4 below is the end-to-end: this story makes the surface live and the
surface has no dogfooding path. The scripted diff is necessary; the session is the E2E.

## Navigator Validation

Run from the repository root unless a step says otherwise.

**1. Two-engine diff through the launcher, both branches.**

```bash
scripts/mcp_two_engine_diff.sh --launcher
```

Expected: two empty diffs — launcher default (TS) and launcher with `MIRROR_TS_MCP=0`
(Python, under the plugin-contract stand-in) — each against the golden transcript;
`initialize` carries `0.31.x` on both. Fail: any byte difference.

**2. Real-copy probe through the launcher, with the ledger assertion.**

```bash
scripts/mcp_real_copy_probe.sh --launcher
```

Expected: twelve deterministic tool variants identical across engines (hashes only), then
one query search on TS: `llm_calls +1`, every other table `+0`. This step spends one
embedding call on the Navigator's key. Fail: any hash mismatch, any row other than the one
`llm_calls` insert, any content printed.

**3. The launcher from a cwd that is not the repository.**

```bash
cd /tmp
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n' \
  | <repo>/plugins/mirror-mind/mcp/launch.sh
# expect: serverInfo.version 0.31.x; in another terminal, `ps` shows node … ts/src/mcp/main.ts

MIRROR_TS_MCP=0 <repo>/plugins/mirror-mind/mcp/launch.sh < /dev/null
# expect on this machine: ModuleNotFoundError: No module named 'memory'
# — fact 12 observed: the revert restores CV21's contract, which is unmet here.
```

Fail: the default branch answers from Python, or the revert branch runs node.

**4. One real Claude session, and one control.**

```bash
DB_PATH=<copy-of-memory.db> claude --plugin-dir plugins/mirror-mind
```

In the session: `/mcp` shows `mirror-mind` connected; ask for `tools/list` (compare the
seven names and schemas with the baseline); one call per tool; one malformed call (an
unknown tool name) returns an error result, not a dead server. In another terminal while
the session is open: `ps` shows `node … ts/src/mcp/main.ts` as the client's child.

Control: `MIRROR_TS_MCP=0 DB_PATH=<copy> claude --plugin-dir plugins/mirror-mind` —
`/mcp` shows the server failed or connected via `python3 -m memory mcp`, per the
machine's contract state; either observation is recorded.

The guarded call the DS9 index lists belongs to TS1 and is recorded as not applicable.

Expected observation: both sessions behave as their branch predicts; observations
written into `validation.md`. Fail: the TS session cannot list or call tools, a tool
error kills the server, or the process tree shows the wrong engine.

## Validation Evidence

**Automated, CI green at `4493fe00`** (Tests and Docs workflows both success):
2356 TS tests pass, typecheck and lint clean apart from one pre-existing
`routing.ts` warning this story did not touch; `uv run pytest` green except
`test_operations_run_api_executes_runtime_diagnose_through_controlled_command`,
the known machine-local flake captured as
[CR058](../../../../refinement/rs010-cv22-oracle-and-port-hygiene/cr058-wait-for-completion-in-the-runtime-diagnose-web-test.md),
which passes in CI.

**Step 1 — two-engine diff through the launcher.** Run 2026-09-18:

```text
── plugins/mirror-mind/mcp/launch.sh with MIRROR_TS_MCP=0  (the revert branch)
   exit=0 stderr_bytes=0
── plugins/mirror-mind/mcp/launch.sh with no gate  (what a client spawns by default)
   exit=0 stderr_bytes=0
   ✓ DIFF EMPTY — 9 responses identical byte for byte
   ✓ both exit 0 with empty stderr
   ✓ default branch  -> TypeScript
   ✓ MIRROR_TS_MCP=0 -> Python (0.31.14)
```

**Step 2 — real-copy probe through the launcher**, on a copy of the 50 MB
production database. Twelve tools byte-identical across engines; read paths
wrote nothing; then one query search on the TS branch:

```text
   memory_access_log        3786 -> 3786     delta=+0 want=+0 OK
   llm_calls                 552 -> 553      delta=+1 want=+1 OK
   memories                  950 -> 950      delta=+0 want=+0 OK
   conversations            1024 -> 1024     delta=+0 want=+0 OK
   row: role=embedding model=openai/text-embedding-3-small bodies_withheld=True
        priced=True unattributed=True
```

`memory_access_log +0` alongside `llm_calls +1` is the pair that matters: spend
is recorded and AI-12's no-reinforcement rule still holds.

**Step 3 — launcher from a non-repo cwd.** Covered automatically by
`ts/test/mcp/launcher.test.ts` (7 cases, all spawned from `os.tmpdir()` against
a fake repo layout): default → TS, `MIRROR_TS_MCP=0` in the environment → Python,
`0` in `.env` alone → Python, environment overriding the file in both directions,
last-assignment-wins, commented/similarly-named gates ignored, `.env` reaching
the process with the environment still outranking it, and no `.env` at all.
`claude plugin validate plugins/mirror-mind` passes with the
`${CLAUDE_PLUGIN_ROOT}` command.

**Step 4 — the real Claude session: PENDING.** This is the Navigator's, and it
is the story's E2E. Nothing dogfoods this surface, so no amount of scripted
evidence substitutes for one session.
