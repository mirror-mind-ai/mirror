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

A Navigator decision comes before planning. The options:
- keep the import and document it;
- ask first;
- import only sessions newer than the home.

CR106's behavior option, "a home backfills only sessions newer than itself", would close
CR106 and this CR together, so decide them together. Whether the decision must land
before the CV22 release is part of it: this reaches every npm user who has used Pi.
Captured without selecting; Current Focus unchanged.

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
