[< Parent](../index.md)

# CV9.DS8.US5 — Pi through the one doorman, at L4

**Status:** ✅ Done — 2026-10-25
**Type:** User Story
**Delivery Story:** CV9.DS8 — One Doorman: Mirror's Context Before the Model on Every Runtime

---

## User Story

In order to have Mirror's context put before the model by the runtime on Pi — the
harness Getting Started recommends, and the one CR165 measured loading the folder once
and never again —
As a person using Mirror Mind on Pi,
I want the extension's `before_agent_start` to call the one doorman for every turn a
person starts and carry its answer into the turn as a message, awaiting only what the
doorman returns — so an explicit Mirror turn loads the folder once, a follow-up in
another domain re-routes its persona and signs it, an unprompted personal question
the model answers as the mirror is followed by doorman turns, and a Builder switch
ends them,
So that the mirror keeps its voice and its signature across a Pi conversation, Pi's
parity row moves to L4 on a live measurement, and a delta carries the memories the
question calls for, by a semantic threshold the attachments already obey.

## Outcome

- `.pi/extensions/mirror-logger.ts` names the session: at `session_start` it sets
  `MIRROR_SESSION_ID` to the session file (cleared at `session_shutdown`), as TS1's P2
  probe measured on Pi 1.4.0, so the model's own `mirror mirror load` on an unprompted
  question, and `mirror build load` on a mode switch, write to *this* session's row
  instead of a guessed one.
- On every run a user prompt starts, the extension runs `mirror doorman --prompt <the
  prompt> --session-id <session file>` through the bin beside it (the prompt truncated
  as the logger's payload is), awaits it, and returns the block as a `mirror-context`
  custom message when there is one — a user-role message after the prompt, opened by
  the delivered line that says the runtime, not the person, is speaking; nothing when
  the doorman answers nothing. The decision, the rendering, the session writes, the
  one embedding per delta turn, and the score log are the doorman's (TS2), reached
  through the front-door route it published for this caller. The doorman runs on the
  per-session chain ahead of the `user-prompt` logger, so the logger's upsert never
  overwrites the full load's session state.
- Outside Mirror Mode a turn costs one read-only process and no context (0.21 s
  measured on this tree while planning); the extension gates nothing itself, so the
  policy stays in one place.
- The ranker reports each memory's semantic score beside its hybrid score (the order
  unchanged); `doorman.ts` carries `DOORMAN_MEMORY_SEMANTIC_THRESHOLD = 0.4`, the rule
  `relevantAttachments` already applies to attachments, and a delta renders the
  memories at or above it (five at most), logging both scores for every turn. The
  composite score the 27 logged rows carry is a recency gate in disguise (a fresh,
  reinforced memory floors at 0.35 with no semantic match), which is why the
  threshold is on the cosine; the live walk's semantic rows confirm 0.4 or move it,
  recorded in the test guide.
- Measured live on the installed Pi (version, binary, date in the test guide) with
  CR165's route, in the checkout and from a cwd outside it: the explicit turn loads
  once and the model answers from the block, not about it; a follow-up in another
  domain re-routes and signs `◇ <persona>`; later turns still sign; a Builder switch
  ends the deltas on this session; an unprompted personal question is followed by
  doorman turns; `/new` starts clean and `/resume` is observed; the named-session
  commands still answer; the conversation log holds the prompts and replies once,
  and no block.
- CR008 option B, landed by this story the day its tripwire fired: a Builder stamp
  written under the session's name carries `named_session: true`, and a lifecycle
  command binds a journey from a named session only through such a stamp — a
  `build load` guessed onto this window's row by another window is the footer's
  business, not a journey.
- The parity matrix row for Pi reads **L4**, with the walk's version, binary, and
  date; the architecture's Runtime Model agrees, held by `runtimeParityDocs.test.ts`;
  the record names the harness test as Pi's automated proof (there is no
  `smoke_pi.sh`).
- Carried to Debt Review, not fixed: the blocks accumulate in the session file and
  replay on every request (dedupe-within-session), and a delta after compaction or
  `/resume` lands in a transcript whose folder is a summary — DS8 policy, first
  observable on Pi.
- Not in this story: Antigravity (TS6); the contract's injection section, its
  injection-models table, Getting Started, and REFERENCE (TS7); any change to the
  doorman's policy beyond the threshold, or to how the ranker orders; `mirror log` on
  Pi; the logger, welcome, status line, close, and backup paths of the extension.

## Acceptance Behavior

```text
Given the Pi extension at session_start with session file F
When the handler runs
Then process.env.MIRROR_SESSION_ID = F, and session_shutdown clears it

Given a run a user prompt started in session F
When before_agent_start runs
Then the extension spawns `mirror doorman --prompt <prompt> --session-id F` and
     awaits it; a non-empty answer is returned as a message
     { customType: "mirror-context", content: <block>, display: false }, an empty one
     as no message; the user-prompt logger is spawned only after the doorman exited

Given a run a custom message started, or a session without a file
When before_agent_start runs
Then no doorman is spawned

Given a delta turn whose ranked memories all have a semantic score under 0.4
When the doorman renders
Then the block carries no `=== relevant memories ===` section and every score, hybrid
     and semantic, still reaches the log

Given the installed Pi 1.4.0 with the tree linked, a fresh session,
  `/skill:mm-mirror <personal question>`
When the turn runs
Then the model answers as the mirror, signs ◇ <persona>, runs no
     `mirror mirror load` of its own, does not answer about the block, and the
     session file holds one mirror-context entry for the turn
And a follow-up in another persona's domain is signed with that persona
And two later turns are still signed
And after `/mm-build mirror` in the same session, an ordinary turn carries no mirror
    voice, no signature, no new llm_calls row, no mirror-context entry
And in a fresh session, an unprompted personal question answered through the skill
    leaves the Pi session mirror_active, and the next turn is a doorman turn
And /new starts a session whose first ordinary turn gets no block
And the named-session commands (/mm-journeys, /mm-build, /mm-explore, /mm-new, the
    status line) still answer
And the conversation log holds the prompts (form stripped) and replies once each and
    no block row
And the same holds from a cwd outside the tree
And the parity matrix reads Pi L4 with version, binary, and date
And unrelated Delivery Story scope remains untouched
```

## Scope

- `.pi/extensions/mirror-logger.ts`: `MIRROR_SESSION_ID` at `session_start`, cleared
  at `session_shutdown`; `deliverMirrorContext` on the chain, the returned message,
  the truncated prompt, in the `before_agent_start` prompt handler; the header
  comment.
- `ts/src/mode/operatingMode.ts`, `ts/src/builder/load.ts`,
  `ts/src/builder/commands.ts`: CR008 option B (found during implementation);
  `ts/test/builder/namedSessionPrecondition.test.ts` retired,
  `builder-load.golden.json` moved by one key.
- `ts/src/search/ranker.ts`: `semantic` reported on `RankedMemory`.
- `ts/src/mirror/doorman.ts`: `DOORMAN_MEMORY_SEMANTIC_THRESHOLD` applied in
  `runDelta`; the semantic scores logged beside the hybrid ones
  (`ts/src/frontDoor/cli.ts`, `mirrorModeRoute.ts`).
- Tests first: `ts/test/pi/mirrorLoggerExtension.test.ts` (the doorman spawn, its
  order against the logger, the returned message, the env variable set and cleared,
  the truncation, the skip cases, the failure case); `ts/test/search/ranker.test.ts`
  (the field); `ts/test/mirror/doorman.test.ts` (the threshold).
- `docs/product/specs/runtime-interface/index.md` (Pi's matrix row to L4; the L4
  paragraph's Pi exception), `docs/product/architecture.md` (the Runtime Model's Pi
  row and sentence), `docs/process/worklog.md` (one entry). The test guide carries
  the live measurement with version, binary, and date.

## Out Of Scope

- TS6, TS7; the ranker's order, the memory limit, the attachment threshold.
- A local gate in the extension that spares the per-turn read.
- Dedupe across a session's deltas; re-delivery after compaction or `/resume`.
- `mirror log` on Pi; the skill's text (TS3).
- Grok Build: its row stays L3 (CR143).

## Validation

Automated: the extension harness, ranker, and doorman tests red before and green
after; the parity-docs guard; `npm test`, `typecheck`, `lint`. Navigator: the live
walk on the installed Pi (`test-guide.md`), in the checkout and from outside it:
explicit turn, domain change, sticky voice, Builder switch, unprompted question,
`/new`, `/resume`, the named-session regression, each read against the transcript,
the session file, `runtime_sessions`, `llm_calls`, and the conversation log; the
threshold confirmed against the walk's semantic scores.
