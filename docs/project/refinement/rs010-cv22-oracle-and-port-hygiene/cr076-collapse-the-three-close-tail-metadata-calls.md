[< Refinement Workbench](../index.md) · [RS010](index.md)

# CR076 — Collapse the three close-tail metadata calls into one

**Refinement Story:** RS010 — CV22 Oracle And Port Hygiene
**Status:** captured
**Driver:** —
**Delivery:** —

## Problem

The close tail sends the **entire transcript three separate times** — once for
`conversation_title`, once for `conversation_summary`, once for
`conversation_tags` — and each call pays for the full prompt again.

Measured on a real session close (2026-09-11, this home), the first live one:

| Role | Prompt tokens | Cost |
|------|--------------:|-----:|
| `conversation_title` | 22,411 | $0.0022 |
| `conversation_summary` | 22,779 | $0.0022 |
| `conversation_tags` | 22,959 | $0.0022 |
| `extraction` | 22,412 | $0.0027 |
| `task_extraction` | 22,011 | $0.0024 |

The three metadata roles together cost **as much as extraction and task
extraction combined**, for three answers that are each a few dozen tokens long
and are all derived from the same input. Roughly 68k prompt tokens are spent
where ~23k would do.

This is not a TypeScript defect — the Python engine has the identical shape,
and CV22.DS8.US2 ported it faithfully, prompt digests and all. It became
visible because DS8 made the close tail's spend legible for the first time:
before the cutover these rows were written with a null cost, so the pattern
was in the data but not in the ledger.

## Expected Behavior

One call produces title, tags, and summary together as a structured object,
with the same fences, the same AI-24/AI-25 guards, and the same per-field
status/source metadata the lifecycle already records. Per-close metadata spend
falls by roughly two thirds. If a single call proves less reliable than three
focused ones, that outcome is itself worth recording — but it should be
measured, not assumed in either direction.

## Impact

Medium, and proportional to use: every session close pays it. At ~$0.0066 per
close for metadata alone, a heavy day of sessions is a real line item, and the
cost scales with transcript length exactly where long sessions are most
valuable to summarise.

The reliability question cuts both ways and needs an eval, not an opinion:
three narrow prompts may parse more reliably than one wide one. The
`parse_failed` history on this home (3 conversations, Jul–Sep) is the baseline
to beat.

## Plan Or Decision

Not planned. This is **prompt and orchestration work, not transport work** —
it changes what the model is asked, so it belongs to the prompt engineer with
an ai-engineer eval, and it must not be smuggled into a cutover story whose
whole contract is that the graded prompts travel byte-for-byte.

Natural sequencing: after DS8 completes, when every surface is live and the
ledger shows a full picture of real spend.

## Evidence

- `llm_calls` on this home, conversation `6272710d`, 2026-09-11.
- `ts/src/extraction/conversationMetadata.ts` — three prompts, three calls.
- `src/memory/services/conversation.py` — the same three on the Python side.

## Outcome

Open.
