# Review — CV22.DS7.US10

## Status

Reviewed

## Debt Findings

- 1. close_stale_orphans is an unbounded spender: AI-05 caps extract_pending, but every stale orphan runs the full close tail with no cap on orphan count (DS8 planning input)
- 2. The close tail pays for a summary it discards: _suggest_tags never reads generated_summary, so the double-summary branch is four calls for zero bytes changed; a one-line Python fix, but a behavior change in the oracle (CR)
- 3. Re-closing a finalized conversation costs three more calls under the close_time profile (refine_candidate); relevant to close_stale_orphans and any retry path (DS8 cost input)
- 4. Two stored-JSON byte divergences (json.dumps separators, mixed ensure_ascii): fixed in slice C' and pinned by goldens — no action
- 5. The TypeScript ledger is unpriced (cost_usd NULL): Python prices through compute_cost, TS never ported the price table; diverges only on a live run with a priced model (DS8 input)
- 6. titleNeedsImprovement measures title.length in UTF-16 units where Python's len() counts code points at the >= 55 boundary; same class as the generateTitle fix (CR)
- 7. repair-journeys --apply is ported but not routed: Python gates it behind the dated zip archive backup produces, which DS7.TS1 ports; one routing line once it lands

## Debt Decision

defer

## Defer Reason

Every finding is parity-preserving today. 1, 3, and 5 are DS8 live-cutover cost inputs; 7 waits on DS7.TS1's backup port; 2 and 6 are CR-shaped behavior changes outside a parity story and are captured as CRs at this Debt Review; 4 was fixed in-story.

## Revisit Trigger

DS8 planning (findings 1, 3, 5); DS7.TS1 done (7); the CRs for 2 and 6 being pulled from the Refinement index.

## Missing Decision

- none
