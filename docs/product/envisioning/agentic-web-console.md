[< Product Envisioning](index.md)

> **Status: Exploratory product design.** This document captures a future
> direction discovered while building the 1.0 read-only web visibility surface.
> It is not part of CV9.E6. It should graduate only after the basic visibility
> surface is useful and stable.

# Agentic Web Console

## Premise

The Mirror web surface can eventually become more than a read-only visibility
layer. A future version could let a user ask the Mirror to perform operations
through a headless agent runtime and watch the work unfold in the browser.

The strategic idea is not to build CRUD screens for every table and record.
Instead, the user expresses intent in natural language, the agent reads the
current Mirror state, proposes or performs controlled operations through Mirror
Core services, and the browser shows the run, evidence, approvals, and outcome.

This would turn the web surface from:

```text
read-only visibility
web -> surfaces -> services -> storage -> db
```

into a separate operational capability:

```text
intent-driven operations
web -> agent job service -> headless agent runtime -> Mirror Core tools/services
```

The read-only visibility surface should remain the foundation. Agentic
operation should be added only after the basic map, detail, evidence, and
Workspace surfaces are coherent.

## Why this matters

Many Mirror updates are semantic, not form-shaped:

- refine a persona;
- update an identity layer;
- add or revise a journey path;
- consolidate memories;
- promote a shadow observation;
- explain and apply a decision;
- update project context after a conversation.

Building a separate GUI for every mutation would make the product heavy and
brittle. A controlled agentic operation model could let Mirror update itself in
the same way it is used: through context, judgment, and explicit human approval.

## Product shape

A possible browser flow:

```text
User: Update my strategist persona with this new positioning.

Agent run starts
  - reads current persona
  - identifies proposed semantic changes
  - shows diff/proposal
  - requests approval
  - writes through IdentityService after approval
  - records evidence and reason
  - reports completion
```

The browser should show an event timeline rather than hide the operation behind a
spinner:

```text
Prompt
Plan
Reads
Tool calls
Proposed changes
Approval request
Writes
Validation
Result
Transcript / evidence
```

## Architecture sketch

A future implementation likely needs a job layer between web requests and the
agent runtime:

```text
Browser
  ↓
Mirror Web Server
  ↓
Agent Job Service
  ↓
Headless Agent Runtime
  ↓
Mirror tools / services
  ↓
SQLite / files / git / extension state
```

And a streaming channel back to the browser:

```text
agent events -> job event log -> SSE/WebSocket -> browser timeline
```

The current `http.server`-based web server is sufficient for read-only surfaces,
but agent runs may justify a more capable local server stack such as
FastAPI/Starlette with background jobs and SSE/WebSocket support.

## Safety principles

Agentic web operations must not become unconstrained database mutation.

Principles:

- Use Mirror Core services and commands, not raw SQL from the agent.
- Prefer proposals and diffs before writes.
- Require explicit approval for persistent changes.
- Keep an audit trail of requested intent, agent run id, before/after state,
  reason, timestamp, and tools used.
- Support cancellation for long-running jobs.
- Keep the user able to inspect what happened after the run.
- Do not hide uncertainty or provenance.
- Maintain read-only visibility as a safe mode.

## Possible phased path

### Phase 1 — Read-only agent assistant

The browser can ask an agent to explain or inspect visible Mirror data, but no
writes are allowed.

Examples:

```text
Explain this persona.
Compare Self and Ego.
What tensions appear in these memories?
```

### Phase 2 — Proposed changes only

The agent can draft structured changes but cannot apply them.

```text
Proposed update to persona/strategist
Diff
Reason
Evidence
[Apply] [Reject]
```

### Phase 3 — Approved writes through services

The agent can execute approved operations through controlled Mirror services.

```text
IdentityService.update(...)
MemoryService.add_memory(...)
JourneyService.update_path(...)
```

### Phase 4 — Full local agent console

The browser becomes a local operations console with streamed runs, approvals,
transcripts, cancellation, and job history.

## Open technical questions

- Does Pi expose a stable headless API/SDK suitable for embedding, or would
  Mirror need a runtime-neutral agent execution layer?
- Should the web server call Pi headless directly, or should Pi and web both use
  a shared Mirror Agent Runtime?
- How should approval requests be represented in the event stream?
- How are concurrent runs serialized when they touch the same identity/persona
  or database rows?
- What is the rollback story for partially completed agent operations?
- Which operations are safe enough for approval-based writes, and which require
  manually reviewed diffs?
- How should agent-created changes be linked back to memory/evidence records?

## Relationship to current web visibility work

This is intentionally out of scope for CV9.E6 Web Visibility.

CV9.E6 should remain read-only and prove that users can see and understand their
Mirror through Identity and Workspace perspectives. Agentic web operations should
be considered only after that foundation is useful.
