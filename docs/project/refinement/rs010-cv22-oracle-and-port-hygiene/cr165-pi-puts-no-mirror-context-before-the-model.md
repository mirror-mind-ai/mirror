[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR165 — Pi puts no Mirror context before the model, so Pi is L3 where the plugin runtimes are L4

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

Pi puts Mirror's context before the model the way the inject hook does on Claude Code
and Codex: on an explicit Mirror turn (`/mm-mirror …` or `/skill:mm-mirror …`) and
once on the first turn after Mirror Mode turns on in the session, through
`before_agent_start`, which can add to the system prompt as the extension's D13
handler already does. It uses the same `mirror load --context-only` and the same
once-per-session mark. Measured live on the installed Pi, the matrix's Pi row then
moves to L4 with its version, binary, and date.

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
hook on Grok) and CR160 (the Pi extension's turns). Not planned. Current Focus
unchanged.

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

Open.
