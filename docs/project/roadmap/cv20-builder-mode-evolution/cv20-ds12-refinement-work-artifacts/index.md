[< CV20](../index.md)

# CV20.DS12 — Document-First Refinement Workbench

**Status:** ✅ Done

---

## Outcome

A project has one versioned Refinement index that states the canonical backlog and
status of Refinement Stories and Change Requests, with predictable directories for the
documents and evidence produced while that work proceeds.

The Workbench is understandable by reading the repository. It does not require a local
Mirror database, journey, conversation history, or custom handoff protocol to recover
shared meaning.

---

## Why This Exists

Delivery Work already has a roadmap and story packages that make position, status,
plans, evidence, and closure inspectable across sessions. Refinement needs the same
durability without turning small changes into Delivery Stories.

The first DS12 experiment expanded this need into filesystem authority, SQLite
projection, mutation recovery, Git coherence, and cross-clone handoff machinery. That
implementation was archived without merge after proving disproportionate to the real
workflow. The retained learning is recorded in the
[experiment retrospective](experiment-retrospective.md).

---

## Product Premises

- Project documents own canonical shared Refinement meaning.
- Git owns history, collaboration, conflict handling, and recovery.
- Journeys and runtime databases remain local context, never artifact identity.
- The canonical index must be useful to humans and agents without database access.
- Generated artifacts should be ordinary Markdown files with stable relative links.
- Validation starts structural and small; automation grows only from observed failures.
- Existing CV20.DS6 SQLite data is not removed implicitly. Migration or deprecation is
  separate, explicit work after the document contract is proven.

---

## Candidate Stories

| Code | Story | Type | Outcome | Status |
|------|-------|------|---------|--------|
| [CV20.DS12.TS1](cv20-ds12-ts1-canonical-refinement-index-and-artifact-convention/index.md) | Canonical Refinement Index And Artifact Convention | Technical Story | A real file-only Workbench proves the canonical backlog, identity, status, and navigation contract | ✅ Done |
| [CV20.DS12.US1](cv20-ds12-us1-dogfood-file-only-refinement/index.md) | Dogfood File-Only Refinement | User Story | Navigator selects and plans real Refinement work from the canonical files alone, exposing usability gaps before automation | ✅ Done |
| [CV20.DS12.TS2](cv20-ds12-ts2-legacy-workbench-migration-boundary/index.md) | Define Legacy Workbench Migration Boundary | Technical Story | The project decides how the existing SQLite Workbench coexists with, transitions to, or retires behind canonical project files without migrating data yet | ✅ Done |
| [CV20.DS12.US2](cv20-ds12-us2-route-builder-to-canonical-refinement-files/index.md) | Route Builder To Canonical Refinement Files | User Story | Builder uses the project index for Refinement requests when it exists and preserves legacy behavior for projects without one | ✅ Done |

Later stories may add lightweight structural validation or execute an explicitly
approved transition, but only after TS2 settles the legacy Workbench boundary. The
archived experiment's TS/US decomposition is not reused.

---

## Non-Goals

- No SQLite projection of canonical Refinement documents.
- No transactional cross-clone handoff or recipient readiness protocol.
- No application-level reconstruction of Git ancestry, publication, or conflict logic.
- No implicit commit, push, merge, publication, release, or repository configuration.
- No automatic removal or migration of the CV20.DS6 runtime Workbench.
- No claim that every transient event requires a durable file.

---

## Done Condition

Satisfied. A fresh Pi session launched from the journey clone identified
`docs/project/refinement/index.md` as canonical, reported RS001 and the exact CR backlog
from files, and stated that no SQLite state was consulted. The Navigator accepted the
result after the file-only workflow, legacy boundary, and absent-index compatibility had
all been validated.
