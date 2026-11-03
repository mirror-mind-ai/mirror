# Review — CV9.DS8.US4

## Status

Reviewed

## Debt Findings

- Carried: (1) runtime_sessions.hook_injected has no reader and four writers (doorman.ts full turn, writeMirrorState activate/deactivate, persistStickyDefaults) — drop the writers in one commit and the column in a later migration. (2) On a checkout-plus-plugin machine Claude Code registers mirror-inject.sh twice (.claude/settings.json and the installed plugin), so the doorman runs twice per turn: two embeddings, the block twice in context — a Change Request candidate (dedupe per turn or a diagnose warning). Noted, no action: the per-turn pre-write snapshot scales with the home (64 MB, ~1 s/turn today).

## Debt Decision

defer

## Defer Reason

Neither item changes US4's measured behavior; the column removal is a migration story, and the double registration is a dev-machine condition that needs its own refinement (dedupe vs. warn) rather than a fix inside a closing story.

## Revisit Trigger

The next runtime_sessions migration (item 1); the next DS8 refinement pass or any user report of doubled Mirror-turn cost (item 2)

## Missing Decision

- none
<!-- ariad-seal sha256:6444cce0dde4a743df44065075bc2f83b2a1a8c4de19fef114b5da0a652afbc1 — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
