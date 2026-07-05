[< CV22 TypeScript Core Port](../index.md)

# CV22.DS2 — TS Foundation & Read-Only Command Parity

**Delivery Story:** Stand up the real TypeScript core and reach ordered/behavioral parity for the read-only, deterministic commands, validated on real-DB copies.
**Status:** 🟢 In Progress
**Depends on:** [CV22.DS1 Hybrid-Search Parity Spike](../cv22-ds1-hybrid-search-parity-spike/index.md) (done), the [database-seam strangler decision](../../../decisions.md), the [CV22 scaffolding decision](../../../decisions.md#cv22-typescript-core-scaffolding-nodesqlite-single-ts-package-node-24-biome)

---

## What This Is

DS1 proved the riskiest assumption — that a TS reimplementation of the hybrid
ranker, reading the same SQLite file, reproduces Python's ordered results — but
it did so in a **throwaway spike** under `spikes/ts-search-parity/`. DS2 is where
the strangler proper begins: a real, durable TS package that the rest of CV22
builds on.

DS2 has two halves:

1. **Foundation** — stand up the `ts/` package skeleton: the `node:sqlite` driver
   seam, toolchain (TypeScript typecheck, Biome, `node:test`), BLOB/embedding
   read, the frozen-`now` golden contract, and a CI Node job. No Mirror command
   is ported in the foundation story; it just has to compile, lint, test, and open
   a database.
2. **Read-only command parity** — port the deterministic read commands the
   strangler can validate against the Python oracle on real-DB copies: `search`,
   `detect-persona`, journeys, and memory listing (DS2.US1–US3). Each command
   becomes a tested TS module whose ordered/behavioral output matches Python on a
   synthetic golden corpus (CI) and on a real-`memory.db` copy (manual pre-merge
   gate).

The spike's learnings (`parseUtcMs`, `blobToFloat32`, ordinal lexical scoring,
MMR dedup, frozen `now`) are **promoted** into properly-structured, tested
modules here — the spike itself stays as historical evidence and is not extended.

---

## Scaffolding Decisions (settled)

Recorded in [Decisions — CV22 TypeScript core scaffolding](../../../decisions.md#cv22-typescript-core-scaffolding-nodesqlite-single-ts-package-node-24-biome):

- **Driver:** `node:sqlite` behind a thin driver seam (no native build; swap stays cheap).
- **Layout:** a single top-level `ts/` package; no workspaces until a second publishable unit exists.
- **Node floor:** 24 LTS (`engines.node >= 24`).
- **Parity net:** committed synthetic goldens in CI; real-DB parity is a manual pre-merge gate.
- **Lint/format:** Biome. **Test runner:** built-in `node:test`. **Build:** deferred; run `.ts` directly, `tsc --noEmit` for typecheck.

---

## Candidate Stories

| Code | Story | Type | Outcome | Status |
|------|-------|------|---------|--------|
| [CV22.DS2.TS1](cv22-ds2-ts1-ts-package-scaffold/index.md) | TS Package Scaffold & Driver Seam | Technical Story | A compiling, linted, tested `ts/` package with the `node:sqlite` driver seam (read-only DB open + query) and a CI Node job; no Mirror command ported yet | ✅ Done |
| [CV22.DS2.TS2](cv22-ds2-ts2-golden-corpus-contract/index.md) | Golden-Corpus Contract & Frozen-`now` Harness | Technical Story | The language-agnostic oracle mechanism: a Python generator drives the real ranker with frozen `now` + frozen embeddings into committed synthetic goldens; TS verifier + BLOB/embedding decode consume them | ✅ Done |
| [CV22.DS2.US1](cv22-ds2-us1-search-command-parity/index.md) | `search` Command Parity | User Story | The hybrid ranker, promoted from the spike into a tested TS module, reaches ordered parity on synthetic goldens (CI) and a real-DB copy (manual) | ✅ Done |
| CV22.DS2.US2 | `detect-persona` Parity | User Story | TS `detect-persona` reproduces the Python routing score/threshold decision on the golden corpus | 🟡 Planned |
| CV22.DS2.US3 | Journeys & Memory Listing Parity | User Story | TS read of journeys and memory listing reproduces Python's ordered/behavioral output on the golden corpus | 🟡 Planned |

**TS1**, **TS2**, and **US1** are done — the `node:sqlite` seam, parity-critical decoders (`blobToFloat32`/`parseUtcMs`), synthetic golden-corpus generator, ordered-id grader, and durable TS hybrid ranker are in place. US1 extended the golden schema with the remaining ranker inputs (`use_count`, `relevance_score`, `access_count`, `last_accessed_at`, and lexical/text surface), proved synthetic parity in CI-level tests, and passed real-DB-copy parity across five probes. **US2–US3** follow at candidate level (expand-on-pull).

---

## Done Condition

- The `ts/` package exists, compiles (`tsc --noEmit`), lints (Biome), and tests
  (`node:test`) green; CI runs the Node job alongside Python.
- The `node:sqlite` driver seam opens a SQLite file read-only and queries it,
  with no other module importing `node:sqlite` directly.
- The frozen-`now` golden contract is in place and BLOB/embedding reads decode
  correctly.
- `search`, `detect-persona`, journeys, and memory listing reach proven
  ordered/behavioral parity with the Python oracle on synthetic goldens (CI) and
  on a real-`memory.db` copy (manual).
- Existing `memory.db` files work unchanged; the schema/FTS5 compatibility
  contract holds.

---

## Non-Goals

- No Pi front door yet (CV22.DS3) — DS2 produces a library, not a runtime surface.
- No write commands (CV22.DS4).
- No external-API commands — extraction, embeddings, consult (CV22.DS5).
- No schema or semantic change; FTS5/tokenizer behavior is inherited from the
  shared file.
- No npm build/publish pipeline or package rename (CV22.DS6).
- No new Python features — Python is maintenance-only from the CV21.E2.S2 baseline.

---

## See also

- [CV22 index](../index.md)
- [CV22.DS1 Hybrid-Search Parity Spike](../cv22-ds1-hybrid-search-parity-spike/index.md)
- [Decisions — database-seam strangler](../../../decisions.md)
- [Decisions — CV22 scaffolding](../../../decisions.md#cv22-typescript-core-scaffolding-nodesqlite-single-ts-package-node-24-biome)
- Parity harness: [`spikes/ts-search-parity/`](../../../../../spikes/ts-search-parity/)
</content>
</invoke>
