[< Story](index.md)

# Test Guide — CV21.DS4.US4

## Automated Validation

This story changes no source file. From the repository root, once, to show nothing
moved:

```bash
npm test
node ts/scripts/checkDocLinks.ts
```

**Driver's dry run** of the route, no model call:

```bash
cd <this package>
bash route.sh setup                 # scratch install, seeded scratch home, the shipped marketplace
DS4_US4_DRY=1 bash route.sh live    # prepares, preflights, prints the turns, stops
bash route.sh check                 # against no session: fails for the right reasons
```

## E2E Decision

Required, and this story is DS4's E2E: the real Codex binary, the install path US1
ships, the Navigator's real provider key, a real model.

## Navigator Validation

All scratch state lives under `/tmp/cv21-ds4-us4` (or `DS4_US4_DIR`). The route
copies your `~/.codex/auth.json` into the scratch `CODEX_HOME` (your own token, mode
600 in a 700 directory; `clean` removes it at Done; `DS4_US4_COPY_AUTH=0` lets Codex
ask for a login inside the scratch home instead) so you need not log in again, and reads your provider key from
`~/.config/mirror/env` into the session's environment only. It writes nothing to
your real `~/.codex`, `~/.claude`, or `~/.config/mirror`; `untouched` proves it.

**Step 1 — the session.**

```bash
bash route.sh live
```

Preflight prints the Mirror home the session will use and "a provider key"; then the
four turns, typed exactly as printed, with the run's id filled in:

1. `$mirror-mind:mm:mirror DS4-<id>: should I raise my course price from 297 to 497 reais?`
   — expect Mirror Mode, a first-person answer.
2. the probe (printed) — expect `yes` and `yes`. It comes before the skill turn: the
   first ordinary turn after Mirror Mode activates is the one owed the injection.
3. `$mirror-mind:mm:journeys` — expect the journeys list.
4. the MCP question (printed; it names `tool_search`) — expect the seeded journey
   slugs. A model that does not reach the tool is recorded as a finding about
   Codex's exposure, not a Mirror defect.

Then `/hooks` (read SessionEnd's budget: the plugin's five hooks trusted, SessionEnd
at Codex's 1 s default) and `/mcp` (read `mirror-mind` with 7 tools). Write both
readings down. Quit.

- Expected observation: Codex asked once to trust the plugin's hooks; the four
  replies as above.
- Fail: no Mirror Mode on turn 1, the probe answering no, the MCP tool not found.

**Step 2 — what the session left.**

```bash
bash route.sh check
```

- Expected observation: every line green, grouped by the story it proves — US1: the
  install; US8/TS3: the `codex` label, six messages with turn ids, the Mirror form
  stripped, no `mm:journeys`; TS2: a dated backup newer than `ended_at` (the hook
  finished inside the bound), the session inactive and flagged, no ledger call at
  exit, no `hooks.log` line; D13/MCP: the developer message and per-turn context in
  the rollout, `hook_injected`, the MCP handshake in Codex's log. The probe's yes/yes
  and the MCP reply's journey slugs are shown as observations. It then asks for your
  two readings.
- Fail: any red line. That is a stop condition (plan.md), not a route retry.

**Step 3 — the next start finishes the tail, with the key.**

```bash
bash route.sh finish
```

- Expected: `Extracted pending conversations: 1` and `Finished deferred close tails:
  1`; the conversation has memories and a generated title; the flag is gone; the
  ledger rows for the tail (role, model, cost) are printed and kept as evidence.
- Fail: the lines at 0, no memories.

**Step 4 — nothing of yours changed.**

```bash
bash route.sh untouched
```

- Expected: your real `~/.codex`, `~/.claude`, and `~/.config/mirror` match the
  baseline `setup` took.

## Validation Evidence

**Driver, 2026-10-17 15:54 UTC, dry.** Codex 0.162.1, `/opt/homebrew/bin/codex` →
`/opt/homebrew/Caskroom/codex/0.162.1/bin/codex`; package 0.33.4 from this tree.
`setup` 13/0: the scratch install, 12 personas and `personal-growth` seeded, and
US1's two commands on the real binary — cached at 0.33.4, the `config.toml` entry,
25 of 25 skills in `prompt-input`, no `skills/mirror-mind` link and no `AGENTS.md`
(Codex creates its own `skills/.system/`; the first check mistook it for a link and
was narrowed). `DS4_US4_DRY=1 live`: the login copied (600/700), preflight resolved
the scratch home with a provider key, the turns printed, no session. `check` against
no session failed for the right reason. `untouched` 2/0. No key value in any scratch
file. `npm test` unchanged by this story.

**Navigator, 2026-10-17 16:09–16:14 UTC — the live session.** Codex **0.163.0**
(`/opt/homebrew/bin/codex` → `/opt/homebrew/Caskroom/codex/0.163.0/bin/codex`): Homebrew had
moved it from 0.162.1 between `setup` (15:54) and the session, the evidence rule's
re-probe trigger. Mirror installed only through the shipped marketplace; the Navigator's
key in the session. Four turns typed as printed (the id `DS4-975sny`, an earlier
printout's; the route selected the conversation by time and now says so). Screenshots
kept by the Navigator.

- Turn 1: `◇ financial`, a first-person answer. Turn 2: "(a) Yes. (b) Yes." Turn 3: the
  journeys list rendered. Turn 4: "The MCP tool returned one journey slug:
  `personal-growth`. `tool_search` wasn't available, so I found and called
  `mcp__mirror_mind__list_journeys` directly." — **finding:** 0.163.0 exposes the
  plugin's MCP tools to the model directly, not behind `tool_search` (DS2, 0.162.1).
- `/hooks` reading: SessionStart 1/1, SessionEnd 1/1, UserPromptSubmit 2/2, Stop 1/1
  installed and active, with the issue "running async SessionEnd hook synchronously in
  …/plugins/cache/mirror-mind/mirror-mind/0.33.4/hooks/hooks.json" (the 0.163.0 table
  shows no per-hook budget). `/mcp` reading: `mirror-mind: connected (7 tools)`.
- `check`, first run (16:14:31, 18 s after `/quit`): US1 2/2; US8/TS3 7/7 (the one red
  was the id artifact, fixed); D13/injection/MCP 4/4 — the developer message in the
  rollout, `MIRROR MODE ACTIVE` × 6, `hook_injected = 1`, the MCP handshake in Codex's
  log; **TS2 0/4: the conversation open, the session active, no flag, no backup.**
  Codex's own log: no hook started after the last turn; at 16:14:13 the TUI sent
  `thread/unsubscribe`. `/quit` had printed "Disconnected from this task. Any running
  work continues. To reconnect, run: codex resume …".
- `probe` × 2 (16:32, 16:33; the probe hooks trusted, hashes in `config.toml`): an empty
  session, `/quit` then Ctrl-D — neither SessionStart nor SessionEnd fired.
- `untouched`: the real `~/.codex/config.toml` changed at 18:01 local, between the
  Homebrew upgrade and the session; the route writes nothing there (no `mirror-mind`
  entry in it); 0.163.0's first launch is the likely author. The baseline now keeps
  content so the next run can show the diff.

**The stop, and the Navigator's decision:** fix inside US4 (option 2). The scope change
is in plan.md.

**Driver, 16:44 UTC — the corrected premise.** Thirty minutes after the TUI detached,
Codex's log reads "thread … has no subscribers and is idle; shutting down" and
`thread/closed`; the probe hook recorded **SessionEnd at 16:44:13** with `session_id`,
`transcript_path`, `cwd`; the plugin's SessionEnd ran at the same instant and closed the
conversation through TS2's path with the real key present: `ended_at 16:44:13.412`,
the session inactive `.413`, `close_tail_pending`, backup `memory_20261017_184413.zip`,
no LLM call at exit, no `hooks.log` line. `check` re-run: **20/0**. TS2 is proven live on
0.163.0. The fix (the idle-orphan rule for sessions that outlive the TUI, the
live-binding rule, the not-closed-twice guard, `MIRROR_STALE_ORPHAN_MINUTES`) stays as
the safety net; its tests were red first (4) and `npm test` is 3256/0 with it.

**Navigator, 16:57 UTC — `finish` and `untouched`.** Maintenance with the real key:
`Finished deferred close tails: 1 (3.3s)`; the title "Course price increase test and
system checks", a summary, and tags; the flag gone. **Not extracted, and no memories:**
the session bound a persona (`financial`) and no journey, and Mirror extracts memories
for journey-bound conversations only (the orchestration's gate; the US1 and TS2 routes
had bound one by SQL). The route's expectation was wrong and now reads the gate. **The
cost of the deferred tail, the first real-world figure:** four calls on
`google/gemini-2.5-flash-lite` — `conversation_title` × 2 (709/7 tokens each),
`conversation_summary` (727/139), `conversation_tags` (907/24) — **$0.00038** for the
conversation, 1.5–1.6 s each. The title was generated twice: once by
`retitlePendingConversations` and once by the deferred finalization that follows it in
the same run — $0.00007 of duplicate spend, for Debt Review. `untouched`: the real
`~/.codex/config.toml` hash differs from the 17:54 baseline, as on the first run
(changed at 18:01 local, before the session; no `mirror-mind` or scratch path in its
content; every `codex` the route runs has `CODEX_HOME` set to the scratch home, and
the only real-home reads are `auth.json` and the config file). The content snapshot
the route now takes at `setup` would show the diff on a next run; this run's
`setup` predates it. No live turn in a real Mirror home.


## Route v2 evidence — 2026-10-17, Codex 0.163.0 pinned, package 0.33.4

Driver: `setup` 15/0 (17:29Z); `selfcheck` 21/0 with 2 live-only readers; dry `live`
A and B; expectations written at 17:30:25Z. Navigator: **session A** 17:35–17:39Z, four
turns (the bare form sent once by autocomplete and aborted, then the four), `/hooks`
(7 hooks, the SessionEnd issue line) and `/mcp` (mirror-mind, 7 tools), `/quit`;
`wait-for-close A` 10/0 — the reap at 18:09:50Z, 30 min after the detach, the probe's
SessionEnd payload, Mirror's close at 18:09:51 through TS2's path with the key present;
`finish A` 7/0 — the tail finished, the journey bound by the skill (personal-growth),
3 memories, exactly one title call, $0.00067. **Session B** 18:13–18:17Z, two turns
(Codex ran Turn 1 twice; the first without an answer), `/quit`; `finish B` at once —
`Closed stale conversations: 1`, the session deactivated, one title call, $0.00033,
extraction run inside the close with no memory from a two-turn exchange;
`wait-for-close B` — the reap at 18:47:09Z met a closed conversation, `ended_at`
unchanged, no flag added, the backup taken; `resume B` at 18:49Z, one turn; `check B`
— a new conversation bound, the closed one unchanged (5 messages). `untouched` 2/0.

First readings of `check A` 18/3, `check B` 14/6, `finish B` 7/2: every red line a route
reader (listed in plan.md), corrected; the same evidence then reads 19/0, 16/0;
`selfcheck` 20/0 after a one-second race and a copy-state line were fixed; `untouched`
had matched this Pi conversation's paste of the route output (interface `pi`) and now
reads only Codex conversations. One observation: a transient
`reception outcome=transport_failed kind=provider_error` in the scratch front-door log
during B's Turn 1; the load continued. **The Navigator waived the re-run the
pre-registered rule asks for after a corrected reader.** Scratch directories cleaned at
Done, the token copies with them.
