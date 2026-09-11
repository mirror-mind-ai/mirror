# Review — CV22.DS8.US2

## Status

Reviewed

## Debt Findings

- Debt PAID in this story: the port's dropped embed-all-then-insert ordering (AI-03/CV9.E2.S9), unreachable under replay and a duplicate-write the moment a live provider is on the other end; extraction's embedding rows never priced; the close-tail metadata rows never priced (found by the live smoke on real data, not by a test); a half-configured replay fixture falling back to Python, which would have spent on the live provider via the other engine. Debt INTRODUCED and carried: CR077 (RS009) -- routing reports 'replay' for a half fixture the runtime then refuses, because the two-fixture rule lives in loggerRuntime rather than the shared spec; safe today, duplicated three more times if US3 copies it. CR076 (RS010) -- the close tail sends the full transcript three times for title/summary/tags, costing as much as extraction plus task extraction combined. Carried from earlier: CR075 (RS010) -- journal's embedding still bypasses generateEmbeddingSafely. Accepted boundaries, documented not coded around: live timeout/auth/rate_limit/provider_error exercised hermetically only; Node's fetch ignores HTTPS_PROXY without NODE_USE_ENV_PROXY=1; no denial-of-wallet guard on the close tail (AI-19 -> DS9), whose per-close spend is bounded by a fixed role count and Python's same retry arithmetic. Process debt, named rather than buried: the plateau-5 push sat red in CI for an hour while I reported it complete, against the project rule to verify Actions after every push.

## Debt Decision

defer

## Defer Reason

CR076 is prompt and orchestration work that must not be smuggled into a cutover story whose contract is byte-for-byte prompt fidelity, and it needs an eval because three narrow prompts may parse more reliably than one wide one. CR077 should be generalised by the third and fourth real two-fixture family rather than designed ahead of them. CR075's fix belongs in the commit that makes journal's call billable.

## Revisit Trigger

CR077 and CR075: CV22.DS8.US3, which adds the remaining two-fixture families and flips journal live. CR076: after DS8 closes, when every surface is live and the ledger shows a full picture of real spend.

## Missing Decision

- none
