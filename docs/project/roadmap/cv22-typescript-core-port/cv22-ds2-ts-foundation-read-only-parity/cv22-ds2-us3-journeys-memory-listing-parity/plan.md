[< Story](index.md)

# Plan — CV22.DS2.US3 Journeys & Memory Listing Parity

## Pull

Pulled at User Story level as the second and final slice of Baton 2 (Vinícius).
US2 ported `detect-persona`; US3 closes the read-only deterministic command set so
CV22.DS2 can reach its plateau and hand back to Alisson for the DS3 front door.

## Prepare

The read-only surface remaining after `search` (US1) and `detect-persona` (US2)
is journeys listing and memory listing. They differ in nature:

- **Journeys** is pure logic over `journey` identity rows (name/status/parent
  extraction + a stable hierarchical sort). This maps cleanly onto the
  detect-persona pattern: a pure TS module + a committed synthetic golden driven
  by the real oracle. CI-gated exact parity.
- **Memory listing** is a SQL read: dynamic `WHERE` from filters, `ORDER BY
  created_at DESC`, `LIMIT`. The database-seam philosophy says the sort belongs to
  SQLite, so the TS unit is a query builder + row→summary mapper, not a JS
  re-implementation of the sort. That makes a pure-JS golden the wrong shape for
  ordering; the ordering is instead proven against a copied DB in the reusable
  harness (agreed **option B**), with CI covering the builder/mapper.

## Scope

- `ts/src/journey/journeyOptions.ts`: `listJourneyOptions` (pure) reproducing
  `list_journey_options` + `_sort_journey_options`. Exported from `index.ts`.
- `ts/parity/generate_journeys_golden.py`: seed synthetic journey rows, run the
  real oracle, commit `ts/test/goldens/journeys.golden.json`.
- `ts/src/memory/listing.ts`: `buildListRecentQuery`, `listRecentMemorySummaries`,
  `countMemoriesByType` over the `Database` seam.
- Extend the reusable harness:
  - `realDbCopyParity.ts` gains `JourneyProbe`, `ListingProbe`, `toProbeResult`,
    `evaluateJourneyProbes` (pure), and `evaluateListingProbes` (reads the copied
    DB through the seam);
  - `real_db_copy_verify.ts` opens the copied DB read-only and renders `== journeys ==`
    and `== memory-listing ==` sections;
  - `real_db_copy_parity.py` emits journey rows/probes, listing probes (filters ×
    limit derived from real data), a `count_by_type` cross-check, and the copied DB path;
  - `generate_demo_memory_db.py` seeds synthetic journeys and diversified
    memory types/layers/journeys so filters demonstrably narrow.
- Add the journeys golden to the CI determinism gate.
- Tests: journey golden parity + units; listing query-builder/mapper units.

## Non-Goals

- Do not route journeys or memory listing to TS (CV22.DS3).
- Do not reproduce SQLite's `ORDER BY` in JS; push it down to the seam.
- Do not port the `--search` listing path (US1 ranker), writes, or schema changes.
- Do not commit or mutate a real production `memory.db`.

## Implementation Approach

1. Read `JourneyService.list_journey_options`/`_sort_journey_options` and the
   `Store` listing methods; port them faithfully (stable sort, tie-break by
   incoming `ORDER BY key` order; exact filter/column/limit semantics).
2. Journeys golden first (real oracle over synthetic rows exercising roots,
   children, status/name ordering, and an orphaned child), then the TS module +
   tests.
3. Listing read model + focused builder/mapper units with a `Database` stub (no
   real SQLite in CI).
4. Extend the harness and demo DB; keep evidence redacted by default.
5. Run the full validation route, including the portable end-to-end.

## Test Strategy

```bash
cd ts && npm run typecheck && npm run lint && npm test

cd ..
uv run python ts/parity/generate_golden.py
uv run python ts/parity/generate_persona_golden.py
uv run python ts/parity/generate_journeys_golden.py
git diff --exit-code ts/test/goldens/

rg 'node:sqlite' ts/src   # only the DB seam

uv run python ts/parity/generate_demo_memory_db.py --out tmp/parity/demo-memory.db
uv run python ts/parity/real_db_copy_parity.py --source-db tmp/parity/demo-memory.db
```

## E2E Decision

E2E through a runtime is **not required**: no runtime route changes. Validation is
command-core parity over synthetic fixtures (journeys golden, builder/mapper units)
plus the portable real-DB-copy route (journeys + listing order). Runtime dogfooding
starts in CV22.DS3.

## Risks And Controls

- **Unstable tie-break.** SQLite `ORDER BY created_at DESC` leaves same-timestamp
  ties unspecified; the journey sort ties on `(status, name)`. Control: the TS
  listing issues the identical SQL to the identical file (both sides agree per
  file), and the journey sort is stable over `ORDER BY key` input, matching
  Python's stable `sorted`.
- **Filter probes that don't narrow.** Control: diversified demo types/layers/
  journeys so `by_type`/`by_layer`/`by_journey` return strict subsets.
- **DB access leaking into the seam rule.** Control: the listing read model
  depends on the `Database` interface; only `ts/src/db/database.ts` imports
  `node:sqlite`; the harness verify script (outside `ts/src`) opens the copied DB.
- **Evidence leak.** Control: redacted-by-default hashes; raw fixtures only under
  ignored `tmp/`; portable demo data is synthetic.

## Validation Route

Pass condition: automated checks green, all three goldens regenerate
deterministically, `node:sqlite` stays seam-only in `ts/src`, and the portable
harness shows identical ordered journey ids, identical listing ids per probe, and
a matching `count_by_type`.

Fail condition: any behavioral mismatch, non-deterministic regeneration, a new
direct `node:sqlite` import in `ts/src` outside the seam, or any need to change
listing/journey semantics rather than port them.

## Checkpoint

Plan approved by the Navigator in session ("The plan looks right. You can go with
B."). Implementation followed this plan; evidence is recorded in
[test-guide.md](test-guide.md).
