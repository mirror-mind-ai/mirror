# TS6 driver smoke — the shipped plugin's hooks through the doorman on agy 1.4.7, 2026-10-25

The Driver's isolated smoke, run before the Navigator's walk (development guide,
"Test and Validation Route"). It is not the Navigator's validation: it runs headless
only, without a provider key, and cannot reach the rows that need the model's own
`mirror` commands (headless agy denies them). It shows the hook doing its job inside
the real agy, on the user's turns, before anyone spends a walk on it.

## Environment

| | |
|---|---|
| agy | 1.4.7, `~/.local/bin/agy`, headless (`--print`, `--conversation <id> --print`) |
| plugin | the checkout's `plugins/mirror-mind`, declared by a scratch workspace's `.agents/plugins.json` (`/tmp/ts6-smoke/ws`); nothing written under `~/.gemini/config` |
| hooks | `MIRROR_BIN` → a scratch `bin/` whose `mirror-hook` and `mirror` link to the checkout's `bin/` |
| Mirror home | scratch, `/tmp/ts6-smoke/mirror-home`, its database the synthetic demo (`ts/smoke/generate_demo_memory_db.ts`: three fictional personas routed by keyword, fictional memories) |
| isolation | `MIRROR_HOME`, `DB_PATH`, `MIRROR_USER=`, `XDG_CONFIG_HOME`, `MIRROR_SESSION_ID=` set in agy's environment, so neither the tree's `.env` nor `~/.config/mirror/env` reached the hooks |
| providers | none: `OPENROUTER_API_KEY=` and `MEMORY_RECEPTION=0` — no spend; the delta's memory search is the FTS fallback, and no `llm_calls` row is written |
| date | 2026-10-25, 18:08–18:10 UTC |

## The turns

One new conversation (`75f079e1-…`), then three resumed turns, each in a new agy
process. The prompts are synthetic; the steps are read from the conversation's
`transcript_full.jsonl`.

| turn | prompt | injected step(s) for the turn | model |
|---|---|---|---|
| 1, new conversation | `/mirror-mind:mm:mirror how should I plan my budget for next year?` | ONE `SYSTEM_MESSAGE` / `SYSTEM_SDK`, opening `=== mirror context delivered by the runtime for this turn: full — answer as the mirror; sign ◇ demo-finance-coach ===`, the folder under it | no reply: it ran `git status \|\| ls -la`, which headless agy denied |
| 2, resumed | what to plant in a clay-soil garden | ONE, `delta (persona: demo-garden-planner · journey: none) — answer as the mirror; sign ◇ demo-garden-planner` | answered, signed `◇ demo-garden-planner` |
| 3, resumed | when to start the seedlings | ONE, `delta (persona: demo-garden-planner · journey: none)`, no persona section | answered, signed `◇ demo-garden-planner` |
| 4, resumed | `/mirror-mind:mm:build demo-root-active` | none (the hook answered `{}`); only agy's own `SYSTEM` notice | no reply: its `mirror build load` was denied headless |

After the turns: the session row is `interface=antigravity`, `mirror_active=1`,
`persona=demo-garden-planner`, its own `operating_mode` Mirror Mode, `doorman_refresh`
answered; the Stop handler logged two user and two assistant rows as `antigravity`
(turn 1 had no reply to log; turn 4 is a skill turn); `hooks.log` empty.

## What a turn costs the hook, locally

`agy:pre-invocation` replayed through `bin/mirror-hook.js` against a copy of the smoke's
database, wall time per run, two rounds (no network: no provider is configured, so a
real delta adds its one embedding's latency to these):

| path | seconds |
|---|---|
| quiet turn, doorman path | 0.216–0.233 |
| quiet turn, pre-1.4.7 path (the dropped pre-check) | 0.162–0.170 |
| full (explicit form) | 0.223–0.229 |
| delta, new persona | 0.225–0.228 |
| delta, same persona | 0.228–0.229 |
| skill turn | 0.220–0.221 |
| `invocationNum` 4 (Node started, no wrapper) | 0.162–0.164 |

The doorman path costs a quiet turn about 55 ms more than the old pre-check did: the
front door's import and a read-only decision, once per user turn. agy's budget for the
hook is the plugin's `hooks.json` timeout, 15 s; the provider calls behind a full or a
delta turn are bounded at 10 s (reception) and 15 s (embedding) — the walk times them
with a key.

## Left behind

Nothing. The smoke conversation (`75f079e1-…`) was deleted from the operator's agy home
on 2026-10-25, at the Navigator's direction, with every trace of it there, and
`/tmp/ts6-smoke` with it.
