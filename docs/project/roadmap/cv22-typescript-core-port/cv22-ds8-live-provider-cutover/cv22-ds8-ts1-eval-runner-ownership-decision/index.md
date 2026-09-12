[< Parent](../index.md)

# CV22.DS8.TS1 — `eval` runner ownership decision

**Status:** ✅ Done — 2026-09-13. Decision recorded; DS10 carries the Eval Harness Deletion Gate; D-017 registered
**Type:** Technical Story — decision, documentation only

---

## Outcome

The `eval` harness ownership question is decided and recorded where the act
that would delete the harness has to honour it: **the harness transfers to
TypeScript as a DS10 deletion gate**, neither ported in DS8 nor retired.

The reason, in one line: the evals measure prompt behavior in the engine that
answers users, and since DS8 that engine is TypeScript for eight of the nine
live surfaces — so the instrument's subject moved, and the question was never
"port 3,691 lines or delete them."

## Story Statement

In order to keep the model-behavior release gate enforceable after Python is deleted,
As the port owner,
I want the harness's ownership decided and written into DS10's deletion gates,
So that Python retirement cannot silently remove the instrument that closed AI-16/22/23/25.

## Acceptance Behavior

```text
Given DS10's index, which today does not mention `eval` at all
When  a future session plans Python deletion and reads DS10's gates
Then  it finds an Eval Harness Deletion Gate that blocks deletion of `evals/`
      until a TypeScript harness owns the release gate
And   `decisions.md` explains why the transfer is DS10's and not DS8's, with the
      measurements the decision rested on
And   the development guide and engineering principles describe the gate's real
      subject, its blind spot, and its standing D-005 waiver
And   the burn-down ledger attributes `eval` to DS10 everywhere it appears
And   CR080 and D-005 name the harness their future work runs against
And   no eval code, fixture, or threshold changed
```

## Scope

Seven documentation files: `decisions.md` (the entry), the DS10 index (a new
Eval Harness Deletion Gate plus a Done Condition bullet), the burn-down ledger
(attribution in three places, History row), the development guide (the gate's
subject, blind spot, and standing waiver), the engineering principles (the
stale "eight probe modules" — there are twelve), CR080 (which harness its
probe runs on), and `debt.md` (D-005's trigger).

## Out Of Scope

No TS harness, no module port, no fixture conversion, no `evals/` deletion, no
D-005 fixture fix, no CR080 probe, no prompt change. This story also does not
close DS8: it completes the last child and makes every DS8 done-condition
bullet true, leaving the parent collapse and the release-intent question to the
Navigator.

## Validation

- `scripts/check_doc_links.py` (links **and** anchors) and
  `scripts/check_skill_command_parity.py` green; `git diff --stat` shows
  `docs/**` only.
- Navigator cold read: does the gate actually block the deletion?
- **E2E, narrowed:** one Navigator-run `uv run python -m memory eval --all`, to
  falsify the decision's own assumption that the Python harness is still a
  working interim gate. Expected 11/12 with `routing` failing (D-005); a
  materially worse result changes the decision.

---

## Artifacts

- [Plan](plan.md)
- [Test Guide](test-guide.md)
- [Validation](validation.md)
- [Debt Review](review.md)
- [Coherence](coherence.md)
- [Handoff](handoff.md)
