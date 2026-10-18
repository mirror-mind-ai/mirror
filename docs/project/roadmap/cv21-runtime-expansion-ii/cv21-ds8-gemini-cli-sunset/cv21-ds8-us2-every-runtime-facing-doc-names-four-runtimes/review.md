# Review — CV21.DS8.US2

## Status

Reviewed

## Debt Findings

- No debt from this story's own work. One pre-existing finding: plugins/mirror-mind/rules/AGENTS.md:189 links REFERENCE.md relative to the repo root, which does not resolve under rules/ — the file is a byte copy of AGENTS.md held equal by the claude-plugin guard, so checkDocLinks.ts (the docs CI job) has reported it since DS7.US1 (947179ef). Navigator decision: pay it in its own out-of-scope commit right after this story closes, as a link-checker exemption for the generated copy (narrowest shape: nothing a runtime reads changes), not through this story's Refactor loop. Also noted, paid inside this story because it was US1's consequence: the CV8.E3 history package linked to the deleted smoke; the link is now inline code.

## Debt Decision

defer

## Defer Reason

The finding predates DS8 and sits in the plugin generator / link checker, outside this story's scope (a docs sweep). The fix is one exemption and is paid immediately after close in a separate commit.

## Revisit Trigger

The commit that follows this story's close (paid). If that commit is not made: the next change to AGENTS.md's footer or to checkDocLinks.ts.

## Missing Decision

- none
<!-- ariad-seal sha256:e8d6f87649c1b1daab917a32c1be8873b7fa2b14317be14c7ffb84af95657101 — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
