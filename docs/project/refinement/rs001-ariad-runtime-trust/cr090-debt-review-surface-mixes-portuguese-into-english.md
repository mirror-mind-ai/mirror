[< Refinement Workbench](../index.md) · [RS001](index.md)

# CR090 — The Debt Review surface mixes Portuguese into an English sentence

**Refinement Story:** RS001 — Ariad Runtime Trust
**Status:** captured
**Driver:** —
**Delivery:** —

## Problem

`DEBT_REVIEW_STARTED` renders:

```text
If there is no relevant debt to address now, I can record this as sem ação
necessária and continue toward closure.
```

An English sentence with a Portuguese noun phrase inside it. The string is
hardcoded in both engines — `ts/src/builder/commands.ts:1677` and
`src/memory/cli/build.py:721` — and the TypeScript is a faithful port, so this is
a Python-era defect that parity carried across rather than one the port
introduced.

The project's hard constraint is that Mirror answers in English regardless of the
language the Navigator writes in. A deterministic runtime surface is the one place
that constraint should be trivially satisfied: the text is not generated, it is
typed into the source.

Found on 2026-09-19 while closing CV22.DS10.US1, in the surface that was rendering
that story's own Debt Review.

## Expected Behavior

The surface reads in one language. `sem ação necessária` becomes `no action
needed` — which is also the vocabulary the runtime already uses everywhere else
for that decision (`--decision no_action`, rendered as `no_action` in
`DEBT_REVIEW_CHECKPOINT`).

While auditing it, check the neighbouring Ariad surfaces for the same class:
`transition.ts` carries `descrição` and `contexto` in `QUERY_SECTIONS`, which is
different — those are *input* section names matched against project documents that
may legitimately be Portuguese, not output text. The rule to apply is "output is
English; inputs may be anything", not "no Portuguese in the file".

## Impact

Cosmetic, and small — but in the surface whose job is to be trusted verbatim.
Ariad surfaces are `transport=verbatim`: the agent is forbidden from rewording
them, so a mixed-language sentence reaches the Navigator exactly as written, and
the one actor who could smooth it over is explicitly instructed not to. It also
appears in a checkpoint a Navigator reads at every story closure.

## Plan Or Decision

Not planned. Captured during CV22.DS10.US1's Debt Review with the Navigator
present, and deliberately not folded into that story, which owns the web console's
deletion and nothing else.

One real question for whoever plans it: **both engines, or TypeScript only?**
The Builder tree has been TS-owned since CV22.DS7.US8 and Python is
compatibility-only there, which argues for fixing TypeScript alone. But the
cross-engine corpus compares Builder surfaces byte for byte, so a one-sided change
either breaks that comparison or requires the corpus to absorb a deliberate
divergence — the same shape as [CR074](../rs010-cv22-oracle-and-port-hygiene/cr074-harden-the-week-plan-pending-file.md),
which must change both engines together or the proof breaks. Cheapest honest
option is probably both, since the Python string is four words and dies at
CV22.DS10.TS5 anyway.

## Evidence

```text
$ node --env-file=.env ts/src/frontDoor/cli.ts build validate-item ... --navigator-accepted
...
<<<ARIAD:DEBT_REVIEW_STARTED>>>
│ Navigator check                                        │
│ If there is no relevant debt to address now, I can     │
│ record this as sem ação necessária and continue toward │
│ closure.                                               │
```

- `ts/src/builder/commands.ts:1677`
- `src/memory/cli/build.py:721`

## Outcome

Open.
