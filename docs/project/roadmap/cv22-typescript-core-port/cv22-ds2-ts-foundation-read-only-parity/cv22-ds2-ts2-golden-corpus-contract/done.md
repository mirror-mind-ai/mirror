# Done — CV22.DS2.TS2

## Status

Done

## History Action

Golden-corpus contract & frozen-`now` harness implemented on branch
`mirror-ts-core`: the Python generator (drives the real `MemorySearch.search`
with `now` and the query embedding frozen), the parity-critical decoders
`blobToFloat32`/`parseUtcMs`, the golden loader + `orderedIdsMatch` grader, a
committed synthetic golden, and a CI determinism gate. Implementation commit
`1a40259` plus this closure commit; no push.

## Roadmap Update

CV22.DS2.TS2 marked Done in the DS2 Candidate Stories table; `done.md` added.
Validation (14/14 `node:test` green, `tsc` + Biome clean, deterministic golden)
and debt review (`no_action`) artifacts recorded alongside this story.

## Next Recommendation

Pull CV22.DS2.US1 (`search` command parity): promote the hybrid ranker into a
tested TS module and **extend the generator + golden schema** with the remaining
ranker inputs (`use_count`, `relevance_score`, `access_count`,
`last_accessed_at`, and the lexical/text surface) so the corpus can replay the
full ranker.

## Missing Done

- none
