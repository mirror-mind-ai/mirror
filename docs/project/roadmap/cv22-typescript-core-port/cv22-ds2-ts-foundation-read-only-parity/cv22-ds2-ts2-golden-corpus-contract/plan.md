[< Story](index.md)

# Plan — CV22.DS2.TS2 Golden-Corpus Contract & Frozen-`now` Harness

## Pull

Pulled at Technical Story level. TS2 is the next implementable unit of CV22.DS2:
the golden-corpus contract is the substrate the command-parity stories
(DS2.US1–US3) validate against, so it must land before any command is ported. It
is internal substrate with no user-facing behavior, which is why it is a Technical
Story rather than a User Story.

## Prepare

Context: DS2.TS1 delivered the `ts/` package and the `node:sqlite` driver seam
(read-only open + query). The DS1 spike already characterized the oracle and
proved ordered-id parity on 480 real memories with a ~1,700× margin over the
closest near-tie; its throwaway helpers (`generate_golden*.py`, `parity*.ts`,
`blobToFloat32`, `parseUtcMs`) are the reference to promote — not extend in place.

Load-bearing rules from the DS1 findings:

- The ranker is **not pure**: `recency` and `reinforcement` read `datetime.now()`.
  The contract must freeze `now` on both sides.
- Lexical is **ordinal**: `1/(1+i)` over bm25 order, so only bm25 *ordering* parity
  is required.
- Success metric is **ordered ids**, not bit-identical scores (float32 numpy vs
  float64 JS).

Risks: (1) a golden format that leaks wall-clock or float sensitivity would create
false mismatches — mitigated by freezing both impure inputs and comparing ids;
(2) accidental inclusion of personal data — mitigated by keeping the committed
corpus fully synthetic and leaving real-DB checks to the manual gate.

## Scope

- Python golden generator driving the real ranker with frozen `now` + embeddings.
- Stable committed synthetic golden format.
- TS `node:test` verifier asserting ordered-id parity.
- Tested `blobToFloat32` / `parseUtcMs` TS modules behind the DS2.TS1 seam.
- CI wiring in the existing Node job.

## Non-Goals

- Porting any Mirror command (DS2.US1–US3 consume this contract).
- Real-`memory.db` parity execution (manual pre-merge gate in the command stories).
- Writes (DS4), external-API/embedding path (DS5), Pi front door (DS3).
- Schema/FTS5/tokenizer changes.

## Implementation Approach

1. Promote the DS1 generator into a supported `ts/`-adjacent Python generator that
   invokes `MemorySearch.search` as the oracle with injected frozen `now` and a
   fixed synthetic embedding set; emit committed fixtures.
2. Define and document the golden on-disk format (inputs, frozen `now`, expected
   ordered ids).
3. Implement `blobToFloat32` and `parseUtcMs` as tested TS modules; wire them
   through the DS2.TS1 driver seam only.
4. Implement the TS verifier under `node:test`; assert ordered-id equality.
5. Add the verifier to the CI Node job; keep the Python job green.

## Test Strategy

- Automated: `node:test` verifier over committed goldens (CI); Python generator
  determinism check (re-run diff empty); unit tests for the decode helpers.
- Manual: none required for TS2 — real-DB parity is deferred to the command stories.

## Validation Route

Regenerate the synthetic corpus and run the verifier; observe ordered-id parity on
a frozen, reproducible fixture set with no wall-clock or float flakiness. Pass =
verifier green and generator deterministic; fail = any ordered-id mismatch or
non-deterministic regeneration.

## Checkpoint

Implementation must not start until the Navigator approves this plan.
