[< Story](index.md)

# Coherence — CV22.DS8.TS2

**Date:** 2026-09-13

## Process

Ariad lifecycle followed end to end: Pull with explicit item metadata,
automatic Prepare, Plan authored by the Driver against the real oracle, a
four-lens review (ai-engineer, prompt-engineer, security-engineer,
quality-assurance) whose five findings were folded into the plan before
approval, Navigator approval with D1 decided, implementation in five
plateaus with one green commit each, a hard stop (plateau 4½) honored before
the first live call, Navigator-run validation on database copies with
explicit acceptance, Debt Review deferred with triggers.

One stop condition fired and was honored: the Driver mis-attributed two
Python-produced rows as TypeScript-produced during validation step 8b/8c,
named the error in the same turn, corrected the record, and re-issued the
route; the seam was then proven on the right rows. The first live smoke's
transport failures were treated as a measurement gap (the class was not
captured) rather than guessed at; the tool was fixed and the re-run cleared.

Three runtime overwrites were caught and reversed (`coherence-item` did it
to this file too, after the paragraph below was written): `validate-item` replaced
the authored `validation.md` with its flag scaffold and `review-item` did the
same to `review.md`; both restored, and recorded as CR079's second data point
rather than a new CR. Closure docs were committed before `coherence-item` and
`done-item` ran, so any further overwrite is recoverable from a commit.

The collaboration strategy's single-owner rules held: plan review as the
standing second opinion, portable validation (every command in the test guide
runs on a copy), decisions in files (D1 in `decisions.md`), and no real-home
write.

## Project

Story package complete: index, plan (with the review folded in and recorded),
test-guide, validation, review, coherence, handoff. Burn-down ledger: the
replay-gated table reads `(none)`, the two leaves sit in the flipped table
with their revert variable and live evidence, the family row and the
production-reality note are current, and a History row records the plateau.
DS8 index: TS2 → Done (4/5), the done condition's first bullet marked met.
`decisions.md`: the D1 entry. Refinement: CR080 and CR081 captured under
RS010 in the file-first index (orders 38, 39), CR014's evidence updated with
the port's state of the three resolvers. `mm-consolidate` skill: the
Python-ceiling note replaced with the TS path's bounds. Worklog entry
written. `configuration.md` needed no change — `MIRROR_TS_CULTIVATION` was
already documented as covering `scan`.

## Product

`consolidate scan` and `shadow scan` send Python's real prompts from
TypeScript, byte-identical and digest-pinned, and answer live on an
unconfigured install with one variable reverting the tail. The user-facing
render is Python's shape; the rows the prompts produce are consumed by TS's
own `apply`. The `/mm-consolidate` and `/mm-shadow` skills already entered
through the front door, so the flip reaches the owner on the next run with no
skill change. Every ledger row is priced with bodies withheld; no key reached
any output. Sixteen replay-gated leaves at the start of DS8 → zero.

Next-pull readiness: DS8's remaining child is TS1, the `eval` ownership
decision; nothing in this story blocks it.
