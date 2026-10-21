[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR153 — A home's Pi backfill imports another home's sessions

## Problem

Session-start maintenance runs the Pi backfill (`ts/src/conversation/backfill.ts`): it
reads every session file under `PI_SESSIONS_DIR`, else `~/.pi/agent/sessions`, and
imports each one that ended after this home's birth (CR121) and whose session the
home's hooks do not already track (`runtime_sessions`). Nothing asks which home the
session belongs to. A Pi session the Pi extension logged live into home A is untracked
in home B, so B's maintenance imports it — every message, then titles it through the
provider and, at its close, extracts memories from it.

CR106 and CR121 narrowed the import to sessions after the home's birth, which keeps a
new home from swallowing a lifetime of history. They did not scope it to the home: a
new home still takes every Pi session the person touches after it is born, from every
other home on the machine. Homes are the boundary a person draws between work and
personal life, or between clients; the import crosses it silently.

## Expected Behavior

A home imports only Pi sessions that belong to it — a session the Pi extension logged
for this home and could not finish (the case the backfill exists for). A session that
another home tracks, or that carries another home's identity, is not read. If a Pi
session file cannot say which home it belongs to, the backfill imports nothing from it
into a home younger than the session's start, or the extension starts recording the
home in the session it writes.

## Impact

Privacy between homes: another home's conversations — their content, their titles,
their memories — copied into a home that should not have them, and sent through the
provider again for titling. The trigger is ordinary: creating a second home, as any
developer, tester, or person splitting work from personal use does, then starting a
session on a hook-carrying runtime while Pi sessions are active elsewhere.

## Plan Or Decision

Captured, unassigned, 2026-10-20, from CV21.DS5.US3's live route, at the plan's stop
condition. The route's own exposure — a cell on the person's real `HOME` without
`PI_SESSIONS_DIR` pointed away — is fixed in the route, not here: every cell now points
the backfill at an empty directory, and `verify` asserts the scratch home holds no
`pi` conversation. Current Focus unchanged.

Selected as Current Focus 2026-10-21. Measured before planning, read-only, on the
maintainer's machine: its production home and its development home, counts and dates
only.

- **The leak has run here since July, both ways.** The development home began on
  2026-07-13 as a copy of the production home: 345 Pi sessions are bound to the same
  conversation id in both, the last of them ended that afternoon, and both ledgers
  give the same birth, 2026-03-25 — so CR121's floor has never applied between them.
  Since the copy, the development home has imported 427 conversations the production
  home logged live (21,907 messages), and the production home 116 the development
  home logged live (4,913 messages). Both were still importing on 2026-10-21. Titling
  them took 411 `conversation_title` calls (US$ 0.27).
- **None was mined, but every one is listed.** Extraction selects only conversations
  with a journey, and an import carries none: no memory came from any of the 543, and
  none has a conversation embedding. The capture's "extracts memories from it" does
  not happen to an import. Listing does: an import's `started_at` is the moment it was
  imported, so it lists as the newest conversation.
- **The capture's check could not have seen them.** "No cross-home conversations for
  the journeys concerned" — an import has no journey.
- **The backfill fills almost nothing of its own.** It skips any session that has a
  `runtime_sessions` row, so a session the extension logged even one turn of was
  never its to fill (the capture's "logged … and could not finish"). What it imports
  is a session with no logged turn at all. Since the copy, 34 of those went into both
  homes. Neither home's `mirror-logger.log` names 33 of them (the extension names a
  session there when it closes it): most likely sessions of validation routes'
  scratch homes, since deleted, or of Pi without Mirror. The development home's
  extension closed the 34th on 2026-10-12 without having logged a turn. That one is
  the only gap the backfill filled for its own home in three months, and it was
  copied into the production home as well.
- **The backfill guesses where Pi keeps its sessions.** It reads `PI_SESSIONS_DIR`,
  else `~/.pi/agent/sessions`. Pi itself takes `--session-dir`,
  `PI_CODING_AGENT_SESSION_DIR`, and a `sessionDir` setting, none of which the
  backfill knows. `.env.example.advanced` already names this CR's exposure as a reason
  to set `PI_SESSIONS_DIR` ("a second mirror home on the same machine that should not
  pick up the primary user's Pi sessions"); the second home here never set it.
- **A test once ran the backfill against a real home.** Five conversations in the
  development home are the backfill golden's own fixture sessions
  (`ts/test/fixtures/backfill/pi-sessions`, from the `mirror-ts-core` worktree),
  imported at the golden's frozen clock, 2026-09-03 12:00 UTC. Deleting the backfill
  closes that path as well.

*Method.* Both databases were opened with SQLite's `?immutable=1`: `mode=ro` cannot
open a database in WAL mode whose `-shm` file is absent. An import is told apart by
construction — `importClosedConversation` stamps `started_at` at import time and
`ended_at` from the session's last message — so `interface = 'pi' AND
julianday(started_at) >= julianday(ended_at)` holds for every import and for no live
conversation short of clock skew. A conversation copied with the database is the same
session bound to the same conversation id in both homes. A conversation one home
logged live and the other imported is the same session bound to different ids,
import-shaped on one side only. 21 of the 543 sit beside a conversation still open in
the other home (`ended_at` null); they are counted as logged live there.

**Decided 2026-10-21 by the Navigator: session maintenance stops importing Pi
sessions.** A home's Pi conversations become exactly the ones its extension logged
live. Two alternatives were weighed:

- *A claim at session start.* The extension already passes its session file to
  `session-start --fast`; the home could record it there and import only a claimed
  session no turn was logged for. It keeps the one recovery in three months, and
  costs a table, a migration, and a claim lifecycle — a quiet period, so a running
  session is not imported, and a deletion once a claim is resolved, so claims do not
  pile up.
- *A mark in the session file.* The extension writes its home into the file
  (`pi.appendEntry`), and the backfill imports only files that carry its own.
  Rejected: every home still opens every other home's files to look for the mark,
  and again at every start (CR121's F2), and a path is a weak name for a home — a
  moved home loses its sessions.

Retiring was chosen because it is the only option that leaves no home reading Pi's
files at all, and the measurement says what it gives up is close to nothing. A person
who wants a Pi session that Mirror did not log could ask for it to be imported on
request: that is a feature with its own story, as the
[CR121 decision](../../decisions.md#a-new-mirror-home-imports-only-the-pi-sessions-that-are-newer-than-itself)
said of earlier history, and not something maintenance does in the background.

Reviewed 2026-10-21 through six lenses at the Navigator's request ([record
below](#review-2026-10-21)); every finding folded into the plan at the Navigator's
direction, and three follow-ups captured: CR154, CR155, CR156. Plan approved
2026-10-21 → `planned`. Started the same day: Driver `@viniciusteles`, Delivery
`main` → `in_progress`. Implemented the same day, test first
([evidence below](#implementation-evidence-2026-10-21-driver)). Navigator validation
route run by @viniciusteles the same day, every step observed as stated after one
re-run of step 3 ([record](#navigator-validation-2026-10-21-viniciusteles)) →
`validated`. Debt reviewed the same day — no debt in the change, three follow-ups
already captured ([record](#debt-review-2026-10-21)) — and closed at the
Navigator's direction → `done`.

### Review, 2026-10-21

Six lenses, chosen for what this change touches: the security engineer (a boundary
between homes), the database architect (evidence read from two real databases, and
rows left behind), the engineer (deletions and tests), quality assurance (the route,
and checks outside `npm test`), the product designer (a behavior removed, a promise
rewritten), and the devops engineer (rollout, and what a lost safety net hides). All
six endorsed retiring; none raised a blocker.

- **S1, folded — a home cannot protect itself from a neighbour on old code.** The
  change stops the home whose install carries it; another home still on 0.36.0 keeps
  importing. On the maintainer's machine the production home's Pi sessions run the
  globally installed package, not a checkout, so it keeps importing the development
  home's sessions until a release is installed there. → Objective, Rollout.
- **S2, folded — the route must not leak if it runs on the wrong build.** Step 3 runs
  only after step 2 passes, and step 1 sets `PI_SESSIONS_DIR` on its command, not in
  the shell. → Validation route.
- **S3, folded — the copies are in the backups too.** Every dated archive and the
  pre-write backup taken since July hold them. → Behavior 6; CR154.
- **D1, folded — the measurement's predicates.** → *Method*, above.
- **D2, folded — a deletion already exists.** `deleteConversation`, behind
  `discard-current`, removes messages and embeddings and unlinks memories, the
  `llm_calls` ledger, and the session binding; a removal command reuses it. No import
  has a conversation embedding (0 of 543). → CR154.
- **D3, folded — the ledger comment.** One neutral sentence replaces it, so no reader
  infers a birth from the ledger again. → Behavior 4.
- **D4, captured — a copied home is the same home twice:** same ids, same birth, same
  history. → CR156.
- **E1, folded — test first, two cases.** Today's code reads one directory per run
  (`PI_SESSIONS_DIR`, else the default), so one test holding a session in each would
  pass half of its assertions on the old code. → Order of work.
- **E2, folded — the fixture helper's Pi-only parts go:** `PI_SESSIONS_DIR`,
  `seedTrackedSession`, `snapshotState`'s `pathRoot` and its `<sessions_dir>`
  placeholder, and the `pi_sessions` member of `BackfillGolden`. → Affected files.
- **E3, folded — the golden's `pi_sessions` section stays, frozen and untyped,** as
  CV21.DS4.TS5 left its `codex` section. → Affected files.
- **E4, folded — the session-composite golden changes on purpose:** a deliberate
  divergence from the recorded Python report, in the same commit as the report. →
  Order of work.
- **E5, confirmed —** `homeDir` stays in the logger runtime: `loggerCli` passes it on.
- **Q1, folded — step 4 proves maintenance ran** before it counts what maintenance did
  not do. → Validation route.
- **Q2, folded — one case through `session-start`,** the command Claude Code's and
  Antigravity's SessionStart hooks run. → Order of work, Acceptance.
- **Q3, folded —** the gate in S2.
- **Q4, folded — the CI smokes:** `conversation_lifecycle_smoke.ts` pins the report and
  is not in `npm test`; the checks and the debt review list the CI smokes. →
  Acceptance.
- **P1, folded and captured — "the person's decision" needs the means:** a read-only
  way to see a home's imports now, and a command to list and remove them later. →
  Behavior 6; CR154.
- **P2, folded — the Getting Started promise** names the three things Mirror does not
  import. → Affected files.
- **P3, folded as the rollout recommendation — a patch release.** → Rollout.
- **O1, folded — rollout is per install,** with the production install's update and
  check on the maintainer's machine. → Rollout.
- **O2, captured — `runtime diagnose` does not read the Pi extension's error lines,** so
  a session whose logging never reached the core goes unreported, now that no import
  catches it. → CR155.
- **O3, folded — the release reads CI before promoting.** → Rollout.

### Plan (approved 2026-10-21)

**Objective.** A home holds only the Pi conversations it logged. Session maintenance
reads no Pi session file, so no home imports another home's sessions, a deleted
scratch home's, or a session Pi ran without Mirror — whichever runtime runs the
maintenance. The protection is per install: a home's sessions are safe from another
home's maintenance once the install that other home runs carries the change
([Rollout](#rollout)).

**Behavior.**

1. *Maintenance.* `sessionMaintenance` runs four steps — stale closes, retitling,
   extraction, deferred close tails. Its report drops the `Backfilled Pi sessions`
   line rather than printing a 0 that can never change.
2. *The live path.* Unchanged: the Pi extension's session start, `log-user`,
   `log-assistant`, and `session-end-pi`.
3. *`PI_SESSIONS_DIR`.* Inert. Nothing reads it, and a `.env` or a route that sets
   it keeps working.
4. *What only the backfill used goes with it.* `backfill.ts` — the walk, the parse,
   `homeBornAt`, the `notBefore` floor; `sessionImport.ts`, whose only caller it has
   been since CV21.DS4.TS5 retired the Codex importer; the tests and fixtures that
   pinned them. The comment at the `_migrations` ledger that names `homeBornAt` as its
   reader becomes one neutral sentence: the ledger records which migrations ran and
   when, and a copied database carries its source's ledger, so no birth is inferred
   from it.
5. *It stays gone.* A retired-surfaces row, `pi-session-backfill` (story CR153): the
   deleted paths absent, and `backfillPiSessions`, `resolvePiSessionsDir`,
   `homeBornAt`, `importClosedConversation`, `PI_SESSIONS_DIR`, and
   `Backfilled Pi sessions` absent outside the history, except where
   `docs/reference/configuration.md` and `.env.example.advanced` record
   `PI_SESSIONS_DIR` as inert and where a test sets it to prove it inert.
6. *What is already imported stays.* This CR removes the cause, not the copies, and
   the backups hold copies too. A person can list a home's imports now, read-only —

   ```bash
   sqlite3 ~/.mirror-minds/<user>/memory.db \
     "SELECT id, title, started_at FROM conversations
       WHERE interface = 'pi' AND julianday(started_at) >= julianday(ended_at)
       ORDER BY started_at"
   ```

   — and the release note says so. Listing and removing them as a command is CR154.
7. *The record.* A decision in decisions.md — maintenance imports no Pi session, and
   a home's Pi conversations are the ones it logged live — superseding the mechanism
   of the CR121 decision, whose floor goes with the import it limited.

**Order of work.**

1. Three cases first, through the real `conversation-logger` port, each run against
   today's code and seen red: `session-maintenance` with a fresh, untracked Pi session
   in `<HOME>/.pi/agent/sessions` and `PI_SESSIONS_DIR` unset; `session-maintenance`
   with one under a `PI_SESSIONS_DIR`; and the full `session-start` with one in the
   default directory. Each asserts no `pi` conversation and no runtime session after
   the run, and the report's exact lines.
2. Then the removal. The three cases go green, and the report's goldens and pins
   change in the same commit as the report.

**Affected files.**

- `ts/src/conversation/sessionComposites.ts` — the step and
  `MaintenanceDeps.backfillPiSessions` go.
- `ts/src/conversation/loggerRuntime.ts` — the wiring, `piSessionsDir`, and
  `PI_SESSIONS_DIR` in its environment go.
- `ts/src/conversation/backfill.ts`, `ts/src/conversation/sessionImport.ts` —
  deleted.
- `ts/src/conversation/transcriptBackfill.ts` — its `getOr` comment, which points at
  `backfill.ts`, says what it means on its own.
- `ts/src/db/migrations.ts` — the ledger comment.
- `ts/src/guards/retiredSurfaces.ts` — the new row; the `codex-wrapper` row's
  exemption for `backfill.ts` goes with the file; the `conversation-metadata-backfill`
  comment stops saying the Pi backfill stays.
- Tests. Deleted: `backfill.test.ts`, `homeBornAt.test.ts`, and the `pi-sessions`
  fixtures. `backfillFixture.ts` loses its Pi-only parts (E2), and the golden's
  `pi_sessions` section stays frozen and untyped (E3). The report pinned without the
  line in `sessionComposites.test.ts`, `session-composite.golden.json` (a deliberate
  divergence from the recorded Python report), `loggerCli.test.ts`, and
  `ts/smoke/conversation_lifecycle_smoke.ts`, which also loses its `PI_SESSIONS_DIR`
  pin. `loggerRuntime.test.ts` and `loggerCli.test.ts` lose their backfill cases;
  `loggerCli.test.ts` gains the three of the order of work. The retired-surfaces test
  gains the row.
- Docs: `REFERENCE.md` (the `PI_SESSIONS_DIR` row goes);
  `docs/reference/configuration.md` (§ Inert values gains it);
  `.env.example.advanced` (`INERT since CR153`); `docs/getting-started.md` (the Pi
  paragraph: "Mirror records a Pi session as it happens, in the home that session
  runs against. It never imports Pi sessions afterwards: not your history from before
  Mirror, not sessions you run without it, and not another home's."); and
  `docs/project/decisions.md`.

**Acceptance.**

1. A Pi session newer than the home and bound to no runtime session, under
   `~/.pi/agent/sessions` or under a `PI_SESSIONS_DIR`, is not imported by
   `session-maintenance` or by the full `session-start`.
2. The maintenance report has exactly the four step lines.
3. A Pi session the extension logs live is recorded as before.
4. The three new cases were red against the code before the change and are green
   after it.
5. Nothing in `ts/src` reads a Pi session file. The retired-surfaces guard passes, and
   fails on a planted `backfillPiSessions`.
6. `npm run typecheck`, `npm run lint`, `npm test`, `git diff --check`, the repository
   checks, the smokes on the development guide's list — the CI smokes, which `npm
   test` does not run, among them — and the suite on a PATH with no `mirror` are green.

**Validation route (Navigator).** The checkout by path, the published 0.36.0 as the
control, and scratch homes and a scratch sessions directory under one temporary root.
The provider key is read as usual; the only content the control can title is two
synthetic lines.

```bash
M=~/.local/mirror-dev/bin/mirror; P=/opt/homebrew/bin/mirror
"$M" runtime status | grep -E 'Version|Install'   # Install: clone
"$P" runtime status | grep -E 'Version|Install'   # Version: 0.36.0
R=$(mktemp -d /tmp/cr153.XXXXXX)
home() { mkdir -p "$R/$1/$1"; export MIRROR_HOME="$R/$1/$1" MIRROR_USER="$1"; }
other() {  # a session another home logged, written now
  mkdir -p "$R/sessions/--elsewhere--"; t=$(node -e 'console.log(Date.now())')
  printf '%s\n' \
    '{"type":"session","version":3,"id":"cr153","timestamp":"2026-10-21T00:00:00.000Z","cwd":"/elsewhere"}' \
    "{\"type\":\"message\",\"message\":{\"role\":\"user\",\"content\":\"a line from another home\",\"timestamp\":$t}}" \
    "{\"type\":\"message\",\"message\":{\"role\":\"assistant\",\"content\":\"its reply\",\"timestamp\":$((t + 1))}}" \
    > "$R/sessions/--elsewhere--/other.jsonl"
}
```

1. *The control reproduces the leak.* `home a; "$P" list journeys >/dev/null; other;
   PI_SESSIONS_DIR="$R/sessions" "$P" conversation-logger session-maintenance` →
   `Backfilled Pi sessions: 1`; `"$P" conversations` lists it.
2. *The fix, same setup.* `home b; "$M" list journeys >/dev/null; other;
   PI_SESSIONS_DIR="$R/sessions" "$M" conversation-logger session-maintenance` → the
   four step lines and no `Backfilled`; `"$M" conversations` lists nothing. **If step
   2 prints a `Backfilled` line, stop here:** the binary is not the change, and step 3
   would copy your live sessions into `/tmp`.
3. *The real Pi history, no pin.* `home c; "$M" list journeys >/dev/null;
   touch "$R/c/born"`; send one message in any open Pi session;
   `find ~/.pi/agent/sessions -name '*.jsonl' -newer "$R/c/born" | wc -l` → 1 or more,
   a session 0.36.0 would take (at 0 the step proves nothing); then
   `"$M" conversation-logger session-maintenance; "$M" conversations` → nothing.
4. *The live path still logs.* In the checkout,
   `MIRROR_HOME="$R/c/c" MIRROR_USER=c pi --session-dir "$R/pi"`, one prompt,
   `/quit`. After a few seconds:
   `grep -c 'Conversation maintenance complete' "$R/c/c/mirror-logger.log"` → 1 or
   more (maintenance ran); `grep -c Backfilled "$R/c/c/mirror-logger.log"` → `0`;
   `"$M" conversations` → that one `pi` conversation. The session lives under
   `$R/pi`, so no real home can import it, whatever version runs there.
5. `rm -rf "$R"; unset MIRROR_HOME MIRROR_USER`.

Pass: step 1 imports the synthetic session; steps 2 and 3 import nothing; step 4's
maintenance ran without a backfill line and its exchange is logged live. Fail: any `pi`
conversation in `b` or `c` other than step 4's, a `Backfilled` line from the checkout,
or step 3's count at 0.

#### Rollout

The review recommends a patch release (0.36.1): the defect ships in 0.36.0, and the
only protection was a setting documented for "multi-user setups". The release itself
is the Navigator's decision. Before promoting it, read `gh run list` — the release
doctor does not read CI, and the CI smokes are not in `npm test`. After it, on the
maintainer's machine, update the production install and check that its maintenance
report has no `Backfilled` line. The note tells anyone with more than one home to
update every install that has one, says what was copied and how to see it (Behavior
6), and names what replaces importing a Pi session run without Mirror: running Pi with
the Mirror package, so the session is logged live.

**Non-goals.**

- Listing and removing what is already imported:
  [CR154](cr154-a-home-cannot-list-or-remove-the-pi-conversations-it-imported.md).
- `runtime diagnose` reading the Pi extension's error lines:
  [CR155](cr155-runtime-diagnose-does-not-read-the-pi-extension-s-error-lines.md).
- What copying a home's database makes:
  [CR156](cr156-a-home-made-by-copying-another-s-database-is-the-same-home-twice.md).
- An import command for a Pi session file.
- [CR151](cr151-the-transcript-backfill-writes-a-session-s-replies-into-other-sessions-conversations.md)
  and [CR152](cr152-under-codex-exec-the-plugin-s-stop-and-session-end-hooks-never-reach-mirror.md).
  CR151 is this defect's shape in the transcript backfill — ownership decided by a
  time window rather than an identity — and is its own change.
- The Pi extension, which needs no change.
- `runtime diagnose` naming `PI_SESSIONS_DIR` when it is set.

**Authority.** Approved 2026-10-21 → `planned`; started the same day with Driver
`@viniciusteles` and Delivery `main` → `in_progress`. Commits follow the project's
checkpoints; push and release are separate decisions.

## Evidence

CV21.DS5.US3 route, 2026-10-20, scratch home `us3user` from the registry's
`mirror-mind@0.36.0`, born 18:10 UTC. The route's Claude Code cell runs with the real
`HOME` (Claude's login is keyed to it, CV21.DS5.TS1). At 20:40:58 UTC, two seconds into
the cell's first session, maintenance imported four Pi conversations — four of the
person's sessions from that day, across both real homes, 19 to 140 messages each,
`title_source: startup_maintenance` — and the scratch ledger shows seven
`conversation_title` calls to `google/gemini-2.5-flash-lite` (US$ 0.009) after it. No
memories were extracted before the scratch home was removed. The database was `0600`;
the copy was deleted by the route's `clean` the same evening. The real homes, both
old and each tracking its own sessions live, show no cross-home conversations for the
journeys concerned.

### Implementation evidence (2026-10-21, Driver)

**Test first, as the plan ordered.** The three cases went into `loggerCli.test.ts`
before anything else changed, and against the code before the change all three
failed — 3 of 3 — each the same way: the foreign session imported
(`Backfilled Pi sessions: 1`) and titled in the same run
(`Retitled pending conversations: 1`), from the default directory, from a
`PI_SESSIONS_DIR`, and through the full `session-start`. After the removal: 3 of 3
pass.

**What changed.** `backfill.ts` and `sessionImport.ts` deleted, with
`backfill.test.ts`, `homeBornAt.test.ts`, and the `pi-sessions` fixtures. The
maintenance step and `MaintenanceDeps.backfillPiSessions` gone; the logger runtime
holds no Pi sessions directory. `backfillFixture.ts` lost its Pi-only parts, and the
backfill golden's `pi_sessions` section stays frozen and untyped beside `codex`. The
session-composite golden lost the line from all eight maintenance reports and their
steps — the recorded Python report, diverged from on purpose. The ledger comment, the
transcript backfill's `getOr` comment, and the `conversation-metadata-backfill` comment
say what is true now. The `pi-session-backfill` row and its tests; the `codex-wrapper`
row's exemption for the deleted file gone. `REFERENCE.md`, the configuration
reference's inert values, `.env.example.advanced`, Getting Started, and decisions.md
(the new decision, and the CR121 one marked superseded).

**Checks.** `npm run typecheck` clean; `biome check .` clean (668 files); `npm test`
3384 tests, 3381 pass, 0 fail, 3 skipped (pre-existing); the suite on a PATH with no
`mirror`: green. Repository checks clean: retired surfaces (with
`pi-session-backfill`), pack contents (491 files), doc links, skill command parity,
the plugin build check. Smokes: migration structural parity PASS, bootstrap custody
parity PASS, migrate-on-open PASS, conversation lifecycle all checks passed, builder
lifecycle 60/60, extension catalog PASS, `smoke_mirror_mcp.sh` PASS,
`smoke_npm_package.sh` 76 passed, 0 failed. `smoke_claude_plugin.sh` passed every step
through the plugin's hooks and its MCP entry, then failed its negative probe with
[CR142](cr142-the-plugin-smoke-s-negative-probe-fails-on-a-machine-with-a-global-mirror-hook.md)'s
own message — this machine has a global `mirror-hook` in `/opt/homebrew/bin`.
Pre-existing and open; CI's runner has none.

**Driver smoke through the real binaries,** the route's steps 1 to 3, under one scratch
root:

1. The control, `mirror-mind@0.36.0` (`Install: package`): `Backfilled Pi sessions:
   1`, then `Retitled pending conversations: 1` — one `conversation_title` call,
   US$ 0.00003 — and `conversations` lists "Line from another home".
2. The checkout (`Install: clone`), same setup: the four step lines, no `Backfilled`,
   no `pi` conversation.
3. The real Pi history, no pin: one session file written after the scratch home's
   birth — this very session — and nothing imported: no `pi` conversation, no `pi`
   runtime session, `No conversations found.` A first attempt inside a single command
   counted 0 files: Pi writes a session at message boundaries, which is why the route
   asks for a message in an open session before it counts.

Step 4, a live Pi session against a scratch home, is the Navigator's. The scratch root
was removed.

### Navigator validation (2026-10-21, @viniciusteles)

The route, against the checkout's binary by path (`Install: clone`, at `5f7e5cc7`) and
the published `mirror-mind@0.36.0` (`Install: package`), in scratch homes under one
temporary root:

1. The control: `Backfilled Pi sessions: 1`, then `Retitled pending conversations: 1
   (1.7s)`; `conversations` listed "Line from another home", 2 messages.
2. The change, same setup: the four step lines, no `Backfilled`; `No conversations
   found.`
3. First run inconclusive: the birth marker's `touch` was skipped, so `find` reported
   no such file and counted 0 — by the route's own rule, proof of nothing, though
   maintenance imported nothing. Re-run, self-contained: 1 Pi session file written
   after the scratch home's birth (this CR's own conversation, a message sent for the
   purpose), the four step lines, `No conversations found.`
4. Live Pi in the checkout against the scratch home, its session under the scratch
   root (`pi --session-dir`), one exchange: `Conversation maintenance complete` 1,
   `Backfilled` 0; `conversations` listed one conversation of 2 messages, "Greeting
   exchange".
5. The scratch root removed.

Accepted by the Navigator: "Validated."

### Debt review (2026-10-21)

**Proportionality.** The change deletes more than it adds: `5f7e5cc7` touches 36
files, 326 insertions against 1,006 deletions. Two source modules (361 lines) go with
their tests and fixtures; one guard row and its tests, three test cases, and the docs
come in. Nothing new is modeled — no table, no migration, no setting.
Proportionate.

**Debt left on purpose, captured:**

- [CR154](cr154-a-home-cannot-list-or-remove-the-pi-conversations-it-imported.md) —
  the copies an earlier version imported stay until a person can list and remove
  them; until then the selector in the Outcome lists them.
- [CR155](cr155-runtime-diagnose-does-not-read-the-pi-extension-s-error-lines.md) —
  a session whose logging never reached the core is now missing without a word, where
  the import used to bring it in; `runtime diagnose` should say so.
- [CR156](cr156-a-home-made-by-copying-another-s-database-is-the-same-home-twice.md) —
  a copied home is the same home twice; the docs should say so.

**Recorded, not owed:**

- The backfill golden keeps its `pi_sessions` section, frozen and untyped beside
  `codex`, by CV21.DS4.TS5's precedent.
- The protection reaches a home only through an install that carries it. On the
  maintainer's machine the production home runs the published package, so it keeps
  importing the development home's sessions until a release is installed there
  ([Rollout](#rollout)). The release is the Navigator's decision; its note owes the
  behavior change, the selector below, and the instruction to update every install
  that has a home.
- `smoke_claude_plugin.sh`'s negative probe failed on this machine as CR142 records;
  CI's runner has no global `mirror-hook`.

**The CI smokes**, which `npm test` does not run, were run before the push and are
listed in the implementation evidence — the lesson of CR149's red push after Done.

**Found on the way, not this CR's:** `REFERENCE.md`'s Paths table still lists
`EXPORT_DIR` and `TRANSCRIPT_EXPORT_DIR`, which the configuration reference records as
inert since CV22.DS10.TS5. Not captured; offered to the Navigator.

## Outcome

**Done 2026-10-21.** Session maintenance imports no Pi session: a home's Pi
conversations are the ones the Pi extension logged into it, as they happened. The
backfill, the import seam only it still used, and CR121's birth floor are deleted;
`PI_SESSIONS_DIR` is inert; the `pi-session-backfill` row keeps them gone. Validated
by the Navigator, the real Pi history included: the published 0.36.0 took another
home's session in the setup the change left alone. Shipped on `main` in `9e1ed81b`
(the review, the approval, the captures) and `5f7e5cc7` (the change).

**To see what an earlier version imported into a home,** read-only:

```bash
sqlite3 ~/.mirror-minds/<user>/memory.db \
  "SELECT id, title, started_at FROM conversations
    WHERE interface = 'pi' AND julianday(started_at) >= julianday(ended_at)
    ORDER BY started_at"
```

The home's dated backups and its pre-write backup hold the same rows. Removing them
is CR154.

**Owed to the release that carries it** ([Rollout](#rollout)): the note's behavior
change, the selector above, and the instruction to update every install that has a
home.
