# Validation — CV20.DS12.US2

## Status

Passed

## Automated Checks

- uv run pytest -q tests/unit/memory/builder tests/unit/memory/cli/test_build.py tests/unit/memory/storage/test_builder_workbench_store.py; uv run ruff check changed paths; uv run mypy changed source paths; python scripts/check_doc_links.py; git diff --check

Checks status: passed

## E2E

Decision: required

Evidence: Navigator launched Pi from the journey clone: Builder named docs/project/refinement/index.md as canonical authority, stated no SQLite was consulted, accurately rendered RS001 with CR001 planned and CR002/CR004 captured plus CR003 done, and preserved read-only behavior. Automated tests cover absent-index compatibility and prove the canonical runtime path does not request a Workbench snapshot; repair-and-report remains a contract behavior without deliberately corrupting canonical project files.

## Navigator Validation

Route: In a Pi session launched from the journey clone, activate Builder and ask 'mostre o Refinement atual'

Navigator accepted: yes

Expected observation: Builder presents project files as authority, reads RS001 and current CR focus from the canonical index, preserves read-only intent, and uses repair-and-report only inside authorized mutable work

Pass condition: No SQLite state appears or is accessed on the file-first path; file inspection is accurate; safe repair policy is explicit in the skill contract; absent-index compatibility remains covered

Fail condition: SQLite competes with files, silent fallback occurs, read-only intent mutates files, safe repairs prompt redundantly, or semantic decisions occur without Navigator authority

## Missing Evidence

- none
