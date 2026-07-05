# Validation — CV22.DS2.TS3

## Status

Passed

## Automated Checks

- cd ts && npm run typecheck && npm run lint && npm test; uv run python ts/parity/generate_demo_memory_db.py --out tmp/parity/demo-memory.db; uv run python ts/parity/real_db_copy_parity.py --source-db tmp/parity/demo-memory.db; git status --short --ignored tmp/parity; git diff --check

Checks status: passed

## E2E

Decision: not_required

Evidence: No runtime route changed; TS3 is a validation harness story. The harness now uses a repository-generated synthetic demo DB, copies it into ignored local storage, and emits redacted hash/count evidence only. Navigator validated the route step by step, confirmed generated artifacts are ignored, ran automated TS checks with 21 passing tests, and confirmed git diff --check produced no output.

## Navigator Validation

Route: Navigator executed the revised portable validation route and accepted the redacted harness evidence and safety posture.

Navigator accepted: yes

Expected observation: Repository-generated synthetic demo DB works as portable source; harness copies it into ignored local storage, verifies Python vs TS parity through hashes, emits no raw ids/content/titles/embeddings by default, and automated TS checks pass.

Pass condition: Navigator accepted the portable generated-demo-DB route and redacted evidence for the reusable real-DB-copy parity harness.

Fail condition: Default output leaks raw ids/content/titles/embeddings, generated database artifacts appear as tracked files, automated checks fail, or the route depends on Alisson's private filesystem.

## Missing Evidence

- none
