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

**Plan, approved by the Navigator 2026-10-22,** after a review through five lenses
(engineer, database architect, quality assurance, devops engineer, quartermaster) whose
eleven amendments were all folded. The rule moves to the core's existing, tested home:
Pi joins the hooks' path instead of the core learning a second copy of the rule.

1. **Tests first** (A9), through the extension harness
   (`ts/test/pi/mirrorLoggerExtension.test.ts`) and the core's handler tests, one case
   each: a menu pick; typed `/skill:x`; typed `/mm-x`; `/mm-mirror q`;
   `/skill:mm-mirror q`; a bare `/mm-mirror`; plain text; text that opens with a path
   (`/Users/…`, still skipped, as today: a known limit of the `/` rule); a muted session;
   a discarded conversation; a session switch mid-turn; a follow-up queued while
   streaming; a prompt another extension sent (`source: "extension"`); a prompt whose
   answer spans two runs.
2. **The forward fix** (A1 to A5):
   - The extension mints a turn id for each run a person's prompt starts and sends what
     was typed, read from Pi's `input` event, to the hooks' `user-prompt` handler
     (`--interface pi`): the mute gate, the Mirror form, the command turn, the skipped
     turn recorded. `log-user` does not learn the rule (A1).
   - One `stop` per prompt, at `agent_settled`, carrying all of the prompt's assistant
     text, to the hooks' `stop` handler, which pairs it with its prompt by turn id and
     skips the reply of a skipped turn. A change the CR states: one reply row per
     prompt, where Pi wrote one per `agent_end` (A2).
   - Correlation: the `input` text is recorded only when it starts a run
     (`streamingBehavior` undefined) and consumed at the next `before_agent_start` with
     `messageType: "user"`; with nothing recorded, the prompt as given, where Pi's whole
     skill wrapper counts as a command turn (A3).
   - `mirrorForm` accepts `/skill:mm-mirror`; `inferJourneyForConversation` is left as
     it is, since no skill turn reaches it any more (A4).
   - `log-user` and `log-assistant` keep working for one release, for the extensions
     already loaded in running Pi sessions, then retire with a retired-surfaces row (A5).
3. **The repair**, a command beside CR154's, a dry run until `--apply`, which takes and
   verifies a dated backup and changes everything in one transaction that decides the
   set again. It matches Pi's whole skill wrapper (`<skill name="…" location="…">`,
   `References are relative to`, `</skill>`), only in conversations whose interface is
   `pi` (A8). It keeps the question of an `mm-mirror` row that has one and removes every
   other such row; deletes, with CR154's `deleteConversation`, every conversation it
   leaves with no user turn, listed on their own line in the dry run with their message
   counts (A7, the Navigator's decision); and retitles the conversations whose title came
   from a block (25 and 5). Summaries and their embeddings stay: they describe a session
   in which a skill was invoked (A6). After `--apply`, a second dry run finds nothing.
4. **Docs:** the contract's *Invoking a skill on Pi* and its Pi table say what is
   recorded now, and lose CR159's caveat; REFERENCE gains the repair command; Getting
   Started's note on what Mirror records says a skill invocation is not recorded;
   `commandTurn.ts` no longer says Pi keeps its own check.
5. **The route** (A11): CR159's measurement as a small script committed with the CR
   (setup, reading, clean-up), run before and after the fix on the same Pi version, with
   version, binary, and date.
6. **A patch release**, carrying CR159's docs too. Rollout, in the CR and the release
   note (A10): release, `runtime update`, restart every Pi session on the home, then the
   repair's dry run, then `--apply`; a session that has not restarted keeps writing
   skill bodies, and the repair run again catches them.

- **Acceptance:** on Pi, a skill picked from the menu or typed leaves no user row and no
  reply row; a Mirror question is recorded as the question, with its reply; one reply
  row per prompt; the repair's dry run names exactly the rows and conversations it would
  change, `--apply` changes only those after a verified backup, and a second dry run
  finds nothing; the tests above, `npm test`, `checkDocLinks`, and the retired-surface
  sweep green.
- **Validation:** the route before and after the fix in a scratch home, with the
  Navigator's menu pick and one Mirror question; the repair's dry run and `--apply` on
  scratch copies of both homes, the counts read against this plan's evidence.
- **Exclusions:** past replies to skipped turns, which cannot be told apart; summaries
  and their embeddings; the 34 memories; Pi's own session files; the other runtimes,
  which already apply the rule.
- **Authority:** tests and routes use scratch homes only; the real homes are repaired by
  the Navigator after the release; the release is its own decision.

**Started 2026-10-22:** Driver @viniciusteles, Delivery `main`.

**Validated 2026-10-23** by the Navigator: a menu pick and one Mirror question in the
route's scratch "after" home, then the repair's dry run, `--apply`, and second dry run
on the Navigator's own copies of both homes (under *Evidence*).

**Reviewed 2026-10-23.** Made on purpose: `log-user` and `log-assistant` kept one
release, for extensions already loaded in running Pi sessions (A5), *deferred*, to be
retired with a retired-surfaces row at the first release after the one that carries
this CR; Pi's wrapper pattern in two copies, the extension's and the repair's, held
equal by a test, *no action*; the payload in argv as `--payload`, the exposure Pi's
prompt already had, the reason written beside the rule, *no action*. Found, not made,
and captured at the Navigator's direction:
[CR161](cr161-pi-types-are-pinned-at-0-70-and-nothing-type-checks-the-pi-extension.md)
(`.pi/` pins Pi's types at 0.70.0, and nothing type-checks the extension) and
[CR162](cr162-maintenance-retitles-only-the-latest-conversations.md) (maintenance
retitles only the 50 most recently ended conversations). Nothing disproportionate:
the fix joins the hooks' tested handlers, and the repair takes CR154's shape.

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
- **The forward fix, implemented** (`7ff4a83c`): the extension keeps the text Pi's
  `input` event carries, mints a turn id per run a prompt starts, and sends the turn to
  `user-prompt` and the prompt's whole reply to `stop` at `agent_settled`, both
  `--interface pi`; Pi's skill wrapper is read back to its command when no typed text was
  kept; a reply still unsent goes before the next prompt and at shutdown (a Pi before
  0.80.4). The payload travels as `--payload`, since `pi.exec` cannot write stdin, the
  exposure Pi's prompt already had as `log-user`'s argument; a route given it never reads
  fd 0. `mirrorForm` accepts `/skill:mm-mirror`; `log-user` and `log-assistant` stay for
  a release. Tests: 19 new; against the old extension, 12 of the harness's 22 fail.
  `npm test` 3436 tests, 3433 pass, 0 fail; `tsc`, Biome, and the repository checks
  clean; `.pi/`'s own `tsc`, against the Pi 0.70.0 types it pins, the same three old
  errors and no new one.
- **The route, 2026-10-23** ([`cr160-route.sh`](cr160-route.sh), A11): Pi 1.4.0
  (`~/.pi/agent/bin/pi`), `claude-haiku-4-5` with thinking off, `pi -p --approve`,
  each tree in its own scratch home, one turn per prompt, no retry; before = `66c8593e`,
  the commit before the fix, after = `7ff4a83c`:

  | Prompt | Before | After |
  |---|---|---|
  | `/mm-journeys` | a reply, no turn (368 characters) | nothing |
  | `/skill:mm-journeys` | the skill's body as the turn (465), a reply | nothing |
  | `/mm-mirror <question>` | a reply; the question lost | the question (45), a reply |
  | `/skill:mm-mirror <question>` | the skill's body as the turn (3,819), a reply | the question (45), a reply |

  After the fix each prompt and its reply share one turn id, labelled `pi`, and the two
  command turns are recorded as skipped on their runtime sessions. Before it, the old
  logger put run 2's prompt and reply in two conversations. No session file reached
  `~/.pi/agent/sessions`.
- The route's own defects, found by running it and fixed in it: its environment helper
  dropped the command it was given, so the first run wrote the shell environment,
  credentials included, into the scratch directory instead of running Pi (the files
  deleted at once; the helper now refuses to run without a command); Pi loads a new
  project's `.pi/` only once trusted, so the scratch tree runs with `--approve`, which
  trusts it for that run alone; and a run's rows are read by time, since the old logger
  could split a prompt and its reply across two conversations.
- **The repair, implemented** (`cada0e08`, `f3673d56`): `mirror conversations
  skill-turns [--apply]`, shaped as CR154's `remove`, routed on its own entry. Two
  refinements found by running it on copies of the real homes, each with its test: a
  `mm-build` body of 50,014 characters in the development home, which the old logger
  had cut at its 50,000-character limit so the closing tag never arrived, is read as a
  skill turn too (Pi's two opening lines, then the logger's own truncation marker, which
  no person types); and a rebuilt title comes from the first remaining user turn that is
  not a command, from a command only when nothing else remains. A test holds the
  extension's copy of Pi's wrapper pattern to the repair's.
- **The Driver's check, 2026-10-23**, on fresh copies of both homes (SQLite's backup of
  each, read with `?immutable=1`), the real command, dry run then `--apply` then a
  second dry run:

  | | Production copy | Development copy |
  |---|---|---|
  | stored skill turns | 225, in 171 conversations | 185, in 145 |
  | questions kept | 20 | 20 |
  | turns removed | 205 | 165 |
  | conversations deleted (A7) | 31, with 51 more messages | 24, with 48 more |
  | titles rebuilt | 13 (of 25 `<skill…`; 12 went with deleted conversations) | 0 (all 5 went) |
  | messages, conversations | 33,149 → 32,893; 1,640 → 1,609 | 13,787 → 13,574; 884 → 860 |
  | second dry run | nothing to repair | nothing to repair |

  Backup taken and verified before each change; no `<skill…` title left.
- **Docs** (step 4): the contract's Lifecycle Events, User Prompt, and Assistant
  Response give every runtime `user-prompt` and `stop`, Pi's way of reaching them, and
  `--payload`; Pi's event table names `input` and `agent_settled`; *Invoking a skill on
  Pi* says what is recorded now and loses CR159's caveat; the CLI reference marks
  `log-user` and `log-assistant` as kept one more release. REFERENCE gains the command's
  row and a *Pi Skill Turns* section, rollout order included (A10); Getting Started says
  a skill invocation is not recorded and names the repair.
- **The Navigator's validation, 2026-10-23.** Step 1, in Pi 1.4.0's TUI in the route's
  scratch "after" home: picking `skill:mm-journeys` from the menu recorded nothing;
  `/mm-mirror Should I stay or should I go now?` recorded the question (33 characters)
  and one reply. Pi's session file holds that turn as the 44 characters typed, not
  expanded: typed in full and sent, a bare `/mm-mirror …` reaches the model as text, and
  the model loaded the skill by its name, the case CR159 left unmeasured, seen once;
  the logger recorded the question through the Mirror form. Step 2, the Navigator's own
  copies of both homes: dry run, `--apply`, and second dry run gave exactly the Driver's
  numbers (production 225 turns in 171 conversations, 20 kept, 205 removed, 31
  deleted, 13 retitled; development 185 in 145, 20, 165, 24, 0), each `--apply` after a
  verified backup, each second dry run "No Pi user turns stored as a skill's body in
  this home."

## Outcome

**Done 2026-10-23.** On Pi, a skill invocation, picked from the menu or typed, is no
longer stored as something the person said, and neither is its reply; a Mirror
question is stored as the question, with one reply; a prompt has one reply row. Pi's
extension sends what was typed, read from Pi's `input` event, to the same
`user-prompt` and `stop` handlers every other runtime uses. `mirror conversations
skill-turns` repairs what earlier versions stored: on copies of the two real homes,
225 and 185 stored skill turns, 20 Mirror questions kept in each, 31 and 24
conversations left with no user turn deleted, a second dry run finding nothing.
Measured before and after on Pi 1.4.0 by the route committed with this CR; validated
by the Navigator. On `main`: `3725639e` (selected), `66c8593e` (approved, started),
`7ff4a83c` (the forward fix), `baa6382f` (the route), `cada0e08` and `f3673d56` (the
repair), `6d23d15a` (the docs), and this closure; carried by
[v0.36.3](../../../releases/v0.36.3.md), a patch release. Then `runtime update`, a
restart of every Pi session on each home, and the repair on the real homes, dry run
first, in that order (A10).
