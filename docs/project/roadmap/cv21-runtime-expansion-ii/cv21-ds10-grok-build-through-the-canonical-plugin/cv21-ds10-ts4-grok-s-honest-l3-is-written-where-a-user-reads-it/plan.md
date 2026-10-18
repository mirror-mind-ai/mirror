# Plan — CV21.DS10.TS4

## Objective

Write Grok Build into the places a user and a maintainer read, from DS10's record and
nothing else: the runtime interface contract gains a Grok Build reference
implementation beside Claude Code, Pi, Antigravity, and Codex, and its runtime tables
gain Grok's rows; README, Getting Started, and REFERENCE name Grok Build as the fifth
runtime with US1's two steps and one honest line — Mirror Mode on request, no
automatic context per turn, the Operating Instructions as a home rule, the MCP tools
through `search_tool`/`use_tool`. Everything written carries the version it was
measured on (grok 1.0.62) and the story that measured it. DS11 folds the parity matrix;
TS4 writes only what DS10 measured, and with it DS10 closes.

One product decision rides on this story: **CR143**, captured at US3's Debt Review —
the plugin's inject hook runs `mirror load` on Grok, which discards the context, and
the user waits 2.3–2.6 s for each load. The fix is one predicate beside its siblings in
`runtimePolicy.ts` and an early return in `claudeInject`; this plan proposes paying it
here (decision 1), because the contract's injection-models row has to say what the
hook does on Grok either way, and "returns at once" is the truer sentence.

## Scope

**The runtime interface contract** (`docs/product/specs/runtime-interface/index.md`).

- The opening paragraph: five runtimes, Grok Build "(the shipped plugin, with the
  Operating Instructions as a home rule)".
- A `### Grok Build` reference-implementation section after `### Codex`, in the same
  shape: the event table (session start → plugin `SessionStart` hook; user prompt →
  the plugin's `UserPromptSubmit` hooks, with the inject one returning at once
  (decision 1) because Grok discards prompt context; assistant response → the plugin
  `Stop` hook; session end + backup → the plugin `SessionEnd` hook under Grok's 1.5 s
  bound, the deferred tail finished at the next start; Mirror load → the `/mm-mirror`
  skill, explicit). The narrative: the install (US1's two steps, the copy under
  `~/.grok/installed-plugins/`, the rule under `~/.grok/rules/`); runtime detection by
  `GROK_HOOK_EVENT`/`GROK_SESSION_ID` or the camelCase payload, the label `grok_build`,
  the turn id `promptId`; Grok's extra Stop at session end, which the hook ignores; the
  bound as the installed guide states it (a plugin's `SessionEnd` hook gets at most the
  1.5 s default whatever its own `timeout`; exit waits at most 10 s) and the close
  measured 213–259 ms after it; the MCP server attached, its seven tools as
  `mirror-mind__<tool>` behind `search_tool`/`use_tool`, the `init`/session-start
  count taken while it is `pending`; the injection Grok lacks — a SessionStart
  `systemMessage` shown on screen, `additionalContext` ignored on both events — and the
  home rule that carries D13 (~2,233 tokens, every project); skills unqualified
  (`/mm-mirror`, Pi's spelling) unless a name collides; honest parity **L3**, with
  version, binary, and date (US3).
- The tables: *Session ID delivery* gains Grok (`sessionId`, camelCase, or
  `GROK_SESSION_ID`); *Extraction models* adds Grok to the deferred row; *Mirror Mode
  injection models* gains a row — explicit invocation on Grok, the hook registered and
  returning at once (decision 1) since `UserPromptSubmit` context is discarded. The
  installed-wiring row (US1, TS2) stays as written.

**README.** "Four supported runtimes" becomes five, Grok Build named; the
"Multi-runtime" bullet likewise. Nothing else: README does not carry parity levels.

**Getting Started.** §1 "Other harnesses" gains Grok Build with its link; §8 gains a
`### Grok Build` run section in the shape of Codex's and Antigravity's, written in
the order a user needs it (writer and product-designer amendments 5): **what you get**
— `grok`, then `/mm-mirror …` as the first thing to try (Grok may ask to run `mirror
mirror load`: approve it; the answer takes a while), the skills in Pi's spelling
(`/mm-build <slug>`), each turn logged as `grok_build`, the conversation closed at
exit and its memory extracted when the next session starts, Mirror's MCP tools found
by the model through `search_tool` and `use_tool`; **what you don't**, in its own short
paragraph — nothing is added to the model's context on each turn, so Mirror Mode lasts
as long as the skill's own instructions do; **why** — Grok shows a hook's session-start
message on screen and discards what a hook offers per turn, which is why the
Operating Instructions arrive as the rule you linked in step 2 (about 2.2k tokens in
every session, every project). One name for that file throughout: *the rule you linked
in step 2*. No story codes, no "L3", no millisecond figures here; the "if you also
wired Claude Code" note is already in §6. "How the mirror reaches each runtime" names
Grok: the rule. The troubleshooting pointer for a GUI launch already covers hooks
skipping; the plugin installed twice from a respelt path is REFERENCE's diagnose
paragraph, not here.

**REFERENCE.** The Commands preface: Grok Build uses the `/mm-` prefix, as Pi does, and
a plugin install qualifies a skill only on a collision. The `runtime diagnose`
paragraph gains Grok's three findings from US1 (`grok_plugin_copy_behind`,
`grok_plugin_copies_duplicated`, `grok_rules_link_dangling`) with their repair lines;
the `runtime update` paragraph gains the Grok reinstall hint beside Codex's. The MCP
paragraph already names Grok.

**AGENTS.md.** The skill-naming sentence: `/mm-<skill>` in Pi and Grok Build. The
plugin's `rules/AGENTS.md` copy is regenerated by `buildClaudePlugin.ts` and `--check`
holds it — **AGENTS.md and the regenerated copy land in one commit** (amendment 3), or
every checkout between two commits fails `--check`; the smoke's SessionStart output
changes with it and asserts nothing on the sentence.

**CR143, paid here (decision 1).** `ts/src/conversation/runtimePolicy.ts` gains
`runtimeReadsPromptContext(interfaceName)` beside `sessionEndRunsLlmTail` and
`sessionOutlivesTui`, in their shape: true for `claude_code` and `codex`, false for
`grok_build`, and **true for `null` or an unknown label** — an unlabelled payload is a
Claude Code payload by detection's own rule, and a predicate that failed closed would
silence injection on the one runtime that needs it (amendment 1); the measured reason
in its comment (DS12.TS4 L3; US3's canary). `claudeInject` detects the runtime with
`detectHookRuntime(payload.raw)`, the same line its three sibling hooks use — no
wrapper flag, the wrappers stay byte-identical — and returns 0 **above the explicit-
form check and above the session-state read**: on Grok the `/mm-mirror` turn's load is
the 2.6 s one, and one SQLite open would falsify "tens of milliseconds". Nothing is
marked injected: that write says the model received context, and on Grok it did not.
Tests first (amendment 2): `runtimePolicy.test.ts` for the four labels; the inject
test with a `grok_build`-shaped payload asserting no front-door spawn, exit 0, empty
stdout; the Claude cases untouched. The story route runs the real `mirror-inject.sh`
with **three** payloads — Grok, Claude Code, Codex — against a scratch home and reads
the front-door log for the `mirror load` line: none on Grok, one on each of the
others; the Grok run's wall time in tens of milliseconds where it was seconds. CR143
moves to `done` in the Refinement index with Driver `@viniciusteles` and Delivery
`main` (decision 2), and its document's Plan, Evidence, and Outcome carry the clock
numbers (amendment 7).

**The closure.** The DS10 package: TS4's row Done; the DS status Done with its Done
Condition read against the four stories; the CV21 row and the sequencing tree read
DS10 Done; a worklog entry; decisions.md: one short entry for CR143's rule ("a hook
that would inject context returns at once on a runtime that discards it"). The Done
record names which release DS10 rides — DS5's or DS11's, as CV21's sequence has them —
without deciding one (amendment 8). DS10's Delivery Story closure follows TS4's Done
in the same session, by the Navigator's confirmation.

**The story package.** `route.sh` with `docs` (every surface above grepped for the
sentences that must agree: the two printed steps, `grok_build`, `search_tool`,
`/mm-mirror`, "1.0.62" beside each measured claim in the contract, the three finding
codes, the five-runtime count in README and the contract's opening; **negative greps**
— zero "four runtimes"/"four supported" across README, Getting Started, REFERENCE,
and the contract, and no "injected"/"once per turn" inside Getting Started's Grok
section (amendment 4); `checkDocLinks`; `buildClaudePlugin.ts --check`), `hook` (the
inject wrapper run with the three payloads against a scratch Mirror home, timed, the
front-door log read; no model), and `untouched`.

## Non-Goals

- The parity matrix across every doc with every runtime's version, binary, and date
  side by side: DS11.
- Raising Grok above L3, or any change to what Grok does with hooks; the rule link
  and the install are US1's and stay as printed.
- Any hook change beyond CR143's early return: the Stop, session-start, prompt-log,
  and session-end hooks are untouched.
- A troubleshooting entry for Grok: no symptom from DS10 needs one beyond what
  REFERENCE's diagnose paragraph says; CR142's smoke note is a maintainer's matter.
- `review-copy` on Grok (DS5); the Pi extension; Codex and Antigravity text, except
  where a sentence counts runtimes.

## Acceptance Behavior

```text
Given the contract, README, Getting Started, REFERENCE, and AGENTS.md after this story
When route.sh docs runs
Then the contract has a "### Grok Build" reference implementation, Grok rows in the
     session-id, extraction, and injection tables, and an opening that counts five
     runtimes; README counts five and names Grok Build; Getting Started has a
     "### Grok Build" run section naming /mm-mirror, the home rule, search_tool and
     use_tool, grok_build, and the close at exit; REFERENCE names the /mm- prefix for
     Grok and the three diagnose findings with their repair lines; AGENTS.md's
     skill-naming sentence names Grok Build; every mention carries 1.0.62 where a
     measurement is claimed; checkDocLinks and buildClaudePlugin --check are clean

Given a UserPromptSubmit payload shaped as Grok sends it (GROK_HOOK_EVENT, promptId)
When the plugin's mirror-inject.sh runs
Then it exits 0 with nothing on stdout, makes no front-door call, and marks nothing
     injected — in tens of milliseconds, where it took seconds before

Given the same payload shaped as Claude Code sends it
When mirror-inject.sh runs
Then it behaves exactly as before: the explicit form loads context, active Mirror
     Mode injects once

Given the story closes
When the roadmap is read
Then TS4 and DS10 read Done, the CV21 row and tree read DS10 Done, CR143 reads done
     with Driver and Delivery, and decisions.md holds CR143's rule
```

## Validation Route

**Automated (Driver).** `npm run typecheck`, `npm run lint`, `npm test`,
`node ts/scripts/checkDocLinks.ts`, `node ts/scripts/buildClaudePlugin.ts --check`,
`bash scripts/smoke_claude_plugin.sh` (through step 4 on this machine: CR142).
The new tests fail before the change and pass after it.

**Navigator, step 1 — the docs.** `bash route.sh docs`. Expected: every sentence the
route greps found where the plan puts it, the link and plugin checks clean. Then read
the two user-facing pieces as a user would — Getting Started's `### Grok Build` and
the contract's `### Grok Build` — and say whether the honest line reads as honest.

**Navigator, step 2 — the hook.** `bash route.sh hook`. Expected: the Grok-shaped
payload answered in tens of milliseconds with no stdout and no `mirror load` in the
scratch home's front-door log; the Claude-shaped payload unchanged. Fail: a load on
the Grok payload, or a change on the Claude one.

**E2E decision:** not required for the docs; for CR143 the direct wrapper run is the
measure — the model never saw the context on Grok, so no session can show a
difference, only the hook's own clock can.

**Step 3 — untouched.** `bash route.sh untouched`: the real configuration as before.

## Implementation Contract

- Decision 1 taken before any code; tests first for the predicate and the hook.
- Keep changes scoped to `CV21.DS10.TS4`: the documents named in Scope,
  `runtimePolicy.ts`, `hooks/claude.ts`, their tests, the regenerated plugin rules
  copy, the Refinement index and CR143, the roadmap and worklog.
- Do not use `git add .`; commit only story-scoped files.
- Follow the project's development guide: docs/process/development-guide.md.

## Stop Conditions

- Decision 1 declined: the injection row then reads "registered and inert", CR143
  stays captured, and the hook is untouched — not a stop, a smaller story.
- `claudeInject` cannot read the runtime from the payload the way the other hooks do
  (navigator_decision_needed: the detection seam).
- scope_change_detected, plan_rule_conflict, failing_required_check_without_clear_fix.

## Decisions Taken At Approval

Approved by the Navigator on 2026-10-18, with amendments 1–8 of the plan review
(engineer, quality-assurance, writer, product-designer, devops-engineer) folded into
Scope above:

1. **CR143 is paid here.** One predicate beside its siblings, one early return, the
   tests, and the hook's clock as the proof; the contract's injection row says what
   is true.
2. **CR143's `done` row:** Driver `@viniciusteles`, Delivery `main`, as CR141's reads.

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
