# Plan — CV21.DS8.US2

## Objective

Make every document a user or an agent reads to use Mirror say what the
package now ships: four runtimes — Pi, Claude Code, Codex, Antigravity — with
Antigravity in Gemini CLI's place wherever a runtime list, a wiring step, a
skill-naming line, or a parity table appears. US1 removed the integration; the
docs still advertise it, and the release tripwire (`publish.yml`, the same
retired-surface sweep) would refuse a release over four of them. This story
clears the docs and widens the `gemini-cli` guard row with the doc-facing
names US1 left out, so the tree is releasable and stays clean.

History keeps its text: release notes, decisions, closed roadmap packages,
refinement records, the worklog, and the lessons sections that say what
Gemini CLI taught. A sentence that says "Gemini CLI was" is not residue; a
sentence that says "Gemini CLI is" is.

Inventory, by `git grep -i gemini` outside history, `ts/`, and the model
mentions (extraction, `consult`, cost): 20 files. Three of them are generated
copies, and one is a byte copy, so the edit lands in the source and the
generator or the guard carries it.

## Scope

**Guarded copies — edit the source, regenerate, let the guard prove it:**

- `AGENTS.md` (the Operating Instructions): the header comment's runtime list;
  the "named three ways" paragraph gains one clause — Antigravity takes the
  plugin form (`/mirror-mind:mm:<skill>`, typed in DS7.US4's route) — not a
  fourth way: the next sentence already says a plugin install prefixes the
  plugin's name, and every line here is read by a model each session. Then
  `node ts/scripts/buildClaudePlugin.ts` refreshes
  `plugins/mirror-mind/rules/AGENTS.md`, which the guard holds byte-equal.
  `CLAUDE.md` line 13 (the Project Context's harness list) by hand; the
  operating-instructions test compares the two.
- `.pi/skills/mm-build/SKILL.md` "Pi and Gemini CLI:" → "Pi:". It is
  Pi-sourced (`PI_SOURCED_SKILLS`), so the same build regenerates
  `.claude/skills/mm-build/SKILL.md` and `plugins/mirror-mind/skills/mm-build/`.
- `.pi/skills/mm-explore`, `mm-soul` (Usage headers "Pi and Gemini CLI:"),
  `mm-help` (description and intro say "on Pi and Gemini CLI") — Pi copies
  only; their Claude copies are authored apart and never named the runtime.
  `buildClaudePlugin.ts --check` and `checkSkillCommandParity.ts` stay green.

**User-facing docs:**

- `README.md`: "Four supported runtimes" (line 63) names Pi, Claude Code,
  Codex, Antigravity; the subscription line (84) follows the Getting Started
  decision below; the "Multi-runtime" bullet (114) states the current truth
  plainly — "from Claude Code only to Pi, Claude Code, Codex, and
  Antigravity" — with no retirement parenthetical: the release note tells
  that history.
- `docs/getting-started.md`: the subscription table drops the Gemini AI Pro
  row and the "only unlocks" sentence, and gains no Antigravity row — what
  Antigravity requires is not in the tree, and the table says what it is: the
  subscriptions Mirror's authors have used (Navigator decision, 2026-10-18);
  the "Other harnesses" list swaps Gemini CLI for Antigravity, with its link;
  §6's "two for Gemini CLI and Codex" becomes "two for Codex" and the Gemini
  CLI row goes; §7's "`/mm-seed` in Pi and Gemini CLI" becomes Pi, and gains
  the Antigravity form; §8's "### Gemini CLI" run section becomes
  "### Antigravity" — `agy`, the plugin-form skills, what DS7 measured, and
  nothing about what agy does *not* do (nobody measured an absence); "How the
  mirror reaches each runtime" says Antigravity receives the instructions as
  `rules/AGENTS.md`; §9's checklist names the four.
- `REFERENCE.md`: the prefix sentence (40) and the command table's column
  header (46) read "Pi" where they read "Pi / Gemini CLI", and a line says
  Antigravity uses the Claude Code plugin form.
- `docs/index.md`: the runtime list (5); the "Runtime expansion result" line
  (93) is deleted — a status sentence in an index that went stale once and
  would again; the roadmap holds the state.
- `docs/product/architecture.md`: the harness list (17), the tree (58, 61 —
  `.gemini/hooks/` is gone), the parity table row (268) reads Antigravity L4
  through the agy layer, the shared-skills paragraph (276).
- `docs/product/specs/runtime-interface/index.md`: the runtime count (6), the
  wrapper locations (55–56), the per-runtime paragraphs for logging (174),
  session end (239), and inject (338), the "### Gemini CLI" hook table (420–432)
  and the `.gemini/skills/` note (439–440), the tree-wrapper list (496), the
  wiring-table row (532) and the settings sentence (537), the session-id row
  (757), the deferred-close row (777) and the injection-model row (792), the
  skill-surface paragraphs (833–845). The lessons (719–747, "found live in
  Gemini CLI") stay as past tense. The established-labels line (865) keeps
  `gemini_cli` and says it is history: logged conversations carry it. **No
  restructuring**: the minimum that unmarks Gemini CLI as live and fills
  Antigravity's cells where a table has a row; the spec's structural refresh
  is DS11's.
- `docs/product/specs/welcome/index.md`: the delivery row (182) becomes
  Antigravity's — on demand, `/mirror-mind:mm:welcome`, no automatic
  injection: agy's hooks carry no welcome (checked: `hooks/agy.ts` and
  `plugins/mirror-mind/agy/*.sh` name none), so the row reads like Claude
  Code's; the invocation line (193).
- `ts/README.md` (88): the hook-entries line names Claude Code, Codex, the
  plugin — a doc under `ts/`, which the inventory's `ts/` exclusion missed.
- `docs/process/troubleshooting.md` (687: the wrapper list; 758: "Claude Code
  or Gemini CLI transcripts"), `docs/reference/configuration.md` (237),
  `docs/process/engineering-principles.md` (8, 580), `docs/process/triad.md`
  (42: `.gemini/` leaves the surfaces list).
- `docs/product/extensions/api-reference.md` (43) and
  `docs/product/extensions/template/skill.yaml.template` (21): the example
  runtime keys stop naming `gemini`. What key Antigravity takes in an
  extension manifest is DS5's; the example names `codex` only.

**The guard, widened:**

- `ts/src/guards/retiredSurfaces.ts`, the `gemini-cli` row: `forbiddenPatterns`
  gains `\.gemini/hooks`, `gemini:(session-start|session-end|log-user|log-assistant)`,
  and `gemini skills link`. Not `\.gemini/settings\.json` and not `~/.gemini`:
  that directory is Antigravity's home too, and US3's cutoff will name the file
  a user edits. No exemption *here*: once this story lands, nothing live names
  those. US3 adds one if it places un-wiring guidance outside history — the
  Codex precedent put it in Getting Started with an exemption, because a user
  who meets a failing hook opens Getting Started, not last month's note.
- `ts/test/scripts/retiredSurfaces.test.ts`: the row's residue test flips its
  `docs/living.md` fixture from "passes US1's row" to flagged, and gains a
  fixture that names `~/.gemini/settings.json` and passes; the "clean against
  this repository" test proves the sweep.

## Non-Goals

- Do not implement sibling roadmap item CV21.DS8.US3: the cutoff record, the
  release note, the version, the release.
- Do not rewrite history: `docs/releases/`, `docs/project/`, the worklog, the
  lessons in the runtime-interface spec and the development guide (348), the
  CI comment and the npm-smoke comment US1 wrote in past tense.
- Do not touch Gemini *model* mentions: `mm-consult`, `mm-consolidate`,
  `mm-shadow`, the `gemini` family row in `mm-help`, the extraction model in
  the dev guide, `docs/reference/configuration.md`'s model keys.
- Do not change Antigravity's own documentation beyond naming it where Gemini
  CLI was; DS7 wrote it and DS11 refreshes it.
- Do not promote a skill into `PI_SOURCED_SKILLS`: that is a decision for
  `decisions.md`, not a sweep.
- Do not touch `ts/` beyond the guard row, its test, and `ts/README.md`.

## Acceptance Behavior

```text
Given US1 removed the Gemini CLI integration
When the runtime-facing docs are swept
Then README, Getting Started, REFERENCE, docs/index, AGENTS.md and its two
  copies, the runtime-interface spec, the welcome spec, architecture,
  troubleshooting, configuration, the engineering principles, the triad, the
  extension examples, and the four skills name Pi, Claude Code, Codex, and
  Antigravity, with Antigravity's plugin-form skills where a form is given
And the inventory grep (`\bgemini\b`, case-insensitive, model names
  excluded) outside docs/releases, docs/project, and the worklog finds only
  past-tense history and Gemini model mentions
And claudePlugin.test.ts (the tree equals the generated text) passes and
  `node ts/scripts/buildClaudePlugin.ts --check` reports no drift, so the
  plugin's rules/AGENTS.md and the three skill copies carry the edit
And the gemini-cli retired-surface row forbids `.gemini/hooks`, the gemini:*
  routes, and `gemini skills link`, and the sweep is clean against the tree
And `node ts/scripts/checkRetiredSurfaces.ts` — the release tripwire's check —
  passes, so US3 can release
And the Gemini model mentions and every historical record are unchanged
```

## Validation Route

Automated:

- `npm test`: the operating-instructions guard (AGENTS.md vs CLAUDE.md), the
  Claude plugin guard (`rules/AGENTS.md` byte-equal, skill copies), the
  widened `gemini-cli` row's seed tests, and "clean against this repository".
- `node ts/scripts/buildClaudePlugin.ts --check`: no drift.
- `node ts/scripts/checkRetiredSurfaces.ts`: the tripwire's own check, green.
- `node ts/scripts/checkDocLinks.ts`: no link broke in the sweep.

Navigator-visible route:

- Observation 1, the Driver's inventory grep, so the two cannot disagree:
  `git grep -In -i "\bgemini\b" -- ':!docs/project' ':!docs/releases' ':!docs/process/worklog.md' | rg -v -i "gemini-2\.5|gemini flash|gemini-3|google/gemini|\| gemini \||consult gemini|gemini.*(family|families|model)|\.gemini-plugin|~/\.gemini/config"`
  — pass: every match is past tense (a lesson, a "retired by" note, the
  `gemini_cli` history label) or the guard's own table; fail: a sentence
  still presents the runtime as supported, wired, or an option.
- Observation 2: read `docs/getting-started.md` §1, §6, §7, §8 top to bottom
  as a new user — pass: four runtimes, one wiring row each, an Antigravity
  run section, no Gemini CLI step anywhere; fail: a Gemini CLI instruction
  survives or the Antigravity section states something DS7 did not measure.
- Observation 3: `node ts/scripts/checkRetiredSurfaces.ts` — pass: exit 0;
  fail: any `gemini-cli` problem.
- Observation 4: `diff AGENTS.md plugins/mirror-mind/rules/AGENTS.md` — pass:
  empty; fail: the copies differ.
- Observation 5: `rg -n "gemini" .pi/skills/mm-consult/SKILL.md` — pass: the
  model family rows are still there; fail: a model mention was swept.

E2E decision: not required. The story changes prose and one guard table; no
runtime behavior moves. The guards and the tripwire are the proof that the
tree says one thing everywhere.

Not independently releasable until US3 cuts the note — but after this story
the tree *could* be released: the tripwire passes. That is the point.

## Implementation Contract

- Guard first: widen the `gemini-cli` row and its tests before the sweep, run
  the "clean against this repository" test, and let its red list be the
  inventory the sweep works from; the grep inventory above is the cross-check.
- Edit sources, never generated copies: `.pi/skills/mm-build`, `AGENTS.md`;
  then `node ts/scripts/buildClaudePlugin.ts` and commit what it wrote.
- Where a doc states a fact about Antigravity (how the welcome reaches it, what
  the first session asks, the skill form), read DS7's record first and write
  only what it measured.
- Keep changes scoped to `CV21.DS8.US2`.
- Do not use git add .; commit only story-scoped files.
- Follow the project's development guide: docs/process/development-guide.md.

## Stop Conditions

- navigator_decision_needed — any Antigravity fact a doc needs that DS7's
  record does not supply. (The subscription table was decided at Plan
  review: the Gemini row goes, no Antigravity row is invented.)
- scope_change_detected — a doc edit that would change a Gemini model mention,
  a historical record, or a skill body beyond the runtime line.
- plan_rule_conflict.
- failing_required_check_without_clear_fix.

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
