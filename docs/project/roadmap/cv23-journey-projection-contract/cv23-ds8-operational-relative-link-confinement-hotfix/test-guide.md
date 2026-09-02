[< Story](index.md)

# Test Guide — CV23.DS8

## Aggregate Validation

1. Focused TDD proves same-directory, one-parent, multi-parent, confined
   directory, canonical escape, absolute, URI-like, backslash, symlink escape,
   missing target, and last-valid preservation cases.
2. An isolated fixture reproduces the Nautilus CV package linking a root-level
   Delivery Story and rebuilds through the public source CLI.
3. Existing Operational schema, exact golden, publication, refresh, and
   subprocess concurrency tests remain green.
4. Current Nautilus source compiles read-only without modifying its projection.
5. Immutable consumer-kit hashes and all 16 self-tests remain unchanged.
6. After explicit release authorization, central CI, installed-runtime rebuild,
   manifest inspection, and Operational snapshot advancement open the return
   gate.

## Child Work Packages

- CV23.DS8.TS1

## Navigator Validation

The Nautilus agent runs its unchanged repository-baseline/rebuild route against
the installed patch. Pass means the command exits zero, `operational.json`
advances to current Ariad truth, manifest inspection names the new snapshot, and
TD-001 can close. Any stale snapshot, unbounded path acceptance, altered source,
or workaround link rewrite fails validation.

## Validation Evidence

Source implementation evidence complete:

- 31 focused Operational compiler tests pass, including the full confinement
  matrix, directory symlink escape, and missing-target last-valid preservation.
- Public isolated `rebuild-operational` regression passes through the guarded
  CLI fixture.
- 117 projection/CLI unit and subprocess integration tests pass.
- The complete Python suite passes.
- Ruff over `src` and `tests`, format, focused mypy, docs links, and diff checks
  pass. A repository-wide Ruff invocation additionally reports four unrelated
  pre-existing findings under `spikes/ts-search-parity/`; release scope does not
  absorb that spike debt.
- Current Nautilus Harness source compiles read-only as three roots (`CV-001`,
  `CV-002`, `CV-003`) with source revision
  `sha256:bb06244597f3d4f78815f0195d5cfa233932dcefc37d61488aebaed03baa2645`;
  consumer projection files and worktree remain unchanged.
- Consumer-kit hashes remain unchanged and all 16 self-tests pass.

Release and installed-consumer evidence complete:

- `v0.31.11` is immutable at
  `c9519c30caac1522209a56840a09dabc123cead0`; `main`, `stable`, and the tag
  matched at promotion, and the GitHub Release is public.
- Central Tests, Docs, main Windows packaging, and tagged Windows packaging all
  passed at the exact release commit.
- A verified production backup preceded consumer execution.
- The stable installation reports `0.31.11`, Core migrations `16/16`, extension
  health ready, and runtime status ready.
- The unchanged installed `rebuild-operational` command published snapshot
  `op-59d36a08c142494c88c12ecb5fcbf105` at source revision
  `sha256:222aa1214a54c8059c7689daf21d6b98f128277a2462b79fd908ca49dc5d6c93`.
- Installed inspection matches the rebuilt document and manifest exactly and
  represents roadmap roots `CV-001`, `CV-002`, and `CV-003`.
- Bounded return evidence is available to the Nautilus agent as
  `td-001-mirror-return.json`; no consumer source link was rewritten.
- Post-install consumer-kit hashes remain unchanged and all 16 self-tests pass.

Navigator accepted the installed validation on 2026-08-26. Mirror-side delivery
is closed with no new debt; `td-001-mirror-return.json` is the durable handoff for
the Nautilus agent's consumer-owned ledger closure.
