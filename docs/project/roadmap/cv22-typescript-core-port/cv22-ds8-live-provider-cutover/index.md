[< Parent](../index.md)

# CV22.DS8 — Live-Provider Cutover

**Status:** 🟡 Planned
**Type:** Delivery Story

---

## Outcome

The sixteen leaves DS5 and DS7 ported behind the replay transport answer from
TypeScript **in production** — against real OpenRouter calls, with the user's
real key — so that an unconfigured install no longer keeps Python for any
LLM- or embedding-crossing command. The TS `LlmTransport` gains its `live`
mode (chat + embeddings + credits) designed to the AI-18 contract: per-role
timeouts, bounded retries, an error taxonomy, metadata-only logging, and
secrets that never leave env/config.

This is the first Delivery Story in CV22 where a defect reaches a provider
rather than a golden. Every child story above a small slice carries a
multi-persona Plan review with **security-engineer and ai-engineer mandatory**
(see [collaboration strategy](../collaboration-strategy.md)).

## Why this order

Traffic. The `llm_calls` ledger on the owner's home says the live surfaces are
the search embedding (`embedding`, 171 rows) and the conversation close tail
(`conversation_title` 158, `summary` 23, `tags` 23, `extraction` 21,
`task_extraction` 21). Everything else has no recorded live traffic. The
embedding call is also the simplest provider shape (one POST, one vector, a
smoke contract of dimension + finiteness + self-similarity), so it goes first
and carries the shared transport; chat follows on the close tail; the long
tail of twelve low-traffic leaves flips last, in one review.

## Candidate Stories

| Code | Story | Type | Outcome | Status |
|------|-------|------|---------|--------|
| [CV22.DS8.US1](cv22-ds8-us1-live-provider-cutover/index.md) | Live transport substrate + live embeddings + `memories --search` cutover | User Story | A fresh semantic search from the real home answers from TS against a live OpenRouter embedding, with the ledger row priced like Python's; `MIRROR_TS_SEARCH=0` reverts | 🟡 Planned |
| CV22.DS8.US2 | Live chat completions + conversation close-tail cutover | User Story | `switch`, `session-end-pi`, `session-end`, `session-start` (full), `session-maintenance` answer from TS against live chat calls with extraction-tier timeout, cost authority on ledger rows, and a live chat smoke contract | 🟡 Planned |
| CV22.DS8.US3 | Long-tail cutover and gate consolidation | User Story | `consult credits\|ask`, `mirror load --query` (reception timeout), `consolidate scan\|apply`, `shadow scan`, `soul harvest save`, `journal`, `week plan`, `descriptor generate` flip to live; `MIRROR_TS_EXTERNAL_ROUTES` retired as a required gate; the `descriptor` ledger-gap decision recorded | 🟡 Planned |
| CV22.DS8.TS1 | `eval` runner ownership decision | Technical Story | `python -m memory eval` (`evals/`, ~3.2k lines, developer-only) is either ported to a TS eval harness against the live transport or retired with a documented cutoff; decision recorded near the roadmap by the port owner | 🟡 Planned — decision open |

US2 and US3 are authored as candidates; their packages materialize on pull.

## Done Condition

- All sixteen replay-gated leaves in the burn-down ledger's "Ported and
  graded — replay-gated" table answer from TS with no replay configuration
  set and no `MIRROR_TS_EXTERNAL_ROUTES` requirement; the ledger section is
  emptied and the leaves move to their family rows as flipped-ungated.
- The `live` transport enforces per-role timeouts, bounded retries, and the
  `timeout | auth | rate_limit | malformed_output | provider_error` taxonomy,
  with a test per class and no test that reaches the network.
- API keys come only from env/config, are never accepted as argv, never
  written to any log or ledger row, and are redacted from every error message.
- Each live surface has a Navigator-run smoke contract (never CI) recorded in
  the story package's validation evidence.
- Every family keeps a single-variable revert to Python until DS10 deletes it.
- The `eval` ownership decision is recorded.
