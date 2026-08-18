# Product Specification

## Problem

A journey currently gives Mirror Mind continuity of subject, history, and project association. It does not declare the agreed method of work inside that journey.

Persona and journey routing are resolved independently. The current Mirror Mode priority is explicit arguments, reception classification, sticky session or global defaults, and keyword or embedding fallback. Project documentation is loaded by skills, runtime instructions, extension providers, or manual agent behavior. A journey can point to a `project_path`, but it cannot state which project resources govern a particular class of work.

This creates predictable failures:

- a short contextual request such as "continue" or "rewrite this" may select the wrong persona;
- a persona from another journey may remain sticky after the journey changes;
- the correct persona may be loaded without the journey's voice, architecture, policy, or rubric;
- a diagnostic request may be confused with an authorial request because both concern the same manuscript or project;
- users must repeatedly state instructions the journey should already know;
- runtime-specific instruction files become the accidental home of personal routing policy;
- the user cannot easily ask why a routing decision occurred.

## Capability

A Journey Context Contract is a journey-owned, versioned policy containing named task profiles. A profile describes a class of work in ordinary language and declares the lens and context needed for it.

The contract is compactly available when the journey is activated. On each relevant turn, the resolver selects a profile from the user request and operating mode. Only the selected profile's context is assembled.

## User outcomes

The user can:

- teach a journey how collaboration should work without editing configuration files;
- use short natural requests after a journey is active;
- move from authoring to diagnosis, or from strategy to implementation, without leaving the journey;
- preserve a project-specific voice or method without making it globally active;
- understand which profile, persona, and sources governed a response;
- override the normal route for one turn;
- confirm, edit, or reject proposed durable rules;
- inspect and revise the journey's working agreement later.

## General use cases

### Book or long-form work

Profiles can separate authoring, editorial diagnosis, research, source verification, and blog adaptation. Each profile can use a different persona and context set.

### Software delivery

Profiles can separate product discovery, architecture, implementation, quality assurance, security review, and release work. Builder Mode boundaries remain authoritative even if the contract names a software persona.

### Research

Profiles can separate broad exploration, source collection, synthesis, adversarial review, and final writing. Required context can include the research question, source policy, and evidence ledger.

### Financial journey

Profiles can separate planning, transaction review, risk analysis, and reflective decision support. The contract cannot grant permission for external financial actions.

### Course or teaching journey

Profiles can separate curriculum design, lesson preparation, facilitation, learner assessment, and public communication.

### Extension-backed journey

A profile can request context from an installed extension capability already bound to the journey, while the extension remains responsible for its own domain data.

## Product language

User-facing language should prefer:

- "How we work in this journey" for the contract;
- "working profile" for a task profile;
- "usual profile" for the default profile;
- "required references" and "optional references" for context sources;
- "proposed change" for an unconfirmed learning;
- "why this was selected" for resolution explanation.

Developer-facing language may use `JourneyContextContract`, `ContextProfile`, `ContextSource`, `ContractProposal`, and `ContextResolution`.

## Activation lifecycle

When a journey becomes active, Mirror loads the active contract's compact definition: revision, profiles, descriptions, mode scopes, persona references, and context source descriptors. It does not immediately load all referenced content.

For each user request:

1. Resolve explicit journey, persona, profile, and operating mode constraints.
2. Classify the request against profiles available in the resolved journey.
3. Select one profile or no profile.
4. Validate that the selected profile is compatible with the mode.
5. Assemble only the selected profile's required and optional context.
6. Compose identity, journey, attachments, memories, extensions, and contract context.
7. Return an explainable resolution alongside the assembled context.

When a journey changes, profile continuity from the previous journey is invalidated.

## Established product decisions

These decisions emerged from the exploration and should be treated as the product baseline unless the Navigator explicitly reopens them:

- The feature is a general journey capability, not a special case for writing.
- The unit is a contract containing profiles, not only `default_persona`.
- The contract is loaded compactly at journey activation.
- Heavy context is loaded lazily per selected profile.
- Ordinary requests may be translated automatically into profile selection.
- Ordinary requests do not silently modify the contract.
- Durable learning is proposed, previewed, and confirmed.
- The user should not need to edit a file.
- The active database is the runtime source of truth.
- A project file may be offered later as import, export, or versioned projection, but is not the runtime authority in the initial feature.

## Acceptance behavior

The feature is acceptable when all of these examples work:

- A known journey with an authoring profile routes "rewrite this passage" to that profile without requiring the title in the prompt.
- "Diagnose this chapter without rewriting" selects a more specific diagnosis profile in the same journey.
- A journey switch prevents reuse of the previous journey's profile and persona.
- An explicit persona or profile selection overrides the usual journey route for that turn.
- A required missing file blocks the response with an actionable explanation.
- An optional missing file permits the response and reports degraded context.
- "Use a direct tone this time" affects the turn but does not create a contract proposal.
- "From now on, use a direct tone in this journey" creates a proposal but does not persist it.
- Confirming a proposal creates a new active contract revision and preserves the previous revision.
- Rejecting a proposal leaves the active contract unchanged.
- `context explain` reports journey, revision, selected profile, persona, source provenance, warnings, and precedence reason.
- The same core resolution is available to all four runtimes without copying policy into runtime instructions.

## Conscious exclusions for the first release

- Automatic application of repeated patterns without confirmation.
- Cross-journey inheritance of contracts.
- Organization-level contracts.
- Remote or URL context sources.
- Arbitrary executable context providers declared by contract data.
- Automatic editing of project files.
- Multiple simultaneously active profiles in one turn, unless a later design proves composition is necessary.
- Contract-defined permission to push, release, purchase, publish, deploy, or perform another hard-gated action.
