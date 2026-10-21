[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR154 — A home cannot list or remove the Pi conversations it imported rather than logged

## Problem

[CR153](cr153-a-home-s-pi-backfill-imports-another-home-s-sessions.md) stops session
maintenance from importing Pi sessions. It does not touch what was already imported,
and a person has no way to act on that. An import looks like any other `pi`
conversation: nothing in `mirror conversations` tells it from one the extension logged,
and it lists as the newest conversation, because its `started_at` is the moment it was
imported. No command removes a past conversation either: `discard-current` removes only
the current one, and the routing has no conversation `delete`.

On the maintainer's machine that is 543 conversations one real home logged and the
other imported, both ways, plus 34 sessions neither logged that both imported (CR153's
measurement). Any person who ran two homes on 0.36.0 or earlier has their own.

## Expected Behavior

A home can list the Pi conversations it imported rather than logged, read-only. An
import is told apart by construction: `importClosedConversation` stamped `started_at`
at import time and `ended_at` from the session's last message, so `interface = 'pi'`
and `started_at` at or after `ended_at` hold for every import and for no live
conversation. The listing shows each one's title, its dates, and its message count.

The person can then remove the ones they choose — named, or every one listed — through
the deletion `discard-current` already performs (`deleteConversation`: messages and
embeddings deleted; memories, the `llm_calls` ledger, and the session binding
unlinked). Removal says how many it will remove and asks before it does; it says that
the home's dated backups and its pre-write backup keep copies until they are deleted
or replaced.

## Impact

Privacy clean-up after CR153, for anyone who ran more than one home on 0.36.0 or
earlier. Without it, the honest answer
("deleting them is your decision") is a decision a person can make only in SQL.

## Plan Or Decision

Captured, unassigned, 2026-10-21, from CR153's review (findings P1, S3, D2), at the
Navigator's direction. Current Focus unchanged.

Selected as Current Focus 2026-10-21, after v0.36.1 stopped new imports. Measured
before planning, read-only, counts only, on the maintainer's two homes:

| | Production home | Development home |
|---|---|---|
| Pi imports (by the predicate below) | 199 (7,722 messages) | 515 (26,148 messages) |
| imported between | 2026-04-17 and 2026-10-21 | 2026-04-17 and 2026-10-21 |
| Pi project directories they came from | 16 | 18 |
| still bound to a runtime-session row | 194 | 510 |
| with a journey, a memory, or an embedding | none | none |
| `llm_calls` rows that name them (their titles) | 192 | 261 |
| live Pi conversations, for contrast | 1,277 | 689 |

- **The predicate holds.** `interface = 'pi' AND julianday(started_at) >=
  julianday(ended_at)` marks every import by construction and no live conversation.
  No Pi conversation in either home carries a timestamp without a zone, and every
  import still bound to a session row has an import-shaped one (`active`,
  `mirror_active`, and `hook_injected` all 0).
- **CR153's 543 cross-home copies are among them, and so is everything else the
  import ever took**: sessions of Pi run without Mirror, scratch homes' sessions, the
  rare gap of a home's own. A home alone cannot tell these apart. The Pi project
  directory each import came from can tell a person most of it, and the home already
  holds it: the import's runtime-session row keeps the session file's path. Five
  imports, the same five in both homes, from 2026-04-17 to 2026-04-19, have no row.
- **Beside each directory, one number decides most of it**: how many Pi sessions this
  home logged live from the same directory. On the production home, 96 imports from
  one development worktree and 76 from the development checkout came from directories
  where it logged none live (another home's work), and 3 from its own workspace,
  where it logged 714 (most likely its own gaps). The number blurs in a home made by
  copying another, whose copied rows count as its own: the development home shows 418
  imports and 272 live sessions from the production workspace, the 272 copied in
  July.
- **No conversation-removal command exists.** `discard-current` removes the current
  conversation only. Its `deleteConversation` (`logger.ts`, module-private) is the
  removal to reuse, and it is not whole: six tables reference a conversation and it
  handles five. With `foreign_keys=ON`, a conversation that an identity integration
  names cannot be deleted at all — `discard-current` against a scratch home where a
  Soul Mode integration names the conversation threw `FOREIGN KEY constraint failed`
  and kept it. No import is named by one today, in either home.

Reviewed 2026-10-21 through five lenses at the Navigator's request ([record
below](#review-2026-10-21)); one blocker and every other finding folded into the plan
at the Navigator's direction. Plan approved 2026-10-21 → `planned`. Started the same
day: Driver `@viniciusteles`, Delivery `main` → `in_progress`.

### Review, 2026-10-21

Five lenses: the database architect, the security engineer, the engineer, quality
assurance, and the product designer. All five endorsed the shape — imports only, a
verified backup before anything moves — and found one blocker.

- **D1, folded (blocker) — the reused deletion misses `identity_integrations`**, so a
  conversation a Soul Mode integration names cannot be deleted, by `discard-current`
  today or by this command tomorrow (measured above). → Behavior 6.
- **D2, folded — the predicate's facts pinned in tests**, and a timestamp without a zone
  never makes a conversation an import. → Behavior 1, Order of work.
- **D3, folded — the five imports with no session row** form a folder of their own,
  `(unknown)`. → Behavior 1.
- **D4, note — one transaction at this size is fine**: 515 conversations and 26,148
  messages; `messages` and `llm_calls` are indexed on the conversation.
- **S1, folded (must) — strict parsing.** Under the listing's lenient parser, a typo
  (`remove --all --projet <folder> --apply`) drops the filter and removes every import
  in the home. → Behavior 2.
- **S2, folded — an exact folder for removal**, and a dry run that names every folder
  it would touch. Substring matching is for looking. → Behavior 3, 4.
- **S3, folded — nothing advertises it to a model**: no MCP tool, no skill. →
  Non-goals.
- **S4, folded — after `--apply`, the backups that still hold copies, by count and
  date.** → Behavior 5.
- **E1, folded — a `remove` verb**, not a flag followed by a list of ids. → Behavior 3.
- **E2, folded — the deletion in a module of its own**, shared with `discard-current`,
  with D1's fix and a schema test beside it. → Behavior 6.
- **E3, folded — one function decides the set** for the dry run and for `--apply`,
  which decides it again inside its transaction and refuses if it moved. → Behavior 4.
- **Q1, folded — the route's copy is made from the home's own backup archive**, never
  by `cp` of a live database. → Validation route.
- **Q2, folded — counts before and after** prove nothing else was touched. →
  Validation route.
- **Q3, folded — the edge cases**: the unbound five, a typo'd option, an ambiguous
  prefix, `--all` with nothing to remove, `--apply` twice. → Order of work.
- **Q4, folded — routing tested both ways**: the plain listing still answers, and
  `conversations imported` is never rendered as the plain listing. → Order of work.
- **P1, folded — folders first.** The default output is the summary and one line per
  folder; a folder's conversations with `--project`. → Behavior 1.
- **P2, folded — "logged live here" beside each folder**, with the caveat for copied
  homes. → Behavior 1.
- **P3, folded — a sentence on what an import is, and one after removal on what it did
  and did not do.** → Behavior 1, 5.

### Plan (approved 2026-10-21)

**Objective.** A person can see which Pi conversations a home imported rather than
logged, and remove the ones they choose, with a verified backup first and nothing else
touched.

**Behavior.**

1. *List* — `mirror conversations imported [--project TEXT]`, read-only. It opens with
   what an import is (Mirror copied these from Pi's session files instead of logging
   them as they happened; since v0.36.1 it imports none) and the totals: conversations,
   messages, the dates they were imported. Then one line per folder — the directory of
   the import's session file, read from the session path the home stored, with Pi's
   wrapping dashes removed; Mirror reads no Pi file to learn it — with how many were
   imported from it and how many Pi sessions this home logged live from it. Imports
   with no session row form `(unknown)`, listed last. With `--project`, only the
   folders whose name contains TEXT, followed by their conversations, newest import
   first: the id's first eight characters, the import date, the message count, the
   title. An import is a Pi conversation that started at or after its own last
   message, both timestamps carrying a zone; a timestamp without one never makes a
   conversation an import.
2. *Parse strictly* — every option is declared; anything else is refused with the
   usage, exit 2, before the database opens. The `parseArgs` that `backup` and
   `repair-encoding` use moves out of `dbSafetyToolsRoute.ts` into a shared module and
   learns positionals, for the grammar that takes ids.
3. *Name what to remove* — `mirror conversations imported remove <id>…`, each a full id
   or a prefix of at least eight characters that matches exactly one conversation; or
   `mirror conversations imported remove --all [--project FOLDER]`, FOLDER exactly as
   the listing prints it. A live conversation, an unknown id, an ambiguous or too-short
   prefix, or a folder with no imports refuses the whole command by name, exit 1, and
   nothing is removed. Ids together with `--all`, neither, or `--project` without
   `--all` is a usage error.
4. *Dry run by default; `--apply` decides again* — without `--apply` it prints what it
   would remove (conversations, messages, each folder with its count) and the exact
   command that applies it. One function decides the set for both. `--apply` decides
   it first and stops if there is nothing to remove, without a backup; then takes the
   dated backup, verifies it, and refuses if either fails; then, in one transaction,
   decides the set again, refuses if it moved, and removes each import's session row
   and the conversation through the shared deletion.
5. *Report* — the backup's path, how many conversations and messages were removed, that
   memories and provider-call records that named them were kept, unlinked; and the
   backups that still hold copies: the dated archives in the home's `backups/` made
   since the earliest removed import (count, oldest, newest; an archive ages out after
   30 days) and the pre-write backup (replaced by the next write). Nothing removes them
   but the person.
6. *One deletion* — `deleteConversation` moves to
   `ts/src/conversation/conversationDeletion.ts`, used by `discard-current` and by the
   removal. Messages and embeddings are deleted; memories, `llm_calls`, the session
   binding, and identity integrations are unlinked. A test reads the schema's foreign
   keys to `conversations` and fails when a table appears that the deletion does not
   handle. `discard-current` on a conversation a Soul Mode integration names stops
   failing.
7. *Routing* — `conversations imported` is allowlisted by name as the first token after
   `conversations`. The listing and the dry run take the read route; `--apply` takes
   the live-write route, behind the pre-write backup. `conversations <options>
   imported` stays CR096's class: the plain listing, nothing removed.

**Order of work.** Tests first, each seen red where code already exists:

1. The deletion: the schema's foreign keys to `conversations` against what the deletion
   handles; a conversation named from all six tables deleted under `foreign_keys=ON`;
   `discard-current` on a conversation a Soul Mode integration names (red today).
2. The predicate and the listing: an import, a live open and a live closed
   conversation, a zone-less timestamp; folders, `(unknown)`, the logged-live counts;
   `--project`.
3. The plan: every refusal; repeated ids; `--all` with nothing to remove; the exact
   folder.
4. The removal: a backup that fails or does not verify removes nothing; a failure
   inside the transaction removes nothing; what is deleted and what unlinked; session
   rows gone; every other conversation untouched; a second `--apply` finds nothing.
5. Routing and the front door: `conversations imported` is never the plain listing
   (red today); the plain listing still answers; a typo'd option refuses and removes
   nothing; a real `--apply` through the front door.

**Affected files.**

- `ts/src/conversation/conversationDeletion.ts` (new); `ts/src/conversation/logger.ts`
  uses it.
- `ts/src/conversation/importedConversations.ts` (new) — the predicate, the listing,
  the plan, the removal.
- `ts/src/frontDoor/importedConversationsRoute.ts` (new) — parsing, the read and write
  paths, the output.
- `ts/src/util/strictArgs.ts` (new) — `parseArgs`, moved; `dbSafetyToolsRoute.ts` uses
  it.
- `ts/src/frontDoor/routing.ts`, `ts/src/frontDoor/cli.ts` — the allowlist and the
  dispatch.
- Tests: new files for the deletion, the module, and the route; the routing tests.
- Docs: `REFERENCE.md` (the command).

**Acceptance.**

1. The listing shows exactly the home's Pi imports, by folder, with the logged-live
   counts, and no live conversation.
2. `remove` without `--apply` changes nothing and says what `--apply` would do.
3. With `--apply`: a verified backup exists before any row moves; the named imports,
   their messages, and their session rows are gone; memories and `llm_calls` rows
   survive, unlinked; every other conversation is untouched; the report names the
   backups that still hold copies.
4. A live, unknown, ambiguous, or too-short id, or a folder with no imports, refuses
   the whole command by name; an undeclared option refuses with the usage.
5. `discard-current` deletes a conversation a Soul Mode integration names.
6. The gate in CR153's plan, the CI smokes included.

**Validation route (Navigator).** Through the checkout's binary by path, on a scratch
home made from a fresh backup archive of the development home (unzipped, owner-only,
under `/tmp`, removed afterwards): counts before; the listing; a dry run of one
folder; `--apply`; counts after and the listing again. The real clean-up of either
real home is a separate decision, made after validation, with the same command.

**Non-goals.**

- Telling another home's copy from a gap this home filled for itself: that takes both
  databases, which no home should read.
- Removing anything from backups.
- Imports of the retired Codex importer, or any interface but `pi`.
- A general `conversations delete`.
- An MCP tool or a skill for this command.
- [CR096](../rs009-cv22-front-door-routing-correctness/cr096-conversations-lists-instead-of-appending-when-options-come-first.md)
  (options before a subcommand).
- A release.

**Authority.** Approved 2026-10-21 → `planned`; started the same day with Driver
`@viniciusteles` and Delivery `main` → `in_progress`. Commits follow the project's
checkpoints; push and release are separate decisions.

## Evidence

CR153's measurement, 2026-10-21. `deleteConversation` in
`ts/src/conversation/logger.ts`, called by `discardCurrentConversation`. No
conversation `delete` among the front door's routes (`ts/src/frontDoor/routing.ts`).
Until this lands, the read-only selector in CR153's plan (Behavior 6) lists a home's
imports.

## Outcome

Open.
