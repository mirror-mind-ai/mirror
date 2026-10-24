# Debt Review — CV21.DS11

## Status

review:defer

## Summary

Navigator agreed 2026-10-24. Deferred, with triggers: (1) pluginWiringFindings holds five runtimes' branches in one function; revisit when the next runtime or finding is added to it. (2) A diagnose finding code is hand-kept in diagnose.ts, REFERENCE, and the contract with no guard tying them; joins DS5.TS4's deferred docs-to-code test, same trigger. (3) The Claude Code status line step relies on CLAUDE_CODE_SESSION_ID, measured on 2.1.310 and not known to be documented by Claude Code; if dropped, the line silently loses the session's mode; revisit at the next Claude Code re-measure or a footer seen without its mode (the contract records the stdin session_id alternative). No action: (4) agy's install command is built in three places, as Codex's and Grok's are, each tested; (5) route.sh repeats earlier routes' helpers, deliberately self-contained evidence. Paid in the story: the route's untouched check (WAL read, total-count test) and the TUI driver waiting for the input box. Found, not DS11's, captured: CR166 (a plain-language journey switch strands its turn), CR167 (the status line shows another session's journey), CR168 (Pull invents a placeholder story for a package-less DS); CR100 gains the CLAUDE_CODE_SESSION_ID lead.

## Child Work Packages

- CV21.DS11.TS1
- CV21.DS11.US2
- CV21.DS11.TS3
- CV21.DS11.TS4

## Boundary

No push or release action is authorized by this checkpoint.
<!-- ariad-seal sha256:6b45820cb717ae6e13a8cfb9a6e2d4ffd3bba3b573bc2de0eaf385b318928dfc — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
