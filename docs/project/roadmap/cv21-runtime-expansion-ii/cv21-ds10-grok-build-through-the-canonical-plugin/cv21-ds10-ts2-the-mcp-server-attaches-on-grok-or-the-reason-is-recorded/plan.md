# Plan — CV21.DS10.TS2

## Objective

Settle DS12.TS4 L6, sharpened by DS2 and carried here by its Debt Review: Grok starts
the plugin's MCP server, shows it `[ready] · 7 tools` in its own MCP view, and still
creates every session with `mcp_server_count: 0`, the model offered Grok's built-in
tools and none of Mirror's. Either the server attaches to the model's session on the
installed Grok, through the install US1 ships, and the seven tools are reachable —
or the cause is named with evidence and the fallback decided. decisions.md records
which, and US3's live session inherits an answer rather than a question.

Three things make this measurable now that it was not in October's two sessions:

- **US1 made the server visible.** On today's tree Grok read the name-only root
  marker and listed no MCP server at all; since 2026-10-18 the marker carries
  `mcpServers`, and `grok inspect --json` lists `mirror-mind`, transport `stdio`,
  source `plugin:mirror-mind` (US1 step 3).
- **Grok reaches MCP tools through two meta-tools.** Its guide (`07-mcp-servers.md`,
  "Tool Discovery"): the model has `search_tool` and `use_tool`, and calls an MCP tool
  by its catalog key `server__tool` — `mirror-mind__list_journeys`. A model asked
  "which tools do you have" lists the built-ins, as Codex did behind `tool_search`
  (DS4.US4). DS12's and DS2's probes asked for a NONE/FOUND answer without naming the
  meta-tools; the symptom may be the indirection, not an attachment failure.
- **Grok's headless mode reports attachment by field.** `grok -p "…" --output-format
  streaming-messages-json` emits a `system`/`init` line whose `mcp_servers[].status`
  is one of `connected`, `failed`, `needs-auth`, `pending`, `disabled`, then every
  `tool_use` and `tool_result` block, then a `result` line with `total_cost_usd` and
  `usage` (`14-headless-mode.md`, "streaming-messages-json"). The session's own
  `~/.grok/logs/unified.jsonl` holds the MCP connection lines and any
  `Skipping MCP tool` rejection. No TUI, no screenshot, no reading over a shoulder.

The catalog admission rules are checked against the names first: `mirror-mind` starts
with a letter and holds only letters and a hyphen; the seven tool names
(`mirror_context`, `list_journeys`, `journey_status`, `search_memories`,
`list_conversations`, `recall_conversation`, `detect_persona`) are letters and
underscores; every key has exactly one `__` and is far under 256 characters. On paper,
nothing is rejected.

## Scope

**Step 0 — static, no model, no auth** (`bash route.sh static`). In a scratch
`HOME`/`GROK_HOME` with the plugin installed by US1's step 1 and the scratch Mirror
home created by `mirror init` + `seed` (no provider key): `grok mcp list --json`,
`grok mcp doctor --json` (the handshake and the tool count Grok itself reads), and
`grok inspect --json` `mcpServers`. Recorded: whether doctor connects, how many tools
it reads, and what the server's stderr log holds. DS2 saw doctor read 7 tools on
1.0.52; this re-measures on 1.0.62 through the shipped install.

**Step 1 — four headless sessions, one prompt** (`bash route.sh session <shape>`;
model calls, tokens spent, auth needed — see decision 1). Each shape is a clean scratch
`HOME`; each session is `grok -p <prompt> --output-format streaming-messages-json
--yolo --tools read_file --max-turns 4 --reasoning-effort low --no-auto-update`, with
`-m` set explicitly to the cheapest model the account offers and
`DISABLE_AUTOUPDATER=1` in the environment, from the scratch project. `--yolo`
auto-approves tool execution; `--tools read_file` leaves the model one harmless
built-in beside the two MCP meta-tools, so what is approved is exactly what is measured
(security review, amendment 3). The prompt is fixed, deterministic, and names only
read-only tools:

```text
Do exactly these steps and nothing else.
1. Call search_tool with the query "mirror".
2. If a tool named mirror-mind__list_journeys is in the results, call it through
   use_tool with tool_input {}.
3. Reply with two lines only: "FOUND <the qualified tool names from step 1, comma-
   separated, or NONE>" and "RESULT <the first 80 characters of step 2's result, or
   NONE>".
```

Read from the stream, by field — every line parsed as JSON, fields selected, never
redacted (amendment 5): `init.mcp_servers[]` (name and status), every `tool_use` block
(name and input), every `tool_result` block, `result.result`, `result.total_cost_usd`,
`result.usage`; from `unified.jsonl`, each line parsed, the `msg` and `ctx` of lines
naming `mirror-mind` or MCP (connection, tool count, `Skipping MCP tool`, the plugin
auto-update scan at session start — US1's open hand-off, closed here, amendment 7).
Three seams are asserted per session (amendment 4): Grok to server (`init` and the
connection line), server to Mirror home (the server's stderr log under the scratch
`~/.grok/logs/mcp/`: empty, or its one-line message), and tool to data (the `use_tool`
result block). How the locator resolved `mirror` — through `PATH`, `MIRROR_BIN`, or a
fixed directory — is recorded from the same lines: Grok's spawn environment for MCP
servers has not been measured, and a GUI launch asks the same question. The shapes:

| Shape | What it carries | What it discriminates |
|---|---|---|
| S1 — the shipped plugin | US1's step 1, the server from the manifest/marker `mcpServers` | the question itself |
| S2 — the TOML route | no plugin; the same locator as `[mcp_servers.mirror-mind]` in `~/.grok/config.toml` (`command = "/bin/sh"`, the manifest's `args`) | Grok's native route; the fallback candidate |
| S3 — a control plugin | a scratch plugin whose manifest `mcpServers` names a 40-line stdio server (`route/control-mcp.mjs`: `initialize`, `tools/list` with one `ping` tool, `tools/call`), installed with `--trust` | "plugin-carried servers never attach" from "Mirror's does not" |
| S4 — the shipped plugin plus `.mcp.json` | US1's shape with a `.mcp.json` holding the same entry (the guide's plugin MCP component: "Trusted plugin `.mcp.json` servers attach to the session like other MCP config") | whether Grok attaches only what `.mcp.json` declares |

**The pass condition is the blocks, not the model's sentence** (amendment 1): the
`search_tool` result block holds the seven `mirror-mind__*` keys and a `use_tool`
block naming `mirror-mind__list_journeys` is answered by a result block. `init`
`connected` and `pending` are both "not failed" (the guide: servers still handshaking
are `pending` at `init`); `failed`, `disabled`, and `needs-auth` are decisive on their
own. `FOUND`/`RESULT` are a tiebreak. **S1 and S3 always run, S3 as the control beside
the question** (amendment 2); S2 and S4 only if S1 does not attach.

**The decision rule** (approved with this plan; the result is recorded in
decisions.md and does not come back for a second approval except where marked):

1. **S1 attaches** (`init` status `connected`, `search_tool` returns the seven
   `mirror-mind__*` keys, `use_tool` answers): no product change. The record says the
   October symptom was the meta-tool indirection, the count at session start is
   whatever S1's `unified.jsonl` shows it to be, and a user reaches Mirror's tools the
   way Codex users do. Getting Started's Grok row and the contract's wiring row gain
   one sentence naming `search_tool`/`use_tool`, as DS4 wrote `tool_search` for Codex.
2. **S1 fails and S4 attaches**: the plugin ships `.mcp.json` generated from the one
   source beside the manifest and the marker, drift-guarded; US1's `guards` route is
   re-run so Claude Code, agy, Codex, and Grok each still see **one** server. If any
   sees two, the entry moves rather than doubles — a Navigator decision, since it
   touches what Claude Code reads.
3. **S1 and S4 fail and S2 attaches**: plugin-carried servers do not attach on
   1.0.62. The fallback is a third `init` step for Grok — `grok mcp add mirror-mind --
   /bin/sh -c '<locator>'`, which writes the TOML entry — or a documented gap.
   **Navigator decision** before anything is printed: the DS held Grok to Codex's two
   steps, and a third is a scope change.
4. **Nothing attaches, S3 included**: headless mode is not the TUI's attachment path,
   or the scratch environment blocks it. Recorded; US3's TUI session is the measure,
   with the same prompt typed by the Navigator.

**What changes in code** depends on the outcome and is bounded by the rule: outcome 1
changes two doc rows and decisions.md; outcome 2 changes `claudePlugin.ts`, its test,
`buildClaudePlugin.ts --check`, the pack-contents guard, and re-runs US1's `guards`;
outcomes 3 and 4 stop for the Navigator. Whatever the outcome, the DS10 package's
TS2 row, the CV21 row, and decisions.md are written, and the test guide carries every
session's `init` status, tool calls, and `total_cost_usd`.

**The story package.** `route.sh` with `setup` (its own scratch directory,
`/tmp/cv21-ds10-ts2`; pack, install into a prefix, the real-config baseline), `static`,
`session <S1|S2|S3|S4>`, `untouched`, `clean`; `control-mcp.mjs` beside it. Auth per
decision 1; raw streams and `unified.jsonl` excerpts stay under the scratch directory
(they carry the session id, the scratch paths, and the auth scope URL — never a
token, which `unified.jsonl` does not log, and which the route never reads from
`auth.json`); the test guide records the summaries.

## Non-Goals

- A TUI session, Mirror Mode, the `grok_build` logging, the rule followed by the
  model, the 1.5 s close: US3. TS2 spends tokens on the MCP question alone, in
  headless mode, with a fixed prompt.
- Changing the locator itself, the server's tools, or the hook wrappers. If S3
  attaches and S1 does not with the same transport, the difference is in what Grok
  reads from the plugin, not in the server — and that is outcome 2.
- README, REFERENCE, the contract's Grok reference implementation: TS4, which folds
  this story's one sentence in with the rest.
- `grok mcp add` as a printed step before outcome 3 is decided.
- Any write outside the scratch directory. The real `~/.grok` is read for `auth.json`
  only, and only the way decision 1 allows.

## Acceptance Behavior

```text
Given the plugin installed by US1's step 1 in a scratch HOME on the installed Grok
When grok mcp doctor --json runs
Then it reports the mirror-mind server connected with seven tools

Given the same HOME, and a headless session with the fixed prompt
When the stream is read by field
Then init.mcp_servers names mirror-mind with a status (connected or not), the
     tool_use blocks show search_tool and, when found, use_tool, and result.result
     reads FOUND <keys> / RESULT <text> or NONE / NONE
And result.total_cost_usd and result.usage are recorded

Given S1 did not attach
When S2, S3, and S4 run with the same prompt
Then the decision rule names exactly one outcome, and decisions.md records the
     four init statuses side by side with version, binary, date, and model

Given the outcome is 1
When the story closes
Then Getting Started's Grok row and the contract's wiring row say Mirror's tools are
     reached through search_tool and use_tool, and nothing in the product changed

Given the outcome is 2
When the story closes
Then the plugin ships .mcp.json generated from the one source, --check holds it,
     and Claude Code, agy, Codex, and Grok each still see exactly one MCP server
```

## Validation Route

**Automated (Driver).** `node ts/scripts/checkDocLinks.ts` always; `npm run typecheck`,
`npm run lint`, `npm test`, `node ts/scripts/checkPackContents.ts`, and
`node ts/scripts/buildClaudePlugin.ts --check` when code changes (outcome 2).

**Navigator, step 0 — static.** `bash route.sh setup`, then `bash route.sh static`.
Expected: `grok mcp doctor --json` connected, seven tools; `inspect` lists the server;
the stderr log empty or explaining itself. Fail: doctor cannot connect — then the
locator fails under Grok's own environment and the sessions are not run until it is
read (a stop condition).

**Navigator, step 1 — the sessions.** `bash route.sh session S1`, then S2–S4 only if
S1 does not attach. Each prints: `grok --version`, the model, `init.mcp_servers`
verbatim, the sequence of tool calls, `result.result`, `total_cost_usd`, and the
`unified.jsonl` lines naming `mirror-mind` or `mcp`, scrubbed of the scratch path.
Expected: S1 `connected`, `FOUND` with seven keys, `RESULT` with `list_journeys`'
answer (an empty list in a seeded home with no journeys is a valid answer). Fail: any
status other than `connected`, `NONE` on either line, or a `Skipping MCP tool` line —
each a finding, not a defect of the route, and the rule says what follows.

**E2E decision:** required, and step 1 is it: the installed Grok, the shipped
install, a real model, read by field. The TUI is US3's.

**Step 2 — untouched.** `bash route.sh untouched`: the real `~/.grok` configuration
(`config.toml`, `settings.json`, `plugins/`, `rules/`, `installed-plugins/`,
`marketplace-cache/`) and `~/.claude` hash as before. `auth.json` is outside the set:
Grok refreshes tokens in the background, and a refreshed token is normal use, not a
write by the route.

## Implementation Contract

- Decision 1 (auth) is taken before any session runs; S1 runs before S2–S4; the rule
  picks the outcome; outcomes 3 and 4 stop.
- Tests first for outcome 2: `claudePlugin.test.ts` (the `.mcp.json` text equals the
  manifest's `mcpServers`; the tree's copy equals the generated text),
  `packContents.test.ts`.
- Keep changes scoped to `CV21.DS10.TS2`: the files the outcome names and this story
  package. No hook, locator, tool, or `AGENTS.md` change.
- Do not use `git add .`; commit only story-scoped files.
- Follow the project's development guide: docs/process/development-guide.md.

## Stop Conditions

- No auth route agreed (decision 1), or the account answers "usage limit" as DS2's
  first attempt did (navigator_decision_needed: when to retry, or which account).
- `grok mcp doctor` cannot connect in step 0 (navigator_decision_needed: the locator
  under Grok's environment is DS2.US6's surface, not this story's).
- Outcome 3 (a third step or a gap) or outcome 4 (nothing attaches headless).
- More than four sessions, or `total_cost_usd` summed above US$ 1.00 (decision 2).
- The installed `grok` changes version before step 1 (re-probe; 1.0.62 is the
  measured one).
- scope_change_detected, plan_rule_conflict, failing_required_check_without_clear_fix.

## Decisions Taken At Approval

Approved by the Navigator on 2026-10-18, as recommended, with amendments 1–9 of the
plan review (ai-engineer, security-engineer, quality-assurance, devops-engineer,
engineer) folded into Scope above:

1. **Auth: `GROK_AUTH_PATH=~/.grok/auth.json` in the session's environment** — the
   real credential file read in place (Grok names the variable in its own logs),
   nothing minted, nothing copied into the scratch directory, the scratch `HOME`
   otherwise clean; a background token refresh may rewrite the real file, which is
   normal use. The route never reads `auth.json`'s contents and never writes a token
   to evidence. Not chosen: a device-code login inside the scratch `HOME` (a new
   token left in `/tmp` until `clean`), an API key in the environment (printed by the
   route's own `$ …` echo).
2. **Model and budget:** `-m` the cheapest model the account offers, `--reasoning-effort
   low`, `--max-turns 4`; at most four sessions, and a ceiling of **US$ 1.00** summed
   over `total_cost_usd` — a stop condition, not a target. The control plugin is
   inert (one `ping` tool returning a constant) and installed only in a scratch
   `HOME`; the prompt names read-only tools only.
3. **The Driver runs step 1** under decision 1, printing the per-session summary the
   Navigator reads: shape, model, `init.mcp_servers`, the tool calls in order, the
   three seams, `result.result`, `total_cost_usd`, `usage`.
4. **Outcome 2, if reached:** `.mcp.json` is generated by `claudePlugin.ts` from
   `MCP_ENTRY` and pinned by test to `buildManifest().mcpServers`, as the agy map is;
   no hand-written JSON (amendment 9). **Outcome 3, if reached:** a pasted TOML snippet
   rather than a quoted 700-character `grok mcp add` line — decided then, not now.

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
