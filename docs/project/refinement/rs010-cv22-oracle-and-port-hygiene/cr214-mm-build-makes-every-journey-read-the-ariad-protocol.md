[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR214 · `mm-build` makes every journey read about 46 KB of Ariad protocol that applies only to a journey that adopted Ariad

## Problem

`.pi/skills/mm-build/SKILL.md` is 52,160 bytes:

- **Lines 1–192 (5,833 bytes):** the base Builder behavior every journey needs.
- **Lines 193–1207 (46,327 bytes):** the parts that apply "only when the active journey
  has adopted Ariad": adopted method behavior, Ariad runtime behavior, refinement,
  lifecycle, closure, and the rest.

A runtime loads a skill whole. So every `/mm-build` puts about 11–12K tokens of
protocol in front of the model, and a journey without Ariad must then ignore it. The
generated plugin copy (`plugins/mirror-mind/skills/mm-build/SKILL.md`) does the same on
Claude Code, Codex, Antigravity and Grok.

## Expected Behavior

- `SKILL.md` keeps the base behavior.
- The Ariad part moves to a file in the skill's directory, which the skill reads only
  when `build load` reports `adopted method: ariad`.
- The plugin generator and the skill parity guards follow.
- An Ariad-adopted journey loses nothing.

Planning checks that each runtime can read a file beside a skill on demand.

## Impact

The cost is fixed for every Builder activation of every user: smaller per session than
CR208, but always present. For a journey without Ariad, it is about 46 KB of
instructions that do not apply and that can still pull the model toward the lifecycle
work they describe.

## Plan Or Decision

Captured, unassigned, 2026-11-09, at the Navigator's direction, from measuring what the
shipped instructions cost per session while investigating CR211.

Not planned.

## Evidence

- `awk 'NR<193' .pi/skills/mm-build/SKILL.md | wc -c` returns 5,833.
  `awk 'NR>=193' … | wc -c` returns 46,327.
- Line 193 is the heading `# Adopted Method Behavior`. Line 245, `# Ariad Runtime
  Behavior`, opens with "This section applies **only when the active journey has adopted
  Ariad**".
- The skill has kept this size since v0.32.1 (52,175 bytes then, 52,160 now).

## Outcome

Pending: captured, not planned.
