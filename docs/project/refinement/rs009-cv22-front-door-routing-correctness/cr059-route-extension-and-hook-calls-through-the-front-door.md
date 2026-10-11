[< RS009](index.md)

# CR059 — Route the Pi extension and Gemini hook calls through the front door

**Status:** done
**RS:** RS009
**Driver:** @viniciusteles
**Delivery:** `mirror-ts-core`

Phase history: captured 2026-09-08 (CV22.DS7.TS1 Debt Review) → planned
2026-09-08 (Navigator approved the plan below) → in_progress 2026-09-08 →
validated 2026-09-08 (Navigator ran a real Pi session) → done 2026-09-08.

## Problem

`.pi/extensions/mirror-logger.ts` (`runPy`, `runPyBackground`) and
`.gemini/hooks/*.sh` invoke `uv run python -m memory …` directly. They never
enter `ts/src/frontDoor/cli.ts`, so the routing table in
`ts/src/frontDoor/routing.ts` does not decide which engine answers them. The
mirror home's `front-door.log` on the Navigator's install carried zero
`conversation-logger` lines on 2026-09-07 despite the burn-down ledger
recording that family as 15/15 "routed to TS": every flipped hook route —
`session-start --fast`, `session-maintenance`, `session-end-pi`, `welcome`,
the `user-prompt` hook — was reached by the lifecycle smoke and by the
skills, not by a live Pi or Gemini session.

CV22.DS7.TS1 moved exactly one call, the session-shutdown `backup --silent`,
through a new `runFrontDoor` helper (`node --no-warnings
--env-file-if-exists=.env ts/src/frontDoor/cli.ts …`), and the Navigator's
validation route observed the first hot-path front-door entry from a real
session. The remaining calls still bypass it.

## Expected Behavior

Every Mirror command the Pi extension and the Gemini hooks run enters the
front door, so the routing table — and each family's revert control — governs
production hot paths, and `front-door.log` records them. Unported commands
keep falling back to Python inside the front door; the switch is behavior-
preserving for them apart from Node startup latency. The ledger's "routed to
TS" claim then means what it says for live sessions, not only for the smoke.

## Impact

High. Until this lands, a flipped family's TS code is exercised in production
only where a skill happens to call it, while the ledger and the DS7 done
condition ("every routing flip produced no user-visible change") read as if
live sessions already ran through TS. A defect in a flipped hook route would
be found by the smoke, never by daily dogfooding — and a revert control set
in the environment would not revert the hook.

## Plan Or Decision

Planned 2026-09-08 (pending Navigator approval).

**Objective.** Every Mirror command the Pi extension and the Gemini hooks run
enters `ts/src/frontDoor/cli.ts`, so `routing.ts` and each family's revert
control govern live sessions, and `front-door.log` records them. No route
changes; no new port.

**Terrain, measured on the Navigator's machine.** Nine extension call sites
in `.pi/extensions/mirror-logger.ts`: `welcome --status-line` (status
refresh, on session start and after every agent turn), `session-start
--fast`, `welcome`, `session-maintenance` twice via the detached
`runPyBackground`, `log-user` with the prompt passed as an argv token,
`log-assistant` detached, `session-end-pi`; the shutdown `backup --silent`
already uses `runFrontDoor` (TS1). Five hook calls in `.gemini/hooks/`:
`session-start`, `log-user`, `mirror load`, `log-assistant`, `session-end-pi`,
`backup --silent`. Through the front door a ported command is faster
(`conversation-logger status`: 511 → 451 ms, no Python startup); an unported
one pays Node startup (`welcome --status-line`: 411 → 603 ms) until TS3
ports `welcome`.

**Route.**

1. `mirror-logger.ts`: make `runPy` and `runPyBackground` delegate to the
   front-door invocation (`node --no-warnings --env-file-if-exists=.env
   ts/src/frontDoor/cli.ts …`, cwd unchanged), keeping the helper names and
   every call site's arguments; the background variant keeps its
   detached/`windowsHide` spawn semantics with `node` in place of `uv`.
   Drop the `-m memory` prefix at the call sites, which is now the front
   door's concern. Rename `runPy` → `runFrontDoor` only if the diff stays
   readable; the name is not the point.
2. `.gemini/hooks/*.sh`: same substitution, keeping `|| true` and the
   redirections that make hooks fail-soft.
3. Redaction: the front door logs command and engine only, never argv — a
   test spawns `conversation-logger log-user` with a marker prompt through
   the front door and asserts the marker is absent from `front-door.log`.
   `mirror-logger.log` already truncates prompts to 80 chars; unchanged.
4. Timeout: `pi.exec` keeps 30 s; the front door's own Python fallback
   ceiling stays at its default. Record the measured per-turn cost of the
   status refresh and note that TS3 removes it.
5. Proof, TS1-style: `.pi` typecheck; a real Pi session (start, one prompt,
   quit) shows in `front-door.log` every expected command with its route,
   in order — `session-start`, `welcome`, `conversation-logger log-user`,
   `log-assistant`, `welcome`, `session-end-pi`, `backup`; the Gemini hooks
   are exercised by running each script by hand on a disposable home.
6. Ledger: one sentence under the DS7 burn-down ledger's rules stating that
   from this CR onward "routed to TS" means live Pi and Gemini sessions, not
   only the smoke and the skills.

**Affected files.** `.pi/extensions/mirror-logger.ts`,
`.gemini/hooks/session-start.sh`, `log-user.sh`, `log-assistant.sh`,
`session-end.sh`, one new front-door redaction test under
`ts/test/frontDoor/`, `burn-down-ledger.md`.

**Acceptance.** After a real Pi session, `front-door.log` carries the full
command sequence above with routes matching `routing.ts`; the session feels
unchanged (status line, welcome card, logging); `MIRROR_TS_CONVERSATION_LOGGER=0`
set in the shell before launching Pi makes the same sequence log `python`.

**Exclusions.** No new port; no route flip; Codex/Claude Code hooks are not
touched (they do not call `python -m memory` directly — verified by grep);
the per-turn latency of `welcome --status-line` is TS3's to remove, not this
CR's; `runtime` mutating subcommands stay wherever they are.

**Authority.** Commit and push follow the normal checkpoints. Nothing here
authorizes merge, release, or a change to the routing table.

## Evidence

Implementation, 2026-09-08:

- `.pi/extensions/mirror-logger.ts`: `runPy`/`runPyBackground` became
  `runMirror`/`runMirrorBackground` over a shared `FRONT_DOOR_ARGV`; the
  background variant keeps its detached/`windowsHide` spawn semantics with
  `node` in place of `uv`. All nine call sites dropped the `-m memory` prefix.
  TS1's separate `runFrontDoor` helper folded into `runMirror`. The venv-
  resolution comment that justified `uv run python` moved with the invocation:
  it now lives in the front door's Python fallback, which is the only place
  that still spawns Python.
- `.gemini/hooks/{session-start,log-user,log-assistant,session-end}.sh`: a
  shared `MIRROR` command variable after the `cd` that establishes the repo
  root; `|| true` and the redirections that make hooks fail-soft are unchanged.
  All four parse under `bash -n`.
- `ts/test/frontDoor/hookPayloadRedaction.test.ts` (new): a marker prompt
  through the real front door process is recorded as
  `conversation-logger ts exit=0` and is absent from `front-door.log`, while
  the message itself lands in the database; a failing invocation logs the error
  category, not the bad argument value.

Checks: `.pi` typecheck clean; `ts` typecheck, Biome (299 files), and the full
suite (1242 tests) green.

Gemini hooks exercised end to end on a disposable home with a generated demo
database, one hook per invocation, in order:

```text
session-start.sh   conversation-logger python exit=0   (full session-start is replay-gated)
log-user.sh        conversation-logger ts     exit=0   (+ the migrate-on-open record on a fresh DB)
                   mirror              python exit=0
log-assistant.sh   conversation-logger ts     exit=0
session-end.sh     conversation-logger python exit=0   (session-end-pi is replay-gated)
                   backup              ts     exit=0
```

The marker prompt and the assistant reply are absent from `front-door.log`;
both messages are in `messages`; the shutdown backup produced a dated archive.
With `MIRROR_TS_CONVERSATION_LOGGER=0` exported before the hook, the same
`log-user` logs `python` — the revert control reaching a live hook for the
first time.

## Validation

Natural route, run by the Navigator on his own install: start a new Pi
session, send one ordinary prompt, quit, then read `front-door.log`.

Expected observation: the whole turn appears with the routes `routing.ts`
prescribes, the prompt text does not appear, and the session behaves normally.
Pass: all of that holds. Fail: a missing command, an unexpected route, prompt
text in the log, or a degraded session.

Observed 2026-09-08, 11:48–11:49 local:

```text
11:48:32  conversation-logger  ts      session-start --fast
11:48:33  welcome              python  welcome card, then the status line (TS3 ports these)
11:48:52  conversation-logger  python  session-maintenance -- the DETACHED background call,
                                       replay-gated, so Python answers
11:49:10  conversation-logger  ts      log-user
11:49:17  journeys             ts      a skill read during the turn
11:49:27  conversation-logger  ts      log-assistant
11:49:27  welcome              python  status refresh after the turn
11:49:46  conversation-logger  python  session-end-pi, replay-gated
11:49:47  backup               ts      shutdown archive
```

Every expected entry is present and every route matches the table, including
`runMirrorBackground`'s detached `session-maintenance`. Verified beyond the
log: every line carries the fixed six-field shape with an empty detail (no
payload, no path); the turn's messages are in `messages`; the shutdown
archive `memory_20260908_114946.zip` passes `unzip -t`. Before this change the
same session produced no `conversation-logger` or `welcome` entries at all.

**Navigator accepted 2026-09-08**, including the qualitative half of the pass
condition: the session behaved normally.

## Review

Proportionality: the change is confined to callers — two helper bodies, four
hook scripts, one new test — and adds no abstraction beyond a shared argv
constant per runtime. No routing entry, no port, no flip.

Debt introduced: none. Debt carried: the `welcome --status-line` refresh costs
~190 ms more per turn until TS3 ports `welcome`; it is asynchronous and after
the turn, and it is TS3's scope, not new debt.

Debt found while reviewing, captured rather than fixed: **CR064** — `main()`
logs `decision.engine`, so a TS route that falls back to Python inside dispatch
(the replay-gated logger subcommands) is recorded as `ts`. Harmless while the
log covered only skills; it matters now that the log is the production evidence
this CR created, and that the burn-down ledger points at it.

## Outcome

Done 2026-09-08. Both runtimes enter the front door: the routing table governs
live Pi and Gemini sessions, `MIRROR_TS_*=0` reverts a live hook (proven on the
Gemini side), and `front-door.log` is the record of what answered. The
burn-down ledger's rules now state that flips recorded before this date were
true of the routing table and the smoke, and became true of daily sessions
today. Delivered on `mirror-ts-core` in commit `6238e89`; validation evidence
above. Follow-up: CR064.

## Outcome

_Pending._

## Provenance

Found while planning CV22.DS7.TS1 (recorded in its plan's Terrain section)
and captured at that story's Debt Review on 2026-09-08.
