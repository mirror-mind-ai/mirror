# Mirror Mind — TypeScript Core

The core of Mirror Mind. It was grown as a **database-seam strangler** of the
Python core, dissolving it one command at a time behind a shared `memory.db`,
and since CV22.DS10.TS5 it is the only core: the Python one is deleted, and its
last state is readable at the
[`cv22-last-python-bearing`](https://github.com/mirror-mind-ai/mirror/tree/cv22-last-python-bearing/src/memory)
tag.

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
- **Frozen goldens.** Every ported surface was graded against the Python oracle
  over committed **synthetic** (PII-free) golden corpora. The oracle is gone, so
  the goldens are frozen fixtures: a failing golden is a regression, and a
  deliberate change edits it by hand with a recorded reason. See
  [`test/goldens/README.md`](test/goldens/README.md).
- **Smokes.** `smoke/` holds end-to-end scripts that run whole sequences through
  the real front-door process, the migration custody proofs, and the synthetic
  demo database generator (`smoke/generate_demo_memory_db.ts`). CI runs them;
  none needs a private `memory.db`.

## Mirror Mode orchestration (CV22.DS7.US4)

The front door answers `mirror load|deactivate|log|journeys` and
`mode activate|deactivate|status` through TypeScript for deterministic core paths.
`mirror load --query` runs live against the provider since CV22.DS8.US3. For a
deterministic run, point it at scrubbed replay fixtures instead:

```bash
MIRROR_TS_MIRROR_LLM_REPLAY=/path/to/reception.json \
MIRROR_TS_MIRROR_EMBEDDING_REPLAY=/path/to/embedding.json \
node ts/src/frontDoor/cli.ts mirror load --query "..."
```

Both fixtures are required together. If `MEMORY_RECEPTION=0`, the LLM replay is not
required — the classifier is off — but query attachment/journey search still needs
the embedding replay.

CV22.DS7.TS2 keeps matching extension bindings on the TS route. Capabilities declare a
no-shell `mirror-context-v1` process command; TS owns selection, ordering, bounded
execution, and rendering. Extension subcommands declare `mirror-cli-v1` the same way.

**CV22.DS10.TS2 removed the Python compatibility bridge.** A capability that declares no
runtime no longer falls back to anything: a context provider is skipped with a
`no_provider_runtime` diagnostic and the load continues, and a subcommand refuses with one
line naming the fix. Extensions may still own any executable runtime, Python included —
what ended is the *core* owning Python as their permanent compatibility layer. See
[CV22.DS10.TS2](../docs/project/roadmap/cv22-typescript-core-port/cv22-ds10-python-retirement-npm-distribution/cv22-ds10-ts2-extension-compatibility-host-deletion/index.md)
and the cutoff in [pending-cutoffs](../docs/releases/pending-cutoffs.md).

## Layout

```
src/
  index.ts          # package entry point
  frontDoor/cli.ts  # the command-line front door every runtime calls
  db/database.ts    # node:sqlite driver seam
  hooks/            # the runtime hook entries (Claude Code, Gemini CLI, Codex, plugin)
  mcp/              # the MCP server
  ...               # one directory per domain: builder, conversation, soul, ...
scripts/            # repository guards and release tooling, run by CI
smoke/              # end-to-end smokes, custody proofs, the demo database generator
evals/              # the model-behavior eval harness (developer tooling)
test/               # node:test suites
  goldens/          # frozen oracle-recorded golden corpora (PII-free)
  fixtures/         # synthetic fixture trees and databases
```
