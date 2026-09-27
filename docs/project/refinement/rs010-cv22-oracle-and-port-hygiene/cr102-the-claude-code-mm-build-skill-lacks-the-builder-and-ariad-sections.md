[< Refinement Workbench](../index.md) · [RS010](index.md)

# CR102 — The Claude Code `mm-build` skill carries no activation boundary, journey binding, or Ariad section

## Problem

### As captured (2026-09-25)

Builder Mode has two skill variants, and they no longer describe the same mode:

| Runtime | Skill it reads | Size |
|---|---|---|
| Pi | `.pi/skills/mm-build/SKILL.md` | 1019 lines |
| Codex, Gemini CLI | `.agents/skills/mm-build`, a link to the Pi copy | the same file |
| Claude Code, in a checkout | `.claude/skills/mm-build/SKILL.md` | 108 lines |
| Claude Code, installed plugin | `plugins/mirror-mind/skills/mm-build/SKILL.md` | byte-identical to `.claude` |

The 108-line variant covers loading a journey, reading project docs, keeping
them current, setting `project_path`, and finalizing the session. It has none
of these:

- the **Builder Activation Boundary**: loading a journey is context, not
  consent to change files;
- the transition-surface rules;
- **Journey Binding** (CR008): every `build` command after `build load`
  carries `--journey <slug>`;
- **Adopted Method** and **Ariad Runtime Behavior**: the lifecycle commands,
  the verbatim surface transport protocol, Refinement composition, cadence,
  and preauthorization.

The Pi copy gained its Ariad section on 2026-06-12, and the Claude variant
never followed. [CR071](cr071-collapse-the-triplicated-skill-command-references.md)
compared the variants on 2026-09-09. It recorded three deliberate differences:
frontmatter name, Usage section, and example language. The missing sections are
not among them. The skill-parity gate compares entry points only for the
commands each copy documents, so it cannot see a section that one copy lacks.

Found while closing CR008. That CR's skill change (`0924c1dc`) reached Pi,
Codex, and Gemini CLI through `.pi`. It reached nothing on Claude Code, because
the Claude variant documents no lifecycle command to change.

### As characterized (2026-09-27)

Measured on `1c8e684b`.

**The floor widened the gap.** The Pi copy is now 1093 lines and 47,978 bytes.
Six floor commits edited it after this CR was captured: `9a180b47` (CR079),
`251225e0` (CR002), `f6001715` (CR001), `b97f6be1` and `618d49f9` (CR067), and
`0710f8c3` (CR018). The Claude copy has not changed since `2a597fc5`
(2026-09-16).

**The Claude copy is an older subset of the Pi copy.** Its six sections are
the Pi copy's sections 1, 2, 4, 5, 6, and 7. They use older words
(`CV/Epic/Story` where Pi says `CV/Delivery Story/User Story/Technical Story`),
and section 1 lacks Pi's two lines on the mode transition. Only its Usage block
is its own, and that block names `/mm:build`, which the Pi Usage section already
documents beside the Pi, Gemini CLI, and Codex invocations.

**The Pi body works in every runtime.** Apart from Usage, it names no runtime
mechanism. One claim depends on the runtime: Journey Binding says that no
session id reaches the agent's shell. That holds on Claude Code, where the
hooks read `session_id` from their stdin payload (`ts/src/hooks/claude.ts`)
and nothing exports `MIRROR_SESSION_ID` to the agent's Bash tool. Other skills
differ here. `mm-soul` and `mm-mirror` carry lines that are true for only one
runtime: Pi's `--session-id` against Claude Code's hook-owned session.

**The plugin copy has always been generated.** `ts/src/guards/claudePlugin.ts`,
run by `node ts/scripts/buildClaudePlugin.ts`, writes `plugins/mirror-mind/`,
manifest and skills, from `.claude/skills/`. `ts/test/scripts/claudePlugin.test.ts`
fails `npm test` when the committed plugin drifts. CR071 rejected generation
because it would have to model per-runtime differences. For `mm-build` there is
one: the frontmatter `name`.

**The parity gate cannot see subcommands.** `checkSkillCommandParity.ts` keys
an invocation by the first token after `cli.ts`, so it reads every
`build <subcommand>` line as `build`. Both copies document `build load`, so
the gate is satisfied however many lifecycle commands the Claude copy lacks.
Both existing guards pass on this tree: `buildClaudePlugin.ts --check` reports
the plugin in sync, and the parity check reports it clean.

**Correction to Impact: project instructions already carry the safety rules.**
In a checkout, Claude Code loads `CLAUDE.md`, which `AGENTS.md` links to. That
file carries the Builder activation boundary and the Ariad surface transport
invariant. The skills invoke `ts/src/frontDoor/cli.ts` relative to the working
directory, so today they work only in a checkout, where `CLAUDE.md` is loaded
as well. The boundary reaches Claude Code, but from the project rather than the
skill. That stops once US3 lets the plugin run outside a checkout, and the
skill becomes its only carrier. The Ariad half is in neither place: the
lifecycle commands, Journey Binding, Refinement composition, cadence,
preauthorization, and closure records.

**Other skills have the same kind of drift.** Two were checked. The Claude
`mm-mirror` asks for a topic before loading. On a pure mode switch Pi loads
first and renders the transition surface, and the Claude copy has no section
for that surface. The Claude `mm-release-notes` has no `pending`, which Pi
prefers for update questions. The differences in `mm-help`, `mm-tasks`,
`mm-journey`, `mm-week`, and `mm-consult` were not audited. See
[Decision B](#decision-b-the-same-drift-in-other-skills).

## Expected Behavior

Builder Mode behaves the same way for the same journey in every runtime. The
activation boundary and journey binding apply everywhere. For an
Ariad-adopted journey, the lifecycle commands apply too, and their surfaces
pass through verbatim. Where a runtime is meant to differ, the difference is a
recorded decision with its reason, and the parity gate knows about it.

How the variants are then kept in step is part of the fix. CR071 rejected
generating the copies from one source as "a larger machine than the problem".
A gap of more than 900 lines is a new fact for that trade-off.

## Impact

Medium. A Claude Code user on an Ariad-adopted journey gets Builder Mode
without Ariad. There are no lifecycle commands to follow, no rule that
surfaces pass through verbatim, and no activation boundary in the skill, so
whatever the agent improvises is unguided. Since CR008, a lifecycle command
improvised without `--journey` refuses rather than binding another journey,
so that failure is loud rather than silent.

The missing activation boundary is the sharper gap. Nothing in the Claude Code
skill says that loading a journey is not consent to change files. (Corrected
on 2026-09-27: in a checkout, `CLAUDE.md` says it. See
[As characterized](#as-characterized-2026-09-27).)

## Plan Or Decision

Not planned. Captured without selecting; Current Focus unchanged. Captured by
the Navigator's decision while closing
[CR008](../rs001-ariad-runtime-trust/cr008-bind-lifecycle-commands-to-active-journey.md).

**2026-09-25: added to the Ariad trust floor, all of it**, by the Navigator's
decision ([amendment](../../decisions.md#the-cv22-release-is-gated-on-an-ariad-trust-floor-worked-before-us3)).
It is last in floor order, because its port carries the Ariad section that the
other floor changes are still editing.

**2026-09-27: selected.** The seven other floor changes are done.

**Planned and assigned 2026-09-27.** Quality assurance drafted the plan, and
the technical panel reviewed it the same day
([record below](#panel-review-2026-09-27)). The panel's changes are folded in.
Navigator decisions, 2026-09-27: [A1](#decision-a-how-the-variants-stay-in-step)
and [B1](#decision-b-the-same-drift-in-other-skills). Plan approved, Driver
`@viniciusteles`, Delivery `mirror-ts-core`. B1 also asked whether CR108 gates
the CV22 release. The Navigator answered at validation, the same day: it does
not.

### Objective

Builder Mode reads the same instructions in every runtime. The Claude Code
copies of `mm-build`, in a checkout and in the plugin, are generated from the
Pi copy and differ from it only in the frontmatter `name`. A change to the Pi
copy fails `npm test` until both Claude copies carry it.

### Design (A1)

1. **One authored copy.** `.pi/skills/mm-build/SKILL.md` stays the only copy
   anyone edits. Its body already serves every runtime: Usage documents all
   three invocations, and nothing else in it is runtime-specific.
2. **A list of one skill, and a one-line transform.** A new module,
   `ts/src/guards/piSourcedSkills.ts`, holds the list `["mm-build"]` and
   `claudeVariant(piText)`. That function rewrites the frontmatter line
   `name: "mm-build"` to `name: "mm:build"` and changes nothing else. It
   refuses, naming the file, when the frontmatter does not hold exactly one
   `name` line equal to the skill's directory name.
3. **The existing generator starts one step earlier.** `planGeneratedFiles` in
   `claudePlugin.ts` also plans `.claude/skills/<skill>/SKILL.md` for each
   listed skill, from its Pi copy. The plugin copy of a listed skill is planned
   from that content, never from the file on disk, so a single write cannot
   carry a stale `.claude` copy into the plugin. `node ts/scripts/buildClaudePlugin.ts`
   writes both copies, and `--check` and the existing repository test report
   either one when it is out of date. No new CI step is needed: a change outside
   `docs/` runs the Tests workflow, which runs that test.
4. **The failure names where to edit.** For a listed skill, the drift line
   reads `out of date: .claude/skills/mm-build/SKILL.md (generated from
   .pi/skills/mm-build/SKILL.md: edit the source, then regenerate)`. The skill
   file itself carries no notice (panel: prompt engineer).
5. **The other 24 skills are untouched.** They keep CR071's invariants.
   [Decision B](#decision-b-the-same-drift-in-other-skills) covers their drift.
6. **Records.** A decision entry, *Builder Mode's skill has one body in every
   runtime*, covering why, what Claude Code users now read, and how a skill
   joins the list. Claude Code users will read the other runtimes' Usage lines
   and the bilingual trigger examples that Pi, Codex, and Gemini CLI already
   read. The runtime interface spec gains where Claude Code's skills come
   from. The development guide says where `mm-build` is edited. The parity
   checker's header points to the generator for listed skills.

### Decision A: how the variants stay in step

- **A1. One body, from the existing generator (recommended).** As designed
  above. It changes CR071's recorded differences for one skill: Claude Code
  reads the Pi Usage section and the Pi examples, which already pair most
  Portuguese phrases with English ones.
- **A2. Port by hand, and guard the structure.** A Claude-only Usage section,
  English examples, and a new gate comparing headings and documented `build`
  subcommands. Every change to the Builder skill is then written twice, which
  would have been six times since this CR was captured. The gate also cannot
  see a rule rewritten inside a section, and that is how CR001 and CR067
  changed the skill.
- **A3. Generate every skill from a template with runtime blocks.** This fixes
  the whole class, but it has to model the per-runtime lines of `mm-soul` and
  `mm-mirror`. That is the machine CR071 rejected, and it adds 24 skills to the
  floor.

### Decision B: the same drift in other skills

- **B1. Capture CR108, outside the floor (recommended).** This follows the
  floor rule. The capture records `mm-mirror` and `mm-release-notes` as
  verified and the rest as unaudited. The Navigator also states whether CR108
  gates the CV22 release (panel: product designer).
- **B2. Fold it into CR102.** This would be an amendment to the floor decision,
  as CR018's was.

### Affected files

- `ts/src/guards/piSourcedSkills.ts` (new): the list and `claudeVariant`.
- `ts/src/guards/claudePlugin.ts`: plans the `.claude` copy of a listed skill,
  and the plugin copy from the planned content; header.
- `ts/scripts/buildClaudePlugin.ts`: messages name both sources.
- `ts/test/scripts/claudePlugin.test.ts`, and a unit test for the new module.
- `.claude/skills/mm-build/SKILL.md` and
  `plugins/mirror-mind/skills/mm-build/SKILL.md`: regenerated.
- `ts/scripts/checkSkillCommandParity.ts`: header comment.
- `docs/project/decisions.md`, `docs/product/specs/runtime-interface/index.md`,
  `docs/process/development-guide.md`.
- `docs/project/refinement/index.md` and this document. With B1, also CR108
  and RS010's index.

### Plateaus

1. **The generator writes the Claude copies of `mm-build` from Pi.** Red first:
   unit tests for `claudeVariant` and for the planning, and the repository
   test failing on today's tree with both copies named. Then the module, the
   planning, and `buildClaudePlugin.ts`. The guard and the regenerated copies
   land in one commit, because a guard alone would turn CI red (CR071).
2. **Records:** the decision, the spec, the development guide, and the
   checker's header. Under B1, CR108 too.
3. **Close:** the validation route with the Navigator, the handoff review, the
   Debt Review, and Done.

### Acceptance criteria

1. `diff .pi/skills/mm-build/SKILL.md .claude/skills/mm-build/SKILL.md` shows
   exactly one changed line, `name`. The plugin copy is byte-identical to the
   `.claude` one.
2. The Claude copies carry every heading of the Pi copy, including 1.1
   Transition Surface, 1.2 Journey Binding, 3 Builder Activation Boundary,
   Adopted Method Behavior, and Ariad Runtime Behavior.
3. If one sentence changes inside an existing section of the Pi copy and
   nothing is regenerated, `npm test` and `buildClaudePlugin.ts --check` both
   fail and name both copies and the source to edit. Neither existing guard
   can see this today.
4. A hand edit to the `.claude` copy fails the same way.
5. Generation refuses, names the file, and writes nothing in two cases: a
   listed skill has no Pi copy, or its Pi frontmatter `name` is missing,
   repeated, or not the skill's directory name.
6. No other skill file changes in `.pi`, `.claude`, or the plugin.
7. `checkSkillCommandParity.ts` stays clean.
8. `npm test`, `npm run typecheck`, `npm run lint`, and CI are green.
9. The Navigator walks the route below and accepts it.

### Validation route

The route runs Claude Code in this checkout, on this journey. `build load`
writes what every Builder activation writes, a conversation and the mode.
Every step after it is read-only. `CLAUDE.md` already gives Claude Code the
boundary and the transport rule, but steps 2 and 3 use commands that only the
new skill documents. They are what tell the new skill from what Claude Code
already gets.

1. Run `claude` from the repository root, then `/mm:build mirror-ts-core`.
2. Ask: `Where does the active item stand?`
3. Ask: `What can I pull now?`
4. In a terminal: `git status --short`.

Pass:

- Step 1: the reply carries the `BUILDER_RESUME` block verbatim and ends by
  asking what to do next.
- Step 2: the agent runs `build show --journey mirror-ts-core --method ariad`,
  and the reply carries the `ACTIVE_CHECKPOINT` block verbatim.
- Step 3: the agent runs
  `build pull-candidates --journey mirror-ts-core --method ariad`, and the
  reply carries the `ROADMAP SNAPSHOT` and Pull Candidates blocks verbatim.
- Step 4: the session changed no file.

Fail: a `build` command without `--journey`; a surface that is summarized,
translated, or reformatted; a step answered without its command; or any
changed file.

### Conscious exclusions

- The other 24 skills (Decision B).
- Splitting `mm-build` into a core file and references read on demand. That
  would cut what every runtime loads, about 12k tokens per activation, but it
  changes every runtime (panel: AI engineer).
- Translating the Portuguese examples, or making the one body English-only.
- Plugin invocations outside a checkout, and the plugin's version. Those
  belong to US3 (CR093 was promoted there) and the release.
- A generated-file notice inside the skill (panel: prompt engineer).
- Renaming `buildClaudePlugin.ts` or `claudePlugin.ts`.

### Authority boundaries

Plan approval moves CR102 to `planned`. A human Driver and a Delivery reference
are required before `in_progress`. `validated` requires the Navigator to walk
the route above and accept it. Each plateau is committed on the Delivery branch
and pushed when green, with GitHub Actions verified after every push. Merge,
publication, and release are not authorized.

Navigator decisions, 2026-09-27: Driver `@viniciusteles`, Delivery
`mirror-ts-core`.

### Panel review (2026-09-27)

This is the plan review before implementation, per the CV22 collaboration
strategy. The quality-assurance draft was reviewed by the engineer,
database-architect, devops-engineer, security-engineer, ai-engineer,
prompt-engineer, experience-designer, and product-designer lenses. Only
dissent was recorded.

Synthesis: the plan is sound, and cheaper than the CR feared. One of the three
copies is already generated, and `mm-build`'s body has no per-runtime content
to model. "One source" therefore costs a list of one skill and a one-line
transform inside the existing generator, checked by an assertion CI already
runs. Risk sits in two places. The validation has to tell the new skill apart
from what `CLAUDE.md` already gives Claude Code. And the context Claude Code
loads for Builder Mode grows by more than ten times. The plan succeeds if an
edit to the Pi copy alone can no longer pass CI, and a Claude Code session on
an Ariad journey runs the lifecycle commands with `--journey` and renders their
surfaces verbatim.

| Lens | Dissent | Resolution |
|---|---|---|
| engineer | The draft had `claudePlugin.ts` own the transform too. A module named and documented for the plugin would then also write into `.claude/skills/`, and the list and the transform would be tested only through file planning | The list and `claudeVariant` get their own module, tested in isolation. `claudePlugin.ts` only plans and writes. Its header and the script's messages name both sources, and nothing is renamed, because the development guide already names the script |
| ai-engineer | Claude Code's Builder activation grows from about 0.9k tokens of skill to about 12k. Journeys that never adopted Ariad pay that too, for sections they are told to ignore | Accepted as the price of one behavior: Pi, Codex, and Gemini CLI already pay it. Splitting the skill for progressive disclosure changes every runtime and is a conscious exclusion |
| prompt-engineer | The draft put a generated-file notice at the top of the body, where a model's attention is highest. It is repository mechanics with no behavioral value, and `edit that file` can read as an instruction | No notice in the skill. The check's failure line names the source and tells the contributor to edit it (Design 4) |
| product-designer | `mm-mirror`'s drift is more visible to users than `mm-build`'s, because Mirror Mode is the default lens, and the CV22 release ships it. A capture that does not say whether it gates the release leaves that to default | Decision B1 asks the Navigator to state it |

The database-architect, devops-engineer, security-engineer, and
experience-designer lenses raised no objection. One authority with derived
copies and a consistency check is the right shape for two stored copies of one
truth. An edit to the Pi copy alone runs the Tests workflow, which ignores only
`docs/`, so `npm test`'s sync assertion runs with no new CI wiring. The port
strengthens a safe default, and the generator writes only fixed paths inside
the repository. Nothing a user sees changes except the agent's behavior.

## Evidence

- Measured 2026-09-25. `.pi/skills/mm-build/SKILL.md` is 43,778 bytes and 1019
  lines, with top-level parts `Base Builder Mode Behavior` (sections 1–7,
  including 1.1 Transition Surface, 1.2 Journey Binding, and 3 Builder
  Activation Boundary), `Adopted Method Behavior`, and
  `Ariad Runtime Behavior`. `.claude/skills/mm-build/SKILL.md` is 3,455 bytes
  and 108 lines, with sections 1–6 only. `plugins/mirror-mind/skills/mm-build/SKILL.md`
  is byte-identical to it.
- `.agents/skills/mm-build` links to `../../.pi/skills/mm-build`, and Codex and
  Gemini CLI discover skills there
  ([getting started](../../../getting-started.md),
  [runtime interface](../../../product/specs/runtime-interface/index.md)).
- `git log -S'# Ariad Runtime Behavior' -- .pi/skills/mm-build/SKILL.md`: first
  `befad51f` (2026-06-12, "Add Ariad pull and prepare lifecycle"). The `.claude`
  copy was last changed by `2a597fc5` (2026-09-16), for its invocation only.
- `ts/scripts/checkSkillCommandParity.ts`: what it checks, and what it
  deliberately does not.

### Characterization (2026-09-27)

On `1c8e684b`:

- `wc -lc`: the Pi copy is 1093 lines and 47,978 bytes, and the Claude copy is
  108 lines and 3,455 bytes. `git log -- .pi/skills/mm-build/SKILL.md` lists
  the six floor commits named above.
- `diff .claude/skills/mm-build/SKILL.md <(sed -n '1,192p' .pi/skills/mm-build/SKILL.md)`:
  the Claude copy's differences from Pi's Base Builder Mode Behavior are its
  `name`, its Usage block and example, the missing mode-transition lines,
  sections 1.1, 1.2, and 3, the "Once the user explicitly authorizes work" lead,
  `CV/Epic/Story`, section numbering, and line wrapping.
- `grep -n` over the Pi copy for runtime names finds only its Usage section,
  plus `CLAUDE.md` in the list of project docs to read, which the Claude copy
  lists too.
- `node ts/scripts/buildClaudePlugin.ts --check`: `Claude plugin is in sync.`
  `node ts/scripts/checkSkillCommandParity.ts`: `clean -- 25 skills agree on
  every entry point`. Both pass with 985 lines missing from the Claude copy.
- `CLAUDE.md`, "Builder activation boundary" and "Ariad surface transport
  invariant". `.github/workflows/tests.yml`: `paths-ignore: ["docs/**"]`.
- `diff .pi/skills/mm-mirror/SKILL.md .claude/skills/mm-mirror/SKILL.md` and
  the same for `mm-release-notes`: the drift named under Decision B.

### Plateau 1 handoff (2026-09-27)

Now true: `.pi/skills/mm-build/SKILL.md` is the only copy of the Builder skill
anyone edits. `node ts/scripts/buildClaudePlugin.ts` generates both Claude
copies from it and changes only the frontmatter `name`. It takes the plugin
copy from the generated content, never from the file on disk.
`ts/src/guards/piSourcedSkills.ts` holds the list, `mm-build`, and the
transform. `npm test` and `--check` fail when either copy is out of date, and
name the Pi copy as the source to edit. Generation refuses, in one line and
before any write, when a listed skill has no Pi copy or its frontmatter does
not name it exactly once. The Claude copies are 1093 lines; `diff` against Pi
shows line 2 alone, and every heading is present.

Evidence, red first. The transform's 11 cases failed on the missing module. On
the generator's side, 9 new cases failed before the planner changed. On this
tree, the repository test and `--check` named both copies out of date. A mutant
that took the plugin copy from disk failed three cases that were green without
it. The plateau's commit message says four, but the two repository tests were
red already. Exercised on the real tree:

- Rewording one sentence inside section 3 of the Pi copy, to `Context
  activation is never execution consent.`, failed `--check` and both
  repository tests, naming both copies.
- A Pi frontmatter naming `mm-other` made write mode refuse in one line with
  exit 1, and `--check` afterwards still found everything in sync, so nothing
  was written.

The full suite passes (2,762 tests), along with typecheck and lint. Lint shows
one warning and one info note, which HEAD has too. The four repository checks,
the two custody proofs, the five end-to-end smokes, and the Claude plugin smoke
all pass. CI is green on `82ac4503`, Tests and Docs.

Remaining: the records. Next: plateau 2.

### Plateau 2 handoff (2026-09-27)

Now true: the decision
[Builder Mode's skill has one body in every runtime](../../decisions.md#builder-modes-skill-has-one-body-in-every-runtime)
records why, what Claude Code users now read, the context cost, and how a skill
joins the list. The runtime interface spec's Skill sharing section and
architecture section 6 say where Claude Code's skills come from. The development guide
says to edit the Pi copy and regenerate. The parity checker's header points to
the generator for what it cannot see.
[CR108](cr108-the-claude-code-copies-of-other-skills-drift-from-pi-in-behavior.md)
is captured, unassigned, outside the floor, with `mm-mirror` and
`mm-release-notes` verified and the rest unaudited. Current Focus is
unchanged.

Remaining: whether CR108 gates the release is still the Navigator's open
question. Next: the validation route, walked by the Navigator in Claude Code.

### Navigator validation (2026-09-27)

The Navigator walked the [validation route](#validation-route) in Claude Code
and accepted it. Each pass condition was checked against the session's own
records, not only against the pasted screen:

- Steps 2 and 3: the Claude Code transcript holds exactly
  `build show --journey mirror-ts-core --method ariad` and
  `build pull-candidates --journey mirror-ts-core --method ariad`, and
  `front-door.log` shows each one succeeding on its first call. Without
  `--journey`, `build show` exits 1 and logs an `ERROR` line, which was checked
  in a scratch home.
- The transcript also shows which skill the session loaded. Every command the
  Ariad section documents is in it, and the 108-line copy documented none of
  them.
- Steps 1 to 3: the agent's replies carry every block byte for byte, markers
  included. The pasted screen showed `<<ARIAD:X>>` and lost the `**` in the
  resume row. That is Claude Code's terminal rendering the reply as Markdown,
  where `<ARIAD:X>` is an autolink and `**text**` is bold.
- Step 4: the working tree was clean.

In steps 1 and 2 the agent reported five finished floor changes as open. It
had read them in the collaboration strategy's stale Remaining Sequence, and it
corrected itself in step 3 from the Refinement index (finding 2 below).

CI was green on each plateau's last push: plateau 1 (`82ac4503`) and plateau 2
(`807aa622`), Tests and Docs.

### Handoff review (2026-09-27)

This review came after validation, per the collaboration strategy. The baseline
panel (engineer, quality-assurance, database-architect, devops-engineer,
security-engineer) and the lenses that reviewed the plan (ai-engineer,
prompt-engineer, experience-designer, product-designer) reviewed the delivered
code, tests, safety posture, operational cost, and resumability. One candidate
was checked against the code and dropped. The skill says `project_path=` is the
last line `build load` prints, yet on screen the Builder banner came after it.
The banner goes to stderr, so on stdout the skill is right.

Synthesis: the change is small for what it closes. The source adds 161 lines
and removes 18, most of it the transform, its list, and the planning around
them, and the tests add 219. It closes a 985-line gap and adds a guard that
neither existing check could provide. For this skill the drift can no longer
return in silence: the only copy anyone edits generates the other two, and CI
compares them byte for byte. Its weak points are the text around it: two
comments in the generator that this CR made untrue, and a required-reading
document whose floor status had drifted.

| # | Lens | Finding | Class | Recommendation |
|---|---|---|---|---|
| 1 | engineer | Two comments in `claudePlugin.ts` became untrue in this CR. `materialize` says it writes the generated plugin files, but it now also writes `.claude/skills/mm-build/SKILL.md`. `discoverSkillSources` calls every `.claude` skill a source, and one of them is now generated, so a caller who took it at its word would treat a generated file as authored | Non-blocking debt, introduced here | Pay now: both comments say what the code does |
| 2 | ai-engineer | The journey's required reading, `collaboration-strategy.md`, listed five finished floor changes as open. The Claude Code agent repeated that as fact in steps 1 and 2 and corrected itself only when it read the Refinement index in step 3. A status list copied into narrative drifts, and an agent that loads it on every activation believes it | Pre-existing, surfaced by validation | Pay now, in the close: the floor completes with CR102, so the list is marked complete and stops changing |
| 3 | experience-designer | Claude Code's terminal renders the surfaces as Markdown. Each marker loses a bracket, and the `**` in CV22's status line disappears from the resume row, shifting its right border. The reply itself is verbatim, so the transport rule holds | Accepted scope boundary | No action here. The row is CR103's (CV22's status line printed whole), and the observation is now in its evidence |
| 4 | quality-assurance | The script's one-line refusal is new, and no test covers it. `buildClaudePlugin.ts` has no test of its own, and its repository root is fixed. The refusal it catches is tested in the module, and the one-line output was exercised on the real tree | Accepted scope boundary | No action |

The other lenses were silent:

- database-architect: no data changed. The route's `build load` wrote what every
  Builder activation writes.
- devops-engineer: an edit to the Pi copy alone runs the Tests workflow, which
  fails until the copies are regenerated, and rollback is a plain revert of
  `82ac4503`. Every edit to the Builder skill now changes three files in a
  diff, which is accepted.
- security-engineer: the generator writes fixed paths from a constant list, and
  no input reaches a path.
- prompt-engineer: the walk shows the Claude Code agent following the Ariad text
  as written. It passed the journey to every command, passed the blocks through,
  and kept the boundary.
- product-designer: the agent flagged in step 3 that Pull Candidates recommends
  US3 while the floor is open. That is right and by design: the floor is a
  project sequencing decision, not a roadmap item, and it ends with this CR.

Accepted scope boundaries, as planned: the other 24 skills (CR108, which does
not gate the release), progressive disclosure of the skill, the Portuguese
examples, and plugin invocations outside a checkout (US3).

## Outcome

Open.
