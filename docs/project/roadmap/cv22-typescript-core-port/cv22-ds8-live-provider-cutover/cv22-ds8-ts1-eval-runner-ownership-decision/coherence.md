[< Story](index.md)

# Coherence — CV22.DS8.TS1

**Date:** 2026-09-13

## Process

Ariad lifecycle followed end to end: Pull with explicit metadata, Prepare,
Driver-authored Plan with the decision's evidence as a table, Navigator
approval with D1 (panel skipped by proportionality — no code, no provider, no
spend) and D2 (`routing`/`scene` dispositions named, not decided), one
implementation plateau, Navigator-run E2E, Navigator acceptance, Debt Review
deferred with triggers.

No stop condition fired. The one that could have — "the `eval --all` run
contradicts the interim-gate assumption" — was tested rather than assumed, and
the assumption held (11/12, `routing` alone, matching the recorded score to the
digit).

Two Driver lapses are recorded in [review.md](review.md) with their correctives
rather than left in the conversation: a doc anchor committed broken for the
second time in two stories, and an Ariad surface truncated by a pipe for the
second time — the latter irrecoverable, since `plan-item`'s checkpoint could not
be re-emitted once the event was consumed.

The panel skip was recorded as a decision, not taken as a default, and the
ai-engineer lens that replaced it is what reframed the story: the candidate row
asked "port or retire" and the measurement answered "the subject moved."

## Project

Story package: index, plan, test-guide, validation, review, coherence, handoff.
`decisions.md` carries the entry with its measurements. DS10's index carries the
new **Eval Harness Deletion Gate** (six items) plus a Done Condition bullet, in
the shape its four existing gates use — DS10 has no candidate table, so a gate
is the authoring form that package actually uses, and a gate blocks where a
backlog row would only remind. The burn-down ledger attributes `eval` to DS10
in all three places it appears. The development guide states what the release
gate measures, what it cannot see, and the standing D-005 waiver; the
engineering principles said "eight probe modules" and now say twelve, correctly
named. CR080 and D-005 name the harness their future work runs against; D-017
is registered and cross-linked from the gate.

Checks: `check_doc_links.py` clean (links and anchors), `check_skill_command_parity.py`
clean at 25 skills, and `git diff --stat` confirming every path is under
`docs/` — no `src/`, `ts/`, or `evals/` file touched, which is the story's
central claim.

## Product

No user-visible behavior changed; no command, prompt, model pin, or threshold
was touched. What changed is enforceability: before this story DS10 would have
deleted `evals/` with the Python core and the model-behavior release gate would
have become unenforceable without anyone deciding to drop it. It now cannot be
deleted until a TypeScript harness owns the gate.

The validation run also left the artifact the replacement needs: sixteen JSONL
records across twelve modules in this home's first `eval-history/`, the baseline
the DS10 harness diffs its first run against — and it surfaced D-017, a gate
defect that had been invisible for two months by construction.

Next-pull readiness: DS8's five done-condition bullets are all true in writing.
The parent collapse and the release-intent decision are named for the Navigator
at Done, not taken here.
