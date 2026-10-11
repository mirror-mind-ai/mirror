# Review — CV22.DS9.TS1

## Status

Reviewed

## Debt Findings

- Two CRs captured, one CR strengthened, four items carried. CAPTURED: CR087 -- journey_status without a slug returns every journey's full document (226KB / ~57K tokens over 21 journeys) while describing itself as returning overall status; decision D9 declined to cap it inside a guard story because there is no count argument to bound, the call crosses no provider, and a byte cap would invent a third response shape. CR088 -- Python embeds attachment-search queries on two paths with no on_llm_call, so every mirror_context call carrying a query spends money that appears in no ledger; TS1 fixed the TypeScript half because a wallet guard cannot bound spend it cannot see, and left the oracle alone. STRENGTHENED: CR084 gained its first unprompted CI reproduction -- a hosted macOS runner lost the bootstrap lock race on a commit touching nothing in that path, and passed on re-run; it was previously only reachable by staging the window by hand. CARRIED: (1) no index on llm_calls(session_id, called_at) -- at 582 rows the window read is sub-millisecond, so an index now would be a TS-authored migration bought on speculation. (2) Agent obedience to refusal text is n=1 per wording; what the two sessions establish is that two specific misreadings are gone and behaviour tracked the text, not that agents obey refusals in general. (3) Caps bound one call, not a sequence: free reads stay unlimited by decision, so an agent can still page a long transcript in several calls of 200 -- recorded in US1's threat model rather than silently closed. (4) The 30s busy_timeout on the ledger write still sits on the agent's response path, parity with Python. PROCESS NOTE, not debt: across this story the measuring instrument was wrong more often than the system under test -- twice in the probe (a truncation that broke its own terminal-wording check, and a key check that read the wrong place) and once in a handed-over command that globbed MCP logs across all projects and reported zero refusals for a session that was demonstrably refused.

## Debt Decision

defer

## Defer Reason

Nothing here blocks closure, and the two findings that could have been absorbed were deliberately not: capping journey_status would have invented a response shape inside a guard story, and fixing Python's ledger omission would have re-baselined a tracked oracle for a surface DS10 deletes. Both are now captured where the work that owns them will read them. The carried items are properties of the design rather than omissions -- the index is speculation at this volume, the n=1 is the honest bound of what one session proves, the per-call cap is a recorded product boundary, and the timeout is parity with Python. Paying any of them here would mix scope into the last story of a Delivery Story that is otherwise ready to close.

## Revisit Trigger

CR087 when a product decision is taken about what a model should receive from journey_status. CR088 at DS10, which either deletes the Python path or must decide to fix it first; it also re-baselines a tracked oracle, so CR086's rule applies. CR084 on the next intermittent CI red in the bootstrap path -- now expected rather than surprising. The llm_calls index when the table passes ~100k rows or the window read measures above 5ms. The n=1 bound whenever an eval probe for refusal obedience is planned. The free-read boundary if exfiltration through repeated bounded calls ever stops being acceptable.

## Missing Decision

- none
