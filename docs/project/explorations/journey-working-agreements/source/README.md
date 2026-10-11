# Journey Context Contract

Status: product and implementation handoff, ready for an independent development session  
Target product: Mirror Mind  
Prepared: 2026-08-16  
Baseline reviewed: Mirror Mind `0.31.9`, commit `62f372531ec791895ccef0af6e9363a0beb5e2f1`, branch `main`

## Purpose

This package specifies a general Mirror Mind capability through which a journey can remember not only what it is, but how work should happen inside it.

A Journey Context Contract declares:

- task profiles that can be selected from ordinary user language;
- the persona or lens appropriate for each profile;
- the operating modes in which a profile is valid;
- context sources that must or may be loaded;
- a default profile when no more specific profile matches;
- the rules by which explicit choices, mode boundaries, task intent, journey policy, and session continuity interact.

The feature separates two operations that must never be conflated:

- contract resolution, which may happen automatically on every relevant turn;
- contract learning, which may formulate a proposal automatically but must never persist it without user confirmation.

The feature is broader than authoring. It can coordinate software projects, research, financial journeys, courses, launches, personal practices, and extension-backed workflows.

## Reading order

1. [Product specification](01-product-specification.md)
2. [User experience and conversational learning](02-user-experience.md)
3. [Contract model and persistence](03-contract-model.md)
4. [Runtime resolution and context assembly](04-runtime-resolution.md)
5. [Safety, privacy, and failure behavior](05-safety-and-trust.md)
6. [Implementation plan](06-implementation-plan.md)
7. [Verification and evaluation guide](07-verification-guide.md)
8. [Independent Builder handoff](08-builder-handoff.md)
9. [Local prototype and migration notes](09-local-prototype.md)

## Product statement

Mirror Mind currently carries a journey's identity, memories, conversations, project path, and attachments. The Journey Context Contract adds the journey's agreed way of working. The user can speak naturally, while the Mirror selects the appropriate profile and loads only the context needed for the current task.

The desired user experience is:

> User: Rewrite this passage.
>
> Mirror: Uses the active journey's authoring profile, selected persona, voice guide, and editorial rubric.

A change of task must remain possible:

> User: Diagnose the chapter, but do not rewrite it.
>
> Mirror: Selects the editorial diagnosis profile rather than the authoring profile.

A durable preference must be learned through confirmation:

> User: From now on, editorial diagnosis should include alternatives but never apply them automatically.
>
> Mirror: Proposes a contract change, shows its scope, and asks whether to save it for the journey.

## Core invariants

- The database remains the runtime source of truth.
- Runtime adapters remain thin.
- The Python core owns behavior until authority for the relevant command transfers to the TypeScript core.
- The same contract decision must be consumable by Pi, Claude Code, Gemini CLI, and Codex.
- Explicit user selection wins.
- Operating mode boundaries cannot be weakened by a journey contract.
- A contract profile from one journey cannot leak into another journey.
- Required context fails closed and explains what is missing.
- Optional context may degrade with a visible warning.
- User and model content is data, not executable instruction.
- Automatic understanding is allowed. Silent durable mutation is not.
- Every routing decision is explainable.

## Non-goals

This feature does not create separate agents, replace personas, replace journeys, invent a universal ontology of task intents, or move workflow logic into runtime-specific instruction files. It does not let journey policy override safety constraints, Soul Mode ritual boundaries, Explorer's no-implementation boundary, Builder hard gates, or explicit user choice.

## Delivery posture

This package does not authorize implementation, roadmap mutation, commit, push, release, or production database migration. The next session must inspect current project state, place the work through the project's Ariad process, create or select the appropriate Delivery or Refinement item, write a plan, and obtain Navigator approval before implementation.
