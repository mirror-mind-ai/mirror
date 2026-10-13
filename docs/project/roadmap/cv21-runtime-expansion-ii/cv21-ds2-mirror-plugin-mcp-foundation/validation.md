# Validation — CV21.DS2

## Status

passed

## Summary

Accepted by the Navigator on 2026-10-13 on the evidence in test-guide.md, the Codex tool reading included (Codex's log handshake plus its /mcp view, since Codex keeps a plugin's MCP tools behind tool_search). Driver: npm test 3151 pass 0 fail; route.sh static 22/0 on a scratch install (claude plugin validate with no warnings, the MCP entry as written and from a GUI-launch PATH and as each runtime renders it, the six explicit forms returning context, the scripted journey on the three runtime shapes); smoke_npm_package 68/0 and smoke_mirror_mcp green; smoke_claude_plugin green through its MCP step, its step 6 stopping on CR123/CR128 as before. Live, isolated: Claude Code 2.1.296 check 8/0 with the 7 tools named; Codex 0.162.1 check 9/0, server handshake in Codex's log and 7 tools in /mcp, conversation closed at exit; Grok 1.0.52 check 7/0, server ready with 7 tools in Grok's view, attachment left to DS10 (mcp_server_count 0); untouched 3/0. Route defects found and fixed during validation: the real config file leaking into the Claude session, Claude Code's remembered MCP failure, bash 3.2 parsing, and a static step that could not repeat.

## Child Work Packages

- CV21.DS2.TS5
- CV21.DS2.US6
- CV21.DS2.US7
- CV21.DS2.US8

## Boundary

No push or release action is authorized by this checkpoint.
<!-- ariad-seal sha256:56a5a847bbd6efc1973a19dda75889f5c778d939d69d2c015bac173295b959fb — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
