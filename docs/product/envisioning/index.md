[< Product](../index.md)

> **Status: Exploratory synthesis.** This document captures a product
> architecture direction that emerged from an active session. It contains
> open design questions and is not a stable spec. Design questions graduate
> to specs when their CV begins planning.

# Product Envisioning

This area captures exploratory product architecture before it becomes stable
specification or roadmap work.

Current explorations:

- [Mirror Web Perspectives](web-perspectives.md) captures the Atlas and
  Workspace perspective model for the Mirror Mind 1.0 web visibility surface.
- [Agentic Web Console](agentic-web-console.md) explores a future browser-based
  operations surface where a headless agent proposes or performs controlled
  Mirror updates with approval and auditability.

## Coherence as Product Architecture

This document captures the current product architecture synthesis for the
coherence capability that emerged from the Maestro journey.

The central correction is that Maestro is not a separate runtime competing with
Builder. Maestro is the public product frame for a doing-first experience, while
Mirror remains the underlying architecture that makes the experience deep over
time.

## Product framing

Maestro should attract through doing. Mirror should reveal itself through use.

The first promise to the software audience is not personal identity work. The
first promise is an AI operating environment for software work: project context,
agentic execution, coherence across artifacts, and opinionated lenses such as XP,
DDD, or Kanban. The deeper Mirror capabilities remain present, but they are not
the front door. Memory, journeys, personas, identity, and inner sensemaking are
discovered as the user works.

This gives the product hierarchy:

```text
Maestro
  public product frame, doing-first positioning

Mirror Core
  underlying architecture: identity, memory, journeys, personas, attachments,
  coherence, and long-term continuity
```

In this frame, Maestro is not an alternative to Mirror. Maestro is Mirror
presented through the software-development door.

## Architecture framing

The technical architecture should not introduce a redundant Maestro mode or
Maestro skill that overlaps Builder. The cleaner separation is:

```text
Mirror
  owns identity, memory, journeys, personas, attachments, project paths, and
  runtime continuity

Builder
  executes project work

Coherence skill
  detects and manages Units of Coherence for journeys and projects

Lenses
  provide preconfigured opinion layers and rules

Maestro
  productized Builder experience configured with coherence and software lenses
```

The resulting formula is:

```text
Maestro = Builder + active software lenses + coherence protocol + Mirror Core
```

Builder remains the actor. Coherence is the governor. Lenses are the opinion.
Mirror remembers. Maestro is the productized configuration that packages the
whole experience for a software audience.

## Unit of Coherence

A Unit of Coherence, abbreviated UoC, is the smallest explicit relation between
what is true now and what an active lens says should be true.

A UoC carries:

```text
semantic id
stable meaning independent from language

observed state
what is true now

expected state
what the active lens says should be true

gap
what is missing, stale, contradictory, or unresolved

status
open, resolved, deferred, or accepted

severity
blocking, important, or optional

evidence
facts used to support the observed state

suggested action
how the gap could be resolved, deferred, or accepted
```

A gap is not automatically an error. A gap is a request for judgment. The system
must not pretend that the lens is universal truth. It should make provenance
visible: this gap exists because the active lens expects something that reality
does not currently express.

## Coherence skill responsibility

The coherence skill is generic. It should work across journeys and project
contexts, not only inside Maestro.

Its responsibilities are:

```text
load active lens configuration
inspect the observed project or journey state
evaluate UoCs
write or update the coherence index
surface blocking gaps before execution
ask the user to resolve, defer, or accept open gaps
verify whether a resolution actually closed the gap
```

The skill should not become a second Builder. It should use Builder or the
runtime tools only to resolve specific UoCs. Its verbs should stay close to
coherence:

```text
check coherence
show open UoCs
resolve UoC
defer UoC
accept UoC
review drift
```

Builder verbs such as implement, refactor, create app, or change code remain
Builder responsibilities unless they are explicitly framed as a UoC resolution.

## Lenses

A lens is an opinion layer that defines what coherence means in a context. The
coherence engine stays generic; lenses provide domain-specific expectations.

Examples:

```text
XP Lens
  rules, project/process/product schema, story lifecycle, docs expectations,
  TDD and refactoring expectations

DDD Lens
  domain language, bounded contexts, model/code alignment, decision records

Kanban Lens
  flow states, WIP limits, blocked work, service classes, policies
```

A lens should not be treated as a rigid structure imposed on every project. A
lens changes how the system sees. It reveals gaps that would otherwise stay
invisible. Lenses should be composable and replaceable, while UoC semantic ids
remain stable enough for automation and documentation.

## Project, process, and product

Coherence connects the triad of product, process, and project.

```text
Product
  intent, user value, roadmap, stories, acceptance criteria, evidence

Process
  movement, phases, agreements, workflow, readiness, done criteria

Project
  embodiment, repository, code, tests, docs, architecture, implementation log
```

The coherence skill watches the crossings. For example, if a story is marked
ready in the process plane, the product plane should express acceptance criteria
and the project plane should have the expected implementation plan. If code
changes in the project plane, product and process artifacts may become stale.

Coherence is the living alignment between intent, movement, and embodiment.

## Natural Builder lifecycle

Coherence should not be a command the user must remember. The natural user
experience is still Builder:

```text
Activate Builder Mode for journey X.
```

When a journey has coherence enabled, Builder should automatically enter with
coherence awareness:

```text
Builder activation
  load journey context
  resolve project_path
  load active lenses
  run coherence preflight
  write or refresh docs/coherence/index.md
  inject the coherence summary into the Builder briefing

During work
  keep blocking UoCs visible
  resolve, defer, or accept gaps through normal Builder actions

After meaningful changes
  run coherence postflight
  report new, resolved, or changed gaps
```

This keeps the experience organic. Builder executes. Coherence governs. The user
should not have to switch folders or invoke a separate coherence mode to benefit
from the engine.

## Internationalization and audience modes

Coherence exposed two product surfaces that are broader than coherence itself:
localization and audience mode.

Coherence must be designed to support both, but it should not own either as a
feature. They are Mirror-wide capabilities.

Semantic ids should be stable and language-independent:

```text
project.working_name
project.git_repository
story.plan_doc
story.e2e_test
```

Localization changes language, not semantics:

```text
locale: en-US | pt-BR
```

Audience mode changes explanation strategy, not truth:

```text
mode: technical | non-technical
```

The same UoC can therefore be shown in different ways. A technical user may see
concise instructions such as "Run git init". A non-technical software user may
see the same gap explained in terms of version history, traceability, and the
ability to undo changes. The coherence expectation remains the same.

The principle is one coherence graph, multiple human surfaces.

## Current POC direction

The TypeScript POC in the Maestro project validates the smallest coherence loop:

```text
observed state
  a project has no name

expected state
  every project needs a provisional working name

gap
  missing project name

resolution
  write maestro.yml, README.md, and the coherence index

next gap
  the project is not yet tracked in git
```

The POC also validates `maestro configure`, which sets locale and audience mode
before entering Pi:

```bash
maestro configure --locale pt-BR --mode non-technical
```

This is a useful prototype, but the long-term direction is to move the generic
coherence capability into Mirror as a skill and let Maestro become the branded
software-development configuration that uses it.

## Open design questions

- Where should generic coherence code live inside Mirror?
- How should lenses be stored, versioned, and selected per journey?
- Should UoCs be persisted only in docs, or also in the memory database?
- How should the coherence skill interact with Builder without becoming Builder?
- How should accepted and deferred gaps be represented over time?
- How should lens updates affect existing projects with older UoCs?
