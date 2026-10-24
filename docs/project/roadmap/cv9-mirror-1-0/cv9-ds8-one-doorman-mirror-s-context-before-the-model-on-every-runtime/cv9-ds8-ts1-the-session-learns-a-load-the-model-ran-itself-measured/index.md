[< Parent](../index.md)

# CV9.DS8.TS1 — The session learns a load the model ran itself, measured

**Status:** 🟡 Planned
**Type:** Technical Story
**Delivery Story:** CV9.DS8 — One Doorman: Mirror's Context Before the Model on Every Runtime

---

## Technical Story

In order to build the doorman on a session that knows when Mirror Mode is on,
As the engineering team,
I want to measure, on the installed Claude Code, Codex, and Pi, how a `mirror mirror
load` the model runs by itself can name its session — the variable the model's shell
carries, the event the Pi extension sees, the environment it can set — and to record
one mechanism per runtime with version, binary, and date,
So that TS2's doorman is designed on measured facts and the session learns a
self-started Mirror Mode on every runtime that can tell it.

## Outcome

A record, per runtime, of how a load the model ran by itself can name its session, and
one mechanism per runtime decided from it and written into DS8's package. The question
it settles: today the session's `mirror_active` flag is written only when `mirror load`
receives `--session-id`, and only the Claude-family inject hook passes it. When the
model fetches the folder by itself — the `/mm-mirror` skill on Pi, or the Operating
Instructions' routing on any runtime — the load carries no session id and the session
never learns; a doorman gated on the flag would stay silent on every follow-up (CR165's
session B). The facts are filled in at validation.

## Acceptance Behavior

```text
Given the installed Claude Code, Codex, and Pi, each in a scratch cell
When a Mirror turn is run on each and the model's own load is observed
Then the story records, per runtime, with version, binary, and date:
     whether the model's shell carries a session variable equal to the hooks' session
     id (Claude Code, Codex); whether the Pi extension sees the load as a tool call
     and can rewrite it, and whether an environment variable it sets at session start
     reaches the model's shell (Pi)
And one mechanism per runtime is decided and written in the Delivery Story's package,
    or the runtime with none is named for the Navigator's decision
```

## Scope

- The measurements and the recorded mechanisms. No doorman code.

## Out Of Scope

- Building the doorman (TS2), changing the skill (TS3), or any runtime's hook or
  extension beyond the probe the measurement needs.
- Antigravity: its SessionStart already marks the session active for every session
  (CV21.DS7.US4), so it has no self-started case to learn. Grok Build discards hook
  context and is outside DS8.

## Validation

The route in this package, one step per runtime; the Navigator reads the recorded facts
and the mechanism each decides.
