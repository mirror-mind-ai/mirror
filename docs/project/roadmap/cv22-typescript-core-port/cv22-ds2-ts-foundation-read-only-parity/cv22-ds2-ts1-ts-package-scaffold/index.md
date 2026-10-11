[< CV22.DS2 TS Foundation & Read-Only Command Parity](../index.md)

# CV22.DS2.TS1 — TS Package Scaffold & Driver Seam

**Status:** Done
**Delivery Story:** CV22.DS2 — TS Foundation & Read-Only Command Parity
**Type:** Technical Story

---

## Outcome

A real, durable TypeScript package exists at `ts/` and is comfortable to live in:
it compiles, lints, and tests green, and its `node:sqlite` driver seam can open a
SQLite file read-only and run a query. CI runs a Node job alongside the existing
Python job.

This story stands up the **skeleton the rest of CV22 builds on**. It deliberately
ports **no Mirror command** — no `search`, no `detect-persona`, no journeys, no
memory listing. Those arrive in CV22.DS2.TS2 and DS2.US1–US3 on top of this foundation. Keeping
the scaffold command-free keeps it small enough to verify end to end in one
session.

---

## Done Condition

- `ts/package.json` exists: `type: module`, `private: true`, `engines.node >= 24`,
  devDeps `typescript` + `@types/node` + `@biomejs/biome`, and `typecheck` /
  `test` / `lint` / `format` scripts.
- `ts/tsconfig.json` enforces `strict`, `noEmit`, and erasable-syntax-only so the
  source runs directly under Node's native type stripping.
- `ts/biome.json` configures Biome formatting + linting for the package.
- `ts/src/db/database.ts` wraps `node:sqlite` behind a small driver interface
  (open read-only, `prepare`/`all`/`get`, `close`). No other module imports
  `node:sqlite` directly.
- `ts/src/index.ts` is the package entry point.
- `ts/test/db/database.test.ts` (`node:test`) proves the seam opens a temp DB,
  queries rows, and that read-only mode rejects a write.
- `npm run typecheck`, `npm run lint`, and `npm test` all pass inside `ts/`.
- `.github/workflows/tests.yml` has a Node job (setup-node 24 → install →
  typecheck → Biome → `node:test`); the Python job is unchanged and still green.

---

## Non-Goals

- No port of any Mirror command (`search`, `detect-persona`, journeys, memory
  listing) — those are DS2.US1–US3.
- No golden-corpus mechanism or frozen-`now` contract — that is DS2.TS2.
- No BLOB/embedding decode helper — introduced with the golden contract in DS2.TS2.
- No reading of a real `memory.db`; the driver test uses a throwaway temp DB.
- No Python changes, no schema changes, no FTS5 changes.
- No npm publish/build pipeline and no package-name decision (`memory` vs
  `mirror`) — those are CV22.DS6.
- No Pi front door or runtime wiring — that is CV22.DS3.

---

## See also

- [Plan](plan.md)
- [Test Guide](test-guide.md)
- [CV22.DS2 index](../index.md)
- [Decisions — CV22 scaffolding](../../../../decisions.md#cv22-typescript-core-scaffolding-nodesqlite-single-ts-package-node-24-biome)
</content>
