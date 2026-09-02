[< Story](index.md)

# Test Guide — CV20.DS12.TS2

## Documentation Checks

```bash
python scripts/check_doc_links.py
git diff --check
```

## Scope Check

Implementation may change only:

```text
docs/project/decisions.md
docs/project/roadmap/cv20-builder-mode-evolution/cv20-ds12-refinement-work-artifacts/
  cv20-ds12-ts2-legacy-workbench-migration-boundary/legacy-workbench-boundary.md
```

The TS2 package may gain lifecycle evidence. Source, tests, migrations, `REFERENCE.md`,
`.pi/skills`, TypeScript files, databases, and other roadmap packages must remain
unchanged.

## Evidence Review

Confirm the boundary accurately names:

- migrations `015` and `016` and all three legacy tables;
- journey UUID/display-code identity and absence of repository identity;
- mutating commands and SQLite-derived Builder Home state;
- current skill and reference routing;
- TypeScript exact migration-set compatibility;
- identity, vocabulary, and narrative mismatches that block automatic mapping.

No personal rows or counts may appear.

## Decision Review

The decision must state:

- project files are the sole canonical shared authority;
- SQLite is preserved as compatibility-only local state;
- no automatic import, export, reconciliation, deletion, or project assignment;
- migrations and TS recognition remain;
- file-first routing is separate future work;
- export and removal each require explicit evidence and approval.

## Navigator Validation

Read the decision and answer:

1. Which authority wins for a project with a Refinement index?
2. Why is automatic migration unsafe?
3. What remains supported now?
4. What must happen before routing, export, deprecation, or removal changes?

Pass condition: all answers are explicit and no runtime/data mutation is implied.

Fail condition: dual authority remains, legacy data can move implicitly, compatibility
is ignored, or future work appears pre-authorized.

## E2E Decision

Not required: TS2 changes architectural documentation only and introduces no executable
behavior.

## Validation Evidence

Implementation evidence:

- the boundary inventories migrations `015`/`016`, all three legacy tables, runtime
  mutation and Home behavior, current routing documentation, and TypeScript schema
  coupling;
- the decision explains journey/project identity, status, and narrative mismatches;
- project files are the sole shared authority and SQLite is compatibility-only local
  state;
- automatic import, export, reconciliation, deletion, and project assignment are
  explicitly prohibited;
- future routing, export, deprecation, and removal each have separate triggers;
- no personal rows, source, migration, database, skill, REFERENCE, or TypeScript file was
  changed.

Navigator validation remains pending.
