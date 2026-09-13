// CV22.DS7.US8 plateau 1 — the Ariad method definition, as data.
//
// Port of `src/memory/builder/ariad_method.py`: 663 lines with no logic in them.
// Nine lifecycle events, a taxonomy, three work-item levels, four cadence
// profiles, three checkpoints, nine contracts carrying ~60 rule strings, eleven
// surfaces, one surface route, nine templates, and the open questions.
//
// Porting data has no behavior to characterize. What it has is TRANSCRIPTION
// RISK, and the blast radius is real: `prepare-templates` writes these nine
// template bodies into the user's own repository, and `inspect-method ariad`
// renders a contract's rules as a COUNT (`rules: 7`), so a typo inside a rule
// string is invisible in every surface. The guard is therefore structural, not
// visual — `builder-method.golden.json` carries a complete field-by-field dump
// of the Python definition and the test asserts deep equality against it.
//
// Two naming rules, and the second one matters:
//
//   1. Structural fields are camelCase, the project convention for a ported
//      dataclass (`ExplorerStory` set it in US7) and the shape that stays after
//      DS10 deletes the Python original.
//   2. The keys INSIDE `policies`, `openQuestions`, and `stateSemantics` are
//      preserved exactly as authored — `message_style`, `allowed_after`,
//      `final_dsl_file_format`. They are not field names; they are content.
//      `_append_mapping_fields` prints them straight into the inspection
//      surface, so camelCasing them would rewrite the DSL and change bytes a
//      Navigator reads.
//
// Nothing here is a place to improve Ariad. A rule whose wording looks wrong is
// a CR against the method, not an edit in a port.

import type { MethodDefinition } from "./methodDefinition.ts";

export const ARIAD_METHOD: MethodDefinition = {
  id: "ariad",
  label: "Ariad",
  resolution: {
    layers: ["method_default", "project_config", "journey_config", "navigator_override"],
    conflictPolicy: "explicit_override",
    audit: true,
  },
  taxonomy: {
    stateVocabulary: ["Planned", "Active", "Blocked", "Validated", "Done", "Deferred", "Dropped"],
    levels: [
      {
        id: "cv",
        label: "Capability Value",
        contains: ["delivery_story"],
        allowedStates: ["Planned", "Active", "Blocked", "Done", "Deferred", "Dropped"],
        stateSemantics: {
          Done: "the project reached the value boundary named by this CV",
        },
      },
      {
        id: "delivery_story",
        label: "Delivery Story",
        contains: ["user_story", "technical_story"],
        allowedStates: ["Planned", "Active", "Blocked", "Validated", "Done", "Deferred", "Dropped"],
        stateSemantics: {
          Validated:
            "child stories passed their relevant validation, but delivery story closure may still be pending",
          Done: "child stories produced a coherent delivery outcome and the project history reflects that outcome",
        },
      },
      {
        id: "user_story",
        label: "User Story",
        contains: ["task"],
        allowedStates: ["Planned", "Active", "Blocked", "Validated", "Done", "Deferred", "Dropped"],
        stateSemantics: {
          Validated:
            "observable behavior or capability passed automated evidence and Navigator-facing validation",
          Done: "validated behavior is coherent, reviewed, recorded, and absorbed into its parent delivery arc",
        },
      },
      {
        id: "technical_story",
        label: "Technical Story",
        contains: ["task"],
        allowedStates: ["Planned", "Active", "Blocked", "Validated", "Done", "Deferred", "Dropped"],
        stateSemantics: {
          Validated:
            "internal capability passed automated or internal evidence sufficient for the delivery story",
          Done: "technical substrate is coherent, reviewed, recorded, and ready for its parent delivery arc",
        },
      },
      {
        id: "task",
        label: "Task",
        contains: [],
        allowedStates: ["Planned", "Active", "Blocked", "Done"],
        stateSemantics: {
          Done: "concrete local work is complete inside its parent story",
        },
      },
    ],
  },
  lifecycle: [
    {
      id: "pull",
      meaning: "escolhe o foco",
    },
    {
      id: "prepare",
      meaning: "lê o terreno",
    },
    {
      id: "expand",
      meaning: "desdobra granularidade",
    },
    {
      id: "plan",
      meaning: "firma o contrato",
    },
    {
      id: "implement",
      meaning: "muda o sistema",
    },
    {
      id: "validation",
      meaning: "prova comportamento",
    },
    {
      id: "review",
      meaning: "encara a dívida",
    },
    {
      id: "coherence",
      meaning: "integra os rastros",
    },
    {
      id: "done",
      meaning: "registra e fecha",
    },
  ],
  workItemLevels: [
    {
      id: "delivery_story",
      label: "Delivery Story",
      implementableByDefault: false,
      expandsTo: ["user_story", "technical_story"],
    },
    {
      id: "user_story",
      label: "User Story",
      implementableByDefault: true,
      expandsTo: [],
    },
    {
      id: "technical_story",
      label: "Technical Story",
      implementableByDefault: true,
      expandsTo: [],
    },
  ],
  cadenceProfiles: [
    {
      id: "stepwise",
      label: "Stepwise",
      stopPolicy: "stop_after_every_phase",
      active: true,
      planApprovalPolicy: "navigator_approval",
    },
    {
      id: "checkpoint",
      label: "Checkpoint",
      stopPolicy: "continue_until_next_method_checkpoint",
      active: true,
      planApprovalPolicy: "navigator_approval",
    },
    {
      id: "accelerated",
      label: "Accelerated",
      stopPolicy: "continue_through_story_plan_to_navigator_validation",
      active: true,
      planApprovalPolicy: "bounded_story_authority",
    },
    {
      id: "autonomous",
      label: "Autonomous",
      stopPolicy: "continue_until_hard_constraint_with_explicit_limits",
      active: true,
      planApprovalPolicy: "navigator_approval",
    },
  ],
  checkpoints: [
    {
      id: "after_plan",
      occursAfter: "plan",
      blocks: ["implement"],
      requiredArtifacts: ["plan"],
      requiredConfirmations: ["navigator_approval"],
    },
    {
      id: "navigator_validation",
      occursAfter: "validation",
      blocks: ["done"],
      requiredArtifacts: ["validation_route", "validation_evidence"],
      requiredConfirmations: ["navigator_validation"],
    },
    {
      id: "review_decision",
      occursAfter: "review",
      blocks: ["coherence"],
      requiredArtifacts: ["review_report"],
      requiredConfirmations: ["navigator_debt_decision"],
    },
  ],
  contracts: [
    {
      id: "pull_contract",
      appliesAt: "pull",
      rules: [
        "choose an explicit focus before delivery work begins",
        "classify the pulled work as delivery_story, user_story, technical_story, task, or maintenance",
        "do not start roadmap candidates automatically",
        "preserve Navigator choice as the commitment boundary",
      ],
      stopConditions: [],
      requiredOutputs: ["selected_item", "pull_level", "why_this_level_now"],
    },
    {
      id: "prepare_contract",
      appliesAt: "prepare",
      rules: [
        "read relevant story, project, code, tests, decisions, and local guide context",
        "identify story shape, risks, applicable rules, and local guide overrides",
        "decide whether expand or collapse is needed before Plan",
        "identify whether the active item is implementable by default or requires a granularity decision",
        "do not create a Plan or start implementation during Prepare",
      ],
      stopConditions: [],
      requiredOutputs: [
        "context_summary",
        "story_shape_assessment",
        "risk_summary",
        "applicable_rules",
      ],
    },
    {
      id: "expand_contract",
      appliesAt: "expand",
      rules: [
        "expand Delivery Stories into User Stories and Technical Stories when they are not implementable as one coherent unit",
        "Delivery Stories always expand before implementation and are never planned as the implementable unit",
        "materialize child User Story and Technical Story packages during expansion",
      ],
      stopConditions: [],
      requiredOutputs: ["granularity_decision", "child_story_candidates"],
    },
    {
      id: "plan_contract",
      appliesAt: "plan",
      rules: [
        "plan only implementable User Stories or Technical Stories",
        "define scope, non-goals, acceptance behavior, validation route, documentation impact, and implementation contract",
        "express User Story acceptance behavior with Given/When/Then/And when practical",
        "decide whether E2E validation is required for user-visible flows or cross-system behavior",
        "block implementation until Navigator approves the Plan checkpoint",
      ],
      stopConditions: ["navigator_approval_required"],
      requiredOutputs: [
        "scope",
        "non_goals",
        "acceptance_behavior",
        "validation_route",
        "implementation_contract",
      ],
    },
    {
      id: "implement_contract",
      appliesAt: "implement",
      rules: [
        "follow the approved Plan",
        "use TDD or characterization tests for behavior changes when testable",
        "keep changes scoped to the active story",
        "add or update E2E tests when required by the approved Plan",
        "do not silently absorb new scope into implementation",
      ],
      stopConditions: [
        "scope_change_detected",
        "plan_rule_conflict",
        "failing_required_check_without_clear_fix",
        "navigator_decision_needed",
      ],
      requiredOutputs: [],
    },
    {
      id: "validation_contract",
      appliesAt: "validation",
      rules: [
        "run automated checks required by the Plan and local guide",
        "run E2E tests required by the approved Plan or local guide",
        "provide Navigator validation route with expected observation, pass condition, and fail condition",
        "record validation evidence before Review",
      ],
      stopConditions: [],
      requiredOutputs: ["automated_evidence", "navigator_validation_route", "validation_evidence"],
    },
    {
      id: "debt_review_contract",
      appliesAt: "review",
      rules: [
        "name debt paid, debt introduced, and debt carried forward",
        "record revisit trigger for carried debt",
        "decide whether a durable debt ledger entry is required",
      ],
      stopConditions: [],
      requiredOutputs: ["review_report", "debt_decision"],
    },
    {
      id: "coherence_contract",
      appliesAt: "coherence",
      rules: [
        "verify Process, Project, and Product alignment",
        "surface differences between Ariad defaults and the local development guide",
        "verify docs, roadmap, worklog, decisions, and runtime state match actual behavior",
        "verify lifecycle contract compliance before Done",
      ],
      stopConditions: [],
      requiredOutputs: ["coherence_result"],
    },
    {
      id: "done_contract",
      appliesAt: "done",
      rules: [
        "close the story only after validation, review, and coherence are satisfied",
        "record history at coherent story boundaries unless local policy overrides",
        "update worklog for meaningful milestones",
        "recommend next pull, parent collapse, or release boundary when relevant",
      ],
      stopConditions: [],
      requiredOutputs: ["closure_summary", "history_action", "next_recommendation"],
    },
  ],
  policies: {
    history: {
      commit: {
        mode: "propose_and_wait",
        granularity: "coherent_story",
        message_style: "descriptive_why",
      },
      worklog: {
        mode: "meaningful_milestones",
      },
      decision_records: {
        mode: "when_architectural_or_process_decision_changes",
      },
    },
    push: {
      mode: "ask_before_push",
      allowed_after: ["story_done", "release_publish", "manual_request"],
      requires: [
        "clean_worktree",
        "commits_present",
        "remote_configured",
        "navigator_confirmation",
      ],
    },
    release: {
      modes: ["planned_release", "emergent_release"],
    },
  },
  surfaces: [
    {
      id: "adoption_report",
      event: "adoption",
      transport: "verbatim",
      markerProtocol: "ariad_compact",
      interpretationPolicy: "after_block_only",
    },
    {
      id: "builder_resume",
      event: "on_builder_load",
      transport: "verbatim",
      markerProtocol: "ariad_compact",
      interpretationPolicy: "after_block_only",
    },
    {
      id: "roadmap_snapshot",
      event: "roadmap_inspection",
      transport: "verbatim",
      markerProtocol: "ariad_compact",
      interpretationPolicy: "after_block_only",
    },
    {
      id: "pull_candidates",
      event: "roadmap_inspection",
      transport: "verbatim",
      markerProtocol: "ariad_compact",
      interpretationPolicy: "after_block_only",
    },
    {
      id: "pull_report",
      event: "pull",
      transport: "verbatim",
      markerProtocol: "ariad_compact",
      interpretationPolicy: "after_block_only",
    },
    {
      id: "prepare_report",
      event: "prepare",
      transport: "verbatim",
      markerProtocol: "ariad_compact",
      interpretationPolicy: "after_block_only",
    },
    {
      id: "plan_checkpoint",
      event: "plan",
      stopsFor: "navigator_approval",
      transport: "verbatim",
      markerProtocol: "ariad_compact",
      interpretationPolicy: "after_block_only",
    },
    {
      id: "validation_checkpoint",
      event: "validation",
      stopsFor: "navigator_validation",
      transport: "verbatim",
      markerProtocol: "ariad_compact",
      interpretationPolicy: "after_block_only",
    },
    {
      id: "debt_review_checkpoint",
      event: "review",
      stopsFor: "navigator_debt_decision",
      transport: "verbatim",
      markerProtocol: "ariad_compact",
      interpretationPolicy: "after_block_only",
    },
    {
      id: "coherence_checkpoint",
      event: "coherence",
      transport: "verbatim",
      markerProtocol: "ariad_compact",
      interpretationPolicy: "after_block_only",
    },
    {
      id: "done_checkpoint",
      event: "done",
      transport: "verbatim",
      markerProtocol: "ariad_compact",
      interpretationPolicy: "after_block_only",
    },
  ],
  surfaceRoutes: [
    {
      trigger: "show_roadmap",
      surfaces: ["roadmap_snapshot", "pull_candidates"],
      intents: ["show roadmap", "inspect roadmap", "see pull candidates", "what can I pull now"],
    },
  ],
  templates: [
    {
      id: "ariad_adoption",
      path: "docs/project/roadmap/ariad-adoption.md",
      content:
        "# Ariad Adoption\n\nThis project is prepared for Ariad-governed Builder Mode.\n\n## Method\n\n- adopted method: ariad\n- adoption prepares documentation templates only\n- delivery cursor sync is handled by a later Builder story\n\n## Boundaries\n\nTemplate preparation does not execute story lifecycle work, change story status,\ncommit, push, or release.\n",
      description: "Records Ariad adoption readiness for this project.",
    },
    {
      id: "technical_debt_ledger",
      path: "docs/project/roadmap/technical-debt-ledger.md",
      content:
        "# Technical Debt Ledger\n\nAriad Review records technical debt here when debt should be paid now or deferred.\n\n| ID | Source Story | Location | Kind | Description | Impact | Recommendation | Navigator Decision | Status |\n|----|--------------|----------|------|-------------|--------|----------------|--------------------|--------|\n\n## Deferred Debt Requirements\n\nWhen debt is deferred, record the defer reason and revisit trigger.\n",
      description: "Versioned debt ledger used by Ariad Review and Refactor.",
    },
    {
      id: "delivery_story_index",
      path: "docs/project/roadmap/templates/delivery-story-index.md",
      content:
        "[< Parent](../index.md)\n\n# <CODE> — <Delivery Story Title>\n\n**Status:** 🟡 Planned\n\n---\n\n## Outcome\n\n<Coherent delivery outcome this story creates.>\n\n## Candidate Stories\n\n| Code | Story | Type | Outcome | Status |\n|------|-------|------|---------|--------|\n\n## Done Condition\n\n<Condition that closes this delivery story.>\n",
      description: "Template for an Ariad Delivery Story index.",
    },
    {
      id: "user_story_index",
      path: "docs/project/roadmap/templates/user-story-index.md",
      content:
        "[< Parent](../index.md)\n\n# <CODE> — <User Story Title>\n\n**Status:** 🟡 Planned\n**Type:** User Story\n\n---\n\n## User Story\n\nAs a [user persona],\nI want to [action/feature],\nSo that [benefit/value].\n\n## Outcome\n\n<Navigator-visible behavior or capability.>\n\n## Acceptance Behavior\n\n```text\nGiven <context>\nWhen <action>\nThen <observable result>\n```\n\n## Scope\n\n- <in scope>\n\n## Out Of Scope\n\n- <out of scope>\n\n## Validation\n\n<Navigator-facing validation route.>\n",
      description: "Template for an Ariad User Story index.",
    },
    {
      id: "technical_story_index",
      path: "docs/project/roadmap/templates/technical-story-index.md",
      content:
        "[< Parent](../index.md)\n\n# <CODE> — <Technical Story Title>\n\n**Status:** 🟡 Planned\n**Type:** Technical Story\n\n---\n\n## Technical Story\n\nIn order to [achieve a technical benefit/business capability],\nAs [an engineering team/system component],\nI want to [perform a technical action],\nSo that [expected technical outcome].\n\n## Outcome\n\n<Internal capability or substrate.>\n\n## Acceptance Behavior\n\n```text\nGiven <technical context>\nWhen <operation runs>\nThen <internal behavior or invariant holds>\n```\n\n## Scope\n\n- <in scope>\n\n## Out Of Scope\n\n- <out of scope>\n\n## Validation\n\n<Automated or internal validation route.>\n",
      description: "Template for an Ariad Technical Story index.",
    },
    {
      id: "plan",
      path: "docs/project/roadmap/templates/plan.md",
      content:
        "[< Story](index.md)\n\n# Plan — <CODE> <Title>\n\n## Pull\n\n<Pulled item and why this level now.>\n\n## Prepare\n\n<Context summary, story shape, risks, and applicable rules.>\n\n## Scope\n\n- <in scope>\n\n## Non-Goals\n\n- <out of scope>\n\n## Implementation Approach\n\n<How implementation will proceed.>\n\n## Test Strategy\n\n<Automated and manual tests.>\n\n## Validation Route\n\n<How the Navigator validates observable behavior, when applicable.>\n\n## Checkpoint\n\nImplementation must not start until the Navigator approves this plan.\n",
      description: "Template for the Ariad Plan checkpoint artifact.",
    },
    {
      id: "test_guide",
      path: "docs/project/roadmap/templates/test-guide.md",
      content:
        "[< Story](index.md)\n\n# Test Guide — <CODE> <Title>\n\n## Automated Validation\n\n```bash\n<commands>\n```\n\n## Navigator Validation\n\n<Manual validation route, expected observation, pass condition, and fail condition.>\n\n## Validation Evidence\n\n<Recorded evidence after validation runs.>\n",
      description: "Template for Ariad validation evidence and Navigator validation.",
    },
    {
      id: "review",
      path: "docs/project/roadmap/templates/review.md",
      content:
        "[< Story](index.md)\n\n# Review — <CODE> <Title>\n\n## Changed Surface\n\n<Files, modules, docs, and behaviors changed.>\n\n## Debt Scan\n\n<Design, test, documentation, duplication, complexity, naming, coupling, or migration debt.>\n\n## Recommendation\n\n<No action, defer, or pay now.>\n\n## Navigator Decision\n\n<Decision and rationale.>\n",
      description: "Template for Ariad Review debt scan.",
    },
    {
      id: "coherence",
      path: "docs/project/roadmap/templates/coherence.md",
      content:
        "[< Story](index.md)\n\n# Coherence — <CODE> <Title>\n\n## Process\n\n<Lifecycle and checkpoint alignment.>\n\n## Project\n\n<Roadmap, docs, and runtime state alignment.>\n\n## Product\n\n<Behavior and product boundary alignment.>\n\n## Result\n\n<Coherent or incoherent, with next action.>\n",
      description: "Template for Ariad Coherence integration check.",
    },
  ],
  openQuestions: {
    maintenance_and_operational_updates: {
      status: "open",
      note: "Do not overdesign upfront. Model when real cases appear.",
    },
    final_surface_content: {
      status: "open",
      note: "Use Ariad visual grammar during implementation.",
    },
    final_dsl_file_format: {
      status: "open",
      note: "YAML is the exploration notation, not yet a committed parser format.",
    },
  },
};

/** Python `get_ariad_method()`. */
export function getAriadMethod(): MethodDefinition {
  return ARIAD_METHOD;
}
