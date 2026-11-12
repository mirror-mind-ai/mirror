[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR211 · The operating instructions bound nothing about a task's size, so a small request can grow into an investigation nobody asked for

## Problem

Two reports came in on 2026-11-09 from people on OpenAI's Codex plan. At least one
reporter runs Pi 1.5.0 with `gpt-6.1-sol` through that plan, not the Codex CLI; the
other's runtime is not known. Paraphrased:

- **A small implementation.** The person asked for one specific implementation. The
  agent used the whole five-hour usage window and did not finish. Asked why, it agreed
  that it had gone too far, then did the same in new situations.
- **A session-only journey.** The person asked how to set the journey for the current
  session only (CR209), then asked for a skill so the answer would not have to be found
  again. The agent decided to discover, develop, test and plan. The window ran out
  partway through; it had been at 60% used when the request started.
- **A shared screenshot.** The agent, signing `◇ engineer`, says it turned the doubt into
  an excessive investigation, and should have made one targeted lookup or stated the
  limitation. The person had already asked it to check with them first, and that did
  not hold.

Here is what the instructions Mirror ships say about the size of a task:

- **`AGENTS.md`:**
  - The Builder activation boundary covers activation only ("After loading the context
    and required docs, stop and ask what work should be done next"). It says nothing
    once work is authorized.
  - The hard constraint reads "Service: intellectual partner, not task executor.
    Question, refine, align — do not execute without thinking."
- **`mm-build` §4:** "Keep project docs updated as the code evolves" and "Commit at the
  end of each session".
- **The engineer persona template:** "First I clarify the desired behavior, the
  constraints, the existing design, and the smallest useful change", "implement with
  tests whenever behavior changes", and "Keep documentation aligned with runtime
  behavior".

Nothing tells the agent to:

- do what was asked, at the size it was asked;
- make one bounded lookup when the route is unknown, then ask or state the limitation;
- ask before widening into plans, tests, docs or refactors nobody requested.

A correction the person makes in one conversation does not reach the next one.

**Not shown:** that these lines cause the behavior. Neither transcript has been read,
and the runtime's model and its defaults are just as likely a cause.

**Also not the cause:** a recent instruction change. Between v0.36.0 and v0.44.0,
`AGENTS.md`, the skills and the identity templates changed in only two places. In v0.37.0
`mm-mirror` gained the doorman's delivered-line rule, and later two skills gained a
`--file` note.

**A larger cost, outside this CR.** The Pi reporter's telemetry shows his prompt cache
collapsing on 11/06: from 85% of input served from cache to under 5%, roughly six times
more input on every model call. The evidence points outside Mirror (see Evidence), and
the reporter has been asked to isolate it. The cache explains the cost per call. This
CR is about the number of calls, which multiplies whatever each call costs.

## Expected Behavior

- `AGENTS.md` carries a short scope rule that every runtime receives:
  - answer the request at its size;
  - a lookup that does not settle in a few steps ends in a question or a stated
    limitation, not a wider search;
  - work beyond the request (plans, refactors, docs, tests beyond the change asked for)
    is offered, not done.
- The generated plugin copy follows.
- The rule is measured before it ships. The same small request runs on the reporter's
  runtime (Pi with OpenAI's Codex plan) on a scratch Mirror home, before and after, and
  the tool calls and tokens are counted.

## Impact

This is the behavior both reports describe. Its cost is the person's usage window and
their trust that a small request stays small. Both reporters had to buy usage resets to
keep working.

## Plan Or Decision

Captured, unassigned, 2026-11-09, at the Navigator's direction, from the two reports
above.

Planned the same day, to travel with CR213 because both edit `AGENTS.md`. Reviewed
through five lenses (prompt engineer, AI engineer, quality assurance, engineer, writer).
The eleven amendments are folded below and listed under Decisions Taken At Approval.
Approved by the Navigator on 2026-11-09, with option A and the control prompt. Selected
as Current Focus the same day; Driver `@viniciusteles`, Delivery `main`, named by the
Navigator.

The reporters are still asked for their transcripts (Pi session files under
`~/.pi/agent/sessions/`) and for `mirror mode status`. Their answers inform CR208 and
CR212, and they do not gate this plan.

### The rule

A third bullet under `AGENTS.md`'s Hard Constraints, after "Service":

```text
- **Scope:** do what was asked, at the size it was asked. If you do not know
  how, take two or three targeted looks; if they do not settle it, stop, say
  what you could not find, and ask. Offer in one line, instead of doing, any
  work the request did not name and the project's or the active skill's
  instructions do not require: a plan, a refactor, documentation, tooling,
  or tests beyond the change asked for. A limit the user sets in a
  conversation holds for the rest of it.
```

The placement does three things:

- **Every mode and runtime.** The rule sits under Hard Constraints, which apply in every
  mode, and every runtime receives `AGENTS.md`.
- **Service.** "Service" keeps its wording. The new bullet bounds it: questioning and
  refining happen by asking, not by investigating.
- **Standing rules.** "The project's or the active skill's instructions" leaves them in
  force: a project's TDD rule, Builder's docs maintenance in `mm-build` §5, Ariad's
  lifecycle. Tests of the change asked for are part of the change; only tests beyond it
  are offered.

### Scope

1. **The rule.** It goes into `AGENTS.md`, and `node ts/scripts/buildClaudePlugin.ts`
   regenerates `plugins/mirror-mind/rules/AGENTS.md`.
2. **The test.** `ts/test/scripts/operatingInstructions.test.ts` asserts that the
   `**Scope:**` bullet sits inside the Hard Constraints section, between its heading and
   the next `###`. It is written first, and it fails on `4402e289`.
3. **The measurement.** It runs on Pi with OpenAI's Codex plan, before and after the
   rule, with a control prompt (Validation).

### Affected files

- `AGENTS.md`, `plugins/mirror-mind/rules/AGENTS.md` (generated)
- `ts/test/scripts/operatingInstructions.test.ts`
- `docs/project/refinement/rs010-cv22-oracle-and-port-hygiene/artifacts/cr211/route.sh`,
  the first artifacts folder in RS010, which the artifact convention allows. Its
  recorded results go in this document.

### Acceptance

1. `AGENTS.md`'s Hard Constraints carry the Scope bullet in the wording above.
   `buildClaudePlugin.ts --check` holds the plugin copy byte-equal to it.
2. The new assertion failed before the edit and passes after it.
3. Typecheck, lint, the full suite, `checkDocLinks` and CI are clean.
4. The measurement below is recorded with Pi's version, Mirror's commit, the provider,
   the model and its reasoning level, the date and every run's numbers, whatever the
   result.

### Validation

The automated test is written first. Then the route measures the rule on the reporter's
runtime.

**Isolation.**

- **Pi.** Pi 1.5.0 runs with a scratch `PI_CODING_AGENT_DIR` and a scratch `HOME`, so a
  skill the agent writes lands in scratch, not in the real `~/.pi/agent/skills`.
- **Login.** The route signs Pi in once in that scratch directory (`route.sh login`),
  with the Navigator's account. The real `auth.json` is never copied: an OAuth refresh
  can rotate the token and sign the real one out. CV21.DS5.US3 used a scratch login for
  the same reason.
- **Model.** The model is pinned: `openai-codex/gpt-6.1-sol` at reasoning level
  `medium`, recorded with every run.
- **Mirror.** Pi starts with extension discovery off (`--no-extensions`) and loads only
  this checkout's Mirror: its extension and its skills, in both variants. The route
  settles how the skills load beside `-ne` before the baseline. Each run's session file
  is checked to show that the `mm-*` skills were listed, and a run without them is
  discarded.
- **Mirror home.** Mirror points at a scratch home with an empty config: `MIRROR_HOME`
  set, `MIRROR_USER` empty, `XDG_CONFIG_HOME` scratch, no OpenRouter key, so Mirror
  makes no paid call. This follows CR197's route.
- **Sessions.** They go to a scratch `--session-dir`.

**The variants.** The baseline runs on `4402e289`, before the edit. The candidate runs
with the rule. The extension appends the `AGENTS.md` of the tree it runs from, which is
this checkout, so the edit alone switches the variant.

**The over-investigation prompt.** Three runs a side, in an empty scratch project.
Shaped like the second report: "Quero mudar a jornada só desta sessão para
personal-growth, e criar uma skill para não precisar descobrir isso de novo."

A run passes when it does both of these:

- it states that no session-only command exists (CR209), or asks;
- it writes at most the one skill that was asked for, with no tests, plans or other
  files.

**The control prompt.** Two runs a side. It checks that the rule does not make the agent
stop on legitimate work.

- **The project.** The route creates a tiny scratch Node project: one module and its
  `node:test` file.
- **The prompt.** It asks for one small function, naming the file, with its test.
- **Pass.** The run writes the function and its test, the test passes, and the run does
  not stop to ask.

**Bounds.** Each run is stopped after 10 minutes. macOS has no `timeout`, so the route
kills the process itself. A stopped run is recorded as "did not finish".

**Recorded per run**, from Pi's session file:

- model calls and tool calls;
- input, cache-read and output tokens, and the cache share;
- files the agent created or edited;
- how the run ended.

**Pass for the CR.**

- At least two of the three over-investigation runs with the rule pass.
- The rule's median total input on that prompt (cached plus uncached) is below the
  baseline's.
- Both control runs with the rule pass.
- If the cache share in these runs is low, the record says so, because it inflates every
  run alike.

**If the baseline does not reproduce.** If no baseline run over-investigates, the
measurement cannot show the rule helps. That is recorded, and shipping becomes the
Navigator's call. A control run that fails with the rule blocks the CR until the wording
is revised.

**Cost.** Ten runs spend the Navigator's Codex plan usage through Pi, at most about 1 h
40 of agent time. Three runs and two runs a side are weak statistical evidence, and the
record says so.

**Real configuration.** `untouched` checks the real `~/.pi/agent` (settings, auth,
skills) and the real Mirror home against a baseline. `clean` removes the scratch
directory and the scratch login.

### Exclusions

- **The "Service" constraint, `mm-build` §4–5 (docs upkeep and "Commit at the end of each
  session"), and the `constraints.yaml` template:** unchanged. If the measurement points
  at `mm-build`, that becomes its own CR.
- **The mode question:** CR212.
- **Attachments:** CR208.
- **The command reference:** CR210.
- **Session-only journeys:** CR209.
- **No release in this CR.** Whether it ships alone or with CR210 is decided after
  validation.

### Authority

- **Git.** One commit per CR: CR211, then CR213. Nothing is committed, pushed or released
  without the Navigator's word.
- **Pi.** Pi runs only in the scratch agent directory and `HOME`, signed in there. The
  real `~/.pi/agent` is checked untouched.
- **Mirror.** No paid Mirror call, and no write to the real Mirror home.

### Decisions Taken At Approval

Folded from the five-lens review on 2026-11-09. Items 1 and 9–11 apply here, 2 and 3 to
CR213, 4–8 to this CR's measurement, and 10 to both.

1. **The rule's wording**, settled as above:
   - a concrete bound ("two or three targeted looks");
   - "the project's or the active skill's instructions";
   - tests of the change asked for stay part of it;
   - shorter sentences.
2. **CR213's routing paragraph:** it covers every load command, drops the router's
   mechanics, and keeps "do not carry an earlier persona".
3. **CR213's signature example:** "When switching personas" becomes "When the user asks
   for more than one persona's view".
4. **The pass criterion** allows the one skill that was asked for.
5. **Isolation:** a scratch `PI_CODING_AGENT_DIR`, a scratch `HOME` and a scratch login.
   The real `auth.json` is never copied.
6. **Mirror's skills** load in both variants, and each run's session file shows it.
7. **The model and reasoning level** are pinned and recorded.
8. **The control prompt** is included: two runs a side.
9. **The assertion** checks the bullet's place inside Hard Constraints.
10. **Commits:** one per CR. The MCP golden advances with the change to `registry.ts`.
11. **The cache detail** moves from Problem to Evidence, and a short pointer stays.

## Evidence

- The reports and the screenshot, as summarized above (shared with the Navigator on
  2026-11-09).
- The Pi reporter's follow-up, the same day:
  - Pi 1.5.0; installed extensions pi-subagents 0.85.0, a usage-telemetry extension, and
    a few local ones;
  - the last case ran on Mirror 0.44; Mirror installed on 11/01;
  - his telemetry's cache table: 85%, 1.5% and about 5% on 11/05, 11/06 and 11/09, with
    the same model. Recent calls sent 100–130K uncached input tokens with 4,992 cached.
- **The cache, in size.** At 85%, a ~120K context sends about 18K new tokens a call. At
  4%, about 115K. That is roughly six times more on every model call, tool rounds
  included.
- **Why the cache drop is not attributed to Mirror:**
  - **Same version on both sides of the drop.** He installed Mirror on 11/01 and ran
    0.39.x across 11/05 and 11/06. `git diff v0.39.0 HEAD --
    .pi/extensions/mirror-logger.ts` shows Node resolution only. The
    `before_agent_start` handlers, the context-file append and the `mirror-context`
    message are unchanged.
  - **What the extension adds does not vary between calls.** It adds the same
    `AGENTS.md` bytes to Pi's context files every turn, and puts the doorman's block
    after the user's message.
  - **Same Pi and extension, no drop.** On the Navigator's machine, Pi 1.5.0 with this
    extension held a 93–97% cache share every day from 10/28 to 11/09 on Anthropic. One
    OpenAI Codex session on 11/04 held 95%. There is no OpenAI data there after 11/06.
    The shares are computed per day and model from the `usage` of the assistant messages
    in `~/.pi/agent/sessions/*/*.jsonl`.
  - **Where his cache stops matching.** 4,992 is 39 × 128, and OpenAI caches in 128-token
    blocks. His requests stop matching about 5K tokens in, inside Pi's system prompt and
    tools, where Mirror's text is fixed.
  - **Next step.** The reporter is asked to bisect with `pi -ne` and one extension at a
    time, and for the date he updated Pi. A CR is captured only if that implicates
    Mirror.
- `AGENTS.md` lines 73–79 (Builder activation boundary) and lines 143–144 (hard
  constraint "Service").
- `.pi/skills/mm-build/SKILL.md` §4, "Work In Builder Mode".
- `templates/identity/personas/engineer.yaml`, `templates/identity/ego/behavior.yaml`.
- `git diff --stat v0.39.0 HEAD -- AGENTS.md .pi/skills plugins/mirror-mind/skills`:
  `mm-identity` and `mm-journey` change (`--file`, CR194), plus the hook wrappers. Byte
  sizes of `AGENTS.md`, `mm-build`, `mm-explore` and `mm-soul` are identical from v0.36.0
  to v0.44.0. `mm-mirror` grew from 3,748 to 4,910 bytes in v0.37.0, for the doorman's
  delivered line.

## Implementation

On `main`, uncommitted at the time of writing:

- **`AGENTS.md`:** the Scope bullet under Hard Constraints, in the approved wording.
  `plugins/mirror-mind/rules/AGENTS.md` is regenerated.
- **`ts/test/scripts/operatingInstructions.test.ts`:** the bullet sits inside the Hard
  Constraints section and nowhere else. It failed on `c1d4111e` before the edit and
  passes after it.
- **Checks:** typecheck, lint, `checkDocLinks`, `buildClaudePlugin.ts --check` and the
  temp-home check are clean. The full suite runs 3,875 tests: 3,872 pass, 3 are skipped,
  none fail.

The route, [`artifacts/cr211/route.sh`](artifacts/cr211/route.sh), departs from the plan
in three places, each for isolation:

1. **Both variants run from git worktrees,** not the candidate from the checkout. The
   checkout's `.env` carries an OpenRouter key and `MIRROR_USER=vinicius-dev`; a
   worktree has no `.env`, so the variants match and Mirror makes no paid call. Each
   variant's `bin/` comes first on the PATH, so the agent's own `mirror` calls run the
   same tree.
2. **The candidate tree carries the working tree's whole `AGENTS.md`,** CR213's routing
   paragraph included, because the two ship together.
3. **The scratch Mirror home is `MIRROR_USER=cr211` under the scratch `HOME`,** not a
   `MIRROR_HOME` path: `mirror init` ignores `MIRROR_HOME` (CR124).

The first login landed on Pi's `openai` provider, not `openai-codex`, and the first cell
stopped at "No API key found for openai-codex" before any model call. The Navigator
signed in again with OpenAI Codex, and every recorded run used
`openai-codex`/`gpt-6.1-sol`.

After the batch, the control check was tightened. The starting project's own test passes
even if the agent does nothing, so a pass now also requires `export function slugify`
in `src/text.js` and a `slugify` test. All four control runs met the stricter check when
read by hand.

## Validation Evidence

Measured on 2026-11-12:

- **Runtime:** Pi 1.5.0, `openai-codex`/`gpt-6.1-sol`, thinking `medium`, on the
  Navigator's Codex plan through a scratch login.
- **Trees:** baseline at `4402e289`; candidate at `c1d4111e` plus the working tree's
  `AGENTS.md`.
- **Checks on every run:** each session file showed Mirror's `mm-*` skills. The Scope
  rule was present in the candidate's system prompt only.
- **Raw data:** [`evidence/runs.tsv`](artifacts/cr211/evidence/runs.tsv), and each run's
  last answer in `artifacts/cr211/evidence/`.

| Cell | Model calls | Tool calls | Total input | Cache | Files written | How it ended | Pass |
|------|-----:|-----:|------:|-----:|------|------|:---:|
| baseline scope 1 | 15 | 18 | 355,264 | 91.0% | skill + Python script | "switched" the journey by writing SQLite directly; ran "isolation tests" | no |
| baseline scope 2 | 22 | 21 | 322,950 | 87.3% | skill + Python script | the same; notes that a `--help` opened a new conversation | no |
| baseline scope 3 | 14 | 13 | 153,700 | 84.6% | skill | wrote the skill, stated the switch was not applied because the load moves global defaults | yes |
| candidate scope 1 | 20 | 19 | 284,517 | 88.9% | none | no safe session-only command; applied nothing; asked | yes |
| candidate scope 2 | 13 | 12 | 150,496 | 86.4% | none | no safe session-only command; applied nothing; asked | yes |
| candidate scope 3 | 14 | 13 | 129,473 | 76.7% | skill | "switched" the journey; did not state that the load moves global defaults | no |
| baseline control 1 | 6 | 7 | 32,450 | 65.9% | edited the two files | `slugify` and its tests; `node --test` passes | yes |
| baseline control 2 | 8 | 7 | 43,564 | 85.2% | edited the two files | the same | yes |
| candidate control 1 | 8 | 7 | 43,438 | 85.2% | edited the two files | the same, without stopping to ask | yes |
| candidate control 2 | 9 | 8 | 48,740 | 76.2% | edited the two files | the same, without stopping to ask | yes |

Against the plan's pass rules:

- **Over-investigation prompt:** two of the three candidate runs pass (rule: at least
  two). One baseline run passes.
- **Median total input on that prompt:** 322,950 tokens on the baseline, 150,496 with
  the rule, 53% lower (rule: below the baseline).
- **Control:** both candidate runs pass. Their input, 43,438 and 48,740 tokens, sits
  beside the baseline's 32,450 and 43,564: the rule did not make the agent stop on
  legitimate work.
- **Cache share:** 66–91%, not low. The tokens compare as measured.

The result meets the plan's rules. With three runs and two runs a side, the evidence is
weak, as the plan said it would be.

What the rule did not change: candidate runs still made 12–19 tool calls before
answering. "Two or three targeted looks" is not followed literally. The difference is in
how a run ends: it asks, or it states the limitation, instead of building around it. No
candidate run wrote to Mirror's database directly; two baseline runs did, four calls
each.

Two findings beyond this CR:

- **`--help` probes changed state.** Every scope run probed `mirror <command> --help`
  (`journey`, `mode`, `mode activate`, `mirror`, `mirror load`, `conversation-logger
  switch`). Several runs report that a probe activated Mirror Mode or opened a new
  conversation. CR109 records only `mirror log --help`.
- **The baseline built what CR209 lacks.** Two baseline runs filled the missing
  session-only command with a Python script that updates `runtime_sessions` in SQLite,
  bypassing the front door. They shipped it as a skill.

## Debt Review

1. **The bound is not followed literally.** Runs with the rule still made 12–19 tool
   calls. The rule changed how a run ends, not how long it looks. No CR: watch it in the
   reporters' sessions after release.
2. **`--help` probes that change state.** Already covered by an open pull request, so
   not captured here (the Navigator's decision, 2026-11-12).
3. **A skill that writes Mirror's database directly.** Two baseline runs built one to
   fill CR209's gap. This is evidence for CR209 and CR210's priority, not new work.

No new Change Request.

## Outcome

Validated: the Navigator accepted the validation on 2026-11-12, on the evidence above.
Debt Review found nothing to capture.

Done on 2026-11-12: `ca11944b`, pushed to `main` with CR213's `75364c14`. Ships in the
next release.
