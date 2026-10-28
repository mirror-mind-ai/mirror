[< CV24](../index.md)

# CV24.DS2 — Conversations as Calls

**Status:** 🟡 Planned (2026-10-28). One decision is open, and it is the Navigator's: **write custody**,
below. Nothing is built until it is answered.

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
