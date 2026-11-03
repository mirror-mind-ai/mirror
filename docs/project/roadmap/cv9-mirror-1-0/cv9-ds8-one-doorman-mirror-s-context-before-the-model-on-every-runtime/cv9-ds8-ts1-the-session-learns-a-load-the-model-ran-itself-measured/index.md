[< Parent](../index.md)

# CV9.DS8.TS1 — The session learns a load the model ran itself, measured

**Status:** ✅ Done — 2026-10-24
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

**Measured 2026-10-24** (`route.sh` in this package; Mirror 0.36.3 at `fd7527b9`;
every row from a log, the model's word only as an observation). Pi 1.4.0
(`~/.pi/agent/bin/pi`), Claude Code 2.1.310 (`~/.local/share/claude/versions/2.1.310`),
Codex 0.164.0 (`/opt/homebrew/Caskroom/codex/0.164.0/bin/codex`).

| Runtime | Fact | Observed | Source |
|---|---|---|---|
| Pi, P2 | `MIRROR_SESSION_ID` set by the probe at `session_start` reaches the model's shell | yes: the session file, under a path with a space, intact | the `env` turn's reply and transcript |
| Pi, P2 | the model's own `mirror mirror load` binds the session's conversation | yes | `runtime_sessions.conversation_id` |
| Pi, P2 | `mirror_active` written by that load | **unwritten**: `writeMirrorState` (`ts/src/mirror/orchestration.ts`) writes with the explicit `--session-id` only, though the route passes the environment id into the load | `runtime_sessions` |
| Pi, P1 | the probe sees the load at `tool_call` and appends a quoted `--session-id` | yes, logged, the path quoted | probe log |
| Pi, P1 | `mirror_active` written, persona `financial` on the session | yes | `runtime_sessions` |
| Claude Code | `CLAUDE_CODE_SESSION_ID` in the Bash tool's environment | yes, `1c8f4f20…`, equal to the result's `session_id` and to the row the prompt hook wrote | turn 1 result, `runtime_sessions` |
| Claude Code | the same variable in the hook's own environment (M3) | yes | the probe hook's env names |
| Claude Code, B | the model's own load on a plain personal question | **none** (n=1, `haiku`, `-p`): the model answered as a generic advisor, no tool call, with the skill listed in its context. On Pi the same question loaded (CR165, B) | transcript |
| Claude Code, B | M2, the marker in the Stop payload | 0 of 2 payloads (n=1, an observation) | Stop payloads |
| Codex, `exec` | session variables in the model's shell | `CODEX_SESSION_ID` and `CODEX_THREAD_ID`, equal to the prompt hook's session row and exec's thread id (hooks under `--dangerously-bypass-hook-trust`) | exec output, `runtime_sessions` |
| Codex, TUI | the same, run by the Navigator | `CODEX_SESSION_ID=01a16f79…`, equal to the `codex` row the hooks wrote; also `CODEX_SANDBOX=seatbelt` | the Navigator's paste, `runtime_sessions` |

**The mechanisms decided, written into DS8's package:**

- **Claude Code and Codex:** the front door reads `CLAUDE_CODE_SESSION_ID` and
  `CODEX_SESSION_ID` as its environment session id when `MIRROR_SESSION_ID` is absent —
  one reader, as `runtimeDetection` reads Grok's variables — so the model's own load
  and the hooks name the same session with no skill text change. Both variables are
  undocumented, measured on 2.1.310 and 0.164.0; absence falls back to today's
  behavior.
- **Pi:** P2. The extension sets `MIRROR_SESSION_ID` at `session_start`, as the probe
  did; TS2 makes `writeMirrorState` honor the environment id (the one-line gap above).
  P1 works and is kept as the measured alternative, not chosen: it edits the model's
  commands, the precedent a hostile extension would set, and P2 needs nothing of it.
- **The rule for TS2:** a session learns Mirror Mode from the harness — the hook, the
  environment, the load that names its session — never from the model's reply. M2 was
  0 of 2 on Claude Code and 2 of 3 on Pi.
- **What a named session grants**, for TS2 to bound: the model can already run every
  `mirror` command; with its session named it can also write session-scoped mode,
  persona, and journey for its own session (the contract's journey-redirection case).

**Found on the way, an observation for DS8 (n=1):** on Claude Code the plain personal
question did not make the model load the folder by itself, where Pi's did. The
Operating Instructions' routing is the model's; the doorman is the harness's. It is
one more reason the doorman matters, and not a measurement of the routing.

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
