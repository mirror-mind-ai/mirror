[< CV20.DS12](../index.md)

# CV20.DS12.TS1 — Canonical Refinement Index And Artifact Convention

**Status:** ✅ Done
**Type:** Technical Story

---

## Outcome

The repository contains a small, human-readable Refinement Workbench whose root index
is the canonical source for RS/CR backlog status and whose linked Markdown documents
preserve enough context and evidence to continue work without a database.

## Acceptance Behavior

```text
Given a fresh session with repository files and Git but no originating journey or database
When it opens docs/project/refinement/index.md
Then it can identify the current focus and every known RS/CR status
And it can navigate to the problem, plan/evidence, and outcome recorded for each item
And no runtime, projection, handoff, or custom Git protocol is required
```

## Scope

- Create one canonical project Refinement index.
- Create one real RS from verified Ariad dogfooding findings.
- Represent open and completed CRs using one evolving Markdown file per CR.
- Define the minimal identity, status, ordering, authority, and artifact conventions.
- Validate links, repository scope, and fresh-context readability.

## Out Of Scope

- Runtime or CLI implementation in Python or TypeScript.
- SQLite projection, synchronization, export, import, or migration.
- Schema frameworks, manifests, checksums, recovery journals, handoff, or readiness.
- Automatic status transitions or file generation.
- Removal or deprecation of the existing CV20.DS6 Workbench.

## Validation

Use documentation checks plus a file-only Navigator route. A full software suite is not
required because no executable behavior changes.

---

## Artifacts

- [Plan](plan.md)
- [Test Guide](test-guide.md)
