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
| **Contract** · per-home plugin section's wiring line | — | validated as printed, `mkdir -p` included; since the debt review, a pointer to the table | same | same | same |
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

Implemented 2026-10-21 on `main` after `ed1527ca`. The Driver's checks, before the
Navigator's validation.

**The printed report (A2).** `mirror extensions install review-copy` from this checkout
into a scratch home, 2026-10-21T22:37Z, with claude, codex, agy, and grok on the `PATH`
and a scratch `HOME`, so every runtime reads "not wired"; the home path replaced by
`<home>`, the user named `your-name`:

```text
Installed extension/review-copy
  source: examples/extensions/review-copy
  installed: <home>/extensions/review-copy
  runtime claude:
    ext:review-copy -> <home>/runtime/skills/claude/ext-review-copy/SKILL.md
  runtime pi:
    ext-review-copy -> <home>/runtime/skills/pi/ext-review-copy/SKILL.md
  plugin: mirror-ext-your-name 0.1.1, 1 skill
    Claude Code: not wired — mkdir -p ~/.claude/skills && ln -s "<home>/runtime/plugin/mirror-ext-your-name" ~/.claude/skills/mirror-ext-your-name
    Codex: not wired — codex plugin marketplace add "<home>/runtime/plugin"
           then codex plugin add mirror-ext-your-name@mirror-ext-your-name
    Antigravity: not wired — agy plugin install "<home>/runtime/plugin/mirror-ext-your-name"
    Grok Build: not wired — grok plugin install "<home>/runtime/plugin/mirror-ext-your-name" --trust
                (this plugin carries skills only — no hooks and no MCP server for --trust to activate)
```

Each of its wiring commands appears verbatim in the contract's table and in the
authoring guide's step 7, whose block is the binary's own output for `hello`,
regenerated rather than retyped. The three reinstall commands are
`extensionPluginReinstallCommand`'s and appear verbatim in the contract. The contract's
per-home plugin section had the Claude Code step without its `mkdir -p`; since the debt
review it points to the table for every step instead.
`ext:review-copy` appears on no user-facing surface but `review-copy`'s `skill.yaml`,
where it is the manifest's `command_name`.

**`route.sh static`:** 7 passed before the guard; 14 passed, 0 failed with it (the
seven, six listings, coverage). The guard's proof, on scratch copies of the guide passed
as `DS5_US3_GUIDE`: `summary: Record a ping` changed to `pong` in the manifest listing
gave "the guide's skill.yaml listing and fixtures/hello/skill.yaml differ: 27c27 …" (13
passed, 1 failed, exit 1); the `// commands/list.mjs` comment removed gave
"fixtures/hello/ files no listing claims (a listing must open with its path comment):
commands/list.mjs" (12 passed, 1 failed, exit 1).

**Checks:** `npm test` 3417 tests, 3414 pass, 0 fail, 3 skipped; `checkDocLinks` clean; `checkRetiredSurfaces` clean, the
story's files staged; `checkSkillCommandParity` clean; `buildClaudePlugin --check` in
sync; `checkPackContents` clean, 497 files; `git diff --check` clean.

**The grid, Driver-checked.** Every cell above found with the value it lists, at:

| Surface | Where |
|---|---|
| Contract | *External Skill Runtime Surface Contract*: the two read keys under the materialization root; the per-home plugin section's Claude Code line; *How an installed extension reaches each runtime*: the table, the versions and binaries, the three facts, *When a skill is not listed*. *Reference Implementations › Claude Code*: the plugin link and `expose-claude` as project-local; *Claude Code's login in isolated routes*; the cross-reference under *Smoke test isolation* |
| `extensions/index.md` | the layout block's two `runtime/` lines; *Reaching each runtime* |
| Authoring guide | step 7: the printed block, Pi and `not carried`; step 8: the spellings, the `ext:hello` sentence, after an edit, the recovery line. `git diff` touches no fenced listing |
| `api-reference.md` | the `runtimes:` comment; the directory-name rule; *What each `runtimes:` key reaches* |
| `review-copy` `SKILL.md` | the header (location, command, five names, files); *Syntax*; *Examples* |
| Getting Started | step 8's cross-reference; step 10, *Your extensions reach each runtime* |
| REFERENCE | the `mirror extensions`, `mirror ext`, and `/ext-review-copy` rows |
| README, CV21 index | the extension-system bullet; the superseded assessment's pointer |

**Found while implementing, not changed:** both captured as
[CR159](../../../../refinement/rs010-cv22-oracle-and-port-hygiene/cr159-pi-skills-are-spelled-by-their-bare-name-and-step-7a-lost-two-dashes.md)
(RS010) on 2026-10-22, one Change Request by the Navigator's decision.

- Pi's skill command. Pi 1.3.0 registers each skill as `skill:<name>` (its interactive
  mode builds the command name as `` `skill:${skill.name}` ``, and its menu matches the
  bare name), while this project spells Pi's skills `/mm-<skill>` throughout. The
  contract's Pi row names both; the other surfaces keep the project's form. Whether the
  project-wide spelling changes is the Navigator's question, outside this story.
- `authoring-guide.md` step 7a has lost two dashes: "they run on ⏎ a database host, a
  TLS mode, a certificate path ⏎ do not ask the person", already so before this story.
  Outside steps 7 and 8, so left as it is.

**Navigator validation: accepted 2026-10-22.** The Navigator ran the six-step route
and every step showed what it lists: the contract's table cell for cell against the
printed report, US3's Steps 3 and 4, and TS1's costs; the authoring guide's diff adding
lines in steps 7 and 8 only; `route.sh static` 14 passed, 0 failed; the one
`ext:review-copy` match the manifest's `command_name`.

**Debt paid after validation (Refactor, 2026-10-22).** The Navigator decided to pay
the first debt finding now: the contract listed the wiring and reinstall commands both
in US2's per-home plugin section and in TS4's table. The section's two bullets now keep
their own facts (printed by the `extensions` verbs, none at `init`, the `diagnose`
finding names, not-wired is not drift) and point to the table for the commands; the
table's four plugin-runtime rows are the contract's only extension-command lines.
`checkDocLinks` clean, `git diff --check` clean, `route.sh static` 14 passed. The
second finding, that no test ties the docs' commands to the code, is deferred: see
`review.md`.
