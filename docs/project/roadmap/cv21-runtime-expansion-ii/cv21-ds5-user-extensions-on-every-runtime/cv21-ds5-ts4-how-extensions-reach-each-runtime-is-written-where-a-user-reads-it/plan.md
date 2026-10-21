# Plan — CV21.DS5.TS4

## Objective

Write, in the five places a person reads, how an installed extension reaches each of
the five runtimes and what they run and type on each. Every line comes from TS1's
decision, US3's live evidence, or what the shipped `extensions install` prints, with its
version, binary, and date. Correct the lines that say otherwise today. Pay the two debts
deferred to this story: US3's listing-drift guard in `route.sh static`, and TS1's Claude
Code login facts in the contract. No product code changes; DS5 closes on this story.

Reviewed 2026-10-21 through five lenses — quartermaster, writer, product designer,
prompt engineer, quality assurance — and nine amendments folded in at the Navigator's
direction, listed under *Review amendments* below. Approved the same day.

## Sources

Every line written here traces to one of these, and nothing is re-measured:

- [TS1's decision](../../../../decisions.md#user-extensions-reach-every-runtime-as-a-per-home-plugin)
  (2026-10-19; claude 2.1.296, codex 0.163.0, agy 1.4.2, grok 1.0.62): the shape, the
  invocation names, the refresh cost, the Claude Code login facts.
- US3's [test guide](../cv21-ds5-us3-review-copy-runs-on-every-runtime-measured-live/test-guide.md),
  [`evidence/versions.tsv`](../cv21-ds5-us3-review-copy-runs-on-every-runtime-measured-live/evidence/versions.tsv),
  and [`evidence/table.tsv`](../cv21-ds5-us3-review-copy-runs-on-every-runtime-measured-live/evidence/table.tsv)
  (2026-10-20; claude 2.1.304 at `~/.local/share/claude/versions/2.1.304`, codex
  0.163.0 at `/opt/homebrew/Caskroom/codex/0.163.0/bin/codex`, agy 1.4.3 at
  `~/.local/bin/agy`, grok 1.0.62 at `~/.grok/downloads/grok-1.0.62-macos-aarch64`;
  package `mirror-mind@0.36.0` from the registry): what each runtime listed, how it
  was invoked, and what the session did.
- **What the binary prints** (A2): `mirror extensions install` run from this checkout
  into a scratch home, its report pasted into the test guide. The wiring steps on every
  surface are copied from that report, not from the contract; the reinstall steps from
  `extensionPluginReinstallCommand` (`ts/src/runtime/wiring.ts`), which `runtime
  diagnose` and the `extensions` verbs print.
- The code, for what the docs must not contradict: `extensions install` writes a
  catalog for every `runtimes:` key the manifest declares; only `pi` (Pi's extension)
  and `claude` (the plugin generator) are read; the `claude` block's `ext:<id>`
  becomes the directory `ext-<id>` (`filesystemSkillDirName`); `install`, `uninstall`,
  and `sync` print the wiring block, and `runtime diagnose` reports a stale copy, a
  dangling link, or duplicated copies but not a runtime never wired.

**The facts, as they will be written — once, in the contract (A1):**

| Runtime | What reads the extension | Wire once (printed by `extensions install`) | After a change | You type (US3, 2026-10-20) |
|---|---|---|---|---|
| Pi | the home's `runtime/skills/pi/extensions.json`, at session start | nothing beyond Getting Started's `pi install "<pkg>"` | nothing: the next session reads the catalog | `/ext-review-copy`, as the project spells Pi's skills; Pi 1.3.0 registers it as `/skill:ext-review-copy`. Not re-measured by DS5 |
| Claude Code | the plugin, through a link read in place | `mkdir -p ~/.claude/skills && ln -s "<home>/runtime/plugin/mirror-ext-<user>" ~/.claude/skills/mirror-ext-<user>` | nothing: read in place | `/ext-review-copy` (2.1.304) |
| Codex | a copy of the plugin, keyed by its version | `codex plugin marketplace add "<home>/runtime/plugin"`, then `codex plugin add mirror-ext-<user>@mirror-ext-<user>` | `codex plugin add mirror-ext-<user>@mirror-ext-<user>` again | `$mirror-ext-<user>:ext-review-copy` (0.163.0) |
| Antigravity | a copy staged under `~/.gemini/config/plugins/mirror-ext-<user>/` | `agy plugin install "<home>/runtime/plugin/mirror-ext-<user>"` | the same command again | `/mirror-ext-<user>:ext-review-copy` (1.4.3) |
| Grok Build | a copy under `~/.grok/installed-plugins/` | `grok plugin install "<home>/runtime/plugin/mirror-ext-<user>" --trust` | `grok plugin uninstall mirror-ext-<user> --confirm && grok plugin install "<home>/runtime/plugin/mirror-ext-<user>" --trust` | `/ext-review-copy` (1.0.62) |

Beside the table, three facts US3 established that a user meets: a `command-skill`'s
subcommands are the same `mirror ext <id> <subcommand>` on every runtime; on Claude
Code, Codex, Antigravity, and Grok Build a skill invocation is a command turn the
logger does not record as a conversation (by design, CV21.DS4.TS3); and under `codex
exec` the plugin's hooks log the prompt only (CR152, open).

**The recovery line (A6), wherever invocations are listed:** not listed? Run the step
the install printed for that runtime; running the install again prints it again. After
a change, `mirror runtime diagnose` names the reinstall a copying runtime still needs.

## Scope

Each surface carries what A1 assigns it, in its own register (the writer's): the
contract is the specification, the extension docs the author's manual, the `SKILL.md`
header an example, Getting Started the first-day reader, REFERENCE lookup.

1. **The contract**, `docs/product/specs/runtime-interface/index.md` — the only table.
   - *External Skill Runtime Surface Contract*: say that install writes
     `runtime/skills/<runtime>/` for every declared key and that two are read, `pi` by
     Pi's extension and `claude` by the plugin generator, so a third key reaches no
     runtime. Correct the per-home plugin section's Claude Code wiring line to the
     printed `mkdir -p ~/.claude/skills && ln -s …` (A2). Add the table above as "How
     an installed extension reaches each runtime", with US3's versions, binaries, and
     date, the three facts, and the recovery line (A6).
   - *Reference Implementations › Claude Code*: replace "Current external-skill
     surfacing path" so the home-level path is the plugin link
     (`~/.claude/skills/mirror-ext-<user>`) and `expose-claude` / `clean-claude` are
     the project-local projection they still are. Add TS1's login facts — the login is
     keyed to the config directory *and* to `HOME`; `/tmp/…` and `/private/tmp/…` are
     two logins; a logged-in scratch config dir answers under the real `HOME` and "Not
     logged in" under a scratch one — measured on 2.1.296 (TS1) and relied on by US3's
     Claude cell on 2.1.304 (A9). Cross-reference from *Smoke test isolation*.
2. **The extension docs**, `docs/product/extensions/`.
   - `index.md` › *Where extensions live*: add `runtime/skills/<runtime>/` and
     `runtime/plugin/mirror-ext-<user>/` to the layout block; then the five invocation
     lines, the recovery line, and a link to the contract's table — no table (A1, A6).
   - `authoring-guide.md` › *7. Install*: the report the install prints, as printed
     (A2): the `plugin: mirror-ext-<user> 0.1.<n>, <k> skill(s)` line, one `<Runtime>:
     not wired — <step>` line per runtime on the `PATH` that has not taken it, and
     `not carried` for an extension with no `claude` block. › *8. Use*: the skill on
     each runtime (`/ext-hello`; `$mirror-ext-<user>:ext-hello`;
     `/mirror-ext-<user>:ext-hello`); one sentence on why `command_name: ext:hello` is
     typed `/ext-hello` (A5); the reinstall after editing `SKILL.md` on the three
     copying runtimes; the recovery line (A6). **The six listings in steps 2–6 do not
     change**: the guard below holds them to `fixtures/hello/`.
   - `api-reference.md` › the manifest's `runtimes:` block: replace
     `# codex etc. optional` with what a key does — `pi` and `claude` are read; the
     `claude` block is what reaches Claude Code, Codex, Antigravity, and Grok Build
     through the plugin; any other key is validated and written, and read by nothing.
     The `ext:` / `ext-` validation rule stays, with the sentence on what `ext:<id>`
     becomes on disk (A5).
3. **`review-copy`'s `SKILL.md`**, `examples/extensions/review-copy/SKILL.md` (A3).
   The header is cut to four things: where it is installed, the one install command,
   the five names, where its files land. The "equivalent explicit flow" goes. The
   *Syntax* block carries the argument grammar once, under whatever name the runtime
   invoked; the *Examples* keep one spelling, `/ext-review-copy`. The rest of the
   skill's body — the flow, the prompt, the report — is not touched.
4. **Getting Started**, `docs/getting-started.md` (A4): the passage goes in step 10,
   *What's Next*, where extensions enter a reader's path — a few sentences, no table:
   `mirror extensions install` regenerates the reader's own plugin
   `mirror-ext-your-name` and prints the step a runtime still needs; what to type on
   each, with `your-name` concrete; the recovery line; the link to the extension docs.
   Step 8, *How the mirror reaches each runtime*, gains one cross-reference sentence at
   most.
5. **REFERENCE**, `REFERENCE.md` (A1): rows, no table. The `ext-review-copy` row's
   three columns become `/ext-review-copy` · `$mirror-ext-<user>:ext-review-copy` ·
   `/ext-review-copy`, its purpose naming the Antigravity and Grok Build forms; a
   `mirror extensions` row with its verbs and arguments as the usage lines print them;
   a `mirror ext <id>` row.
6. **README**, one bullet: the extension system's line says extensions reach every
   runtime, Pi through its catalog and the other four through a per-home plugin.
7. **CV21's index**, *External Extension Surface Assessment*: the superseded note
   also points at TS1's decision and DS5's package.
8. **The guard**, US3's `route.sh static`: extract each fenced listing of the
   authoring guide whose first line is a path comment (`# skill.yaml`,
   `-- migrations/001_init.sql`, `// commands/ping.mjs`, `// commands/list.mjs`,
   `// context-provider.mjs`, `<!-- SKILL.md -->`), drop that line, and diff it against
   its file under `fixtures/hello/`: one `ok`/`bad` per listing, naming the file. One
   more check that every fixture file has a listing, so a listing that loses its path
   comment is caught. The guide's path is overridable (`DS5_US3_GUIDE`) so the guard's
   failure can be shown on a scratch copy. The route's help text says the guard reads
   listings that open with a path comment (A8). Measured while planning: all six are
   byte-identical today, so the guard passes at this commit.
9. **The records**: this package's `index.md` and `test-guide.md` (the evidence and
   the grid); TS4 and the DS5 table row In Progress now. At Done, after the Navigator's
   validation: TS4 Done, DS5 Done in its package and in the CV21 index, the worklog
   entry.

## Review amendments

Reviewed 2026-10-21 through five lenses; all nine folded at the Navigator's direction.

- **A1** (quartermaster, writer): one table, in the contract. `extensions/index.md`
  carries the five invocation lines and a link; Getting Started a few sentences and a
  link; REFERENCE rows, no second table.
- **A2** (quality assurance): wiring steps taken from what `extensions install`
  prints, `mkdir -p` included; the printed block pasted into the test guide; the
  contract's existing Claude Code line corrected to match.
- **A3** (writer, prompt engineer): `review-copy`'s header cut to location, install
  command, five names, files; no explicit flow; *Syntax* carries the grammar once;
  *Examples* one spelling.
- **A4** (product designer): the Getting Started passage in step 10, `your-name`
  concrete; step 8 one cross-reference sentence at most.
- **A5** (product designer): the `ext:hello` → `/ext-hello` sentence in the
  authoring guide's step 8, beside the api-reference note.
- **A6** (product designer): a recovery line wherever invocations are listed. *As
  folded*: the review worded it "`mirror runtime diagnose` names the step", which is
  true only for a stale copy, a dangling link, or duplicated copies; a runtime never
  wired is not drift and `diagnose` does not report it (US2's design). The line names
  both: the install prints the wiring step, and prints it again when run again;
  `diagnose` names the reinstall after a change.
- **A7** (quality assurance): a surface × runtime × fact checklist in the test guide;
  Validation Evidence records the grid.
- **A8** (quality assurance): the guard's help text states it checks listings that
  open with a path comment.
- **A9** (quality assurance): the login facts cite 2.1.296 (TS1) and 2.1.304 (US3
  relied on them).

Found while folding: Pi 1.3.0 registers each skill as the command `skill:<name>` (its
menu matches the bare name), while this project spells Pi's skills `/mm-<skill>`
everywhere. TS4 keeps the project's form for `ext-review-copy` and names Pi's own form
in the contract's Pi row; the project-wide spelling is a question for the Navigator,
outside this story.

## Non-Goals

- No product code, test, manifest, or skill body changes beyond `review-copy`'s header,
  *Syntax*, and *Examples*. If a doc line cannot be made true without changing
  behaviour, that is a stop condition, not a fix here.
- No re-measurement, and no line for a runtime, step, or spelling DS5 did not
  measure. Pi's row is its unchanged catalog path, stated as such.
- The parity matrix across every doc with every runtime side by side: DS11. A second
  copy of the table anywhere outside the contract (A1).
- README beyond the one bullet; `docs/product/architecture.md` (DS11's).
- The `ext:` convention itself, the project-wide Pi spelling, CR158's silent
  `0 skills`, and the other open CRs.

## Acceptance Behavior

```text
Given mirror-mind at this commit, with TS1's decision, US3's evidence, and the report
  `extensions install` prints as the only sources
When a person reads the contract's external-skill section, docs/product/extensions,
  examples/extensions/review-copy/SKILL.md, Getting Started, or REFERENCE for how an
  installed extension reaches their runtime
Then the contract names, for Pi, Claude Code, Codex, Antigravity, and Grok Build, what
  reads the extension, the step run once, the step after a change, and the exact
  invocation, and every other surface carries what A1 assigns it, agreeing with it
And every wiring step on every surface is the one extensions install prints, and every
  version, binary, and date is one US3 or TS1 recorded
And wherever invocations are listed, the recovery line says what to run when a skill is
  not listed
And bash route.sh static in US3's package reports one check per listing and one for
  coverage, passes at this commit, and fails when a listing and its fixture file differ
And git diff touches only the files named in Scope; npm test, checkDocLinks, the
  retired-surface sweep, and buildClaudePlugin --check stay green
```

## Validation Route

**Automated** (the tree is docs plus one route script; nothing under `ts/src`
changes):

- `npm test`, `node ts/scripts/checkDocLinks.ts`, `node ts/scripts/checkRetiredSurfaces.ts`
  (new files staged first), `node ts/scripts/checkSkillCommandParity.ts`,
  `node ts/scripts/buildClaudePlugin.ts --check`, `git diff --check`.
- `bash route.sh static` in US3's package: the seven checks it has today, six listing
  diffs, and the coverage check, all `ok`; then, as the guard's own proof, one listing
  edited in a scratch copy of the guide (`DS5_US3_GUIDE=<copy>`) must turn its check
  `bad` (recorded in the test guide, not committed).
- `extensions install` run from this checkout into a scratch home, its report pasted
  into the test guide as the source of every wiring step (A2).

**Navigator** — the grid (A7). The test guide lists each surface × runtime × fact cell
with the value it must carry, or `—` where A1 assigns that surface nothing. The
Navigator reads each surface and ticks its cells:

1. The contract: every cell of the table, the login facts, the Claude Code section's
   plugin link and `expose-claude` as project-local. Pass: each cell matches US3's Step 3
   and Step 4, TS1's decision, and the printed report. Fail: a spelling, version,
   binary, or step none of them recorded.
2. The extension docs: the five invocation lines and the recovery line in `index.md`;
   the printed report in step 7; the spellings, the `ext:` sentence, the reinstall, and
   the recovery line in step 8; the two read keys in `api-reference.md`. Pass: `git
   diff` of the authoring guide touches no fenced listing, and `route.sh static` is
   green. Fail: a listing changed, or a claim that a third `runtimes:` key reaches a
   runtime.
3. `review-copy`'s `SKILL.md` and REFERENCE's `ext-review-copy` row: the same five
   names; no `ext:review-copy` as something a person types; no install flow beyond the
   one command. Pass: the two agree with each other and with the contract. Fail: they
   disagree.
4. Getting Started step 10 and REFERENCE's `mirror extensions` and `mirror ext` rows:
   a reader who installed Mirror for one runtime finds that runtime's spelling, with
   `your-name`, and what to run when a skill is not listed, without opening a story
   package. Pass: every runtime has both. Fail: a runtime missing, or a step that
   differs from the printed report.
5. The CV21 pointer and the DS5 package. Pass: the superseded note points at TS1's
   decision and DS5; the DS5 row says TS4 is in progress.

**E2E decision: not required**, accepted by the Navigator at Plan approval. This story
changes documentation and a route's static check. The live behaviour it describes is
US3's, measured on 2026-10-20 and cited by version, binary, and date. The commands the
docs print are checked against the shipped code, in a scratch home, by the printed
report above.

## Implementation Contract

- Characterization before change: `route.sh static` runs green before the guard is
  added, and the guard is shown to fail on a deliberate drift before it is relied on.
- Keep changes scoped to `CV21.DS5.TS4`: the files named in Scope and no others.
- Do not use git add .; commit only story-scoped files.
- Follow the project's development guide: docs/process/development-guide.md.
- One source for every line: a fact not in TS1's decision, US3's evidence, the printed
  report, US2's contract section, or the code is not written.

## Stop Conditions

- scope_change_detected — a doc line cannot be made true without a product change
  (for example, a spelling that would need the plugin generator or the validator to
  change).
- plan_rule_conflict — a surface's existing structure has no honest place for what A1
  assigns it without rewriting the surface.
- failing_required_check_without_clear_fix — `route.sh static`, `npm test`, or
  `checkDocLinks` red for a reason outside this story.
- navigator_decision_needed — a source disagrees with another (TS1's spelling versus
  US3's, the contract versus the printed report, or the code) and the docs must pick
  one.

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
