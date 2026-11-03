# Validation — CV9.DS9.US3

## Status

Passed

## Automated Checks

- npm test: 3551 pass, 0 fail; npm run lint: clean (one pre-existing warning); npm run typecheck: clean. Gate: eval --all on Flash Lite before the swap 9/9 (suite e5f63110), eval --all on Haiku at none after it 9/9 with the one expected probe failure, extraction/conversation-summary, module 10/11 (suite 39b9c9d7); every module's prompt_hash equal; eval extraction --history labels the flip (model and reasoning changed). Evidence in the package's evidence/2026-10-28-gate/.

Checks status: passed

## E2E

Decision: required

Evidence: The Navigator ended a 4-message conversation (70f7dcda) in a Pi session on the development home at 22:57:02Z. llm_calls: conversation_title, conversation_summary, conversation_tags on anthropic/claude-haiku-5.5, cost_usd non-null on all three; the conversation has a title (64 chars), 5 tags, and an 844-char summary. Earlier the same day: extraction and task_extraction on Haiku at 67k prompt tokens, priced.

## Navigator Validation

Route: 1. mirror runtime status: Models line names anthropic/claude-haiku-5.5, reasoning=none (model default). 2. End a substantive conversation in a Pi session on the development home; its llm_calls rows name Haiku with non-null cost, and it has title, tags, summary; empty title is a fail. 3. MEMORY_EXTRACTION_MODEL=google/gemini-2.5-flash-lite mirror runtime status: Flash Lite, no reasoning clause. 4. Read the decision entry in docs/project/decisions.md and release-note.md in the package.

Navigator accepted: yes

Expected observation: Step 1 and 3 lines as stated; step 2 rows on Haiku, priced, titled; step 4 records say what was decided, why, and how to roll back naming the file and the check.

Pass condition: All four steps as expected; the rollback line shows no reasoning clause; no null cost, no Flash Lite row, no empty title.

Fail condition: A Flash Lite row with no override, a null cost_usd, an empty title, a reasoning clause on the rollback pin, or records that do not name the decision or the rollback file.

## Missing Evidence

- none
<!-- ariad-seal sha256:a5b7a6620c2f00ef6053e6e9609bd7c832a7a0f4e50bb3fe079f9d9438432067 — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
