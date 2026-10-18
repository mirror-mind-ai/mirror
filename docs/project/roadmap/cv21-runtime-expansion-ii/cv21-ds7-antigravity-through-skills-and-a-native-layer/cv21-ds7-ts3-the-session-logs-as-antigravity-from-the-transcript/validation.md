# Validation — CV21.DS7.TS3

## Status

Passed

## Automated Checks

- node --test: 3302 pass 0 fail (agyTranscript reader 5 cases built from real probed shapes; agy:stop handler 6 cases incl. idempotency on the step_index high-water mark, skill-skip, absent transcript, and the returning-SessionStart orphan close; runtimePolicy antigravity-outlives-TUI; three-wrapper agy form-group; grown hooks.json guard); npx biome check clean; generate_hook_wrappers.sh --check in sync

Checks status: passed

## E2E

Decision: required

Evidence: Live on agy 1.4.2 in a scratch HOME (route.sh live, evidence sanitized). Obs1: hooks.log empty, two conversations each 1 user + 1 assistant labelled antigravity; the reader's omit-empty-reply rule fired correctly in the wild (one prompt hit agy's headless tool-denial and produced no final PLANNER_RESPONSE, so nothing was logged for it). Obs2: re-fired Stop added no rows (4==4); high-water marks stored. Obs3: a returning session-start with MIRROR_STALE_ORPHAN_MINUTES=0 closed both conversations. The probe corrected the plan's guess twice (PLANNER_RESPONSE not AGENT_MESSAGE; most steps empty), recorded in evidence/transcript-shape

## Navigator Validation

Route: 1) scratch Mirror DB holds both turns as antigravity, paired. 2) re-fire adds nothing. 3) returning SessionStart with orphan threshold 0 closes the conversations (antigravity in sessionOutlivesTui, the Codex path, since agy has no SessionEnd)

Navigator accepted: yes

Expected observation: each answered turn logged once as antigravity with its reply beside its prompt; a re-fired Stop adds nothing; the conversation closes and extracts via the stale-orphan path on a returning session start

Pass condition: paired antigravity rows, idempotent re-fire, closed conversation

Fail condition: a turn lost or duplicated, a mislabel, a re-fire adding rows, or a conversation that never closes on an agy-only machine

## Missing Evidence

- none
<!-- ariad-seal sha256:8b927e4498f33129d0e4850d761e0571bc40a906dcb68ff820d1ebdffa57d3c3 — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
