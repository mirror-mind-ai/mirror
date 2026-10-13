# Plan — CV21.DS2.TS4

## Objective

Close the reference-runtime smoke test on evidence that already exists, with no code
change. The test is CV21.E2.S4's: the plugin, with its hooks and MCP server, loads and runs
on Claude Code as the standalone `.claude/` setup does, without touching the production
database. Three things already prove it:

- CI's isolated smoke, which runs in full;
- a fresh local run of the same smoke;
- CV21.DS12.TS1's live session on the installed Claude Code.

This story records that evidence in its package, with versions and dates, and says what
is outside it.

## Scope

- **CI.** `scripts/smoke_claude_plugin.sh` runs in CI's `smoke` job (`tests.yml`), all six
  sections. That is, on a copy of the plugin placed where Claude Code would put it:
  1. `claude plugin validate`;
  2. hooks that reach Mirror through `mirror-hook`;
  3. prompts logged as `claude_code`;
  4. the MCP launcher starting the server;
  5. a missing `mirror-hook` that fails no turn and lands one `hooks.log` line;
  6. production databases byte-for-byte unchanged.

  The job was green on `d74b573d`, and only docs changed between that commit and today's
  `HEAD`.
- **Locally, 2026-10-13.** The same script, with Claude Code 2.1.296 present, passes
  sections 1–4. Section 5 fails, and the script stops before 6. This is CR123's known case:
  a global `mirror-hook` (`/opt/homebrew/bin`) is found by the wrapper's fallback, so it
  cannot be made missing on this machine. CI has no global link and passes both sections.
- **Live, CV21.DS12.TS1, 2026-10-13, Claude Code 2.1.296.**
  - The plugin validates and loads as `mirror-mind@skills-dir`: 25 skills, 3 hooks,
    1 MCP server.
  - In a real session the three hooks fire, the Operating Instructions arrive at session
    start, and injection reaches the model on every turn.
  - Mirror Mode answers through the plugin, the 7 MCP tools are available, and the probe
    turn is logged and closed.
  - The real runtime configs and Mirror databases were left untouched.
- **Equivalence with the standalone `.claude/`.**
  - `node ts/scripts/buildClaudePlugin.ts --check` passes: the plugin's skills are
    generated from `.claude/skills/` and are in sync with them.
  - Both setups run the same `claude:*` hook family through `mirror-hook`.
- **Write-up.** The evidence goes in this story's `index.md` and `test-guide.md`.

## Non-Goals

- No code change, no new smoke, and no change to `scripts/smoke_claude_plugin.sh`.
- Not CR123: making the missing-bin case provable on a linked machine is its own Change
  Request, already captured.
- Not the defects DS12 found on Claude Code. Those are sibling stories:
  - TS5, the validator's unquoted-placeholder warnings;
  - US7, the inject hook's explicit path for plugin skill forms;
  - DS2.US3, the plugin status line, dropped.
- Not the sibling stories TS5, US6, US7, and US8, and not Codex or Grok.

## Acceptance Behavior

```text
Given the plugin as plugins/mirror-mind ships it in v0.32.1
When CI's smoke job runs scripts/smoke_claude_plugin.sh
Then all six sections pass, the production databases are byte-for-byte unchanged among them

Given the installed Claude Code 2.1.296 and a scratch configuration and Mirror home
When a real session loads the plugin (CV21.DS12.TS1)
Then its hooks fire, the Operating Instructions and per-turn context reach the model,
  Mirror Mode answers through the plugin, and the MCP server's 7 tools are available
And the real runtime configuration and Mirror databases are untouched

Given the generated plugin and the standalone .claude/ skills
When buildClaudePlugin.ts --check runs
Then they are in sync
```

## Validation Route

E2E: the live session in CV21.DS12.TS1 is the E2E, already accepted by the Navigator when
DS12 was validated. This story adds no new session.

The Navigator reads the evidence in this package's `index.md`. They may re-run
`bash scripts/smoke_claude_plugin.sh` from the repository root. Expect sections 1–4 to
pass, and section 5 to fail on CR123's known case while the global link exists.

- **Pass:** every acceptance claim above traces to a recorded run with its commit or
  version and date.
- **Fail:** a claim without a run behind it, or a smoke section that fails for a reason
  other than CR123's.

## Implementation Contract

- Evidence only: no code, test, script, or configuration file changes.
- Keep changes scoped to `CV21.DS2.TS4`: its `index.md`, `plan.md`, `test-guide.md`, the
  DS2 candidate row at Done, and closure records.
- Do not use `git add .`; commit only story-scoped files.
- Follow the project's development guide: docs/process/development-guide.md.

## Stop Conditions

- scope_change_detected
- plan_rule_conflict
- failing_required_check_without_clear_fix: a smoke section failing for a reason other
  than CR123's
- navigator_decision_needed

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
