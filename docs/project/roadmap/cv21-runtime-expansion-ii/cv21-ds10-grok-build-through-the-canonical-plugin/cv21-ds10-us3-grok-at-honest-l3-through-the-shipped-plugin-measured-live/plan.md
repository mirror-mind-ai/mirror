# Plan — CV21.DS10.US3

## Objective

Measure Grok Build's honest parity on the installed binary, through the install
`mirror init` prints and nothing else, and record it with version, binary, and date:
the skills, the Operating Instructions reaching the model through the home rule,
Mirror Mode on `/mm-mirror`, every prompt and reply logged as `grok_build` with the
session-end Stop silent, the conversation closed at exit inside Grok's 1.5 s bound
with its tail deferred and finished at the next start (DS4.TS2 on Grok, for the first
time, with a provider key set), and the two negatives re-confirmed on 1.0.62 — no
`systemMessage` injection at session start, no `additionalContext` per turn. The
result is **L3** or it is not, and TS4 writes what was measured. The route is the
isolated Grok smoke CV21's Done condition asks for.

The story is measured in two parts, by what each can honestly show. **Headless first:**
TS2 proved `grok -p … --output-format streaming-messages-json` reports a session by
field at two cents a run, and its `unified.jsonl` showed `session_end.worker_join` — a
headless session starts, turns, and ends like a TUI one, so the rule, the canaries, the
logging, and the close are measured there, deterministically, before anyone types.
**Then one TUI session**, the Navigator's, for the two things headless cannot stand in
for: `/mm-mirror` as a slash command whose skill runs `mirror mirror load` under a
permission prompt (headless would need `run_terminal_cmd` auto-approved, which the
security review ruled out), and the interactive shell's own exit path. The TUI session
is short — two turns and a quit — and the Driver's `check` reads what it left, as DS2's
and DS4's did.

Already true and not re-measured here: the install and its diagnosis (US1), the MCP
server attached and its tools reachable through `search_tool`/`use_tool` (TS2), the
hooks firing under Grok (DS12.TS4 L1), the `grok_build` label and the Stop-logged
replies on 1.0.52 (DS2.US8, live) — US3 measures the last two again only because the
install path and the binary changed.

## Scope

**Step 0 — setup, no model** (`bash route.sh setup`; own scratch directory
`/tmp/cv21-ds10-us3`). Pack, install into a scratch prefix; a scratch Mirror home
created by `mirror init` + `seed`; the scratch `HOME`/`GROK_HOME` wired by **US1's two
printed steps exactly** (`grok plugin install "<pkg>/plugins/mirror-mind" --trust`,
`ln -s "<pkg>/AGENTS.md" ~/.grok/rules/mirror-mind.md`); a probe hook set in
`~/.grok/hooks/ds10-probe.json` in Grok's own hook form, as DS12's route wrote it: it
captures every payload to `live/hooks.jsonl` with a count per event and answers
`SessionStart` with a `systemMessage` **and** an `additionalContext` canary, and
`UserPromptSubmit` with an `additionalContext` canary, `CANARY-DS10-<id>-start` and
`-turn-<n>`; `grok inspect --json` recorded (25 skills from source `plugin`, the rule
loaded `global`, the server listed); the real-config baseline; `preflight` — the
session's Mirror processes resolve the scratch home and see a provider key (decision
1) — stops before any turn when either is wrong.

**Step 1 — headless** (`bash route.sh headless`; Grok auth by `GROK_AUTH_PATH`, model
grok-4.7, `--tools read_file --max-turns 4 --reasoning-effort low --no-auto-update`,
`DISABLE_AUTOUPDATER=1`, the provider key in the session environment only). Three
sessions, in this order, each read by field from the stream and from the scratch
database:

| Session | Prompt | What it measures |
|---|---|---|
| **R0 — no rule** (the rule link removed for this one session, restored after) | *"Answer in two lines. Line 1: the four operating modes of the Mirror and the glyph that marks a persona's answer, or UNKNOWN. Line 2: any token starting with CANARY- that you can see in your context, or NONE."* | the baseline: without the rule the model does not know the modes (so the plugin's SessionStart `additionalContext`, which carries the same text, is not reaching it); the canaries: NONE |
| **R1 — the rule** (US1's step 2 in place) | the same | the Operating Instructions reach the model through the home rule (`Mirror, Builder, Explorer, Soul`; `◇`); the canaries still NONE (L2, L3 on 1.0.62) |
| **R2 — a second turn's worth** | *"Reply with one line: the word logged, and nothing else."* | a second conversation, to read the close and the deferred tail twice: once finished by the explicit `finish` step, once by the next session's own start |

Every prompt carries a marker, `US3-<id>-<R>`, and every `check` selects its
conversation by that marker through one helper, time as the fallback (amendment 1).
Pass conditions are keywords with the raw lines recorded (amendment 2): R0's line 1
holds none of `Explorer`, `Soul`, `◇`; R1's holds all three, `◇` as the character; line
2 is `NONE` for both — printed beside what the probe *emitted* on each event, so the
canary's absence is read against its proven presence (amendment 6).

After each session, `check <R>` reads, by field and through `node:sqlite` (amendment 9):
the probe capture (`SessionStart` ×1, `UserPromptSubmit` ×1, `Stop` as a **number** — 1
for the turn, 2 if Grok fires its session-end Stop — `SessionEnd` ×1, the timestamps,
and what each emitted); the scratch database (`conversations.interface` and the runtime
session both `grok_build`; one `user` row and **exactly one** `assistant` row per turn,
the reply carrying the prompt's `promptId` turn id, asserted together with the Stop
count so "silent" is two numbers (amendment 3); no `reply skipped` line in `hooks.log`;
`ended_at` set by SessionEnd; `close_tail_pending` = 1 through the product's own
`json_extract` predicate; the ledger with no LLM call at the close itself); **the bound
with two witnesses** (amendment 4): `ended_at` and the dated backup's mtime both within
the bound of the probe's SessionEnd timestamp, and Grok's `unified.jsonl` read for any
hook-timeout or kill line and for hook durations where it logs them; `hooks.log` with
no failure line. The installed guide's own default is re-read at `setup` and recorded:
on 1.0.62, `10-hooks.md` says a `SessionEnd` hook is bounded by 1.5 s by default
(`GROK_SESSION_END_HOOKS_TIMEOUT_MS`), **a plugin's `SessionEnd` hook runs for at most
that default whatever its own `timeout`**, and exit waits at most 10 s for them —
which is why DS4.TS2 deferred the tail rather than lengthening a timeout.

Then `finish <R>`: `mirror conversation-logger session-maintenance` with the session
environment — what the next SessionStart runs — must print `Finished deferred close
tails: 1`, leave a summary and a title, clear the flag, and the ledger must show the
tail's calls with their cost. R2's tail is left for the TUI session's own start to
finish, and `check tui` reads that **from state** — R2's flag gone and its summary
present — not from an output nobody can read; `finish R2` stays available as the
fallback if the TUI session is deferred (amendment 5). Seams are named one line each
in every summary: Grok → hook (the capture), hook → Mirror home (`hooks.log`), Mirror →
provider (the ledger), Grok → exit (SessionEnd fired).

**Step 2 — the TUI session** (`bash route.sh tui`, the Navigator at the keyboard;
`check tui` after). The route prints the turn script, applies `preflight`, and
`exec`s `grok` in the scratch project with the same environment. Two turns:

```text
1. /mm-mirror should I raise my price?
   (Grok asks permission to run `mirror mirror load`: approve it; expect a ◇ persona
   answer from the scratch identity, slow as DS12.TS4 L5 found)
2. Answer in two lines. Line 1: the four operating modes of the Mirror and the glyph
   that marks a persona's answer, or UNKNOWN. Line 2: any token starting with CANARY-
   that you can see in your context, or NONE.
   (expect the modes and ◇; NONE)
then quit Grok (/quit or Ctrl+D)
```

The TUI runs with Grok's default permissions — the route asserts its command line
carries no `--yolo` and no `--permission-mode` (amendment 8) — and the Navigator
approves `mirror mirror load` by hand and nothing else. The route asks the Navigator
to confirm two things seen on screen and records them: the probe's `systemMessage`
canary shown at session start (the on-screen half of "shown, not injected", DS12.TS4
L2; amendment 6) and the `◇` answer. `check tui` reads the same fields as the headless
checks, plus: the Mirror question logged **without** its `/mm-mirror` form and the `◇`
answer logged as its reply (DS2.US8 on this binary); `mm-*` advertised as slash
commands in `unified.jsonl` (`slash.advertise`, the 25 names); the session's model
read from Grok's own files (amendment 7); the MCP server started for the session (its
stderr log empty), attachment inherited from TS2; a conversation still open reported
loudly as "open" (a TUI that died another way), not as a failed field; and R2's tail
finished by this session's start. Then `finish tui`, and `untouched`.

**Step 3 — the record.** decisions.md: one entry, "Grok Build is at L3 through the
canonical plugin", with the version, binary, date, the model per session (headless
`grok-4.7`; the TUI's from Grok's files), the per-session fields, and a cost table on
both sides — Grok's `total_cost_usd` per session, Mirror's ledger per conversation
(extraction, title, summary, tags; the Mirror Mode load in the TUI), printed without
request bodies (amendment 7). The DS10 candidate
row and the CV21 row carry it. No product file changes unless a check fails (below).
The docs — the parity row, README, REFERENCE, the contract's Grok reference
implementation — are TS4's, written from this record.

**If a check fails, the plan says what it is, not what to do:** a reply doubled by the
session-end Stop, a tail not finished, a close outside the bound, or a hook Grok kills
are **defects for the Debt Review**, each with its evidence line, and a Navigator
decision whether US3 pays it or captures it. Hooks that do not fire in headless mode
are not a defect: the logging and close checks then move to the TUI session, which
measures them as DS2 did, and the record says headless was silent.

**The story package.** `route.sh` with `setup`, `headless` (R0, R1, R2 in order, each
followed by its check and, for R0 and R1, its finish), `check <R0|R1|R2|tui>`,
`finish <R0|R1|R2|tui>`, `tui`, `untouched`, `clean`; `probe.mjs`, DS12's `probe.js`
in module form with Grok's branch of the emission and the same capture format, so the
two can be compared (amendment 9). The provider key is read from the real
`~/.config/mirror/env` into a variable and exported inside the function that starts a
session — never in `argv`, never echoed (amendment 8). Every database read goes
through `node:sqlite`; `DS10_US3_DRY=1` prepares any step and stops before a session;
`grok leader list` is printed after each step and `clean` kills what a scratch home
spawned. Raw streams, captures, and `unified.jsonl` stay under scratch; summaries by
field selection into `test-guide.md`; the real Mirror databases are in the `untouched`
set.

## Non-Goals

- Raising Grok above L3: `UserPromptSubmit` discards context and `SessionStart` shows
  it on screen only; the ceiling is Grok's, and this story records it.
- `run_terminal_cmd` auto-approved in headless mode to make `/mm-mirror` scriptable.
  Mirror Mode is measured in the TUI under a permission prompt.
- The MCP attachment question (TS2, closed) and `review-copy` (DS5).
- README, REFERENCE, the parity matrix, the contract's Grok reference implementation:
  TS4 and DS11.
- Any change to the hooks, the plugin, or the close tail. A defect found here is
  named and routed, not fixed in the measuring story.
- Grok's own slowness on a skill turn (DS12.TS4 L5): recorded, not addressed.

## Acceptance Behavior

```text
Given the scratch HOME wired by US1's two steps on the installed Grok, a probe hook
      set, a seeded scratch Mirror home, and a provider key in the session environment
When headless session R0 runs with the rule link removed
Then line 1 reads UNKNOWN and line 2 reads NONE, and the probe captured one
     SessionStart and one UserPromptSubmit with their canaries emitted

When headless session R1 runs with the rule link in place
Then line 1 names Mirror, Builder, Explorer, Soul and the ◇ glyph, and line 2 reads NONE

Given any of R0, R1, R2, or the TUI session has ended
When check reads the scratch database and the probe capture
Then one conversation carries grok_build on itself and its runtime session, each
     prompt is followed by one reply carrying its promptId, the session-end Stop added
     nothing, hooks.log holds no failure, ended_at is within 1.5 s of the probe's
     SessionEnd, close_tail_pending is 1, a backup is newer than ended_at, and the
     ledger holds no LLM call at the close

When finish runs, or the next session starts
Then the output reads Finished deferred close tails: 1, the conversation has a title
     and a summary, the flag is gone, and the ledger holds the tail's calls with cost

Given the TUI session
When the Navigator sends /mm-mirror should I raise my price? and approves mirror mirror load
Then a ◇ persona answer appears, the question is logged without its form and the
     answer as its reply, and the 25 mm-* skills were advertised as slash commands

Given every check above
When the story closes
Then decisions.md records Grok Build at L3 with version, binary, date, model, and cost,
     and the real ~/.grok, ~/.claude, and ~/.config/mirror hash unchanged
```

## Validation Route

**Automated (Driver).** `node ts/scripts/checkDocLinks.ts`. No code changes are
planned; the suite runs only if a defect is paid here, which is a Navigator decision.

**Navigator, step 0.** `bash route.sh setup`. Expected: the install and the rule link
applied, `inspect` with 25 plugin skills, the rule `global`, the server listed; the
probe hook written; preflight resolving the scratch home with a key. Fail: preflight
wrong — no turn is spent.

**Navigator, step 1.** `bash route.sh headless` (the Driver runs it, decision 3; you
read the summaries). Expected per session, printed by field: the two answer lines,
`init.mcp_servers`, the probe counts and canaries emitted, the database rows with
their turn ids, `ended_at` against the SessionEnd timestamp, the flag, the backup, the
ledger, `total_cost_usd`; then `finish` with `Finished deferred close tails: 1` and
the tail's ledger rows. Fail conditions are findings: a known answer in R0, UNKNOWN in
R1, a canary quoted, a missing or doubled row, a close outside the bound, a tail not
finished. Hooks silent in headless: the logging and close checks move to step 2.

**Navigator, step 2.** `bash route.sh tui`, the two turns above, quit; then
`bash route.sh check tui` and `bash route.sh finish tui`. Expected: the ◇ answer seen
and logged, the modes and NONE, the same database and probe fields as step 1, R2's
tail finished by this session's start. Fail: as in step 1, plus the Mirror question
logged with its form or the answer not logged.

**E2E decision:** required; step 1 is the deterministic E2E and step 2 the one that
needs a person — the real binary, the shipped install, a real model, a real key.

**Step 3 — untouched.** `bash route.sh untouched`: the real `~/.grok` configuration,
`~/.claude`, `~/.config/mirror/env`, and the real Mirror databases hash as before
(`auth.json` outside the set, as in TS2).

## Implementation Contract

- Decisions 1–4 taken before any session; `preflight` before every session; R0 before
  R1 before R2; the TUI session after the headless checks are read.
- No product code or hook change in this story; a failing check is a finding with its
  evidence line, routed at the Debt Review.
- Keep changes scoped to `CV21.DS10.US3`: the story package, decisions.md, the DS10
  row, the CV21 row.
- Do not use `git add .`; commit only story-scoped files.
- Follow the project's development guide: docs/process/development-guide.md.

## Stop Conditions

- `preflight` resolves the wrong Mirror home or no provider key (no turn is spent).
- The account answers "usage limit" (navigator_decision_needed: when to retry).
- More than six headless sessions, or Grok's `total_cost_usd` summed above US$ 1.00,
  or Mirror's ledger above US$ 1.00 (decision 4).
- The deferred tail is not finished, a reply is doubled, or a close falls outside the
  bound (navigator_decision_needed: pay here or capture).
- The installed `grok` changes version before step 2 (re-run step 1; 1.0.62 is the
  measured one).
- scope_change_detected, plan_rule_conflict, failing_required_check_without_clear_fix.

## Decisions Taken At Approval

Approved by the Navigator on 2026-10-18, as recommended, with amendments 1–9 of the
plan review (quality-assurance, ai-engineer, security-engineer, devops-engineer,
engineer) folded into Scope above:

1. **The provider key.** The Navigator's real OpenRouter key, read by the route from
   their `~/.config/mirror/env` into the session environment only — never written into
   the scratch config, never printed (DS4.US4's decision 1). DS4.TS2's claim is "with a
   key set", and a session with no key would not exercise the tail. Cost: one Mirror
   Mode load in the TUI, and per conversation one extraction and one finalization at
   `finish` — cents, recorded from the ledger.
2. **Grok auth:** `GROK_AUTH_PATH=~/.grok/auth.json`, as TS2 did; nothing minted or
   copied; a background token refresh may rewrite the real file.
3. **Who runs what.** The Driver runs step 1 and every `check`/`finish`; the Navigator
   runs step 2's session from the printed command and reads every summary.
4. **Budget.** At most six headless sessions, one TUI session; Grok's `total_cost_usd`
   and Mirror's ledger each capped at US$ 1.00 as stop conditions, ledgers printed by
   the route after every session.

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
