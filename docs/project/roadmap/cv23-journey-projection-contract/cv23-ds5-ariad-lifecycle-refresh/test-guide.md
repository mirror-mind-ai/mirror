[< CV23.DS5](index.md)

# CV23.DS5 — Ariad Lifecycle Refresh: Test Guide

**Validation owner:** Driver
**Rule:** temporary DBs and synthetic Journey roots only

## Coordinator

- first request with no current projection publishes once;
- represented change publishes one new source revision;
- equal source revision returns `unchanged` with projection/manifest/receipt bytes
  unchanged;
- unknown Journey, compile failure, DS2 publication failure, and explicit
  divergence return bounded `failed` outcomes without raising to mutation;
- unexpected exceptions become generic payload-free publication failures;
- no retry, repair, model, provider, Pi process, or network call occurs;
- latest outcome is inspectable per Journey without document payload;
- concurrent equivalent requests converge safely under DS2.

## Store Boundary

- no configured callback is a no-op;
- configured callback receives only Journey ID;
- callback result is returned for operational use;
- callback exception is swallowed/logged after commit with no private value;
- source transaction has already committed before callback observation.

## Delivery Inventory

For cursor mutations, record callback count and state visible inside callback:

- Pull/active-item change: one request after commit;
- checkpoint, pending confirmation, last event changes: one each;
- cursor clear from represented state: one;
- cadence/limits/flow-unit-only changes: zero;
- idempotent write of the same projected tuple: zero;
- all existing lifecycle tests remain green.

## Explorer Inventory

- story summary, title/status, attractors, experiment, and handoff: one request
  after durable record and runtime mirror commit;
- archive/promote: one after status commit;
- source-conversation evidence only: zero;
- idempotent public update: zero;
- handoff document write plus persisted handoff results in one request, not one
  per file;
- read/show/list/render routes: zero.

## Refinement Inventory

- create story, capture CR, attach, discard: one logical request;
- pull/select/confirm/plan/implement/validate/complete/park/reject/promote CR:
  one request after all story/change/cursor commits;
- park/review/coherence/close Refinement Story: one;
- overview, snapshot, and next-CR recommendation: zero;
- failure before source commit: zero;
- refresh failure after source commit does not change the normal mutation result
  or persisted records.

## End-to-End Synthetic Route

Wire a real temporary `MemoryClient`, register a synthetic Journey root, then:

1. publish initial Operational state;
2. mutate the Delivery cursor and observe a new projection;
3. repeat an equivalent cursor state and observe no byte change;
4. inject publication failure, perform another source mutation, prove DB truth
   committed and previous valid pair remains inspectable;
5. verify diagnostics contain no root, DB path, active document, prompt,
   transcript, environment, or exception payload.

## Gates

```bash
uv run pytest \
  tests/unit/memory/journey_projections/ \
  tests/unit/memory/builder/ \
  tests/unit/memory/services/test_explorer_story.py \
  tests/unit/memory/services/test_explorer_handoff.py \
  tests/integration/memory/journey_projections/
uv run ruff check src/ tests/
uv run ruff format --check src/ tests/
uv run mypy src/memory/journey_projections
uv run python scripts/check_doc_links.py
git diff --check

uv run pytest tests/unit/ tests/integration/ -m "not live"

CONTRACT=/Users/alissonvale/.mirror-journeys/vida-criativa/nautilus/harness/contracts/mirror-journey-projections/v1
(cd "$CONTRACT" && shasum -a 256 -c PROBE-SHA256SUMS)
(cd "$CONTRACT" && python3 -m unittest discover -s tests -p 'test_*.py')
```

Expected: focused gates green; broad suite green except the precisely carried
D-014 timing defect if still present; unchanged kit hashes and all 16 external
self-tests pass.
