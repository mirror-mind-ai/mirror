"""Built-in Ariad method definition for Builder Mode."""

from __future__ import annotations

from memory.builder.method_definition import (
    CadenceProfileDefinition,
    CheckpointDefinition,
    ContractDefinition,
    DslResolution,
    LifecycleEvent,
    MethodDefinition,
    SurfaceDefinition,
    SurfaceRoute,
    Taxonomy,
    TaxonomyLevel,
    TemplateDefinition,
    WorkItemLevelDefinition,
)

_STATE_VOCABULARY = (
    "Planned",
    "Active",
    "Blocked",
    "Validated",
    "Done",
    "Deferred",
    "Dropped",
)

_ARIAD_TEMPLATES = (
    TemplateDefinition(
        id="ariad_adoption",
        path="docs/project/roadmap/ariad-adoption.md",
        description="Records Ariad adoption readiness for this project.",
        content="""# Ariad Adoption

This project is prepared for Ariad-governed Builder Mode.

## Method

- adopted method: ariad
- adoption prepares documentation templates only
- delivery cursor sync is handled by a later Builder story

## Boundaries

Template preparation does not execute story lifecycle work, change story status,
commit, push, or release.
""",
    ),
    TemplateDefinition(
        id="technical_debt_ledger",
        path="docs/project/roadmap/technical-debt-ledger.md",
        description="Versioned debt ledger used by Ariad Review and Refactor.",
        content="""# Technical Debt Ledger

Ariad Review records technical debt here when debt should be paid now or deferred.

| ID | Source Story | Location | Kind | Description | Impact | Recommendation | Navigator Decision | Status |
|----|--------------|----------|------|-------------|--------|----------------|--------------------|--------|

## Deferred Debt Requirements

When debt is deferred, record the defer reason and revisit trigger.
""",
    ),
    TemplateDefinition(
        id="delivery_story_index",
        path="docs/project/roadmap/templates/delivery-story-index.md",
        description="Template for an Ariad Delivery Story index.",
        content="""[< Parent](../index.md)

# <CODE> — <Delivery Story Title>

**Status:** 🟡 Planned

---

## Outcome

<Coherent delivery outcome this story creates.>

## Candidate Stories

| Code | Story | Type | Outcome | Status |
|------|-------|------|---------|--------|

## Done Condition

<Condition that closes this delivery story.>
""",
    ),
    TemplateDefinition(
        id="user_story_index",
        path="docs/project/roadmap/templates/user-story-index.md",
        description="Template for an Ariad User Story index.",
        content="""[< Parent](../index.md)

# <CODE> — <User Story Title>

**Status:** 🟡 Planned
**Type:** User Story

---

## User Story

As a [user persona],
I want to [action/feature],
So that [benefit/value].

## Outcome

<Navigator-visible behavior or capability.>

## Acceptance Behavior

```text
Given <context>
When <action>
Then <observable result>
```

## Scope

- <in scope>

## Out Of Scope

- <out of scope>

## Validation

<Navigator-facing validation route.>
""",
    ),
    TemplateDefinition(
        id="technical_story_index",
        path="docs/project/roadmap/templates/technical-story-index.md",
        description="Template for an Ariad Technical Story index.",
        content="""[< Parent](../index.md)

# <CODE> — <Technical Story Title>

**Status:** 🟡 Planned
**Type:** Technical Story

---

## Technical Story

In order to [achieve a technical benefit/business capability],
As [an engineering team/system component],
I want to [perform a technical action],
So that [expected technical outcome].

## Outcome

<Internal capability or substrate.>

## Acceptance Behavior

```text
Given <technical context>
When <operation runs>
Then <internal behavior or invariant holds>
```

## Scope

- <in scope>

## Out Of Scope

- <out of scope>

## Validation

<Automated or internal validation route.>
""",
    ),
    TemplateDefinition(
        id="plan",
        path="docs/project/roadmap/templates/plan.md",
        description="Template for the Ariad Plan checkpoint artifact.",
        content="""[< Story](index.md)

# Plan — <CODE> <Title>

## Pull

<Pulled item and why this level now.>

## Prepare

<Context summary, story shape, risks, and applicable rules.>

## Scope

- <in scope>

## Non-Goals

- <out of scope>

## Implementation Approach

<How implementation will proceed.>

## Test Strategy

<Automated and manual tests.>

## Validation Route

<How the Navigator validates observable behavior, when applicable.>

## Checkpoint

Implementation must not start until the Navigator approves this plan.
""",
    ),
    TemplateDefinition(
        id="test_guide",
        path="docs/project/roadmap/templates/test-guide.md",
        description="Template for Ariad validation evidence and Navigator validation.",
        content="""[< Story](index.md)

# Test Guide — <CODE> <Title>

## Automated Validation

```bash
<commands>
```

## Navigator Validation

<Manual validation route, expected observation, pass condition, and fail condition.>

## Validation Evidence

<Recorded evidence after validation runs.>
""",
    ),
    TemplateDefinition(
        id="review",
        path="docs/project/roadmap/templates/review.md",
        description="Template for Ariad Review debt scan.",
        content="""[< Story](index.md)

# Review — <CODE> <Title>

## Changed Surface

<Files, modules, docs, and behaviors changed.>

## Debt Scan

<Design, test, documentation, duplication, complexity, naming, coupling, or migration debt.>

## Recommendation

<No action, defer, or pay now.>

## Navigator Decision

<Decision and rationale.>
""",
    ),
    TemplateDefinition(
        id="coherence",
        path="docs/project/roadmap/templates/coherence.md",
        description="Template for Ariad Coherence integration check.",
        content="""[< Story](index.md)

# Coherence — <CODE> <Title>

## Process

<Lifecycle and checkpoint alignment.>

## Project

<Roadmap, docs, and runtime state alignment.>

## Product

<Behavior and product boundary alignment.>

## Result

<Coherent or incoherent, with next action.>
""",
    ),
)

ARIAD_METHOD = MethodDefinition(
    id="ariad",
    label="Ariad",
    resolution=DslResolution(
        layers=(
            "method_default",
            "project_config",
            "journey_config",
            "navigator_override",
        ),
        conflict_policy="explicit_override",
        audit=True,
    ),
    taxonomy=Taxonomy(
        state_vocabulary=_STATE_VOCABULARY,
        levels=(
            TaxonomyLevel(
                id="cv",
                label="Capability Value",
                contains=("delivery_story",),
                allowed_states=(
                    "Planned",
                    "Active",
                    "Blocked",
                    "Done",
                    "Deferred",
                    "Dropped",
                ),
                state_semantics={
                    "Done": "the project reached the value boundary named by this CV",
                },
            ),
            TaxonomyLevel(
                id="delivery_story",
                label="Delivery Story",
                contains=("user_story", "technical_story"),
                allowed_states=_STATE_VOCABULARY,
                state_semantics={
                    "Validated": (
                        "child stories passed their relevant validation, but delivery story "
                        "closure may still be pending"
                    ),
                    "Done": (
                        "child stories produced a coherent delivery outcome and the project "
                        "history reflects that outcome"
                    ),
                },
            ),
            TaxonomyLevel(
                id="user_story",
                label="User Story",
                contains=("task",),
                allowed_states=_STATE_VOCABULARY,
                state_semantics={
                    "Validated": (
                        "observable behavior or capability passed automated evidence and "
                        "Navigator-facing validation"
                    ),
                    "Done": (
                        "validated behavior is coherent, reviewed, recorded, and absorbed "
                        "into its parent delivery arc"
                    ),
                },
            ),
            TaxonomyLevel(
                id="technical_story",
                label="Technical Story",
                contains=("task",),
                allowed_states=_STATE_VOCABULARY,
                state_semantics={
                    "Validated": (
                        "internal capability passed automated or internal evidence sufficient "
                        "for the delivery story"
                    ),
                    "Done": (
                        "technical substrate is coherent, reviewed, recorded, and ready for "
                        "its parent delivery arc"
                    ),
                },
            ),
            TaxonomyLevel(
                id="task",
                label="Task",
                allowed_states=("Planned", "Active", "Blocked", "Done"),
                state_semantics={
                    "Done": "concrete local work is complete inside its parent story",
                },
            ),
        ),
    ),
    lifecycle=(
        LifecycleEvent(id="pull", meaning="escolhe o foco"),
        LifecycleEvent(id="prepare", meaning="lê o terreno"),
        LifecycleEvent(id="expand", meaning="desdobra granularidade"),
        LifecycleEvent(id="plan", meaning="firma o contrato"),
        LifecycleEvent(id="implement", meaning="muda o sistema"),
        LifecycleEvent(id="validation", meaning="prova comportamento"),
        LifecycleEvent(id="review", meaning="encara a dívida"),
        LifecycleEvent(id="coherence", meaning="integra os rastros"),
        LifecycleEvent(id="done", meaning="registra e fecha"),
    ),
    work_item_levels=(
        WorkItemLevelDefinition(
            id="delivery_story",
            label="Delivery Story",
            implementable_by_default=False,
            expands_to=("user_story", "technical_story"),
        ),
        WorkItemLevelDefinition(id="user_story", label="User Story", implementable_by_default=True),
        WorkItemLevelDefinition(
            id="technical_story",
            label="Technical Story",
            implementable_by_default=True,
        ),
    ),
    cadence_profiles=(
        CadenceProfileDefinition(
            id="stepwise",
            label="Stepwise",
            stop_policy="stop_after_every_phase",
        ),
        CadenceProfileDefinition(
            id="checkpoint",
            label="Checkpoint",
            stop_policy="continue_until_next_method_checkpoint",
        ),
        CadenceProfileDefinition(
            id="accelerated",
            label="Accelerated",
            stop_policy="continue_through_soft_stops_stop_at_hard_gates",
            active=True,
        ),
        CadenceProfileDefinition(
            id="autonomous",
            label="Autonomous",
            stop_policy="continue_until_hard_constraint_with_explicit_limits",
            active=True,
        ),
    ),
    checkpoints=(
        CheckpointDefinition(
            id="after_plan",
            occurs_after="plan",
            blocks=("implement",),
            required_artifacts=("plan",),
            required_confirmations=("navigator_approval",),
        ),
        CheckpointDefinition(
            id="navigator_validation",
            occurs_after="validation",
            blocks=("done",),
            required_artifacts=("validation_route", "validation_evidence"),
            required_confirmations=("navigator_validation",),
        ),
        CheckpointDefinition(
            id="review_decision",
            occurs_after="review",
            blocks=("coherence",),
            required_artifacts=("review_report",),
            required_confirmations=("navigator_debt_decision",),
        ),
    ),
    contracts=(
        ContractDefinition(
            id="pull_contract",
            applies_at="pull",
            rules=(
                "choose an explicit focus before delivery work begins",
                "classify the pulled work as delivery_story, user_story, technical_story, task, or maintenance",
                "do not start roadmap candidates automatically",
                "preserve Navigator choice as the commitment boundary",
            ),
            required_outputs=("selected_item", "pull_level", "why_this_level_now"),
        ),
        ContractDefinition(
            id="prepare_contract",
            applies_at="prepare",
            rules=(
                "read relevant story, project, code, tests, decisions, and local guide context",
                "identify story shape, risks, applicable rules, and local guide overrides",
                "decide whether expand or collapse is needed before Plan",
                "identify whether the active item is implementable by default or requires a granularity decision",
                "do not create a Plan or start implementation during Prepare",
            ),
            required_outputs=(
                "context_summary",
                "story_shape_assessment",
                "risk_summary",
                "applicable_rules",
            ),
        ),
        ContractDefinition(
            id="expand_contract",
            applies_at="expand",
            rules=(
                "expand Delivery Stories into User Stories and Technical Stories when they are not implementable as one coherent unit",
                "Delivery Stories always expand before implementation and are never planned as the implementable unit",
                "materialize child User Story and Technical Story packages during expansion",
            ),
            required_outputs=("granularity_decision", "child_story_candidates"),
        ),
        ContractDefinition(
            id="plan_contract",
            applies_at="plan",
            rules=(
                "plan only implementable User Stories or Technical Stories",
                "define scope, non-goals, acceptance behavior, validation route, documentation impact, and implementation contract",
                "express User Story acceptance behavior with Given/When/Then/And when practical",
                "decide whether E2E validation is required for user-visible flows or cross-system behavior",
                "block implementation until Navigator approves the Plan checkpoint",
            ),
            stop_conditions=("navigator_approval_required",),
            required_outputs=(
                "scope",
                "non_goals",
                "acceptance_behavior",
                "validation_route",
                "implementation_contract",
            ),
        ),
        ContractDefinition(
            id="implement_contract",
            applies_at="implement",
            rules=(
                "follow the approved Plan",
                "use TDD or characterization tests for behavior changes when testable",
                "keep changes scoped to the active story",
                "add or update E2E tests when required by the approved Plan",
                "do not silently absorb new scope into implementation",
            ),
            stop_conditions=(
                "scope_change_detected",
                "plan_rule_conflict",
                "failing_required_check_without_clear_fix",
                "navigator_decision_needed",
            ),
        ),
        ContractDefinition(
            id="validation_contract",
            applies_at="validation",
            rules=(
                "run automated checks required by the Plan and local guide",
                "run E2E tests required by the approved Plan or local guide",
                "provide Navigator validation route with expected observation, pass condition, and fail condition",
                "record validation evidence before Review",
            ),
            required_outputs=(
                "automated_evidence",
                "navigator_validation_route",
                "validation_evidence",
            ),
        ),
        ContractDefinition(
            id="debt_review_contract",
            applies_at="review",
            rules=(
                "name debt paid, debt introduced, and debt carried forward",
                "record revisit trigger for carried debt",
                "decide whether a durable debt ledger entry is required",
            ),
            required_outputs=("review_report", "debt_decision"),
        ),
        ContractDefinition(
            id="coherence_contract",
            applies_at="coherence",
            rules=(
                "verify Process, Project, and Product alignment",
                "surface differences between Ariad defaults and the local development guide",
                "verify docs, roadmap, worklog, decisions, and runtime state match actual behavior",
                "verify lifecycle contract compliance before Done",
            ),
            required_outputs=("coherence_result",),
        ),
        ContractDefinition(
            id="done_contract",
            applies_at="done",
            rules=(
                "close the story only after validation, review, and coherence are satisfied",
                "record history at coherent story boundaries unless local policy overrides",
                "update worklog for meaningful milestones",
                "recommend next pull, parent collapse, or release boundary when relevant",
            ),
            required_outputs=("closure_summary", "history_action", "next_recommendation"),
        ),
    ),
    policies={
        "history": {
            "commit": {
                "mode": "propose_and_wait",
                "granularity": "coherent_story",
                "message_style": "descriptive_why",
            },
            "worklog": {"mode": "meaningful_milestones"},
            "decision_records": {"mode": "when_architectural_or_process_decision_changes"},
        },
        "push": {
            "mode": "ask_before_push",
            "allowed_after": ["story_done", "release_publish", "manual_request"],
            "requires": [
                "clean_worktree",
                "commits_present",
                "remote_configured",
                "navigator_confirmation",
            ],
        },
        "release": {"modes": ["planned_release", "emergent_release"]},
    },
    templates=_ARIAD_TEMPLATES,
    surfaces=(
        SurfaceDefinition(id="adoption_report", event="adoption"),
        SurfaceDefinition(id="builder_resume", event="on_builder_load"),
        SurfaceDefinition(id="roadmap_snapshot", event="roadmap_inspection"),
        SurfaceDefinition(id="pull_candidates", event="roadmap_inspection"),
        SurfaceDefinition(id="pull_report", event="pull"),
        SurfaceDefinition(id="prepare_report", event="prepare"),
        SurfaceDefinition(
            id="plan_checkpoint",
            event="plan",
            stops_for="navigator_approval",
        ),
        SurfaceDefinition(
            id="validation_checkpoint",
            event="validation",
            stops_for="navigator_validation",
        ),
        SurfaceDefinition(
            id="debt_review_checkpoint",
            event="review",
            stops_for="navigator_debt_decision",
        ),
        SurfaceDefinition(id="coherence_checkpoint", event="coherence"),
        SurfaceDefinition(id="done_checkpoint", event="done"),
    ),
    surface_routes=(
        SurfaceRoute(
            trigger="show_roadmap",
            surfaces=("roadmap_snapshot", "pull_candidates"),
            intents=(
                "show roadmap",
                "inspect roadmap",
                "see pull candidates",
                "what can I pull now",
            ),
        ),
    ),
    open_questions={
        "maintenance_and_operational_updates": {
            "status": "open",
            "note": "Do not overdesign upfront. Model when real cases appear.",
        },
        "final_surface_content": {
            "status": "open",
            "note": "Use Ariad visual grammar during implementation.",
        },
        "final_dsl_file_format": {
            "status": "open",
            "note": "YAML is the exploration notation, not yet a committed parser format.",
        },
    },
)


def get_ariad_method() -> MethodDefinition:
    """Return the built-in Ariad Builder method definition."""
    return ARIAD_METHOD
