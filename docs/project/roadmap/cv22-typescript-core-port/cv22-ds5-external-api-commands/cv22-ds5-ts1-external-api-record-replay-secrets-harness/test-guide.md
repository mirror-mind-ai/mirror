[< Story](index.md)

# Test Guide — CV22.DS5.TS1

## Automated Validation

From the repository root:

```bash
cd ts
npm run typecheck
npm run lint
npm test -- test/providers/*.test.ts
npm test
```

Expected result:

- TypeScript typecheck passes.
- Biome check passes.
- Provider-focused tests pass.
- Full TS test suite passes.
- No test requires live provider credentials or network access.

## Fixture Safety Inspection

Run:

```bash
cd ..
git diff --check
rg 'Authorization: Bearer|OPENROUTER_API_KEY|api_key|apiKey|secret|token' ts/test ts/src
```

Expected observation:

- `git diff --check` prints no errors.
- Any `rg` hits are intentional test strings, redaction markers, or key-name
  checks. No real secret value, bearer token, raw authorization header, or private
  provider payload is present.
- Automated fixture-safety tests fail closed when a deliberately unsafe fixture is
  introduced.

## Navigator Validation

Route:

1. Inspect the provider substrate files under `ts/src/providers/` or the final
   equivalent location.
2. Inspect tests under `ts/test/providers/` or the final equivalent location.
3. Confirm the tests include at least one deliberate leaked-secret fixture/header
   that is rejected.
4. Confirm replay tests run without `OPENROUTER_API_KEY`.
5. Run the automated validation commands above.

Expected observation:

- Replay mode returns deterministic data from scrubbed fixtures.
- Redaction removes configured secret values and secret-looking fields from
  diagnostics.
- Provider config refuses argv-style secret sources and relies on env/config.
- No command routing or live external call is introduced.

Pass condition:

- Automated checks pass.
- Fixture-safety tests prove unsafe fixtures fail.
- No real provider credential or sensitive payload is committed.
- Scope remains substrate-only; Fresh Search, Extraction, Consult, and routing are
  untouched.

Fail condition:

- Any live provider call is needed for CI.
- Secrets can appear unredacted in logs/errors/fixtures.
- API keys are accepted through argv-like inputs.
- The story starts porting a DS5 command family before the substrate is approved.

## Validation Evidence

Implementation checks run locally:

```bash
cd ts
npm run typecheck
npm run lint
npm test
cd ..
git diff --check
rg 'Authorization: Bearer|OPENROUTER_API_KEY|api_key|apiKey|secret|token' ts/test ts/src
```

Result:

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test`: passed, 189 tests.
- `git diff --check`: passed.
- `rg` inspection showed only intentional implementation/test strings, redaction
  patterns, fake test secrets, and unrelated uses of the words token/secret; no
  real provider credential or private payload was present.
