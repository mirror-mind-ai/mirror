[< CV22.DS2 TS Foundation & Read-Only Command Parity](../index.md)

# CV22.DS2.TS2 — Golden-Corpus Contract & Frozen-`now` Harness

**Status:** ✅ Done
**Type:** Technical Story
**Delivery Story:** CV22.DS2 — TS Foundation & Read-Only Command Parity
**Depends on:** [CV22.DS2.TS1 TS Package Scaffold & Driver Seam](../cv22-ds2-ts1-ts-package-scaffold/index.md) (done)

---

## Technical Story

In order to prove TS/Python parity without false mismatches from non-determinism,
As the CV22 strangler substrate,
I want a language-agnostic golden-corpus contract that freezes the ranker's two
impure inputs (`now` and embeddings) and a TS verifier that decodes and consumes it,
So that every ported read command (DS2.US1–US3) can be validated against the
Python oracle by comparing ordered ids, not wall-clock- or float-sensitive scores.

## Outcome

The oracle mechanism the rest of DS2 depends on exists and is committed:

1. **Python generator** — drives the *real* ranker (`MemorySearch.search`, not a
   re-derivation) with `now` frozen to a fixed timestamp and embeddings frozen to
   committed vectors, and emits a synthetic golden corpus (inputs + expected
   ordered ids) as committed fixtures.
2. **TS verifier** — reads the same goldens, replays the frozen inputs through the
   TS side, and asserts ordered-id parity.
3. **Decode helpers** — `blobToFloat32` (embedding BLOB → `Float32Array`) and
   `parseUtcMs` (stored timestamp → epoch ms) promoted from the DS1 spike into
   tested TS modules behind the driver seam.

The corpus is **synthetic** (no personal data) so it is safe to commit and runs in
CI. The real-`memory.db` parity check stays a manual pre-merge gate (DS2.US1–US3).

## Acceptance Behavior

```text
Given the Python golden generator with a frozen `now` and frozen embeddings
When it drives the real MemorySearch ranker over the synthetic corpus
Then it writes committed golden fixtures containing the inputs and the expected ordered ids
And re-running the generator produces byte-identical fixtures (deterministic)
```

```text
Given committed golden fixtures and the TS verifier
When the verifier replays the frozen inputs through the TS decode + compare path
Then the TS ordered ids match the golden ordered ids exactly
And the check runs under `node:test` in CI with no network and no real database
```

```text
Given an embedding BLOB and a stored UTC timestamp from the corpus
When `blobToFloat32` and `parseUtcMs` decode them
Then the decoded vector and epoch-ms match the Python-side values within the
     documented tolerance (ordered-id stability, not bit-identical floats)
```

## Scope

- A Python golden generator that invokes the real ranker as the oracle with
  frozen `now` and frozen embeddings, emitting committed synthetic fixtures.
- A documented, stable on-disk golden format (inputs, frozen `now`, expected
  ordered ids).
- A TS verifier under `node:test` that consumes the goldens and asserts ordered-id
  parity.
- `blobToFloat32` and `parseUtcMs` as tested TS modules that only the ranker/verifier
  consume (no direct `node:sqlite` coupling beyond the DS2.TS1 driver seam).
- CI wiring so the verifier runs in the existing Node job.

## Out Of Scope

- Porting `search`, `detect-persona`, journeys, or memory listing — those are
  DS2.US1–US3, which *use* this contract.
- Real-`memory.db` parity execution — that is the manual pre-merge gate exercised
  by the command stories, not this contract story.
- Any write command (CV22.DS4), external-API/embedding path (CV22.DS5), or Pi
  front door (CV22.DS3).
- Schema, FTS5, or tokenizer changes — inherited unchanged from the shared file.

## Validation

- Automated: `node:test` verifier is green in CI over the committed synthetic
  goldens; the Python generator is deterministic (re-run diff is empty).
- Navigator-visible: regenerating the corpus and running the verifier demonstrates
  ordered-id parity on a frozen, reproducible fixture set with no wall-clock or
  float flakiness.

---

## Artifacts

- [Plan](plan.md)
- [Test Guide](test-guide.md)
- [CV22.DS2 index](../index.md)
- [CV22.DS1 Hybrid-Search Parity Spike](../../cv22-ds1-hybrid-search-parity-spike/index.md)
- [Decisions — CV22 scaffolding](../../../../decisions.md#cv22-typescript-core-scaffolding-nodesqlite-single-ts-package-node-24-biome)
