# Coherence — CV22.DS9.TS1

## Status

Coherent

## Process Alignment

Ariad story_by_story flow followed end to end: Pull -> Prepare -> Plan (seven lenses, all seven dissenting, each dissent folded in before the Plan was presented) -> Navigator approval with D2 and D9 decided -> four TDD plateaus, each red first, each mutation-tested, each its own commit -> Validation run twice by the Navigator, the first run failing usefully and driving a wording correction -> Debt Review with two CRs captured and one strengthened. The collaboration strategy's rule held where it mattered: the panel was the second opinion a single owner does not otherwise have, and three of its dissents (the two-facts-in-one-column marker, the conflated refusal intents, the vacuous cost assertion) would each have shipped a defect. CI green at 59942810 on all five jobs; every push verified with gh.

## Project Alignment

Docs match behaviour, including where behaviour changed late. configuration.md carries the gate, the tunables, the corrected refusal text, why the default is a rate and not a budget, and -- corrected after measurement -- where a refusal actually appears for a given client, since Claude discards a connected server's stderr. REFERENCE.md carries MIRROR_TS_MCP_GUARDS. US1's threat model records items 1-3 as owned rather than pending, including the honest limit that a cap bounds one call and not a sequence. The refinement field gained CR087 and CR088 and CR084 gained its first CI reproduction. The story package (index, plan, test-guide, validation, review) records both E2E sessions, including the one that failed.

## Product Alignment

An agent can no longer spend without bound through the MCP surface: a shared sliding window across every MCP client, counted from rows attributed to this surface so the user's own session closes never refuse the agent, and refusals that a real model was observed to obey rather than route around. Argument bounds close the cheapest exfiltration shape the surface offered -- limit=0 returning an entire transcript -- while the tools themselves stay Python-faithful, so the oracle's behaviour and the refusal are both visible and MIRROR_TS_MCP_GUARDS=0 restores the former. Free reads remain free, tools/list is untouched so no client re-negotiates, and spend is now legible through inspect llm-calls. DS9 closes at 4/4 and the plugin has the gate it needed before it can be distributed beyond its author.

## Local Guide Differences

- none

## Missing Coherence

- none
