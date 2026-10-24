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

## Outcome

Open.
