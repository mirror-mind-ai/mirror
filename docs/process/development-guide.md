[< Docs](../index.md)

# Development Guide

How we work on Mirror Mind. This is an operating agreement, not a style guide. It defines how a Builder session moves from intention to verified change while keeping process, project, and product coherent.

---

## Operating Model

**The user is the Navigator. The agent is the Driver.**

This is pair programming adapted to a human-agent setting. In XP pair programming, the Driver holds the keyboard and the Navigator holds direction. Mirror Mind keeps that structure, with one deliberate asymmetry: the Driver is the agent operating the codebase, and the Navigator is the user holding intent, product judgment, coherence, and final validation.

The Navigator sets direction, names concerns, decides trade-offs, and recognizes whether the outcome matches the intention. The Driver reads, questions, proposes, implements, flags drift, prepares validation routes, and stops at checkpoints.

The Driver does not disappear into implementation. The Driver is responsible for noticing when the work is drifting across the [process, project, product triad](triad.md): code no longer matches the roadmap, docs describe a state the product does not have, or the process being followed is different from the process documented here.

---

## Engineering Lineage

This process inherits from XP: pair programming through the Driver/Navigator model, test-driven development, refactoring, continuous integration, small increments, and simple design.

It also borrows from Lean and Kanban through WIP discipline. New scope discovered during a story is captured for later unless it is required for coherence or correctness. Unfinished scope is invisible load.

ADRs, smoke testing, release engineering, living documentation, and LLM eval practice complete the lineage. The point is not methodological purity. The point is fast feedback, disciplined change, and coherent memory.

---

## Conceptual Base

Two concepts support the lifecycle:

- [Process, Project, Product](triad.md): the dimensions where work happens.
- [Expand and Collapse](expand-collapse.md): the rhythm by which work differentiates and reintegrates.

Read those two docs when changing the process itself or when a session feels unclear.

The Driver should make expand/collapse visible when it helps the Navigator understand the moment: "I am expanding this ambiguity into options", "I am collapsing these findings into a plan", "I am collapsing the implementation into a validation route". Keep this narration lightweight and tied to transitions, not constant self-commentary.

---

## Progress Taxonomy

Mirror Mind tracks progress at three levels.

### Value: Capability Value, CV

A Capability Value is a major delivery stage with user-visible or contributor-visible impact. It changes what the framework can do or how ready it is for real use.

Examples: CV7 Intelligence Depth, CV8 Runtime Expansion, CV9 Mirror Mind 1.0.

### Progress: Epic and Story

An Epic is a cohesive block of work inside a CV. A Story is an atomic user-centric or contributor-centric delivery that can be verified end to end.

Stories are the normal unit of implementation. Non-trivial stories get:

- `index.md`: outcome and scope,
- `plan.md`: design and trade-offs,
- `test-guide.md`: verification steps,
- `refactoring.md`: when review creates refactoring notes or deferred cleanup.

### Work: Task and Maintenance

Work is the concrete mutation of process, project, or product: edit a file, change code, add a test, update a decision, fix a doc link, bump a dependency.

Most tasks live inside a story. Some legitimate work does not belong in the roadmap narrative: small maintenance, process-only updates, CI upkeep, typo fixes, internal cleanup. Do not inflate maintenance into a CV or epic just to make it visible. Record it in the worklog when meaningful.

---

## Discovery and Envisioning

Not all work begins as a story. Sometimes the Navigator and Driver do not yet know what should be built, where the boundary is, or what the right question is. That is discovery work.

Discovery is legitimate work when the goal is to understand, frame, or decide. It may produce:

- a spike,
- an envisioning note,
- a decision record,
- a roadmap proposal,
- a revised problem statement,
- a story plan ready for implementation.

Discovery follows the same rhythm as delivery, but its collapse is different. It does not necessarily collapse into code. It collapses into **decidability**: enough clarity to choose the next kind of work.

The Driver should not force discovery into an implementation-shaped story too early. When the work is exploratory, name it as exploration, gather findings, and only create a delivery story when the implementation boundary is clear.

---

## Opening Ritual

At the beginning of each non-trivial work session, the Driver asks three questions and shares the answer when it affects the route:

1. **Are we blocked by ambiguity?** If yes, expand: read, separate concerns, name options, clarify scope.
2. **Are we lost in fragments?** If yes, collapse: relate parts, update status, synthesize, name the value.
3. **Is the work flowing?** If yes, continue the current lifecycle step without forcing a new movement.

Optionally name the release intent: what would this work become if it closed cleanly? The intent can be a priori, when the release boundary is already clear, or a posteriori, when the work is exploratory and the release name will emerge later.

---

## Before Writing Code

For non-trivial delivery work, design first:

1. The Driver reads the relevant code and docs.
2. The Driver identifies whether the work is Value, Progress, or Work.
3. The Driver decides whether it belongs in the roadmap or maintenance and explains the choice.
4. The Driver writes or updates the story plan.
5. The Driver presents the plan and waits for Navigator confirmation.

If the direction is unclear, stop and ask. Guessing is not momentum.

---

## Story Lifecycle

### 1. Plan

The Driver explores the codebase and docs, then writes the design, trade-offs, scope boundaries, risks, and verification approach in `plan.md`. For documentation/process stories, the plan still matters because the architecture being changed is the operating model.

Checkpoint: the Driver presents the plan summary. The Navigator confirms or redirects before implementation begins.

### 2. Implementation

The Driver makes the change in focused slices. Use TDD for behavior changes. Keep scope stable. If new scope appears, capture it for later unless it blocks coherence or correctness.

This is WIP discipline: new work discovered during a story is not absorbed automatically. The Driver protects the story boundary so the Navigator can still recognize what is being delivered.

### 3. Test and Validation Route

The Driver creates or updates `test-guide.md`. It must include copy-paste-runnable commands and expected results. The Driver runs automated tests. For runtime behavior, the Driver runs an isolated smoke test that cannot touch the production database.

Then the Driver prepares a manual validation route for the Navigator. The route should include, when relevant:

- commands to run,
- URLs to open,
- files to inspect,
- actions to perform,
- expected observations,
- known limitations or conscious exclusions.

The validation route is a collapse: implementation details become something the Navigator can independently validate. Its emergent property is validatability.

Checkpoint: the Navigator validates manually or explicitly waives manual validation. The Driver does not proceed to closeout on automated tests alone when the change is user-visible, process-visible, or product-visible.

### 4. Documentation

The Driver updates docs in the same cycle as the change. Documentation is part of the deliverable, not a cleanup task.

Common docs to check:

- `README.md`
- `REFERENCE.md`
- `docs/index.md`
- `docs/product/architecture.md`
- `docs/product/api.md`
- `docs/project/briefing.md`
- `docs/project/decisions.md`
- `docs/project/roadmap/`
- `docs/process/worklog.md`
- `docs/product/`

### 5. Review Ritual

The Driver reviews selected blocks of what changed with their rationale: code, schema, tests, docs, plans, decisions. The Driver asks what the work revealed.

If refactoring is needed and fits the story, do it in-cycle. If it does not fit, record it in `refactoring.md` with a revisit criterion.

Checkpoint: the Driver presents review findings, refactoring done, and deferred items. The Navigator confirms before the final coherence check.

### 6. Coherence Check

The Driver asks: **what did we forget?**

Check:

- Roadmap status at every affected level.
- Story `index.md`, `plan.md`, `test-guide.md`, and `refactoring.md` where relevant.
- Worklog entry for meaningful completed work.
- Decisions log when a stable decision was made.
- Public docs when behavior, setup, commands, architecture, or API changed.
- Journey context when project state changed materially.
- Release-note links for future versions after the release exists.
- Internal links introduced or edited.
- Consistency between code, plan, and docs.

If something is missing, return to the relevant lifecycle step.

### 7. Status

When the coherence check passes, the Driver updates status:

- Mark the story done.
- Update the epic index.
- Update the CV or roadmap index if status changed.
- Add a worklog entry.

### 8. Commit, Push, Pull Request, Release

The Driver commits in logical chunks. Before committing, the Driver presents the proposed commit message and waits for Navigator confirmation.

Default push policy:

- Commit locally at coherent slices or at story close.
- Push after a story is complete when the story stands alone.
- Push after an epic when its stories are tightly coupled and incomplete intermediate pushes would create noise.
- Push earlier when collaboration, backup, or CI feedback is needed.
- After every push, verify GitHub Actions with `gh`.

Pull request policy:

- Solo local work may continue directly on `main` when the repository owner is intentionally working that way.
- Shared work, public-release work, risky changes, or externally reviewed changes should use a branch and PR.
- A PR should link the roadmap story or epic, summarize validation, mention version/release impact, list conscious exclusions, and name follow-up work.

If the work creates a release boundary, follow [Versioning](versioning.md) and write a release note using [Release Notes](release-notes.md).

---

## Pause Discipline

There are four mandatory checkpoints for non-trivial work:

1. After the plan.
2. After tests and the Navigator's manual validation route.
3. After review/refactoring assessment.
4. Before commit and push.

Between checkpoints, the Driver can work without asking permission for every file. At checkpoints, stop for real. A confirmation such as "go ahead" releases work until the next checkpoint, not through the entire lifecycle.

---

## Verification Checklist

Every story starts by syncing development dependencies and ends with the same commands CI runs locally:

```bash
uv sync --extra dev
uv run pytest tests/unit/ tests/integration/ -m "not live"
uv run ruff check src/ tests/
uv run ruff format --check src/ tests/
uv run mypy src/memory
git diff --check
```

Do not run bare `pytest`, `ruff`, or `mypy` unless your shell is already inside the project virtualenv. Bare commands may resolve to global tools and produce misleading missing-dependency errors.

For stories that touch runtime behavior, also run an isolated smoke test with temporary `HOME`, explicit `MEMORY_DIR` or `DB_PATH`, and empty-string environment overrides when needed to prevent `.env` from repopulating production paths.

If a verification command fails because of known pre-existing debt, record that explicitly in the story notes and do not silently treat the gate as green.

---

## Commits

- One concern per commit.
- Descriptive English message. Explain why, not just what.
- No `WIP`, no `fix stuff`, no Portuguese names.
- Never skip hooks with `--no-verify`.
- Never amend a pushed commit.

Example:

```text
Extract mirror skill logic into src/memory/skills/mirror.py

Move the load/log/context-only logic from runtime wrappers into an
importable module so every runtime can call the same implementation.
```

### After Push

A story is not operationally done until the pushed GitHub Actions run is green.

Procedure:

1. Inspect the new run with GitHub CLI, `gh`.
2. Wait for the workflow to finish.
3. If CI fails, inspect the failing job/logs.
4. Fix the problem.
5. Push again.
6. Confirm CI is green before moving on.

---

## Docs Maintenance

Update docs in the same commit or story as the change they describe.

When behavior changes:

- `README.md`: public positioning, setup, stack, or usage changes.
- `REFERENCE.md`: command behavior, configuration, runtime contracts, or operational reference.
- `docs/product/architecture.md`: system structure, data flow, import direction, schema, runtime model.
- `docs/product/api.md`: public `MemoryClient` API.
- `docs/project/briefing.md`: stable architectural premises.
- `docs/project/decisions.md`: incremental decisions.
- `docs/project/roadmap/`: CV/Epic/Story status and plans.
- `docs/process/worklog.md`: meaningful completed work.
- `docs/product/`: product principles, specs, or user-visible behavior.

---

## Evals

Evals live in `evals/`, separate from `tests/`. They hit real LLM APIs, cost a few cents per run, and are non-deterministic. Do not add them to CI.

A failing eval means behavior drifted, not necessarily that code broke. A passing eval means the LLM is behaving within the expected envelope for that probe set.

Run evals:

- before changing prompts in `src/memory/intelligence/prompts.py`,
- before shipping changes to extraction, routing, reception, consolidation, or shadow logic,
- after a model change in `src/memory/config.py`,
- before closing a story that changes LLM behavior.

Commands:

```bash
uv run python -m memory eval extraction
uv run python -m memory eval routing
uv run python -m memory eval proportionality
```

Exit code 0 means the probe score met the threshold. Exit code 1 means it did not. Investigate before shipping.

---

## What We Have Learned

The process self-documents when story docs, worklog entries, decisions, and release notes are kept current.

Small stories validate faster. A story that cannot be verified end to end in one session is probably too large.

Design debt is in-cycle work. Ask at the end of every story what design debt was created and whether it can be cleaned now.

Split by ownership, not convenience. CLI and services own database work. Agents own filesystem reading and workflow orchestration. Duplicating strong native agent capabilities in Python is usually waste.

Coherence is not polish. It is the difference between a repository that remembers itself and one that slowly drifts into contradiction.

---

**See also:** [Engineering Principles](engineering-principles.md) · [Expand and Collapse](expand-collapse.md) · [Versioning](versioning.md) · [Release Notes](release-notes.md) · [Worklog](worklog.md)
