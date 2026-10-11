# Independent Builder Handoff

## Mission

Turn the Journey Context Contract product specification into approved Mirror Mind delivery work and implement it in small, independently verifiable slices.

This handoff is intentionally self-contained. The development session should not require access to the conversation that produced it.

## Starting state captured by this package

Baseline inspected:

```text
Repository: /Users/alissonvale/Code/mirror-dev
Version: 0.31.9
Commit: 62f372531ec791895ccef0af6e9363a0beb5e2f1
Branch: main
Captured: 2026-08-16
```

The live checkout may have advanced. Treat the repository, roadmap, and database migrations at session start as authoritative.

Current relevant behavior at the captured baseline:

- Mirror Mode routing lives primarily in `src/memory/skills/mirror.py::_resolve_defaults()`.
- Routing precedence is explicit arguments, reception, sticky state, then keyword or embedding fallback.
- Persona keyword detection lives in `IdentityService.detect_persona()`.
- Reception is one model call returning persona, journey, identity touch, and shadow touch.
- Journey metadata supports project path, sync file, icon, color, and parent journey.
- `IdentityService.load_mirror_context()` composes identity, journey, attachments, and extension context.
- Builder currently loads persona `engineer` explicitly.
- Explorer loads journey context without persona selection.
- Runtime adapters call the Python CLI and must remain thin.
- SQLite is shared with an emerging TypeScript core, so schema work is cross-core work.

## Mandatory opening actions

1. Activate Builder Mode for `mirror-mind`.
2. Read this entire package.
3. Inspect the live roadmap, active Ariad item, refinement index, decisions, architecture, development guide, and engineering principles.
4. Confirm the current source paths and behavior listed above.
5. Inspect current migrations and TypeScript database assumptions.
6. Decide whether this belongs in Delivery or Refinement without absorbing it into unrelated active work.
7. Create or select the appropriate Ariad item.
8. Write the implementation plan and test guide for the first small slice.
9. Run plan review for non-trivial design.
10. Present the plan and stop for Navigator approval before code.

## Product decisions not to reopen casually

- The capability is general, not book-specific.
- The contract is journey-owned.
- The contract contains task profiles rather than only one default persona.
- Contract definitions load at journey activation; source content loads lazily.
- Natural language may select profiles automatically.
- Natural language may generate a proposal for durable learning.
- No durable contract mutation occurs without explicit confirmation.
- Required context is fail-closed and optional context degrades visibly.
- Runtime adapters do not own policy.
- Decisions are explainable.

A new finding may change these decisions, but the session must record why in the project decision log rather than silently drifting.

## Recommended first story

Start with the persistence foundation only:

> As a Mirror contributor, I can create and inspect a validated, revisioned Journey Context Contract without changing existing runtime routing, so later routing work has a safe source of truth.

Scope:

- domain models;
- schema migration;
- storage and service;
- create, show, history, validate, disable, and restore behavior;
- integration tests;
- migration and TS-open parity evidence;
- no reception prompt change;
- no runtime routing change;
- no project-file loading;
- no conversational learning;
- no web UI.

This slice establishes truth before behavior.

## Decisions still requiring Navigator confirmation

The package recommends but does not claim final approval for:

- dedicated revision tables versus journey identity metadata;
- exact contract JSON shape;
- whether v1 ships only `project_file` sources;
- maximum profile and context budgets;
- whether session contract state remains in `runtime_sessions.metadata`;
- whether contract profile classification extends the existing reception call or uses another mechanism;
- whether first release supports Mirror Mode only;
- whether a web editing surface is part of the initial capability or follows CLI and conversational flows;
- migration behavior for local experimental metadata.

The first plan should make these choices explicit and ask for approval.

## Architecture review questions

- Does a dedicated `ContextContractService` preserve cohesion better than expanding `JourneyService`?
- Can the model classify profiles without adding a second call per turn?
- How is a profile bound to a journey so sticky state cannot cross journeys?
- How does no-contract behavior remain byte-for-byte or behaviorally compatible?
- Which core owns writes at the current Python to TypeScript strangler boundary?
- Can required project files be loaded without making `IdentityService` a filesystem service?
- How will hooks report contract failure without breaking host runtimes?
- Which decision is deterministic and which depends on the model?
- What explanation survives model variance?

## Scope traps

Avoid these attractive but harmful expansions:

- universal task-intent taxonomy;
- arbitrary URI or executable context sources;
- organization-level inheritance;
- automatic repeated-pattern learning in the first release;
- web UI before persistence and resolver contracts stabilize;
- runtime-specific implementations;
- hard-coded persona names in core logic;
- loading every profile's documents at activation;
- direct model writes;
- unrelated descriptor lifecycle refactoring;
- absorbing Builder or Ariad permission policy into journey contracts.

## Completion signal

The feature is complete only when a non-technical user can teach a journey a durable working rule through natural language, confirm it, use a short ordinary request later, receive the correct persona and context, inspect why it happened, switch journeys without contamination, and obtain equivalent core behavior across supported runtimes.

A partial release may deliberately stop earlier, but it must name which part of that end-to-end promise is not yet available.
