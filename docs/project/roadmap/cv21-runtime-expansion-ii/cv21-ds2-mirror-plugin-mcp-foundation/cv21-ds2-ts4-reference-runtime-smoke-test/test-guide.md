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

**Validated by the Navigator on 2026-10-13**, against the Evidence table in `index.md`.

- **Accepted.** The Navigator accepted that the claim "production untouched" rests on
  CV21.DS12's content-level check of the real databases after the live session (row 8).
  No smoke run proves it: CI's guard checks zero databases, and the local run stops
  before the guard (rows 5 and 6).
- **Deferred.** That gap in the smokes was deferred at Debt Review and captured as
  [CR128](../../../../refinement/rs010-cv22-oracle-and-port-hygiene/cr128-the-smokes-production-guard-checks-no-database-in-ci.md).
- **Checks.**
  - CI's smoke job is green: run 38304396661 on `d74b573d`, with docs-only changes since.
  - The local smoke, 2026-10-13 16:13 UTC, Claude Code 2.1.296, passes sections 1–4.
    Section 5 fails on CR123's known case, as the Plan expected.
  - The plugin generator's drift check is in sync.
