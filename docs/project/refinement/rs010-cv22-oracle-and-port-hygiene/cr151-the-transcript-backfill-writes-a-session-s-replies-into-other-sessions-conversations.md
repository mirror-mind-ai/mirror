[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR151 — The transcript backfill writes a session's replies into other sessions' conversations

## Problem

At SessionEnd, when the payload carries a transcript, `handleSessionEndHook` runs
`backfillAssistantMessages` (`ts/src/conversation/transcriptBackfill.ts`). It picks the
conversations to fill by **time window alone**:

```sql
SELECT id, started_at, ended_at FROM conversations
 WHERE started_at <= ? AND (ended_at >= ? OR ended_at IS NULL)
```

— the transcript's last and first timestamps — with no filter on the ending session,
its bound conversation, or the runtime. Every conversation in that window with no
assistant message yet receives every assistant reply in the transcript whose timestamp
falls between the conversation's start and the transcript's end. An **open**
conversation (`ended_at IS NULL`) that started earlier is always in the window.

So a reply from one session is copied into another session's conversation whenever
that other conversation is open and reply-less: a session killed mid-first-turn (the
prompt logged, Stop never fired, the conversation waiting for maintenance to reap it as
a stale orphan), or a concurrent session on another runtime still inside its first
turn. The copy is inserted with the backfill's own clock (`deps.nowIso()`), not the
transcript's timestamp, so it reads as a reply that arrived when the other session
ended.

The behavior is a faithful port of the Python transcript fallback the TypeScript core
replaced; no test pins the scoping, because the fallback was written when one session
at a time was the only case.

## Expected Behavior

A session's transcript fills only the conversation that session is bound to
(`runtime_sessions.conversation_id` for its `session_id`, the row `endSession` just
closed), and only with replies inside that conversation's own window. The session-less
route (no `session_id`, a transcript alone) fills nothing it cannot attribute — or, if
it must keep a fallback, conversations of the transcript's own runtime only. An
inserted reply carries the transcript's timestamp.

## Impact

Conversation history is the mirror's memory: extraction, recall, and every later
session read it. A reply attributed to the wrong conversation is wrong memory,
silently, and it can cross runtimes. The precondition is ordinary — a Ctrl-C during a
first turn — so it happens on real homes, not only in tests.

## Plan Or Decision

Captured, unassigned, 2026-10-20, from CV21.DS5.US3's live route, at the plan's stop
condition ("a product defect the route finds: stop, capture a CR, and ask whether to
fix it here or there"). Not one line: the fix scopes a query and re-times an insert,
with tests for the orphan and the concurrent cases. Current Focus unchanged.
The Navigator decided the same day: fixed here, in its own Change Request, not inside
US3, whose measurements read the ledger and the ping table rather than conversation
history.

**Plan, approved by the Navigator 2026-11-06** after a review through three lenses
(database-architect, quality-assurance, engineer):

- **No fallback for the unattributable routes (option A).** A payload without a
  `session_id`, or a session bound to no conversation, backfills nothing. The
  rejected option B, a fallback limited to the transcript's own runtime, would not
  have fixed the evidence case: the orphan `6f0eaea0` and the session that wrote
  into it were both `claude_code`.
- `backfillAssistantMessages(db, transcriptPath, conversationId, deps)`: the
  conversation is a required argument, read before `endSession` from
  `runtime_sessions.conversation_id`; one row, its own `[started_at, ended_at]`
  window, skipped when it already logged a reply.
- Every transcript timestamp and conversation bound is normalized to the logger's
  microsecond ISO form (`.123Z` → `.123000Z`; as raw strings `.123Z` sorts after
  `.123456Z`), and a reply is inserted with its normalized transcript timestamp.
- The golden's `transcript` and `hook_session_end` sections recorded the defect and
  can no longer be regenerated (the generator and its Python source are gone). They
  stay as frozen records, as the `codex` and `pi_sessions` sections already do, and
  the slice-E corpus is graded by explicit assertions.
- Headers of `transcriptBackfill.ts` and `handleSessionEndHook` say the code
  diverges from the Python port on purpose, so it is not "fixed" back.

## Evidence

CV21.DS5.US3 route, 2026-10-20, scratch home from the registry's `mirror-mind@0.36.0`,
claude 2.1.304. A hand-run diagnostic at 18:17 UTC called `mirror-hook
claude:user-prompt` with `session_id: probe-direct`, which created an open
`claude_code` conversation with one user message and no Stop — the orphan shape. At
20:41 the route's Claude probe session (`09da44c2…`, one plain prompt, `claude -p`)
ended; its conversation `3cda2aba` got its reply `ready`, and so did the unrelated
orphan `6f0eaea0`, at the same instant (20:41:17.309), from the SessionEnd backfill.
The Stop hook binds by `session_id` and is not the path (`handleStopHook`,
`logger.ts`).

**Implementation, 2026-11-06** (uncommitted on `main` at handoff):

- `ts/src/conversation/transcriptBackfill.ts`: scoped to one conversation; adds
  `normalizeTimestamp`; no `nowIso`.
- `ts/src/conversation/logger.ts`: `handleSessionEndHook` resolves the bound
  conversation first; the session-less route returns `skipped`/`nothing_to_do`;
  the `{ action: "backfilled" }` outcome is retired (the CLI ignored outcomes).
- `ts/test/conversation/transcriptBackfill.test.ts`: each of the seven corpus
  conversations, when named, fills only itself (the other six snapshot-equal),
  inside its own window, at transcript time, and a re-run is a no-op; a missing
  conversation writes nothing; replies interleave with their prompts through
  `recall`'s reader, including a reply `.123Z` against a prompt `.123456Z`;
  `normalizeTimestamp` cases.
- `ts/test/conversation/logger-hooks.test.ts`: the CR's orphan (`probe-direct`) gets
  nothing and the reply is stamped at transcript time; a concurrent first-turn
  session on the same runtime is untouched and stays open; a late SessionEnd on a
  conversation maintenance already closed fills only it, inside its window; a
  transcript without a session id writes nothing; an unbound session ends with
  `backfilled: false`; an empty payload and a missing transcript write nothing.
- `ts/test/helpers/backfillFixture.ts`: the two golden sections retired, untyped.

Checks: `npm run typecheck` clean; `npm run lint` one warning, the same one as on
`main` before the change (`testTempHomes.test.ts`); `npm test` 3798 tests, 3795 pass,
0 fail, 3 skipped.

Live replay on a scratch home through the real `mirror-hook` binary (linked to this
checkout), the route's recipe with a hand-written transcript in place of
`claude -p`: `probe-direct` logged a prompt and no Stop; `probe-session` logged
`say ready` and ended with a transcript whose reply was at `20:58:02.540Z`. Result:
`probe-direct` open with its prompt alone; `probe-session` closed with `ready` at
`2026-11-06T20:58:02.540000Z`. Scratch directory removed.

## Validation Route

For the Navigator. It runs a real Claude Code session against a scratch Mirror home,
never the real one, and repeats the CV21.DS5.US3 evidence: an orphan conversation
beside a session that ends with a transcript. Claude keeps the real `HOME` and login;
only `MIRROR_HOME` and `MIRROR_USER` point at the scratch home. The plugin comes from
this checkout (`--plugin-dir`), and `mirror-hook` on the `PATH` is linked to it.

**Step 1 — scratch home.**

```bash
export S=$(mktemp -d /tmp/cr151-validate-XXXX)
export MIRROR_USER=cr151scratch MIRROR_HOME=$S/cr151scratch
mkdir -p "$MIRROR_HOME" "$S/project"
DB="$MIRROR_HOME/memory.db"
```

Expected: the directory exists and is empty. The home directory's name must equal
`MIRROR_USER`: any other name makes the hook print `MIRROR_HOME ... conflicts with
MIRROR_USER` and exit 0 without logging. Run every later step in this one shell, so the
variables stay set.

**Step 2 — the orphan.** A prompt logged and no Stop, as a Ctrl-C in a first turn
leaves it:

```bash
echo '{"session_id":"probe-direct","prompt":"diagnostic prompt"}' | mirror-hook claude:user-prompt
sqlite3 "$DB" "SELECT substr(c.id,1,8), c.ended_at, m.role, m.content
               FROM conversations c JOIN messages m ON m.conversation_id = c.id;"
```

Expected: one row, `user|diagnostic prompt`, `ended_at` empty. Fail: no row (the hook
did not reach the scratch home; check `$MIRROR_HOME/logs`).

**Step 3 — the real session.** One plain prompt, from an empty project, with the
plugin:

```bash
cd "$S/project"
claude -p "Reply with the single word: ready" --plugin-dir /Users/vinicius/dev/workspace/mirror-dev/plugins/mirror-mind
```

Expected: Claude answers `ready`. Wait a few seconds: SessionEnd runs after the process
exits.

**Step 4 — read the home.**

```bash
sqlite3 "$DB" "SELECT rs.session_id, substr(c.id,1,8), c.ended_at IS NOT NULL AS ended,
                      m.role, m.created_at, m.content
               FROM runtime_sessions rs
               JOIN conversations c ON c.id = rs.conversation_id
               JOIN messages m ON m.conversation_id = c.id
               ORDER BY rs.session_id, m.created_at;"
```

Pass, all three:
- `probe-direct` has exactly one row, `user|diagnostic prompt`, and `ended` is `0`.
  Before this change it also held `ready`, at the instant the other session ended.
- Claude's session has its `user` row and an `assistant` row, `ended` is `1`.
- The assistant row's `created_at` is the reply's own time, a microsecond-form
  `...Z` value a moment after the user row's, not the time the session ended.

Fail: any `assistant` row under `probe-direct`, or an assistant row with no
counterpart in the transcript.

**Step 5 — the transcript agrees (optional).**

```bash
T=$(ls -t ~/.claude/projects/*cr151-validate*/*.jsonl | head -1)
grep '"type":"assistant"' "$T" | grep -o '"timestamp":"[^"]*"'
```

Expected: the timestamp equals the assistant row's `created_at`, with Claude's
millisecond precision padded by `000`.

**Step 6 — clean.**

```bash
rm -rf "$S"; unset S DB MIRROR_HOME MIRROR_USER
```

Expected: nothing left but Claude's own session transcript under `~/.claude/projects`.

## Outcome

Implemented, not validated. Driver `@viniciusteles`, Delivery `main`, `in_progress`
2026-11-06. Awaiting the Navigator's run of the [validation route](#validation-route)
before `validated`.

Known risk, out of scope: on the late-SessionEnd branch (maintenance closed the
conversation first), maintenance may already have extracted it, so the replies the
backfill adds land after extraction read the conversation. Unchanged by this CR.
