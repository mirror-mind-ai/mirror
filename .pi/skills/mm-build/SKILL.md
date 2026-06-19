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

Codex:

```
$mm-build <journey-slug>
```

Claude Code:

```
/mm:build <journey-slug>
```

---

# Base Builder Mode Behavior

This is the default behavior for every journey, including journeys that have not
adopted Ariad or any Builder method.

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

Render the `build load` transition surface visibly before continuing with project
doc loading or substantive Builder work.

For journeys without adopted Ariad, preserve original Builder behavior:

- load context;
- read project docs;
- stop at the Builder Activation Boundary;
- ask what work should be done next.

Do not render Ariad surfaces, Ariad lifecycle suggestions, roadmap snapshot,
pull candidates, cursor state, or checkpoint language for journeys that have not
adopted Ariad.

For Ariad-adopted journeys, see **Ariad Runtime Behavior** below.

Builder Mode surface should orient the user around:

- active journey
- journey path/stage, when present
- project path, when present
- compact briefing/synthesis
- boundary: `Builder executes commitment.`

## 2. Read Project Docs

Parse `project_path` from the last output line above. If `project_path` is not
set, skip this step and proceed — the journey has no associated project yet.

Use file tools to load project documentation. Prefer the project's actual
documentation structure over any fixed scaffold.

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

When working inside a CV/Delivery Story/User Story/Technical Story, also read the relevant:

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

## 4. Work In Builder Mode

Once the user explicitly authorizes work:

- Work from `project_path` — read, edit, and create project files normally
- Keep project docs updated as the code evolves
- Commit at the end of each session with a descriptive English commit message

## 5. Project Docs Maintenance

Follow the project's existing documentation structure. Do not create a generic
docs scaffold unless the user explicitly asks for one.

**When to update docs:**

- `README.md`: public positioning, setup, stack, or usage changes
- `REFERENCE.md`: CLI behavior, configuration, runtime contracts, or operational details change
- `docs/project/briefing.md`: stable architectural premises change
- `docs/project/decisions.md`: an incremental design decision is made
- `docs/product/specs/runtime-interface/index.md`: runtime lifecycle, hooks, skills, or extension contracts change
- `docs/project/roadmap/`: CV/Delivery Story/User Story/Technical Story status, plans, or verification guides change
- `docs/process/worklog.md`: a meaningful milestone is completed
- `docs/product/principles.md`: product, code, testing, or process principles change

## 6. Configure `project_path`

If the journey does not yet have an associated project:

```bash
uv run python -m memory journey set-path <slug> /path/to/project
```

## 7. Finalize Session

When the user says "End the session":

```bash
uv run python -m memory mirror log "SESSION_SUMMARY"
```

---

# Adopted Method Behavior

A journey may adopt a Builder method. Method-specific behavior applies only when
that method has been adopted for the active journey.

Currently implemented method-specific runtime: **Ariad**.

For journeys without adopted Ariad:

- preserve Base Builder Mode behavior;
- do not render Ariad surfaces;
- do not route roadmap, pull, prepare, template, cursor, or lifecycle requests to Ariad commands;
- if the user asks for Ariad behavior, explain that Ariad must be adopted first.

## Inspect Builder Method

When the user asks which Builder method governs the active journey, inspect the
current Builder method state:

```bash
uv run python -m memory build inspect-method
```

If the user names a specific journey:

```bash
uv run python -m memory build inspect-method --journey <slug>
```

Render the command output visibly. If no Builder journey is active yet, say so
plainly and ask the user to activate or name a journey. If the journey has not
adopted a Builder method yet, say so plainly. Do not infer that Ariad governs the
journey just because Ariad is available.

When the user asks what Ariad is as a Builder method, inspect the built-in method
defaults:

```bash
uv run python -m memory build inspect-method ariad
```

This is read-only inspection.

## Adopt Ariad

When the user explicitly asks to adopt Ariad for the active journey, run:

```bash
uv run python -m memory build adopt --method ariad
```

If the user names a specific journey:

```bash
uv run python -m memory build adopt --journey <slug> --method ariad
```

Render the adoption report visibly. This mutates Builder method state only. It
must not generate templates, create a delivery cursor, execute lifecycle work,
change story status, commit, push, or release.

---

# Ariad Runtime Behavior

This section applies **only when the active journey has adopted Ariad**
(`adopted_method == ariad`).

## Deterministic Ariad Surface Transport Protocol

This is a transport invariant for **all** Ariad commands and lifecycle phases,
not a phase-specific instruction. In the Ariad method DSL, surfaces are runtime
artifacts with `transport=verbatim`, `marker_protocol=ariad_compact`, and
`interpretation_policy=after_block_only`.

Ariad runtime commands emit deterministic surfaces wrapped as:

```text
<<<ARIAD:<SURFACE_ID>>>
...
<<<END:<SURFACE_ID>>>
```

For any command output that contains one or more Ariad surface blocks, the final
assistant response must return **every marked block** from stdout verbatim before
any commentary. This is a hard rendering requirement, not optional tool-output
evidence. Do not summarize, translate, reorder, trim, rewrap, re-indent,
reformat, or mix prose inside a wrapped surface. Do not replace a surface with a
conversational summary, even when the user phrase is short (for example,
`validated`, `approved`, `ok`, or `continue`). If you catch yourself summarizing
a marked Ariad surface, stop and re-render the complete marked block before any
interpretation.

If multiple Ariad surface blocks are emitted, return all of them in the same
order. After the complete surface block(s), add a conversational interpretation
for the Navigator. This interpretation should explain what happened, what it
means, what is blocked or allowed now, and what the next Ariad step is. It may be
complete and helpful, not merely a one-line summary, but it must stay outside the
surface block and must not contradict the runtime boundary.

Use this pattern:

```text
<<<ARIAD:<SURFACE_ID>>>
...
<<<END:<SURFACE_ID>>>

What happened:
...

Next step:
...
```

## Ariad Activation Surfaces

For Ariad-adopted journeys with no active item, `build load` can emit:

- `■ Builder Home`
- `ROADMAP SNAPSHOT`
- `■ Ariad Pull Candidates`

For Ariad-adopted journeys with an active item or pending confirmation,
`build load` can emit:

- `■ BUILDER RESUME`

These surfaces are mandatory activation output. The final response to the user
must include the wrapped Ariad surface blocks verbatim from the command output.
If the command output contains `<<<ARIAD:BUILDER_HOME>>>`,
`<<<ARIAD:ROADMAP_SNAPSHOT>>>`, or `<<<ARIAD:PULL_CANDIDATES>>>`, the response
is invalid unless the visible reply also contains every complete matching
begin/end block in stdout order.

After rendering these surfaces, do not ask a generic question such as "inspeção
runtime, planejamento de Delivery, ou exploração?" and do not add a third
runtime-inspection option unless the surface itself recommends it. For an Ariad
journey with no active item, ask only whether the Navigator wants to pull the
recommended candidate or inspect the roadmap further after the verbatim blocks.

## Compose Refinement Work

When the Navigator uses natural language such as "capture this as a CR", "create
a CR", "register this refinement", "add this to the Workbench", or "this should
be a refinement", treat it as Refinement Work capture rather than roadmap
Delivery Work. Ask only for missing essentials: CR title/body and whether to
attach it to an existing Refinement Story or keep it unassigned. Do not invent
missing title/body/RS target.

When the Navigator asks to "create an RS", "compose a refinement story", "group
these CRs", or "show me that refinement story", route to the Builder Workbench
commands:

```bash
uv run python -m memory build refinement-story create --journey <slug> --title "<title>" [--description "<description>"]
uv run python -m memory build change-request capture --journey <slug> --title "<title>" --body "<body>" [--refinement-story-id <rs-id>]
uv run python -m memory build change-request attach --journey <slug> --change-request-id <cr-id> --refinement-story-id <rs-id>
uv run python -m memory build refinement-story overview --journey <slug> --refinement-story-id <rs-id>
```

When the Navigator asks to "pull that refinement story", "start working on
RS-001", "enter refinement work for ...", or "pull the RS we just created", route
to:

```bash
uv run python -m memory build refinement-story pull --journey <slug> --refinement-story-id <rs-id>
```

Use the recent RS context only when it is unambiguous. If "pull" could mean a
Delivery candidate or a Workbench Refinement Story, ask which field/item to pull.

Render `CHANGE_REQUEST_CAPTURED`, `REFINEMENT_STORY_OVERVIEW`, and
`REFINEMENT_STORY_PULLED` Ariad surfaces verbatim before commentary.
Composition captures or organizes work only. Pulling an RS selects active
Refinement Work only: it must not start a CR lifecycle, mutate Delivery cursor
state, change roadmap status, implement files, commit, push, or release.

If the Navigator's language implies immediate fixing, distinguish capture/pull
from execution: capture or pull only when requested, and explain that executing a
CR is a later lifecycle step.

When the Navigator asks to select, confirm, plan, mark implemented, validate, or
mark done a Change Request in active Refinement Work, route to:

```bash
uv run python -m memory build change-request select --journey <slug> --change-request-id <cr-id>
uv run python -m memory build change-request confirm --journey <slug> --change-request-id <cr-id>
uv run python -m memory build change-request plan --journey <slug> --change-request-id <cr-id> --summary "<plan>"
uv run python -m memory build change-request mark-implemented --journey <slug> --change-request-id <cr-id> --evidence "<evidence>"
uv run python -m memory build change-request validate --journey <slug> --change-request-id <cr-id> --evidence "<evidence>"
uv run python -m memory build change-request done --journey <slug> --change-request-id <cr-id> --notes "<done note>"
```

When the Navigator asks to review, check coherence, or close an active RS, route
to:

```bash
uv run python -m memory build refinement-story review --journey <slug> --refinement-story-id <rs-id> --summary "<review>"
uv run python -m memory build refinement-story coherence --journey <slug> --refinement-story-id <rs-id> --summary "<coherence>"
uv run python -m memory build refinement-story close --journey <slug> --refinement-story-id <rs-id> --summary "<close summary>"
```

Render `REFINEMENT_FLOW_EVENT` surfaces verbatim before commentary. Review and
Coherence must not mutate files directly; required changes discovered there must
become CRs or future work.

## Prepare Ariad Templates

When the user asks to prepare Ariad templates or make the adopted journey
documentation-ready, run:

```bash
uv run python -m memory build prepare-templates --method ariad
```

If the user names a specific journey:

```bash
uv run python -m memory build prepare-templates --journey <slug> --method ariad
```

Render the report visibly. The operation may create missing method-declared
template files, but must preserve existing files and must not create a delivery
cursor, execute lifecycle work, change story status, commit, push, or release.

## Sync Delivery Cursor

When the user asks to sync the initial Builder delivery cursor for an
Ariad-adopted journey, run:

```bash
uv run python -m memory build sync-cursor --method ariad
```

If the user names a specific journey:

```bash
uv run python -m memory build sync-cursor --journey <slug> --method ariad
```

Render the cursor sync report visibly. This persists runtime resume state only.
It must not infer an active roadmap item, execute Pull/Prepare/Plan, change story
status, commit, push, or release.

## Inspect Roadmap And Pull Candidates

When the user asks to see the roadmap, inspect the roadmap, show roadmap
candidates, see what can be pulled, choose the next story, or asks "o que posso
puxar agora?", run:

```bash
uv run python -m memory build pull-candidates --method ariad
```

If the user names a specific journey, pass `--journey <slug>`. Render the
configured Ariad surfaces visibly, currently `ROADMAP SNAPSHOT` and `■ Ariad Pull
Candidates`. This is read-only: it must not pull an item, update the cursor,
execute lifecycle work, change story status, commit, push, or release.

## Pull And Prepare Ariad Work

When the user asks to change testing/runtime cadence, use:

```bash
uv run python -m memory build set-cadence --method ariad --profile <stepwise|checkpoint|accelerated|autonomous>
```

Use `stepwise` for detailed dogfooding. Use `checkpoint` for normal Ariad cadence. Use `accelerated` only to continue through soft stops while still stopping at hard gates. Use `autonomous` only with explicit Navigator limits, for example:

```bash
uv run python -m memory build set-cadence --method ariad \
  --profile autonomous \
  --limit "stop before push or release" \
  --limit "stop on scope change" \
  --limit "stop on failing checks"
```

Higher-autonomy cadence never grants permission to cross hard gates: Plan approval, Navigator validation acceptance, debt decisions, unsafe operations, scope changes, push/release, and Done/history boundaries remain explicit stops. In current Ariad, Pull is the Navigator signal to Prepare; pulling a Delivery Story also expands it into implementable User/Technical Stories and stops for confirmation of the recommended next story.

When the user asks to continue under the active cadence, use:

```bash
uv run python -m memory build continue-lifecycle --method ariad \
  --process "<process alignment evidence>" \
  --project "<project/docs/artifacts alignment evidence>" \
  --product "<product behavior alignment evidence>" \
  --history-action "<required to cross Done/history boundary>" \
  --roadmap-update "<required to cross Done/history boundary>" \
  --next-recommendation "<required to cross Done/history boundary>"
```

`continue-lifecycle` may emit multiple Ariad surfaces; return every marked block verbatim in order. In `stepwise` cadence it must refuse automatic continuation. In higher-autonomy cadence it may continue only through bypassable soft stops and must still stop at hard gates when required evidence is missing.

When the user asks to pull a roadmap item into active Ariad work, run the
contained Pull command with explicit item metadata:

```bash
uv run python -m memory build pull-item --method ariad \
  --item-code <code> \
  --item-title "<title>" \
  --item-level <delivery_story|user_story|technical_story> \
  --why-now "<why this level now>"
```

If the user names a specific journey, pass `--journey <slug>`. Render all emitted
surfaces visibly. Pull may update runtime cursor active item and automatically
run Prepare. If the pulled item is a Delivery Story, Pull also expands it into
implementable child stories and recommends the next User/Technical Story to plan.
Pull must not create a Plan, approve a checkpoint, implement, validate, review,
close, commit, push, or release.

When the Navigator confirms the recommended child story after an Expand surface,
pull that child story explicitly with `--item-level user_story` or
`--item-level technical_story` using the recommended code/title from the surface.
Then plan that implementable story when requested.

When the user asks to prepare the pulled item, run:

```bash
uv run python -m memory build prepare-item --method ariad
```

If the user names a specific journey, pass `--journey <slug>`. Render the Prepare
report visibly. Prepare may update the runtime cursor last delivery event, but
must not create a Plan, approve a checkpoint, start implementation, change story
status, commit, push, or release.

## Delivery Story Navigator Flow

When the active Ariad work is a Delivery Story or the Navigator refers to the
current Delivery Story and says a natural-language equivalent of:

- `quero seguir no nível da DS`
- `seguir no nível da Delivery Story`
- `use Delivery Story flow`
- `não preciso validar cada US`
- `aprove um plano geral da DS e eu valido no fim`

run:

```bash
uv run python -m memory build set-flow-unit --method ariad --unit delivery_story
```

If the user names a specific journey, pass `--journey <slug>`. Return the
`NAVIGATOR_FLOW_UNIT` surface verbatim. Explain after the surface that child
User/Technical Stories remain traceable Driver work packages, and that choosing
Delivery Story flow does not approve a Plan, start implementation, validate,
push, or release.

When the effective flow unit is `story_by_story`, preserve existing child-story
Plan behavior. Do not silently use Delivery Story-level Plan unless the
Navigator has selected `delivery_story` flow or explicitly asks to follow work at
Delivery Story level.

## Delivery Story Plan Ariad Work

When the active Ariad work is a Delivery Story with
`navigator_flow_unit=delivery_story` and the Navigator says a natural-language
equivalent of:

- `planeje a DS`
- `planeje a Delivery Story`
- `plan the Delivery Story`
- `crie o plano geral da DS`

run:

```bash
uv run python -m memory build plan-delivery-story --method ariad \
  --objective "<aggregate Delivery Story objective>" \
  --child <child-work-item-code>
```

Pass one `--child` argument for each known child User/Technical Story work
package. If child work packages are already present in the cursor, the command
may use them; otherwise include the known roadmap child codes. If the user names
a specific journey, pass `--journey <slug>`.

Return the `DELIVERY_STORY_PLAN_CHECKPOINT` surface verbatim. Interpret only
after the block. Explain that the DS-level Plan is pending approval and that no
implementation, validation, push, or release is authorized by planning alone.

If the Navigator asks to plan the Delivery Story before selecting
`delivery_story` flow, first surface or request the flow-unit choice; do not
silently use DS-level Plan from the default `story_by_story` flow.

When the Navigator approves a pending DS-level Plan with natural language such
as `aprovo o plano da DS`, `plano da DS aprovado`, or `approve the Delivery
Story plan`, run:

```bash
uv run python -m memory build approve-delivery-story-plan --method ariad
```

If the user names a specific journey, pass `--journey <slug>`. Return the
approved `DELIVERY_STORY_PLAN_CHECKPOINT` surface verbatim. Explain after the
surface that child work may proceed under the aggregate DS Plan contract, while
unsafe operations, scope changes, debt decisions, push, release, and final Done
boundaries remain hard stops.

## Plan Ariad Work

When the user asks to plan the pulled item, create a plan for the active item, or
says a natural-language equivalent such as `planeje o item puxado`, run:

```bash
uv run python -m memory build plan-item --method ariad
```

If the user names a specific journey, pass `--journey <slug>`. Render the Plan
Checkpoint visibly and include the `plan artifact` path from the command output
in the reply. The response must show the actual plan content in Navigator-facing
language: scope, non-goals, acceptance behavior, validation route, E2E decision,
and approval question. Keep runtime cursor fields compact; do not let technical
metadata replace the plan itself.

Plan may update runtime cursor checkpoint state and may create/update the
Plan-stage story package (`index.md`, `plan.md`, and `test-guide.md`) only for an
implementable User Story or Technical Story. Delivery Stories are never planned
as the implementable unit; they must expand first. Plan must not approve the
checkpoint, start implementation, change implementation files for the pulled
item, change story status, commit, push, or release.

When the Navigator approves the Plan checkpoint, run:

```bash
uv run python -m memory build approve-plan --method ariad
```

If the user asks to implement while the Plan checkpoint is pending, run the guard
before doing any implementation work:

```bash
uv run python -m memory build check-implementation --method ariad
```

Render the deterministic `IMPLEMENTATION_GUARD` surface. If the guard reports
that Navigator approval is required, return the surface and stop. Do not mutate
files.

## Delivery Story Validation And Closure

When the active Ariad work is a Delivery Story with
`navigator_flow_unit=delivery_story` and an approved aggregate DS Plan, route
natural Navigator requests for aggregate DS closure through the Delivery Story
runtime commands.

For natural validation requests such as `valide a DS`, `valide a Delivery
Story`, or `validação da DS aceita`, run:

```bash
uv run python -m memory build validate-delivery-story --method ariad \
  --summary "<aggregate DS validation evidence>" \
  --navigator-accepted
```

For DS-level debt review requests, run:

```bash
uv run python -m memory build review-delivery-story --method ariad \
  --decision <no_action|defer|pay_now> \
  --summary "<DS-level debt review summary>"
```

For DS-level coherence requests, run:

```bash
uv run python -m memory build coherence-delivery-story --method ariad \
  --summary "<DS-level coherence summary>"
```

For DS-level Done requests, run:

```bash
uv run python -m memory build done-delivery-story --method ariad \
  --summary "<DS-level done/history summary>"
```

If the user names a specific journey, pass `--journey <slug>`. Return every
`DELIVERY_STORY_CLOSURE_CHECKPOINT` surface verbatim. Explain after the block
that child User/Technical Stories remain evidence units and that push/release
remain separate hard gates. Do not use these DS-level closure commands when the
effective flow unit is `story_by_story`; preserve existing child-story lifecycle
behavior in that mode.

## Validate Ariad Work

After implementation is complete and before moving to Debt Review, Coherence, or
Done, render the Validation checkpoint:

```bash
uv run python -m memory build validate-item --method ariad \
  --implementation-complete \
  --check "<automated check command or evidence>" \
  --checks-status <passed|failed|not_run> \
  --e2e-decision <required|not_required|waived|skipped> \
  --e2e-evidence "<E2E evidence or waiver/skipped reason>" \
  --navigator-route "<Navigator-visible validation route>" \
  --navigator-accepted \
  --expected-observation "<what the Navigator should observe>" \
  --pass-condition "<what counts as pass>" \
  --fail-condition "<what counts as fail>"
```

If the Navigator has already performed and accepted the validation route, also
pass `--navigator-accepted`. Providing a route is not the same as acceptance.

If the user names a specific journey, pass `--journey <slug>`. Render the
deterministic `VALIDATION_CHECKPOINT` surface. If required evidence is missing or
Navigator validation has not been accepted, return the surface and stop; do not
advance to Debt Review, Coherence, Done, commit, push, or release.

## Review Ariad Debt

After Validation has passed and before moving to Coherence or Done, render the
Debt Review checkpoint:

```bash
uv run python -m memory build review-item --method ariad \
  --debt "<debt finding, or No debt found>" \
  --decision <pending|no_action|defer|pay_now> \
  --defer-reason "<required when decision=defer>" \
  --revisit-trigger "<required when decision=defer>"
```

If the user names a specific journey, pass `--journey <slug>`. Render the
deterministic `DEBT_REVIEW_CHECKPOINT` surface. If the decision is `pending`,
`defer` without a reason/trigger, or `pay_now`, stop at the debt decision
checkpoint. `pay_now` must route through a future Refactor loop before Coherence.
Do not advance to Coherence, Done, commit, push, or release while the debt
decision is unresolved.

## Check Ariad Coherence

After Debt Review is complete and before Done, render the Coherence checkpoint:

```bash
uv run python -m memory build coherence-item --method ariad \
  --process "<process alignment evidence>" \
  --project "<project/docs/artifacts alignment evidence>" \
  --product "<product behavior alignment evidence>" \
  --local-difference "<optional Ariad vs local guide difference>"
```

If the user names a specific journey, pass `--journey <slug>`. Render the
deterministic `COHERENCE_CHECKPOINT` surface. If coherence is blocked, return the
surface and stop; do not advance to Done, commit, push, or release.

## Close Ariad Done

After Coherence is complete, render the Done checkpoint:

```bash
uv run python -m memory build done-item --method ariad \
  --history-action "<commit/history action taken or proposed>" \
  --roadmap-update "<roadmap/story package update>" \
  --next-recommendation "<next Pull, parent collapse, or release boundary>"
```

If the user names a specific journey, pass `--journey <slug>`. Render the
deterministic `DONE_CHECKPOINT` surface. Done must name the history action,
roadmap/story package update, and next Ariad movement. Do not push or release
unless the effective policy explicitly allows it.
