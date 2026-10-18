[< Story](index.md)

# Test Guide — CV21.DS10.TS2

## Automated Validation

Always, from the repository root:

```bash
node ts/scripts/checkDocLinks.ts
```

When the outcome changes code (outcome 2, a generated `.mcp.json`):

```bash
npm run typecheck
npm run lint
npm test
node ts/scripts/checkPackContents.ts
node ts/scripts/buildClaudePlugin.ts --check
bash scripts/smoke_claude_plugin.sh
```

Expected: all green. Outcome 2's tests — `ts/test/scripts/claudePlugin.test.ts` (the
generated `.mcp.json` equals the manifest's `mcpServers`; the tree's copy equals the
generated text) and `ts/test/scripts/packContents.test.ts` — fail before the change
and pass after it. US1's `guards` route is re-run and must still report one MCP
server on Claude Code, agy, Codex, and Grok.

## E2E Decision

Required. The E2E is step 1 below: the installed Grok, the install US1 ships, a real
model, the stream read by field. The TUI is US3's.

## Navigator Validation

All steps run from this package directory and write only under a scratch directory
(`/tmp/cv21-ds10-ts2` unless `DS10_TS2_DIR` says otherwise). Every Grok command runs
with a scratch `HOME` and `GROK_HOME`; the real `~/.grok/auth.json` is read only the
way decision 1 of the plan allows, and never copied or printed. Each step prints
`grok --version`, every `grok` on the `PATH`, and the date first. Raw streams and
`unified.jsonl` excerpts stay under the scratch directory and are not committed.

**Step 0 — static, no model.**

```bash
bash route.sh setup
bash route.sh static
```

Packs the tree, installs it into the scratch prefix, creates and seeds a scratch
Mirror home with no provider key, installs the plugin with US1's step 1, and reads
`grok mcp list --json`, `grok mcp doctor --json`, and `grok inspect --json`.

- Expected observation: the `mirror-mind` server listed from source `plugin`; doctor
  connected with seven tools named `mirror_context`, `list_journeys`,
  `journey_status`, `search_memories`, `list_conversations`, `recall_conversation`,
  `detect_persona`; the server's stderr log empty.
- Pass: doctor connects and counts seven.
- Fail: doctor cannot connect — a stop condition; the sessions do not run until the
  locator's failure under Grok's environment is read.

**Step 1 — the headless sessions.**

```bash
bash route.sh session S1
# only if S1 did not attach:
bash route.sh session S2
bash route.sh session S3
bash route.sh session S4
```

Each shape is a clean scratch `HOME` (S1 the shipped plugin; S2 the locator as a
`[mcp_servers.mirror-mind]` entry with no plugin; S3 a control plugin carrying a
trivial stdio server; S4 the shipped plugin with `.mcp.json` beside its manifest),
and one `grok -p` with the plan's fixed prompt, `--output-format
streaming-messages-json --yolo --max-turns 3 --no-auto-update`, the model from
decision 2.

- Expected observation, per session: `init.mcp_servers` verbatim (name, status);
  the tool calls in order (`search_tool` with query `mirror`; `use_tool` with
  `mirror-mind__list_journeys` when found); `result.result`'s two lines;
  `total_cost_usd` and `usage`; the `unified.jsonl` lines naming `mirror-mind` or
  `mcp`, scrubbed of the scratch path.
- Pass for S1: status `connected`, `FOUND` with the seven `mirror-mind__*` keys,
  `RESULT` with `list_journeys`' answer (an empty list is a valid answer in a seeded
  home with no journeys).
- Fail for S1: any other status, `NONE` on either line, or a `Skipping MCP tool`
  line. Not a route defect: a finding, and the plan's rule says which shapes run next
  and what each outcome means.
- S2–S4 pass or fail by the same fields; the rule reads the four together.

**Step 2 — untouched.**

```bash
bash route.sh untouched
```

- Expected observation: the real `~/.grok` (`config.toml`, `settings.json`, `hooks/`,
  `skills/`, `plugins/`, `rules/`, `installed-plugins/`, `marketplace-cache/`,
  `trusted-hook-projects`), `~/.claude` (`settings.json`, `settings.local.json`,
  `skills/`, `plugins/`), and `~/.config/mirror/env` hash as they did before setup.
  `auth.json` is outside the set: a background token refresh is Grok's normal use.
- Pass: every hash equal.
- Fail: any difference — the route escaped its scratch directory.

Afterwards, `bash route.sh clean` removes the scratch directory and stops any Grok
leader spawned under a scratch `HOME`.

## Validation Evidence

**2026-10-18, grok 1.0.62 (1474f9cbdd91)**, `~/.grok/bin/grok` →
`~/.grok/downloads/grok-1.0.62-macos-aarch64`, package 0.35.0, model grok-4.7 (the one
model `grok models` lists for this account; the config's `grok-build` is not a catalog
id in headless mode and was refused with no model call). Auth by `GROK_AUTH_PATH`,
decision 1; Grok rewrote the real `auth.json` once with its own token refresh.

**Step 0, `static`: 2 passed, 0 failed.** `grok mcp list --json` (the TOML scope) `[]`;
`grok mcp doctor --json`: sources `~/.grok/config.toml` found (0 servers),
`plugin: mirror-mind` found (1); the server `command found (/bin/sh)`,
`server started (0.0s)`, `handshake OK (protocol 2025-11-25)`, `7 tools discovered`,
`healthy: true`; `inspect.mcpServers` names it from source `plugin`; stderr log empty.

**Step 1, S1 (the shipped plugin): ATTACHED**, 4 passed, 0 failed on the pass
condition as folded (two runs, 18:06 and 18:07 UTC). `init.mcp_servers`:
`mirror-mind=pending`; `search_tool {"query":"mirror"}` → `result_count 5`, keys
`mirror-mind__mirror_context`, `__list_journeys`, `__detect_persona`,
`__journey_status`, `__recall_conversation` (a scored search, not a listing);
`use_tool {"tool_name":"mirror-mind__list_journeys","tool_input":{}}` →
`{"type":"MCP","tool_name":"list_journeys","server_name":"mirror-mind","output":{"OkayOutput":"[]"}}`;
`result.result` `FOUND … / RESULT []`; three turns, `stop_reason end_turn`;
`total_cost_usd` 0.02453 then 0.02367 (input 7.7k, cache read 13–15k, output ~240).
The `init` tool catalog carried all seven `mirror-mind__*` keys beside `read_file`,
`search_tool`, `use_tool` in the first run (10 tools) and none in the second (3): the
snapshot is taken at the first output line and races the handshake; both runs answered
`use_tool`. Seams: Grok→server named at init; server→home stderr log empty; tool→data
answered. `unified.jsonl`: `session.setup.phase` `plugin_registry`, `mcp_merge`;
`plugin_refresh` 0 ms; `mcp_wait_ms: 0` at tool prep; no `Skipping MCP tool`; the
installed copy's mtime unchanged by the session (US1's hand-off: a session start does
not touch a local-path copy).

**Step 1, S3 (the control plugin): ATTACHED**, 5 passed, 0 failed.
`ds10-ts2-control=pending` at init, catalog 1/1, `search_tool "ping"` → 1 result,
`use_tool ds10-ts2-control__ping` → `pong`, `total_cost_usd` 0.017628.

**S2 and S4: not run** — the rule required them only if S1 failed. Sessions: 3 real
model sessions (one S1 run before the model id was corrected cost nothing), summed
`total_cost_usd` ≈ 0.066 of the US$ 1.00 ceiling.

**Outcome 1.** No product change. One sentence each in Getting Started's Grok row and
the contract's wiring row; the decisions.md entry.

**Step 2, `untouched`: 109 entries unchanged** (`auth.json` outside the set by design).

**Driver:** `node ts/scripts/checkDocLinks.ts` clean. No code changed, so the suite,
pack, and plugin-build checks were not part of this story's gate; the route's
`control-mcp.mjs` is a fixture in the story package.
