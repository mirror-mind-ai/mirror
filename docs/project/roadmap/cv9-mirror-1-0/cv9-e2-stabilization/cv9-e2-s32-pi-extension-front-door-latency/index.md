[< CV9.E2 Stabilization & Robustness](../index.md)

# CV9.E2.S32 — Pi Extension Front-Door Latency

**Status:** ✅ Done — Navigator validation recorded 2026-10-12 ([validation](validation.md))
**Type:** Technical Story
**Epic:** CV9.E2 Stabilization & Robustness
**Release intent:** PATCH

---

## Technical Story

In order to make a Pi session feel immediate at startup and at the start of
every turn,
As the Pi `mirror-logger` extension,
I want to reach the Mirror front door with fewer, non-blocking subprocess calls,
So that the user never waits on Mirror bookkeeping that nothing downstream
depends on — while every call still goes through the `mirror` bin.

## Context

Since CV22 the extension reaches the core by spawning `node bin/mirror.js …`.
Measured on the development machine (2026-10):

| Call | Wall time |
|------|-----------|
| bare `node -e ""` | ~40 ms |
| `mirror --help` (loader shim, type-strip, import `cli.ts`) | ~180 ms |
| `mirror welcome` (+ config, sqlite open, queries) | ~290 ms |

The fixed cost per call is the module graph, not process creation. The
extension pays it on the user-visible path in two places:

- **`session_start`** — three awaited calls in sequence:
  `conversation-logger session-start --fast` → `welcome` →
  `welcome --status-line --session-id …`. About 0.8–0.9 s before Pi is usable.
- **`before_agent_start`** — one awaited `conversation-logger log-user …`
  before each turn starts. About 0.2 s per prompt, every prompt.

The `agent_end` and `session_shutdown` paths are already background or
post-response and are not felt.

A data dependency constrains the fix: `session-start --fast` runs `setMute(false)`
and `resetSessionOrientation`, and both `welcome` and `welcome --status-line`
read that orientation. The three startup calls cannot simply be fired in
parallel; they must become one front-door call, or the two reads must follow
the one write.

A second constraint applies to the per-turn path: `log-user` must land before
`log-assistant` for the same turn. `log-assistant` is already a detached
background spawn; making `log-user` background too without an ordering
guarantee turns message order into a race.

## Decision: stay out of process

Loading the core as a library inside the extension was considered and
rejected for this story. The process boundary is what gives the extension its
fail-quietly contract (`runMirror` swallows a child failure; an in-process
throw, `process.exit`, or sync `node:sqlite` stall would hit Pi's TUI), keeps
`silenceExperimentalWarnings`'s `process.removeAllListeners("warning")` and
`loadConfiguration`'s `process.env` writes away from Pi's own process, keeps
one loader (`bin/loader.js`) instead of a second one (Pi's jiti) that the core
would have to be validated against, keeps `.env` re-read on each call, and
keeps every call on `routing.ts` and in `front-door.log`. The ~150 ms it would
save per call is bought back by this story at no architectural cost. A
long-lived process is the right way to amortize startup, and that is the MCP
server's job (CV21), not the extension's.

## Outcome

Pi session startup makes one awaited front-door call instead of three, and the
start of a user turn is not gated on the prompt being logged. Nothing about
what gets logged, when the conversation is bound, or what the welcome card and
status line show changes.

## Acceptance Behavior

```text
Given Pi starts a session with the mirror-logger extension loaded
When session_start runs
Then exactly one awaited front-door process performs session-start-fast,
     renders the welcome card, and renders the status line
And the welcome card and status line reflect the orientation that
     session-start-fast just reset
And session-maintenance still runs detached in the background
```

```text
Given a user submits a prompt that is not a slash command
When before_agent_start runs
Then the agent starts without awaiting the log-user front-door process
And the log-user write is tracked by the extension
```

```text
Given a turn whose log-user write has not yet completed
When agent_end fires for that turn
Then log-assistant is not spawned until the pending log-user write has settled
And the user message precedes the assistant message in the conversation
```

```text
Given the log-user background write fails
When agent_end fires for that turn
Then log-assistant still runs
And the failure is in mirror-logger.log, not on Pi's UI
```

```text
Given a session with the consolidated startup call
When front-door.log is read
Then one routed entry appears for startup where three appeared before
```

## Scope

- One front-door command that performs `session-start --fast` and returns the
  welcome card and the status line in a single process. Shape is the plan's
  call (a flag set on `conversation-logger session-start`, a flag on `welcome`,
  or a new composite); the extension must be able to separate the three outputs
  deterministically.
- `before_agent_start` spawns `log-user` without awaiting it, and records the
  pending write per Pi session file.
- `agent_end` awaits the pending `log-user` for that session (settled, not
  necessarily succeeded) before spawning `log-assistant`.
- The extension's existing log lines (`session-start result`, `welcome:`,
  `log-user:`) keep their meaning.
- Timing of the startup path before and after, recorded in `validation.md`.
- Extension-level regression coverage for the ordering guarantee, using
  whatever harness `ts/smoke` already uses for the extension or a new one if
  none exists.

## Out Of Scope

- Importing `ts/src` into the extension, or any in-process use of the core
  from Pi. See the decision above.
- Changing the `agent_end` and `session_shutdown` paths beyond the ordering
  await.
- Changing the skills path (`/mm-*` → bash → `mirror …`). That is a
  subprocess by design and shared by every runtime.
- Gemini CLI, Codex, and Claude Code hook wrappers. They have their own
  per-event lifecycle and were not measured here.
- A resident Mirror process for Pi (MCP transport). CV21.
- Caching module load across calls (snapshot, compile cache) in
  `bin/loader.js`. Possible later; a separate measurement.

## Validation

- `time` the startup path before and after; record both.
- A smoke that drives `session_start`, `before_agent_start`, and `agent_end`
  against a test mirror home and asserts message order in the database when
  `log-user` is artificially delayed.
- `front-door.log` shows one startup route entry per session.
- The welcome card and status line rendered at startup are byte-identical to
  what the three separate calls rendered before.

## See Also

- [Plan](plan.md)
- [Test Guide](test-guide.md)
- [Validation](validation.md)
- [CV9.E2 Stabilization & Robustness](../index.md)
- `.pi/extensions/mirror-logger.ts` — the dispatcher this story changes
- `ts/src/frontDoor/sessionStartWelcomeRoute.ts` — the composite route
- [D-028](../../../../debt.md#d-028--the-pi-extension-passes-the-users-prompt-to-log-user-as-an-argv-element) — argv→stdin, registered by this story
- [D-029](../../../../debt.md#d-029--the-pi-extension-records-only-the-first-prompt-of-an-agent-run) — prompts queued into a Pi run are not recorded, found by this story's validation
- [D-030](../../../../debt.md#d-030--the-prompt-that-runs-build-load-is-recorded-in-the-conversation-build-load-closes) — the turn that runs `build load` is split across two conversations, observed during this story's validation
- `ts/src/conversation/sessionComposites.ts` — `sessionStartFast`
- `bin/loader.js` — why the front door is a shim, and why it stays one
- [Versioning](../../../../../process/versioning.md)
