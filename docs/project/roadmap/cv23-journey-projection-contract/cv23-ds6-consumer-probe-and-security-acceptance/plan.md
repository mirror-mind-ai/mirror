# Delivery Story Plan — CV23.DS6

**Journey:** mirror-mind-development
**Method:** ariad
**Navigator Flow Unit:** delivery_story
**Status:** Approved for implementation under accelerated cadence

## Delivery Story

Consumer Probe and Security Acceptance

## Objective

Expose the complete v1 command surface, prepare only isolated synthetic probe
state, and prove unchanged consumer, security, privacy, determinism, and failure
behavior before any release action.

## Child Work Packages

- CV23.DS6.US1

## Scope

1. Expand `journey-projection` from capability discovery to the four remaining
   contract operations: `rebuild-operational`, `inspect`, test-only
   `probe-prepare`, and test-only `probe-publish`.
2. Keep production commands rooted exclusively in the registered Journey path
   held by the selected Mirror home's registry.
3. Introduce one test-probe preparation service that:
   - requires `MEMORY_ENV=test` and an explicit isolated Mirror home;
   - rejects a configured production home and paths outside the home-owned
     `.journey-projection-probe` transfer area;
   - rejects symlinked or malformed fixture/state inputs;
   - opens only `<isolated-home>/memory_test.db` and verifies the opened SQLite
     path before writing;
   - registers or replaces only `projection-probe-journey`;
   - loads only the bounded active-work fields represented by the contract;
   - records fixed timestamp/snapshot/source-revision controls under the isolated
     home for the deterministic black-box rebuild.
4. Implement `probe-publish` as a façade permanently bound to the synthetic
   `projection-probe` extension identity. `--actor-namespace` must equal that
   identity and `--target-namespace` cannot select authority.
5. Return one bounded JSON object per command. Failures are nonzero and must not
   include input documents, paths, environment values, database contents,
   prompts, transcripts, secrets, or provider output.
6. Run the consumer-owned probe unchanged against the source runtime with a new
   temporary home and retain only synthetic, payload-free evidence.
7. Complete the adversarial security and no-model/no-network acceptance matrix
   with Mirror-owned tests; keep the immutable acceptance kit unchanged.

## Non-Goals

- No release, tag, push, central installation, production update, or
  `mirror-return.json`; those belong to DS7 and remain separately gated.
- No edit to the Nautilus acceptance kit and no dependency on its fake runtime.
- No production database, real Journey, private fixture, or Nautilus mutation.
- No new publication path, implicit repair, Tactical/Strategic semantics, or
  TypeScript implementation.
- No model, provider, persona, Pi subprocess, embedding, or network invocation.

## Acceptance Behavior

- **Given** a fresh isolated home and the immutable synthetic fixture, **when**
  the unchanged probe prepares, rebuilds, inspects, publishes valid/invalid
  extension documents, and attempts traversal/foreign namespace attacks,
  **then** it exits `0` with `result: passed` and `gate: open`.
- **Given** production mode, a configured production home, an unconfined fixture,
  a symlinked transfer path, or a non-probe actor, **when** a test-only operation
  is requested, **then** it fails before any database or projection mutation.
- **Given** a schema-invalid or unauthorized publication, **when** it is rejected,
  **then** projection and manifest remain byte-identical to the last valid pair.
- **Given** repeated deterministic preparation/rebuild, **when** represented
  fixture state is unchanged, **then** the Operational document matches the
  normative fixture and canonical bytes remain identical.
- **Given** any CLI failure, **then** diagnostics are stable, bounded, and
  payload-free.

## Implementation Contract

- TDD for every new command and guard.
- CLI is transport only; preparation/authority logic lives in a dedicated Core
  module and delegates publication/inspection to DS2/DS3/DS4.
- The selected home is canonicalized before any open. Explicit DB construction
  uses `db_path_for_home(home, "test")`; `PRAGMA database_list` must confirm the
  exact confined path before preparation writes.
- The configured production-home anchor is `MIRROR_PRODUCTION_HOME` when present;
  the normal configured user home is also derived when possible. Test-only
  commands fail closed whenever isolation cannot be proven.
- Fixed identities are accepted only through the probe control created after all
  test guards pass. Production rebuild never accepts timestamp/snapshot flags.
- The command advertises all five operations only after their implementations
  and tests exist.
- The consumer probe, expected fixture, fake implementation, and hashes stay
  outside production code and remain byte-identical.

## Validation Route

Driver-owned aggregate validation:

1. focused CLI/probe/security tests, including subprocess and byte-preservation
   cases;
2. existing DS1–DS5 projection tests and inter-process DS2 tests;
3. unchanged consumer probe against a new isolated home;
4. acceptance-kit hash verification and all 16 self-tests;
5. complete non-live Mirror suite, Ruff, format, mypy, docs links, and diff check;
6. explicit review of generated evidence for private paths/payloads.

The story passes only if the unchanged source-runtime probe opens its test gate.
That does not open the installed-runtime consumer gate, which remains DS7.

---

_Approval and lifecycle state are tracked by the Builder runtime, not duplicated in this plan._
