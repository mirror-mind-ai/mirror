[< Story](index.md)

# Test Guide — CV22.DS2.US3 Journeys & Memory Listing Parity

## Automated Validation

From the `ts/` package:

```bash
cd ts
npm run typecheck
npm run lint
npm test
```

Regenerate all three synthetic goldens and verify determinism:

```bash
cd ..
uv run python ts/parity/generate_golden.py
uv run python ts/parity/generate_persona_golden.py
uv run python ts/parity/generate_journeys_golden.py
git diff --exit-code ts/test/goldens/
```

Check the `node:sqlite` driver-seam rule:

```bash
rg 'node:sqlite' ts/src
```

Expected result: only `ts/src/db/database.ts` imports `node:sqlite` in production TS source.

## Portable Real-DB-Copy Parity (search + persona + journeys + listing)

No private mirror required. The demo DB carries synthetic memories (diversified
types/layers/journeys), persona routing rows, and journey identity rows; the
harness copies it before reading, runs the TS listing read model over the copy
through the seam, and prints redacted evidence by default.

```bash
uv run python ts/parity/generate_demo_memory_db.py --out tmp/parity/demo-memory.db
uv run python ts/parity/real_db_copy_parity.py --source-db tmp/parity/demo-memory.db
```

To validate against a real database instead, point `--source-db` at a copy of a
real `memory.db` (never the live file). Evidence stays redacted unless
`--debug-sensitive-output` is passed; generated fixtures stay under ignored `tmp/`.

## Navigator Validation

Route:

1. Review `ts/src/journey/journeyOptions.ts` against `JourneyService.list_journey_options`,
   and `ts/src/memory/listing.ts` against `Store.list_recent_memory_summaries`/`count_memories_by_type`.
2. Run the automated validation commands.
3. Run the portable real-DB-copy route and inspect the redacted evidence.

Expected observation: TS reproduces the Python oracle's journey options/order on
the committed golden, and reproduces the ordered listing ids per probe (plus a
matching `count_by_type`) on the copied DB.

Pass condition: all automated checks pass, all three goldens regenerate
deterministically, the seam check passes, and real-DB-copy parity shows identical
journey ids and identical listing ids.

Fail condition: journey/listing output diverges, fixture regeneration changes
committed goldens unexpectedly, a new `node:sqlite` import appears in `ts/src`
outside the seam, a real production DB is mutated, or the implementation changes
semantics instead of porting them.

## Validation Evidence

Automated validation run during implementation (from `ts/`):

```text
npm run typecheck  -> OK
npm run lint       -> Checked 18 files. No errors.
npm test           -> tests 53, pass 53, fail 0
```

New suites: `ts/test/journey/journeyOptions.test.ts` (golden parity + units:
name/status extraction, key fallback, active-before-inactive and name ordering,
child grouping, orphan-as-root, malformed metadata) and
`ts/test/memory/listing.test.ts` (query-builder clause order/params, column
projection, row→summary mapping with raw tags preserved, `count_by_type` mapping).
The harness suite adds `toProbeResult` redaction and journey-probe replay/divergence.

Golden determinism (regenerate is a no-op for all three):

```bash
uv run python ts/parity/generate_golden.py
uv run python ts/parity/generate_persona_golden.py
uv run python ts/parity/generate_journeys_golden.py
git diff --exit-code ts/test/goldens/   # -> clean
```

Production TS source seam check: `rg 'node:sqlite' ts/src` -> only `ts/src/db/database.ts`.
Whitespace: `git diff --check` -> clean.

Portable real-DB-copy parity (redacted, default output):

```text
== search ==          overall_match: true   (5/5)
== detect-persona ==  overall_match: true   (4/4)
== journeys ==        overall_match: true   (journeys_all, 4 ordered ids)
== memory-listing ==  overall_match: true
  listing_recent_all    result_count: 5   match: true
  listing_small_limit   result_count: 3   match: true
  listing_by_type       result_count: 1   match: true   (narrows to one type)
  listing_by_layer      result_count: 4   match: true   (narrows)
  listing_by_journey    result_count: 4   match: true   (narrows)
  listing_count_by_type result_count: 4   match: true   (four distinct types)
```

The listing read model runs over the copied DB through the read-only seam; the
copied database and generated fixture remain under ignored `tmp/` storage and were
not committed. No live source database was mutated.
