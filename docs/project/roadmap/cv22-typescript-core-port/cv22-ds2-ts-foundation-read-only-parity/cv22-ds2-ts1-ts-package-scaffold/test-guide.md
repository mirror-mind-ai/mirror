[< Story](index.md)

# Test Guide — CV22.DS2.TS1 TS Package Scaffold & Driver Seam

## Automated Validation

Inside the new package:

```bash
cd ts
npm ci          # or `npm install` on first run, to generate the lockfile
npm run typecheck
npm run lint
npm test
```

Repo-level, proving nothing else regressed:

```bash
uv run pytest tests/unit/ tests/integration/ -m "not live"
git diff --check
```

## Validation Evidence

Recorded during implementation (Node `v25.9.0` local; toolchain TypeScript 5.9.3,
`@types/node` 24.13.2, Biome 2.5.1):

```text
npm run typecheck        → exit 0, no errors
npm run lint (Biome)     → Checked 4 files. No errors.
npm test (node:test)     → tests 3 / pass 3 / fail 0
npx biome format .       → exit 0 (already formatted)
npm ci (CI simulation)   → installs from committed package-lock.json, 0 vulnerabilities
grep -rn node:sqlite src → 1 file (src/db/database.ts) — seam isolation holds
git check-ignore ts/node_modules → ignored (global node_modules/ rule)
git diff --check         → clean
```

### Pre-existing Python debt (not introduced by this story)

`uv run pytest tests/unit/ tests/integration/ -m "not live"` reports failures in
`tests/unit/memory/cli/test_welcome.py` and two web backup tests
(`test_operations.py::test_run_operation_creates_and_verifies_database_backup`,
`test_server.py::test_operations_run_api_executes_database_backup`). These were
confirmed to fail on a clean tree with **all** CV22 changes stashed, so they are
pre-existing debt unrelated to this story. CV22.DS2.TS1 adds no Python; it touches
only `ts/`, `docs/`, and the CI workflow. The gate is not silently treated as
green — the failures are recorded here and left to their own future fix.

## Navigator Validation Route

This is a foundation story — no runtime behavior to exercise through Mirror. The
Navigator validates the skeleton directly.

1. Inspect the package shape:

   ```bash
   find ts -type f -not -path '*/node_modules/*' | sort
   ```

   Expect: `README.md`, `package.json`, `package-lock.json`, `tsconfig.json`,
   `biome.json`, `src/index.ts`, `src/db/database.ts`, `test/db/database.test.ts`.

2. Run the toolchain and watch all three pass:

   ```bash
   cd ts && npm run typecheck && npm run lint && npm test
   ```

3. Confirm the driver seam is the only `node:sqlite` importer:

   ```bash
   grep -rn "node:sqlite" ts/src
   ```

   Expect exactly one match, in `ts/src/db/database.ts`.

4. Confirm the CI Node job exists and the Python job is unchanged:

   ```bash
   grep -n "node-version" .github/workflows/tests.yml
   ```

5. After push, confirm both CI jobs are green:

   ```bash
   gh run list --branch main --limit 1
   gh run view --log | grep -Ei "typecheck|biome|node --test|pytest"
   ```

## Pass Condition

- `npm run typecheck`, `npm run lint`, and `npm test` all pass in `ts/`.
- The driver-seam test proves a read-only open returns seeded rows in order and
  that a write is rejected under read-only mode.
- `node:sqlite` is imported in exactly one module (`ts/src/db/database.ts`).
- The CI Node job (Node 24) and the Python matrix are both green after push.
- No Python, schema, or FTS5 files changed; `git diff --check` is clean.

## Fail Condition

- Any Mirror command (search, detect-persona, journeys, listing) is ported in this
  story.
- A golden corpus, frozen-`now` contract, or BLOB/embedding decode appears (that
  is S2).
- The scaffold reads a real `memory.db`.
- More than one module imports `node:sqlite`.
- The Python job is altered or breaks.
- `tsconfig.json` lacks `erasableSyntaxOnly`, allowing non-erasable TS that would
  break native `.ts` execution.

## Navigator Validation Evidence

```text
(to be filled in after Navigator validation)
```
</content>
