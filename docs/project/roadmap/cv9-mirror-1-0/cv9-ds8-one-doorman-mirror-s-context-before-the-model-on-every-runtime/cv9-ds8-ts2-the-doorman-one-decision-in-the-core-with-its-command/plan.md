# Plan — CV9.DS8.TS2

## Objective

Build the one doorman as a module in the core: given a turn's prompt and the session's
state, decide *nothing*, *the full folder*, or *a delta* by DS8's policy; render the
answer under one "delivered for this turn" line the model reads every turn; write the
session's state by its own id, without touching the database on a turn that owes
nothing; expose the decision in-process (for the hooks) and as one front-door command
(for the Pi extension). No runtime is rewired here — US4, US5, and TS6 call what this
story ships. Tests first.

Reviewed before approval by five lenses (quartermaster, engineer, ai-engineer,
database-architect, prompt-engineer); their four gates and one "premature" are folded
in below and marked **(review)**.

## Scope

**1. The session is named from the harness** (TS1's first facts)

- One reader, `environmentSessionId(env)` in `#mirror/runtimeSession.ts`:
  `MIRROR_SESSION_ID`, else `CLAUDE_CODE_SESSION_ID`, else `CODEX_SESSION_ID`,
  trimmed, or null.
- Applied to the mirror load route (`mirrorModeRoute.ts`) and the doorman only — by
  choice, not oversight **(review)**: the other eight `env.MIRROR_SESSION_ID` reads
  (`soulRoute`, `exploreRoute`, `cli.ts` `mirror log`, `loggerRuntime`,
  `builder/commands`) would bind Builder, Soul, and Explorer sessions on Claude Code
  and Codex to an undocumented variable, a CR008 binding question this story does not
  open. A later story widens the reader if a session there ever needs it.
- `writeMirrorState` in `orchestration.ts` receives the *named* session
  (`resolveNamedRuntimeSessionId(explicit, environment)`), never a guess, so the
  skill's own `mirror mirror load` marks the session it runs in. Today it takes the
  explicit option alone (TS1's measured gap).

**2. The decision** — `ts/src/mirror/doorman.ts`

- `decideDoorman({ prompt, state, personas })` is pure: no DB, no clock, no provider.
  - `mirrorForm(prompt)` matches → `{ kind: "full", query }`.
  - else `state.active` → `detectPersona(prompt, personas)`; top match `Q` with
    `Q !== state.persona` → `{ kind: "delta", query: prompt, persona: Q }`; otherwise
    `{ kind: "delta", query: prompt, persona: null }` (the session's persona stands).
  - else → `{ kind: "nothing" }`.
- `state` is the session row's `mirrorActive`, `persona`, `journey` (what
  `readMirrorState` already returns). An unnamed session reads as inactive: only the
  explicit form can start Mirror Mode without a session id, as the hook does today.
- The doorman reads `hook_injected` nowhere. It still writes it after a full load so
  the legacy inject hook (case 2) owes nothing until US4 rewires it; US4 retires the
  field's last reader and this write with it — a named debt, not a leftover
  **(review)**.

**3. Read before write** **(review)**

- The state read opens the database read-only (`readMirrorState`'s path). The
  live-write path — `openLiveWriteDatabase`, a `VACUUM INTO` snapshot per writer,
  95 ms measured on a 53 MB database — opens only for a `full` or `delta` decision.
  A `nothing` turn never opens a writable handle: today's inject hook already works
  this way ("the ordinary turn returns above without opening a writable handle at
  all"), and the command keeps it. So `mirror mirror doorman` is not routed through
  `withMirrorWriteDb` as `load` is; it reads first and opens the write path itself.

**4. The rendering and the writes** — `runDoorman(db, input)`

- **The delivered line**, first in every block, on every turn Mirror Mode is active
  **(review)** — the model reads it even when nothing follows, because it is what
  carries the persona across the conversation (DS8's outcome: the signature survives
  the first reply; CR165 measured that it does not today). Two forms, one stable
  prefix for TS3's skill to read:

  ```text
  === mirror context delivered by the runtime for this turn: full — answer as the mirror; sign ◇ <persona> ===
  === mirror context delivered by the runtime for this turn: delta (persona: <persona> · journey: <journey>) — answer as the mirror; sign ◇ <persona> ===
  ```

  `<persona>` is the session's persona *after* the decision, newly routed or not,
  so the line means one thing. With no persona the clause reads `answer as the
  mirror` and no signature is asked — AGENTS.md's rule: the ego alone signs nothing.
  The clause rides in TS2 because on an ordinary turn the skill is not invoked and
  this line is the only Mirror text that reaches the model; TS3's guard test covers
  this line alongside the banner and the skill's copies.
- `full`: `runMirrorLoad` with `contextOnly: true`, the query, the named session id
  — the same folder `mirror mirror load --context-only --query` prints today, with
  the transition surface, under the delivered line. The explicit turn keeps
  reception's LLM call as `mirror load --query` has it (`MEMORY_RECEPTION != 0`):
  "no model call in the doorman" is true of the delta, not of the explicit load
  **(review)**. Then `hook_injected = 1` on the named session.
- `delta`, in this order:
  1. the delivered line;
  2. `=== persona/<Q> ===` with Q's identity content, only when the decision names a
     new persona; then `persona = Q` on the session row;
  3. one query embedding, through `generateEmbeddingSafely` with the ledger sink
     (`llm_calls`, as the search ledger records it), shared by the two searches below
     — decision 1 of DS8: one embedding per turn, counted. To share it,
     `searchMemoriesWithStatus` and `relevantAttachments` accept an optional
     precomputed `queryEmbedding`; absent, they embed as today;
  4. `=== relevant memories ===`: `searchMemoriesWithStatus`, `limit 5`, **no score
     threshold** and **`logAccess: false`** **(review)**. The threshold DS8 names is
     set from measurement, not invented: each turn's five scores go to the front-door
     log so US5's live walk (CR165's route) produces the number. `logAccess` stays off
     because the doorman searches on the system's behalf N times a session; a turn's
     injection must not raise the memory's reinforcement for the next turn (AI-12, the
     ranker learning from its own exhaust). Reinforcement stays with the explicit load;
  5. `=== relevant attachments ===`: `relevantAttachments` for the session's journey
     (score > 0.4, as the folder's own attachments already are).
  Nothing else is repeated: no soul, ego, user, knowledge, journey, or shadow section.
  Without an embedding provider the memory search degrades to FTS as it does today;
  attachments are skipped rather than thrown; the delta still carries the line and
  the persona.
- `nothing`: empty output, no provider call, no write, no writable handle.
- **Session writes are targeted** **(review)**: `persona` and `hook_injected` go
  through single-column `UPDATE runtime_sessions SET <col> = ?, updated_at = ? WHERE
  session_id = ?`, not `upsertRuntimeSession`, whose read-rebuild-write of the whole
  row loses updates against the prompt logger writing `conversation_id`/`active` on
  the same turn (Pi fires the logger unawaited; Claude Code's hooks run concurrently —
  F21 fixed their snapshot collision, not this row).

**5. The command** — `mirror mirror doorman --prompt "<text>" [--session-id <id>]`

- A mirror write surface (`isMirrorWrite` names it so the front-door log and guards
  treat it as one), with its own read-then-write handle discipline (§3). Session id
  from `--session-id`, else the environment reader. Prints the block or nothing;
  exit 0. `--prompt` missing → exit 2 with one stderr line. Providers resolved as
  `load --query` resolves them (`resolveFamilyProviders`, `MIRROR_QUERY_TRANSPORT`),
  only once the decision needs them.
- `REFERENCE.md` gains the command's entry and the per-turn cost table below; the
  contract and matrix wait for TS7.

**What a Mirror Mode turn costs** (for REFERENCE and TS7) **(review)**

| Turn | Doorman | Model calls | Ledger |
|------|---------|-------------|--------|
| Mirror Mode off, ordinary | nothing | none | — |
| explicit form | full folder | reception (LLM, when enabled) + attachment embedding; the skill's own load on top until TS3 | `llm_calls` rows as `mirror load` writes them today |
| Mirror Mode on, ordinary | delta | one embedding | one `llm_calls` row |

**6. Tests first**

- `ts/test/mirror/doorman.test.ts`: the decision table (off, explicit, active+new
  persona, active+same persona, active+no persona, unnamed session); the rendered
  full block and its delivered line; the rendered delta (sections present and
  absent; the line present with nothing under it; the clause with and without a
  persona); the session writes (`mirror_active`, `hook_injected`, `persona`) and that
  a `nothing` turn opens no writable handle (no snapshot file appears); the
  `llm_calls` row for the per-turn embedding (one row, not two); `memory_access_log`
  unchanged after a delta; degraded provider.
- `ts/test/mirror/orchestration.test.ts`: `writeMirrorState` with the environment id.
- `ts/test/search/memorySearch.test.ts` and `ts/test/mirror/context.test.ts`: the
  precomputed `queryEmbedding` is used and no embedding is generated when given.
- `ts/test/frontDoor/mirrorModeCli.test.ts`: `mirror mirror doorman` routing, exit codes,
  `--prompt` missing.
- Existing mirror, hooks, and front-door suites stay green; the inject hook's
  behavior is unchanged until US4.

## Non-Goals

- Do not implement sibling roadmap item: The skill trusts delivered context, and one signature rule (TS3) — TS2 emits the line; TS3 teaches the skill to read it and guards the rule.
- Do not implement sibling roadmap item: Claude Code and Codex through the one doorman (US4) — the inject hook keeps today's two cases.
- Do not implement sibling roadmap item: Pi through the one doorman, at L4 (US5) — the extension's `before_agent_start` is not touched; the memory threshold is set from its walk.
- Do not implement sibling roadmap item: Antigravity through the one doorman (TS6).
- Do not implement sibling roadmap item: Written where a user reads it (TS7) — only `REFERENCE.md`'s command entry and cost table here.
- No change to what the full folder contains, how personas are scored, or how memories are ranked (DS8 non-goals).
- No model call in the delta; the one network call is the embedding.
- No guess of "the session": the doorman writes only to a session it was named.
- No widening of the environment reader beyond the mirror load route and the doorman.

## Acceptance Behavior

```text
Given a session row with Mirror Mode off
When `mirror mirror doorman --prompt "how do I split this module" --session-id S` runs
Then stdout is empty, llm_calls gains no row, runtime_sessions S is unchanged,
     and no live-write snapshot was taken

Given any session (named S, or unnamed)
When `mirror mirror doorman --prompt "/mm-mirror should I take the course offer?"` runs
Then stdout opens with "=== mirror context delivered by the runtime for this turn: full — answer as the mirror; sign ◇ <routed persona> ==="
     followed by the Mirror Mode transition surface and the folder for the query
And, when named, runtime_sessions S has mirror_active = 1 and hook_injected = 1

Given runtime_sessions S with mirror_active = 1, persona "cfo", journey "mirror"
When `mirror mirror doorman --prompt "<a prompt scoring persona writer>" --session-id S` runs
Then stdout opens with "...: delta (persona: writer · journey: mirror) — answer as the mirror; sign ◇ writer ===",
     carries "=== persona/writer ===", then up to five memories and the attachments
     above 0.4, and no self/soul, ego, user, knowledge, or journey section
And runtime_sessions S has persona = "writer", written by a targeted UPDATE
And llm_calls gains exactly one embedding row for the turn
And memory_access_log gains no row

Given the same S and a prompt that scores "cfo" again, or no persona
When the doorman runs
Then stdout opens with "...: delta (persona: cfo · journey: mirror) — answer as the mirror; sign ◇ cfo ===",
     carries no persona section, and S's persona stays "cfo"

Given S active with no persona and a prompt scoring none, no memory, no attachment
When the doorman runs
Then stdout is exactly the delivered line "...: delta (persona: none · journey: mirror) — answer as the mirror ==="

Given MIRROR_SESSION_ID unset and CLAUDE_CODE_SESSION_ID = C
When `mirror mirror load --query "..."` runs with no --session-id
Then runtime_sessions C has mirror_active = 1
```

## Validation Route

- **Automated:** `cd ts && npm test -- doorman orchestration memorySearch context mirrorModeCli hooks`
  then the full suite; `npm run check` (types, lint). Pass: every test green, the
  doorman file covered by the decision table, the no-snapshot assertion, and the
  ledger assertion. Fail: any red test, or a doorman test that passes without
  exercising `llm_calls`.
- **Navigator, scratch home** (a copy of the dev database, `MIRROR_HOME` pointed at
  it, a scratch session id `S`):
  1. `mirror mirror doorman --prompt "quais os próximos passos do projeto" --session-id S`
     → expected: nothing printed; no `S` row or an unchanged one; no new snapshot
     under the live-write staging directory. Fail: any block, a new row, a snapshot.
  2. `mirror mirror doorman --prompt "/mm-mirror como lido com a ansiedade antes de um lançamento" --session-id S`
     → expected: the delivered line `full` with `sign ◇ <persona>`, the transition
     surface, the folder with a routed persona; `S` reads `mirror_active = 1,
     hook_injected = 1`. Fail: no delivered line, or `S` not active.
  3. `mirror mirror doorman --prompt "<a prompt in another persona's domain>" --session-id S`
     → expected: the delivered line `delta` naming the new persona, that persona's
     section, memories, attachments, no identity layers; `S.persona` is the new
     persona; `llm_calls` gained one embedding row; `memory_access_log` gained none; the
     front-door log carries the five memory scores. Fail: an identity layer
     repeated, two embedding rows, access rows, or the persona unchanged.
  4. Repeat 3 with a prompt in the same domain → expected: the delivered line with
     the same persona, no persona section.
  5. `CLAUDE_CODE_SESSION_ID=C mirror mirror load --query "..."` with
     `MIRROR_SESSION_ID` unset → expected: `runtime_sessions C` has `mirror_active = 1`.
- **E2E decision:** fixture-level and command-level here; the live runtime walks
  belong to US4, US5, and TS6, which this story exists to make possible.

## Implementation Contract

- TDD: the doorman test file is written before `doorman.ts`; each policy case is a
  failing test first.
- Keep changes scoped to `CV9.DS8.TS2`: `doorman.ts`, `orchestration.ts`
  (`writeMirrorState`), `runtimeSession.ts` (the reader, the targeted updates),
  `mirrorModeRoute.ts` and `cli.ts` (the command and its handle discipline),
  `memorySearch.ts` and `context.ts` (the optional precomputed embedding), their
  tests, `REFERENCE.md`.
- Do not use git add .; commit only story-scoped files.
- Follow the project's development guide: docs/process/development-guide.md.

## Stop Conditions

- scope_change_detected — a hook or the extension turns out to need rewiring to test
  the doorman at all.
- plan_rule_conflict — sharing one embedding across the two searches needs more than
  an optional parameter in each; or the read-then-write handle cannot be expressed
  inside the front door's live-write contract without a new seam.
- failing_required_check_without_clear_fix.
- navigator_decision_needed — the command's name or the delivered line's wording, if
  the Navigator wants them otherwise.

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
