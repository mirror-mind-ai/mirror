# Review — CV21.DS5.TS1

## Status

Reviewed

## Debt Findings

- Five findings. (1) The three DS7 live routes remove agy's credential at 1.3.x's location (.gemini/oauth_creds.json, google_accounts.json); on 1.4.2 it lives at .gemini/antigravity-cli/antigravity-oauth-token, so US4's 'verified absent' passes vacuously: captured as CR144 in RS010. (2) Claude Code's login is keyed to the config dir and to HOME, and /tmp vs /private/tmp are two logins: deferred to TS4, the contract's Claude Code section, version 2.1.296. (3) Three of four models search the disk for a named skill they were not offered, and Codex found the route's copy: recorded in the decision's consequences for US2, no action. (4) The route's first version deleted its own baseline: paid in the story, the baseline now lives beside the scratch directory; this pass checked by mtime, stated in the test guide. (5) Claude Code's scratch login left keychain entry Claude Code-credentials-9784ff54; clean now names it; removal is the Navigator's.

## Debt Decision

defer

## Defer Reason

The one defect outside this story (CR144) is captured in the Refinement index for its own bounded change; the Claude Code login facts belong in the contract, which TS4 writes with the rest of DS5's docs; the remaining findings are recorded where they act (decisions.md, the test guide, the route) and need no further work.

## Revisit Trigger

CR144 when RS010 is next worked or before any DS7 route is re-run on agy; the Claude Code login facts at TS4's plan; the disk-search behaviour at US2's plan.

## Missing Decision

- none
<!-- ariad-seal sha256:98d677a19b00bbf7cce4584aa706b75f1003ebedd31c44f3eb1d7b73ccd9e518 — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
