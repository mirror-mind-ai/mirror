# Coherence — CV22.DS9.US2

## Status

Coherent

## Process Alignment

Ariad followed at story level under story_by_story: Pull → Prepare → Plan with a three-lens review (engineer, quality-assurance, database-architect) whose dissents each changed the plan before it was presented → Navigator approval plus D1 → five plateaus, one commit each → Validation accepted on a route the Navigator ran → Debt Review deferring four findings with reasons and triggers. Four Navigator decisions were taken at the points where they were genuinely his (D1 fix-Python-first, D10 score tolerance, D12 read-only open, and the handling of the memories --search defect), and each is recorded where the next story will read it rather than in conversation.

## Project Alignment

Docs and code agree. The US2 package carries index, plan (with D1-D12, the corrected D6, and the scope amendment), test-guide with the evidence and the mutation table, and validation; the DS9 index shows 2/4 with TS1 marked blocked on TS2's decision; the CV22 index and the DS8.US1 inbound correction are updated; CR086 is captured against RS010 with Current Focus untouched. Three goldens are in the determinism gate, src/memory/mcp/{server,tools}.py are in the oracle-drift baseline, and the two validation scripts are committed so the route is runnable by someone who did not write it.

## Product Alignment

The user-visible product is unchanged, as intended at this stage — main.ts is referenced by nothing until TS2, and python -m memory mcp still serves Claude through the plugin manifest. Two real improvements did land for users: journey_status no longer returns 3.2MB of Pydantic reprs and vector bytes on a no-slug call, and memories --search stopped teaching the ranker from its own exhaust, restoring the AI-12 behavior Python has had since July. The MCP tool surface now has a TypeScript implementation proven byte-identical on a fixture and on a copy of the real database, with one recorded exception (D10).

## Local Guide Differences

- none

## Missing Coherence

- none
