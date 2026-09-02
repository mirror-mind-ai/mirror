# DS12 Experiment Retrospective — Return To Document-First Refinement

**Date:** 2026-07-30
**Disposition:** The previous implementation experiment was archived without merge.

## Original need

Refinement needs the equivalent of the Delivery roadmap: one project-local place that
states the canonical RS/CR backlog status, plus predictable directories for plans,
reviews, validation evidence, decisions, and closure notes generated while refinement
work proceeds.

## Where the experiment drifted

The experiment treated portability and collaboration as an application-level
distributed-systems problem. It added filesystem authority, SQLite projection, mutation
recovery, Git topology inspection, remote readiness evidence, confirmation protocols,
and cross-clone consumption. Each mechanism addressed a technically valid risk, but the
combination was disproportionate to the observed local, Git-mediated workflow.

The local technical review panel reinforced this drift. It was effective at finding
possible failures, but lacked a strong proportionality test. Bounded findings accumulated
into a product optimized for defensive completeness rather than maintainability and
adaptability. The panel was disabled as part of closing the experiment.

## Learning retained

- Project files own shared Refinement meaning.
- Git owns version history, collaboration, and recovery.
- Local databases may assist a runtime but must not compete with files for canonical
  backlog state.
- Journeys, database paths, private filesystem paths, and local display codes are not
  shared artifact identity.
- Purpose and readiness never authorize commit, push, integration, publication, or
  release.
- Review must test relevance and proportionality before expanding technical scope.
- Automation is introduced only after repeated operational pain demonstrates its value.

## What is deliberately not carried forward

No code, lifecycle package, completion record, or validation claim from the abandoned
branch is incorporated into production. In particular, the new design does not begin
with SQLite projection, transactional handoff, custom Git evidence, mutation recovery,
or remote readiness protocols.

The archived experiment remains privately recoverable from:

```text
~/.mirror-archives/mirror/ds12-refinement-workbench-experiment/
```

That location is historical evidence, not a production dependency.

## Constraint inherited from production

CV20.DS6 already shipped an SQLite-backed Refinement Workbench. Its compatibility,
deprecation, and eventual migration are a separate concern. DS12 must first define the
canonical document model. It must not silently remove existing runtime data or break
TypeScript migration compatibility.

## Reintroduction threshold

Additional runtime machinery requires evidence of a recurring problem, such as:

- canonical indexes repeatedly becoming stale;
- agents repeatedly selecting the wrong RS or CR;
- material cross-collaborator conflicts that ordinary Git review cannot manage;
- repeated loss of work during handoff or recovery;
- artifact volume making document inspection materially ambiguous or slow.

Until then, simplicity is an explicit product constraint rather than an unfinished
implementation state.
