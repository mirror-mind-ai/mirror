# Validation — CV22.DS7.US7

## Status

Passed

## Automated Checks

- cd ts && npm run typecheck && npx biome check . && npm test (1705 pass / 0 fail); uv run python -m pytest tests/unit/ tests/integration/ -m 'not live'; three golden corpora regenerated and byte-identical (git diff --exit-code ts/test/goldens/); write_parity.py --probe explorer_story and --probe explorer_handoff both overall_match: true on a real-DB copy; conversation_lifecycle_smoke.ts 200 checks green with NO gate in the environment; scripts/check_oracle_drift.py clean with four explore oracles registered; scripts/check_doc_links.py clean; GitHub Actions Tests+Docs green at c5176d9/f1eb4a1

Checks status: passed

## E2E

Decision: required

Evidence: Live Pi Explorer session on the real home, 2026-09-09 11:31-11:37 UTC: six commands, all routed explore/ts/exit=0, zero fell_back and zero Python fallback. One durable row created 11:32:21 and updated 11:36:12 -- the upsert inherited its id across four mutations rather than creating a row each time. The session built 870 chars of story, a 116-char summary, an experiment, and a multi-sentence attractor with accents and em-dashes that round-tripped intact. The Journey projection published once at the first write and correctly answered 'unchanged' afterwards, because refresh.py projects only stories that already carry a durable Builder handoff.

## Navigator Validation

Route: Pre-flip: nine both-engine comparisons across the three real journeys carrying Exploratory Stories -- mirror (active, 3.3KB legacy payload), mirror-gui (active, no project path), finances (promoted, payload inactive) -- running story show/list/snapshot under MIRROR_TS_EXPLORE=1 and =0 and diffing. Post-flip: a live /mm-explore session on a disposable journey with a project path, then front-door.log inspection and a projection timestamp check.

Navigator accepted: yes

Expected observation: All nine pre-flip diffs identical on populated surfaces of 13-75 lines, including the promoted-story path where an inactive legacy payload must not be resurrected. In the live session: the EXPLORER MODE ACTIVE card renders with its box intact, required-surface markers wrap each surface, Story Thickened and Attractors Emerging look unchanged, nothing stray printed inside a card, and the mode feels the same to work in.

Pass condition: Every pre-flip diff clean; live session surfaces unchanged to the Navigator's eye; front-door.log shows explore/ts with no fell_back; MIRROR_TS_EXPLORE=0 returns identical output on Python.

Fail condition: Any surface difference, any write divergence, any fell_back marker, any unredacted secret in a handoff document, or a projection that failed to publish when the compiled content changed.

## Missing Evidence

- none
