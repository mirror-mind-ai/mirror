# Review — CV21.DS8.US1

## Status

Reviewed

## Debt Findings

- No debt from this story's own work (the gemini-cli guard row's split is planned, US2 completes it). Two pre-existing findings: (1) npm run typecheck is red on main — ts/src/hooks/agy.ts:66 returns an AgyPayload without transcriptPath (DS7.TS3), and typecheck is a CI gate; outside this story's scope (agy.ts is a named non-goal). Navigator decision: pay it in its own out-of-scope one-line commit right after this story closes, not through this story's Refactor loop. (2) smoke_claude_plugin.sh step 6 cannot run on a machine with a global Mirror install (the wrapper's GUI-launch bin fallback finds /opt/homebrew/bin/mirror-hook); CI unaffected. Recorded as D-031 in docs/project/debt.md.

## Debt Decision

defer

## Defer Reason

Both findings predate this story and sit outside its scope (agy.ts and the plugin wrappers are named non-goals). The typecheck fix is one field and is paid immediately after close in a separate commit; the smoke's non-hermeticity is low severity, local-only, and carried as D-031.

## Revisit Trigger

Typecheck: the commit that follows this story's close (paid). D-031: the next change to the plugin wrappers' bin search, or the next time a Driver needs smoke_claude_plugin green locally.

## Missing Decision

- none
<!-- ariad-seal sha256:58c240a4ff367c629d093865fb0a5951f4d823e637b8bb26118e987c30b30c78 — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
