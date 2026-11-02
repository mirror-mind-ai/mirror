[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR184 — The extraction eval's prompt hash excludes the summary prompt its probe sends

## Problem

`ts/evals/extraction.ts` declares `EVAL_PROMPTS = [EXTRACTION_PROMPT,
TASK_EXTRACTION_PROMPT, CURATION_PROMPT]`, "matching Python's tuple exactly", so its
records' `prompt_hash` would stay comparable with the oracle's. Its
`conversation-summary` probe sends `CONVERSATION_SUMMARY_PROMPT`, and its
`descriptor-quality` probe sends the descriptor prompt; neither is in the hash. When
CR180 changed the summary prompt on 2026-10-28, the extraction module's hash stayed
`98196244a3f9` across the change, so `eval extraction --history` could not label the
`conversation-summary` flip as a prompt change, and the playbook's
configuration-attributable signal was unavailable for the one probe that moved. The
`conversation_summary` module, which declares the prompt, moved as expected.

## Expected Behavior

A module's `prompt_hash` covers every prompt its probes send, so a flip on any probe
is attributable to a prompt change by `--history`. The oracle comparison that
justified the narrower tuple retired with the Python core (CV22.DS10.TS5).

## Impact

Low: the hash is a label on eval records, and the `conversation_summary` module
carries the summary prompt's hash. The cost is a misleading "no configuration change"
on an `extraction` flip caused by a summary or descriptor prompt edit.

## Plan Or Decision

Captured, unassigned, 2026-10-28, from CR180's implementation. When pulled: add
`CONVERSATION_SUMMARY_PROMPT`, `SUMMARY_RETRY_NOTE`, and the descriptor prompt to
`EVAL_PROMPTS`, note in the module why the tuple grew, and accept that the next
record's hash differs from every earlier one, labelled as a prompt change once.

## Evidence

- `ts/evals/extraction.ts`, `EVAL_PROMPTS` and its comment.
- CR180's evidence: the module's hash unchanged across three prompt edits.

## Outcome

Pending: captured, not planned.
