[< Parent](../index.md)

# CV9.DS8.TS2 — The doorman: one decision in the core, with its command

**Status:** ✅ Done — 2026-10-24
**Type:** Technical Story
**Delivery Story:** CV9.DS8 — One Doorman: Mirror's Context Before the Model on Every Runtime

---

## Technical Story

In order to put Mirror's context before the model with one policy on every runtime,
As the engineering team,
I want one module in the core, `ts/src/mirror/doorman.ts`, that takes the turn's
prompt and the session's state and answers *nothing*, *the full folder*, or *a delta*
by DS8's policy — renders what it answers with one line that says the runtime
delivered it, writes the session's state by its own id, and is reachable in-process
by the hooks and as one front-door command by the Pi extension,
So that US4, US5, and TS6 wire their runtime to a decision that already exists and is
tested, instead of each carrying a policy of its own.

## Outcome

- `ts/src/mirror/doorman.ts` holds the decision and its rendering:
  - **explicit Mirror form** in the prompt → the full folder, routed from the query,
    through the same load `mirror mirror load --context-only` runs; the session is
    marked `mirror_active` by its own id and `hook_injected` once the block exists;
  - **Mirror Mode active, ordinary turn** → the prompt is scored with `detectPersona`;
    a persona that newly scores above threshold has its section rendered and becomes
    the session's persona; the five memories ranked for the prompt and the
    attachments above 0.4 are rendered; the identity layers are not repeated; one
    embedding per turn, counted in `llm_calls`; no reinforcement written (the
    doorman searches on the system's behalf); the memory scores go to the front-door
    log so US5's live walk sets the threshold DS8 names;
  - **Mirror Mode not active** → nothing: no provider call, no write, no writable
    handle opened (no live-write snapshot on a quiet turn).
- Every turn Mirror Mode is active opens with one line the model reads, even when
  nothing follows it — it is what carries the persona across the conversation:
  `=== mirror context delivered by the runtime for this turn: full — answer as the mirror; sign ◇ <persona> ===`
  or `...: delta (persona: <persona> · journey: <journey>) — answer as the mirror; sign ◇ <persona> ===`,
  `<persona>` the session's persona after the decision; without one, the clause
  reads `answer as the mirror` and asks no signature.
- The doorman's session writes (`persona`, `hook_injected`) are targeted
  single-column updates, safe beside the prompt logger writing the same row on the
  same turn.
- The session is named from the harness: `--session-id`, else `MIRROR_SESSION_ID`,
  else `CLAUDE_CODE_SESSION_ID`, else `CODEX_SESSION_ID` — one reader, used by the
  doorman and by `mirror mirror load`, so `writeMirrorState` marks the session the
  skill's own load runs in (TS1's gap).
- One front-door command, `mirror mirror doorman --prompt "<text>" [--session-id <id>]`,
  prints the block or nothing and exits 0; the hooks and the extension can call the
  same decision in-process through the exported `runDoorman`.
- No hook or extension is rewired in this story (US4, US5, TS6).

## Acceptance Behavior

```text
Given a session row with Mirror Mode off
When the doorman is called with an ordinary prompt
Then it prints nothing, calls no provider, writes nothing, and opens no writable handle

Given any session, named or not
When the doorman is called with a prompt that opens with the explicit Mirror form
Then it prints the full folder for the query that follows the form,
     opened by the "delivered ... full" line,
And the session row is mirror_active with hook_injected = 1, by the id it was named

Given a session row with Mirror Mode on, persona P, journey J
When the doorman is called with an ordinary prompt that scores persona Q above threshold
Then it prints the delta: the delivered line naming Q, Q's persona section, up to
     five memories and the attachments above 0.4 for the prompt — and no identity layer
And the session's persona is now Q
And llm_calls holds one embedding row for the turn, and memory_access_log none

Given the same session and a prompt that scores no new persona (or P again)
When the doorman is called
Then the delta opens with the delivered line naming P, carries no persona section,
     and the session's persona stays P

Given the same session and a prompt with no new persona, no memory, no attachment
When the doorman is called
Then it prints the delivered line alone

Given MIRROR_SESSION_ID unset and CLAUDE_CODE_SESSION_ID (or CODEX_SESSION_ID) set
When `mirror mirror load --query "..."` runs with no --session-id
Then runtime_sessions holds that id with mirror_active = 1
```

## Scope

- `ts/src/mirror/doorman.ts`: decision, rendering, state write, in-process entry.
- The environment session reader (mirror load route and doorman only) and
  `writeMirrorState` honoring the named session.
- The `mirror mirror doorman` front-door command, reading before it writes.
- An optional precomputed query embedding in the memory and attachment searches, so
  the delta embeds once.
- Tests first: decision table, rendered blocks, state writes, the ledger row, the
  quiet turn's untouched database.
- `REFERENCE.md`: the command's entry and what a Mirror Mode turn costs.

## Out Of Scope

- The `mm-mirror` skill's constraint and the signature rule (TS3).
- Rewiring the Claude-family hook (US4), the Pi extension (US5), Antigravity (TS6).
- What the full folder contains, how personas are scored, how memories are ranked.
- A model call in the delta; the explicit turn keeps reception's call as `mirror load`
  has it.
- The memory threshold's value (US5 measures it) and widening the environment reader
  to Builder, Soul, or Explorer routes.

## Validation

Automated: the doorman's test file and the existing mirror, search, hooks, and
front-door suites green. Navigator: four `mirror mirror doorman` calls against a scratch home
— off, explicit, another domain, same domain — plus one `mirror mirror load` under
`CLAUDE_CODE_SESSION_ID`, read against the expected block, session row, ledger, and
snapshot directory (`test-guide.md`).
