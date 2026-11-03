[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR165 — Pi puts no Mirror context before the model, so Pi is L3 where the plugin runtimes are L4: one doorman on every runtime

## Problem

The Pi extension (`.pi/extensions/mirror-logger.ts`) handles `before_agent_start` by
logging the prompt and, for a session Pi did not open in the tree, adding `AGENTS.md`
to Pi's context files (D13). It injects no Mirror context. On Pi, Mirror's identity and
journey context reach the model only when the model runs `/mm-mirror` and the skill's
`mirror mirror load` returns it, which is the model CV21.DS10 measured on Grok Build
and recorded as L3. Claude Code and Codex get the context from the plugin's inject
hook, on a Mirror turn and once on the first turn after Mirror Mode turns on;
Antigravity gets it from `PreInvocation`, once per user turn.

The architecture claimed Pi at L4 with no record behind the claim. CV21.DS11.TS1 wrote
the parity matrix, and the Navigator decided on 2026-10-24 that Pi is L3 by the same
line as Grok Build (DS11's stop condition 5, option 3: L3 now, and this CR as the way
back to L4). Pi is the harness Getting Started recommends.

## Expected Behavior

**One doorman.** The runtime, not the model, puts Mirror's context before the model, on
every runtime that can carry it, by one decision made in one place in the core. Today
there are three doormen with three policies: the Claude-family inject hook (the explicit
form, then once after Mirror Mode turns on), Antigravity's `PreInvocation` (every turn
while the session is marked active, with no prompt to route on), and Pi (none). After
this CR:

- **One decision module in the core** (`ts/src/mirror/doorman.ts`, reached as one
  front-door command and in-process by the hooks) takes the prompt and the session's
  state and answers: inject nothing, the full folder, or a delta. The hooks for Claude
  Code and Codex, Antigravity's hook, and the Pi extension's `before_agent_start` all
  call it and carry what it returns. Grok Build, which discards hook context, stays as
  it is.
- **The policy**, the same on every runtime:
  1. The explicit Mirror form in the prompt: the full folder, routed from the query,
     before the first token. The session is marked active, by its own id.
  2. Mirror Mode active, an ordinary turn: the prompt is routed (`detectPersona`, a
     keyword score, no model call). A persona that newly scores above threshold gets
     its section injected as a delta and becomes the session's persona; the memories
     and attachments relevant to this prompt are injected when any score above the
     threshold. Nothing else is repeated: the identity layers already sit in the
     transcript.
  3. Mirror Mode not active, an ordinary turn: nothing from the doorman. The model's
     own routing (the Operating Instructions) may invoke the skill; when the skill's
     load runs, the session learns it (see below), so the doorman takes over from the
     next turn.
- **The skill trusts delivered context.** The injected block says, in one line the
  model can read, that the runtime delivered Mirror's context for this turn. The
  `mm-mirror` skill's hard constraint becomes: load first *unless the runtime already
  delivered the context for this turn*; then render the transition from the delivered
  block. An explicit Mirror turn loads once, on every runtime.
- **The session learns Mirror Mode started by the model.** On Pi the extension sees
  the `mirror mirror load` tool call and marks the session; on Claude Code and Codex
  the hooks' per-turn state read catches `mirror_active` only when the load carried
  `--session-id`, so the skill's load must reach the session id (CR100's lead:
  `CLAUDE_CODE_SESSION_ID` in the agent's shell, to be measured) or the hook must learn
  it another way. This is the one open mechanism in the design.
- **One signature rule.** `AGENTS.md` signs an active persona `◇ persona-name`; the
  `mm-mirror` skill says `✦ Persona:` and "do not reuse `◇`"; the core's banner prints
  `✦ Persona:`. One spelling, stated in `AGENTS.md`, used by the skill's copies and the
  core's banner, and held by a guard test. Which spelling is the Navigator's call.
- **Measured, then the matrix.** Live on Pi and Claude Code (the explicit turn loads
  once; a follow-up that changes domain re-routes; an unprompted personal question is
  followed by doorman turns), with Codex and Antigravity run for no regression. Then
  Pi's row moves to L4 with version, binary, and date, and the parity decision's line
  stands: the runtime puts the context before the model.

## Impact

Medium. Not a defect: Mirror Mode works on Pi through the skill, as it does on Grok
Build. But the recommended harness sits a level below the plugin runtimes, and a Pi
session depends on the model choosing to load the context whenever the topic calls
for it. The cost to weigh is latency: unlike the prompt log, which the extension does
not await (CV9.E2.S32), an injection must finish before the model is called, and a
`mirror load` held a Grok turn 2.3–2.6 s (CR143's evidence). An explicit Mirror turn
would also load twice, once here and once in the skill, as on Claude Code.

## Plan Or Decision

Captured, unassigned, 2026-10-24, from CV21.DS11.TS1, in RS010 beside CR143 (the inject
hook on Grok) and CR160 (the Pi extension's turns).

**Direction decided by the Navigator, 2026-10-24,** after the measurement below: build
the one-doorman design, the comprehensive solution over the expedient one (copying
today's hook to Pi, which buys one folder on one turn for a double load on every
explicit turn), and fold the signature rule into this CR. The Expected Behavior above
is that design. Not planned: the plan, with its files, acceptance, validation, and the
open mechanism's answer, is proposed to the Navigator for approval, together with the
vehicle (this work touches the core, three hooks, the Pi extension, the skill's copies,
`AGENTS.md`, the contract, and the matrix, and needs live measurement on four runtimes:
a Delivery Story's size). Current Focus unchanged.

## Evidence

- `.pi/extensions/mirror-logger.ts`: the `before_agent_start` handlers enqueue
  `conversation-logger user-prompt` and append `AGENTS.md` to
  `event.systemPromptOptions.contextFiles`; nothing calls `mirror load`.
- The runtime interface contract, "Optional: Mirror Mode Identity Injection": "Pi does
  not auto-inject. The `/mm-mirror` skill calls `mirror load` explicitly at the start of
  each Mirror Mode response."
- `ts/src/hooks/claude.ts`, `claudeInject`: the two cases a Pi injection would follow.
- The parity matrix's Pi row (CR159, CR160, Pi 1.4.0) and the decision "The contract's
  parity matrix is the single authority for runtime parity", 2026-10-24.
- **Measured 2026-10-24, 18:57–18:59 UTC** ([`cr165-route.sh`](cr165-route.sh)): Pi 1.4.0
  (`~/.pi/agent/bin/pi`), headless from the checkout at `26b02733`, `claude-haiku-4-5`
  with thinking off, a seeded scratch home; evidence read from the scratch home's
  `front-door.log` and Pi's session file, not from the model's word. Session A, run
  twice, three turns: an explicit `/mm-mirror` question about pricing a mentorship, a
  follow-up on the same topic ("But what if nobody pays that much?"), and a follow-up
  in another domain (whether to write an article announcing it). Session B, once: a
  personal question with no form.
  - **Turn 1, both runs:** the model read the skill, ran `mirror mirror load --query
    …` once, was routed to `financial`, and signed the reply (`◇ financial` in A1,
    `✦ Persona: financial` in A2).
  - **Turns 2 and 3, both runs:** no `mirror` command of any kind — no load, no
    `detect-persona` — and no signature. The replies continued the thread from the
    folder loaded in turn 1, in an advisor's second person. The domain change in turn 3
    routed no persona.
  - **Session B:** on the unprompted personal question the model read the skill and ran
    the load by itself, routed to `strategist`: the Operating Instructions' own routing
    worked on Pi without the form.
  - So on Pi the folder is loaded once, on the turn that invokes the skill, and every
    follow-up is answered from it. On Claude Code the same turn 2 would receive one
    fresh folder from the inject hook, keyed to the follow-up's question, and turn 3
    nothing; the model's own behavior on those turns was not measured there.
  - Method limit: each headless turn is its own Pi process, so Mirror saw a session
    start and end per turn and recorded each turn as its own conversation; the model's
    transcript was continuous (`--continue`), which is what the measurement needs. In
    A1's turn 3 the prompt and the reply landed in two conversations, seen once in
    `-p` mode and not investigated.
  - Found on the way: `AGENTS.md` signs an active persona `◇ persona-name`, and the
    `mm-mirror` skill says `✦ Persona:` and "do not reuse `◇`"; the two runs used one
    each.

## Outcome

**Promoted, 2026-10-24,** to
[CV9.DS8 — One Doorman: Mirror's Context Before the Model on Every Runtime](../../roadmap/cv9-mirror-1-0/cv9-ds8-one-doorman-mirror-s-context-before-the-model-on-every-runtime/index.md),
with the Navigator's three decisions recorded in
[decisions.md](../../decisions.md#one-doorman-puts-mirrors-context-before-the-model-on-every-runtime):
memories refreshed on every ordinary turn in Mirror Mode; the signature `◇
persona-name`; the work a Delivery Story under CV9. The Delivery Story's TS1 measures
the one open mechanism first; its TS3 carries the signature rule this CR folded in.
