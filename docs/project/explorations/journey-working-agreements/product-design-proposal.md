[< Exploration index](index.md)

# Product Design Proposal: Journey Working Agreements

## Product Intent

Let a journey remember its agreed way of working. A journey-owned, versioned contract
contains named working profiles. Each profile describes a class of work in ordinary
language and identifies the persona or ego lens, compatible modes, required and optional
references, and bounded journey-owned guidance appropriate to that work.

The user should experience continuity, not configuration.

## Core Experience

```text
User: Rewrite this passage.
Mirror: Selects the active journey's authoring profile, writer persona, voice guide,
and editorial rubric.
```

A task shift remains natural:

```text
User: Diagnose the chapter, but do not rewrite it.
Mirror: Selects editorial diagnosis rather than authoring and loads only its references.
```

Durable teaching is visible and confirmed:

```text
User: From now on, diagnosis should include alternatives but never apply them.
Mirror: Shows a journey-scoped proposal and asks whether to confirm, edit, or reject it.
```

## User Outcomes

The user can:

- teach a journey how collaboration should work without editing configuration files;
- use short natural requests after journey activation;
- switch task profiles inside one journey;
- preserve project-specific voice, method, architecture, or evidence policy;
- override a profile or persona for one turn without changing the contract;
- inspect why a profile, persona, or reference was selected;
- confirm, edit, reject, disable, or restore working agreements; and
- move between journeys without profile, persona, or reference leakage.

## Product Vocabulary

| User-facing language | Technical language |
|---|---|
| How we work in this journey | Journey Context Contract |
| Working profile | Context profile |
| Usual profile | Default profile |
| Required/optional references | Context sources |
| Proposed change | Contract proposal |
| Why this was selected | Context resolution explanation |

## Resolution Experience

When a journey is activated, Mirror loads only compact contract definitions. On each
relevant turn it:

1. resolves explicit journey, profile, persona, and mode constraints;
2. selects a profile deterministically when possible;
3. uses bounded reception classification when deterministic evidence is insufficient;
4. asks a short clarification rather than hiding genuine ambiguity;
5. validates the selected profile against the journey, revision, mode, and persona;
6. loads only that profile's references; and
7. returns an inspectable resolution alongside the assembled context.

The profile is data, not executable code. Unknown or malformed model output never
creates a rule or grants authority.

## Learning Experience

Transient instructions affect one turn. Durable language may create a pending proposal.
No model call activates its own proposal. Confirmation is valid only from an attributable
user turn with one unambiguous pending proposal in the same session and journey.

Revisions are append-only. Restoring older content creates a new revision rather than
rewriting history.

## Context Behavior

The initial source type should be safe, journey-relative project files. Required sources
fail closed with an actionable explanation. Optional sources continue with a visible
degradation warning. Every loaded section carries provenance and framing that keeps
system, safety, mode, and permission constraints above journey-owned guidance.

Context should be budgeted by model impact, not only filesystem bytes. Heavy content is
loaded lazily after profile selection.

## Mode Boundary

The first release should focus on Mirror Mode. Future Builder or Explorer coordination
requires separate product review. Soul Mode persona selection remains excluded unless a
future safety review explicitly admits it.

No contract can authorize implementation, commit, push, release, deployment, purchase,
publication, filesystem mutation, or another hard-gated operation.

## General Domains

- **Long-form work:** authoring, diagnosis, research, verification, adaptation.
- **Software:** discovery, architecture, implementation, QA, security, release.
- **Research:** exploration, collection, synthesis, adversarial review, final writing.
- **Teaching:** curriculum, lesson preparation, facilitation, assessment, communication.
- **Financial journeys:** planning, review, risk analysis, reflective decision support.
- **Extensions:** typed extension capabilities already bound to a journey, under their
  own trust policies.

## First Public Completion Signal

A non-technical user can teach a durable journey rule through natural language, confirm
it, later use a short request, receive the correct persona and references, inspect why,
switch journeys without contamination, and obtain equivalent core behavior across the
supported runtime surfaces.

## Conscious Exclusions

- Automatic repeated-pattern activation.
- Cross-journey or organization-level inheritance.
- Multiple simultaneously active profiles.
- Remote URLs or arbitrary executable providers.
- Automatic project-file editing.
- Contract-defined operational permission.
- Web management in the first conversational release.
- A Python-first implementation created only to be ported again.
