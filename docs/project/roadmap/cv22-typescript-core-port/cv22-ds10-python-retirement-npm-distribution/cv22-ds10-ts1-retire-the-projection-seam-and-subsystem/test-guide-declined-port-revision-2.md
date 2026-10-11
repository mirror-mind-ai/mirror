[< Story](index.md)

# Test Guide — CV22.DS10.TS1

## The Oracle

`tests/fixtures/journey_projections/operational/` — the CV23 normative fixture, imported
from the consumer's acceptance kit: a synthetic Journey (`journey/`, with roadmap,
exploration, and refinement documents and `ariad-active-work.json`) and the expected
`operational.json` and `manifest.json` under `expected/`. Fixed timestamp, snapshot, and
source-revision controls make the output deterministic.

Plateau 0 proves Python still reproduces `expected/` byte for byte on this machine before
any TypeScript exists. If it does not, stop: the oracle is broken, not the port.

The consumer probe itself is **not** here and is not run by this story.

## Automated Validation

| Area | What it proves |
|------|----------------|
| Canonical JSON | Key ordering, separators, Unicode escaping, and number formatting are byte-identical to `canonical_json_bytes` on every fixture document. A divergence here breaks every digest downstream |
| Compiler | The fixture compiles to `expected/operational.json` byte for byte, including CV23.DS8's confined parent-relative links; canonical escapes still reject |
| Store — publish | Staging, `fsync`, atomic replace, directory sync, `current.json`, and the receipt produce the expected bytes; `expected/manifest.json` matches |
| Store — inspect | Three-way divergence (document, manifest entry, receipt digest) fires when any one disagrees; accepts when all agree |
| **Adversarial matrix** (acceptance, not coverage) | Every refusal CV23.DS6 proved still refuses before any mutation, with bounded payload-free diagnostics: traversal in `journeyId`/`namespace`/`projection`; symlinked `current.json`, projection, receipt, or lock; a receipt or handoff path outside the Journey root (`UNSAFE_PROJECTION_PATH`); `probe-prepare`/`probe-publish` without `MEMORY_ENV=test`, without an explicit home, or against the configured production home; a non-probe `--actor-namespace`; `--target-namespace` attempting to select authority; an extension publishing into `ariad` or another extension's namespace |
| Store — failure | A failure after the projection is replaced restores both projection and manifest; the last valid pair stays byte-identical after a rejected publication |
| Lock — concurrency | N parallel Node publishers for one Journey serialize; the manifest always names an existing projection; no reader observes a half-replaced tree (port of the DS2 subprocess tests) |
| Lock — staleness | A lock left by a killed process is taken within bound; a lock whose owner is alive is never taken regardless of age |
| Coordinator | `published` when `sourceRevision` changed, `unchanged` when not, `failed` without raising; per-Journey serialization; the outcome record written on every path |
| Post-commit boundary | A forced compile/publish failure leaves the requesting write committed, stdout clean, and no exception escaping |
| Command | The five operations answer with the same JSON shape and exit codes as Python; `capabilities` reports contract `1.0`, Extension API `1.1`, and exactly five operations; `refresh` is an unknown operation |
| Cross-engine (plateau 5) | Python's `journey-projection inspect` reports ok on a TypeScript-published scratch tree |
| No-spawn guard | After the flip, no TypeScript path spawns `uv`/Python for a refresh |

Run with `npm test` for the TypeScript suites and `uv run pytest` for the Python side while
it still exists.

## E2E Decision

**Required.** A fixture proves bytes; only a real runtime write through the real front door
proves that the seam is gone and the outcome is visible.

## Navigator Validation

1. **Bytes.** Run the fixture through the TypeScript `journey-projection` command with the
   fixed controls; diff the published tree against `expected/`.
   Pass: zero bytes differ. Fail: any byte.
2. **Cross-engine, before deletion.** Python `journey-projection inspect` on the tree
   TypeScript just published. Pass: `ok`. Fail: `PROJECTION_DIVERGENCE`.
3. **Liveness, on this repository.** Note the current `sourceRevision` in
   `.mirror/projections/current.json`. Run a Builder lifecycle transition on the active
   story — the same kind of write that published `"activeItem": "CV22.DS10.TS1"` through
   Python on 2026-09-19.
   Expected observation: `current.json` and `ariad/operational.json` update and the
   `sourceRevision` changes; `uv` is never invoked; nothing about the refresh reaches
   stdout; `runtime diagnose` shows `published` with a fresh timestamp. Run the same
   write again: `unchanged`, no rewrite.
   `.mirror/projections/` is gitignored here (`.gitignore:27`) — the evidence is the files
   and the `diagnose` row, not `git status`.
   Pass: all of the above. Fail: any spawned Python, any refresh output on stdout, a write
   failed by its refresh, or a `diagnose` row that does not move.
4. **Failure visibility.** Force a compile failure (for example an unreadable roadmap
   index); run a write. Pass: the write commits, the tree is unchanged, `diagnose` shows
   `failed` with the error code. Fail: the write fails, the tree changes, or `diagnose`
   still says `published`.

## Validation Evidence

Pending implementation and validation.
