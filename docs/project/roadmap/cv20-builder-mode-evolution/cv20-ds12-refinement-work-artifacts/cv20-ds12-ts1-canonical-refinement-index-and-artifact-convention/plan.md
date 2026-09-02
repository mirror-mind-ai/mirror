# Plan — CV20.DS12.TS1 Canonical Refinement Index And Artifact Convention

## Objective

Prove the smallest useful file-only Refinement Workbench with real findings before any
runtime automation is considered.

## Scope

Create this project surface:

```text
docs/project/refinement/
├── index.md
└── rs001-ariad-runtime-trust/
    ├── index.md
    ├── cr001-scope-confirmation-checkpoint.md
    ├── cr002-cursor-sync-roadmap-selection.md
    └── cr003-surface-materialization-truth.md
```

The seed is evidence-backed:

- CR001 carries open dogfooding finding AF-004.
- CR002 carries the newly reproduced cursor-sync selection defect.
- CR003 records completed findings AF-002/AF-006 as a terminal example.

## Document Contract

### Root authority

`docs/project/refinement/index.md` is the only canonical authority for:

- current RS and CR focus;
- the ordered RS backlog;
- the ordered CR backlog;
- each RS/CR status;
- the link from every CR to its RS and evidence document.

RS and CR documents own narrative and evidence, not status. If prose and the root index
disagree, the root index wins.

### Identity

- Shared IDs are project-wide sequential `RSNNN` and `CRNNN` values.
- The ID remains stable when title, status, or directory location changes.
- IDs do not encode journey, database, person, absolute path, or local display code.
- Existing database display codes are not imported or treated as equivalent identity.

### Status vocabulary

RS:

```text
proposed | active | parked | closed
```

CR:

```text
captured | planned | in_progress | blocked | validated | done | parked | rejected | promoted
```

The lifecycle vocabulary is intentionally small. Detailed phase history belongs in the
CR narrative, not in additional canonical state.

### Ordering

The root tables are ordered intentionally by the Navigator. Open work appears before
terminal history unless a story-specific narrative requires otherwise. No timestamps or
runtime calculation silently reorder the backlog.

### RS and CR documents

An RS directory contains one `index.md` with framing, outcome, boundaries, and links to
its CRs. Each CR is one evolving Markdown document with sections for problem, expected
behavior, impact, plan/decision, evidence, and outcome. Sections may remain pending.

Supplementary files are optional under an `artifacts/` directory and exist only when a
separate artifact adds information. Empty phase files are prohibited.

## Non-Goals

- No code, parser, CLI, database access, migration, or generated file machinery.
- No YAML frontmatter, UUID, manifest, digest, recovery record, or handoff document.
- No automatic reconciliation with CV20.DS6 SQLite records.
- No claim that this first vocabulary is permanent; dogfooding may simplify it further.
- No changes to unrelated roadmap status, including CV9.DS7.

## Acceptance Behavior

```text
Given only a fresh checkout
When a collaborator opens docs/project/refinement/index.md
Then the active focus, RS backlog, and CR backlog are unambiguous
And every item links to sufficient context or evidence
And completed and open work are distinguishable
And the surface contains no dependency on a journey or local database
```

## Validation Route

Automated documentation checks:

```bash
python scripts/check_doc_links.py
git diff --check
git diff --name-only bb0de37...HEAD
```

Scope inspection must confirm TS1 changes only project documentation. The
Navigator-visible route begins at `docs/project/refinement/index.md` and answers:

1. What is the current Refinement focus?
2. Which CRs remain open and in what order?
3. Which CR demonstrates a terminal outcome?
4. Can each answer be reached without database or journey context?

E2E decision: required as a file-only navigation exercise; no executable-product E2E or
full test suite is warranted.

## Implementation Contract

- Materialize only the five files listed in Scope.
- Reuse verified dogfooding evidence; do not invent sample defects.
- Keep links relative and Markdown readable without a renderer.
- Run documentation checks and review the rendered diff.
- Commit only TS1 documentation with a descriptive English message.
- Do not push, publish, merge, tag, or release.

## Stop Conditions

- The canonical authority cannot be expressed without duplicated status.
- A proposed field exists only to serve hypothetical automation.
- Implementation requires reading or mutating SQLite.
- The scope expands beyond the five Workbench files and the TS1 roadmap package.

## Approval Gate

Implementation begins only after Navigator approval of this concrete document contract.
