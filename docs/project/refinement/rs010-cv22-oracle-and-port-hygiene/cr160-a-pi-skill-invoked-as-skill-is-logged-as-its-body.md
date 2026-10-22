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

For planning: CR159 wrote a caveat into the contract's *Invoking a skill on Pi* that
this CR removes when its fix ships, and CR159's measurement route, recorded step by step
in its *Evidence*, is the one to make re-runnable for this CR's validation.

Selected 2026-10-22 (Current Focus).

**Proposed plan, awaiting the Navigator's approval.** The design choice is where the rule
lives:

- **(B, recommended) One rule, in the core.** The Pi extension hands the core what the
  person typed, read from Pi's documented `input` event before expansion, instead of
  the expanded prompt. The core's Pi path (`log-user`, `log-assistant`), which today
  writes whatever it is given, applies the rule the hooks apply: `mirrorForm`, which
  learns `/skill:mm-mirror`, logs the question; `isCommandTurn` skips any other skill
  turn and records it; and the reply to a recorded skipped turn is skipped, as the hooks'
  `command_turn` does. The extension's own `/` check goes, and so does
  `commandTurn.ts`'s note that Pi keeps one.
- (A) The extension keeps its own rule and learns Pi's `<skill name="…">` wrapper: a
  format Pi documents nowhere but in an example session line, and a second copy of the
  rule in another process.

Under (B):

1. **Tests first.** The extension harness (`ts/test/pi/mirrorLoggerExtension.test.ts`)
   holds that the extension sends the typed text for a run a person's input starts,
   never the expanded prompt. The core's tests hold the rule on the Pi path:
   `/skill:mm-journeys` and `/mm-journeys` skipped and their replies skipped;
   `/mm-mirror <question>` and `/skill:mm-mirror <question>` logging the question and
   the reply; a bare `/mm-mirror` skipped with its reply; plain text logged as today.
   `mirrorForm` accepts `/skill:mm-mirror`, and `inferJourneyForConversation`
   `/skill:mm-build <slug>`, so the two parsers read one grammar.
2. **The forward fix** in the extension and the core, to those tests.
3. **The repair,** a command beside CR154's: it lists a home's user rows that are Pi
   skill bodies, by skill and by what it would do, and is a dry run until `--apply`,
   which takes and verifies a dated backup, then in one transaction keeps the question
   of an `mm-mirror` row that has one and removes every other such row, since a skill
   invocation is not conversation and neither are its arguments (a `mm-build` slug).
   Then it retitles the conversations whose title came from a block and recomputes the
   embeddings of the conversations it changed. On the production home's numbers: 20
   rows keep their question, 205 are removed, 25 conversations retitled, 8 re-embedded.
4. **Docs:** the contract's *Invoking a skill on Pi* loses CR159's caveat; REFERENCE
   gains the repair command; Getting Started's note on what Mirror records says a skill
   invocation is not recorded.
5. **A patch release**, so the production home gets the fix and the repair; then the
   Navigator runs the repair on both homes, dry run first, as with CR154.

- **Acceptance:** on Pi, a skill picked from the menu or typed leaves no user row and
  no reply row; a Mirror question is recorded as the question; the repair's dry run
  names exactly the rows it would change and `--apply` changes only those, after a
  verified backup; the tests above, `npm test`, `checkDocLinks`, and the retired-surface
  sweep green.
- **Validation:** CR159's measurement, made a re-runnable route, in a scratch home:
  the Navigator picks `skill:mm-journeys` from the menu and asks one Mirror question,
  then reads the scratch home's rows; then the repair's dry run and `--apply` on a
  scratch copy of the development home, with the counts read before and after.
- **Exclusions:** past replies, which are what the mirror said and cannot be told from
  replies to ordinary turns (11,771 assistant rows in the production home's Pi
  conversations have no user row right before them, most from prompts that log more
  than one reply); the 34 memories drawn from affected conversations, which read as
  real work; Pi's own session files; the other runtimes, which already apply the rule.
- **Authority:** tests and routes use scratch homes only; the real homes are repaired
  by the Navigator after the release; the release is its own decision.

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
- Confirmed on Pi 1.4.0 by CR159's measurement (2026-10-22, a scratch home): a
  `/skill:mm-journeys` turn stored as a 473-character user row holding the skill's body.
  The same route found a second shape for this CR's planning: a bare `/mm-journeys`,
  which the logger skips as a command turn, still has its reply logged (497
  characters, with no user turn before it), where the other runtimes skip a command
  turn's reply too (`command_turn`, CV21.DS2.US8).
- The Navigator's menu pick in the same route (2026-10-22): Pi's menu offers only
  `skill:<name>` commands and sends `/skill:<name>`, and the turn was stored as the
  skill's body. Picking a skill from Pi's menu is how the 410 expanded turns in the two
  homes were written.
- **Found while planning, 2026-10-22.** The core's Pi path applies no rule: `log-user`
  and `log-assistant` (`ts/src/conversation/loggerCli.ts`) write the content they are
  given; the rule lives only in the extension's `/` check. Pi documents the `input`
  event as raw user input, fired before `before_agent_start`, with the text as sent
  (`InputEvent.text`, `dist/core/extensions/types.d.ts`); the `<skill name=` wrapper
  appears in Pi's docs only as an example session line.
- The production home's 225 rows split as: `mm-mirror` 79 (20 with a question after the
  block, 59 with nothing); other skills 146 (57 with arguments, most a `mm-build` slug,
  89 with nothing). No table references a message row. Titles are not regenerated on
  their own: `titleNeedsImprovement` runs at a conversation's close and in the metadata
  pass, and the 25 `<skill…` titles stand. Embeddings are written by extraction.
- In the production home's Pi conversations, 11,771 assistant rows have no user row right
  before them (537 open a conversation): a prompt can log more than one reply, so a past
  reply to a skipped turn cannot be told apart.

## Outcome

Open.
