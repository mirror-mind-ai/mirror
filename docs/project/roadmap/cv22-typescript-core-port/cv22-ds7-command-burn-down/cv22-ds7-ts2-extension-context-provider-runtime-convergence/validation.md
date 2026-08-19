# Validation — CV22.DS7.TS2

## Status

Passed

## Automated Checks

- npm test: 875 passed; Python non-live suite: 2473 passed; typecheck/lint/Ruff/docs/oracle-drift/golden determinism/migration/bootstrap/real-DB-copy parity: passed

Checks status: passed

## E2E

Decision: required

Evidence: Disposable front-door E2E: 4/4 passed, including native mirror-context-v1 provider, Python legacy compatibility host, TS route proof, SQLite commit visibility, selected-journey isolation, malformed-provider failure isolation, and payload redaction

## Navigator Validation

Route: cd ts && NODE_OPTIONS=--no-warnings node --test test/frontDoor/mirrorModeCli.test.ts; review docs/project/roadmap/cv22-typescript-core-port/cv22-ds7-command-burn-down/cv22-ds7-ts2-extension-context-provider-runtime-convergence/validation.md

Navigator accepted: yes

Expected observation: Four disposable-home E2E tests pass; native and legacy extension sections render in stable order, malformed provider output is isolated with metadata-only warning, the route remains TS, and logs contain no provider/query/journey payload

Pass condition: Navigator accepts mirror-context-v1 behavior, the finite DS10 legacy-host deletion gate, the disposable E2E route, and payload-free diagnostics

Fail condition: Any context is silently lost, binding order/rendering diverges, unrelated journey context appears, provider execution is unbounded, payload leaks, the complete command falls back to Python, or the compatibility host lacks a finite deletion owner

## Missing Evidence

- none

## Implemented Contract

- TS selects persona/selected-journey bindings in exact Python order.
- `mirror-context-v1` commands receive one versioned JSON request over stdin and return
  string/null in one JSON result.
- Commands run sequentially without `shell`, with a 60-second timeout and 1 MiB stdout cap.
- Native providers and the compatibility host run as separate processes; raw stdout/stderr
  is never forwarded into diagnostics or front-door logs.
- Python-only providers remain functional through `memory.extensions.compat_host`, which
  invokes one named provider and owns no binding selection or Mirror orchestration.
- US4's `applyMirrorExtensionFallback`/`extensionBindingsCouldContribute` path is deleted;
  matching bindings remain on the TS route.
- DS10 owns mandatory deletion of the temporary host and all legacy launch branches before
  Python retirement/npm publication.

## Detailed Evidence

- TypeScript typecheck and lint passed.
- TypeScript suite: 875 passed.
- Python non-live unit/integration suite: 2473 passed.
- Extension-focused TS suite: 7 passed.
- Disposable front-door E2E: 4 passed.
- Ruff check/format, documentation links/headings, oracle drift, and `git diff --check`
  passed.
- Migration structural parity, bootstrap custody parity including the 8-process race, and
  portable real-DB-copy parity passed.
- Complete golden-tree digest remained
  `feca1712f4bcb7a53101a3db9dcdf36616fee7575c2680fabbff368ae04b3aa4` before and
  after regeneration.
- `extension-context.golden.json` SHA-256 is
  `375b2e24c5787f6af0c67beb33d0b03f2be099d23269993450e942b256e863c2`.

## Privacy And Fixture Boundary

All provider and E2E fixtures used test-owned temporary directories. The Python golden
producer clears conflicting database-selection variables, sets an explicit temporary
`DB_PATH`, verifies the connection with `PRAGMA database_list`, and refuses paths outside
its temporary root. No production/development database or private extension installation
was inspected.
