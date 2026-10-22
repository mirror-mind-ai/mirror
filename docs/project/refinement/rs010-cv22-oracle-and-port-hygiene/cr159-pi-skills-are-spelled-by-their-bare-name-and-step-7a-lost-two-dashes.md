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

**Plan, approved by the Navigator 2026-10-22,** after a review through five lenses
(quartermaster, quality assurance, AI engineer, database architect, prompt engineer)
whose eight amendments were all folded. What planning found (under *Evidence*) makes the
spelling more than a docs question: the form the docs give Pi decides what Mirror logs
and parses for that turn. The logging defect is its own Change Request,
[CR160](cr160-a-pi-skill-invoked-as-skill-is-logged-as-its-body.md), captured from this
review (A5) with the extension's fix, the two parsers, and the repair of what earlier
versions stored. This CR measures, and writes the docs.

1. **Step 7a first** (A1): its two dashes back, so it reads as one sentence. It depends
   on nothing below.
2. **Measure, bounded** (A2, A3, A4), on the installed Pi 1.4.0:
   - *Isolation.* A scratch Mirror home made by `mirror init` under a scratch `HOME`,
     named for the run by `MIRROR_HOME` and `MIRROR_USER`, which win over every env
     file; `pi --session-dir` in a scratch directory, so nothing lands in
     `~/.pi/agent/sessions`; run from the checkout, so its `.pi/` extension and skills
     load; Pi's own login, since a login is not under test.
   - *Two forms of one skill, one turn each, no retries,* on the cheapest model
     (`claude-haiku-4-5`): `/mm-journeys` as typed, and `/skill:mm-journeys`.
   - *Three observations per form,* each read after the turn, since Pi writes its
     session file at message boundaries: (a) Pi's record, the user entry in the session
     file, the text as typed or the expanded `<skill …>` block; (b) the skill's effect,
     a `mirror journeys` call in the turn, which happens only if the skill ran; (c) the
     logger's row in the scratch home's `messages`, present or skipped, and what it
     holds. Pass: each observation read and recorded. Fail: one that cannot be read.
     The model running the skill from the bare form is one labelled observation, not an
     eval.
   - *The menu pick*, the Navigator's, in the same isolation, read through (a) alone.
   - *Mid-October*: answered only by what the route shows on 1.4.0.
3. **Decide**, the Navigator: the spelling the docs give Pi. Not `/skill:` as the
   recommended form while the logger stores the body: CR160 ships first, or the docs
   name it beside the form (A6).
4. **Write the docs** for two audiences (A7): the skill's *name* where the text
   addresses the model (`AGENTS.md`'s mode instructions), the *typed form* where it
   addresses the person: REFERENCE's preface, with Pi's form apart from Grok's;
   Getting Started; the Pi skills' Usage lines; `mm-help`'s listing; the contract's Pi
   row and the extension docs TS4 wrote.

- **Acceptance:** the measurement recorded with version, binary, and date; every
  person-facing Pi skill command in the decided form, and every model-facing line
  naming the skill; step 7a one sentence; `npm test`, `checkDocLinks`,
  `checkSkillCommandParity` and `buildClaudePlugin --check` after the Usage edits (A8),
  and the retired-surface sweep, green.
- **Validation:** the Navigator reads the scratch home's `messages` after the
  measurement (A4), types the documented form in Pi and sees the skill run, and reads
  the changed surfaces and step 7a.
- **Exclusions:** the other runtimes' spellings; the logging fix and the repair
  (CR160); rewording beyond the spelling.
- **Authority:** the measurement writes only scratch homes and directories; nothing is
  released.

**Started 2026-10-22:** Driver @viniciusteles, Delivery `main`.

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
