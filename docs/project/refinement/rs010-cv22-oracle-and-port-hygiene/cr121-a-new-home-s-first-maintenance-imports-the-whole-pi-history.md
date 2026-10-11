[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR121 — A new home's first maintenance run imports the person's whole Pi history

## Problem

Session maintenance backfills every Pi session the Mirror home does not already track.
It reads the sessions directory from `PI_SESSIONS_DIR`, else `~/.pi/agent/sessions`, and
covers every project on the machine
([CR106](cr106-a-pi-session-in-a-scratch-mirror-home-copies-the-whole-pi-history-into-it.md)).
In a home that has tracked Pi from the start, this fills gaps. A new home tracks nothing.

So a person who used Pi before installing Mirror gets their entire Pi history imported on
the first maintenance run. That is the expected npm user: Pi is the recommended harness.
The history arrives as closed `pi` conversations: chats from every project, from before
Mirror was on the machine. The first run is whichever comes first:
- Pi's background maintenance;
- Claude Code's or Gemini CLI's SessionStart hook.

It happens before the first prompt is answered, and nothing is shown.

Once imported, those conversations belong to Mirror. Later maintenance runs retitle them
and extract memories from them, within a per-run budget. That is LLM spend the person did
not choose, and memories drawn from conversations that were never Mirror conversations.

CR106 records the same mechanism defeating scratch-home isolation in validation routes.
This is the product side of it: a real home on its first day.

## Expected Behavior

The person decides what happens to their earlier Pi history. One of two behaviors:
- a new home imports nothing older than itself;
- or it asks once before importing earlier history, saying how much there is and that
  extraction will spend on it.

Either way the first run does not silently copy history that predates Mirror and then
spend on it. The install documentation says which behavior the person gets.

## Impact

High for the npm release; low for existing clone users, whose history is already tracked.
It is the first thing a new install does for anyone who has used Pi. It is invisible, and
it scales with how much they have used Pi. While
[CR120](cr120-a-failed-pi-session-import-aborts-the-rest-of-session-maintenance.md) is
open, it also fails partway, because a bulk import is where collisions are likeliest. A
new home's first maintenance runs can then stop early at each start until the backlog
drains.

## Plan Or Decision

A Navigator decision came before planning. The options were to keep the import and
document it, to ask first, or to import only sessions newer than the home. CR106's
behavior option, "a home backfills only sessions newer than itself", closes CR106 and
this CR together, so they were decided together.

**Decided 2026-10-10 by the Navigator: import only sessions newer than the home**
([Decisions](../../decisions.md#a-new-mirror-home-imports-only-the-pi-sessions-that-are-newer-than-itself)).
A release precondition: it lands before the `v0.32.0` tag. Selected the same day;
plan below, pending Navigator approval.

### Objective

A home's first maintenance run imports nothing that happened before the home existed.
A session is Mirror's when its last message is later than the home's birth; everything
else in the sessions directory is left where it is, unread by a provider, uncopied by a
backup. For a home that predates its sessions, which is every existing clone user's home,
nothing changes.

### Design

**The home's birth is the first `applied_at` in `_migrations`.** A fresh database runs
every migration at its first open and stamps each with `nowIso()`; a Python-era
database carries the same ledger from its own first open. `MIN(applied_at)` is therefore
the birth of every home there is, with no new table, column, marker file, or `init`
step. Read it in `loggerRuntime.ts`, where `deps.backfillPiSessions` is wired, through
one small function in `backfill.ts` (`homeBornAt(db): string | null`). A ledger with no
rows, which no opened database has, yields `null` and the import proceeds as before.

**A session is dated by its last message.** `backfillPiSessions` already parses every
message of a file before importing it; the session's end is `messages.at(-1).createdAt`,
the same value it stores as `endedAt`. A session whose end is at or before the birth is
skipped, before `importClosedConversation`, so nothing is written, locked, titled, or
counted for it. Timestamps are compared as instants (`Date.parse`), since the ledger
writes `Z` and `parsePiTimestamp` writes `+00:00`. A session with no timestamps dates
to `now` under the existing rule and is imported: an undated session is newer, not older.

**The option is explicit, not defaulted.** `PiBackfillOptions` gains `notBefore: string
| null`, required. The golden test passes `null` and keeps grading the corpus exactly
as before; production passes the birth. A test cannot forget the rule by omitting it.

**Codex is unchanged.** `backfillCodexSession` imports the one session the wrapper
names, not a history; it is not a backfill of the past and takes no date.

**No skipped-count, no question, no report.** The maintenance log line stays
`Backfilled Pi sessions: N`. What the rule leaves out is not an event.

### Files

- `ts/src/conversation/backfill.ts`: `homeBornAt`, the `notBefore` option, the skip.
- `ts/src/conversation/loggerRuntime.ts`: read the birth once per maintenance run, pass it.
- `ts/test/conversation/backfill.test.ts`: the golden passes `null`; a new test births a
  database, writes one session ended before the birth and one after, and asserts one import
  and which; a third case asserts a `null` birth imports both.
- `ts/test/conversation/sessionComposites.test.ts` or the logger-runtime tests: the wiring
  reads the ledger (one assertion that a fresh database imports nothing dated yesterday).
- `REFERENCE.md` (`PI_SESSIONS_DIR` row and the maintenance section): one sentence
  stating the rule.
- `docs/getting-started.md` § 8: one sentence, so a Pi user knows their earlier history
  stays out.
- `docs/releases/pending-cutoffs.md`: not a cutoff; the release note states the rule
  under behavior changes instead.

### Acceptance

- A home created by `mirror init` and opened for the first time, with
  `~/.pi/agent/sessions` holding history, imports no session that ended before the open.
- The same home imports a session that ends after the open, at the next maintenance run.
- An existing home whose ledger predates its sessions imports exactly what it imported
  before this change (the golden corpus, unchanged).
- A scratch home used by a validation route imports nothing from the machine's history
  (CR106's expected behavior), with no `PI_SESSIONS_DIR` pin needed.
- `npm test`, typecheck, lint, and the package smoke stay green.

### Validation Route

Navigator, on this machine, with the real `~/.pi/agent/sessions` and a scratch prefix:
`mirror init cr121-check` with `MIRROR_HOME` under `/tmp`; run one Claude Code
SessionStart hook or one `mirror` command that triggers maintenance; read the scratch
home's `mirror-logger.log`. Pass: `Backfilled Pi sessions: 0`, and the database holds no
`pi` conversation. Then open Pi once against the scratch home, close it, trigger
maintenance again. Pass: `Backfilled Pi sessions: 1` or the live hook's own binding, and
nothing older. Delete the scratch home afterwards.

### Non-Goals

- Asking before importing, or any surface in maintenance.
- A command to import earlier history on request.
- CR120 (a failed import aborts the rest of maintenance): separate, still open.
- Any change to what a session import stores once it is accepted.

**Navigator, 2026-10-09: this must be decided before the CV22 release.** It is a
release precondition, recorded with the
[release gate](../../decisions.md#the-cv22-release-is-gated-on-an-ariad-trust-floor-worked-before-us3).
Which option is still open, and so is what the chosen one requires before the
release.

## Evidence

- **Reproduced on 2026-10-08 while writing CV22.DS10.US3's route 3.** The run was step 4's
  environment, simulated without a model. A home freshly made by `mirror init` received
  one Claude Code SessionStart hook with the real `~/.pi/agent/sessions`. It imported 430
  Pi conversations (26,036 messages) before CR120's failure stopped it. Extraction did not
  run: the failure came first, and the home had no API key. The home was deleted
  afterwards.
- **CR106.** On 2026-09-26, Pi's background maintenance imported 793 sessions (50,737
  messages) into a scratch home.
- **Code.** `ts/src/conversation/sessionComposites.ts`: `sessionMaintenance` backfills,
  then retitles, then extracts. `ts/src/conversation/backfill.ts`: `resolvePiSessionsDir`
  and `backfillPiSessions`.
- **Route 3's mitigation.** US3's route 3 now pins `PI_SESSIONS_DIR` to an empty
  directory for its Claude Code session
  ([story index, plateau 3](../../roadmap/cv22-typescript-core-port/cv22-ds10-python-retirement-npm-distribution/cv22-ds10-us3-npm-distribution/index.md#plateau-progress),
  finding F3).

## Outcome

Pending.
