[< Story](index.md)

# Plan — CV22.DS2.TS1 TS Package Scaffold & Driver Seam

## Context Read

- `docs/project/roadmap/cv22-typescript-core-port/index.md`
- `docs/project/roadmap/cv22-typescript-core-port/cv22-ds1-hybrid-search-parity-spike/index.md`
- `docs/project/roadmap/cv22-typescript-core-port/cv22-ds2-ts-foundation-read-only-parity/index.md`
- `docs/project/decisions.md` (database-seam strangler + CV22 scaffolding)
- `spikes/ts-search-parity/parity.ts` (driver + scoring learnings to promote)
- `.pi/tsconfig.json`, `.pi/package.json` (existing repo TS conventions)
- `.github/workflows/tests.yml` (CI shape to extend)

Environment confirmed: Node `v25.9.0` local, `node:sqlite` imports clean, native
`.ts` execution works unflagged; CI floor is Node 24 LTS.

## Story Shape

Foundation / contributor-facing. It stands up the durable TS package skeleton and
the one piece of behavior that skeleton must prove — a `node:sqlite` driver seam —
without porting any Mirror command. Small and verifiable end to end in one
session.

## Scope

Create the `ts/` package:

```
ts/
  package.json          # type:module, private, engines node>=24, scripts, devDeps
  package-lock.json     # committed so CI can `npm ci`
  tsconfig.json         # strict, noEmit, erasableSyntaxOnly, NodeNext
  biome.json            # Biome format + lint config
  src/
    index.ts            # package entry — re-exports the driver seam
    db/
      database.ts       # node:sqlite behind a small driver interface
  test/
    db/
      database.test.ts  # node:test — read-only open + query + write-rejected
```

Extend CI:

```
.github/workflows/tests.yml   # + ts job (setup-node 24 → npm ci → typecheck → biome → node:test)
```

### `package.json` (shape)

```json
{
  "name": "mirror-core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=24" },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "node --test",
    "lint": "biome check .",
    "format": "biome format --write ."
  },
  "devDependencies": {
    "@biomejs/biome": "^2",
    "@types/node": "^24",
    "typescript": "^5"
  }
}
```

`name` is an internal placeholder — the published npm name (`memory` vs `mirror`,
scoped or not) is a deliberate CV22.DS6 decision, not this story's call.

### `tsconfig.json` (shape)

`strict`, `noEmit`, `module`/`moduleResolution` `NodeNext`, `target` ES2022,
`types: ["node"]`, `verbatimModuleSyntax`, `allowImportingTsExtensions` (so
`import "./database.ts"` works as native Node execution requires), and crucially
**`erasableSyntaxOnly`** so any non-erasable TS (enums, namespaces, parameter
properties) fails typecheck — keeping direct `.ts` execution always valid.

### `db/database.ts` — the driver seam

The single module allowed to import `node:sqlite`. It exposes a minimal interface
the rest of the core depends on:

```ts
export interface Row { [column: string]: unknown; }
export interface PreparedQuery {
  all(...params: unknown[]): Row[];
  get(...params: unknown[]): Row | undefined;
}
export interface Database {
  prepare(sql: string): PreparedQuery;
  close(): void;
}
export function openDatabaseReadOnly(path: string): Database { /* wraps DatabaseSync */ }
```

Dependencies flow one way: `index → db/database → node:sqlite`. Swapping to
`better-sqlite3` later means rewriting only this module — the low-coupling
defense the scaffolding decision named.

## Design & Trade-offs

- **`node:sqlite` is experimental** and prints an `ExperimentalWarning` to stderr.
  That is non-fatal and stays out of stdout; accepted per the scaffolding
  decision. The driver seam is the hedge if its constraints ever bite.
- **TDD applies to the seam, not the toolchain.** You cannot write a failing test
  before `package.json` exists. So: bootstrap the toolchain, then write the
  driver-seam test first (red — seam not implemented), implement, green. The
  toolchain itself is verified by `typecheck`/`lint`/`test` running clean.
- **`node:test` over vitest** — zero dependency, runs `.ts` directly, matches the
  lean ethos. The cost is a barer DX, accepted at this scale.
- **Committed lockfile** — CI uses `npm ci`, which requires `ts/package-lock.json`.
  Consistent with `.pi/package-lock.json` already in the repo.

## Risks

- **Test discovery.** `node --test` must find `.ts` tests under `test/`. If the
  default glob misses them, pin an explicit pattern (`node --test "test/**/*.test.ts"`).
  Resolve during implementation by running it.
- **node:sqlite API surface on Node 24.** `readOnly` option and `all`/`get`
  signatures must match the installed Node. CI pins Node 24; the seam isolates any
  drift. Verify the read-only-rejects-write behavior empirically in the test.
- **`erasableSyntaxOnly` availability.** Requires TS ≥ 5.8. Pin `typescript` to a
  current major; if unavailable, fall back to documenting the erasable-only
  constraint and relying on native execution to surface violations.
- **`.gitignore`.** Ensure `ts/node_modules/` is ignored (add a rule if the root
  `.gitignore` does not already cover `node_modules/`).
- **Biome version pinning.** Pin a major and commit the lockfile so CI and local
  agree; avoid `latest`.

## Implementation Approach

1. Create `ts/package.json`, `tsconfig.json`, `biome.json`; `npm install` to
   generate `package-lock.json`. Confirm `.gitignore` covers `ts/node_modules/`.
2. Write `ts/test/db/database.test.ts` first (red): seed a temp DB with
   `node:sqlite` (writable), close, reopen through `openDatabaseReadOnly`, assert
   seeded rows return in order, and assert a write throws under read-only.
3. Implement `ts/src/db/database.ts` (the seam) and `ts/src/index.ts` (re-exports)
   until the test is green.
4. Run `npm run typecheck`, `npm run lint`, `npm test` clean.
5. Add the `ts` job to `.github/workflows/tests.yml`; leave the Python job
   untouched.
6. Update the CV22.DS2 index story status and add the worklog entry at closeout.
7. Stop for Navigator validation, then commit.

## Test Strategy

Automated, inside `ts/`:

```bash
cd ts
npm run typecheck
npm run lint
npm test
```

Repo-level, to prove no regression elsewhere:

```bash
uv run pytest tests/unit/ tests/integration/ -m "not live"
git diff --check
```

The Python suite must stay green (no Python files change; only `tests.yml` gains a
parallel job). CI must show **both** the Python matrix and the new Node job green
after push.

## Non-Goals

- No Mirror command port (search, detect-persona, journeys, listing).
- No golden corpus / frozen-`now` contract (S2).
- No BLOB/embedding decode (S2).
- No real `memory.db` access.
- No Python, schema, or FTS5 change.
- No npm publish/build pipeline; no package-name decision.
- No Pi front door or runtime wiring.

## Checkpoint

Implementation must not start until the Navigator approves this plan.
</content>
