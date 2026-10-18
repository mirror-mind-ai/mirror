# Plan — CV21.DS7.US4

## Objective

Measure Antigravity at DS12.TS3's successor bar, live, in one session on the
installed agy (1.4.2), Mirror installed through the shipped package only.
TS1–TS3 built and measured each mechanism in isolation; US4 walks all five
TOGETHER as a Gemini CLI user would meet them, records each with version,
binary, and date, and moves the parity row. The result is DS8's gate.

**This is a measurement, not a feature.** No new production code is planned.
The one allowed exception is the Codex-US4 precedent: if the live walk finds
a Mirror DEFECT (a bar line red for a Mirror reason), it is fixed under an
explicit, named scope change with its own red-first test — not folded in
silently. agy's own limitations (headless `--print` tool denial, seen in
TS2/TS3) are recorded as agy's behavior, not Mirror defects.

## The per-item ledger and the L4 rubric (declared before the walk)

DS8's gate is "DS7 meets the bar" — five items, read line by line, not an
aggregate label (quality-assurance). US4 produces a **per-item verdict**,
each `PASS` / `PASS-WITH-NOTE` / `FAIL`, and the story's done condition is
**all five PASS (notes allowed), or a FAIL the Navigator accepts as agy's
limit**. The parity level follows this rubric, pre-declared so the walk is
not graded against a moving target:

| level | rule |
|---|---|
| **L4** | all five bar items observed on the REAL path a user has |
| **L4-with-note** | an item observable only via a workaround agy's normal use does not need (e.g. a `--print` limitation), with the real path recorded |
| **not L4** | a bar item unobservable on any real path |

The ledger also carries, for DS8's honesty: the **close-timing delta** —
Gemini CLI closed at session end; Antigravity closes ~30 min later by the
stale-orphan path (Codex's latency, TS3). Logging parity holds; close timing
differs; memories still extract. DS8's "nothing is lost" cutoff must say so.

## Scope

**The bar-walk route — the story's `route.sh`:**

- Compose TS1–TS3's route steps into one isolated session in a scratch HOME:
  stage the plugin (US1), authenticate the scratch login once, run the walk,
  then close. Prefer an interactive session over `--print` where headless
  tool-denial would block a turn (the TS2/TS3 limitation), so the walk sees
  the real path a user has.
- **Minimum walk** (researcher): at least **three user turns** with Mirror
  Mode active, so "injection once per turn" is observed with `invocationNum`
  resetting across turns at least **twice**, not inferred from one; the
  turns are simple questions that do not need a tool (avoiding `--print`'s
  denial where interactive is not used).
- **Capture method, named per item** (quality-assurance): skills — the
  staged tree listing plus a skill invocation's answer; instructions — the
  staged-only rules marker quoted (TS2's method); injection — the count of
  `EPHEMERAL_MESSAGE`/`SYSTEM_SDK` steps across turns, read from the
  transcript, plus the `invocationNum` reset; logging+close — the scratch
  Mirror DB row counts/labels and the closed state after the orphan sweep
  (TS3's method); install — the step count from `mirror init`. Interactive
  observations are backed by a DB/transcript read or a screenshot, never
  "the Navigator saw it".
- **Live negative probes** (researcher), so the positives are a measurement
  and not a demo: a turn with Mirror Mode **off** must inject NOTHING (the
  quiet session, live), and a `/mirror-mind:mm:*` turn must **not** be logged
  as conversation (the skill-skip, live). Both green live is the
  falsifiable half of the walk.
- Check and record each bar item:
  1. **skills** — the 25 `mm` skills reachable (the staged tree and a skill
     invocation, e.g. `/mirror-mind:mm:mirror`);
  2. **instructions** — the Operating Instructions present at session start
     (the rules marker reaching the model, TS2's method);
  3. **injection** — Mirror Mode context injected once per user turn
     (`EPHEMERAL_MESSAGE`/`SYSTEM_SDK` in the transcript, TS2's proof; the
     per-turn count);
  4. **logging + close** — the turns logged as `antigravity`, paired, and
     the conversation closed by the returning-session stale-orphan path
     (TS3's proof);
  5. **install steps** — one (`agy plugin install`), within Gemini CLI's two.
- Record MCP reachability (not gated): whether agy reaches the plugin's
  `mcp_config.json` server and lists its tools.
- `route.sh verify` pins agy 1.4.2; a different binary re-opens the walk.
- **Environment recorded as structured data** (researcher): agy version and
  binary path, UTC timestamp, account tier, model, whether interactive or
  `--print`, and that the scratch HOME was clean — so the result is
  reproducible by `verify` plus the record.
- **Evidence destruction and credential removal are route steps**
  (security-engineer): the scratch Mirror DB and the agy transcript hold
  REAL content, so the workdir is destroyed on exit by a trap, the committed
  evidence is only derived counts/observations, and the route VERIFIES the
  scratch credential is absent at the end and reports it — the one artifact
  that must never persist, learned from TS2's first-run trap crash.

**The parity row:**

- DS7 index: the bar status and the measured level, with version, binary,
  date.
- CV21 index: the DS4-style parity line for Antigravity (as Codex's reads
  "L4, measured on …"), and the DS7 row to Done.
- The runtime interface spec's parity note, if it carries one for agy.

**Pre-walk automated confirmation:**

- `node --test`, `npx biome check .`, `generate_hook_wrappers.sh --check`,
  and `node ts/scripts/buildClaudePlugin.ts` (in sync) — proof the shipped
  mechanisms TS1–TS3 built are intact before the live walk, so a red line is
  the live session's finding, not drift.

## Non-Goals

- DS8's Gemini CLI removal: US4 is only its gate.
- New production behavior beyond a named-scope-change defect fix.
- MCP as a gate: recorded, not required (the bar excludes it).
- The cross-session write defect (DS12.TS2 L9), routed.
- Re-measuring Claude, Codex, or Grok.

## Acceptance Behavior

```text
Given Mirror installed through the shipped package only, on agy 1.4.2
When one live session walks the five bar items
Then each is observed and recorded with version, binary, and date: skills
  reachable, instructions at start, injection once per turn, turns logged as
  antigravity and the conversation closed, install in one step
And MCP reachability is recorded (not gated)
And each bar item carries a PASS / PASS-WITH-NOTE / FAIL verdict
And the live negative probes hold: injection absent with Mirror Mode off,
  a skill turn not logged as conversation
And the parity level follows the pre-declared rubric; the close-timing
  delta is recorded for DS8
And any FAIL is either agy's behavior the Navigator accepts, or a Mirror
  defect fixed under a named scope change with a red-first test
```

## Validation Route

Automated (pre-walk, proving the shipped mechanisms are intact):

- `node --test`; `npx biome check .`;
  `bash scripts/generate_hook_wrappers.sh --check`;
  `node ts/scripts/buildClaudePlugin.ts` reports in sync.

Navigator-visible route (the measurement; sanitized evidence):

- The Navigator runs `bash route.sh live` on the installed agy, one session,
  real key, and records each bar item's observation. Pass: every bar line
  green with version, binary, date; Navigator accepted. Fail: a red line for
  a Mirror reason not explained and fixed under the named scope change.
- `route.sh verify`: the installed agy matches the recorded 1.4.2, or the
  walk is re-run and the version updated.

E2E decision: the live walk IS the E2E — the whole story is one live
measurement on the installed agy. CI has no agy; the pre-walk suite proves
the mechanisms, and the walk proves them together, live.

## Implementation Contract

- No new production code unless a named-scope-change defect fix requires it,
  red-first.
- Keep changes scoped to `CV21.DS7.US4`.
- Do not use git add .; commit only story-scoped files.
- Sanitize evidence: observations, readings, and counts — never conversation
  content (a transcript holds the user's and model's words).
- Follow the project's development guide: docs/process/development-guide.md.

## Stop Conditions

- scope_change_detected — a red bar line that needs a production fix: name
  the scope change, add the red-first test, then fix.
- plan_rule_conflict.
- failing_required_check_without_clear_fix.
- navigator_decision_needed — the walk cannot observe a bar item on the
  installed agy (an agy limitation blocks the real path), so the parity
  level it supports is the Navigator's call.

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
