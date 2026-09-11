# Validation — CV22.DS8.US2

## Status

Passed

## Automated Checks

- cd ts && npm run typecheck && npm run lint && npm test -- 1927 tests pass; CI green on Tests (5 jobs incl. the new key-absence gate) and Docs

Checks status: passed

## E2E

Decision: required

Evidence: Live OpenRouter, 2026-09-11. Copy: full close tail on 833ab86e -- extraction_status ok, 4 memories at 1536 dims, 10/10 rows priced, bodies withheld, Python's role sequence. Real home: a real unattended Pi session close -- conversation-logger ts exit=0, conversation 6272710d fully processed with 6 memories, all rows priced, ~$0.0118. Group 2 on a copy: one session-maintenance run extracted two conversations, 11 priced rows, embedding counts matching memory deltas exactly (the atomicity contract under a real run). Reverts and half-fixture refusal exercised; lifecycle smoke unchanged under replay.

## Navigator Validation

Route: test-guide.md steps 1-6: live chat smoke; close tail on a copy; real-home session close observed via front-door log and llm_calls; session-maintenance on a copy with two pending conversations; tail-only and family reverts; half-configured replay refusal.

Navigator accepted: yes

Expected observation: engine=ts on the front-door log, extraction_status ok, memories at 1536 dims, every ledger row priced with zero-length prompt/response, reverts routing to Python while the deterministic subcommands stay on TS.

Pass condition: All six steps observed as above; Navigator personally ran and reported the real-home session close.

Fail condition: parse_failed on every role (prompt-layer); unpriced rows; non-empty bodies; partial memories after a failure; a live call under a half-configured fixture.

## Missing Evidence

- none
