[< Story](index.md)

# Test Guide — CV9.DS8.US4

## Automated Validation

- `ts/test/hooks/claudeInject.test.ts` (new, written first; red on the old hook,
  which prints the folder without the delivered line and prints it again on the
  session's next prompt):
  - explicit form, session `S` → stdout opens with
    `=== mirror context delivered by the runtime for this turn: full — …`; `S` reads
    `mirror_active = 1` with a persona;
  - `S` active with persona P, ordinary prompt in Q's domain → the delta line naming
    Q, `=== persona/Q ===`, no identity layer; `S.persona = Q`; one `llm_calls`
    embedding row (replay provider);
  - `S` active, same domain → the delivered line naming P, no persona section;
  - `S` not active, ordinary prompt → empty stdout; no snapshot in the live-write
    staging directory;
  - `S` active, but the session's operating mode is `Builder Mode` → empty stdout,
    nothing written (the review's mixed-mode finding);
  - Grok-shaped payload → empty stdout, no database opened;
  - no `session_id`, explicit form → the CR100 warning on stderr, the full block on
    stdout.
- `ts/test/hooks/injectForms.test.ts`: each of the six explicit spellings, through
  the real `mirror-inject.sh`, returns a block opening with the delivered line; the
  non-forms still return nothing; the CR143 cases unchanged.
- `ts/test/mirror/doorman.test.ts`: `readDoormanSessionState` reports inactive when
  the session's (or, absent one, the global) operating mode is not `Mirror Mode`.
- `ts/test/hooks/hooks.test.ts`: the `needsInject` case removed.
- `ts/test/frontDoor/buildCli.test.ts`: `build load` with no `--session-id` stamps
  the session named by `CLAUDE_CODE_SESSION_ID` or `CODEX_SESSION_ID`, not the
  guessed most-recent row (a decoy row proves the guess was not taken).
- Existing suites green: `cd ts && npm test`, `npm run typecheck`, `npm run lint`,
  `git diff --check`; `scripts/smoke_claude_plugin.sh` (installed hooks reach the
  home; `mirror mcp` answers).

## E2E Decision

Required and live: the story's outcome is a measurement on the installed Claude Code
and Codex. Record version, binary, and date for each.

## Navigator Validation

Before the walk, record: `claude --version`, `codex --version`, `which mirror-hook`
(the one the plugin's wrappers resolve), the date, and the home's database size
(`ls -lh ~/.mirror-minds/<home>/memory.db`).

**Preconditions, learned the hard way on the first walk (2026-10-25):**

- The `mirror` the *model's* shell finds must be this tree, not the installed
  package: in Claude Code's and Codex's Bash, `/opt/homebrew/bin/mirror` resolves first,
  and on this machine it pointed at the published 0.36.3 (pre-TS2: no environment
  session reader, the old `✦ Persona:` banner), while the repo's `.claude/hooks`
  ran the tree. Check with `readlink /opt/homebrew/bin/mirror`; `npm link` from the
  tree repoints it (reversible with `npm i -g mirror-mind@<version>`).
- With the published package the model's loads also resolve the home through
  `~/.config/mirror/env` (here `MIRROR_USER=vinicius`, the production home), while the
  tree's hooks read the tree's `.env` (`vinicius-dev`): the two halves of one turn
  then write to two databases. The tree on both sides reads one `.env`.
- Codex runs no Mirror hook unless the plugin is installed from the tree's
  marketplace (`~/.codex/config.toml` had no `mirror-mind` entry on the first walk,
  and every turn loaded through the model). Between turns, read the home's database:

```bash
DB=~/.mirror-minds/<home>/memory.db
sqlite3 "$DB" "select session_id, mirror_active, persona, journey from runtime_sessions order by updated_at desc limit 3"
sqlite3 "$DB" "select role, model, session_id, created_at from llm_calls order by created_at desc limit 3"
sqlite3 "$DB" "select role, substr(content,1,60) from messages order by created_at desc limit 6"
```

**Claude Code**, then **Codex**, the same rows. Both runtimes are walked before Done.

| # | Step | Expected observation | Pass | Fail |
|---|------|----------------------|------|------|
| 1 | fresh session, `/mm:mirror como lido com a ansiedade antes de um lançamento` | the reply is the mirror's, in first person, signed `◇ <persona>`; the turn shows **no** `mirror mirror load` tool call | signed; no load call; the session row (the hook's `session_id`) reads `mirror_active = 1`, persona set — re-read a second later, persona not reverted to NULL (the first-turn logger upsert) | the model runs `mirror mirror load` (loaded twice); no signature; row not active; persona reverted |
| 2 | same session, a question in another persona's domain (e.g. `como organizo meu budget para o próximo trimestre?` → cfo; check first with `mirror detect-persona "<prompt>"` — the routing keywords are English, and `quanto devo cobrar pela consultoria?` scores nothing) | the reply signed `◇ <other persona>`, answering in that lens | the row's `persona` moved; `llm_calls` +1 embedding row for this turn | signature unchanged or absent; persona unchanged; no ledger row |
| 3 | same session, a question in the same domain as 2 | signed with the same persona; no re-routing | `persona` unchanged; `llm_calls` +1 (the delta still embeds) | persona flips on a same-domain question |
| 4 | same session, two more ordinary turns, any topic | each reply still signed (sticky voice beyond three turns — CR165's failure was silence after the first reply) | signed on both | a turn without the signature |
| 5 | same session, `/mm:build mirror`, then an ordinary Builder prompt (e.g. `what tests cover the hooks?`) | the Builder transition, then a Builder answer: no mirror voice, no signature | `llm_calls` unchanged on the Builder prompt; no new memories in context | the reply signs or speaks as the mirror; a new embedding row |
| 6 | fresh session, an unprompted personal question with no form (e.g. `tenho sentido que estou me dispersando demais`) | the model routes to Mirror Mode itself, invokes the skill, and `mirror mirror load` runs **once** (visible tool call); the reply signed | the row named by the hook's `session_id` reads `mirror_active = 1` (TS1: the load names it from `CLAUDE_CODE_SESSION_ID` / `CODEX_SESSION_ID`) | the row is not active after the load |
| 7 | the next prompt in that session, another domain | row 2's observations: signed with the new persona, no skill load | `persona` moved; `llm_calls` +1; no `mirror mirror load` call — TS1's mechanism end to end on a live binary | the model runs the skill's load again; no delta |
| 8 | after rows 1–7 | `messages` holds each prompt with the explicit form stripped and each reply under the runtime's name, and **no** row holding the hook's block (the delivered line is context, not a message); `mirror mcp` answers (`scripts/smoke_mirror_mcp.sh` or a tool call in the session) | rows present; no block row; MCP answers | a prompt or reply missing or doubled; the block logged; MCP broken |

**Beside the rows, by the Driver on the CLI** with the walk's prompts against a copy
of the home: the delta's size in bytes for rows 2, 3, and 7 (`mirror mirror doorman
… | wc -c`) and the memory ids repeated between them — US5 sets its threshold from
these; `time mirror mirror doorman` on an active turn, next to the embedding timeout
the hook process resolves (`resolveLlmTimeoutMs("embedding")`) and the hook's 30 s cap.

If a Codex observation differs from Claude Code's, record what differed and on which
turn; the parity matrix (TS7) writes what was measured, not what was hoped.

## Validation Evidence

**Driver's run, 2026-10-24** (Mirror at the working tree of this story; the Navigator's
live walk on the installed Claude Code and Codex is pending):

- Automated: `claudeInject.test.ts` red on the old hook for the right reasons (the
  folder without the delivered line; a second folder on the next prompt; a delta on a
  Builder turn), green after the rewiring; `doorman.test.ts` gained the operating-mode
  case, `orchestration.test.ts` the session stamp; `mirror-state.golden.json` moved by
  one field (the named session now carries `operating_mode`, noted in the test).
  `npm test` 3500 tests, 3497 pass, 3 skipped (pre-existing), 0 fail; `typecheck`
  clean; `lint` one pre-existing warning; `git diff --check` clean;
  `checkSkillCommandParity`, `checkPackContents`, `checkDocLinks`,
  `checkRetiredSurfaces`, `buildClaudePlugin --check` clean. `smoke_claude_plugin.sh`
  steps 1–5 pass (hooks reach the home, MCP answers); step 6 fails on this machine
  before and after, as TS2 recorded (the npm-linked `mirror-hook` at
  `/opt/homebrew/bin` cannot go missing) — environment, not story.
- CLI measurements beside the walk, on a copy of `vinicius-dev` (61 MB) under a
  scratch `MIRROR_HOME`:

  | turn | prompt | bytes | wall time | note |
  |------|--------|-------|-----------|------|
  | full | `/mm:mirror como lido com a ansiedade antes de um lançamento` | 33,402 | 1.09 s | reception + embedding; persona therapist |
  | delta | `quanto devo cobrar pela consultoria?` | 2,543 | 0.97 s | **no re-route** — scores no persona; five memories, no section |
  | delta | `e se eu cobrar por hora em vez de pacote?` | 2,517 | 1.08 s | 3 of the 5 memories repeated from the previous delta |
  | delta | `como organizo meu budget para o próximo trimestre?` | 8,522 | 0.97 s | re-routed to cfo: the line names cfo, `=== persona/cfo ===` present; session persona → cfo |

  `llm_calls` for the session: one `reception` row (the full turn) and one `embedding`
  row per delta turn. Timeouts the hook process resolves: embedding 15 s, reception
  10 s (`MEMORY_LLM_TIMEOUT_*` defaults) against the hook's 30 s cap — an explicit
  turn's worst case is 25 s; a delta's 15 s. The repeated-memory count (3/5 on a
  same-domain follow-up) and the delta sizes are US5's inputs for the threshold.
- **Navigator walk 1, 2026-10-25**, Claude Code 2.1.310, Codex 0.164.0, `mirror-hook`
  at `/opt/homebrew/bin`, home 64 MB — run before the preconditions above were known:

  | # | Claude Code | Verdict |
  |---|-------------|---------|
  | 1 | `/mm-mirror …`: skill read, **no** `mirror mirror load` call, surface, `◇ therapist`; row `mirror_active = 1`, persona therapist, one `reception` row; persona held on re-read | pass |
  | 2 | `◇ cfo`; persona → cfo; +1 embedding | pass |
  | 3 | `◇ cfo`; persona stable; +1 embedding | pass |
  | 4 | two more turns, both `◇ cfo`; +1 embedding each — sticky across six turns | pass |
  | 5 | after `/mm-build mirror`, "what tests cover the hooks?" answered `◇ engineer`, +1 embedding; the session row still `operating_mode: Mirror Mode` — `build load` had stamped a **guessed** session (the Driver's Pi row) because the Builder route read `MIRROR_SESSION_ID` alone | **fail → fixed** (the four routes now use `environmentSessionId`; `buildCli.test.ts`) |
  | 6 | the skill's `mirror mirror load` ran once, but it was the installed 0.36.3 (`✦ Persona:`), which has no `CLAUDE_CODE_SESSION_ID` reader, and it wrote to the `vinicius` home: the row stayed `mirror_active = 0` | not a verdict on US4 — precondition; re-walk |
  | 7 | the model loaded again, twice | consequence of 6; re-walk |
  | 8 | prompts logged with the form stripped, replies under `claude_code`, no block row | pass |

  Codex: no Mirror hook fired (no session row, message, or ledger row in either home
  during the walk; no `mirror-mind` plugin in `~/.codex/config.toml`); every turn
  loaded through the model with the 0.36.3 binary. **Not walked.**
- **Navigator walk 2, 2026-10-25**, preconditions met (`npm link` from the tree, so
  `/opt/homebrew/bin/mirror` → the tree; the Codex plugin added from the tree's
  marketplace; both hooks and the model's loads on the `vinicius-dev` home). Claude Code
  2.1.310, Codex 0.164.0, home 64 MB. The same eight prompts on both:

  | # | Claude Code (session `6e156d86`, then `0428e448`) | Codex (session `01a17350`, then `01a17361`) | Verdict |
  |---|---|---|---|
  | 1 | skill read, **no** `mirror mirror load`, surface from the block, `◇ therapist`; row active, therapist | no load command, surface from the block, `◇ therapist`; row active | pass / pass |
  | 2 | `◇ cfo`; persona → cfo; embeddings +2 | `◇ cfo`; persona → cfo; +1 | pass / pass |
  | 3 | `◇ cfo`; persona stable; +2 | same; +1 | pass / pass |
  | 4 | `◇ cfo` (no persona scores on "cor"); +2 | same; +1 | pass / pass |
  | 5 | `/mm-build mirror`: Builder surface | same | — |
  | 6 | "what tests cover the hooks?": **no signature, no mirror voice**; embeddings unchanged (685 → 685) | same; 695 → 695 | pass / pass — the walk-1 defect is fixed |
  | 7 | fresh session: skill invoked, `mirror mirror load` **once**, banner `◇ therapist`; row `mirror_active = 1` by the hook's id | same | pass / pass — TS1's mechanism, live on both |
  | 8 | `◇ cfo`, **no load call**; persona → cfo; +2 | `◇ cfo`, no load; +1 | pass / pass |

  Logging: prompts with the form stripped, replies under the runtime's name, no block
  row. 16/16. Navigator accepted the route, 2026-10-25.

  **Difference recorded, not smoothed:** Claude Code wrote **two** embedding rows per
  Mirror turn (6 ms apart; two `reception` rows on the explicit turn), Codex one. On
  this machine Claude Code runs `mirror-inject.sh` twice — from the checkout's
  `.claude/settings.json` and from the installed plugin — and after `npm link` both run
  the tree's doorman: the model received the block twice and paid two embeddings.
  Codex has the plugin only. A checkout-plus-plugin condition, not the policy; a Change
  Request candidate (dedupe or warn when both registrations are live), carried in Debt
  Review.
