[< RS001](index.md) · [Canonical status](../index.md#change-requests)

# CR082 — Plan and Expand surfaces print absolute filesystem paths where their artifact surface prints project-relative ones

**Status:** in_progress
**RS:** RS001
**Driver:** @viniciusteles
**Delivery:** `mirror-ts-core`

## Problem

### As captured (2026-09-13)

Three Ariad lifecycle surfaces print filesystem paths exactly as the runtime
resolved them, which is absolute:

| Surface | What it prints absolute |
|---|---|
| `plan_checkpoint` | the `story package` row, the three `artifacts` rows, and the four `story_package_path=` / `index_artifact_path=` / `plan_artifact_path=` / `test_guide_artifact_path=` trailer lines |
| `expand_decision` | every row of the `materialized` block |
| `expand_blocked` | the `why blocked` reason, which embeds the resolved package directory through the exception text |

`render_artifacts_materialized_surface` does the opposite: it routes every path
through `artifact_surfaces._display_path`, which relativizes against the
journey's project root.

Both run in the same invocation, so one command shows the same file twice in two
forms. From `build plan-item`:

```text
│ story package                                          │
│ /Users/<name>/dev/workspace/<project>/docs/project/roa │
│ dmap/cv1-first/cv1-ds1-delivery/cv1-ds1-us1-story      │
…
│ ✓ created plan                                         │
│ docs/project/roadmap/cv1-first/cv1-ds1-delivery/cv1-ds │
│ 1-us1-story/plan.md                                    │
```

The absolute path is correct *internally* and should stay that way:
`story_paths` resolves the roadmap root deliberately, because
`create_story_directory`'s confinement guard is
`target.is_relative_to(roadmap_root)`, which is only sound on absolutes. The
defect is not the resolution, it is that the resolved value is what the surface
renders.

Two costs follow, neither of them correctness — the files are written to the
right places:

1. **Surfaces travel.** Ariad surfaces are transported verbatim into
   conversations, session exports, and pasted handoffs, so they carry the
   owner's home directory and account name into shared artifacts. Every sibling
   surface in the same output already avoids this.
2. **Truncation makes the rows ungradable.** `_card_text` cuts at 54 code points
   and `_card_wrapped` / `_card_prefixed` wrap at 54 and 52, so an absolute
   prefix decides where every chunk boundary falls. A golden recorded on one
   machine cannot match another: the CV22.DS7.US8 corpus recorded
   `│ /private/var/folders/5k/q6bjkgn95gzd_qss7_5flyzw0000gp │`, a truncated
   prefix of a temp root that no substitution can repair. Grading those rows
   byte for byte is impossible while the surface prints an absolute path.

### As characterized (2026-10-01)

Reproduced at `7e1fbd17` in a scratch home with the [validation route](#validation-route),
whose project is a folder named `storefront`; its output is under
[Evidence](#the-route-before-the-change). The capture was written against Python's
`lifecycle.py`. TS5 deleted that engine, so what follows is the TypeScript runtime, the
only one. The capture holds, and it is wider than it knew.

**Six surfaces a command prints carry absolute paths, and the capture named two of
them.** `PLAN_CHECKPOINT` prints its `story package` row absolute, and its four
`*_path=` lines (route step 3). Its `artifacts` rows became the `story files` block in
CR111, which names files and no directory. The four story closure checkpoints print
their record absolute: `validation artifact`, `review artifact`, `coherence artifact`,
and `done artifact` (steps 4 to 7). The capture missed them because another module
renders them. They are the only report of those writes, because a story closure prints
no `ARTIFACTS_MATERIALIZED`, while a Delivery Story closure prints only that card, and
relative. `EXPAND_BLOCKED` prints its reason absolute, for each of its three causes:
a candidate table without the four columns, an invented story another package already
claims, and a Delivery Story two packages claim (steps 10 to 12).

**No command prints `EXPAND_DECISION`, in either engine.** For a Delivery Story, Pull
renders `DELIVERY_STORY_READY` in its place (step 8). `renderExpandReport` has no
caller outside the lifecycle test, and at the recovery tag `cv22-last-python-bearing`,
`render_expand_report` had none in `src/`: the corpus recorded the function, never a
command's output. Its 15 recorded renders are where it exists.

**A double claim prints absolute paths outside any surface too.** Pull renders it as
`EXPAND_BLOCKED`. Every other command that resolves the item's package, Plan among
them, prints the exception's message as an `Error:` line (step 13). Both read one
message, which `storyDirectoryResolver` builds from absolute directories.

**One command names one file two ways.** `plan-item` prints the package absolute on its
card and its files relative on `ARTIFACTS_MATERIALIZED` beneath it (step 3). The card
cuts the absolute path into 54-column chunks where the root's length decides, so the
row breaks differently on every machine. That is why the tests collapse those rows to
one token (`ts/test/helpers/builderSurfacePaths.ts`) and grade none of them: 61 tokens
in the two recorded corpora. The lifecycle replay escapes the collapse only by running
under repo-relative roots, so its 63 Plan and closure path rows grade a path no user's
machine prints.

**The `*_path=` lines have no reader in the product.** The skill tells the agent to
include the plan artifact path from the command output in its reply, and three test
files read `plan_artifact_path=` to find `plan.md`. Nothing under `ts/src/` reads
them.

**No report of a write names its project or its journey
([CR009](cr009-name-the-target-project-in-artifact-surfaces.md)).**
`ARTIFACTS_MATERIALIZED` names the command and the item (`Plan — CV1.DS1.US1`), and a
closure checkpoint names the item. The template preparation report names the journey,
not the project (step 1). Only `build load` names the project, by its absolute path,
on the Builder Mode card and the `project_path=` line the agent reads (step 0). Today a
closure checkpoint names its project only by accident, inside the absolute path this
change removes. That is why the floor takes the two together: CR082 alone would leave
those four cards naming no project at all.

**What CR008 changed for CR009.** A lifecycle command now binds only to the journey it
is given, so CR009's occurrence, a command that silently resolved another journey,
cannot happen again. A journey whose project path names the wrong folder still can,
and a card that names only the journey would not show it.

## Expected Behavior

Within one invocation, one path form.

- The human-facing card rows render the path project-relative, the way
  `artifacts_materialized` already does, including its fallback for a path that
  legitimately lies outside the project.
- `expand_blocked` names the package the same way, whether the path arrives as a
  field or inside an exception message.
- The `*_path=` trailer lines are a separate decision (below) because they have a
  machine consumer, not a human one.

Once the rows are project-relative they become byte-comparable across machines,
so the parity corpus can grade them whole instead of collapsing them.

Amended at characterization: the four story closure checkpoints are held to the same
rule, and so is the `Error:` line a double claim prints. `EXPAND_DECISION`, which no
command prints, leaves instead of being fixed (D5).

## Impact

Medium-low, and it is the consistency kind. Nothing is corrupted and no file
lands in the wrong place. What it costs:

- a Navigator reading one output sees two conventions and has to notice which is
  which;
- shared surfaces leak a local account name and directory layout, which the
  other surfaces in the same block do not;
- the port pays permanently: while the rows are absolute, that region of three
  surfaces can only be graded structurally, so a future rendering change there
  cannot be caught by the golden. The compensating controls and their limits are
  recorded in `ts/parity/builder_surface_paths.py`.

## Plan Or Decision

Captured 2026-09-13 and deliberately not fixed then: changing Python's text mid-port
would have moved the oracle CV22.DS7.US8 was graded against. Its revisit trigger, US8's
flip, landed on 2026-09-16, and TS5 has since deleted the oracle, which settles the
capture's second question: the change is TypeScript's, now. Left off the Ariad trust
floor on 2026-09-25, and taken onto it on 2026-09-30 with CR009, by the Navigator's
decision
([Decisions](../../decisions.md#the-cv22-release-is-gated-on-an-ariad-trust-floor-worked-before-us3)).
Fifth in floor order, one delivery with
[CR009](cr009-name-the-target-project-in-artifact-surfaces.md).

**Approved 2026-10-01** by the Navigator, with D1 to D6 as recorded below; Driver and
Delivery assigned the same day. The panel reviewed it twice before approval
([record below](#panel-review-2026-10-01)), and both passes' changes are folded in.

### Objective

No marked Ariad surface prints an absolute path inside the project. Every path a card
prints is relative to the journey's project, through one function, so one output names
one file one way and a recorded card reads the same on every machine. Every report of a
file written or left in place names the project's folder and the journey (CR009). The
four `*_path=` lines Plan prints for the agent stay absolute, below the surface's end
marker, where `build load` prints its `project_path=` line (D1).

### Design

**One function names a path (CR082).** `displayPath` moves from
`artifacts/artifactSurfaces.ts` to a module of its own, `projectPaths.ts`, because the
cards, the closure records, and the roadmap resolver all need it, and the resolver must
not import a surface. Its rule stays: relative to the project, and the path as given
when it lies outside. Under it sits one core, `projectRelative`: the relation to the
project, which is empty for the project root itself, or none for a path outside it.
Each caller keeps its reading of those two answers, as today: `displayPath` prints `.`
for the root and the path as given for one outside; the Delivery Story Done preflight,
which has its own copy today, calls the core and refuses both, in POSIX separators.
Neither prints anything different. Every card row that prints a path goes through
`displayPath`:

- `PLAN_CHECKPOINT`'s `story package` row. The Plan report carries the project root
  Plan wrote under; Plan already receives it, for CR079's confinement.
- The `validation artifact`, `review artifact`, `coherence artifact`, and `done
  artifact` rows. The closure reports carry the project root the same way.

**A message names its paths where it is built (D4).** The two `ExpandBlockedError`
messages in `expand.ts` and the `StoryPackageAmbiguityError` message in `storyPaths.ts`
are built with `displayPath`, at the three places that raise them, where the project
root is known. `EXPAND_BLOCKED` prints the reason as it is given, and the `Error:` line
another command prints for a double claim reads the same message, so both change in
one place. No renderer searches text for paths.

**`EXPAND_DECISION` leaves (D5).** `renderExpandReport` is deleted, with its replay in
the lifecycle test and its 15 recorded renders. `BuilderExpandReport.materializedPaths`
stays: `DELIVERY_STORY_READY` reads it.

**The `*_path=` lines stay absolute, and move below the end marker (D1).** Their
reader is the agent, and an agent often works from a directory that is not the
project. A relative path joined to it names a file in another repository, and the
Mirror repository has a `docs/project/roadmap/` of its own, so the wrong file can
exist, or be created. They are also exact, where the card cuts a long path into
54-column chunks, and they name the three files the Driver authors. But they are not
the Navigator's, and inside the block the transport rule copies them into every reply,
and into anything pasted from one, with the owner's home directory in them. So
`renderPlanCheckpoint` prints them right after `<<<END:PLAN_CHECKPOINT>>>`, the way
`build load` prints `project_path=` outside its card. The skill's Plan line names the
plan project-relative in the reply, as the card names its package.

**One row names the target (CR009: D2, D3).** `projectPaths.ts` also composes the row
`project: <folder> · journey: <slug>`, where the folder is the last segment of the
journey's project path. It is printed:

- on `ARTIFACTS_MATERIALIZED`, under its context row, in every render. The card renders
  only when there are artifacts, and there are artifacts only when there is a project;
- on the four story closure checkpoints, under the artifact label and above the path,
  when the record was materialized. With no project the row reads `not materialized`,
  as it does now, and no target row is printed;
- on the template preparation report, as a `project` block between `journey` and
  `method`, in the report's own label-and-value form.

The row reads:

```text
│ Plan — CV1.DS1.US1                                     │
│ project: storefront · journey: alpha                   │
│                                                        │
│ ✓ created story index                                  │
│ docs/project/roadmap/cv1/ds1/cv1-ds1-us1-enter-an-addr │
│ ess/index.md                                           │
```

```text
│ validation artifact                                    │
│ project: storefront · journey: alpha                   │
│ docs/project/roadmap/cv1/ds1/cv1-ds1-us1-enter-an-addr │
│ ess/validation.md                                      │
```

**The skill says how to read a card's path.** A short subsection on paths, and the
Plan line naming the plan project-relative, both under [Skill text](#skill-text).

**The tests grade the rows whole.** No card row needs collapsing, so `normalizePathRows`
leaves `builderSurfacePaths.ts`, with the rationale that says production must print
absolute paths. The `builder-command` comparison substitutes the scratch root only in
the four `*_path=` lines, so an absolute path anywhere else fails. Errors and `stderr`
are compared as printed, not scrubbed. The scratch project in `commands.test.ts`
becomes a fixed-name folder, `project`, inside its temporary directory, so the target
row is the same on every run, as the lifecycle replay's recorded roots already are.

### Skill text

In `.pi/skills/mm-build/SKILL.md`, two edits.

At the end of **Deterministic Ariad Surface Transport Protocol**, before **Ariad
Activation Surfaces**, a new subsection:

```markdown
### Paths on Ariad surfaces

A card prints a path inside the project relative to the journey's `project_path`,
the line `build load` printed last. Open it by joining the two, never by joining it
to the working directory, which can belong to another repository. A card that
reports a file written or left in place names its project folder and journey on a
`project:` row. If that row names a project or journey other than the one this
session loaded, tell the Navigator before touching the files. Plan prints its files'
absolute paths as `*_path=` lines below its surface. They are not part of the
surface: use them as printed, and do not render them.
```

In **Plan Ariad Work**, the first sentence,

> Render the Plan Checkpoint visibly and include the `plan artifact` path from the
> command output in the reply.

becomes

> Render the Plan Checkpoint visibly, and name the plan in the reply by its
> project-relative path: the card's `story package`, then `/plan.md`.

The Claude copies follow through `buildClaudePlugin.ts`.

### Decisions this plan asks the Navigator to take

1. **D1: the `*_path=` lines stay absolute, and move below the surface's end marker**
   (the capture's first question). Their reader is an agent outside the project, and
   below the marker the transport rule stops carrying the root into replies. Changed
   by the panel from "absolute, in place". Alternatives: absolute inside the block,
   as today, which leaves the owner's home directory on every transported Plan card;
   or project-relative, one form for the whole surface, which puts the CR009 failure
   into the agent's hands.
2. **D2: the target is named by the project's folder and the journey's slug.** A wrong
   journey, and a journey whose project path names the wrong folder, both show as a
   wrong name, and the row is the same on every machine. Its limit: two checkouts of
   one repository share a folder name, so on the row only the slug tells them apart,
   and in the session `build load`'s root does. Alternatives: the absolute
   project root, exact, but it reintroduces what CR082 removes into every card; the
   root abbreviated under `~`, which hides the account name but still differs by
   machine; or the journey alone, which a wrong project path passes.
3. **D3: one row, on each report of a write**: `ARTIFACTS_MATERIALIZED`, the four
   story closure checkpoints, and the template preparation report, which CR009 does
   not name but which reports the same kind of write. One row per surface, the first
   of the two placements CR009 offered, not one per artifact. Alternative: story closures print
   `ARTIFACTS_MATERIALIZED` as Delivery Story closures do, and their cards lose the
   path; then one renderer holds the row, but four cards and four commands' output
   change shape.
4. **D4: messages are relativized where they are raised** (the capture's third
   question). The message's readers are all human: the `EXPAND_BLOCKED` reason and an
   `Error:` line. Alternative: relativize in the renderer, which keeps the exception's
   text but must find paths inside prose, and leaves the `Error:` line absolute.
5. **D5: `EXPAND_DECISION` is deleted, not fixed.** No command in either engine ever
   printed it. Alternative: relativize it and keep it graded, a renderer kept alive by
   its own test.
6. **D6: the two closure shapes are captured, not fixed here.** A story's closure
   checkpoint reports its record on its own card; a Delivery Story's reports it on
   `ARTIFACTS_MATERIALIZED`. D3 makes both name their target and leaves the two
   shapes. Captured as CR118 in RS001, with this plan's commit, and outside the
   floor: it is the consistency kind, and the floor is a list. Alternatives: fix it
   inside this delivery (D3's alternative), or leave it unrecorded.

Approving the plan approves these six as recorded; amendments re-open it.

### Affected files

- `ts/src/builder/projectPaths.ts`, new: `projectRelative`, `displayPath`, moved, and
  the target row. `displayPath`'s importers follow it: `closure.ts`, `approve.ts`, `commands.ts`, and
  `artifacts/artifactSurfaces.ts`.
- `ts/src/builder/plan.ts`: the package row through `displayPath`; the report carries
  the project root. The four `*_path=` lines, unchanged, print after the end marker.
- `ts/src/builder/deliveryStoryRoadmapClosure.ts`: its relativizer calls the core.
- `ts/src/builder/closure.ts`: the four artifact rows through `displayPath`, and the
  target row; the reports carry the project root.
- `ts/src/builder/expand.ts`: the two messages; `renderExpandReport` deleted.
- `ts/src/builder/storyPaths.ts`: the double claim's message.
- `ts/src/builder/artifacts/artifactSurfaces.ts`: the target row, from a `journey`
  option.
- `ts/src/builder/templateGeneration.ts`: the `project` block.
- `ts/src/builder/commands.ts`: the journey passed to the artifacts card, and the
  project to the template report.
- `.pi/skills/mm-build/SKILL.md` and its generated Claude copies.
- `ts/test/builder/*`: new tests. A front-door walk through every command that prints
  a path or reports a write: Plan, the four story closures, Pull of a Delivery Story,
  the Delivery Story's Plan, its approval, and its four closures, the template
  preparation,
  the three `EXPAND_BLOCKED` causes, and Plan meeting a double claim. Its project sits
  under a short `/tmp` root, so the root's first card chunk holds all of it. The walk
  fails on any line inside a marked surface that holds the root, on any card row
  inside a marked surface that starts with `/`, and on a report of a write with no
  target row or the wrong one.
  Beside it: the four `*_path=` lines after the end marker and absolute; no target row
  without a project; `displayPath` outside the project; and the preflight's refusal,
  unchanged. `commands.test.ts` and `lifecycle.test.ts` as described under Design.
- `ts/test/helpers/builderSurfacePaths.ts`: what remains, or nothing.
- `ts/test/goldens/builder-command.golden.json`, `builder-lifecycle.golden.json`, and
  `README.md`: the scripted edits.

### Plateaus

Each closes with a commit, a push, and a green CI run that finishes before the next
plateau begins.

0. **Characterize and count.** The route before the change, recorded below. Counted
   in the corpus: `builder-command` holds 3 Plan package rows, 10 closure record rows,
   and 1 `EXPAND_BLOCKED` reason collapsed to `<ABSOLUTE PATH>`, 13
   `ARTIFACTS_MATERIALIZED` cards, and 2 template reports. `builder-lifecycle` holds 15
   Plan package rows and 48 closure record rows under its replay's repo-relative roots
   (`tmp/parity/builder-lifecycle/<sequence>/project/…`), 2 `EXPAND_BLOCKED` reasons
   collapsed, 15 `EXPAND_DECISION` renders, 60 `ARTIFACTS_MATERIALIZED` cards, and 4
   closure checkpoints that read `not materialized`. Its two recorded double-claim and
   table errors already name project-relative paths, scrubbed when recorded.
1. **One path form (CR082).** D1, D4, and D5, `projectPaths.ts`, the skill's Plan
   line, and the tests graded whole. Red first: the walk fails on the absolute rows. The recorded rows are edited
   by script, each derived from the record and never from TypeScript output: the
   package and record paths from the recorded root and files, the `EXPAND_BLOCKED`
   reasons from each step's recorded error and the case's fixture. Every path the
   script derives for a collapsed token must name a directory or file in the case's
   recorded project snapshot, and each lifecycle reason must equal its step's recorded
   error, or the script stops.
2. **The target named (CR009).** D2 and D3, and the skill's subsection on paths. The
   recorded cards gain their row by script, from each case's journey and project
   folder.
3. **Validation and handoff.** The route after the change, the Navigator's walk, the
   handoff review, and the ledger.

### Acceptance criteria

1. No marked surface holds the scratch root. In the route, every step reads
   `absolute: none`, except step 0, `build load` (`outside any surface×2`: its card
   and its `project_path=` line), and step 3, Plan (`outside any surface×4`: the four
   `*_path=` lines).
2. Plan's `story package` row and the four closure records read
   `docs/project/roadmap/cv1/ds1/cv1-ds1-us1-enter-an-address`, with the record's file
   name where there is one. Plan's `story package` names the directory the artifacts
   card names its files in.
3. The three `EXPAND_BLOCKED` reasons and Plan's `Error:` line name
   `docs/project/roadmap/cv1/ds2`, `docs/project/roadmap/cv1/claim`, and
   `docs/project/roadmap/cv1/dup-a, docs/project/roadmap/cv1/dup-b`, and a path
   outside the project still prints as given.
4. Every `ARTIFACTS_MATERIALIZED` card, from each of the commands that print one, and
   every story closure checkpoint that names its record, prints `project: storefront ·
   journey: alpha` once; the template report prints `project` / `storefront` after
   its journey. A closure checkpoint with no project prints no target row.
5. The four `*_path=` lines are absolute, in their order, and printed right after
   `<<<END:PLAN_CHECKPOINT>>>`.
6. Nothing renders `EXPAND_DECISION`, and `renderExpandReport` is gone.
7. The golden diff is a contract:
   - plateau 1, `builder-command`: the 3 package rows, the 10 record rows, and the 1
     reason replace their `<ABSOLUTE PATH>` row with the project-relative path,
     wrapped by the card's rule, and the 3 Plan renders print their four `*_path=`
     lines after the end marker;
   - plateau 1, `builder-lifecycle`: the 15 package rows and the 48 record rows drop
     their sequence's root and rewrap, and the 15 Plan renders move their four lines
     after the end marker; the 2 reasons replace their token with the paths the
     step's recorded error names; the 15 `EXPAND_DECISION` renders leave;
   - plateau 2: the 13 and 60 artifacts cards and the 10 and 48 closure checkpoints
     gain one row each, and the 2 template reports gain one block;
   - every other byte is identical, recorded errors and `*_path=` lines included, and
     every edit is listed in `ts/test/goldens/README.md` with its reason and count.
8. No test collapses or scrubs a card row or an error: the comparison substitutes the
   scratch root in the four `*_path=` lines and nowhere else.
9. The Delivery Story Done preflight refuses and prints exactly as before, through the
   shared core, the project root itself included; `displayPath` prints `.` for it.
10. The skill carries the [Skill text](#skill-text), and `buildClaudePlugin.ts --check`
    passes.

### Validation route

CLI only, in a scratch home, with no Pi session (CR106). Its output before the change is
recorded under [Evidence](#the-route-before-the-change). Run it from the repository root
as a script, with `bash <file>` or `zsh <file>`, so that no interactive alias applies.
It roots its scratch directory at `/tmp/cr082.*`, short enough that the root's first
row carries all of it, and deletes it:

```bash
V=$(mktemp -d /tmp/cr082.XXXXXX) && mkdir -p "$V/home" && export MIRROR_HOME="$V/home" MIRROR_USER= NODE_OPTIONS=--no-warnings
cr082() { node ts/src/frontDoor/cli.ts "$@"; }
P="$V/storefront" && R="$P/docs/project/roadmap" && mkdir -p "$R/cv1/ds1" "$R/cv1/ds2" "$R/cv1/claim" "$R/cv1/dup-a" "$R/cv1/dup-b"
printf '# Roadmap\n' > "$R/index.md" && printf '# CV1 — Checkout\n\n**Status:** 🟢 Active\n' > "$R/cv1/index.md"
printf '# CV1.DS1 — Checkout address\n\n**Status:** 🟡 Planned\n**Type:** Delivery Story\n\n## Candidate Stories\n\n| Code | Story | Type | Status |\n|------|-------|------|--------|\n| CV1.DS1.US1 | Enter an address | User Story | 🟡 Planned |\n| CV1.DS1.TS1 | Validate the address | Technical Story | 🟡 Planned |\n' > "$R/cv1/ds1/index.md"
printf '# CV1.DS2 — Checkout payment\n\n**Status:** 🟡 Planned\n\n## Candidate Stories\n\n| Family | Scope |\n|--------|-------|\n| cards | pay by card |\n' > "$R/cv1/ds2/index.md"
printf '# CV1.DS3.US1 — Gift wrap\n\n**Status:** 🟡 Planned\n' > "$R/cv1/claim/index.md"
for d in dup-a dup-b; do printf '# CV1.DS4 — Receipts\n\n**Status:** 🟡 Planned\n' > "$R/cv1/$d/index.md"; done
git -C "$P" init -q
printf '# alpha\n' | cr082 identity set journey alpha > /dev/null && cr082 journey set-path alpha "$P" > /dev/null 2>&1
cr082 build adopt --journey alpha --method ariad > /dev/null && cr082 build sync-cursor --journey alpha --method ariad > /dev/null
ROOT=$(cr082 build load alpha 2>/dev/null | sed -n 's/^project_path=//p')
b() { cr082 build "$@" --journey alpha --method ariad > "$V/out" 2>&1; }
answer() { grep -o '<<<ARIAD:[A-Z_]*>>>\|^Error: .*' "$V/out" | sed "s#$ROOT#<root>#g" | paste -sd ' ' - | sed 's/^/  answer: /'; }
absolute() { LC_ALL=C awk '/^<<<ARIAD:/ { s = substr($0, 10, length($0) - 12) } /^<<<END:/ { s = "" }
  index($0, "/tmp/cr082.") { n[s == "" ? "outside any surface" : s]++ }
  END { printf "  absolute: "; for (k in n) printf "%s%s×%d", (c++ ? ", " : ""), k, n[k]; print (c ? "" : "none") }' "$V/out"; }
value() { sed -n "/<<<ARIAD:$1>>>/,/<<<END:$1>>>/p" "$V/out" | sed "s/│//g" | LC_ALL=C awk -v h="$2" '
  { c = substr($0, 2); sub(/ +$/, "", c) } f && c == "" { exit }
  f { printf "%s%s", (n++ && !chunk ? " " : ""), c; chunk = (length(c) >= 54 && index(c, " ") == 0) } c == h { f = 1 }
  END { print (n ? "" : "(none)") }' | sed "s#$ROOT#<root>#g; s/^/  $2: /"; }
target() { t=$(sed 's/│//g; s/^ *//; s/ *$//' "$V/out" | grep '^project: ' | sort | uniq -c | sed 's/^ *\([0-9]*\) /\1× /' | paste -sd ';' -); echo "  target: ${t:-(none)}"; }
author() { awk '/^## /{print; print ""; print substr($0,4) ", as the Driver wrote it for this story."; print ""; s=1; next} !s{print}' "$1" > "$1.new" && mv "$1.new" "$1"; }
S="$R/cv1/ds1/cv1-ds1-us1-enter-an-address"
echo '--- 0. build load names the project root, for the agent'; cr082 build load alpha > "$V/out" 2>/dev/null; absolute
echo '--- 1. templates prepared'; b prepare-templates; absolute
t=$(sed -n "/^project$/{n;p;}" "$V/out"); echo "  project: ${t:-(none)}"; echo "  journey: $(sed -n '/^journey$/{n;p;}' "$V/out")"
echo '--- 2. a User Story pulled'; b pull-item --item-code CV1.DS1.US1 --item-level user_story --item-title 'Enter an address' --why-now now; answer; absolute
echo '--- 3. planned'; b plan-item; answer; absolute; value PLAN_CHECKPOINT 'story package'
echo "  trailer: $(grep '^plan_artifact_path=' "$V/out" | sed "s#$ROOT#<root>#")"; target
author "$S/plan.md"; author "$S/index.md"; b approve-plan
echo '--- 4. validated'; b validate-item --implementation-complete --check 'npm test' --checks-status passed --e2e-decision not_required \
  --e2e-evidence 'unit covered' --navigator-route 'run it' --navigator-accepted --expected-observation 'it works' \
  --pass-condition 'it works' --fail-condition 'it breaks'; answer; absolute; value VALIDATION_CHECKPOINT 'validation artifact'; target
echo '--- 5. debt reviewed'; b review-item --debt 'No debt found' --decision no_action; absolute; value DEBT_REVIEW_CHECKPOINT 'review artifact'; target
echo '--- 6. coherent'; b coherence-item --process p --project p --product p; absolute; value COHERENCE_CHECKPOINT 'coherence artifact'; target
echo '--- 7. done'; b done-item --history-action h --roadmap-update r --next-recommendation n; absolute; value DONE_CHECKPOINT 'done artifact'; target
echo '--- 8. the Delivery Story pulled: Expand finds US1 and writes TS1'
b pull-item --item-code CV1.DS1 --item-level delivery_story --item-title 'Checkout address' --why-now now; answer; absolute; target
echo '--- 9. Delivery Story planned'; b set-flow-unit --unit delivery_story
b plan-delivery-story --objective 'Checkout takes an address' --child CV1.DS1.US1 --child CV1.DS1.TS1; answer; absolute; target
echo '--- 10. Expand blocked: the table has no Code, Story, Type, and Status'
b pull-item --item-code CV1.DS2 --item-level delivery_story --item-title 'Checkout payment' --why-now now; answer; absolute; value EXPAND_BLOCKED 'why blocked'
echo '--- 11. Expand blocked: another package claims the story it would invent'
b pull-item --item-code CV1.DS3 --item-level delivery_story --item-title 'Gift options' --why-now now; absolute; value EXPAND_BLOCKED 'why blocked'
echo '--- 12. Expand blocked: two packages claim the Delivery Story'
b pull-item --item-code CV1.DS4 --item-level delivery_story --item-title 'Receipts' --why-now now; absolute; value EXPAND_BLOCKED 'why blocked'
echo '--- 13. the same double claim, met by Plan'
b pull-item --item-code CV1.DS4 --item-level user_story --item-title 'Receipts' --why-now now; b plan-item; answer; absolute
unset MIRROR_HOME MIRROR_USER; rm -rf "$V"
```

`value` joins a wrapped path's rows the way the card cut them, and prints the scratch
root as `<root>`. It reads paths as ASCII, which every path in this route is.

Pass, after the change:

- Step 0: `absolute: outside any surface×2`, unchanged.
- Step 1: `project: storefront` and `journey: alpha`.
- Step 3: `absolute: outside any surface×4`; `story package:
  docs/project/roadmap/cv1/ds1/cv1-ds1-us1-enter-an-address`; the trailer unchanged,
  `<root>/docs/…/plan.md`; `target: 1× project: storefront · journey: alpha`.
- Steps 4 to 7: `absolute: none`; the record at
  `docs/project/roadmap/cv1/ds1/cv1-ds1-us1-enter-an-address/<record>.md`; `target: 1×
  project: storefront · journey: alpha`.
- Steps 8 and 9: `absolute: none`; `target: 1× project: storefront · journey: alpha`.
- Steps 10 to 12: `absolute: none`, and the reasons name
  `docs/project/roadmap/cv1/ds2`, `docs/project/roadmap/cv1/claim`, and
  `docs/project/roadmap/cv1/dup-a, docs/project/roadmap/cv1/dup-b`.
- Step 13: `Error: 2 roadmap packages claim code 'CV1.DS4':
  docs/project/roadmap/cv1/dup-a, docs/project/roadmap/cv1/dup-b`, and `absolute:
  none`.

Fail: `/tmp/cr082.` inside any marked surface, or outside one anywhere but step 0 and
the four `*_path=` lines of step 3; a report of a write with no `project:` row, or with
one naming anything but `storefront` and `alpha`; a `*_path=` line that is not
absolute; or an `EXPAND_DECISION` anywhere.

### Conscious exclusions

- `build load`'s Builder Mode card and its `project_path=` line. They give the agent
  the root it joins paths to; the skill reads the line.
- The confinement guard's `story directory escapes roadmap root: <target>`, and the
  preflight's own `roadmap file <path> is not inside the project at <root>`. Sanitized
  codes and titles cannot reach the first, and the preflight walks the project's own
  roadmap, so nothing reaches the second; and a path outside the project has no
  project-relative name, so its absolute path is the only true one.
- A target row on `ACTIVE_CHECKPOINT`, `CHECKPOINT_REFUSED`, the Prepare reading, and
  the Delivery Story Done preflight. They already print project-relative paths, and
  they report no write.
- `EXPAND_BLOCKED` and `DELIVERY_STORY_READY` get no target row. The first reports that
  nothing was written; the second is followed in the same output by the artifacts card
  that names the target.
- Path separators on Windows. `displayPath` prints the platform's, as it does today;
  [CR083](../rs010-cv22-oracle-and-port-hygiene/cr083-path-normalization-assumptions-are-untested-in-the-port.md)
  is where path normalization is tested.
- Story closures printing `ARTIFACTS_MATERIALIZED` like Delivery Story closures (D3's
  alternative, which the product designer raised; D6 captures it).
- The lifecycle replay's repo-relative roots. They existed to keep the absolute rows
  stable, and the rows no longer depend on the root, but the replay's recorded
  `*_path=` lines do. The front-door walk exercises absolute project paths, the form
  the product passes.

### Authority boundaries

Plan approval moves CR082 and CR009 to `planned`. A human Driver and a Delivery
reference are required before `in_progress`. Proposed, as for every floor change:
Driver `@viniciusteles`, Delivery `mirror-ts-core`. `validated` requires the Navigator
to walk the route above and accept it. Each plateau is committed on the Delivery branch
and pushed when green, with GitHub Actions verified after every push. Merge,
publication, and release are not authorized.

Navigator decisions, 2026-10-01: the plan and D1 to D6 approved as recorded, after the
second panel pass; Driver `@viniciusteles`, Delivery `mirror-ts-core`, for CR082 and
CR009. CR118 captured (D6).

### Panel review (2026-10-01)

One pass, before the Navigator saw the plan, by nine lenses: engineer,
quality-assurance, database-architect, devops-engineer, security-engineer, ai-engineer,
prompt-engineer, experience-designer, and product-designer. The AI and prompt engineers
sat in because the change alters what an agent reads on every card and the skill that
tells it how.

Synthesis: the plan aims at the cause, paths printed as they were resolved, and the
fix itself is small. The risk sits in two places. The Plan card's machine lines lived
inside a surface written for the Navigator, so the first draft fixed every card row and
left the root on the one card the transport rule copies most. And the recorded corpus
hides 14 of the paths it must restore behind a token, so a careless script could
invent them. Every finding below is folded into the plan above.

| Lens | Dissent | Resolution |
|---|---|---|
| security-engineer | D1 kept the root inside the Plan surface, which the transport rule copies into every reply, and into every handoff or document made from one. "`build load` prints it too" holds for the session, not for what gets pasted: this repository's docs already hold seven home-directory paths | D1 changed: the four lines stay absolute and print below the end marker, as `build load` prints `project_path=`. No marked surface holds the root |
| experience-designer | The card ends in four long absolute lines in another register, the noisiest rows last, where the eye lands. Since CR111 the card is the Navigator's; these lines are not | The same move (D1) |
| prompt-engineer | The paragraph names the `project:` row and never says what to do with it. A check with no action is decoration, and the first reader to meet the row is the agent | The paragraph says: if the row names another project or journey than the one this session loaded, tell the Navigator before touching the files |
| prompt-engineer | "A path an Ariad card prints is relative" is false for a path outside the project, which prints as given. And the skill's Plan line still has the agent copy the plan artifact path from the output into its reply, which puts the root back into the reply once the lines leave the block | The paragraph says "a path inside the project". The Plan line names the plan project-relative: the card's `story package`, then `/plan.md` |
| engineer | Two functions compute a path relative to the project: `displayPath`, and the Delivery Story Done preflight's own copy. A fix to one will not reach the other | One core in `projectPaths.ts`, `projectRelative`, answers the relative path or none. `displayPath` prints the path as given when there is none; the preflight refuses. Neither changes what it prints (criterion 9) |
| quality-assurance | A walk that searches output for the scratch root inherits the defect it tests: the card cuts a long root mid-chunk, so a root under the default temporary directory never appears whole on a card row, and an absolute row would pass | The walk's project sits under a short `/tmp` root whose first chunk holds all of it, and the walk also fails on any card row that starts with `/` |
| quality-assurance | Criterion 4 counted the route's three artifacts cards; eight commands print that card | The walk covers every command that prints it, and the criterion says so |
| quality-assurance | The 14 tokens in `builder-command` hide the paths they replace, so a script can restore a path no case wrote | Each derived path must name a directory or file in the case's recorded project snapshot, and each lifecycle reason must equal its step's recorded error, or the script stops |
| product-designer | D3 keeps two places where a closure reports its write: a story's own card, and a Delivery Story's artifacts card. The row makes both honest and leaves the Navigator two shapes for one event | Declined for this delivery: unifying them changes four cards and four commands' output, which is not the floor's question. It stays D3's alternative, the Navigator's to take now or to have captured |

Silent:

- database-architect: nothing stored changes. The cursor holds no path, and no record
  a closure writes contains its own path, so every recorded project snapshot stays
  byte-identical.
- devops-engineer: no migration, and nothing outside the Builder reads the rows or
  where the four lines sit; the tests find `plan_artifact_path=` by line, anywhere in
  the output. The rows CI grades stop depending on the machine. The skill and the
  runtime ship in the same release, and the Claude copies are generated from the Pi
  skill and checked by `buildClaudePlugin.ts --check` before every push.
- ai-engineer: the files the Driver authors, `index.md`, `plan.md`, and
  `test-guide.md`, are exactly the ones the absolute lines name, so the join the skill
  describes is the fallback, not the main path.

Noted, not changed: the agent's check of the `project:` row is prompt-layer behavior
nothing measures, since the eval harness has no Builder case; the walk is the
deterministic floor for what the cards print (ai-engineer).

**Second pass.** The Navigator asked the Driver to choose the personas and have them
review the plan. The Driver chose seven, the lenses that own what the change touches:
engineer (the module and its core, the message contract, the dead renderer, the
trailer move), quality-assurance (the criteria, the walk, the golden scripts),
security-engineer (half of CR082 is a leak; D1 and D2 decide leaks), ai-engineer (the
`*_path=` lines are a tool-output contract, and D1 moves them), prompt-engineer (the
two skill edits), experience-designer (the rows and their order), and product-designer
(D3's shape, and whether the row serves the Navigator); and left out
database-architect (nothing stored changes) and devops-engineer (no migration, no CI
topology change; the `/tmp` root is the one `commands.test.ts` already uses). Four
facts were checked first: `displayPath` prints `.` for the project root and the
preflight's relativizer refuses it, so the two already disagree on one input; the
coherence card renders `--project` under a `project alignment` label, which the route's
`project:` grep cannot match; the one recorded `builder-command` stderr naming a
project path is already project-relative; and `build show` prints the records folder
project-relative and no `*_path=` line. Synthesis: the first pass fixed where the plan
left the leak; the second found where the plan said two things were the same without
checking, where its own test would trip on a card it excludes, and where it left the
Navigator a menu instead of a recommendation. All folded above:

- **The core's answer for the project root** (engineer): "relative to the project or
  none" hid that `displayPath` prints `.` there and the preflight refuses. The core
  returns the relation, empty for the root and none outside, and each caller keeps its
  reading; criterion 9 names the root.
- **The exclusions named one unreachable refusal and not the other** (engineer,
  security-engineer): the preflight's `roadmap file <path> is not inside the project
  at <root>` prints two absolute paths. Listed with the confinement guard, for the
  same reason.
- **The walk's `/`-row check would trip on `build load`'s own card** (quality-assurance):
  the Builder Mode card prints the root on a row that starts with `/`, by design. The
  check applies inside marked surfaces.
- **The join is the main path on resume, not the fallback** (ai-engineer): a Plan
  checkpoint spans sessions, as US3's has since 2026-09-30, and the session that
  resumes it gets `build show`, with the records folder project-relative and no
  `*_path=` line. The first pass's note said the opposite; it stands corrected, and
  it is why the paragraph sits in the section every Ariad session reads.
- **"Open those as printed" says use, not do not paste** (prompt-engineer): four
  `key=value` lines right under an end marker the agent was told to copy verbatim
  invite copying. The paragraph says they are not part of the surface, names where
  `project_path` comes from, and reads "other than" where it read "another ... than".
- **Two checkouts of one repository share a folder name** (security-engineer): D2's
  row cannot tell `~/a/mirror` from `~/b/mirror`; the slug on the row and the root on
  `build load` can. Recorded as D2's limit.
- **"Take now or have captured" is a menu** (product-designer): the floor's own rule
  is that a change found while working it is captured. D6 proposes the capture, as
  CR118, outside the floor.

Silent in the second pass: experience-designer. The `project: · journey:` pair has a
precedent, the Workbench view's `Driver: · Delivery:` row, and the template report's
`project` block sits between `journey` and `method`, the two "where" values together.

## Evidence

### As captured

The capture's evidence named Python files that TS5 deleted; they are readable at the
recovery tag `cv22-last-python-bearing` (`b0d34254`).

- `src/memory/builder/lifecycle.py` — `render_plan_checkpoint`,
  `render_expand_report`, `render_expand_blocked`, against
  `src/memory/builder/artifact_surfaces.py`'s `_display_path`.
- `ts/parity/builder_surface_paths.py` — the compensating rule written for the
  US8 plateau-3 corpus: collapse a wrapped absolute run to one token row,
  substitute untruncated trailer lines and refusal messages. Its module
  docstring records what stays graded and why that is currently enough. Its
  TypeScript twin, `ts/test/helpers/builderSurfacePaths.ts`, outlived it.
- `ts/test/goldens/builder-command.golden.json`, case `plan_item_after_prepare`
  — the two forms side by side in one recorded invocation.
- The US8 story plan's Debt / CRs section carries the same finding as the
  plateau-3 entry.

### The route before the change

At `7e1fbd17`, identical across runs, and in bash and zsh:

```text
--- 0. build load names the project root, for the agent
  absolute: outside any surface×2
--- 1. templates prepared
  absolute: none
  project: (none)
  journey: alpha
--- 2. a User Story pulled
  answer: <<<ARIAD:ITEM_ACTIVATED>>> <<<ARIAD:PREPARE_FIELD_READING>>>
  absolute: none
--- 3. planned
  answer: <<<ARIAD:PLAN_CHECKPOINT>>> <<<ARIAD:ARTIFACTS_MATERIALIZED>>>
  absolute: PLAN_CHECKPOINT×5
  story package: <root>/docs/project/roadmap/cv1/ds1/cv1-ds1-us1-enter-an-address
  trailer: plan_artifact_path=<root>/docs/project/roadmap/cv1/ds1/cv1-ds1-us1-enter-an-address/plan.md
  target: (none)
--- 4. validated
  answer: <<<ARIAD:VALIDATION_CHECKPOINT>>> <<<ARIAD:DEBT_REVIEW_STARTED>>>
  absolute: VALIDATION_CHECKPOINT×1
  validation artifact: <root>/docs/project/roadmap/cv1/ds1/cv1-ds1-us1-enter-an-address/validation.md
  target: (none)
--- 5. debt reviewed
  absolute: DEBT_REVIEW_CHECKPOINT×1
  review artifact: <root>/docs/project/roadmap/cv1/ds1/cv1-ds1-us1-enter-an-address/review.md
  target: (none)
--- 6. coherent
  absolute: COHERENCE_CHECKPOINT×1
  coherence artifact: <root>/docs/project/roadmap/cv1/ds1/cv1-ds1-us1-enter-an-address/coherence.md
  target: (none)
--- 7. done
  absolute: DONE_CHECKPOINT×1
  done artifact: <root>/docs/project/roadmap/cv1/ds1/cv1-ds1-us1-enter-an-address/done.md
  target: (none)
--- 8. the Delivery Story pulled: Expand finds US1 and writes TS1
  answer: <<<ARIAD:DELIVERY_STORY_READY>>> <<<ARIAD:ARTIFACTS_MATERIALIZED>>>
  absolute: none
  target: (none)
--- 9. Delivery Story planned
  answer: <<<ARIAD:DELIVERY_STORY_PLAN_CHECKPOINT>>> <<<ARIAD:ARTIFACTS_MATERIALIZED>>>
  absolute: none
  target: (none)
--- 10. Expand blocked: the table has no Code, Story, Type, and Status
  answer: <<<ARIAD:EXPAND_BLOCKED>>>
  absolute: EXPAND_BLOCKED×1
  why blocked: authored package at <root>/docs/project/roadmap/cv1/ds2 has no canonical candidate-stories table (a Markdown table header must include Code, Story, Type, and Status columns); refusing to fabricate a generic story
--- 11. Expand blocked: another package claims the story it would invent
  absolute: EXPAND_BLOCKED×1
  why blocked: CV1.DS3 has no package, and an authored package already claims CV1.DS3.US1 at <root>/docs/project/roadmap/cv1/claim; refusing to invent a story over it
--- 12. Expand blocked: two packages claim the Delivery Story
  absolute: EXPAND_BLOCKED×2
  why blocked: 2 roadmap packages claim code 'CV1.DS4': <root>/docs/project/roadmap/cv1/dup-a, <root>/docs/project/roadmap/cv1/dup-b
--- 13. the same double claim, met by Plan
  answer: Error: 2 roadmap packages claim code 'CV1.DS4': <root>/docs/project/roadmap/cv1/dup-a, <root>/docs/project/roadmap/cv1/dup-b
  absolute: outside any surface×1
```

Step 3's five are the package row's first chunk and the four `*_path=` lines. On the
cards themselves the root sits inside a 54-column chunk: the package row is
`/private/tmp/cr082.XXXXXX/storefront/docs/project/road` and `map/cv1/ds1/…` beneath
it, on macOS, where `journey set-path` stores `/tmp` resolved. No row anywhere names
`storefront` or `alpha` as such.

### Plateau 1 handoff (2026-10-01)

Now true: no marked surface prints an absolute path inside the project. `projectPaths.ts`
holds the core, `projectRelative`, and `displayPath`, which moved there from the
artifacts surface; every card row that prints a path goes through it. Plan's `story
package` row and the four closure records name their path relative to the project, and
the Plan and closure reports carry the root they were written under. Expand's two
refusals and the double claim's message name their packages that way where they are
raised, so `EXPAND_BLOCKED` and the `Error:` line Plan prints read the same words. Plan's
four `*_path=` lines, still absolute, follow `<<<END:PLAN_CHECKPOINT>>>`.
`renderExpandReport` is gone. The Delivery Story Done preflight reads the core and
refuses as it did. The skill's Plan line names the plan project-relative; the Claude
copies were regenerated. Route steps 0 and 2 to 13 meet their pass conditions for
paths. Step 1's project block and every `target:` line are plateau 2's.

Two test files hold the change. `projectPaths.test.ts` grades the core, `displayPath`
at the root and outside the project, and the preflight's refusals of both, through the
exported `relativeOrRefuse`. `pathsWalk.test.ts` runs, through the front door, a story's
lifecycle, a Delivery Story's through its four closures, Expand's three refusals, and
Plan meeting a double claim, in a project under `/tmp/builder-world-*`. It fails on the
root inside any marked surface, on a card row there that opens a path at `/`, and on the
root outside a surface anywhere but the four lines, which it requires right after the
end marker, absolute and in order. Red first: before the change it failed at Plan, at
the first refusal, and on the `Error:` line, and the Delivery Story walk passed, as
characterized. `builderSurfacePaths.ts` left: the command comparison substitutes the
scratch root in the four lines and nowhere else, and errors and `stderr` are compared as
printed. CR018's double-claim test now expects the exact relative message.

What the work found:

- **A third golden held the message.** `builder-roadmap` recorded the double claim with
  the fixture root redacted to `<FIXTURES>`. The plan's census read the command and
  lifecycle corpora only. Its one message is edited with the rest and listed in the
  README as the plan's one deviation from criterion 7.
- **The walk's `/` check, as planned, would have failed on a correct card.** The
  lifecycle corpus's own test had recorded why a plain "no row starts with `/`" was
  removed: a long project-relative path can be cut right before a slash. The walk
  exempts a row that continues a full 54-column chunk, so it still catches an absolute
  path that opens a row.
- **The route's joiner read a full row of words as a chunk.** Step 10's reason wraps to
  a row of exactly 54 columns, and the route printed `tableheader`. A chunk of a long
  word has no space in it, so the joiner now requires that too. The corrected route
  reproduces the recorded "before" output byte for byte at `7e1fbd17`, run in a
  worktree, in bash and zsh.
- **The recorded transport test learned Plan's four lines.** It required every surface's
  text to end at its end marker; Plan's now continues with exactly the four lines.
- **Two stale notes in the lifecycle replay** named the deleted Python helper and a
  determinism gate the generators took with them; they now say what holds the line.

The recorded rows were edited by script, under criterion 7, and listed in
`ts/test/goldens/README.md`: in `builder-command`, 3 package rows, 10 record rows, and 1
reason, and the 3 Plan renders' lines moved; in `builder-lifecycle`, 15 package rows and
48 record rows, the 15 Plan renders' lines moved, 2 reasons, and the 15
`EXPAND_DECISION` renders removed, with the 4 `not materialized` checkpoints unchanged;
and `builder-roadmap`'s 1 message. 2932 tests pass, 8 of them new. Typecheck, lint, the
repository checks, the migration proofs, and every smoke are green.

Next: plateau 2, the target named.

## Outcome

_Pending._

## Provenance

Found on 2026-09-13 while building the CV22.DS7.US8 plateau-3 oracle, by trying
to record those surfaces in a machine-independent golden and discovering that
token redaction cannot survive a truncating renderer. Captured at the
Navigator's request during the same plateau, deliberately without fixing it:
reproducing the behavior is parity work, changing it is a Navigator-facing
product change that belongs after the flip.
