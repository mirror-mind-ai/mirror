[< CV24](../index.md)

# CV24.DS2 — Conversations as Calls

**Status:** 🟠 Implemented (2026-10-28) on branch `desktop/library-seam-1a`. Not merged, not released.
The Navigator chose **option B** for write custody, and it is recorded as the decision
[A host's Conversation writes are narrowed, not snapshotted](../../../decisions.md#a-hosts-conversation-writes-are-narrowed-not-snapshotted).

## Outcome

A host records a Conversation in Mirror through `mirror-mind/desktop`, with no CLI and no Python:

1. **`ensureConversation(dbPath, { sessionId, journeyId, title, interface })`** returns the
   Conversation bound to that runtime session, creating and binding one when there is none live. It
   ports what Mirror Desktop's `provision_mirror_conversation.py` does through Python's
   `MemoryClient`: `get_or_create_conversation`, `upsert_runtime_session` and
   `update_conversation`.
2. **`appendConversationMessages(dbPath, request)`** keeps today's `conversations append` contract:
   the same request, receipt and named rejections.
3. **`renameConversation(dbPath, conversationId, title)`**.
4. **`rebindConversationJourney(dbPath, conversationId, journeyId)`**.

Every function takes an explicit `dbPath`, refuses a database that is not `current` (using DS1's
report), and never migrates. The caller names the `interface`; the core does not know Desktop.

## What Already Exists

- `getOrCreateSessionConversation` and `upsertRuntimeSession` (`conversation/logger.ts`,
  `mirror/runtimeSession.ts`) are the TypeScript ports of the Python calls the script makes.
- `appendConversationMessages` and `parseAppendRequest` (`conversation/append.ts`) are the append
  contract, already all-or-nothing in one transaction.
- `updateConversation` (`conversation/lifecycleWrites.ts`) writes the given columns.

This story is mostly about how a host reaches them, not new logic.

## The Open Decision: Write Custody

Today every live write goes through `openLiveWriteDatabase`. It takes a `VACUUM INTO` snapshot before
**each** write, and its comment calls it "the only sanctioned way to open a live `memory.db` for
writing". The MCP server is the one recorded exception: it is long-lived, so it gets a narrowed handle
that can form only one statement shape, instead of a snapshot (`openDatabaseForLedgerAppend`).

A Desktop host is long-lived too, and it writes on every turn.

**Measured 2026-10-28.** The Navigator's production home is 108 MB. On a copy of it, `VACUUM INTO`
took 920, 900 and 913 ms. The copy was made read-only through SQLite's backup API, in a scratch
directory, and deleted afterwards. Under option A, every turn would pay about 0.9 s and rewrite
108 MB on disk.

| Option | What it is | Cost | Protection |
|---|---|---|---|
| **A · Per-write snapshot** | Use `openLiveWriteDatabase` as the CLI does | ~0.9 s and a 108 MB write per turn on a home this size, growing with it | A full undo of the last write |
| **B · A narrowed handle** (recommended) | Follow the MCP precedent: a handle whose `prepare` accepts only the statements these four calls need. Those are inserts into `conversations`, `messages` and `runtime_sessions`, updates to `conversations.title` and `conversations.journey`, and reads. It exposes no `exec` beyond the transaction verbs, and no DELETE, DDL or other table. | Nothing per write | Destructive writes are unreachable rather than undone; append is all-or-nothing |
| **C · One snapshot per host session** | Snapshot when the host opens, then write freely | One snapshot at start | An undo to session start only, which loses every Conversation written since |

**Recommendation: B.** It is the custody the core already chose for the other long-lived writer, for
the reason its comment gives ("the gate is the wrong shape here, not merely the wrong price"). The
backups that protect a home as a whole stay where they are: `runtime backup`, and the migration
snapshot that DS5 will keep. If the Navigator chooses B, it is recorded as a decision in
`docs/project/decisions.md` beside the MCP one before any code is written.

## Acceptance (for option B)

- **The four calls on a `current` home:**
  - `ensureConversation` is idempotent per live session and creates a new Conversation after the
    bound one ends.
  - `appendConversationMessages` is identical to the CLI's, byte for byte on its receipts, using the
    existing append goldens.
  - Rename and rebind change exactly one column.
- **Refusals:**
  - a `pending`, `ahead`, `not_mirror` or `missing` home is refused with DS1's state, and its bytes
    are untouched;
  - an unknown Conversation is refused as `conversation_not_found`.
- **The handle:** any statement outside the allowlist throws before it reaches the driver. That
  covers DELETE, DROP, UPDATE of another column, and INSERT into another table.
- **No snapshot.** No `backups/` file is written by these calls.
- **No environment.** `MIRROR_HOME`, `MIRROR_USER` and `DB_PATH` aimed at a canary are ignored.
- **The installed entry.** Step 7 of the package smoke runs the four calls against the installed
  tarball, on a scratch home.
- **Mutation controls.** Each of these fails a test:
  - skipping the `current` check;
  - widening the allowlist to DELETE;
  - routing through `openLiveWriteDatabase`.

## Exclusions

- `conversations delete`. It is destructive and goes in a story of its own.
- Catalog listing and inspection. Those are reads, and belong in DS3.
- Recall.
- Title generation and the close tail (an LLM call).
- No release and no change to the CLI's custody.

## Validation

- typecheck, lint, `npm test` against DS1's baseline, and the package smoke;
- all of it under the isolation DS1 recorded;
- the production ledger read before and after.

## Built (2026-10-28)

### What changed

- **`openDatabaseForConversationWrites`** in `ts/src/db/database.ts` is the narrowed handle described
  in the decision.
- **`ts/src/conversation/hostCalls.ts`** holds the four calls. They are:
  - `ensureConversation`;
  - `appendConversationMessages`;
  - `renameConversation`;
  - `rebindConversationJourney`.

  It also defines two errors. `DatabaseNotCurrentError` carries the DS1 state.
  `ConversationCallRejectedError` names one of `invalid_request`, `conversation_unavailable` and
  `invalid_title`, which are the reasons Mirror Desktop's catalog script used.
- **`lib/desktop.js`** re-exports the four calls and the two errors. `DESKTOP_API_VERSION` stays at
  1, because the change is additive.
- **`ts/test/helpers/legacyDb.ts`** gains `regressTo016`.
- **Package smoke, step 7,** runs the four calls from the installed tarball.

### Two choices made while building

- **`ensureConversation` is a faithful port** of the Python script. On an already-bound session, it
  still sets the Conversation's title, Journey and interface to the ones given, as
  `update_conversation` did.
- **Rename and rebind take an exact id** and refuse a prefix. This matches Desktop's
  `IDENTIFIER_RE`, unlike `resolveConversation`, which accepts prefixes. Rename also requires the
  Conversation's own Journey, as Desktop's `exact_conversation` did. Rebind does not, as Desktop's
  `owned_conversation` did not (CR093).

### Evidence

- **The narrowed handle:** `ts/test/db/conversationWriteHandle.test.ts`, 3 tests.
  - It accepts 8 statements, and refuses 16 statements and 4 `exec` strings.
  - A refused statement never reaches the driver.
- **The four calls:** `ts/test/conversation/hostCalls.test.ts`, 11 tests.
  - **Append parity:** append matches the CLI **byte for byte** across 7 cases: accepted, replay,
    `conversation_not_found`, `journey_mismatch`, `idempotency_conflict`,
    `unsupported_schema_version` and `malformed_request`. The CLI side ran with `--db-path` on a
    twin home.
  - **Refusal:** a home at 016 is refused by all four calls, keeping its bytes and with no backup.
    A missing home is refused without being created.
  - **No snapshot:** the calls write no `backups/` file.
  - **Environment ignored:** `MIRROR_HOME` and `DB_PATH` aimed at a canary are ignored.

  Both test files were red first, on the missing module and the missing export.
- **The entry test** was red with the old two-name list, then green with eight names.
- **Mutations, each caught and then restored:**
  - skipping the `current` check: 1 failure;
  - the allowlist accepting `DELETE`: 2 failures;
  - routing through `openLiveWriteDatabase`: 1 failure, "a backups directory appeared". A control
    that added only the import passed, so the failure is the routing's;
  - a prefix lookup in place of the exact id: 1 failure.
- **Gates:**
  - typecheck: clean;
  - lint: clean, apart from the 1 baseline warning;
  - `npm test`: 3,552 passed, 1 skipped and 1 failing. The failure is the baseline `diagnose`
    failure, which is local only and passes in CI;
  - package smoke: 85 of 85.
- **Production** stayed at migration 016 throughout.

