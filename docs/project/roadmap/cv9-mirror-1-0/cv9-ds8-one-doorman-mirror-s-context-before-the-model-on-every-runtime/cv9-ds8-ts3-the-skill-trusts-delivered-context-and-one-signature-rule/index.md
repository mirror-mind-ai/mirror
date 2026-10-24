[< Parent](../index.md)

# CV9.DS8.TS3 — The skill trusts delivered context, and one signature rule

**Status:** ✅ Done — 2026-10-24
**Type:** Technical Story
**Delivery Story:** CV9.DS8 — One Doorman: Mirror's Context Before the Model on Every Runtime

---

## Technical Story

In order to let an explicit Mirror turn load the folder once on every runtime the
doorman reaches, and to sign an active persona the same way everywhere,
As the engineering team,
I want the `mm-mirror` skill, in both of its authored bodies and the plugin copy
generated from one of them, to load first *unless the runtime delivered the context
for this turn* — a block in the turn's context opening with the stable prefix TS2
exported, `=== mirror context delivered by the runtime for this turn` — and, when it
was delivered, to render the transition from that block and sign as its line says;
and one signature rule, `◇ persona-name`, stated in `AGENTS.md` and followed by the
skill's copies and the core's banner, with one guard test that fails when any of them
drifts,
So that US4, US5, and TS6 can measure an explicit turn that loads once, a follow-up
that re-routes and signs, and an unprompted question followed by doorman turns —
against a skill that already trusts what the doorman delivers.

## Outcome

- `.pi/skills/mm-mirror/SKILL.md` (Pi, and Codex through the `.agents/skills/` link)
  and `.claude/skills/mm-mirror/SKILL.md` (Claude Code; the plugin copy under
  `plugins/mirror-mind/skills/mm-mirror/` is regenerated from it) state the one
  constraint: never answer in Mirror Mode without `mirror mirror load`, **unless** the
  turn's context already holds a block opening with
  `=== mirror context delivered by the runtime for this turn`. When it does: do not
  load again; a `full` block carries the `◌ MIRROR MODE ACTIVE` surface, render it from
  the block; a `delta` block carries no transition, Mirror Mode is already on; answer
  from the folder in the conversation plus what the block adds; sign as the line says.
  "This turn" is literal: the runtime placed the block before the answer; an earlier
  turn's block, memory of a load, or the prefix inside a tool result does not count.
  The prefix is quoted on one line in each body.
- The Claude Code body no longer tells the model to load a second time on an explicit
  turn "to satisfy the load-first rule"; where a runtime's doorman runs, the block is
  the satisfied rule.
- Both bodies replace "Activated personas use `✦ Persona:`. Do not reuse `◇`" with the
  rule `AGENTS.md` states: an active persona signs `◇ persona-name` on its own line;
  no signature when the ego answers alone. `AGENTS.md` is not changed; it already
  holds the rule.
- The core's banner (`renderMirrorBanner`, the stderr lines `mirror mirror load`
  prints) signs `◇ <persona>` instead of `✦ Persona: <persona>`.
- One guard test, `ts/test/scripts/mirrorSkillContract.test.ts`, reads `AGENTS.md`, the
  three skill copies, `DELIVERED_LINE_PREFIX`, `deliveredLine`, and
  `renderMirrorBanner`, and fails when: `AGENTS.md` does not state `◇ persona-name`;
  any skill copy does not quote the exported prefix byte for byte or the signature
  rule; any skill copy still says `✦ Persona` or "do not reuse `◇`"; the banner or the
  delivered line signs with anything but `◇`.
- No hook, the Pi extension, or Antigravity is rewired (US4, US5, TS6). On a runtime
  whose doorman is not yet wired, the block does not arrive, the constraint's
  "unless" does not apply, and the skill loads as before.

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

Given `mirror mirror load` resolves a persona
When it prints its banner to stderr
Then the banner reads `◇ <persona>` and does not read `✦ Persona:`

Given AGENTS.md, the three mm-mirror skill copies, doorman.ts, and render.ts
When the guard test runs
Then it passes only while all of them state the signature `◇ persona-name`
     and the skill copies quote DELIVERED_LINE_PREFIX byte for byte
And a drift in any one of them names that file in the failure
```

## Scope

- `.pi/skills/mm-mirror/SKILL.md` and `.claude/skills/mm-mirror/SKILL.md`: the
  constraint, the delivered-block branch of the load and transition steps, the
  signature rule.
- `plugins/mirror-mind/skills/mm-mirror/SKILL.md`: regenerated with
  `node ts/scripts/buildClaudePlugin.ts`, not edited by hand.
- `ts/src/mirror/render.ts`: `renderMirrorBanner` signs `◇ <persona>`; its assertion in
  `ts/test/mirror/orchestration.test.ts` follows.
- `ts/test/scripts/mirrorSkillContract.test.ts`: the guard, written first.
- `docs/process/worklog.md`: one entry.

## Out Of Scope

- Rewiring the Claude-family inject hook (US4), the Pi extension (US5), Antigravity
  (TS6); the contract's injection section, the parity matrix, Getting Started, the
  architecture, REFERENCE's cost line (TS7).
- Any change to `doorman.ts`, the delivered line's wording, the policy, or what the
  folder contains.
- Any change to `AGENTS.md`: the rule is already there; this story makes the rest
  follow it.
- Making `mm-mirror` a Pi-sourced skill (one body generated into the other): CR102's
  list changes by a recorded decision, not inside this story; the two bodies keep
  their runtime-specific lines and the guard holds both.
- The welcome card's and status line's `◇ Mirror · <user>`: the mirror's own mark,
  not a persona signature (the objection decision 2 noted).

## Validation

Automated: the guard test and the existing mirror, scripts, and front-door suites
green; `buildClaudePlugin --check`, `checkSkillCommandParity`, `checkPackContents`
clean. Navigator: on this Pi session, the two skill bodies read against each other and
against the doorman's own block from `mirror mirror doorman`; `mirror mirror load`'s
banner read on stderr; the guard broken on purpose in one copy and seen to fail naming
it; and the regression path — a fresh Pi session's explicit turn still loads first
(`test-guide.md`).
