# Review — CV22.DS2.US2

## Status

Reviewed

## Debt Findings

- The real-DB-copy persona probes are derived from each persona's own routing keywords (guaranteed hits) plus a single no-match probe. This proves the matcher runs against real routing metadata, but it does not exercise cross-persona interference on real data (a query that should hit one persona but not a keyword-adjacent other).

## Debt Decision

defer

## Defer Reason

The committed synthetic golden already covers cross-persona interference, ties, and the substring-vs-token distinction with exact behavioral parity; the real-DB-copy route's role is realism of the routing metadata, which the derived + no-match probes establish. Richer real-data interference probes are valuable but not required to close US2.

## Revisit Trigger

When `detect-persona` is routed through the Pi TS front door (CV22.DS3), or if a real-DB persona parity mismatch is ever observed, add interference probes that assert a query hits the intended persona and not a keyword-adjacent one.

## Missing Decision

- none
