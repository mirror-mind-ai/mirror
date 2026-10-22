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
decision. Not planned. Current Focus unchanged.

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
- [CV21.DS5.TS4's test guide](../../roadmap/cv21-runtime-expansion-ii/cv21-ds5-user-extensions-on-every-runtime/cv21-ds5-ts4-how-extensions-reach-each-runtime-is-written-where-a-user-reads-it/test-guide.md)
  records both under *Found while implementing, not changed*.

## Outcome

Open.
