[< CV21.DS8](../index.md)

# CV21.DS8.US2 — Every runtime-facing doc names four runtimes, Antigravity as the successor

**Status:** 🟡 Planned
**Type:** User Story

---

## User Story

As a reader of Mirror's docs — a new user, a returning Gemini CLI user, or an
agent reading the Operating Instructions,
I want every runtime-facing page to describe the runtimes Mirror actually
supports — Pi, Claude Code, Codex, and Antigravity,
So that nothing I read sends me to set up a runtime the package no longer
carries.

## Outcome

Gemini CLI is absent from every document a user or an agent reads to use
Mirror today. Where a runtime list appears, it names four runtimes with
Antigravity in Gemini CLI's place. History — release notes, decisions, closed
roadmap packages, refinement records, the worklog — keeps saying what was true
when it was written.

## Acceptance Behavior

```text
Given the runtime-facing docs
When I search them for "Gemini CLI"
Then README, Getting Started, REFERENCE, docs/index, AGENTS.md (root, plugin
  rules/, and the Claude copy), the runtime-interface spec and its parity
  table, the welcome spec, architecture, troubleshooting, configuration, and
  the development guide carry no mention, except the cutoff pointer US3 adds
And the skills that said "Pi and Gemini CLI" (mm-help, mm-build, mm-explore,
  mm-soul) say "Pi" or "Pi and Antigravity" as each surface truly works,
  in the .pi/ source and the plugin copy alike

Given the repository
When I run `rg -i "gemini cli"` outside docs/releases, docs/project, and the
  cutoff record
Then nothing is found

Given the guards that compare the Operating Instructions and skill copies
  across runtimes (`operatingInstructions.test.ts`, `piSourcedSkills.test.ts`)
When the suite runs
Then they pass on the edited copies

Given a mention of Gemini models (extraction, consult, cost)
When the sweep is done
Then it is unchanged
```

## Scope

- README: the "four supported runtimes" lines, the subscription table, the
  multi-runtime bullet.
- `docs/getting-started.md`: the subscription table, the runtime list, the
  `mirror init` table row, the Gemini CLI section, the "already inside a
  runtime" line, the closing checklist.
- `REFERENCE.md`: the prefix lines and the command-table column header.
- `docs/index.md`, `docs/product/architecture.md` (the harness list, the tree,
  the parity table, the shared-skills paragraph),
  `docs/process/troubleshooting.md`, `docs/reference/configuration.md`,
  `docs/process/development-guide.md` (the hooks history paragraph may stay
  as history; the live smoke loop may not).
- `docs/product/specs/runtime-interface/index.md`: the runtime count, the
  wrapper locations, the Gemini CLI sections (logging, session end, inject),
  the Gemini CLI hook table, the `.gemini/skills/` note, the parity table row.
- `docs/product/specs/welcome/index.md`: the delivery table row and the
  invocation line.
- AGENTS.md at the root, `plugins/mirror-mind/rules/AGENTS.md`, and whatever
  CLAUDE.md imports: the skill-naming paragraph ("`/mm-<skill>` in Pi and
  Gemini CLI"), the Journey Status line, any other runtime list.
- Skills: `mm-help`, `mm-build`, `mm-explore`, `mm-soul` in `.pi/skills/` and
  their `plugins/mirror-mind/skills/` copies; the `mm-help` output if it lists
  runtimes.
- `package.json` description and keywords, if US1 left them.

## Out Of Scope

- Code and tests (US1); the cutoff record and release note (US3).
- Historical docs: `docs/releases/*`, `docs/project/decisions.md`, roadmap
  packages, refinement records, `docs/process/worklog.md`.
- Gemini model mentions: `mm-consult`, `mm-consolidate`, `mm-shadow`, the
  `gemini` family row in `mm-help`, the extraction model in the dev guide.
- Antigravity's own docs: DS7 wrote them; US2 only removes the runtime beside
  them.

## Validation

Navigator-visible: read Getting Started and REFERENCE top to bottom; `rg -i
"gemini cli"` on the tree with the history paths excluded. Automated: `npm
test` (the operating-instructions and skill-copy guards).
