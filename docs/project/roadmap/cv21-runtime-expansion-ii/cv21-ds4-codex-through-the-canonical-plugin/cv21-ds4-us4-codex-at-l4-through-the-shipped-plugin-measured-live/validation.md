# Validation — CV21.DS4.US4

## Status

Passed

## Automated Checks

- npm test 3256 pass 0 fail after the scope-change fix (5 new tests red first); typecheck, lint, checkDocLinks clean; conversation lifecycle smoke green; route dry run (setup 13/0, dry live, check against nothing)

Checks status: passed

## E2E

Decision: required

Evidence: One live session on Codex 0.163.0 (moved from 0.162.1 under the story), Mirror installed only through the shipped marketplace, the Navigator's real key: US1 install held; skills, Operating Instructions as a developer message (rollout), Mirror Mode and the owed injection (MIRROR MODE ACTIVE x6, hook_injected=1), six messages logged as codex with turn ids, the Mirror form stripped, the $-skill turn absent (TS3), MCP handshake in Codex's log, /mcp 7 tools, list_journeys called directly. SessionEnd not at /quit (the TUI detaches; probe x2 recorded nothing) but when the daemon reaps the idle thread 30 min later (probe payload at 16:44:13); Mirror's TS2 path closed it with the key present: ended_at, inactive, flag, backup, no LLM call. finish: the deferred tail finished for $0.00038; no extraction, by the journey gate (no journey bound). check 20/0 after the reap.

## Navigator Validation

Route: bash route.sh live (four turns, /hooks and /mcp readings), check, probe x2, finish, untouched; screenshots and readings recorded in test-guide.md

Navigator accepted: yes

Expected observation: Everything a Claude Code user has, on Codex, through the plugin alone; the session closed through TS2's path once Codex ends it; the tail finished at the next start

Pass condition: Every hard-evidence line green on the installed Codex, recorded with version, binary, and date; Navigator accepted 2026-10-17

Fail condition: A red line for a Mirror reason not explained and fixed under the named scope change

## Missing Evidence

- none
<!-- ariad-seal sha256:01896a9759f523b3c5d77fd28ffc536df7f730d390b7fda9d7f9fc2df6ac57f4 — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
