# Mirror Mind — TypeScript Core

The TypeScript core of Mirror Mind, grown as a **database-seam strangler** of the
Python core in [`../src/memory/`](../src/memory). This package is the durable
transition state: it starts as a skeleton and dissolves the Python core one
command at a time behind a shared `memory.db`.

- Strategy: [Decisions — database-seam strangler](../docs/project/decisions.md#mirror-mind-ports-to-typescript-via-a-database-seam-strangler-not-a-rewrite)
- Scaffolding choices: [Decisions — CV22 scaffolding](../docs/project/decisions.md#cv22-typescript-core-scaffolding-nodesqlite-single-ts-package-node-24-biome)
- Roadmap: [CV22 — TypeScript Core Port](../docs/project/roadmap/cv22-typescript-core-port/index.md)

## Requirements

- **Node.js >= 24** (`engines.node`). The core relies on built-in `node:sqlite`
  (FTS5 + bm25, no native build) and Node's native TypeScript execution, so there
  is no compile step.

## Getting started

```bash
cd ts
npm ci          # install pinned dev dependencies (use `npm install` to refresh the lockfile)
npm run typecheck   # tsc --noEmit
npm run lint        # Biome check
npm test            # node:test
npm run format      # Biome format --write
```

## Conventions

- **No build step.** Source stays `.ts` and runs directly under Node. `tsconfig`
  sets `erasableSyntaxOnly`, so only erasable TypeScript is allowed (no enums,
  namespaces, or parameter properties) — this keeps native execution always valid.
- **The driver seam.** `src/db/database.ts` is the **only** module that imports
  `node:sqlite`. Everything else depends on the `Database` interface it exports,
  so swapping the driver later (e.g. `better-sqlite3`) rewrites just that file.
- **Zero runtime dependencies.** Testing uses the built-in `node:test`; SQLite is
  built in. Dev dependencies are TypeScript, `@types/node`, and Biome only.
- **Parity net.** Ported commands are validated against the Python oracle. CI runs
  parity over committed **synthetic** (PII-free) golden corpora; real-`memory.db`
  parity is a manual pre-merge gate and never enters CI.

## Parity harness (golden corpus)

The golden-corpus contract is how TS is graded against the Python ranker without
re-deriving the answer (CV22.DS2.TS2):

- `parity/generate_golden.py` drives the **real** `MemorySearch.search` over a
  synthetic corpus with the two impure inputs frozen (`datetime.now()` and the
  query embedding), and writes a committed golden to `test/goldens/`.
- `src/parity/decode.ts` holds the two parity-critical decoders — `blobToFloat32`
  (little-endian float32 BLOB) and `parseUtcMs` (ISO timestamp -> epoch ms) —
  which are graded against Python-computed reference values embedded in the golden.
- `src/parity/golden.ts` loads the fixture and provides `orderedIdsMatch`, the
  success metric (ranked **ids**, not scores).

Regenerate the golden (must be a no-op in CI — a determinism gate enforces it):

```bash
uv run python ts/parity/generate_golden.py
git diff --exit-code ts/test/goldens/
```

The TS ranker that reproduces `expected_order` from the corpus lands in DS2.US1;
this harness proves the load/decode/compare mechanism is correct and stable.

## Layout

```
src/
  index.ts          # package entry point
  db/database.ts    # node:sqlite driver seam (read-only handle)
  parity/decode.ts  # blobToFloat32 / parseUtcMs (parity-critical decoders)
  parity/golden.ts  # golden loader + ordered-id grader
parity/
  generate_golden.py  # Python oracle -> committed golden (frozen now + embedding)
test/               # node:test suites
  goldens/          # committed synthetic golden corpora (PII-free)
```

Seams mirror the Python core (`db`, and — as the port proceeds — `storage`,
`intelligence`, `services`, `cli`).
