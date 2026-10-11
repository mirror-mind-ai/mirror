[< Story](index.md)

# Test Guide — CV22.DS2.TS2 Golden-Corpus Contract & Frozen-`now` Harness

## Automated Validation

```bash
# From the ts/ package: typecheck, lint, and run the golden verifier.
cd ts
npm run typecheck
npm run lint
npm test            # includes the node:test golden verifier + decode-helper unit tests

# Determinism: regenerating the synthetic corpus must be a no-op diff.
uv run python -m <golden_generator_module> --out ts/test/goldens/
git diff --exit-code ts/test/goldens/
```

## Navigator Validation

- **Route:** regenerate the synthetic golden corpus, then run `npm test` in `ts/`.
- **Expected observation:** the verifier reports ordered-id parity for every probe
  in the corpus; regenerating the corpus produces no git diff.
- **Pass condition:** verifier green in CI and locally; generator re-run diff empty;
  no network or real database touched.
- **Fail condition:** any ordered-id mismatch, non-deterministic regeneration
  (non-empty diff), or the verifier reading a real `memory.db` instead of the
  committed synthetic fixtures.

## Validation Evidence

<Recorded after validation runs — verifier output, determinism diff result, CI run link.>
