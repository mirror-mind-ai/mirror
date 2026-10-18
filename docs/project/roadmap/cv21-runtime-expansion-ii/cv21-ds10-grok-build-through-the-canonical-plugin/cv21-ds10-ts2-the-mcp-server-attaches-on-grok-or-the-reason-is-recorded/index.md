[< CV21.DS10 Grok Build Through The Canonical Plugin](../index.md)

# CV21.DS10.TS2 — The MCP server attaches on Grok, or the reason is recorded

**Status:** ✅ Done
**Type:** Technical Story
**Delivery Story:** CV21.DS10 — Grok Build Through The Canonical Plugin

---

## Technical Story

In order to let US3 measure Grok's honest parity with an answer about MCP rather than
a question,
As the Driver of DS10,
I want to know whether Grok attaches the plugin's MCP server to the model's session
through the install `mirror init` prints, and the seven tools are reachable through
Grok's `search_tool` and `use_tool` — or, if not, why, with the fallback decided,
So that a Grok user is told what Mirror's MCP tools do on their runtime, and nothing
in CV21's parity claim rests on a symptom read over a shoulder.

## Outcome

DS12.TS4 L6 is closed one way or the other. The shipped install is read statically
(`grok mcp doctor --json`) and then through headless sessions whose stream reports
`init.mcp_servers[].status` by field and every tool call as a block. One fixed prompt
asks the model to call `search_tool` for "mirror" and `use_tool` on
`mirror-mind__list_journeys`. If the shipped plugin attaches, the October symptom was
the meta-tool indirection and the docs say how Mirror's tools are reached; if it does
not, three further shapes — the same locator in `config.toml`, a control plugin with
a trivial server, the plugin with `.mcp.json` beside its manifest — discriminate the
cause, and a stated rule picks the fallback: a generated `.mcp.json` (bounded,
re-checked for one server on every runtime), or a Navigator decision on a third step
or a documented gap. decisions.md records the sessions side by side with version,
binary, date, model, and cost.

## Acceptance Behavior

```text
Given the plugin installed by US1's step 1 in a scratch HOME on the installed Grok
When grok mcp doctor --json runs
Then it reports the mirror-mind server connected with seven tools

Given the same HOME and a headless session with the fixed prompt
When the stream is read by field
Then init.mcp_servers names mirror-mind with its status, the tool_use blocks show
     search_tool and, when found, use_tool, and result.result reads
     FOUND <keys> / RESULT <text> or NONE / NONE, with total_cost_usd recorded

Given the sessions the decision rule required
When the story closes
Then decisions.md names one outcome, and the product change (none, or a generated
     .mcp.json seen as one server by Claude Code, agy, Codex, and Grok) is in place
```

## Scope

- The static read and the headless sessions, the four shapes and the decision rule —
  in [plan.md](plan.md).
- Outcome 1: one sentence in Getting Started's Grok row and the contract's wiring row.
- Outcome 2: `ts/src/guards/claudePlugin.ts` generates `.mcp.json`; `--check`, the
  pack-contents guard, and US1's `guards` route re-run.
- decisions.md, the DS10 candidate row, the CV21 row.
- The story `route.sh` (`setup`, `static`, `session`, `untouched`, `clean`) and
  `control-mcp.mjs`.

## Out Of Scope

- A TUI session, Mirror Mode, logging, the rule's effect on the model, the 1.5 s
  close (US3); README, REFERENCE, the contract's Grok reference implementation (TS4).
- Changing the locator, the server's tools, or the hooks.
- A third `init` step before the Navigator decides it (outcome 3).

## Validation

Driver: `checkDocLinks`; the suite, pack, and plugin-build checks when code changes.
Navigator: `route.sh static`, `route.sh session S1` (then S2–S4 if S1 does not
attach), `route.sh untouched` — details in [test-guide.md](test-guide.md).
