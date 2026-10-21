[< Story](index.md)

# Test Guide — CV21.DS5.TS4

## Automated Validation

This story writes documentation and one static check; nothing under `ts/src` changes.
The checks that must stay green are the ones a doc edit can break, plus the guard this
story adds:

- From the repository root: `npm test`, `node ts/scripts/checkDocLinks.ts`,
  `node ts/scripts/checkRetiredSurfaces.ts` (new files staged first),
  `node ts/scripts/checkSkillCommandParity.ts`,
  `node ts/scripts/buildClaudePlugin.ts --check`, `git diff --check`.
- `bash route.sh static` in
  [US3's package](../cv21-ds5-us3-review-copy-runs-on-every-runtime-measured-live/):
  its seven existing checks; one per authoring-guide listing — `skill.yaml`,
  `migrations/001_init.sql`, `commands/ping.mjs`, `commands/list.mjs`,
  `context-provider.mjs`, `SKILL.md` — each extracted from the guide by its first-line
  path comment and diffed against the file under `fixtures/hello/`; and one that every
  fixture file has a listing. All `ok` at this commit.
- The guard's own proof, once, not committed: a scratch copy of the guide with one
  listing edited, passed as `DS5_US3_GUIDE=<copy>`, turns that listing's check `bad`,
  naming the file.
- The printed report (A2): `mirror extensions install` from this checkout into a
  scratch home, with all four plugin runtimes on the `PATH`. Its report is the source
  of every wiring step on every surface, and is pasted below.

## E2E Decision

Not required, accepted by the Navigator at Plan approval (2026-10-21). The live
behaviour these docs describe was measured by US3 on 2026-10-20 (claude 2.1.304, codex
0.163.0, agy 1.4.3, grok 1.0.62, `mirror-mind@0.36.0` from the registry) and is cited
by version, binary, and date. The commands the docs print are checked against the
shipped code by the printed report. This story re-runs no session and claims nothing
beyond them.

## Navigator Validation

Read each surface and tick its cells. A cell holds the value the surface must carry;
`—` means A1 assigns that surface nothing there. `<user>` is the Mirror home's user;
Getting Started writes it `your-name`. "Printed" means as the printed report below
writes it, with `<home>` for the Mirror home.

| Surface · fact | Pi | Claude Code | Codex | Antigravity | Grok Build |
|---|---|---|---|---|---|
| **Contract table** · reads it | the `pi` catalog, at session start | the plugin, through a link | a copy, keyed by version | a staged copy | a copy |
| **Contract table** · wire once | nothing beyond `pi install` | printed: `mkdir -p ~/.claude/skills && ln -s …` | printed: `codex plugin marketplace add …`, then `codex plugin add …` | printed: `agy plugin install …` | printed: `grok plugin install … --trust` |
| **Contract table** · after a change | nothing: next session | nothing: in place | `codex plugin add …` again | `agy plugin install …` again | `grok plugin uninstall … --confirm && grok plugin install … --trust` |
| **Contract table** · you type | `/ext-review-copy`; Pi's own `/skill:ext-review-copy` named | `/ext-review-copy` | `$mirror-ext-<user>:ext-review-copy` | `/mirror-ext-<user>:ext-review-copy` | `/ext-review-copy` |
| **Contract table** · version, binary, date | not re-measured, said so | 2.1.304, `~/.local/share/claude/versions/2.1.304`, 2026-10-20 | 0.163.0, `/opt/homebrew/Caskroom/codex/0.163.0/bin/codex`, 2026-10-20 | 1.4.3, `~/.local/bin/agy`, 2026-10-20 | 1.0.62, `~/.grok/downloads/grok-1.0.62-macos-aarch64`, 2026-10-20 |
| **Contract** · per-home plugin section's wiring line | — | printed, `mkdir -p` included | unchanged | unchanged | unchanged |
| **Contract** · Claude Code section | — | the plugin link as the home-level path; `expose-claude` project-local; login facts at 2.1.296 and 2.1.304 | — | — | — |
| **`extensions/index.md`** · you type | `/ext-review-copy` | `/ext-review-copy` | `$mirror-ext-<user>:ext-review-copy` | `/mirror-ext-<user>:ext-review-copy` | `/ext-review-copy` |
| **`extensions/index.md`** · recovery line | the install prints the step, again when run again; `diagnose` names the reinstall | same line | same line | same line | same line |
| **Authoring guide step 7** · the printed report | — (nothing to wire) | printed | printed | printed | printed |
| **Authoring guide step 8** · you type | `/ext-hello` | `/ext-hello` | `$mirror-ext-<user>:ext-hello` | `/mirror-ext-<user>:ext-hello` | `/ext-hello` |
| **Authoring guide step 8** · after editing `SKILL.md` | install again; next session | install again; in place | install again, then its reinstall | install again, then its reinstall | install again, then its reinstall |
| **Authoring guide step 8** · `ext:hello` → `/ext-hello` sentence, recovery line | one sentence and one line, for all five | | | | |
| **`api-reference.md`** · `runtimes:` keys | `pi` read by Pi | `claude` read for the four plugin runtimes | (`claude`) | (`claude`) | (`claude`); any other key read by nothing |
| **`review-copy` `SKILL.md`** · header names | `/ext-review-copy` | `/ext-review-copy` | `$mirror-ext-<user>:ext-review-copy` | `/mirror-ext-<user>:ext-review-copy` | `/ext-review-copy` |
| **`review-copy` `SKILL.md`** · *Syntax* / *Examples* | the argument grammar once; examples as `/ext-review-copy` | | | | |
| **Getting Started step 10** · you type | `/ext-review-copy` | `/ext-review-copy` | `$mirror-ext-your-name:ext-review-copy` | `/mirror-ext-your-name:ext-review-copy` | `/ext-review-copy` |
| **Getting Started step 10** · wiring and recovery | the install prints the step; recovery line | same | same | same | same |
| **REFERENCE `ext-review-copy` row** | Pi column `/ext-review-copy` | Claude Code column `/ext-review-copy` | Codex column `$mirror-ext-<user>:ext-review-copy` | in the purpose: `/mirror-ext-<user>:ext-review-copy` | in the purpose: `/ext-review-copy` |
| **REFERENCE `mirror extensions` / `mirror ext` rows** | the verbs and arguments as the usage lines print them | | | | |

Then three single checks:

1. `git diff docs/product/extensions/authoring-guide.md` touches no fenced listing, and
   `bash route.sh static` is green.
2. Nothing on any surface says a `runtimes:` key other than `pi` and `claude` reaches
   a runtime, or shows `ext:review-copy` as something a person types.
3. The CV21 index's superseded assessment points at TS1's decision and DS5; the DS5
   table's TS4 row is In Progress.

Pass: every cell ticked and the three checks hold. Fail: a cell whose surface carries
a different value, or a value none of the sources recorded.

## Validation Evidence

Pending implementation and validation.
