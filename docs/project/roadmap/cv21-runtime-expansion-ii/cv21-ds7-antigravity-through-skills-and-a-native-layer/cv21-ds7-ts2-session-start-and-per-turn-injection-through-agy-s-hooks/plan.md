# Plan — CV21.DS7.TS2

## Objective

Put injection behavior into the layer US1 staged. Two handlers in the
plugin's `hooks.json`, both thin wrappers over the one Node hook entry:
`agy:session-start` turns conversation logging on and answers agy's
contract; `agy:pre-invocation` injects Mirror Mode context once per user
turn, on `invocationNum == 0`, and answers `{}` instantly otherwise. Both
mechanisms were measured live on DS12.TS3 (L1, L2); the hook contracts are
committed bytes in US1's `evidence/` (agy 1.4.2) — the nested
`systemMessage` shape, camelCase payloads, `sh -c` command handlers, 30 s
default timeout.

**Two decisions this plan names, both resolved by measurement, not taste:**

1. **Who carries the Operating Instructions.** US1 shipped them as
   `rules/AGENTS.md` (agy merges `rules/` into the active rule set) — if
   that reaches the model, SessionStart need not duplicate them and bar
   item 2 is met statically. The live route probes it with a marker; only
   if the rules do not reach does SessionStart deliver them as a
   `systemMessage` `injectStep`, the measured fallback. Both shapes are
   small; the probe chooses, and the choice is recorded in evidence.
2. **The injection step type.** `ephemeralMessage` (dropped after the
   turn) is the default, for two named reasons (amendment d): the adapter
   re-injects per turn, so a persistent `systemMessage` would accumulate
   per-turn context in the trajectory; and the injected content is
   identity and memory — ephemeral is the **data-minimizing** choice,
   since a `systemMessage` persists Mirror context in a third-party
   runtime's stored trajectory. The live route confirms the model treats
   the ephemeral step as context (DS12.TS3 proved injection reaches the
   model but not which step type); `systemMessage` is the fallback — and
   flipping to it is recorded in evidence as a **privacy decision**, not
   a mechanics change. (No new vendor exposure either way: Gemini CLI
   already injects per turn on the same vendor path.)

## Scope

**Hook entries — `ts/src/hooks/agy.ts`, dispatched from `main.ts`:**

- `agySessionStart(stdin)`: parse agy's camelCase payload
  (`conversationId`, `transcriptPath`, …), run
  `conversation-logger session-start` quietly (the posture every runtime's
  session-start shares), answer the output contract (`{}` or
  `injectSteps`, per decision 1). Never fails the turn; failures go to
  `hooks.log` (the hook posture `main.ts` already guarantees).
- `agyPreInvocation(stdin)`: `invocationNum != 0` → print `{}`, exit 0,
  touching nothing — this path runs dozens of times per turn and must stay
  cheap. At 0: per-turn injection the way Gemini's `BeforeAgent` does it —
  `mirror load --context-only --session-id <conversationId>` through the
  front door (agy payloads carry no prompt text, DS12.TS3 L7, so there is
  no `--query`; the explicit Mirror form reaches the model through the
  skill, as DS12.TS3 L4 showed, not through this hook) — and when the
  front door returns context, answer
  `{"injectSteps": [{<step type per decision 2>: <context>}]}`.
- The exact front-door plumbing (session binding, persona/journey
  carrying) settles in implementation against the existing `mirror load`
  surface; the contract above is what the tests pin.
- **Payload fields stay inert** (amendment b): `conversationId` flows only
  through array argv — never a shell — and `hooks.log` records facts,
  never payload text. A test pins that an id carrying shell
  metacharacters, spaces, or a newline cannot forge an argv element or a
  log line (the CR104 family, one level down).
- **The quiet session answers `{}`** (amendment f): a conversation with
  Mirror Mode inactive — or a `conversationId` no runtime session binds
  yet, which is every session until TS3 lands — gets no injection: the
  front door's nothing-owed-no-output is the mechanism, and one fixture
  pins both faces, so Mirror on agy is invisible until invoked, as it is
  everywhere else, and TS3's arrival changes nothing here.
- **A dedicated payload reader** (amendment g): agy speaks camelCase
  protojson, not `parseHookPayload`'s snake_case Claude-family. A small
  `agyPayload.ts` parser, with fixtures taken from the committed evidence
  bytes (US1's `evidence/agy-1.4.2-hook-contracts.txt`), never invented.

**Wrappers and generation:**

- **The `invocationNum` gate lives in the wrapper, as the default
  design** (amendment a): each handler invocation through a bin wrapper is
  a Node spawn, and `PreInvocation` fired 32 times over two turns
  (DS12.TS3 L2) — ~31 spawns per two turns just to print `{}`,
  serialized while blocking the agent loop. The wrapper reads stdin once
  and answers `{}` itself unless the payload matches its gate; Node is
  resolved only on the gated-through path. The Node-side gate stays as
  defense in depth; the residual cost is measured in the live route.
- `scripts/generate_hook_wrappers.sh` gains a first-class **`agy` form**
  (bin resolution plus the stdin gate as a per-wrapper variable, the way
  `HOOK` already varies) — never a hand-edited wrapper (CR071). Two rows:
  `plugins/mirror-mind/agy/session-start.sh` → `agy:session-start` (no
  gate), `plugins/mirror-mind/agy/pre-invocation.sh` →
  `agy:pre-invocation` (gate: `invocationNum` 0). The staged copy lives in
  agy's cache, so no relative path reaches a tree — the Claude plugin
  wrappers' situation. The directory is `agy/`, never `hooks/` (Claude's).
- `buildAgyHooks()` grows the two event arrays naming the wrapper
  commands (relative: agy sets the handler cwd to the hooks.json
  directory) with explicit `timeout` values — and the pre-invocation
  timeout is **small and justified** (amendment c): the fast path is
  shell-instant; the slow path is one `mirror load`; and the worst case
  is a hook that hangs the agent loop 32 times per turn, which a user
  reads as "Antigravity broke". Hangs are not failures: the never-fail
  posture covers exit codes, the timeout covers the rest.
- `hooks.test.ts`: a third form group (— the `agy` wrappers —) with its
  own within-form assertion normalizing `HOOK` and the gate variable; the
  covered-dirs list gains `plugins/mirror-mind/agy`; group counts are
  spelled per group, never a total baked into a describe name (the TS5
  lesson, applied on the way in).

**Guards and pack:**

- The plugin guard covers the grown `hooks.json` and the two wrappers
  (committed equals generated, via the existing contract).
- Wrappers ship under the allowed `plugins/mirror-mind/` prefix; no new
  `REQUIRED_FILES` entry (the layer's hooks.json already gates the layer).

**Docs:**

- Getting Started's Antigravity row: injection lands; logging still TS3's.

## Non-Goals

- Do not implement TS3: no `Stop` handler, no transcript reading, no
  `antigravity` labels, no session close.
- Do not implement US4's measurement or DS8.
- Do not change the Claude, Gemini, or Codex hook entries, wrappers, or
  behavior — the agy family is additive, and the suite proves it.
- Do not chase the cross-session write defect (DS12.TS2 L9): routed by
  DS2's Debt Review as a core defect outside CV21.

## Acceptance Behavior

```text
Given the staged layer on agy 1.4.2
When a session starts
Then the SessionStart handler runs, logging is on, and the output contract
  is answered
When the model is about to run with invocationNum != 0
Then the adapter answers {} without reaching the front door
When invocationNum == 0 and Mirror context is owed for the conversation
Then the adapter injects it as an injectSteps step, once for that turn
And the Operating Instructions reach the model by the measured carrier
And no handler can fail the turn; failures land in hooks.log
And the Claude, Gemini, and Codex hook paths are unchanged, proven by the
  full suite
```

## Validation Route

Automated:

- `node --test` — the agy handler units over payload fixtures (the gate at
  `invocationNum != 0`, the injection shape at 0, the output contracts,
  the never-fail posture), the grown generated files, the fourteen-wrapper
  guard, and the full suite proving the other runtimes untouched.
- `npx biome check .`

Navigator-visible route (extends the story's `route.sh`; evidence
committed):

- Observation 1: in a scratch workspace with the staged plugin on the
  installed agy, one scripted session (`agy --print`, falling back to a
  Navigator-run interactive session if print mode skips hooks or login) —
  pass: the session-start handler fired (its record in the scratch home)
  and the pre-invocation adapter fired at `invocationNum == 0` and stayed
  silent above it (capture evidence); fail: a handler did not fire, fired
  on every invocation, or failed the turn.
- Observation 2: the rules marker, attributably (amendment e):
  `rules/AGENTS.md` is generated from `AGENTS.md`, so a marker in the
  shipped bytes exists in both carriers and proves nothing. The route
  adds the marker to the **staged** rules file after staging, and the
  scratch workspace holds **no** `AGENTS.md` of its own; only then is the
  model's quote attributable — pass: bar 2's carrier is the rules file,
  recorded; fail: the fallback flips on and the SessionStart
  `systemMessage` carries the instructions instead, recorded as the
  privacy decision amendment d names.
- Observation 3: with Mirror Mode active for the conversation, the
  injected context reaches the model — the injected marker is unique,
  added post-staging, present nowhere else the model reads (amendment e)
  — pass: injection visible at the model; fail: the step type flips per
  decision 2, re-measured and recorded. The route also records the
  residual per-invocation cost of the gated wrapper (amendment a).

E2E decision: observation 1-3 are the E2E — the real agy, the staged
plugin, the real hooks. CI has no agy; the split is US1's, with the
handlers' logic fully unit-covered.

## Implementation Contract

- Use TDD or characterization tests for behavior changes when testable.
- Keep changes scoped to `CV21.DS7.TS2`.
- Do not use git add .; commit only story-scoped files.
- Follow the project's development guide: docs/process/development-guide.md.

## Stop Conditions

- scope_change_detected — anything reaching into TS3 (logging, Stop,
  close) or US4.
- plan_rule_conflict.
- failing_required_check_without_clear_fix.
- navigator_decision_needed — the live route shows neither rules nor
  SessionStart deliver the instructions, or neither step type reaches the
  model as context: bar 2 or 3 would then need a mechanism DS12.TS3 did
  not measure.

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
