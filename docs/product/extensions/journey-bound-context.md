# Journey-Bound Extension Context

This document explains the generic flow that lets a Mirror journey load context
from an installed extension. It is not specific to any one extension: the same
mechanism can power project coherence, launch metrics, editorial calendars, or
any other journey-scoped capability.

## Two independent links

Journey-bound extension context depends on two separate pieces of configuration.
They answer different questions and live in different tables.

### 1. Journey project path

A journey may point at a project folder through `identity.metadata.project_path`.
This link answers:

> When this journey is active, which project directory represents the work?

Set it with:

```bash
python -m memory journey set-path <journey_id> /path/to/project
```

Conceptually, this stores:

```text
identity.layer = journey
identity.key = <journey_id>
identity.metadata.project_path = /path/to/project
```

### 2. Extension capability binding

An extension capability may be bound to a journey through `_ext_bindings`.
This link answers:

> When this journey is active in Mirror Mode, which extension context provider
> should run automatically?

Set it with:

```bash
python -m memory ext <extension_id> bind <capability_id> --journey <journey_id>
```

Conceptually, this stores:

```text
_ext_bindings.extension_id = <extension_id>
_ext_bindings.capability_id = <capability_id>
_ext_bindings.target_kind = journey
_ext_bindings.target_id = <journey_id>
```

The two links are independent. A journey can have a project path without any
extension binding; an extension can be bound to a journey that does not use a
project path. Project-aware providers typically use both.

## Complete runtime flow

Example user turn:

```text
let's work on the product-launch journey
```

Runtime flow:

```text
User query
   │
   ▼
Mirror detects journey = product-launch
   │
   ▼
IdentityService.load_mirror_context(journey="product-launch", ...)
   │
   ├─ Loads core identity/journey/attachment context
   │
   ├─ Finds extension bindings:
   │     _ext_bindings where target_kind='journey'
   │     and target_id='product-launch'
   │
   ├─ For each matching binding, in stable order:
   │     ├─ loads the installed manifest from
   │     │     ~/.mirror-minds/<user>/extensions/<extension_id>/
   │     ├─ resolves provider_runtime for capability_id
   │     ├─ builds mirror-context-v1 JSON with journey_id="product-launch"
   │     └─ invokes the bounded no-shell provider process
   │           (or the deprecated Python compatibility host until DS10)
   │
   ├─ Provider may read journey metadata:
   │     identity.metadata.project_path -> /path/to/project
   │
   ├─ Provider returns text or None
   │
   ▼
Returned text is appended to the Mirror Mode prompt as:

=== extension/<extension_id>/<capability_id> ===
<provider text>
```

If any extension is missing, emits malformed output, times out, fails, or returns `null`,
Mirror Mode continues without that section. Raw provider request/output is never written to
operational logs. Extension failures must never block the mirror, and journey bindings for
ancestors, descendants, or unrelated journeys never widen the selected journey.

## Source, installed runtime, and target project

A common source of confusion is that a single extension may involve three
folders:

| Role | Example | Purpose |
|---|---|---|
| Extension source | `~/Code/mirror-extensions/maestro` | Where the extension author edits code. |
| Installed runtime | `~/.mirror-minds/<user>/extensions/<extension_id>` | Copy loaded by Pi/Mirror at runtime. |
| Journey target project | `~/Code/<project>` | Project observed or enriched by the extension. |

The mirror loads extension code from the installed runtime, not from the source
folder. The provider may then inspect a journey target project if the journey
has a `project_path`.

When an extension changes, reinstall it:

```bash
python -m memory extensions install <extension_id> --extensions-root <extensions-root>
```

This copies the source into the installed runtime and runs pending migrations.

## Example: a journey-scoped project provider

Configuration:

```bash
python -m memory journey set-path product-launch ~/Code/product-launch
python -m memory ext project-health bind status --journey product-launch
```

Meaning:

```text
journey/product-launch
  -> project_path: ~/Code/product-launch

extension/project-health/status
  -> bound to journey/product-launch
```

At Mirror Mode time:

```text
active journey = product-launch
   ↓
provider receives ctx.journey_id = product-launch
   ↓
provider reads project_path = ~/Code/product-launch
   ↓
provider inspects project and returns a context block
```

## When to use journey bindings

Use a journey binding when the provider's output only makes sense inside a
specific ongoing workstream:

- project coherence for one software project,
- campaign metrics for one product launch,
- class agenda for one course journey,
- research notes for one writing project.

Use persona bindings when the context belongs to a way of speaking or operating
rather than to a particular project. Use direct CLI invocation when the user or
agent should call the extension explicitly instead of injecting it every turn.
