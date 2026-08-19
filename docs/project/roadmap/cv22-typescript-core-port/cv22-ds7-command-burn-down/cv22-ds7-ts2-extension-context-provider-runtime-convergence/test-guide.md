[< Story](index.md)

# Test Guide — CV22.DS7.TS2

## Test Safety

- Use only synthetic extension directories and disposable temporary databases.
- Every Python fixture generator must set, pass, and verify its explicit temporary DB path
  through `PRAGMA database_list` before writing.
- Never inspect or use production/development extension installations or databases.
- Provider request/result bodies may appear only inside isolated test assertions; normal
  command and CI output must remain redacted.
- Provider commands are launched without a shell and with deterministic timeout/output
  limits.
- Process invocation runs on macOS and Linux CI; path/argv construction gets a focused
  Windows-compatible unit contract without claiming Windows runtime homologation.

## Characterization And Golden Parity

Cover the released Python behavior:

- persona-only, journey-only, both-target, mismatch, and no-target selection;
- stable `(extension_id, capability_id, target_kind, target_id)` order;
- all `ContextRequest` fields;
- exact section header and blank-line rendering;
- empty/`None` output;
- missing extension, load failure, unknown capability, provider exception;
- selected-journey isolation from ancestors, descendants, and unrelated roots.

Generate a committed synthetic golden from the real Python oracle and compare the TS
selection/request/rendering result. Regeneration must be byte-deterministic.

## Manifest And Protocol Tests

- existing manifests without `provider_runtime` remain valid during the compatibility window;
- valid `mirror-context-v1` argv descriptors parse;
- scalar/shell-string commands, empty argv, unknown protocols, duplicate capabilities,
  escaping path-like arguments, malformed YAML, and missing files fail closed;
- request JSON contains the versioned existing request fields and selected DB/root data;
- `text`, `null`, Unicode, and empty output normalize like Python;
- malformed JSON, wrong version, oversized output, extra documents, non-string text, raw
  process failure, signal, timeout, and stderr-only output are isolated.

## Dispatcher And Compatibility Tests

- matching bindings invoke providers exactly once in stable order;
- process provider and temporary legacy host produce identical `ContextSection` values;
- failure of one binding does not suppress later bindings or core context;
- unknown/missing capability remains fail-soft and visible through metadata-only diagnostics;
- no provider request, response, stderr, user, query, persona, journey, target, DB path, or
  section text enters front-door/operational logs;
- legacy-host invocation selects one explicit extension/capability and cannot choose bindings
  or render the complete Mirror response;
- second-connection read visibility, provider write/commit behavior, busy timeout, and failure
  partial-effects match the accepted Python contract or trigger the Plan stop condition;
- no matching binding means no extension process;
- ancestor/descendant bindings never contribute to the selected journey.

## Front-Door E2E

Run through a disposable Mirror home:

```bash
cd ts
node --test test/frontDoor/mirrorModeCli.test.ts
```

The E2E fixture must prove:

1. a native process provider contributes a section while routing remains TS;
2. a Python-only provider contributes the parity-equivalent section through the finite
   compatibility host while the complete command remains TS-owned;
3. deterministic ordering across both forms;
4. malformed, raising, and timed-out providers do not block core context;
5. unrelated journey bindings are absent;
6. diagnostics are metadata-only;
7. removal of the US4 extension-binding fallback branch is observable.

Expected observation: all disposable-home cases pass, both provider forms render in oracle
order, failures isolate, and front-door evidence says TS rather than Python fallback.

Pass condition: exact parity and redaction assertions pass and no whole-command fallback is
reachable because of extension bindings.

Fail condition: silent context loss, ordering/rendering drift, cross-journey leakage,
unbounded execution, payload logging, or binding-triggered Python command routing.

## Regression Commands

```bash
# Focused Python oracle/compatibility coverage
uv run pytest \
  tests/unit/memory/extensions/test_context.py \
  tests/unit/memory/extensions/test_api.py \
  tests/unit/memory/extensions/test_loader.py \
  tests/unit/memory/extensions/test_mirror_mode_hook.py

# Focused TypeScript coverage (final filenames may be refined during TDD)
cd ts
node --test \
  test/extensions/contextManifest.test.ts \
  test/extensions/contextProtocol.test.ts \
  test/extensions/contextRuntime.test.ts \
  test/frontDoor/mirrorModeCli.test.ts
npm run typecheck
npm run lint
npm test
cd ..

# Full repository gates
MEMORY_ENV=test ECONOMY_ENV=test uv run pytest tests/unit/ tests/integration/ -m "not live"
uv run ruff check src/ tests/
uv run ruff format --check src/ tests/
uv run python scripts/check_oracle_drift.py
git diff --check
```

Run the repository's migration/bootstrap and portable real-DB-copy parity commands when
shared front-door or database seams change.

## Required Evidence Before Validation

- exact commands and pass counts;
- golden regeneration hashes/no-diff result;
- E2E output summary without payloads;
- proof that route selection is TS for matching bindings;
- proof that the legacy adapter is separately named, deprecated, and assigned to DS10
  deletion;
- extension author migration example;
- explicit statement that no private extension installation/database was inspected.
