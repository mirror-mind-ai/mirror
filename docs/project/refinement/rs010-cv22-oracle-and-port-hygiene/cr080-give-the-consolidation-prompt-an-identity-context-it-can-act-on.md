[< RS010](index.md)

# CR080 — Give the consolidation prompt an identity context it can act on

**Status:** captured
**RS:** RS010
**Driver:** —
**Delivery:** —

## Problem

`CONSOLIDATION_PROMPT` (`src/memory/intelligence/prompts.py`, ported
byte-identical to `ts/src/extraction/prompts.ts` by CV22.DS8.TS2) shows the
model a "Current identity context (for reference when proposing updates)" and
then, under `IDENTITY_UPDATE`, asks it to "be surgical: propose the exact
paragraph or sentence to insert or replace, not a full rewrite." Two things
about that context block work against the instruction.

**The context is a fragment.** `consolidate_cmd._identity_context` (ported as
`consolidationIdentityContext`) takes the first 600 code points of
`ego/behavior`, `ego/identity`, and `self/soul`. The owner's layers run to
several thousand characters each. A `replace` proposal against text the model
never saw cannot be made well; an `insert` cannot be placed relative to
sections it does not know exist. The instruction asks for surgery on a
patient the model sees the first paragraph of.

**The context outranks the prompt.** The seeded layers open with H1 headings
— `# Behavior`, `# Identity`, `# Soul` — and are injected under an H2
(`## Current identity context`). Read as Markdown, `# Soul` becomes the
document's top-level section and everything after it — `## Untrusted input`,
the fenced `## Memory cluster`, `## Three possible actions`, the output
contract — nests under the user's soul heading. The guard was written to sit
above the data at the prompt's own level; the injected content demotes it.

Both were observed during CV22.DS8.TS2's plateau-4½ prompt-engineer reading
of the assembled prompt, rendered from a synthetic golden scenario. The
findings are about Python's text; the port reproduced it exactly, which is
what a parity story must do.

## Expected Behavior

An `IDENTITY_UPDATE` proposal can name what it replaces because the model saw
it, and the prompt's own structure is not rewritten by the content it embeds.

The shape of a fix is a decision, not a given:

1. **Show more, or show differently.** Full layers cost tokens on every
   cluster (the extraction model is cheap; three layers of ~3k characters is
   ~2.5k tokens per call). Alternatives: pass only the layer the cluster's
   memories share (`layer` is on every memory), or pass section headings plus
   the first paragraph of each so the model can *locate* an insert even when
   it cannot quote a replace.
2. **Demote the injected headings.** Indent the context block, strip its
   leading `#`s, or fence it as `<identity_context>` data the way the cluster
   is fenced — with the explicit note that it is system-side, not untrusted.
   Fencing it would also make the prompt's structure self-describing.

Either way, the change lands in TypeScript first (the command is ported and
TS is the authority for it since 2026-09-13), Python follows or is left
compatibility-only, and the prompt-assembly golden is regenerated in the same
commit so the digests keep meaning something.

## Impact

Output quality on the highest-stakes action the cultivation family has:
`identity_update` writes structural identity after the owner accepts. Today
the model is set up to propose vague updates ("add a paragraph about X")
where the prompt asks for exact text, and the owner does the surgery by hand
at `apply --content`. No correctness or spend risk; the prompt provably
produces valid, applicable proposals (three `merge`s and three shadow
observations in the TS2 validation).

## Plan Or Decision

Not planned. Needs a probe before a rewrite: run the same clusters through
the current fragment and through a full-layer (or fenced) context and compare
the `identity_update` proposals a prompt engineer would accept. The
600-code-point cap was a token-budget guess when the extraction model was
dearer; the number should come from the probe, not be inherited.

**Which harness the probe runs on** ([CV22.DS8.TS1](../../decisions.md#the-eval-harness-transfers-to-typescript-as-a-ds10-gate-not-a-ds8-port)):
`evals/consolidate.py` before the harness transfers, `ts/evals/` after. Either
way the prompt change lands in TypeScript first (the command is ported and TS
is its authority), and a prompt change re-arms the model-behavior release gate,
so this CR carries a green `eval --all` or a recorded waiver.

## Evidence

_Pending._

## Outcome

_Pending._

## Provenance

Found 2026-09-13 in the
[plateau-4½ reading](../../roadmap/cv22-typescript-core-port/cv22-ds8-live-provider-cutover/cv22-ds8-ts2-port-the-cultivation-prompt-templates/validation.md#plateau-4--prompt-engineer-reading-2026-09-13-before-any-live-call)
of CV22.DS8.TS2, deferred in that story's
[Debt Review](../../roadmap/cv22-typescript-core-port/cv22-ds8-live-provider-cutover/cv22-ds8-ts2-port-the-cultivation-prompt-templates/review.md)
with this CR as the revisit trigger.
