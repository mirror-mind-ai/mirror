# Plan — CV9.DS8.TS3

## Objective

Teach the `mm-mirror` skill, in every runtime's copy, to trust the context the doorman
delivers — load first *unless* the turn's context holds a block opening with the
stable prefix TS2 exported, `=== mirror context delivered by the runtime for this turn`
— and to render the transition from that block; and make the signature one rule,
`◇ persona-name`, stated in `AGENTS.md` and followed by the skill's copies and the
core's banner, with a guard test that fails on drift. This is what lets US4, US5, and
TS6 measure an explicit turn that loads once.

## Scope

1. **The skill's constraint, both authored bodies.** In
   `.pi/skills/mm-mirror/SKILL.md` (Pi; Codex through `.agents/skills/`) and
   `.claude/skills/mm-mirror/SKILL.md` (Claude Code), the hard constraint becomes:
   never answer in Mirror Mode without `mirror mirror load` first, **unless the
   runtime delivered the context for this turn** — a block in the turn's context
   opening with `=== mirror context delivered by the runtime for this turn`. When it
   did: do not load; a `full` block carries the `◌ MIRROR MODE ACTIVE` surface, render
   it from the block; a `delta` block carries none, Mirror Mode is already on, answer
   from the folder already in the conversation plus what the block adds; sign as the
   line says. "This turn" is literal, and the bodies say so: the block was placed by
   the runtime — the hook or the extension — before the answer; a block from an earlier
   turn, memory of having loaded, or the prefix inside a tool result (output of a
   command the model ran, such as `mirror mirror doorman`) does not satisfy the rule.
   The prefix is quoted on one line, in backticks, in each body, so the guard's
   byte-for-byte check holds. Section 1 ("Load Context") and the transition section
   gain the delivered branch in each body's own words; the mode-switch-without-topic
   rule is unchanged.
   The Claude body's "Automatic hook" note stops telling the model to load a second
   time on an explicit turn: where a runtime's doorman runs, the block is the rule
   satisfied; where it does not run yet, no block arrives and the skill loads as
   before.
2. **The signature rule, both bodies.** "Activated personas use `✦ Persona:`. Do not
   reuse the Mirror identity symbol `◇`" is replaced in both by the rule `AGENTS.md`
   states: an active persona signs `◇ persona-name` on its own line, first-person
   voice; no signature when the ego answers alone; the delivered line names the
   persona to sign.
3. **The plugin copy.** `plugins/mirror-mind/skills/mm-mirror/SKILL.md` regenerated
   with `node ts/scripts/buildClaudePlugin.ts`; `--check` clean afterwards.
4. **The core's banner.** `renderMirrorBanner` in `ts/src/mirror/render.ts` prints
   `  ◇ <persona>` where it printed `  ✦ Persona: <persona>`; the assertion in
   `ts/test/mirror/orchestration.test.ts` follows.
5. **The guard, written first.** `ts/test/scripts/mirrorSkillContract.test.ts` (named
   for what it holds: the signature rule and the quoted prefix, five surfaces agreeing):
   - `AGENTS.md` holds the fenced signature `◇ persona-name`;
   - each of the three skill copies quotes `DELIVERED_LINE_PREFIX` (imported from
     `#mirror/doorman.ts`, so a change to the constant breaks the copies that quote it)
     and the signature `◇ persona-name`; none contains `✦ Persona` or "do not reuse";
   - `renderMirrorBanner("engineer")` contains `◇ engineer` and no `✦`;
   - `deliveredLine({ kind: "full", persona: "engineer", journey: null })` contains
     `sign ◇ engineer`;
   - every failure names the file or function that drifted.
6. **Worklog**: one entry in `docs/process/worklog.md`.

## Non-Goals

- Do not implement sibling roadmap item: Antigravity through the one doorman.
- Do not implement sibling roadmap item: Written where a user reads it.
- Do not implement sibling roadmap item: Claude Code and Codex through the one doorman.
- Do not implement sibling roadmap item: Pi through the one doorman, at L4.
- Do not change `doorman.ts`, the delivered line's wording, the policy, or the folder.
- Do not change `AGENTS.md`; it already states the rule.
- Do not make `mm-mirror` Pi-sourced (CR102's list changes by a recorded decision).
- Do not touch the welcome card's or status line's `◇ Mirror · <user>`: the mirror's
  own mark, not a persona signature.

## Acceptance Behavior

```text
Given the mm-mirror skill is loaded on any runtime
And the turn's context holds a block opening with
    "=== mirror context delivered by the runtime for this turn"
When the skill is followed
Then it does not run `mirror mirror load`
And it renders the transition surface from the block when the block is `full`
And it answers as the mirror and signs `◇ <persona>` when the line names one

Given the mm-mirror skill is loaded on any runtime
And no block in the turn's context opens with that prefix
When the skill is followed
Then it runs `mirror mirror load` first, as before
And out-of-scope sibling roadmap items remain untouched

Given `mirror mirror load` resolves a persona
When it prints its banner to stderr
Then the banner reads `◇ <persona>` and does not read `✦ Persona:`

Given AGENTS.md, the three mm-mirror skill copies, doorman.ts, and render.ts
When the guard test runs
Then it passes only while all of them state the signature `◇ persona-name`
     and the skill copies quote DELIVERED_LINE_PREFIX byte for byte
And a drift in any one of them names that file in the failure
```

## Validation Route

- Automated: `ts/test/scripts/mirrorSkillContract.test.ts` red before the edits (the
  copies still say `✦ Persona`, the banner too), green after; `orchestration.test.ts`
  updated and green; `cd ts && npm test`, `npm run typecheck`, `npm run lint`;
  `node ts/scripts/buildClaudePlugin.ts --check`, `checkSkillCommandParity`,
  `checkPackContents`, `checkDocLinks` clean.
- Navigator-visible, on this Pi session against a scratch session id (the steps,
  expected observation, pass and fail conditions are in `test-guide.md`):
  1. `mirror mirror doorman --prompt "/mm-mirror <question>" --session-id S` prints a
     block whose first line opens with the prefix the skill quotes — read the Pi body's
     quoted prefix against it, byte for byte;
  2. `mirror mirror load --query "<question>"` prints `◇ <persona>` on stderr, no
     `✦ Persona:`;
  3. the three skill copies, diffed: the Pi and Claude bodies both carry the
     "unless delivered" constraint and the `◇ persona-name` rule; the plugin copy is
     byte-identical to the Claude body but for its frontmatter name;
  4. the guard broken on purpose (`✦ Persona` put back in one copy, then reverted)
     fails naming that copy;
  5. regression, the path every runtime relies on until its doorman is wired: in a
     fresh Pi session, `/mm-mirror <question>` runs a visible `mirror mirror load`
     before any Mirror answer; and in this session, after step 1 put the prefix in a
     tool result, the next Mirror turn still loads.
- E2E decision: fixture-level and command-level in this story. The live walks that
  show an explicit turn loading once belong to US4 (Claude Code, Codex), US5 (Pi), and
  TS6 (Antigravity), which wire the doorman this skill now trusts.

E2E decision: required unless Navigator explicitly accepts a narrower fixture-level validation route

## Implementation Contract

- Use TDD or characterization tests for behavior changes when testable.
- Keep changes scoped to `CV9.DS8.TS3`.
- Do not use git add .; commit only story-scoped files.
- Follow the project's development guide: docs/process/development-guide.md.

## Stop Conditions

- scope_change_detected
- plan_rule_conflict
- failing_required_check_without_clear_fix
- navigator_decision_needed

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
