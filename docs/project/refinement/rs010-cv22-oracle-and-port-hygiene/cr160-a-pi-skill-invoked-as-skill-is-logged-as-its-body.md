[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR160 — A Pi skill invoked as `/skill:<name>` is logged as the skill's body, as if the person had said it

## Problem

Pi turns a prompt that opens with `/skill:<name>` into the skill's whole body, wrapped
in `<skill name="<name>" location="…">`, with the prompt's arguments after it. Picking a
skill from Pi's command menu sends the same `/skill:` form. Pi then hands extensions the
expanded text, not what the person typed.

The Mirror Pi logger skips a prompt only when it opens with `/`. An expanded skill opens
with `<skill`, so the logger stores it as a user turn: the skill's body, and the
arguments, recorded as what the person said. That breaks the rule the core holds for
every other runtime (`ts/src/conversation/commandTurn.ts`): a skill you invoke is not
conversation. Whatever reads a conversation afterwards reads the skill as the person's
words: its title, its embedding, journey inference, and memory extraction.

Neither prompt parser knows the `/skill:` form either. `mirrorForm` reads the Mirror
skill's explicit form, and `inferJourneyForConversation` reads `/mm-build <slug>`;
neither accepts `/skill:mm-mirror` or `/skill:mm-build`.

## Expected Behavior

- A Pi skill invocation is treated as the core treats one everywhere else: it is not
  conversation. The Pi extension reads the prompt before Pi expands it (Pi emits its
  `input` event first), or recognizes Pi's `<skill name="…">` block, and skips a
  `/skill:` turn as it skips a `/` turn. `/skill:mm-mirror <question>` logs the question
  alone, as `mirrorForm`'s query does on the other runtimes.
- `mirrorForm` and `inferJourneyForConversation` accept the `/skill:` form beside the
  forms they read today.
- A home can repair what earlier versions stored: strip the block from each stored user
  turn and keep what follows it, delete a turn left empty, then retitle a conversation
  whose title came from a block and recompute its embedding. A dry run until
  `--apply`, which takes and verifies a backup and changes everything in one
  transaction, the shape of
  [CR154](cr154-a-home-cannot-list-or-remove-the-pi-conversations-it-imported.md)'s
  `remove`.

## Impact

On the maintainer's production home, 225 user turns (633 KB) are skill bodies, in 171
conversations. In 157 of them the body is the first thing the person "said", the
message titles and journey inference read; 25 conversations carry a title that begins
with `<skill`, and 8 have an embedding computed over one. Extraction drew 34 memories
from those conversations; the three most recent read as real work, so it survived the
noise there, at the cost of reading every body. The development home holds 185 such
turns. A person who invokes skills from Pi's menu adds one with every invocation.

## Plan Or Decision

Captured, unassigned, 2026-10-22, at the Navigator's direction, from CR159's plan
review (amendment A5), in RS010 beside
[CR159](cr159-pi-skills-are-spelled-by-their-bare-name-and-step-7a-lost-two-dashes.md),
whose planning found it. Not planned. CR159's measurement adds what Pi 1.4.0 does today.
Current Focus unchanged.

## Evidence

- Pi 1.3.0 and 1.4.0 (`~/.pi/agent/install/releases/<version>`), in
  `dist/core/agent-session.js`: `prompt()` runs the extensions' `input` handlers on the
  text as typed ("before skill/template expansion"), then `_expandSkillCommand`, which
  expands only `/skill:<name>`, then passes the expanded text to `_startRun`, whose
  trigger `before_agent_start` receives as `prompt`.
- `.pi/extensions/mirror-logger.ts`, `before_agent_start`: `if (!prompt ||
  prompt.startsWith("/")) return;`, then the prompt is logged through `conversation-logger
  log-user`. `ts/src/conversation/commandTurn.ts` states the rule the Claude-family
  logger and agy's Stop apply, and notes that the Pi extension keeps its own `/` check.
- `ts/src/mirror/mirrorForm.ts` (`^([/$])(mirror-mind:)?mm[:-]mirror`) and
  `ts/src/conversation/journeyInference.ts` (`/mm-build`, `$mm-build`, `/mm:build`).
  `titleNeedsImprovement` (`ts/src/conversation/metadataLifecycle.ts`) already treats a
  title that starts with `<skill` as one to redo.
- The production home, read with `?immutable=1` on 2026-10-22, counts only: 225 Pi user
  turns that open with `<skill name=`, 2026-04-16 to 2026-10-15 (`mm-mirror` 79,
  `mm-build` 54 and up to 52 KB, `mm-update` 26, `mm-journeys` 20, the rest fewer);
  633,127 bytes; 171 conversations, 157 where it is the first user turn, 25 titled
  `<skill…`, 8 embedded, 12 with a journey; 34 memories from those conversations. None
  among its 587 Pi user turns since 2026-10-16. The development home: 185 such turns,
  2026-04-18 to 2026-10-12.

## Outcome

Open.
