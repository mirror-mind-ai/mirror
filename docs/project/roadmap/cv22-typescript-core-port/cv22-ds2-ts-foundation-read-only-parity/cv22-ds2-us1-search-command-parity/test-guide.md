[< Story](index.md)

# Test Guide — CV22.DS2.US1 `search` Command Parity

## Automated Validation

From the repository root:

```bash
cd ts
npm run typecheck
npm run lint
npm test
```

Regenerate the synthetic golden corpus and verify determinism:

```bash
cd ..
uv run python ts/parity/generate_golden.py
git diff --exit-code ts/test/goldens/
```

Check the `node:sqlite` driver-seam rule:

```bash
rg 'node:sqlite' ts/src
```

Expected result: only `ts/src/db/database.ts` imports `node:sqlite` in production TS source.

## Manual Real-DB-Copy Parity

This story must not touch the live production database for proof. Use a copy.

Suggested route:

```bash
mkdir -p .local/parity
cp ~/.mirror-minds/alisson/memory.db .local/parity/memory.search-parity.db
```

If the active mirror home differs, copy the `memory.db` from the actual mirror home instead. Keep the copy under an ignored local path or another non-committed location.

Run selected probes through Python search against the copied database and through the TS parity harness against the same copied database. Compare ordered ids at the selected limit.

Suggested probes:

```text
mirror mind builder ariad
typescript core port
search parity
journey memory
soul mode
```

The exact harness command may be created during implementation. The evidence should record:

- database source was a copy, not live production;
- probe text;
- limit;
- Python ordered ids;
- TS ordered ids;
- pass/fail per probe.

## Navigator Validation

Route:

1. Review the implemented TS ranker modules and the updated synthetic golden schema.
2. Run the automated validation commands.
3. Inspect the real-DB-copy parity evidence.

Expected observation: TS reproduces Python ordered ids for the committed synthetic corpus and for the selected real-DB-copy probes.

Pass condition: all automated checks pass, fixture regeneration is deterministic after the intentional schema update, structural seam check passes, and real-DB-copy parity evidence shows identical ordered ids or names the remaining manual gate honestly.

Fail condition: ordered ids diverge, fixture regeneration changes committed goldens unexpectedly, TS imports `node:sqlite` outside the driver seam, a real production DB is mutated, or the implementation changes ranker semantics instead of porting them.

## Validation Evidence

Automated validation run during implementation:

```bash
cd ts
npm run format
npm run typecheck
npm run lint
npm test
```

Result: passed. `npm test` reported 19 passing `node:test` tests, including TS ranker ordered-id parity against the Python oracle fixture.

Generator determinism after the intentional golden schema update:

```bash
before=$(shasum -a 256 ts/test/goldens/hybrid-search.golden.json | awk '{print $1}')
uv run python ts/parity/generate_golden.py
after=$(shasum -a 256 ts/test/goldens/hybrid-search.golden.json | awk '{print $1}')
test "$before" = "$after"
```

Result: passed with hash `fb6ee83d4d5a4784c22b2a238612edde67b27823189c6a0bb46238a8f439fe27`.

Production TS source seam check:

```bash
rg 'node:sqlite' ts/src
```

Result: only `ts/src/db/database.ts` imports `node:sqlite` in production TS source.

Whitespace check:

```bash
git diff --check
```

Result: passed.

Manual real-DB-copy parity:

```bash
uv run python tmp/real_search_parity_generate.py
node tmp/real_search_parity_verify.mjs
```

Result: passed against a copied database at `tmp/parity/memory.search-parity.db`, sourced from `/Users/alissonvale/.mirror-minds/mirror-dev/memory.db`. The initial attempt to use fresh embedding generation failed with OpenRouter authentication (`401 No cookie auth credentials found`), so the parity fixture used deterministic frozen query embeddings drawn from memories in the copied database. This still validates the real-DB ranker replay path: Python and TS consumed the same frozen query vectors, same copied memory rows, same lexical scores, same frozen `now`, and same ranker configuration.

Probe results:

```text
PASS "mirror mind builder ariad"
  python: 42b4c8c4, 14116f18, d417981a, a7b33868, 0df77894
  ts:     42b4c8c4, 14116f18, d417981a, a7b33868, 0df77894
PASS "typescript core port"
  python: 9c355aaa, 5d48f638, fd34e2f7, e5014fbe, 7a340987
  ts:     9c355aaa, 5d48f638, fd34e2f7, e5014fbe, 7a340987
PASS "search parity"
  python: 9c355aaa, 5d48f638, fd34e2f7, e5014fbe, 7a340987
  ts:     9c355aaa, 5d48f638, fd34e2f7, e5014fbe, 7a340987
PASS "journey memory"
  python: a348ac51, 50c4ec5d, 640cc738, 336bb1c5, 46ffebcb
  ts:     a348ac51, 50c4ec5d, 640cc738, 336bb1c5, 46ffebcb
PASS "soul mode"
  python: 90e3a777, d9fab061, c711ad1d, 640cc738, a348ac51
  ts:     90e3a777, d9fab061, c711ad1d, 640cc738, a348ac51
```

The real database copy and generated fixture remain under ignored `tmp/` local storage and were not committed. The live source database was not mutated.
