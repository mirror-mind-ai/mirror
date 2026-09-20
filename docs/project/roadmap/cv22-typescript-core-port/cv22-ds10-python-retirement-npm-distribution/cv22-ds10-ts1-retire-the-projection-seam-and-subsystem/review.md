# Review — CV22.DS10.TS1

## Status

Reviewed

## Debt Findings

- Extension API VERSION stays 1.1 after api.journey_projections was removed, so the constant advertises a capability that no longer exists.
- Builder lifecycle corpus keeps an unasserted projection_requests field; the reason is written where the assertion was.

## Debt Decision

defer

## Defer Reason

Both belong to stories that own their subject: the Extension API version to CV22.DS10.TS2, which owns the extension runtime boundary, and the corpus to CV22.DS10.TS5, which deletes the Python oracle needed to regenerate it. Paying either here would take another story's decision or rebuild something scheduled for deletion.

## Revisit Trigger

TS2 plan time for the Extension API version; TS5 for the corpus field.

## Missing Decision

- none
