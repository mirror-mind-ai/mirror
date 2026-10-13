# Debt Review — CV21.DS2

## Status

review:pay_now

## Summary

Pay now: US8's skipped-reply line in hooks.log is read by runtime diagnose as a hook failure (hook_failures_recorded on one ordinary command turn), so every slash-command turn and Grok's session-end Stop would raise a false warning. Fix: write a line only for a reply lost for no known reason (its turn's prompt neither logged nor skipped as a command: the race); command turns and session-scoped Stops stay silent; tests first, proven by npm test and route.sh static, no new live session. Deferred: the SessionEnd bound without a plugin timeout (Codex 1 s, Grok 1.5 s) can cut the close tail's extraction once a provider key is set, nothing lost (closed first, extracted at the next session start), to DS4 and DS10, revisit when they start or when a conversation is found without its extraction; three Change Requests captured: mirror mcp with no home prints a stack trace, configuration.md's 23 double-encoded dashes, runtime diagnose not running the MCP locator. Routed, no DS2 action: Grok's attachment to DS10 (server ready with 7 tools, sessions created with mcp_server_count 0); Codex's non-Mirror $-skill turns to DS4. A note on DS12's record: its Claude live session ran with the environment shape that let the real config file's provider key in.

## Child Work Packages

- CV21.DS2.TS5
- CV21.DS2.US6
- CV21.DS2.US7
- CV21.DS2.US8

## Boundary

No push or release action is authorized by this checkpoint.
<!-- ariad-seal sha256:cd037e0e61a2625c92ab76a686602b3e496fd280247b42f7ede6afadeca2d782 — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
