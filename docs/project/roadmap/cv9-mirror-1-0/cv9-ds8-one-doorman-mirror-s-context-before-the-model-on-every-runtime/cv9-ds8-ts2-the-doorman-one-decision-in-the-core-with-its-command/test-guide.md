[< Story](index.md)

# Test Guide — CV9.DS8.TS2

## Automated Validation

- `ts/test/mirror/doorman.test.ts` (new, written first):
  - decision table — Mirror Mode off → `nothing`; explicit form → `full` with the
    query after the form; active + new persona above threshold → `delta` naming it;
    active + same persona → `delta` with `persona: null`; active + no persona →
    `delta` with `persona: null`; unnamed session + ordinary prompt → `nothing`;
  - rendered full block: opens with the delivered line (`full — answer as the mirror;
    sign ◇ <persona>`), then the transition surface and the folder; session row
    `mirror_active = 1`, `hook_injected = 1`;
  - rendered delta: delivered line (`delta (persona: <session persona> · journey: J)
    — answer as the mirror; sign ◇ <persona>`, the clause without a signature when
    no persona), the persona section only when newly routed, `=== relevant memories
    ===` with up to five, `=== relevant attachments ===` only above 0.4, and no
    identity layer; session `persona` updated only when newly routed, by a targeted
    UPDATE that leaves the row's other columns as another writer last set them;
  - the line alone when nothing follows it (no silent delta while active);
  - ledger: one `llm_calls` embedding row per delta turn, none for `nothing`;
    `memory_access_log` unchanged; the five scores in the front-door log;
  - a `nothing` turn opens no writable handle: no snapshot appears in the live-write
    staging directory;
  - degraded provider: FTS-ranked memories, no attachments, no throw, line present.
- `ts/test/mirror/orchestration.test.ts`: `writeMirrorState` marks the session named
  by `MIRROR_SESSION_ID`, `CLAUDE_CODE_SESSION_ID`, or `CODEX_SESSION_ID` when no
  `--session-id` is passed; explicit wins; none → no write.
- `ts/test/search/memorySearch.test.ts`, `ts/test/mirror/context.test.ts`: a
  precomputed `queryEmbedding` is used and the provider is not called.
- `ts/test/frontDoor/mirrorModeCli.test.ts`: `mirror mirror doorman` is a mirror write
  surface; `--prompt` missing → exit 2; empty output → exit 0.
- Existing suites green: `cd ts && npm test`; `npm run check`.

## E2E Decision

Fixture-level and command-level in this story. The live walks on each runtime belong
to US4 (Claude Code, Codex), US5 (Pi), and TS6 (Antigravity), which call what this
story ships; US5's walk also sets the memory threshold from the scores this story logs.

## Navigator Validation

Against a scratch home (a copy of the dev database, `MIRROR_HOME` pointed at it) and
a scratch session id `S`:

| # | Command | Expected observation | Pass | Fail |
|---|---------|----------------------|------|------|
| 1 | `mirror mirror doorman --prompt "quais os próximos passos do projeto" --session-id S` | nothing printed | stdout empty; no `S` row, or unchanged; no new snapshot in the live-write staging directory | any block; a new row; a snapshot |
| 2 | `mirror mirror doorman --prompt "/mm-mirror como lido com a ansiedade antes de um lançamento" --session-id S` | delivered line `full — answer as the mirror; sign ◇ <persona>`, transition surface, folder with a routed persona | `S` reads `mirror_active = 1, hook_injected = 1` | no delivered line; `S` not active |
| 3 | `mirror mirror doorman --prompt "<another persona's domain>" --session-id S` | delivered line `delta (persona: Q · journey: J) — … sign ◇ Q`, Q's section, up to five memories, attachments, no identity layer | `S.persona = Q`; `llm_calls` +1 embedding row; `memory_access_log` +0; five scores in the front-door log | an identity layer repeated; two rows; access rows; persona unchanged |
| 4 | repeat 3 in the same domain | delivered line naming the same persona, no persona section | `S.persona` unchanged | a persona section; no line |
| 5 | `CLAUDE_CODE_SESSION_ID=C mirror mirror load --query "..."` with `MIRROR_SESSION_ID` unset | the folder, as today | `runtime_sessions C` has `mirror_active = 1` | no `C` row |

Rows read with `sqlite3 "$MIRROR_HOME/memory.db" "select session_id, mirror_active,
hook_injected, persona, journey from runtime_sessions where session_id = 'S'"`,
`"select role, model, created_at from llm_calls order by created_at desc limit 3"`,
and `"select count(*) from memory_access_log"` before and after row 3.

## Validation Evidence

**Driver's run, 2026-10-24** (Mirror at the working tree of this story; the Navigator's
own walk is pending):

- Automated: `npm run typecheck` clean; `npm run lint` one pre-existing warning
  (`testTempHomes.test.ts`, not this story's); `git diff --check` clean; `npm test`
  3488 tests, 3485 pass, 3 skipped (pre-existing), 0 fail; the same suite green with
  no `mirror` on the PATH; `checkRetiredSurfaces`, `checkPackContents`,
  `checkDocLinks`, `checkSkillCommandParity`, `buildClaudePlugin --check` clean;
  `migrate_on_open`, `conversation_lifecycle`, `builder_lifecycle` smokes green.
  `smoke_claude_plugin.sh`: steps 1–5 pass (hooks reach the home, MCP entry answers);
  step 6 fails on this machine before and after the change — after removing its scratch
  `mirror-hook`, the wrapper's fallback finds the `npm link`ed one at
  `/opt/homebrew/bin`, so nothing is "missing". Environment, not story.
- Navigator route, on a copy of `vinicius-dev`'s database under a scratch `MIRROR_HOME`:

  | # | Observed | Verdict |
  |---|----------|---------|
  | 1 | stdout empty; no `S` row; no `backups/` directory created | pass |
  | 2 | `…: full — answer as the mirror; sign ◇ therapist ===`, the transition surface, the folder with `persona/therapist` and `journey/mirror`; `S` = `1\|1\|therapist\|mirror`; one `reception` ledger row | pass |
  | 3 | prompt in the cfo domain: `…: delta (persona: cfo · journey: mirror) — … sign ◇ cfo ===`, `persona/cfo`, five memories (pricing, markup, launch decisions), no identity layer, no attachments above 0.4; `S.persona = cfo`; `llm_calls` 1558 → 1559 (`embedding`, 12 tokens, session `S`); `memory_access_log` 4486 → 4486; `front-door.log`: `doorman memory_scores=0.421,0.393,0.392,0.385,0.381` | pass |
  | 4 | same domain: the line names `cfo`, no persona section, five memories; `S.persona` unchanged | pass |
  | 5 | `CLAUDE_CODE_SESSION_ID=C mirror mirror load --query …`: row `C` = `1\|therapist\|mirror`; then `mirror mirror doorman` named by the environment alone delivered a `writer` delta on `C` | pass, after a fix: the first run wrote no `C` row because the load route still read `MIRROR_SESSION_ID` alone — the reader is now applied there, with a CLI test |

  Scores observed on row 3 sit between 0.38 and 0.42 under the default weights: the
  number US5's walk sets will be read against these.
