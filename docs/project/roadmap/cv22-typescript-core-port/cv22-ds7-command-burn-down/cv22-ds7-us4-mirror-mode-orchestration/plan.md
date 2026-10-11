# Plan — CV22.DS7.US4

## Objective

Transfer the core deterministic Mirror Mode and operating-mode orchestration boundary from
Python to TypeScript without changing the runtime-visible contract. TypeScript owns the
command parsing, core context assembly, state transitions, conversation binding/logging,
and rendering. Reception is ported behind replay; DS8 continues to own live provider calls.
When an installed extension context binding matches the selected persona or journey, an
explicit Python fallback preserves provider output until CV22.DS7.TS2 transfers that
separate runtime contract.

## Authority And Seam

Python remains the behavioral oracle until this story passes parity and its routing entries
flip. The database remains the integration seam. After the flip, new behavior for these
command branches lands in TypeScript and Python is compatibility-only for them.

The command inventory is closed for this story:

- `mirror load [--persona P] [--journey J] [--query Q] [--org] [--context-only] [--session-id S]`
- `mirror deactivate [--session-id S]`
- `mirror log <summary> [--session-id S]`
- `mirror journeys`
- `mode activate <mode> [--journey J] [--session-id S]`
- `mode deactivate [--session-id S]`
- `mode status [--session-id S]`

`mirror load` with reception enabled routes to TS only when the story's reception replay
configuration is present. Live reception remains Python fallback until DS8. Before taking
the TS path, the front door also checks whether a matching installed extension context
binding could contribute; if so, the complete command routes explicitly to Python. TS2
owns removing that bounded fallback. Reception-off, extension-free, and otherwise
deterministic branches may route directly to TS after parity is proven.

## Behavioral Contract

### Default resolution

Preserve this priority exactly:

1. explicit persona/journey arguments;
2. replayed reception result when enabled and a query exists;
3. session defaults, then the `__global_sticky_defaults__` compatibility row;
4. keyword persona and journey detection.

Explicit values are never overridden. Reception failure or malformed output is fail-soft.
Global sticky defaults are updated only when a resolved persona or journey exists.

### Context composition

Preserve section ordering and omission rules:

- hard constraints first;
- `self/soul` and `ego/identity` only when identity is touched;
- `ego/behavior` and `user/identity`;
- optional organization identity/principles;
- selected persona;
- all knowledge entries;
- the selected journey only;
- shadow with provenance framing only when explicitly activated;
- relevant attachments using existing score thresholds and selected-journey isolation;
- no installed-extension section on the TS path because matching extension bindings are
  detected before dispatch and preserve the complete Python command path until TS2.

Journey parentage remains organizational only. Selecting a journey must not load ancestor
or descendant identity, attachments, memories, instructions, or search scope.

### State and conversation effects

- `mirror load` activates `Mirror Mode`, updates session Mirror state when a session exists,
  marks context as owing hook injection, persists sticky defaults, and binds the current
  open conversation unless `--context-only` is set.
- `mirror deactivate` without a session preserves the warning/no-op behavior; with one it
  clears only that session's Mirror state.
- `mirror log` is mute-aware, writes the assistant message to the resolved current session,
  and updates the conversation title from the first summary sentence with the existing
  60-character behavior.
- `mode` preserves session-scoped metadata when a session is supplied and the legacy global
  operating-mode row otherwise. Deactivation never clears sticky persona/journey defaults.
- IDs and timestamps are injected into core functions for deterministic parity tests.

### Rendering and process contract

Match Python stdout/stderr division, exit codes, warnings, transition surface text,
persona banner behavior, journey detection notice, and journey listing format. Front-door
logs remain metadata-only: command, route, exit status, fallback category, and error
category, never query, summary, identity, journey content, extension provider output, or
argument payloads. The matching-binding fallback is observable as a route reason without
logging binding targets or payloads.

## Implementation Slices

### Slice 1 — Characterize and freeze the oracle

- Add a Python parity generator covering every command branch and state transition.
- Commit redacted command/output and database-state fixtures.
- Register the newly ported Python oracle files in `ts/parity/oracle-baseline.json`.
- Include no-session warnings, session/global mode behavior, muted logging, title truncation,
  context-only behavior, selected-journey isolation, and matching-extension fallback.

Likely oracle files include:

- `src/memory/skills/mirror.py`
- `src/memory/cli/mode.py`
- `src/memory/services/operating_mode.py`
- `src/memory/services/runtime_session.py`
- `src/memory/services/identity.py`
- `src/memory/intelligence/reception.py`
- the narrowly used conversation-logger and mirror-state functions
- `src/memory/surfaces/mode_transition.py`

### Slice 2 — Operating-mode and runtime-session primitives

- Add cohesive TS modules for operating-mode state and Mirror session state.
- Port global/session metadata decoding, activation, deactivation, status, sticky-default
  resolution, hook flags, and current-session resolution.
- Port conversation binding and mute-aware assistant message/title logging without pulling
  extraction or maintenance into this story.
- Prove database transition parity on disposable DB copies.

### Slice 3 — Reception and context assembly

- Add `reception` to the replay LLM role contract and port prompt input formatting,
  response parsing, and fail-soft behavior.
- Port default resolution and identity/context assembly as testable core functions.
- Reuse existing TS identity/persona/journey primitives where their ordering matches the
  Python oracle; add dedicated readers where Mirror composition requires different order.
- Port attachment relevance for exact observable parity.
- Add a read-only preflight that detects matching `_ext_bindings` rows for the resolved
  explicit/sticky route inputs where they are available before dispatch. For reception-
  selected persona/journey, conservatively preserve Python fallback whenever installed
  context-provider bindings could become relevant; do not execute or omit providers.
- Keep extension provider execution entirely outside US4 and link every bounded fallback
  branch to CV22.DS7.TS2.

### Slice 4 — Command renderers and front-door dispatch

- Add narrow `mirror` and `mode` argument/dispatch modules rather than growing one god path.
- Extend `ts/src/frontDoor/routing.ts` with independently revertible family routes.
- Gate reception-enabled `mirror load` on an explicit replay fixture; preserve Python
  fallback for live reception.
- Preflight installed extension bindings before committing to the TS `mirror load` path;
  route the complete command to Python when provider output could contribute.
- Extend `ts/src/frontDoor/cli.ts`, public exports, and metadata-only front-door logging.
- Preserve exact output channels and return codes.

### Slice 5 — Parity, E2E, and routing flip

- Grade exact output and normalized database transitions against the committed Python oracle.
- Run the full TS suite, oracle drift check, real-DB-copy checks, and focused Python tests.
- Run the disposable-home front-door E2E before flipping the routes.
- Update the DS7 burn-down inventory and story artifacts only after evidence passes.

## Expected File Areas

Expected new or changed areas; exact filenames may be refined during TDD without widening
scope:

- `ts/src/mirror/` — resolution, context composition, session/log orchestration, rendering
- `ts/src/mode/` or `ts/src/runtime/` — operating-mode and runtime-session primitives
- `ts/src/providers/llm.ts` — replay `reception` role
- `ts/src/frontDoor/routing.ts` and `ts/src/frontDoor/cli.ts`
- `ts/src/index.ts`
- `ts/parity/`, `ts/test/mirror/`, `ts/test/mode/`, and `ts/test/frontDoor/`
- `ts/parity/oracle-baseline.json`
- this story package and the DS7/CV22 status documents at closure

## Acceptance Behavior

```text
Given a disposable configured Mirror home containing identities, journeys, attachments,
       runtime sessions, and an open conversation
And either reception is disabled or a scrubbed reception replay fixture is configured
When each mirror/mode command branch runs through the TypeScript front door
Then stdout, stderr, exit status, ordered core context sections, and normalized DB
     transitions match the Python oracle
And the front-door route is independently revertible to Python
And no argument, identity/transcript, binding target, or provider content appears in logs
And the selected journey remains isolated from ancestors and descendants
And live reception still routes to Python pending DS8
And matching installed extension context bindings route the complete command to Python
    pending TS2 rather than silently losing provider output
```

## Validation Route

### Automated

- Focused TS unit and golden suites for mirror, mode, reception, context, and routing.
- Python characterization tests/generator for the frozen oracle.
- Redacted parity fixtures comparing stdout, stderr, exit status, and DB state.
- Disposable DB-copy integration test for session/global state and conversation logging.
- Full `uv run` project checks required by the development guide.
- Oracle drift check with every transferred Python source registered.

### E2E decision

**Required.** This story changes the runtime context-injection boundary and cannot close on
fixture-level unit tests alone.

### Navigator-visible route

Using a disposable Mirror home and explicit session ID:

1. run `mode status` and observe the default `Mirror Mode`;
2. run `mirror load` with an explicit journey and query under replay;
3. inspect the rendered transition/context and confirm only the selected journey appears;
4. run `mirror log` and verify the assistant message/title in the disposable conversation;
5. run `mirror deactivate --session-id ...` and confirm only that session is deactivated;
6. repeat through the Python oracle and compare the user-visible result;
7. add a synthetic matching extension binding and confirm the front door reports Python
   fallback while the extension section remains present.

Expected observation: the TS and Python flows are indistinguishable apart from deliberate
front-door diagnostics, and the TS route is recorded without payload content.

Pass condition: exact rendered/exit parity, equivalent normalized database state, selected-
journey isolation, successful replay reception, fail-soft malformed reception, clean
redaction checks, and explicit matching-binding fallback with preserved extension output.

Fail condition: any missing/reordered core context, state leakage across sessions or
journeys, dropped attachment contribution, a matching extension binding entering the TS
path, lost extension output on fallback, live provider call, payload logging, differing
warning/exit behavior, or unexplained database transition.

## Non-Goals

- Assistant answer generation or persona prose behavior outside context assembly.
- Live-provider implementation or paid validation.
- Extraction, embeddings, pending-conversation maintenance, or metadata lifecycle.
- Extension provider execution, extension API migration, or fallback removal; those belong
  to CV22.DS7.TS2.
- Soul, Explorer, Builder/Ariad, Workspace/web, ops tail, Python deletion, or npm work.
- Schema changes or semantic improvements to routing/context composition.

## Stop Conditions

Stop and return to the Navigator when:

- the bounded matching-binding fallback cannot preserve extension output without widening
  into provider execution owned by TS2;
- the Python oracle changed after fixture capture;
- reception cannot remain cleanly separated into replay-now/live-DS8;
- a schema change appears necessary;
- selected-journey isolation or front-door redaction cannot be demonstrated;
- required checks fail without a narrow in-scope correction;
- implementation reveals product redesign rather than parity work.

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
