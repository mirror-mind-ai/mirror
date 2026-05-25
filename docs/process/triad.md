[< Process](../index.md)

# Process, Project, Product

Mirror Mind work happens across three dimensions at the same time: process, project, and product. They are not phases. They are parallel surfaces that must stay coherent.

---

## The Three Dimensions

### Process

Process is how the work is done: the method, lifecycle, rituals, verification standards, versioning rules, release-note practice, and commit discipline.

Canonical process documents:

- [Development Guide](development-guide.md)
- [Engineering Principles](engineering-principles.md)
- [Versioning](versioning.md)
- [Release Notes](release-notes.md)
- [Worklog](worklog.md)
- This document

### Project

Project is the map of what will be done and why: architectural premises, decisions, roadmap, CVs, epics, stories, plans, and verification guides.

Canonical project documents:

- [Project Briefing](../project/briefing.md)
- [Decisions](../project/decisions.md)
- [Roadmap](../project/roadmap/index.md)
- Story `plan.md`, `test-guide.md`, and `refactoring.md` files

### Product

Product is the thing itself: the Python core, SQLite schema, runtime integrations, skills, templates, identity model, web console, extension system, documentation consumed by users, and observable behavior.

Canonical product surfaces:

- `src/memory/`
- `tests/` and `evals/`
- Runtime surfaces: `.pi/`, `.agents/`, `.claude/`, `.gemini/`
- [Product docs](../product/index.md)
- [Architecture](../product/architecture.md)
- [Reference](../../REFERENCE.md)

---

## Why This Matters

The common failure mode in software work is to collapse everything into product: if code changed, work happened; if only process or project changed, it was overhead. Mirror Mind rejects that reduction.

Changing the development guide is real work in the process dimension. Recording a decision is real work in the project dimension. Updating code is real work in the product dimension. A mature cycle knows which dimension it is changing and checks whether the others must move with it.

---

## Coherence Across the Three

The triad works only when the three dimensions remain aligned:

- The product does what the project says it should do.
- The project follows the process currently in force.
- The process describes how work is actually being done.

When one dimension changes, the others must be revisited. A runtime behavior change may require product docs and roadmap updates. A new versioning rule requires process docs and decision records. A changed roadmap may require updated journey context.

This is why the [Development Guide](development-guide.md) includes a coherence check before a story is closed.

---

## Relationship to the Progress Taxonomy

The triad is orthogonal to the Value, Progress, and Work taxonomy:

| | Process | Project | Product |
|---|---|---|---|
| Value, CV | Method can change when the project's operating model changes | CV roadmap, done condition, public release intent | New framework capability visible to users or contributors |
| Progress, Epic/Story | Lifecycle refinements, verification standards | Plans, decisions, status updates | Code, schema, runtime, template, or documentation behavior |
| Work, Task/Maintenance | Edit a process doc | Update a decision or roadmap line | Change a function, test, migration, hook, or skill |

Most meaningful stories touch more than one cell. The goal is not to force symmetry. The goal is to avoid hidden drift.
