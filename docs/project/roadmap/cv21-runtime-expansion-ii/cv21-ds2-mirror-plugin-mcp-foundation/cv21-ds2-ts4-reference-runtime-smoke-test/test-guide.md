[< Story](index.md)

# Test Guide — CV21.DS2.TS4

## Automated Validation

- `bash scripts/smoke_claude_plugin.sh` runs in CI's `smoke` job (`.github/workflows/tests.yml`).
  It covers all six sections, including the missing-`mirror-hook` case and the production
  databases byte-for-byte unchanged.
- `node ts/scripts/buildClaudePlugin.ts --check`: the plugin's skills are in sync with
  `.claude/skills/`.

## E2E Decision

Required, and already performed: CV21.DS12.TS1's live session on Claude Code 2.1.296
(2026-10-13). The Navigator accepted it when DS12 was validated. TS4 adds no new session.

## Navigator Validation

1. Read the Evidence in this story's `index.md`, after implementation records it.
2. Optionally, from the repository root: `bash scripts/smoke_claude_plugin.sh`.
   - **Expected:** sections 1–4 pass (validate, hooks fire and reach the configured home,
     `claude_code` logging, the MCP launcher). Section 5 fails with "no hooks.log line
     after mirror-hook went missing" while a global `mirror-hook` exists in
     `/opt/homebrew/bin`. That is CR123's known case, and CI runs it.
   - **Pass:** every acceptance claim traces to a recorded run with its commit or version
     and date.
   - **Fail:** a claim without a run behind it, or a section failing for another reason.

## Validation Evidence

Pending implementation and validation.
