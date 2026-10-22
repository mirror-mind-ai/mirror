[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR159 — The docs spell Pi's skills `/mm-<skill>`, which Pi registers as `/skill:<name>`, and the authoring guide's step 7a has lost two dashes

## Problem

Two documentation defects CV21.DS5.TS4 found while writing how an installed extension
reaches each runtime. The Navigator decided to carry both in one Change Request.

**Pi's skill command.** This project spells a Pi skill command by the skill's bare
name: `/mm-<skill>` in `AGENTS.md`'s operating modes, in REFERENCE's command table
(whose preface says Pi uses the `/mm-` prefix), in Getting Started, and in the Pi
skills' own `SKILL.md` files. TS4 followed the convention and wrote `/ext-review-copy`
for Pi. Pi 1.3.0 registers every skill as the command `skill:<name>`, documents it as
`/skill:name`, and matches the bare name in its command menu, so typing `/mm-b` finds
`/skill:mm-build`. Whether `/mm-build`, typed in full and sent without the menu,
reaches the skill has never been measured.

**The authoring guide's step 7a.** The paragraph that opens *Installation settings*
lost its two dashes when it was written. Each became a line break, so the aside reads
as three fragments: "the *machine* they run on ⏎ a database host, a TLS mode, a
certificate path ⏎ do not ask the person to export it in their shell".

## Expected Behavior

- Measured on the installed Pi, with its version: what `/mm-build` typed in full and
  sent does, and what `/skill:mm-build` does. Every place this project spells a Pi
  skill command then says the form that works: `/skill:<name>`, or the bare name if it
  is shown to work. The
  [runtime interface contract's extension table](../../../product/specs/runtime-interface/index.md#how-an-installed-extension-reaches-each-runtime),
  which names both forms for Pi today, follows the outcome.
- Step 7a reads as one sentence, with its two dashes.

## Impact

Low. A Pi user who types the documented form and picks it from the menu reaches the
skill; one who types it in full and sends it may not, and nobody has measured which.
Every Pi command line in the docs depends on the answer, TS4's extension lines among
them. Step 7a costs its reader a second reading.

## Plan Or Decision

Captured, unassigned, 2026-10-22, at the Navigator's direction, from CV21.DS5.TS4's
implementation. Both findings in one Change Request, and in RS010, by the Navigator's
decision. Selected 2026-10-22 (Current Focus).

**Proposed plan, awaiting the Navigator's approval.** What planning found (under
*Evidence*) makes the spelling more than a docs question: the form the docs give Pi
decides what Mirror logs and parses for that turn. So the behaviour is measured before a
line of the docs changes.

1. **Measure** on the installed Pi (1.4.0), isolated: a scratch Mirror home, `pi
   --session-dir` in a scratch directory, the checkout's extension, the cheapest model.
   For `/mm-journeys` sent as typed and for `/skill:mm-journeys`: whether Pi expands
   it, whether the skill runs, and what the Mirror logger records for the turn. The menu
   pick is a one-minute check in the Navigator's own Pi. The same route explains why no
   expanded turn has been logged since mid-October, or says that it cannot. Recorded
   here with Pi's version, binary, and date.
2. **Decide**, the Navigator, from the measurement: the spelling the docs give Pi
   (`/skill:<name>`, or the bare name picked from the menu); and whether a logging
   defect it confirms is fixed here or in its own Change Request. The Driver recommends
   its own: it is a product fix, with tests, in the Pi extension and the two parsers,
   and this CR's docs follow it.
3. **Write** the docs to the decision: `AGENTS.md`, REFERENCE's preface and Pi column,
   Getting Started, the Pi skills' Usage lines (and the Claude copies
   `buildClaudePlugin` regenerates from them), the contract's Pi row, and the
   extension docs TS4 wrote; and step 7a's two dashes, which depend on nothing above.

- **Acceptance:** the measurement recorded with version, binary, and date; every place
  the project spells a Pi skill command says the measured form; step 7a reads as one
  sentence; `npm test`, `checkDocLinks`, `checkSkillCommandParity`, `buildClaudePlugin
  --check`, and the retired-surface sweep green.
- **Validation:** the Navigator types the documented form in Pi and sees the skill
  run, then reads the changed surfaces and step 7a.
- **Exclusions:** the other runtimes' spellings; any product change, unless the
  Navigator folds the logging defect in at step 2; rewording beyond the spelling.
- **Authority:** the measurement writes only scratch homes and directories; nothing
  is released.

## Evidence

- Pi 1.3.0, installed at `~/.pi/agent/install/releases/1.3.0`: `docs/skills.md` ("use
  `/skill:name` when you need to force it"); `docs/settings.md` (`enableSkillCommands`:
  "Register skills as `/skill:name` commands"); its interactive mode builds each
  skill's command as `` `skill:${skill.name}` ``, and RPC `get_commands` lists skills
  the same way; its changelog records a fix that ranks "the bare skill name" in the
  skill command menu.
- `git grep` on 2026-10-22: 19 files spell a Pi skill command as `` `/mm-<skill>` ``,
  among them `AGENTS.md` (7 lines), `REFERENCE.md` (27), and `docs/getting-started.md`
  (7).
- Step 7a as CR145 wrote it (`bb33ed54`, 2026-10-20), unchanged since: one line ends
  "run on " and the next is " a database host, a TLS mode, a certificate path ", each
  ending in a space and followed by a line that begins with one, where a dash turned
  into a line break. TS4's own first draft of its step-7 block lost its dashes the same
  way while being edited, and was regenerated from the binary's output.
- **Found while planning, 2026-10-22.** Pi expands only `/skill:<name>`:
  `_expandSkillCommand` (`dist/core/agent-session.js`) returns any other text unchanged,
  on 1.3.0 and on 1.4.0, installed 2026-10-22. A bare `/mm-build` is neither an
  extension command nor a prompt template in this package, so it reaches the model as
  text, and whether the skill runs is the model's choice.
- Pi hands extensions the expanded text: `prompt()` passes `expandedText` to
  `_startRun`, whose trigger `before_agent_start` receives (1.3.0 and 1.4.0). The Mirror
  Pi logger skips only a prompt that starts with `/` (`.pi/extensions/mirror-logger.ts`),
  so a `/skill:` invocation is logged as the skill's body and its arguments, against the
  core's rule that a skill you invoke is not conversation
  (`ts/src/conversation/commandTurn.ts`).
- Both real homes hold such turns, read with `?immutable=1`, counts only. The
  production home: 225 Pi user turns that open with `<skill name=`, 2026-04-16 to
  2026-10-15 (`mm-mirror` 79, `mm-build` 54 and up to 52 KB, `mm-update` 26,
  `mm-journeys` 20, the rest fewer). The development home: 185, 2026-04-18 to
  2026-10-12. None among the production home's 587 Pi user turns since 2026-10-16. Why
  they stop is not established: the dates meet the Pi logger's rewrite (CV9.E2.S32,
  2026-10-12) and Pi 1.3.0's install (2026-10-15).
- Two parsers read these spellings out of a prompt, and neither knows a `/skill:` form:
  `inferJourneyForConversation` (`/mm-build <slug>`, `$mm-build`, `/mm:build`) and
  `mirrorForm` (`/mm-mirror …` and the plugin forms).
- [CV21.DS5.TS4's test guide](../../roadmap/cv21-runtime-expansion-ii/cv21-ds5-user-extensions-on-every-runtime/cv21-ds5-ts4-how-extensions-reach-each-runtime-is-written-where-a-user-reads-it/test-guide.md)
  records both under *Found while implementing, not changed*.

## Outcome

Open.
