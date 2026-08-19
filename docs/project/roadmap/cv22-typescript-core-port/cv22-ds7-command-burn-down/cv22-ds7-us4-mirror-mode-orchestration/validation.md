# Validation — CV22.DS7.US4

## Status

Passed

## Automated Checks

- npm test: 868 passed; Python non-live suite: 2465 passed; typecheck/lint/ruff/oracle-drift/migration/bootstrap/real-DB-copy parity: passed

Checks status: passed

## E2E

Decision: required

Evidence: Disposable front-door E2E passes extension-free load/log/deactivate, replay-backed query, explicit extension fallback, state parity, and payload redaction

## Navigator Validation

Route: cd ts && node --test test/frontDoor/mirrorModeCli.test.ts; review docs/project/roadmap/cv22-typescript-core-port/cv22-ds7-command-burn-down/cv22-ds7-us4-mirror-mode-orchestration/validation.md

Navigator accepted: yes

Expected observation: Four disposable-home E2E tests pass; TS serves core/replay Mirror paths, matching extension bindings stay on named Python fallback, and logs contain no payloads

Pass condition: Navigator accepts the disposable validation route, bounded TS2 fallback, and selective incident repair evidence

Fail condition: Any flow is unclear, extension context is lost, a live provider is called, payloads leak, or remediation evidence is insufficient

## Missing Evidence

- none

## Detailed Automated Evidence

Executed from `ts/`:

```text
npm run typecheck
PASS

npm run lint
PASS — 248 files checked

npm test
PASS — 868 tests

node parity/migration_structural_parity.ts
PASS — 001/002/003/004/005/008/009/016 and chain-multi-hop

node parity/bootstrap_custody_parity.ts
PASS — pragmas, schema equivalence, idempotency, and 8-process race
```

Executed from the repository root:

```text
MEMORY_ENV=test ECONOMY_ENV=test uv run pytest tests/unit/ tests/integration/ -m "not live"
PASS — 2465 tests

uv run ruff check src/ tests/
PASS

uv run ruff format --check src/ tests/
PASS — 347 files already formatted

uv run python scripts/check_oracle_drift.py
PASS — all registered Python oracles match the baseline

git diff --check
PASS
```

Focused Python oracle suite passed 64 tests across mode, operating-mode, transition,
reception, Mirror skill/state, and extension-hook surfaces.

Golden regeneration was deterministic:

```text
mirror-mode.golden.json  7df2019df2677e509b66723ee30dbef04f6ac773f8d0f3cca4e7cb73e648f2aa
mirror-state.golden.json e4a1f10300565f99128fddf68c26ec82076839af9b4f5075e3e735f5ae807868
```

Portable real-database-copy parity passed for search, persona, journeys, memory listing,
tasks, week, and cultivation against a generated disposable fixture. The temporary parity
directory was removed after the pass.

## Incident And Repair Evidence

During initial authoring of `generate_mirror_state_golden.py`, the process inherited an
ambient `DB_PATH`, which overrode its temporary `MIRROR_HOME` and wrote synthetic fixture
state into the development Mirror database. Work stopped immediately.

Repair was explicitly Navigator-authorized and selective:

- a safety snapshot was created at
  `/Users/alissonvale/.mirror-minds/mirror-dev/backups/incident-pre-repair-retry-20260818_164330.db`;
- four touched identity rows and two global runtime rows were restored from the 16:05
  pre-incident backup;
- only synthetic `state-session` and its conversation/message were removed;
- structural comparison against the repair source passed without printing private content.

The generator now clears conflicting database-selection variables, sets and passes an
explicit temporary database path, verifies the actual SQLite path through
`PRAGMA database_list` before writing, refuses paths outside its temporary directory, and
extracts only known synthetic fixture rows. The committed fixture contains exactly three
synthetic sessions, one synthetic conversation, and one synthetic message. No private
artifact remains in the repository.
