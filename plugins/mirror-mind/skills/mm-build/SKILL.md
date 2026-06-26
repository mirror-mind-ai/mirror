---
name: "mm:build"
description: Activates Builder Mode for a journey and loads project context/docs
user-invocable: true
---

# Builder Mode

Activates Builder Mode for a specific journey. Loads identity context and project docs.

## Usage

```
/mm:build <journey-slug>
```

**Example:** `/mm:build my-journey`

---

## 1. Load Context (DB)

```bash
uv run python -m memory build load <slug>
```

The command:
- Prints identity context (soul + ego + user + journey, persona=engineer)
- Prints relevant memories
- Starts a new database conversation session
- Emits `project_path=<path>` as the last output line

## 2. Read Project Docs

Parse `project_path` from the last output line above. If `project_path` is not set, skip this step and proceed — the journey has no associated project yet.

Use file tools to load project documentation. Prefer the project's actual documentation structure over any fixed scaffold.

### Always read when present

- `<project_path>/README.md` — public overview, setup, and usage
- `<project_path>/REFERENCE.md` — detailed operational reference
- `<project_path>/CLAUDE.md` — project-specific operating instructions
- `<project_path>/docs/index.md` — documentation map

### Discover available docs

Run:

```bash
find <project_path>/docs -maxdepth 3 -type f -name '*.md' | sort
```

Then read the docs relevant to the current task.

For Mirror Mind, the primary docs are:

- `<project_path>/docs/getting-started.md`
- `<project_path>/docs/project/briefing.md`
- `<project_path>/docs/project/decisions.md`
- `<project_path>/docs/product/specs/runtime-interface/index.md`
- `<project_path>/docs/project/roadmap/index.md`
- `<project_path>/docs/process/development-guide.md`
- `<project_path>/docs/process/worklog.md`
- `<project_path>/docs/product/principles.md`

When working inside a CV/Epic/Story, also read the relevant:

- `index.md`
- `plan.md`
- `test-guide.md`
- `refactoring.md`, if present

## 3. Work In Builder Mode

- Work from `project_path` - read, edit, and create project files normally
- Keep project docs updated as the code evolves
- Commit at the end of each session with a descriptive English commit message

## 4. Project Docs Maintenance

Follow the project's existing documentation structure. Do not create a generic docs scaffold unless the user explicitly asks for one.

**When to update docs:**
- `README.md`: public positioning, setup, stack, or usage changes
- `REFERENCE.md`: CLI behavior, configuration, runtime contracts, or operational details change
- `docs/project/briefing.md`: stable architectural premises change
- `docs/project/decisions.md`: an incremental design decision is made
- `docs/product/specs/runtime-interface/index.md`: runtime lifecycle, hooks, skills, or extension contracts change
- `docs/project/roadmap/`: CV/Epic/Story status, plans, or verification guides change
- `docs/process/worklog.md`: a meaningful milestone is completed
- `docs/product/principles.md`: product, code, testing, or process principles change

## 5. Configure `project_path`

If the journey does not yet have an associated project:

```bash
uv run python -m memory journey set-path <slug> /path/to/project
```

## 6. Finalize Session

When the user says "End the session":

```bash
uv run python -m memory mirror log "SESSION_SUMMARY"
```
