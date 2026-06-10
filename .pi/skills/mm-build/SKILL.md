---
name: "mm-build"
description: Activates Builder Mode for a journey and loads project context/docs
user-invocable: true
---

# Builder Mode

Activates Builder Mode for a specific journey. Loads identity context and project docs.

## Usage

Pi and Gemini CLI:

```
/mm-build <journey-slug>
```

**Example:** `/mm-build my-journey`

Codex:

```
$mm-build <journey-slug>
```

**Example:** `$mm-build my-journey`

Claude Code:

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
- Activates `■ Builder Mode` in the operating-mode lifecycle
- Renders the Mode Transition Surface (`■ BUILDER MODE ACTIVE`)
- Prints identity context (soul + ego + user + journey, persona=engineer)
- Prints relevant memories
- Starts a new database conversation session
- Emits `project_path=<path>` as the last output line

## 1.1 Transition Surface

The `build load` output includes the conversational transition surface. Render
that surface visibly to the user before continuing with project-doc loading or
substantive Builder work. Do not recreate it from scratch unless the command
failed to render it; copy the rendered surface from the command output.

Builder Mode surface should orient the user around:

- active journey
- journey path/stage, when present
- project path, when present
- compact briefing/synthesis
- boundary: `Builder executes commitment.`

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

## 3. Builder Activation Boundary

Activating Builder Mode or loading a journey is context setup only. After loading
the context and required docs, stop and ask what work should be done next.

Do not edit files, create tests, run implementation, start TDD, or mutate project
state until the user gives an explicit implementation or documentation
instruction, such as `implement`, `fix`, `edit`, `create`, `run tests`, or names a
specific story to execute.

Context activation is not execution consent.

## 4. Inspect Builder Method

When the user asks in natural language which Builder method governs the active
journey, what method this journey uses, or to show the Builder method, inspect
the current Builder method state:

```bash
uv run python -m memory build inspect-method
```

If the user names a specific journey, inspect that journey explicitly:

```bash
uv run python -m memory build inspect-method --journey <slug>
```

Render the command output visibly. If no Builder journey is active yet, say so
plainly and ask the user to activate or name a journey. If the journey has not
adopted a Builder method yet, say so plainly. Do not adopt Ariad, mutate runtime
state, or infer that Ariad governs the journey just because Ariad is available.

When the user asks what Ariad is as a Builder method, inspect the available
built-in method defaults:

```bash
uv run python -m memory build inspect-method ariad
```

This is read-only inspection, not Builder activation, adoption, resume, or
lifecycle execution.

## 5. Adopt Builder Method

When the user asks in natural language to adopt Ariad for the active journey,
configure this journey to use Ariad, or make Ariad the Builder method for this
journey, run:

```bash
uv run python -m memory build adopt --method ariad
```

If the user names a specific journey, pass it explicitly:

```bash
uv run python -m memory build adopt --journey <slug> --method ariad
```

Render the adoption report visibly. This is an explicit mutation of Builder
method state, but it must not generate roadmap templates, create a delivery
cursor, execute lifecycle work, change story status, commit, push, or release.
If no Builder journey is active and no journey is named, ask the user to activate
or name a journey.

## 6. Work In Builder Mode

Once the user explicitly authorizes work:

- Work from `project_path` - read, edit, and create project files normally
- Keep project docs updated as the code evolves
- Commit at the end of each session with a descriptive English commit message

## 7. Project Docs Maintenance

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

## 8. Configure `project_path`

If the journey does not yet have an associated project:

```bash
uv run python -m memory journey set-path <slug> /path/to/project
```

## 9. Finalize Session

When the user says "End the session":

```bash
uv run python -m memory mirror log "SESSION_SUMMARY"
```
