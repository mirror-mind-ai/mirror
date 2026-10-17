# Review — CV21.DS4.TS2

## Status

Reviewed

## Debt Findings

- Deferred: extraction's persist phase is not one transaction; a cut inside the millisecond write window could leave memories without the extracted flag and a retry that duplicates them (pre-existing, narrow, named in the plan's Non-Goals). Recorded, no action: the concurrent-start maintenance race is inherited from extractPending and retitlePending; Gemini CLI and Pi still finalize metadata inside their own exit paths, a design question for DS11's contract refresh; the route defect (entry resolved from the PATH to the published package) was found by the Navigator and paid during validation; finalizeCloseTail is optional on MaintenanceDeps only for pre-existing callers, one wire site.

## Debt Decision

defer

## Defer Reason

The persist window is milliseconds, pre-dates this story, and belongs to extraction, not to the session-end path; pricing it as one transaction is a Change Request, not this story's scope

## Revisit Trigger

A conversation found with duplicated memories after a retry, or the next story that touches runConversationExtraction

## Missing Decision

- none
<!-- ariad-seal sha256:c11c499667b9bf13670869f49887684d2f1d1888bb592ad3e51f6e34a6cdeec3 — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
