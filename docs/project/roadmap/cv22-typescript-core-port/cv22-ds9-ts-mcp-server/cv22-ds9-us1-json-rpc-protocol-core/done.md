# Done — CV22.DS9.US1

## Status

Done

## History Action

Four commits on mirror-ts-core, one per plateau plus the plan: f4f4ad69 (plan + threat model), dcc5d465 (plateau 1, oracle frozen), 1eda003e (plateaus 2-3, port + tests), and the docs-alignment commit that follows this checkpoint. Pushed; Actions 35233356175 green on parity, test 3.10, test 3.12, ts ubuntu-latest, and ts macos-latest — the platform where the drain hazard lives.

## Roadmap Update

US1 index marked Done with what was delivered and the deferred debt; DS9 package status moved to 1/4 with the US1 candidate row completed and an 'inherited by the remaining three' note (threat model, golden, drift coverage, registry seam, wire.ts); CV22 index status line and DS9 row updated; worklog entry added.

## Next Recommendation

Pull CV22.DS9.US2 — wire the seven tools to the TS capabilities that already exist (loadMirrorContext, journey listing/status, searchMemories, conversation listing and the find_by_id_prefix port in recall.ts, detectPersona), graded byte-exact through wire.ts against Python payloads (ensure_ascii=False, indent=2, default=str). Two invariants travel with it: log_access=false on search_memories but reinforcement preserved on mirror_context (they differ per tool), and the limit semantics recorded in the golden that TS1 will cap. No release boundary — CV22 releases once, at the end.

## Missing Done

- none
