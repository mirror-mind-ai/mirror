[< Story](index.md)

# Test Guide — CV22.DS8.TS1

A documentation story has two kinds of check: the mechanical ones, which prove
the edit is well-formed and stayed inside its scope, and the cold read, which
is the only thing that can prove a gate will actually stop a future session.

## Automated Validation

Run from the repository root.

| # | Command | Pass | Fail |
|---|---------|------|------|
| 1 | `uv run python scripts/check_doc_links.py` | `docs link check: clean` **and** `roadmap heading check: clean` | any broken link or anchor. Anchors are slugified GitHub-style with non-ASCII dropped — the check that caught TS2's `Plateau 4½` anchor after it reached CI |
| 2 | `uv run python scripts/check_skill_command_parity.py` | green, unchanged | any failure — this story touches no skill, so a failure means the diff escaped its scope |
| 3 | `git diff --stat <base>..HEAD` | every path under `docs/`; no `src/`, `ts/`, or `evals/` file present | any code path in the diff. This is the story's central claim, and it is mechanically checkable |
| 4 | `cd ts && npm test` (spot check, optional) | unchanged — 2039 passing | any change, which would mean the diff was not docs-only |

Check 3 is the one that matters most: the decision's credibility rests on
having changed no eval behavior while rewriting what the documentation claims
about it.

## E2E Decision

**Required, narrowed to a single run.** Not to test the documentation — to
falsify the decision's load-bearing assumption. The recorded decision asserts
that the Python harness *remains a working interim gate until DS10*. It has not
run since 2026-07-23, and never on this home (`eval-history/` is absent). An
assumption that cheap to test should not be shipped untested.

Cost: a few cents of live model calls across twelve modules. Never CI —
the evals are non-deterministic by design and hit real APIs.

## Navigator Validation

### 5 — the interim gate still runs

```bash
uv run python -m memory eval --all
```

| Observation | Reading |
|---|---|
| **11/12 pass, `routing` the only failure** | Expected. Matches every recorded run since v0.31.0; `routing` is the standing [D-005](../../../../debt.md) stale-fixture waiver. The decision's assumption holds — proceed. |
| **12/12 pass** | Better than expected (someone's persona catalog drifted back into alignment). Record it; note D-005 may be paid by accident, and let the DS10 story confirm rather than assuming. |
| **Modules erroring, or several probes flipped beyond `routing`** | **Stop.** The interim gate is already broken, so "valid until DS10" is false and the transfer is urgent, not scheduled. Revise the decision entry before Done rather than shipping a wrong claim. |
| Any run at all | Leaves this home's first `eval-history/*.jsonl` records — the baseline the DS10 story will diff its TS harness against. |

Record the per-module lines and the total in `validation.md`, redacted of any
memory content the probes echo.

### 6 — the cold read

The gate's whole purpose is to stop a session that has forgotten this
conversation. Read these two, in this order, as if for the first time:

1. `docs/project/roadmap/cv22-typescript-core-port/cv22-ds10-python-retirement-npm-distribution/index.md`
   — the new **Eval Harness Deletion Gate**.
2. The `decisions.md` entry it points at.

| Question | Pass |
|---|---|
| Reading DS10's gates cold, would you know `evals/` may not be deleted yet? | yes |
| Does the gate say what must exist first, concretely enough to plan? | yes — harness shape, fixture neutrality, denominator |
| Does it explain why DS8 did not just port it, without needing this conversation? | yes |
| Do `routing` and `scene` have named open questions rather than silent omission? | yes |

A "no" to the first question fails the story regardless of every green check
above.

## Validation Evidence

Pending implementation and validation. Record here: the three check results,
the `eval --all` per-module outcome with the `routing`/D-005 reading, and the
cold-read answers.
