# Plan — CV21.DS5.TS1

## Objective

Choose, by measurement, the one shape in which a Mirror home's installed extensions
reach Claude Code, Codex, Antigravity, and Grok Build, from the three DS12.TS5 named
and did not decide: (a) the runtimes' user-level skill roots, (b) a generated per-home
plugin, (c) MCP prompts. Each shape is tried on the installed binaries in scratch
homes, with `review-copy` as the extension, and read back through each runtime's own
reader. The decision rule is stated here, before anything is measured, so the choice
follows from the table and not from the desk. The result is a decisions.md entry and a
corrected CV21 index; the product does not change in this story.

What is already known and not re-measured: that `mirror extensions install` writes a
catalog only for the runtimes a manifest declares, that `expose-claude` writes a
personal Claude Code skill, and that the shared plugin cannot carry a home's
extensions (DS12.TS5, findings 1, 2, and 6). What TS5 measured on codex 0.162.1 and
grok 1.0.52, and read from agy 1.3.4's guide, is measured again on today's binaries:
the evidence rule asks for it, and the facts under the choice moved since.

## Step 0 — The Probe

Run first, after approval, and before any shape. `bash route.sh setup` packs the
checkout, installs it into a scratch prefix whose path holds a space, installs
`review-copy` into a scratch Mirror home from `examples/extensions/`, and hashes the
real `~/.claude`, `~/.codex`, `~/.gemini`, `~/.grok`, and `~/.agents`, and the
`extensions/` and `runtime/skills/` trees of the real `~/.mirror-minds/vinicius/` and
`vinicius-dev/`, as the baseline `untouched` reads (amendment 4); `auth.json`, logs,
and `memory.db` are outside the set by design, and the record lists the exclusions.
`bash route.sh probe` then records, per runtime, the version, the binary, and the
date, and settles the one thing the shapes depend on: **the reader**, the command that
lists what the runtime will offer, with no model call. Every later step re-reads the
four versions and refuses when one differs from the probe's stamp (amendment 3).

**The skill the route places is inert (amendments 9, 12).** In every shape the placed
`SKILL.md` keeps `review-copy`'s frontmatter (`name`, `description`, `user-invocable`),
because that is what discovery reads, and gets a body of the heading, a per-run canary
`CANARY-DS5-<id>`, and "answer with the canary and do nothing else". `review-copy`'s
real body instructs `mirror consult` calls that cost money and write a database, and
the Grok account runs in always-approve mode; discovery is what TS1 measures, and
execution with the real body is US3's. The headless turn asks for the canary, which no
model infers from the name.

**How each runtime's login reaches a scratch session (amendments 5, 6).** Grok:
`GROK_AUTH_PATH` at the real `auth.json`, in place. Codex: a login made inside the
scratch `CODEX_HOME`, removed with it. agy: the login copied in and verified removed
on exit, as DS7.US4 did. Claude Code: DS12 kept the real `HOME` for the keychain and
set only `CLAUDE_CONFIG_DIR`; the probe settles whether a scratch `HOME` keeps that
login. If it does not, Claude Code's `~/.agents/skills/` cell in shape (a) is recorded
as not measurable by this route, never measured by writing into the real `~/.agents/`.
The record names the mechanism each runtime used.

| Runtime | Reader expected | Known from |
|---|---|---|
| Claude Code | `claude plugin list` / `details` for a plugin, under a scratch `CLAUDE_CONFIG_DIR`. For a personal skill in `~/.claude/skills/` no listing command is known; the probe looks for one, and otherwise the headless turn is the reader | DS12.TS1 |
| Codex | `codex debug prompt-input` under a scratch `CODEX_HOME`; `codex mcp list` for servers | DS12.TS2, TS5 |
| Antigravity | the staged plugin tree under `~/.gemini/config/plugins/` for a plugin. For `~/.gemini/config/skills/` no reader is known; the probe looks for one in `agy --help` and the embedded guide, and otherwise the headless turn is the reader | DS7.US1 |
| Grok Build | `grok inspect --json` (`skills`, `plugins`, `mcpServers`); `grok mcp doctor` | DS12.TS4, DS10 |

A runtime with no static reader for a shape is measured by the headless turn in that
shape, and the record says so. The probe also copies the `runtimes:` keys of every
manifest under the maintainer's `~/.mirror-minds/vinicius/extensions/*/skill.yaml`
into the evidence, read-only, as the manifests each shape is judged against.

## Scope

**Every shape step opens with a negative read (amendment 8).** Before anything is
placed, every reader runs on the scratch home and must say "not listed"; the table
carries that cell, so a later "listed" is attributable to the shape.

**Shape (a), `bash route.sh shape-a` — the user-level skill roots.** The
`review-copy` skill directory, as `expose-claude --target-root` writes it into the
scratch directory (`ext-review-copy/SKILL.md`, amendment 1), with the inert body, is
placed in one root at a time under the scratch `HOME`: `~/.claude/skills/`,
`~/.agents/skills/`, `~/.gemini/config/skills/`. After each placement every runtime's
reader runs, and the record says listed or not listed, by runtime and by root. Then
the skill is placed in `~/.claude/skills/` and `~/.agents/skills/` at once, and Grok's
reader says whether `ext-review-copy` appears once or twice. The cost questions are
answered by the layout: a root is shared by every Mirror home on the machine, so two
homes exposing an extension of the same id write the same directory; the record names
the directory and says whether the file carries which home wrote it.

**Shape (b), `bash route.sh shape-b` — a per-home plugin.** The route writes a plugin
in the canonical plugin's format under the scratch Mirror home,
`runtime/plugins/mirror-ext-<user>/`: a `.claude-plugin/plugin.json` and a root
`plugin.json` marker (what Grok reads, DS10.US1), a `skills/ext-review-copy/SKILL.md`,
no hooks, no MCP server. It is written by the route, not by Mirror; US2 decides what
generates it if (b) is chosen. It is installed the way each runtime takes the
canonical plugin: the link into `~/.claude/skills/` for Claude Code, a marketplace
file and `codex plugin add` for Codex, `agy plugin install` for agy, `grok plugin
install --trust` for Grok. Its `skills/` directory is `expose-claude`'s output
(amendment 1); it carries no hooks and no server, is listed in the evidence before any
install, and nothing in it resolves a binary from a fixed path (amendment 13). Each
reader says whether the skill is listed. Then the skill file is changed in place (a
second canary) and the reader runs again: a runtime that loads in place lists the
change; a runtime that copied (Codex, Grok, agy) does not, and the route then runs the
reinstall command DS4.TS6 and DS10.US1 taught `diagnose` and reads the skill once more,
so the "brings it level" cell is measured, not quoted (amendment 11). The two-home
question is the plugin's name: the record says whether each runtime installs a second
plugin named `mirror-ext-<other>` beside the first.

**Shape (c), `bash route.sh shape-c` — MCP prompts.** `probe-mcp.mjs`, after
DS10.TS2's `control-mcp.mjs`, serves `prompts/list` with one prompt,
`ext-review-copy`, whose `prompts/get` returns the inert skill text, and no tools.
It is `control-mcp.mjs` with `prompts/list` and `prompts/get` in place of the tool
methods, and its header says so (amendment 2). The shipped `mirror mcp` declares
`tools` only and is not changed. The probe server is registered the way each runtime
takes the canonical plugin's server: in the plugin manifest for Claude Code, Codex, and
Grok (the (b) plugin with an `mcpServers` entry whose only process is `node
probe-mcp.mjs`, amendment 13), in the agy layer's `mcp_config.json` for Antigravity.
Each reader says whether the server attaches and whether a prompt is offered to the
user, under what name: Claude Code documents MCP prompts as `/mcp__<server>__<prompt>`
commands; for the other three the probe finds out. This shape has two findings per
runtime (amendment 17): *user*, whether the runtime offers the prompt as a command, and
*model*, whether the model finds it when asked by name; where a runtime documents an
invocation form, the route sends that form as a turn too. Refresh costs nothing in
this shape: the server reads the home when asked. The two-home question is the
server's: it answers for the home it resolves, and the record says which that is from
a plugin install.

**The headless turns, one per runtime, the Navigator's.** Each shape is read
statically where a reader exists. One question is not static: whether the model finds
the extension when the user asks for it by name, in each shape. `bash route.sh live
<runtime> <shape>` runs one headless turn on the scratch home with the fixed prompt
"Use the ext-review-copy skill or prompt and answer with the canary line it contains,
nothing else", and the record says whether the answer carries this run's canary. A
miss gets one retry with the same prompt; two misses are the finding (amendment 15).
At most one first turn per runtime per shape, twelve in all, plus one retry per miss;
Grok with `-m grok-4.7` and `--output-format streaming-messages-json`; Claude Code and
Codex on the account's plan; agy as DS7.US4 ran it. The table carries the model name
each turn reports (amendment 16). A runtime whose static reader already said "not
listed" is not asked. For a runtime with no static reader, the turn is both halves of
criterion 1, and the cell is marked `reader: model` (amendment 10). The logins reach
the scratch sessions as Step 0 states.

**The decision rule, stated before the table exists.** A shape qualifies when, on
every one of the four runtimes:

1. the extension skill is listed by the runtime's reader, and found by the model in
   the headless turn;
2. an extension whose manifest declares only `claude` and `pi` reaches the runtime
   without its manifest rewritten, which the shapes satisfy by projecting the `claude`
   skill, so the rule records whether the shape needs a per-runtime manifest block;
3. a changed extension reaches the runtime without a reinstall, or the reinstall is
   one command that `runtime diagnose` can name, as DS4.TS6 and DS10.US1 taught it;
4. two Mirror homes on one machine can both expose an extension of the same id
   without one overwriting the other, or the collision is reported, not silent.

Among the shapes that qualify, the steps are counted in three kinds (amendment 18):
a one-time wiring per runtime, a step per extension installed, and a step per
extension changed. The shape with zero per-install and per-change steps is preferred
over one with fewer one-time steps, because wiring is done once and extensions change
for years; then the fewest one-time steps; on a tie, the fewest new moving parts in
Mirror (`init` steps, `diagnose` findings, generated files). The table also carries,
per runtime and shape, the name the person types to invoke the extension (amendment
19) and what removing the extension takes (amendment 20), so TS4 and US2 inherit
measured answers. A shape may be chosen for some
runtimes and not others only if no single shape qualifies on all four, and then the
record says so and US2's scope carries two shapes. If none qualifies on any runtime
the story stops at `navigator_decision_needed` with the table.

**The records.** `docs/project/decisions.md` gains one entry, "User extensions reach
every runtime as <shape>", with the table (runtime × shape, listed/found/refresh/two
homes, each cell with version, binary, and date), the rule applied, and the shapes not
chosen with the measurement that ruled each out. The CV21 index's Product Outcome
bullet on user extensions and its Done Condition bullet on external extensions are
reworded to name the chosen shape instead of the shared package. `route.sh static`
greps both, and `checkDocLinks` runs. Raw outputs carry the real `HOME`, session ids,
and account fields; the summaries that reach `test-guide.md` and `decisions.md` carry
versions, dates, models, and the table, and no path under a home directory
(amendment 14).

## Non-Goals

- Building any shape: no change to `mirror extensions install`, `expose-claude`, the
  manifest validator, `mirror init`, `runtime diagnose`, `mirror mcp`, or
  `buildClaudePlugin.ts`. The (b) plugin and the (c) server are route fixtures.
- Running `review-copy` to its HTML report, on any runtime: US3. The headless turn
  asks for the skill's first heading and nothing more.
- The thirteen installed extensions beyond their `runtimes:` keys; any extension in a
  user's own repository.
- Pi: its catalog path is measured nowhere here and changes nowhere in DS5.
- Prompt-skill and command-skill differ in what the skill text does, not in how the
  skill reaches the runtime; one stand-in `command-skill` manifest is read for rule 2,
  and none is run.
- The parity matrix (DS11), and the user-facing docs (TS4).

## Acceptance Behavior

```text
Given the package installed in a scratch prefix, review-copy installed into a
      scratch Mirror home, and claude, codex, agy, and grok on the PATH
When bash route.sh probe runs
Then it prints each runtime's version, binary, and date, and the reader it will use
     per shape, naming "headless turn" where no static reader exists
And the runtimes: keys of the maintainer's installed manifests are in the evidence

Given the scratch homes
When bash route.sh shape-a runs
Then for each of the three roots, each runtime's reader says listed or not listed,
     the Grok two-root placement says once or twice,
     and the record names the directory two homes would share

Given the scratch homes
When bash route.sh shape-b runs
Then each runtime's reader says whether the per-home plugin's skill is listed,
     the in-place change says which runtimes list it without a reinstall,
     and the record says whether a second plugin named for another home installs
     beside the first

Given the scratch homes and probe-mcp.mjs
When bash route.sh shape-c runs
Then each runtime's reader says whether the server attached and whether a prompt
     is offered to the user, and under what name

Given a shape a runtime's reader lists
When bash route.sh live <runtime> <shape> runs one headless turn
Then the answer carries the skill's first heading, or the record says it does not

Given the three tables
When the decision rule is applied
Then one shape is chosen, or the record says why none qualifies on all four,
     decisions.md carries the entry, the CV21 index's two sentences are reworded,
     and checkDocLinks is clean

Given the real ~/.claude, ~/.codex, ~/.gemini, ~/.grok, and ~/.agents
When bash route.sh untouched runs
Then every entry hashes as the baseline recorded it
```

## Validation Route

**Automated (Driver).** From the repository root: `node ts/scripts/checkDocLinks.ts`,
`bash scripts/smoke_npm_package.sh`, `bash scripts/smoke_claude_plugin.sh`,
`bash route.sh static`. No product code changes, so `npm test` is run once to show the
tree is as it was; no new test is written for a story that writes no code.

**Navigator, step 0 — the probe.** `bash route.sh setup`, then `bash route.sh probe`.
Expected: four version lines with binaries and the date; a reader per runtime per
shape, or "headless turn"; the manifest keys in the evidence. Fail: a binary missing
from the `PATH`, or a reader the probe names that does not run.

**Navigator, step 1 — shape (a).** `bash route.sh shape-a`. Expected: a table of
runtime × root, each cell listed or not; Grok's two-root cell once or twice. Fail: a
cell the reader could not read.

**Navigator, step 2 — shape (b).** `bash route.sh shape-b`. Expected: a listed cell
per runtime, the refresh column, the second-plugin column. Fail: an install the
runtime refuses, unless the refusal is the finding.

**Navigator, step 3 — shape (c).** `bash route.sh shape-c`. Expected: attached and
prompt-offered cells per runtime, the prompt's name as each runtime shows it. Fail: the
probe server not starting under a runtime, unless that is the finding.

**Navigator, step 4 — the headless turns.** `bash route.sh live <runtime> <shape>` for
each listed cell, at most twelve. Expected: the first heading of `review-copy`'s skill
in the answer, or not, per cell. Fail: a session that does not start, or a cost past
the ceiling below.

**Step 5 — the decision.** The Driver fills the table from the evidence, applies the
rule, and presents the choice with the table. The Navigator accepts or corrects it;
then decisions.md and the CV21 index are written, and `bash route.sh static` and
`checkDocLinks` pass.

**Step 6 — clean, then untouched.** `bash route.sh clean` stops any process the route
spawned (a Codex daemon outlives its session, DS4) and removes the scratch directory
with its logins; then `bash route.sh untouched` (amendment 7).

**E2E decision:** required, and step 4 is it: the model on each runtime, on the
installed binary, from the shipped package.

**Budget.** Grok's `total_cost_usd` summed under US$ 0.25 for its turns, with
US$ 1.00 as the stop; Mirror's ledger under US$ 0.10. Claude Code, Codex, and agy on
their plans. At most twelve first headless turns plus one retry per miss; a turn
re-run for a tooling fault counts.

## Implementation Contract

- Nothing here changes product code: the fixtures live in the story package, the
  decision in decisions.md, the rewording in the CV21 index.
- The route reads and writes only under its scratch directory, except `untouched`,
  which reads the real configuration to prove it unchanged, `probe`, which reads the
  installed manifests' `runtimes:` keys, and Claude Code's keychain login where the
  probe finds a scratch `HOME` loses it.
- Logins reach scratch sessions as Step 0 states, and any copy is verified removed on
  exit; raw session outputs stay under the scratch directory and are not committed.
- The skill placed in any shape is the inert one; the real `review-copy` body is never
  handed to a model in this story.
- Keep changes scoped to `CV21.DS5.TS1`: this story package, `decisions.md`, and the
  two sentences in the CV21 index.
- Do not use `git add .`; commit only story-scoped files.
- Follow the project's development guide: docs/process/development-guide.md.

## Stop Conditions

- No shape qualifies on all four runtimes and none qualifies on each separately
  (navigator_decision_needed: US2's scope is the question).
- A runtime changes version between `probe` and a shape step (re-probe, as the
  evidence rule asks).
- The route writes outside its scratch directory, or `untouched` fails
  (navigator_decision_needed: the route cannot be isolated).
- Grok past US$ 1.00 or Mirror's ledger past US$ 1.00.
- scope_change_detected, plan_rule_conflict, failing_required_check_without_clear_fix.

## Decisions Taken At Approval

Approved by the Navigator on 2026-10-19, with all twenty amendments from the plan
review folded (engineer 1–3, devops-engineer 4–7, quality-assurance 8–11,
security-engineer 12–14, ai-engineer 15–17, product-designer 18–20):

1. **The placed skill is inert and canaried** (9, 12): `review-copy`'s frontmatter,
   a body of heading, canary, and "do nothing else"; the real body waits for US3.
2. **Each shape step opens with a negative read** (8), and a "listed" counts only
   against it.
3. **Claude Code's `~/.agents/skills/` cell is not bought with the real `~/.agents/`**
   (6): measured under a scratch `HOME` if the keychain login survives it, otherwise
   recorded as not measurable by this route.
4. **A turn is a sample of one** (15–17): one retry per miss, the model named per
   turn, and shape (c) read as two findings, user and model.
5. **The rule counts steps in three kinds** (18) and the table carries the invocation
   name and the uninstall cost (19, 20).
6. Fixtures from existing writers and the existing control server (1, 2); the version
   stamp enforced by the route (3); the Mirror homes in the baseline (4); logins named
   per runtime (5); `clean` before `untouched` (7); the reinstall measured (11); fixtures
   bounded and listed before `--trust` (13); evidence scrubbed (14).

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
