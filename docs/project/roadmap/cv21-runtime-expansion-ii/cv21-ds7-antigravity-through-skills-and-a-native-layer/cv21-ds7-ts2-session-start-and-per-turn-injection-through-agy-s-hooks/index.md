[< Parent](../index.md)

# CV21.DS7.TS2 — Session start and per-turn injection through agy's hooks

**Status:** ✅ Done
**Type:** Technical Story

---

## Technical Story

In order for Mirror Mode to reach the model on Antigravity,
As the plugin's agy-native layer,
I want the staged `hooks.json` to carry real handlers: `SessionStart`
switching logging on for the session, and a `PreInvocation` adapter
injecting Mirror Mode context once per user turn on `invocationNum == 0`,
So that bar items 2 and 3 have working mechanisms before US4 measures them
live.

## Outcome

US1 staged a behavior-free skeleton. After this story the layer's
`hooks.json` names two handlers, both thin generated wrappers over the one
Node hook entry (`mirror-hook`, the bin form — the staged copy lives in
agy's cache, like the Claude plugin in Claude's): `agy:session-start` and
`agy:pre-invocation`. The session-start handler turns conversation logging
on and answers agy's contract; the pre-invocation adapter answers `{}`
instantly for `invocationNum != 0` (it fires before *every* model call —
32 times over two turns in DS12.TS3 L2) and, at 0, loads Mirror context
through the front door for the payload's `conversationId`, injecting it as
an `injectSteps` step when there is context to inject. The Operating
Instructions ride `rules/AGENTS.md` (US1's file) unless the live route
shows they do not reach the model — then SessionStart delivers them as a
`systemMessage`, the measured fallback.

## Acceptance Behavior

```text
Given the staged layer on agy 1.4.2
When a session starts
Then the SessionStart handler runs, logging is on, and the handler answers
  agy's output contract
When the model is about to run with invocationNum != 0
Then the pre-invocation adapter answers {} without reaching the front door
When invocationNum == 0 and Mirror context is owed for the conversation
Then the adapter injects it as an injectSteps step, once for that turn
And the Operating Instructions reach the model, by rules/AGENTS.md or the
  measured SessionStart fallback
And every handler exits 0 whatever happens, recording failures in
  hooks.log, never failing the turn
```

## Scope

- The agy hook entries (`ts/src/hooks/agy.ts`, dispatched from `main.ts`):
  camelCase payloads, agy's output shapes, the `invocationNum == 0` gate.
- Two generated bin-form wrappers inside the plugin, and the grown
  `hooks.json` naming them with explicit timeouts.
- The wrapper guard (`hooks.test.ts`) and plugin guard extended.
- The live route: one scripted session against the installed agy proving
  the handlers fire and the injections reach the model.

## Out Of Scope

- Logging the turns as `antigravity` and closing the session (TS3 — the
  `Stop` handler and the transcript reader).
- The full bar measurement (US4) and Gemini CLI's removal (DS8).
- MCP reachability.

## Validation

Automated: payload-fixture unit tests for both handlers and the grown
generated files; the full suite. Navigator-visible: the live route in a
scratch workspace on the installed agy, with capture evidence committed.
