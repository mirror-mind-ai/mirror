# Mirror Mind Documentation

Mirror Mind is a local-first memory and identity framework for agentic AI
runtimes. It gives agents continuity: identity, journeys, memory, personas,
attachments, and runtime-aware skills across Pi, Gemini CLI, Codex, and Claude
Code.

These docs are organized around the Ariad triad — **Product**, **Project**, and
**Process** — with a fourth **Reference** layer for commands, operations, and
developer lookup. The triad keeps the work coherent; the reference layer keeps
practical answers easy to find.

---

## Start here

Choose the path closest to what you are trying to do.

### New user

Start here if you want to install Mirror Mind and run your first mirror session.

- [Getting Started](getting-started.md) — prerequisites, installation, first session
- [Product Principles](product/principles.md) — what Mirror Mind should feel like
- [Command Reference](../REFERENCE.md) — CLI commands, configuration, and runtime operations

### Operator

Start here if you already have a local Mirror Mind runtime and need to inspect,
backup, repair, or update it.

- [Command Reference](../REFERENCE.md#runtime-self-update) — `runtime status`, `diagnose`, `backup`, `version`, and `update`
- [Runtime Repair Policy](process/runtime-repair-policy.md) — safe repair boundaries and recovery routes
- [Troubleshooting](process/troubleshooting.md) — known bugs and operational fixes
- [Releases](releases/index.md) — prospective narrative release notes

Recommended operational sequence:

```bash
uv run python -m memory runtime status
uv run python -m memory runtime diagnose
uv run python -m memory runtime update --check
uv run python -m memory runtime update --dry-run
uv run python -m memory runtime update
```

### Contributor

Start here if you are working on Mirror Mind itself.

- [Development Guide](process/development-guide.md) — lifecycle, checkpoints, coherence check, and validation
- [Engineering Principles](process/engineering-principles.md) — code, testing, and process principles
- [Roadmap](project/roadmap/index.md) — CV → Epic → Story hierarchy with status
- [Decisions](project/decisions.md) — incremental decisions and open discussions
- [Worklog](process/worklog.md) — meaningful completed milestones and verification notes

### Developer

Start here if you need to understand the internals or integrate with Mirror
Mind programmatically.

- [Architecture](product/architecture.md) — system design, layers, schema, and runtime model
- [Python API](product/api.md) — programmatic interface for developers
- [Runtime Interface Spec](product/specs/runtime-interface/index.md) — lifecycle and runtime contract
- [Extension Product Docs](product/extensions/index.md) — stateful extension model

---

## Product

Product docs explain what Mirror Mind is and how it should behave.

- [Product index](product/index.md) — map of product documentation
- [Principles](product/principles.md) — product behavior principles
- [Python API](product/api.md) — programmatic interface for developers integrating with Mirror Core
- [Envisioning](product/envisioning/index.md) — UoC model, lenses, Maestro framing, web perspectives, and coherence as product architecture
- [Specs](product/specs/index.md) — concrete product, web surface, and runtime behavior specifications
- [Extensions](product/extensions/index.md) — user-owned, stateful extensions outside the core

---

## Project

Project docs explain what is being built, why, and what has already been
decided.

- [Briefing](project/briefing.md) — foundational decisions (D1–D8), architecture premises, glossary
- [Decisions](project/decisions.md) — incremental decisions and open discussions
- [Roadmap](project/roadmap/index.md) — CV → Epic → Story hierarchy with status

Current state: **CV0 English Foundation ✅ · CV1 Pi Runtime ✅ · CV2 Runtime Portability ✅ · CV3 Pi Skill Parity ✅ · CV4 Framework/User Separation ✅ · CV5 Multisession Safety ✅ · CV6 Runtime Maturity ✅ · CV7 Intelligence Depth ✅ · CV8 Runtime Expansion ✅ · CV9 Mirror Mind 1.0 🟢 In Progress, with Web Visibility done · CV14 Stateful Extensions 🟢 E1–E2 Done**

Runtime expansion result: **Gemini CLI first at L4 full parity; Codex second at
L3 parity through the wrapper script, JSONL backfill, `AGENTS.md`, and `$mm-*`
skill invocation.**

---

## Process

Process docs explain how work happens and how future sessions preserve project
memory.

- [Development Guide](process/development-guide.md) — operating lifecycle, checkpoints, coherence check, and Builder workflow
- [Engineering Principles](process/engineering-principles.md) — code, testing, and process guidelines
- [Process, Project, Product](process/triad.md) — the three dimensions where Mirror Mind work happens
- [Expand and Collapse](process/expand-collapse.md) — the operating rhythm behind planning, delivery, and release
- [Versioning](process/versioning.md) — prospective versioning rule from CV9.E5 onward
- [Release Notes](process/release-notes.md) — narrative release-note format for future releases
- [Worklog](process/worklog.md) — operational progress: what was done, why, and with what evidence

Operations and repair docs currently live in Process because they define safe
working policy for local runtime changes:

- [Runtime Repair Policy](process/runtime-repair-policy.md) — boundaries and routes for safe runtime repair and self-update
- [Troubleshooting](process/troubleshooting.md) — known bugs in the wild, their root causes, and the fixes that addressed them

---

## Reference

Reference docs answer concrete lookup questions. Some reference surfaces live
under Product when they describe product-owned Mirror Core interfaces.

- [Command Reference](../REFERENCE.md) — CLI behavior, configuration, runtime self-update, and operational details
- [Getting Started](getting-started.md) — prerequisites, installation, first session
- [Architecture](product/architecture.md) — system design, layers, schema, and runtime model
- [Python API](product/api.md) — programmatic interface for developers
- [Releases](releases/index.md) — narrative release notes from CV9.E5 onward
- [CLAUDE.md](../CLAUDE.md) — routing, modes, and available skills

---

## Information architecture note

Before 1.0, Mirror Mind keeps the documentation tree conservative: no broad file
moves just to satisfy symmetry. `docs/releases/` and operations docs under
`docs/process/` stay where they are until the project has enough pressure to
justify a dedicated reference or operations subtree. `docs/product/architecture.md`
and `docs/product/api.md` live under Product because architecture and the Python
API are part of the Mirror Core product surface. This preserves stable reader
paths while keeping product-owned surfaces together.
