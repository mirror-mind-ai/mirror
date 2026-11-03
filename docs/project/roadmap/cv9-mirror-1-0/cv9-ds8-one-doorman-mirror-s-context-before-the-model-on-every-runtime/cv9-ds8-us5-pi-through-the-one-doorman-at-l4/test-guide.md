[< Story](index.md)

# Test Guide — CV9.DS8.US5

## Automated Validation

- `ts/test/pi/mirrorLoggerExtension.test.ts` (the fake-`pi` harness, with a `fire`
  variant that returns handler results; written first, red on the current extension,
  which spawns no doorman and sets no variable):
  - `session_start` with session file `F` sets `process.env.MIRROR_SESSION_ID = F`; a
    second `session_start` with `F'` re-sets it; `session_shutdown` clears it;
  - a user prompt in `F` spawns `mirror doorman --prompt <typed text> --session-id F`
    first; the `conversation-logger user-prompt` link is not spawned until the doorman
    exec has settled;
  - the doorman resolving with a block makes the handler's result
    `{ message: { customType: "mirror-context", content: <block>, display: false } }`;
  - resolving with empty stdout: the result carries no message;
  - the exec rejecting: no message, the turn goes on, a line in `mirror-logger.log`
    (a characterization of `runMirror`'s existing swallow);
  - `messageType: "custom"`, or no session file: no doorman spawned;
  - a prompt over 50 KB reaches the doorman truncated, its opening intact;
  - a `/skill:mm-mirror …` prompt with no typed text kept: the doorman receives the
    command read back from the wrapper (CR160), not the expanded body.
  Assertion messages carry no prompt.
- `ts/test/search/ranker.test.ts`: `rankMemories` reports `semantic` (the cosine of
  the query and the memory) on every result; the order is unchanged.
- `ts/test/mirror/doorman.test.ts`: a delta whose five ranked memories all have a
  semantic score under `DOORMAN_MEMORY_SEMANTIC_THRESHOLD` (0.4) renders no
  `=== relevant memories ===` block and hands all five hybrid and semantic scores to
  the log; at and above it (the boundary included), the block is rendered (red before:
  five memories regardless of score).
- `ts/test/scripts/runtimeParityDocs.test.ts`: green with Pi at L4 in both the matrix
  and the architecture's Runtime Model.
- Existing suites green: `cd ts && npm test`, `npm run typecheck`, `npm run lint`,
  `git diff --check`; `checkSkillCommandParity`, `checkPackContents`,
  `checkDocLinks`, `checkRetiredSurfaces`; the `.pi` extension typechecks against the
  pinned Pi types.

## E2E Decision

Required and live: the story's outcome is a measurement on the installed Pi. Record
`pi --version`, `which pi`, the date, and the home's database size. There is no
`smoke_pi.sh`; the harness test above is Pi's automated proof, and the matrix record
says so.

## Navigator Validation

**Preconditions** (US4's first walk learned them; checked at planning, 2026-10-25):

- `/opt/homebrew/bin/mirror` → this tree (`readlink`: `npm link`, in place);
- the installed Pi's `mirror-mind` package is the link
  (`~/.pi/agent/settings.json` → `/opt/homebrew/lib/node_modules/mirror-mind` → the
  tree), so the installed Pi runs this extension; in the checkout it is reached twice
  and the guard keeps one: `mirror-logger.log` says `second registration skipped`;
- one `.env` on both sides: the extension's processes and the model's `mirror` resolve
  the same home (`vinicius-dev`).

On Pi the Mirror skill is `/skill:mm-mirror`, picked from the menu as `/mm-` is typed
(CR159); the rows below spell what is typed.

Between turns, read the home's database and the session file:

```bash
DB=~/.mirror-minds/vinicius-dev/memory.db
sqlite3 "$DB" "select session_id, mirror_active, persona, journey, json_extract(metadata,'$.operating_mode.mode') as mode from runtime_sessions order by updated_at desc limit 3"
sqlite3 "$DB" "select role, model, session_id, created_at from llm_calls order by created_at desc limit 3"
sqlite3 "$DB" "select role, substr(content,1,60) from messages order by created_at desc limit 6"
grep -c '"customType":"mirror-context"' <session file>
grep 'doorman memory_' ~/.mirror-minds/vinicius-dev/front-door.log | tail -3
```

(If the `metadata` JSON key differs, `select metadata from runtime_sessions where
session_id = '<file>'` and read the mode from it.)

**In the checkout** first (rows 1–10), then **rows 1–2 and 6–7 again from a temp dir**
(row 11): the install's situation, where the project's `.pi/extensions` and `AGENTS.md`
are not in play.

| # | Step | Expected observation | Pass | Fail |
|---|------|----------------------|------|------|
| 1 | fresh session, `/skill:mm-mirror como lido com a ansiedade antes de um lançamento` | the reply is the mirror's, in first person, signed `◇ <persona>`, answering the question and not *about* the block (no "you've pasted…", no quoting of the delivered line); the turn shows **no** `mirror mirror load` tool call; the session file holds one `mirror-context` entry opening with the delivered line (`full`) | signed; no load call; not about the block; the row keyed by the session file path reads `mirror_active = 1`, persona set, mode Mirror Mode — re-read a second later, not reverted; one entry | the model runs `mirror mirror load`; no signature; the reply discusses or quotes the block; row not active or reverted; no entry or two |
| 2 | same session, another persona's domain (`como organizo meu budget para o próximo trimestre?` → cfo; confirm with `mirror detect-persona`) | signed `◇ cfo`, answering in that lens | the row's `persona` moved; `llm_calls` +1 embedding; a new `mirror-context` entry whose first line names cfo; `memory_semantic=` logged | signature unchanged or absent; persona unchanged; no ledger row; no entry |
| 3 | same session, a same-domain question | signed `◇ cfo`; no re-routing | `persona` unchanged; `llm_calls` +1; the entry's line names cfo, no `=== persona/cfo ===` section | persona flips |
| 4 | same session, two more ordinary turns, any topic | each reply still signed | signed on both; +1 embedding each | a turn without the signature |
| 5 | same session, `/skill:mm-build mirror`, then `what tests cover the hooks?` | the Builder transition, then a Builder answer: no mirror voice, no signature | `llm_calls` unchanged on the Builder prompt; no new `mirror-context` entry; the session row's mode is Builder Mode (this session's row, not another) | the reply signs or speaks as the mirror; a new embedding; the mode stamped on another row |
| 6 | fresh session (`/new`), an unprompted personal question with no form (`tenho sentido que estou me dispersando demais`) | the model routes to Mirror Mode itself, invokes the skill, `mirror mirror load` runs **once**; the reply signed | the row keyed by the new session file reads `mirror_active = 1` (TS1 P2, live: the load named it from `MIRROR_SESSION_ID`); the previous session's row closed | the row is not active after the load; the old session's row written instead |
| 7 | the next prompt in that session, another domain | row 2's observations: signed with the new persona, no skill load, a `mirror-context` entry | `persona` moved; `llm_calls` +1; no `mirror mirror load` call | the model loads again; no delta |
| 8 | `/new`, then an ordinary non-Mirror prompt (`what time is it in Lisbon?`) | an ordinary answer, no mirror voice | no `mirror-context` entry; `llm_calls` unchanged; the new row not active | a block or a delta on a fresh session |
| 9 | `/resume` the session from rows 1–5 (still `mirror_active`, mode Builder) or, better, a session left in Mirror Mode; one ordinary prompt | **observed, not judged:** whether the first turn gets a delta, and whether the reply reads as the mirror with the folder absent or summarized (the ai-engineer's compaction point) | what happened is written here | — |
| 10 | with the session named: `/skill:mm-journeys`, `/skill:mm-build mirror`, `/skill:mm-explore mirror` then `/skill:mm-explore deactivate`, `/skill:mm-new`; the status line after each | each answers as before; the status line shows the session's mode | no error, no doubled or missing log row; whether the model ran `mirror log` on its own in any row above is recorded; `messages` holds each prompt (form stripped) and each reply under `pi` once, and **no** row holding the block | a command failing on the named session; a doubled reply; the block logged |
| 11 | from a temp dir (`cd $(mktemp -d) && pi`): rows 1–2 and 6–7 | the same observations; `mirror-logger.log` shows one registration (no "second registration skipped" line, the package alone) | same pass conditions | a difference from the checkout, recorded |

**Beside the rows, by the Driver on the CLI** against a copy of the home, with the
walk's prompts: `time mirror mirror doorman --prompt <ordinary> --session-id <unknown>`
(the `nothing` cost every Builder turn pays), `time` on a delta; delta bytes and the
memories kept per turn with their semantic scores; the bytes injected over the
eleven-turn session (the sum of the `mirror-context` entries); the walk's
`doorman memory_semantic=` rows from `front-door.log` read against 0.4 — the threshold
confirmed, or moved to the value the rows support, and written here.

## Validation Evidence

**Driver's run, 2026-10-25** (Mirror at this story's working tree; the Navigator's live
walk on the installed Pi is pending):

- Automated: `mirrorLoggerExtension.test.ts` red on the old extension (no doorman, no
  message, no variable), green after — 27 cases; `ranker.test.ts` red before the
  `semantic` field, green after; `doorman.test.ts` red before the threshold, green
  after (the boundary case at exactly 0.4 included); `runtimeParityDocs.test.ts` green
  with Pi at L4 in the matrix and the architecture. CR008's tripwire fired as designed
  and option B landed (plan, Found During Implementation 1): `operatingMode.test.ts`,
  `commands.test.ts` (the guessed-stamp refusal across every leaf), `buildCli.test.ts`;
  `builder-load.golden.json` moved by one key on its ten named rows. `npm test` 3508
  tests, 3505 pass, 3 skipped (pre-existing), 0 fail; `typecheck` clean; `lint` one
  pre-existing warning; `git diff --check` clean; `checkSkillCommandParity`,
  `checkPackContents`, `checkDocLinks`, `checkRetiredSurfaces` clean. The `.pi`
  typecheck has three pre-existing errors in the AGENTS.md handler, none new.
- CLI measurements on a copy of `vinicius-dev` (61 MB) under a scratch `MIRROR_HOME`,
  one session, the explicit turn first:

  | turn | prompt | bytes | wall | kept | `memory_semantic=` (top 5) |
  |------|--------|-------|------|------|-----------------------------|
  | nothing (unknown session) | `what tests cover the hooks?` | 0 | **0.21 s** ×3 | — | — |
  | full | `/skill:mm-mirror como lido com a ansiedade antes de um lançamento` | 33,402 | 1.33 s | — | reception; persona therapist |
  | delta | `quanto devo cobrar pela consultoria?` | 154 | 1.02 s | 0 | 0.357, 0.179, 0.073, 0.087, 0.276 |
  | delta | `e se eu cobrar por hora em vez de pacote?` | 154 | 1.01 s | 0 | 0.184, 0.166, 0.310, 0.097, 0.074 |
  | delta | `como organizo meu budget para o próximo trimestre?` → cfo | 6,869 | 0.98 s | 2 | 0.403, 0.398, **0.428**, 0.384, 0.373 |
  | delta | `como escolho a cor da capa do livro?` | 142 | 1.02 s | 0 | 0.156, 0.142, 0.139, 0.125, 0.109 |
  | delta | `como lido com a ansiedade antes de um lançamento` | 142 | ~1 s | 0 | 0.275, 0.231, 0.299, 0.242, 0.208 |
  | delta | `tenho sentido que estou me dispersando demais` | 142 | ~1 s | 0 | 0.169, 0.259, 0.168, 0.174, 0.201 |
  | delta | `como devo estruturar o próximo capítulo do livro sobre XP?` | 142 | ~1 s | 0 | 0.298, 0.228, 0.225, 0.274, 0.260 |
  | delta | `what tests cover the hooks?` | 8,512 | ~1 s | 3 | **0.555**, 0.423, 0.392, 0.378, 0.439 |
  | delta | `qual o melhor jeito de precificar o curso Uncle Vinny?` | 7,994 | ~1 s | 1 | 0.408, 0.346, 0.359, 0.265, 0.354 |

  What the semantic rows say in this home: prompts with no memory about them sit at
  0.07–0.36 (the five "nearest" were the generic ones US4 saw repeat); prompts the
  home holds memories about reach 0.40–0.56 (the hooks' tests, Uncle Vinny's price,
  the budget). **0.4 holds as the Driver reads it**: every delta that carried a memory
  carried one about the prompt, and the empty deltas (142–154 bytes: the line alone)
  cost nothing but the embedding. The one borderline is the cfo budget prompt, whose
  five sit at 0.373–0.428 and two pass; 0.35 would keep all five and admit the
  pricing prompt's 0.357 too. The Navigator reads the walk's rows against both. A
  delta before the threshold was 2.5–8.5 KB every turn (US4); with it, 142 bytes when
  nothing is relevant.
- Latency: a `nothing` turn 0.21 s (the per-turn cost of every non-Mirror turn on
  Pi); a delta ~1.0 s; the full turn 1.33 s with reception — under `pi.exec`'s 30 s
  cap, the embedding (15 s) and reception (10 s) timeouts unchanged from US4.

- **Navigator walk 1, 2026-10-25** (Pi 1.4.0, `~/.pi/agent/bin/pi`, the tree linked on
  both sides, home 61 MB): **in the checkout, the extension had no handlers** — no
  welcome, no session row, no doorman, the model loaded itself on every turn (the
  `mirror-logger.log` showed only `second registration skipped`); from `/tmp`, rows 1–2
  and 6–7 passed (28,400 and 6,828 chars delivered, no load call, `◇ therapist` then
  `◇ cfo`). Two defects found and fixed (plan, Found During Implementation 4 and 5):
  the process-scoped registration guard against Pi 1.4.0's own dedupe, and the first
  prompt's logger erasing the doorman's persona and journey. Re-walked below.
- **Navigator walk 2, 2026-10-25, after the fixes** — Pi 1.4.0, the checkout
  (`~/dev/workspace/mirror-dev`), `claude-sonnet-5-5`, embeddings read between turns:

  | # | Prompt | Observed | Verdict |
  |---|--------|----------|---------|
  | A0 | startup | `session_start fired`, `welcome: ◇ Mirror · vinicius-dev` in the log (the card is a notify, not in the pasted transcript) | pass |
  | 1 | `/skill:mm-mirror como lido com a ansiedade…` | `◇ therapist`, **no** `mirror mirror load` call; 28,400 chars delivered; embeddings 712 → 712 (reception, no embedding on the full turn) | pass |
  | 2 | `qual seria o primeiro passo?` | `◇ therapist` — the persona held through a no-score turn (the logger fix); 370 chars; 713 | pass |
  | 3 | `como organizo meu budget…` | `◇ cfo`, no load; 6,828 chars; 714 | pass |
  | 4 | `e como separo reserva de emergência…` | `◇ cfo`; 134 chars (the line alone); 715 | pass |
  | 5 | `e depois disso?` | `◇ cfo`; 134 chars; 716 | pass |
  | 6 | `/skill:mm-build mirror`, then `what tests cover the hooks?` | Builder surface, then a plain answer, no signature; 719 after `build load` (its own two embeddings plus the switch turn's delta), **719 unchanged** on the Builder prompt, no block | pass |
  | 7 | `/new`; `tenho sentido que estou me dispersando demais` | the model invoked the skill itself, `mirror mirror load` **once** (15.3 s), `◇ therapist`; no block (719) | pass |
  | 8 | `como organizo meu budget…` | `◇ cfo`, **no** load call; 6,828 chars; 720 — TS1's P2 live: the model's load named the Pi session | pass |
  | 9 | `/new`; `what time is it in Lisbon?` | ordinary answer; no block; 720 | pass |
  | 10 | `/resume` session B; `e o que mais?` | `◇ cfo`, no load call; a 134-char delta (the line alone); 721. Observed: a resumed Mirror-active session gets deltas on a transcript Pi restored whole — no compaction had happened, so the folder was still there | observed |
  | — | `/skill:mm-journeys`, `/skill:mm-build mirror`, `/skill:mm-explore mirror`, `/skill:mm-explore deactivate`, `/skill:mm-new` | each answered as before; `messages` holding the block: **0**; `mirror log` never called by the model | pass |
  | 11 | from `/tmp` (walk 1): rows 1–2, 7–8 | rows 1–2 and 8 as above; the unprompted question in a fresh `/tmp` session was answered generically, in Portuguese, with no skill — the model's routing, as TS1 saw once on Claude Code | pass (7: the model) |

  Semantic scores logged by the walk's deltas (`memory_semantic=`, top five): the
  cfo budget prompt 0.403/0.398/0.428/0.384/0.373 (two kept, twice); reserve
  0.237/0.219/0.229/0.387/0.381 (none); "e depois disso" 0.387/0.144/0.245/0.161/0.348
  (none); the `/skill:mm-build mirror` turn 0.483/0.528/0.547/0.433/0.432 (five:
  memories about this project); journeys 0.294…0.309 (none); explore
  0.384/0.437/0.410/0.458/0.445 (four). **0.4 confirmed**: every memory that passed was
  about the prompt; the empty deltas were 134 bytes.

  **Observations, carried to Debt Review:** (1) a skill-command turn while Mirror Mode
  is on (`/skill:mm-build`, `/skill:mm-journeys`, `/skill:mm-explore`) is an ordinary
  turn to the doorman, so it pays an embedding and gets a delta — and on one
  `/skill:mm-build mirror` turn the model signed `◇ engineer` on the Builder card; the
  next Builder prompt was clean. DS8 policy, not US5's: the doorman could read a skill
  command as not-a-question. (2) `/skill:mm-new` runs `mirror mirror deactivate`
  without `--session-id`, which refuses with "no state change" — so `mm-new` does not
  end Mirror Mode on Pi even with the session named; pre-existing (the route reads
  `--session-id` alone). (3) The model's own load on row 7 took 15.3 s — the reception
  call near its 10 s timeout plus the embedding; the doorman's turns were ~1 s.
- **Navigator walk 3, 2026-10-25, the debts paid** (Pi 1.4.0, the checkout): explicit
  turn `◇ therapist`, cfo follow-up, each delta +1 embedding (726 → 727 → 728); a
  first `/compact` was refused by Pi ("session too small"); after two full file reads
  (~90k tokens) `/compact` compacted; the next ordinary prompt was delivered **full**
  (16,409 chars; one `reception` call in `front-door.log`; `session_compact` once in
  `mirror-logger.log`), signed `◇ cfo`, no `mirror mirror load` call; the prompt after
  it a 138-char delta. Observed: on that full turn the model did not re-render the
  transition box mid-conversation — it answered as the mirror directly. Earlier in the
  same walk: `/skill:mm-journeys` got no block and no embedding (726 → 726) and
  `/skill:mm-new` ended Mirror Mode (`mirror_active = 0`) — the two Pi-visible debts,
  confirmed. The `hook_injected` migration ran on a copy of the home: `current (18/18)`.

