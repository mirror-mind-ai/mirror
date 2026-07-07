[< Story](index.md)

# Test Guide — CV22.DS2.US2 `detect-persona` Parity

## Automated Validation

From the `ts/` package:

```bash
cd ts
npm run typecheck
npm run lint
npm test
```

Regenerate both synthetic goldens and verify determinism:

```bash
cd ..
uv run python ts/parity/generate_golden.py
uv run python ts/parity/generate_persona_golden.py
git diff --exit-code ts/test/goldens/
```

Check the `node:sqlite` driver-seam rule:

```bash
rg 'node:sqlite' ts/src
```

Expected result: only `ts/src/db/database.ts` imports `node:sqlite` in production TS source.

## Portable Real-DB-Copy Parity (search + detect-persona)

No private mirror required. The demo DB carries synthetic memories and synthetic
persona routing rows; the harness copies it before reading and prints redacted
evidence by default.

```bash
uv run python ts/parity/generate_demo_memory_db.py --out tmp/parity/demo-memory.db
uv run python ts/parity/real_db_copy_parity.py --source-db tmp/parity/demo-memory.db
```

To validate against a real database instead, point `--source-db` at a copy of a
real `memory.db` (never the live file). Evidence stays redacted unless
`--debug-sensitive-output` is passed, and generated fixtures stay under ignored
`tmp/`.

## Navigator Validation

Route:

1. Review `ts/src/persona/detectPersona.ts` against Python `IdentityService.detect_persona`.
2. Run the automated validation commands.
3. Run the portable real-DB-copy route and inspect the redacted evidence.

Expected observation: TS reproduces the Python oracle's persona keys, hit-count
scores, and match types for the committed synthetic corpus, and reproduces the
ordered persona keys for the portable/real-DB-copy probes.

Pass condition: all automated checks pass, both goldens regenerate
deterministically, the seam check passes, and real-DB-copy parity shows identical
ordered persona keys (and identical search ids).

Fail condition: routing decisions diverge, fixture regeneration changes committed
goldens unexpectedly, TS imports `node:sqlite` outside the seam, a real production
DB is mutated, or the implementation changes routing semantics instead of porting
them.

## Validation Evidence

Automated validation run during implementation (from `ts/`):

```text
npm run typecheck  -> OK
npm run lint       -> Checked 14 files. No errors.
npm test           -> tests 35, pass 35, fail 0
```

The persona suite (`ts/test/persona/detectPersona.test.ts`) covers golden parity
for every probe plus focused units: normalization, single-word token membership
(`codebase` does not hit `code`), multi-word substring matching, hyphenated-keyword
normalization, tie-break by ascending key, higher-count-before-tie ordering,
threshold exclusion, empty/all-punctuation queries, and non-string keyword
tolerance. The harness suite adds persona-probe replay, divergence detection with
redacted-by-default evidence, and search-only fixture tolerance.

Golden determinism (regenerate is a no-op):

```bash
uv run python ts/parity/generate_golden.py
uv run python ts/parity/generate_persona_golden.py
git diff --exit-code ts/test/goldens/   # -> clean
```

Production TS source seam check:

```bash
rg 'node:sqlite' ts/src   # -> only ts/src/db/database.ts
```

Whitespace check: `git diff --check` -> clean.

Portable real-DB-copy parity (redacted, default output):

```text
== search ==
probe: search_demo_1 .. search_demo_5   match: true   (5/5)
overall_match: true
== detect-persona ==
probe: persona_derived_1   result_count: 1   match: true
probe: persona_derived_2   result_count: 1   match: true
probe: persona_derived_3   result_count: 1   match: true
probe: persona_no_match    result_count: 0   match: true
overall_match: true
```

The persona probes are derived from each synthetic persona's own routing keywords
(guaranteed real hits) plus a deliberate no-match probe (the empty-order SHA-256
`e3b0c442…`, matching on both sides). The copied database and generated fixture
remain under ignored `tmp/` local storage and were not committed. No live source
database was mutated.
