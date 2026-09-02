[< Story](index.md)

# Test Guide — CV20.DS12.US1

## Documentation Checks

```bash
python scripts/check_doc_links.py
git diff --check
```

## Scope Check

Implementation changes only:

```text
docs/project/refinement/index.md
docs/project/refinement/rs001-ariad-runtime-trust/cr001-scope-confirmation-checkpoint.md
```

The US1 roadmap package may gain validation/review/Done evidence. Any runtime source,
test, database, configuration, CR002, or CR003 change fails scope validation.

## Transition Check

The root index must show exactly:

```text
current RS: RS001
current CR: CR001
RS001: active
CR001: planned
CR002: captured
CR003: done
```

No linked RS/CR document may claim competing canonical status.

## CR Plan Check

CR001 must state:

- reproduction against current behavior comes first;
- no-code closure is allowed when the finding no longer reproduces;
- characterization precedes a fix when it does reproduce;
- only one minimal behavior route is chosen;
- focused regression evidence is required;
- US1 does not implement the plan.

## File-Only Navigation Exercise

Using only the Workbench index and CR001 document, answer:

1. What is active?
2. What is planned but not implemented?
3. What comes next?
4. What evidence gate precedes implementation?

Expected observation: RS001/CR001 are the focus, CR001 is planned, CR002 remains next,
and current-runtime reproduction is the first gate.

Pass condition: every answer is explicit without SQLite or conversation history.

Fail condition: status is inferred, duplicated, or unavailable; the CR plan implies it
was implemented; or the remaining backlog becomes ambiguous.

## E2E Decision

Required as the file-only transition above. No executable-product E2E or full software
suite is required.

## Validation Evidence

Implementation checks passed:

- documentation links and roadmap heading codes are clean;
- `git diff --check` is clean;
- implementation changed only the root Workbench index and CR001 narrative;
- RS001/CR001 are the sole focus; CR001 is planned, CR002 captured, CR003 done;
- CR001 explicitly starts with current-runtime reproduction and does not authorize
  implementation.

Dogfooding observations:

- the first open action was obvious from the authored order;
- changing focus and statuses together in the root index was understandable;
- the linked CR held enough problem, expectation, impact, and evidence to write a plan
  without SQLite;
- the transition required four small edits in one index plus the CR plan, but no
  observed friction currently justifies automation or a contract change.

Navigator validation remains pending.
