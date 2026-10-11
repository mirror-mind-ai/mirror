# Test Guide — CV22.DS6.US1

Behavior-preserving change: the serialization dialect changes, observable journey
behavior does not. Coverage centers on read-tolerance across old/new dialects and
on the intentional write-parity divergence for this one column.

## Automated — journey write serialization (`ts/test/journey/…`)

1. **Canonical create.** `createJourney` with a full metadata set → the stored
   `metadata` equals `JSON.stringify(journeyMetadata(...))` (compact, fixed key
   order), **not** the old `sort_keys=True, ensure_ascii=False` bytes. Include a
   non-ASCII value (e.g. an accented path) to prove raw-UTF-8 canonical output.
2. **Canonical set-path.** `setProjectPath` on an existing row → re-serialized
   with `JSON.stringify`; `project_path` updated, other keys preserved.
3. **Round-trip.** create → set-path → read via `list_journey_options`/
   `journeyOptions` → `project_path`, `parent_journey`, and hierarchy intact.

## Automated — read-tolerance (mixed dialects)

4. **Old-dialect row still reads.** Seed a journey row whose `metadata` is the
   historical Python byte-dialect (sorted keys, `\uXXXX`-escaped non-ASCII).
   Assert `journeyOptions.parentJourney` and the journeys render produce exactly
   the same DTO/output as an equivalent canonical row.
5. **Mixed DB.** A DB holding one old-dialect and one new canonical journey row
   → `list_journey_options` returns both, ordered and parented identically to
   pre-change output. No row is rewritten by a read.

## Automated — deletion + parity

6. **`pyJson.ts` removed.** Delete `ts/src/util/pyJson.ts`,
   `ts/test/util/pyJson.test.ts`, and the two `ts/src/index.ts` re-export lines.
   Typecheck proves no dangling import; a grep guard (or the typecheck) confirms
   no remaining `pyJsonDumps` reference outside history.
7. **Write-parity goldens regenerated.** Update
   `ts/src/parity/writeParityFixture.ts` / `ts/parity/write_parity.py` and the
   journey golden/demo-db generators so journey metadata asserts the canonical
   form. Explicitly stop asserting Python-`json.dumps` byte equality for this
   column and record the divergence in-fixture. Determinism gate stays green.

## Regression

- Full `ts/` suite green (`node --test`), typecheck + lint clean.
- Existing journey render goldens (`renderGoldens`, `journeyOptions`) unchanged
  in output.

## Navigator smoke (E2E) — copied real DB

```bash
# operate on a COPY, never the live DB
cp <source>/memory.db tmp/us1/memory.db
node ts/src/frontDoor/cli.ts journey set-path <existing-slug> /tmp/x --db-path tmp/us1/memory.db
node ts/src/frontDoor/cli.ts journeys --db-path tmp/us1/memory.db
# inspect the row's metadata form
```

- Expected: journeys list correctly (old rows included); the updated row's
  `metadata` is `JSON.stringify` canonical form.
- Pass: rendered output identical to pre-change; `pyJson.ts` gone; row parses.
- Fail: any journey read differs, or a row fails to parse.

## Gate

- `ts/` typecheck + lint + `node --test` green; determinism/write-parity gates
  regenerated and green.
- Navigator smoke observed and accepted.
