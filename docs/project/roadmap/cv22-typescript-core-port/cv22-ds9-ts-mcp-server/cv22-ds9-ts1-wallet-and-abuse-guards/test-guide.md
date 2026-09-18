[< Story](index.md)

# Test Guide — CV22.DS9.TS1

## Automated Validation

```bash
cd ts && npm run typecheck && npm run lint && npm test
```

What CI grades that did not exist before this story:

- `ts/test/mcp/guards.test.ts` — the pure decision table: under, at, and over the limit;
  window boundary; ceiling unset; ceiling reached with unpriced rows counted as zero and
  reported. The adapter against a seeded ledger with rows inside and outside the window and
  with extraction and front-door rows present and **not counted**. Mutants that must die: a
  guard that counts unattributed rows; an off-by-one at the limit; a window that ignores
  `called_at`.
- `ts/test/mcp/boundary.test.ts` — every argument rule refuses through the wired registry
  with the D6 text, while the golden's direct-call `limit_zero` cases stay byte-identical; a
  refused paid call reaches no provider (the replay provider counts calls) and writes no
  row; the 31st call in a window is refused and a call after the window is allowed; the
  refusal text never contains the query; gate off restores every TS2 test.
- `ts/test/mcp/ledgerRow.test.ts` — `mirror_context(query)` with attachments writes one
  row with `session_id='mcp'`; without attachments, none. The TS2 `unattributed` assertion
  is flipped **deliberately** to `session_id='mcp'`.
- `ts/test/mcp/crossProcess.test.ts` — two spawned servers on one fixture copy, calls
  alternated, refusal at the global count.

Determinism gate and oracle drift: unchanged.

## E2E Decision

**Required.** Step 4 is it: the refusal text is a hypothesis about model behaviour until a
model reads it.

## Navigator Validation

Run from the repository root. **Use a fresh copy for step 4** — the count is global across
processes on one database by design, so a session opened on a copy the probe just filled
is refused on its first search.

**1. Two-engine diff, still empty.**

```bash
scripts/mcp_two_engine_diff.sh --launcher
```

Expected: unchanged from TS2 — no `limit` case in the transcript, and guards do not touch
in-range calls.

**2–3. The guard probe, on a fresh copy.**

```bash
scripts/mcp_guard_probe.sh ~/.mirror-minds/vinicius-ts/memory.db
```

Expected, in order: 31 `search_memories(query)` calls through the launcher — 30 rows added
with `session_id='mcp'`, the 31st an `isError` result reading `…is rate-limited (30 calls
in 10 minutes)… Do not retry this tool.`, the ledger unchanged by it, one `guard refused
tool=search_memories reason=rate_limit` line on stderr and nothing else; then
`recall_conversation` with `limit: 0` and `limit: 999` → `limit must be an integer from 1
to 200 (received …)`; then the same with `MIRROR_TS_MCP_GUARDS=0` → the whole transcript,
Python's behaviour. Spends ~$0.00006. Fail: any refusal as a protocol error, any row for a
refusal, a query string anywhere in stderr.

**4. One Claude session, on a fresh copy.**

```bash
DB_PATH=<fresh-copy> claude --plugin-dir plugins/mirror-mind
```

Pre-registered expectation, written down before the session: at the 31st call the agent
**reports the refusal and stops or asks; it does not retry.**

Prompt: *"Using the mirror-mind `search_memories` tool with a `query` argument, one call
per topic, search my memories for these 35 topics: …"* (35 distinct short topics).

Then: *"Call `recall_conversation` on the most recent conversation with `limit: 0`."*
Expected: the argument refusal surfaces and the agent corrects the value.

Measured afterwards, from the MCP log
(`~/Library/Caches/claude-cli-nodejs/<project>/mcp-logs-plugin-mirror-mind-mirror-mind/`):
`guard refused` lines after the first = retries. Expected 0. Written into `validation.md`
as an n=1 observation against the prediction, not as a property.

## Validation Evidence

Pending implementation and validation.
