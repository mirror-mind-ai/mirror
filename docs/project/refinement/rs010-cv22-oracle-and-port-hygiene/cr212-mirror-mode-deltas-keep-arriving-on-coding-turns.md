[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR212 · A conversation in Mirror Mode keeps receiving Mirror's deltas on coding turns, though the instructions say the mode follows the context

## Problem

`AGENTS.md` says the mirror's modes are "chosen automatically based on context". It
names code, bugs, implementation and architecture as Builder Mode.

The session's stored mode changes only through a command: `build load`, `explore load`,
`soul load`, `mode activate` or `mirror load`. While the stored mode is Mirror Mode and
`mirror_active` is set, the doorman (`decideDoorman`) delivers a delta on every prompt
that is not a skill command. Each delta carries:

- the line "answer as the mirror; sign ◇ <persona>", or its no-persona form;
- up to five memories;
- any attachment scoring above 0.4 (CR208).

So a conversation that began with a Mirror question and moved to code keeps receiving
Mirror's framing and context on every turn, unless the person runs `/mm-build` or
`/mm-new`.

## Expected Behavior

Planning decides which of these holds:

- **The doorman steps back.** It delivers nothing, or only its line, on a turn the
  instructions place in Builder Mode.
- **The instructions say so.** They state plainly that Mirror Mode lasts until
  `/mm-build`, `/mm-explore`, `/mm-soul` or `/mm-new`, and say how to leave it.

Either way, the instructions and the doorman describe the same behavior.

## Impact

- **Tokens.** Each coding turn carries memories and attachments.
- **Framing.** The mirror's framing ("intellectual partner", "question, refine, align")
  is applied to execution work.
- **Reporters unknown.** It is not known whether the reporting users' sessions were in
  Mirror Mode. `◇ engineer` is signed in Builder Mode too, so the screenshot in CR211
  does not settle it.

## Plan Or Decision

Captured, unassigned, 2026-11-09, at the Navigator's direction, from investigating two
reports from Codex users whose small requests used up a five-hour usage window (CR211).

Not planned. It needs a Navigator decision between the two directions above.

## Evidence

- `AGENTS.md` line 18: "chosen automatically based on context". Line 36: Builder Mode is
  for code, project structure, YAML editing, bugs and implementation.
- `ts/src/mirror/doorman.ts`, `decideDoorman`: an explicit Mirror form → full;
  `!state.active` → nothing; a command turn → nothing; otherwise → delta. It does not
  read the prompt's domain.
- Measured on 2026-11-09 with `mirror` 0.44.0 from this checkout (`11712d26`), on a copy
  of the `vinicius-dev` home (the walk recorded in CR208). Three ordinary prompts after
  the explicit turn received deltas of 1,044, 157 and 90,536 bytes.

## Outcome

Pending: captured, not planned.
