[< Story](index.md)

## Debt Review — CV22.DS8.TS1

**Date:** 2026-09-13 · **Decision:** defer, with triggers

## Debt introduced

None. The story changed no code, no fixture, and no threshold; the diff is
eight files under `docs/`.

## Debt registered by this story

**[D-017](../../../../debt.md#d-017--injection-resistance-probes-are-averaged-into-a-module-score)
— injection-resistance probes are averaged into a module score.** Found by this
story's own validation run: `scene` reported `5/6 passed ✓ PASS` with
`scene-injection-resisted` obeyed. A security probe carries the same weight as
a quality probe against one threshold, so a 1-in-6 injection failure cannot
trip 0.80 — on any of the six fenced surfaces. Severity medium: it does not
break behavior, it makes a fence regression invisible to the release gate.

Carried rather than paid, deliberately. The fix belongs in the harness
contract, not in six per-module patches, and the harness contract is being
rewritten by the transfer this story just scheduled — so it is recorded as
**item 4 of DS10's Eval Harness Deletion Gate** as well as a debt entry. Paying
it in Python now would mean hardening a harness whose replacement is already
designed.

Triggers: the harness transfer (DS10), a fence change on any fenced surface, or
any story citing a module PASS as injection-resistance evidence.

## Debt this story touched but did not pay

- **D-005** (`evals/routing.py` stale persona fixtures) — unchanged and still
  the reason `eval --all` reports 11/12. This story added the harness-transfer
  disposition to its trigger and named it in the development guide so a fresh
  reader does not spend a release investigating it. The fixture debt itself is
  the DS10 story's to pay or retire.
- **AI-22's documented `scene` residual** — reproduced within band (1 obeyed in
  6; recorded 1/10) and confirmed not a regression at n=5, with the model pin
  unchanged. No new debt; S21's model-pin revisit trigger stands.
- **CR080** — gained the line naming which harness its probe runs on. Still
  captured, still unplanned.

## Driver process findings

Not project debt, recorded because both recurred inside two stories and the
corrective is free:

1. **Committed twice with a broken doc anchor** (TS2's CR080 link, TS1's D-017
   link), both caught after the commit — once by CI, once locally. The check
   exists (`scripts/check_doc_links.py`) and resolves anchors, not just paths;
   the failure was running it after `git commit` instead of before. Corrective:
   the link check runs in the same command as the commit for any docs change.
   If it recurs a third time it stops being discipline and becomes a CR for a
   pre-commit hook.
2. **Truncated an Ariad surface twice** by piping runtime output through `tail`
   and `grep` — once in TS2's `validate-item`, once in TS1's `plan-item`, where
   the `PLAN_CHECKPOINT` could not be re-emitted because the event was already
   consumed. The transport invariant is explicit that marked surfaces are
   returned whole. Corrective: lifecycle commands are run unpiped, always.

## Decision

**Defer.** Nothing here is load-bearing for what this story delivers — a
recorded decision and a gate. D-017's fix is scheduled where it belongs, D-005
is the DS10 story's, the `scene` residual is confirmed within its documented
band, and the two Driver findings have free correctives already applied.
