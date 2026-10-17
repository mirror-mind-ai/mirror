# Plan — CV21.DS4.US4

## Objective

Measure Codex at **L4** on the installed version, through the shipped plugin alone,
installed by the path US1 ships, in one live session the Navigator runs with a real
provider key — and record it with version, binary, and date (DS12's evidence rule).
The session proves, together, what US1, TS2, and TS3 built: the marketplace install;
the skills, the Operating Instructions as a developer message, Mirror Mode on an
ordinary turn and on `$mirror-mind:mm:mirror`; the MCP server's tools reached through
`tool_search`; every prompt and reply logged as `codex`, the Mirror question without
its form, the `$`-skill turn absent; the session closed inside Codex's 1 s with the
tail deferred and finished at the next start. The parity row moves from "L4
reachable" to **L4**. This story changes no code unless the session finds a defect,
which is a stop condition and a Navigator decision.

## Scope

**1. `route.sh`, on DS2's live pattern**, in this package. Steps:

- `setup`: pack this tree, install into a scratch prefix, `mirror init ds4` and
  `mirror seed` into a scratch Mirror home (so `list_journeys` has journeys to list
  and Mirror Mode has an identity), a scratch person `HOME` whose
  `~/.config/mirror/env` names the scratch Mirror home, a scratch `CODEX_HOME`
  (`chmod 700`). Codex installed **through the shipped marketplace at the scratch
  package root** — `codex plugin marketplace add "<prefix>/lib/node_modules/mirror-mind"`,
  `codex plugin add mirror-mind@mirror-mind` — the path US1 ships, not a route-written
  one. No skills link, no `AGENTS.md`.
- `live`: archives the previous capture rather than deleting it (DS12 lost three
  sessions' raw evidence that way; decision 3); records `codex --version`,
  `which -a codex`, the date, a session id; copies the Navigator's `~/.codex/auth.json`
  into the scratch `CODEX_HOME` when present — their own token, on their own machine,
  mode 600 inside a 700 directory (decision 1) — unless `DS4_US4_COPY_AUTH=0`, which
  takes DS12's path and lets Codex ask for a login inside the scratch home; runs
  `preflight`, which resolves the Mirror
  home and the provider key exactly as the session's Mirror processes will and stops
  before a turn is spent if either is wrong; prints the turn script; `exec`s `codex`
  in an empty scratch project. The provider key is **the Navigator's real key**,
  read by the route from their `~/.config/mirror/env` into the session environment
  only (never written into the scratch config, never printed): TS2's claim is "with
  a key set", and a session with no key would not exercise it. Cost: one Mirror
  Mode load, one extraction and one metadata finalization at the next start — cents.
- `check`: what the session left, grouped by the story each line proves (US1
  install, US8/TS3 logging, TS2 close, D13/MCP; decision 5), the run selected by its
  id in the turn text with a time fallback (decision 3). Read from the scratch
  database and Codex's own files through `node:sqlite`; no model call, no `sqlite3`
  binary.
- `finish`: `mirror conversation-logger session-maintenance` with the session
  environment — the composite the next SessionStart runs — and what it did, with
  the maintenance output and the ledger rows (role, model, cost) captured into the
  evidence: the first real-world cost figure for the deferred tail (decision 5).
- `DS4_US4_DRY=1` prepares each step and stops before the session starts (the
  Driver's check). `setup` refuses to replace a directory that is not its own.
  `untouched` compares the Navigator's real `~/.codex`, `~/.claude`, and
  `~/.config/mirror` against a sha256 baseline taken at `setup` (reads leave no
  trace there, which is the point). `clean` removes the scratch directory, token copy
  included, and **runs at Done**: the Done record says so (decision 1).
- `setup` re-asserts US1's observations on the real binary, for free: the plugin
  cached at the package version, the `config.toml` entry, and as many `mm-*` skills in
  `codex debug prompt-input` as the plugin has (decision 5).
- The helpers DS2's route wrote (`preflight`, `config_manifest`, `person_home`) are
  copied with their comments, not sourced: a story package's route is standalone, as
  every route in this Delivery Story is.

**2. The turn script** (four turns, typed exactly; the id is the run's):

```text
Turn 1:  $mirror-mind:mm:mirror DS4-<id>: should I raise my course price from 297 to 497 reais?
         Expect: Mirror Mode, a first-person answer (a "◇ <persona>" line is fine).
Turn 2:  DS4-<id> probe: without using any tool, answer (a) yes or no: does your context
         hold a document titled "Mirror Mind — Operating Instructions"? (b) yes or no:
         did this turn arrive with a block headed MIRROR MODE ACTIVE?
         Expect: yes, yes. The probe comes BEFORE the skill turn: the inject hook
         delivers the owed injection on the first ordinary turn after Mirror Mode
         activates (`needsInject`: active and not yet injected), and a skill turn
         would absorb it. Found while writing the route.
Turn 3:  $mirror-mind:mm:journeys
         Expect: the journeys list rendered. This turn must NOT be logged (TS3).
Turn 4:  DS4-<id>: use tool_search to find the mirror-mind MCP server's list_journeys
         tool, call it, and tell me the journey slugs it returns.
         Expect: the model finds the tool, calls it, and names the seeded journeys. A
         model that still does not reach the tool is an honest finding about Codex's
         plugin-tool exposure, not a Mirror defect (decision 2).
Also:    type /hooks and read SessionEnd's budget; type /mcp and read mirror-mind's tools.
Then quit the session (the SessionEnd hook runs), and run:  bash route.sh check
```

**3. What `check` reads**, each a pass/fail line:

- Codex 0.162.1 (or the installed version, re-probed if it moved), binary, date.
- One conversation labelled `codex`, bound to a runtime session labelled `codex`.
- Messages, in order: Turn 1's question **without** `$mirror-mind:mm:mirror`, its
  reply; Turn 2's probe and reply; Turn 4's prompt and reply — six messages, each
  carrying its turn id. No message holds `mm:journeys` or the journeys table (TS3).
- Hard evidence and the model's word, kept apart (decision 2). The **pass conditions**
  are files: the rollout (`CODEX_HOME/sessions/**/rollout-*.jsonl`) holds a
  `developer` message with "Mirror Mind — Operating Instructions" (D13, DS12.TS2 L4)
  and `MIRROR MODE ACTIVE` at least twice — the explicit turn's context and the owed
  ordinary turn's (DS12.TS2 L3);
  `runtime_sessions.hook_injected = 1` (the inject hook ran); Codex's own log
  (`CODEX_HOME/logs_2.sqlite`, as DS2 read it) records `server_name=mirror-mind` with
  `Service initialized as client`. The **recorded observations** are Turn 3's yes/yes
  and Turn 4's reply naming a seeded journey slug — strong, since the scratch home's
  journeys are the template's and the model could not know them otherwise, but a
  model's word.
- The TS2 group, headlined by the backup (decision 4): the wrapper runs `backup`
  *after* `session-end`, so **a dated backup newer than `ended_at` is the fact that
  the hook finished inside Codex's bound** — a killed hook leaves none. Then: the
  session `active = 0` with `closed_at`; the conversation's metadata carries
  `close_tail_pending`; no LLM call in the ledger at exit; `hooks.log` gained no line
  during the session.
- The Navigator's own readings, asked for and recorded, not pass/fail lines: `/hooks`
  shows the plugin's five hooks trusted, SessionEnd at Codex's 1 s default; `/mcp`
  lists `mirror-mind` with its 7 tools.
- What L4 means on Codex, stated with the claim: skills, instructions, per-turn
  injection, and logging as on Claude Code; MCP tools present and reachable, behind
  Codex's `tool_search` rather than listed to the model outright.

**4. What `finish` does and reads:** the maintenance line `Finished deferred close
tails: 1` and `Extracted pending conversations: 1`; the conversation then has
memories and a generated title; the flag is gone (TS2, with a real key).

**5. Docs, after the evidence.**

- The US4 package: `test-guide.md` with the evidence; `index.md` Done.
- `docs/project/roadmap/cv21-runtime-expansion-ii/index.md`: the "Parity Levels"
  paragraph and the DS4 row read Codex **L4**, with version, binary, and date; the
  TS4-style note "measured on 2026-10-13 … L4 reachable" is superseded for Codex.
- `docs/project/decisions.md`: the convergence decision's matrix row for Codex is a
  dated record and is not edited; one short entry, "Codex is at L4 through the
  canonical plugin", with the measurement.
- `README.md` and Getting Started's runtime table say "Codex ✅ Full" already; the
  parity matrix across every doc is DS11's.

## Non-Goals

- Any code change. A defect the session finds stops the story for a Navigator
  decision: fix it inside US4 (a scope change, named), or capture it and record the
  honest level.
- Grok (DS10), Antigravity (DS7); the wrapper's removal (TS5, which this story
  gates); the plugin cache after an update (TS6).
- A second session, or a second turn budget: four turns and two slash readings. If
  a turn fails for a reason outside Mirror (a Codex outage, a login), the Navigator
  may repeat the session; the evidence names the run that counts.
- Measuring the deferred tail's finish through a *second Codex session*: `finish`
  runs the same composite the SessionStart hook runs, as TS2's route did.

## Acceptance Behavior

```text
Given Codex 0.162.1 with Mirror installed only through the shipped marketplace,
      a seeded scratch Mirror home, and the Navigator's provider key in the session
When the Navigator runs the four turns and quits
Then the conversation is labelled codex and holds six messages with their turn ids:
     the Mirror question without its form, the probe, the MCP question, and three replies
And the $mirror-mind:mm:journeys turn and its rendering are absent
And the probe reply says the Operating Instructions and the Mirror context were present
And the MCP reply names a seeded journey, reached through tool_search
And the session is inactive within 2 s of ended_at, flagged, backed up, with no
     LLM call at exit and no hooks.log line
And Codex's log shows the mirror-mind MCP client initialized, and the rollout a
     developer message holding the Operating Instructions

Given that database
When `finish` runs the next start's maintenance with the key
Then the deferred tail is finished and reported, and the conversation has memories

Given all of the above
Then the parity row for Codex reads L4, with version, binary, and date
```

## Validation Route

**Driver.** `bash route.sh setup`, then `DS4_US4_DRY=1 bash route.sh live` (prepares
and stops: the install from the shipped marketplace, the preflight, the turn script
printed), and `bash route.sh check` against an empty session fails for the right
reasons. No model call. `npm test` is unchanged by this story and is run once.

**Navigator.** `bash route.sh live`, the four turns and two readings, quit;
`bash route.sh check` (expected: every line green, the two readings answered);
`bash route.sh finish` (expected: the two maintenance lines, memories present);
`bash route.sh untouched` (expected: the real `~/.codex`, `~/.claude`, and
`~/.config/mirror` unchanged). Fail: any `check` line red — which is the stop
condition below, not a route retry.

**E2E decision:** required, and this story *is* the E2E of DS4 so far: the real
binary, the shipped install path, a real key, a real model.

## Implementation Contract

- The route is the deliverable; tests first does not apply to a measurement, and
  `npm test` is run once to show nothing moved.
- Keep changes scoped to `CV21.DS4.US4`: this package, the CV21 index's parity text
  and DS4 row, one decision entry. No source file.
- Do not use `git add .`; commit only story-scoped files.
- Follow the project's development guide: docs/process/development-guide.md.

## Stop Conditions

- **A defect found live** (a `check` line red for a Mirror reason): stop, report the
  line and its evidence, and ask the Navigator whether to fix it inside US4 as a named
  scope change, or to capture it (a Change Request or a sibling story) and record the
  honest level.
- The installed Codex is not 0.162.1 and its hook, plugin, or MCP surface differs
  (re-probe what the finding depends on before the session, per the evidence rule).
- `preflight` resolves the wrong Mirror home or no provider key: no turn is spent.
- scope_change_detected, plan_rule_conflict, navigator_decision_needed.

## Decisions Taken At Approval

Recorded on 2026-10-17, after the plan review by the security-engineer,
devops-engineer, quality-assurance, ai-engineer, and engineer lenses.

1. **Token hygiene.** The `auth.json` copy is mode 600 in a 700 directory, `clean`
   runs at Done and the Done record says so, and `DS4_US4_COPY_AUTH=0` takes the
   log-in-inside path instead.
2. **Hard evidence over the model's word.** The rollout's developer message and
   per-turn context are the pass conditions for D13 and injection; the probe's answers
   are recorded observations. Turn 4 names `tool_search`; a model that does not reach
   the tool is an honest finding about Codex, and the L4 claim says what MCP means on
   Codex.
3. **Reproducibility.** `live` archives, `setup` refuses a foreign directory, `check`
   selects the run by id with a time fallback, `node:sqlite` reads Codex's
   `logs_2.sqlite` (the plan had named a `.log` file that does not exist).
4. **The TS2 group's headline is the backup:** a killed hook leaves none.
5. **Record the cost;** `setup` re-asserts US1; `check` groups its lines by the story
   each proves.

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.

## Scope Change — decided by the Navigator at the stop, 2026-10-17

**What the session found.** Codex moved from 0.162.1 to 0.163.0 between `setup` and
the session (the evidence rule's re-probe trigger). On 0.163.0 the TUI's `/quit` and
Ctrl-D print "Disconnected from this task. Any running work continues. To reconnect,
run: codex resume <id>": the session lives on in the shared app-server daemon, and
**SessionEnd does not fire at TUI exit** — Codex's own log shows no hook started after
the last turn, and a probe hook pair (`route.sh probe`, trusted, an empty session,
both quit paths) recorded neither SessionStart nor SessionEnd. On 0.162.1, four days
earlier, `/quit` fired SessionEnd (DS2). Everything else measured at L4, with one
finding better than planned: 0.163.0 exposes the plugin's MCP tools to the model
directly (`mcp__mirror_mind__list_journeys`), not behind `tool_search`.

**Why it is a Mirror defect, not only a Codex change.** Without SessionEnd the
conversation stays open with its runtime session `active = 1`, and `closeStaleOrphans`
deliberately skips an open conversation bound to an active session (a Claude Code
user away from the keyboard is not an orphan). A Codex 0.163.0 conversation is
therefore never closed and never extracted — not deferred, lost — until something
deactivates the session. L1, "sessions close cleanly", is not met.

**The decision: fix it inside US4** (option 2 of the three offered), as the named
scope change below, then run the close evidence again on 0.163.0. The story's
character changes from a measurement to a measurement plus a small fix; the fix gets
tests first and the same route.

**The fix, in design.**

1. **A runtime policy, one home.** `ts/src/conversation/runtimePolicy.ts` holds
   `sessionEndRunsLlmTail` (moved from `deferredCloseTail.ts`, unchanged) and the new
   `sessionOutlivesTui(interface)`: `codex` true (0.163.0 detaches the TUI from a
   thread that persists; "active" means resumable, not attended), every other runtime
   false. Evidence and date in the comment.
2. **Idle closes a resumable session.** `closeStaleOrphans` keeps skipping open
   conversations bound to *attended* active sessions, and no longer skips one whose
   session's runtime outlives the TUI: idle past the orphan threshold (30 min), it is
   closed through the full tail, as any orphan is, and its runtime session is marked
   inactive with `closed_at`, so `guessRuntimeSessionId` stops reading it as "the
   session" (DS12.TS2 L9's class). On Codex 0.163.0 this is the close path.
3. **A closed conversation is not reopened by a prompt.** `getOrCreateSessionConversation`
   returns the bound conversation only while it is live — exists and has no
   `ended_at` — else binds a new one. A `codex resume` after the close starts a new
   conversation on the same thread id instead of appending to an extracted one.
4. **A knob for the threshold**, `MIRROR_STALE_ORPHAN_MINUTES`, read by the front
   door's maintenance deps beside the extraction budget, so the route can prove the
   close without waiting thirty minutes and an operator can shorten it. Documented
   in REFERENCE's environment table.
5. **The route.** When Codex's log shows SessionEnd was not invoked, `check` reports
   the TS2 group as *deferred to maintenance on this Codex* rather than as cut, and
   `finish` runs maintenance with the threshold at zero: expected `Closed stale
   conversations: 1`, extraction, finalization, the session inactive, and the ledger.

**What this does not change.** TS2's deferred tail stays the close path wherever
SessionEnd fires (Codex 0.162.1, Grok, and 0.163.0 if a later version fires it
again); its code is exercised by its tests and route. The hook registrations. Claude
Code's, Pi's, and Gemini CLI's behavior: their sessions do not outlive the TUI.

**Consequences, stated.** A Codex 0.163.0 user who pauses longer than the threshold
mid-session and continues gets two conversations: the first closed and extracted by
whichever session start ran maintenance meanwhile, the continuation in a new one.
Memories from a Codex session arrive after the idle threshold plus the next session
start on any runtime. Both are the best Mirror can do without a session-end signal,
and both are said in the spec.

**Corrected premise, thirty minutes later.** While the fix was being written, the
scratch Codex closed the session by itself: its log at 16:44:13 reads "thread … has
no subscribers and is idle; shutting down", then `thread/closed`; the probe hook, still
installed, recorded **SessionEnd** at 16:44:13 with `session_id`, `transcript_path`,
and `cwd`; and the plugin's SessionEnd ran at the same instant and closed the
conversation through TS2's deferred path with the Navigator's real key present:
`ended_at`, the session inactive, the flag, a backup, no LLM call, no `hooks.log` line.
So on 0.163.0 **SessionEnd fires when the daemon reaps the detached thread, thirty
minutes after the TUI disconnects** — not at `/quit`. The conversation is deferred by
Codex, not lost. The scope change stands with that premise: the idle-orphan rule is
the safety net for a daemon that never reaps (stopped, rebooted); the live-binding
rule keeps a `codex resume` from writing into a closed conversation; and one more
guard follows from the race between Codex's reap and maintenance — `endSession` on a
conversation already ended deactivates the session and runs no tail, so a closed
conversation is not closed twice. TS2 is proven live on 0.163.0, with a key.

## Route v2 — the extra-careful validation, at the Navigator's request

After the first run's validation was accepted, the Navigator asked for a route that
proves the story without a doubt: every failure so far had been found after a session
was spent. Route v2 (`route.sh`; the first is `route-v1.sh`): a fresh scratch directory
and the final tree packed; the subject pinned at `setup` and every step refusing to
run if Codex's version moves; one id per setup, in a file; a `selfcheck` that drives
the real wrappers with Codex-shaped payloads into a copy of the scratch home and runs
the same readers, so a reader defect fails before a turn is spent; expectations
pre-registered in `evidence/expectations.md` before any session, every line tagged
with its source (`[fs]`, `[db]`, `[rollout]`, `[codex-log]`, `[ledger]`, `[probe]`,
`[model]`); the rollout read structurally and cross-checked against the database; two
sessions — A, where Codex's reap closes first, and B, where Mirror's safety net closes
first, the reap meets a closed conversation, and `codex resume` follows; `wait-for-close`
polling Codex's log and the database until the reap. The paid debt (one title call) is
a `[ledger]` line.

**Result (2026-10-17, Codex 0.163.0 pinned, package 0.33.4, tree 84df080b + this
story's working set):** every Mirror claim proven from files in both sessions; every
red line was a route reader — counting submitted rather than completed turns, B's
expectations written for before the resume, the safety-net path's extraction read from
the wrong line, "memories ≥ 1" where zero is legitimate, a `.db` matched as a backup,
this very conversation matched in `untouched`, a one-second race in the self-check —
all corrected, after which the readers pass on the same evidence (self-check 20/0,
check A 19/0, check B 16/0, untouched 2/0). **The pre-registered rule asks for a re-run
after a corrected reader; the Navigator waived it**, since the corrections changed how
Codex's own files are read and the files were never touched. Recorded here as the
waiver it is.
