[< Refinement Workbench](../index.md) · [RS010](index.md)

# CR108 — The Claude Code copies of other skills drift from Pi in behavior, and no guard compares them

## Problem

[CR102](cr102-the-claude-code-mm-build-skill-lacks-the-builder-and-ariad-sections.md)
gave `mm-build` one body. The other 24 skills still have two. `.pi/skills/`
serves Pi, and Codex and Gemini CLI through the `.agents/skills/` links.
`.claude/skills/` serves Claude Code, and the plugin generator copies it into
the plugin. [CR071](cr071-collapse-the-triplicated-skill-command-references.md)
recorded the deliberate differences between the two: the frontmatter name, the
Usage section, the example language, and lines that hold for one runtime only.
The guards check invocation entry points, Python's absence, and plugin sync.
None of them compares what a skill tells the agent to do.

CR102's characterization found this in two skills beyond its own:

- **`mm-mirror`.** The Claude copy's "NO QUERY YET?" rule tells the agent to
  ask for a topic before running `mirror load` and before producing any output.
  The Pi copy's "MODE SWITCH WITHOUT TOPIC?" rule says the opposite for a pure
  mode switch: load first, with the switch request as the query, render the
  transition surface, and then ask. The Claude copy has no Transition Surface
  section at all.
- **`mm-release-notes`.** The Claude copy has no `pending` view. The Pi copy
  prefers `runtime release-notes pending` for update questions, because it
  covers every release between the installed version and the current stable
  one.

The differences in `mm-help`, `mm-tasks`, `mm-journey`, `mm-week`,
`mm-consult`, and the smaller skills were not audited. Some are deliberate by
CR071's list, some are prose, and some may be behavior.

## Expected Behavior

Each skill tells the agent to do the same thing in every runtime. Where a
runtime is meant to differ, the difference is one of CR071's recorded kinds or
a recorded decision. Either a skill qualifies for one body (CR102's list in
`ts/src/guards/piSourcedSkills.ts`), or a guard can see when its two bodies
disagree in behavior.

## Impact

Medium-low today, rising at the release. Mirror Mode is the default lens, so
`mm-mirror` is the most visible case. A Claude Code agent asked to switch to
Mirror Mode without a topic is told to ask a question before anything loads,
while a Pi agent is told to show the transition surface first. The CV22 release
ships the plugin with these copies.

## Plan Or Decision

Not planned. Captured without selecting; Current Focus unchanged. Captured on
2026-09-27 by the Navigator's decision B1 on
[CR102](cr102-the-claude-code-mm-build-skill-lacks-the-builder-and-ariad-sections.md#decision-b-the-same-drift-in-other-skills),
outside the Ariad trust floor. B1 left open whether CR108 gates the CV22
release, and the Navigator answered the same day: it does not. The release
waits only on what the
[floor decision](../../decisions.md#the-cv22-release-is-gated-on-an-ariad-trust-floor-worked-before-us3)
names.

Routes for whoever plans it. Audit each pair of copies. When a skill's Pi body
holds in every runtime, move it onto CR102's list with a recorded decision; the
smaller skills may qualify once their Usage takes the three-runtime form.
Otherwise, repair the Claude body and record the differences that remain.

## Evidence

Measured 2026-09-27 on `1c8e684b`.

- `diff .pi/skills/mm-mirror/SKILL.md .claude/skills/mm-mirror/SKILL.md`: the
  two rules quoted above, and no Transition Surface section in the Claude copy.
- `diff .pi/skills/mm-release-notes/SKILL.md .claude/skills/mm-release-notes/SKILL.md`:
  none of the Pi copy's `pending` lines appear in the Claude copy.
- Lines that differ between the two copies (`diff` lines starting with `<` or
  `>`):

  | Skill | Lines |
  |---|---:|
  | `mm-help` | 124 |
  | `mm-mirror` | 75 |
  | `mm-week` | 42 |
  | `mm-consult` | 35 |
  | `mm-tasks` | 34 |
  | `mm-journey` | 32 |
  | `mm-release-notes` | 25 |
  | `mm-seed` | 8 |
  | `mm-welcome` | 8 |
  | `mm-update` | 4 |

  `mm-week`'s difference, for one, is documentation, not behavior: its Claude
  copy runs `week view`, which is the default subcommand of `week`.

## Outcome

Open.
