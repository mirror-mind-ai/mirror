[< RS001](index.md) · [Canonical status](../index.md#change-requests)

# CR111 — The Plan checkpoint renders template sentences as the plan

## Problem

### As captured (2026-09-30)

`build plan-item` renders `PLAN_CHECKPOINT` with `plan`, `scope`, `non-goals`,
`acceptance`, `validation`, and `implementation contract` fields, each line marked `✓`.
None of them comes from a plan. `roadmapPlanContext` (`ts/src/builder/commands.ts:741`)
composes them from fixed sentences with the item's title pasted in:

```text
plan        Plan the smallest coherent, testable slice for npm distribution.
scope       ✓ Deliver npm distribution as an observable slice.
acceptance  ✓ Given the starting state needed for npm distribution
            ✓ When the Navigator exercises npm distribution
            ✓ Then the planned observable behavior is visible
```

`planLifecycleItem` (`ts/src/builder/plan.ts`, the `report` it builds) carries a second
set of defaults for the same fields, used when the command passes none. The only field a caller can set is
`--objective` (`ts/src/builder/argv.ts:188`). Nothing reads `plan.md`: not at Plan, and
not later, since `build show` reports the file present or missing and never its content.

So the surface cannot show a real plan, even after the Driver has written one. Ariad's
design is scaffold-then-author: Plan writes `plan.md` where no file exists and the Driver
authors it ([REFERENCE — Builder lifecycle artifacts](../../../../REFERENCE.md#builder-lifecycle-artifacts)).
The card, however, presents the scaffold's sentences as scope and acceptance, checked
off. The Builder skill's transport rule then puts that card in front of the Navigator
verbatim, above whatever the Driver wrote. At the one gate where the Navigator approves a
plan, the surface looks like a plan and is not one.

[CR019](cr019-plan-checkpoint-states-untruths-about-the-target-project.md) removed two
untruths from this card, the parent listed as a sibling and two Mirror-only contract
lines. These survived because the words are literally in the scaffold the command wrote.

### As characterized (2026-09-30)

Reproduced at `8eca2782`, after CR112, in a scratch home with the
[validation route](#validation-route); its output is under
[Evidence](#the-route-before-the-change). CR112 changed what the capture says about
reading: `build show` and the artifacts card now read the files and name each one's
state. The Plan checkpoint still does not, and the characterization found three things
the capture did not know:

**The card contradicts the card printed under it.** When the Driver wrote `plan.md`
before `plan-item` (route step 3), Plan preserves the file and the artifacts card says
`↻ existing plan — authored`. The Plan checkpoint above it, in the same command's
output, prints the scaffold's scope and acceptance, checked off, for a file that holds
none of them. Before CR112 the card was only unverified. Now it is contradicted on the
same screen.

**`--objective` makes one row true and leaves the rest.** With `--objective` (step 4)
the `plan` row prints the caller's sentence, which Plan also writes into `plan.md`. The
scope, acceptance, and validation rows stay the scaffold's.

**`build show` can say `authored` over an approval that refuses.** CR112's plateau 3
made ordinary approval require Non-Goals and Implementation Contract to be non-empty, as
the preauthorized route always had: one rule for both routes. `build show` judges only
the four placeholder sections. A `plan.md` with those four authored and the other two
removed (step 6) reads `✓ plan.md — authored`, and `approve-plan` refuses it:
`Still to author … Non-Goals, Implementation Contract`. This is the disagreement CR112's
own fail condition named, reached through the one departure its handoff recorded. A
Plan checkpoint that printed CR112's state would inherit it.

The capture's second vocabulary is confirmed as well. `LIBRARY_PLAN`, the defaults
`planLifecycleItem` writes when a caller passes no sections, is reached by no product
path. All 21 recorded Plan steps in the lifecycle corpus pass empty sections, so every
scaffold the corpus records is the library's, and the corpus grades a scaffold no user
receives. CR112 kept it so that no recorded
byte moved, and handed its retirement here.

## Expected Behavior

The Plan checkpoint states what the runtime knows. When the command wrote a scaffold, the
card says so and names the sections the Driver must author — Scope, Non-Goals,
Acceptance Behavior, Validation Route, Implementation Contract — with no `✓` beside text
nobody has written. When `plan.md` already exists and is authored (see
[CR112](cr112-a-scaffold-cannot-be-told-from-authored-content-and-approve-plan-never-reads-the-plan.md)),
the card says that instead, and names the file as where the plan is read. The two sets
of default sentences collapse into one, or into none: a scaffold's section guidance is
one string per section, printed once, in the file.

The sections named above predate CR112's section kinds. As planned, the card names
exactly what approval requires, the sections CR112 calls placeholders and any required
section that is missing or empty. See the design, D4.

## Impact

Wrong at the decision point, the trust floor's second class. A Navigator who reads the
card rather than the file can approve a plan that consists of the item's title in five
template sentences. Ordinary `approve-plan` would accept it (CR112). The card is also
what the Driver transports verbatim in every Plan turn, so the untruth is repeated on
every story.

## Plan Or Decision

**Approved 2026-09-30** by the Navigator, with D1–D5 as recorded below; Driver and
Delivery assigned the same day.

On the Ariad trust floor by the Navigator's decision of 2026-09-30
([Decisions](../../decisions.md#the-cv22-release-is-gated-on-an-ariad-trust-floor-worked-before-us3)).
Second in floor order, after CR112, whose scaffold-or-authored answer this card prints.

### Objective

The Plan checkpoint prints what the runtime knows and nothing that stands in for the
plan. In place of the scaffold's sentences it prints the Plan-stage files, each with its
state and the sections it still needs, in the lines `build show` prints. Its next action
says where the plan is read. `build show`, the Plan checkpoint, and both approval routes
give one answer to what a `plan.md` still needs. One Plan scaffold vocabulary remains.
No scaffold byte the product writes changes.

### Design

**The card prints no section of the plan.** The `plan`, `scope`, `non-goals`,
`acceptance`, and `validation` blocks leave, the last with its `E2E:` line. Each holds
the scaffold's section text or, for a file that existed before Plan, text the file does
not hold. These stay unchanged: item, level, story package, granularity, the
implementation contract, the approval gate, the boundary, and the machine-readable
trailer. The implementation contract stays because its lines are Ariad's method rules
and the project's own rules, true whatever the plan says (CR019).

**The artifacts block becomes the story files block.** Today three rows print each
file's absolute path under `artifacts`. They become `story files`: each file with its
state and, while it is not authored, the sections still to write. These are the lines
`build show` prints under `records`, from the same renderer. The package row above
already names the folder, and the trailer keeps each file's full path for the agent.
The package row and the trailer stay absolute until CR082. After the change, route step
1 reads:

```text
│ story package                                          │
│ <package path, as today>                               │
│                                                        │
│ story files                                            │
│ ○ index.md — scaffold                                  │
│   to author: User Story, Outcome, Acceptance Behavior  │
│ ○ plan.md — scaffold                                   │
│   to author: Objective, Scope, Acceptance Behavior,    │
│              Validation Route                          │
│ ○ test-guide.md — scaffold                             │
│   to author: Automated Validation,                     │
│              Navigator Validation                      │
│                                                        │
│ granularity                                            │
│ user_story is implementable by default.                │
│                                                        │
│ implementation contract                                │
│ TDD/characterization tests when behavior is testable.  │
│ Keep changes scoped to the active story.               │
│ Do not use git add .; commit only story-scoped files.  │
│                                                        │
│ approval gate                                          │
│ checkpoint: after_plan                                 │
│ pending: navigator_approval                            │
│                                                        │
│ next action                                            │
│ Driver authors plan.md and presents it; the Navigator  │
│ approves it or requests changes.                       │
│                                                        │
│ boundary                                               │
│ Implementation remains blocked until approval.         │
```

**One judgment, made once, where the files are written.** `planLifecycleItem` judges
the three files right after `writeStoryPackage` and carries the verdicts on its report,
`null` when the journey has no project. The renderer only formats them. The command and
the recorded corpus both call `planLifecycleItem` and `renderPlanCheckpoint`, so they
cannot print different cards. That was CR112's plateau 2 lesson: the harness had its own
copy of `planPackageArtifacts`. The state-line renderer and `PLAN_STAGE_ARTIFACTS` move
out of `activeCheckpoint.ts` into the artifacts layer, and both surfaces import them
from there. The Plan card does not import from `build show`'s module.

**The next action follows the file and the route.** The card's words match the skill's
sequence, and none of them makes the structural check the goal:

| Route | `plan.md` | Next action |
|---|---|---|
| ordinary | not authored | Driver authors plan.md and presents it; the Navigator approves it or requests changes. |
| ordinary | authored | Navigator reads plan.md and approves it or requests changes. |
| preauthorized | not authored | Driver authors plan.md, then consumes bounded authority. |
| preauthorized | authored | Driver consumes bounded authority. |
| either | no project | as today: nothing was written, so there is no file to name |

The boundary lines are unchanged. With no project, the story files block reads
`not written: the journey has no project path`.

**One answer to what `plan.md` still needs (D4).** `judgeArtifact` for `plan.md` names
every section in `PLAN_APPROVAL_SECTIONS` that approval would refuse. These are the
placeholder sections not yet authored and the required default sections that are
missing or empty. Approval reads the same function, and `unauthoredPlanSectionsFor`
becomes a caller of it rather than a parallel rule. Two populations, judged apart
(engineer, second pass): the **word** is derived from the placeholder sections alone,
as today; the **list** is the placeholder sections not authored plus the required
default sections that are missing or unfilled. Counting the defaults into the word would
read an untouched scaffold, four `scaffold` and two filled defaults, as `partly
authored`. The state word keeps its meaning:

- `authored` only when nothing is left to write;
- `partly authored` when some placeholder section is authored;
- `scaffold` when none is and one still holds the scaffold's text;
- `incomplete` otherwise.

An untouched scaffold still reads `scaffold`, because its default sections are filled.
The sizing ran at plan time. Of the 14 distinct `plan.md` texts the goldens record, D4
lengthens the list for 7, three of them Delivery Story plans that no story surface
judges. It changes no recorded state word: all seven already read `incomplete` or
`partly authored`. No recorded surface prints the lists it lengthens, and the recorded
refusals already use the approval list. US3's real 569-line plan reads `authored`
before and after.

**One Plan vocabulary (D3).** `planLifecycleItem` composes the scaffold itself from
`PRODUCT_PLAN`. It fills `{title}` with the title the caller passes, else by D5. It
takes the Non-Goals from the sibling titles the caller passes, else the fallback line. `roadmapPlanContext` shrinks to the two roadmap facts only it can
read, the item's title and its siblings. `LIBRARY_PLAN` is deleted, and `PLAN_SECTIONS`
recognizes one vocabulary. `PlanOptions` loses `scope`, `nonGoals`,
`acceptanceBehavior`, `validationRoute`, and `e2eDecision`. The product passed only its
own vocabulary through them, and the corpus passed them empty. `objective` stays, for
`--objective`. The report stops carrying section text that no reader uses. The corpus
harness asserts that the recorded inputs it no longer passes are empty, so a future
golden cannot carry section text that is silently ignored.

**The title's fallback (D5).** The front door fills `{title}` with the roadmap's title
for the item, else the item's code, although the cursor holds the title Pull recorded
(`activeItemTitle`). That rule was about the roadmap not listing the item; it was never
a decision to ignore the cursor. The recommended order is the caller's title, else the
cursor's title, else the code. It changes the product's bytes in one case only: an item
the roadmap does not list, where today the scaffold says `Deliver CV1.DS1.US1 as an
observable slice.` while the runtime knows the title. Criterion 7 is scoped to items
the roadmap lists, which is every recorded and route case. In the corpus, whose
projects hold no roadmap, the scaffold then names `Checkout Flow` rather than
`CHECKOUT-FLOW`.

In the corpus, each Plan step now writes the product scaffold where it wrote the
library's. Every snapshot of `plan.md`, of an `index.md` Plan wrote, and of
`test-guide.md` changes by line substitution: each library sentence becomes the product
sentence filled with that step's item code. A script makes the substitutions with
counts asserted per sequence, as the goldens README requires. After it, the corpus
grades the scaffold users receive. Today only three `builder-command` cases do.

**The skill says what the card is.** In `mm-build/SKILL.md`'s Plan section, the
paragraph "Render the Plan Checkpoint visibly … must show the actual plan content …:
scope, non-goals, acceptance behavior, validation route, E2E decision" predates CR112.
It now contradicts the sequence below it: right after `plan-item` there is no plan
content, only the scaffold. It becomes a statement that the card reports the story
files and what to author, that the plan is read in `plan.md`, and that the plan is
presented after authoring, by the sequence below. Two steps of that sequence become
instructions (prompt-engineer, second pass), because D1 rests on them: step 3, run
`build show` and return its `ACTIVE_CHECKPOINT`, which must read `✓ plan.md —
authored`; step 4, present the plan from `plan.md`, section by section, not
paraphrased. Nothing else is added. The Claude copies regenerate from the Pi source (CR102). REFERENCE's
Builder lifecycle artifacts gains two statements: the Plan checkpoint names the same
states as `build show`, and both name what approval requires.

### Decisions this plan asks the Navigator to take

1. **D1 — No digest of the authored plan, on the card or in `build show`.** Both print
   states and the sections to write, never each section's first line or line count.
   The runtime reads structure and the Navigator reads plans (CR112). A digest is a
   lossy copy of the plan on the one surface that must not look like one: the same
   failure, smaller. The first line of a 569-line plan says nothing true about it, and
   a line count invites the one-line-per-section pass the skill warns against. The
   approval surface is `build show` reading `✓ plan.md — authored`, transported
   verbatim, with the Driver's presentation of the file. This answers the question
   CR112's product-designer finding forwarded here. Alternatives: (b) per-section line
   counts; (c) the first line of each placeholder section.
2. **D2 — The non-goals leave the card with the rest of the plan.** The sibling list is
   the scaffold's Non-Goals text. After authoring, the file's Non-Goals may differ: in
   step 3 the card lists siblings and the file says "Autocomplete". The rule that holds
   whatever the plan says, keep changes scoped to the active story, is already in the
   card's contract, and the siblings stay in `plan.md`, where CR019 made them true.
   Alternative: keep them, relabeled as roadmap facts rather than the plan's non-goals.
3. **D3 — The library vocabulary is retired, and the corpus records the product
   scaffold**, by scripted substitution with counts. Alternative: keep both
   vocabularies as a recorded known duplicate, which leaves the corpus grading a
   scaffold no user receives.
4. **D4 — The disagreement between `build show` and approval is fixed inside CR111**,
   because otherwise the card this change builds would print `authored` above an
   approval that refuses. This is the floor's own class at CR111's own gate, as with
   the defects CR018 and CR104 fixed. Alternative: capture it as a new CR outside the
   floor, and ship a card that repeats it.
5. **D5 — The scaffold's title falls back to the cursor's title before the item's
   code.** One product byte changes, for an item the roadmap does not list, from the
   code to the title the runtime already holds. Alternative: keep the code fallback,
   which keeps criterion 7 absolute and writes a code where a title is known.

Approving the plan approves these five as recorded; amendments re-open it.

### Affected files

- `ts/src/builder/plan.ts`: the card; the report carries the story-file verdicts and
  drops unused section text; the scaffold is composed from `PRODUCT_PLAN`; the options
  shrink.
- `ts/src/builder/commands.ts`: `roadmapPlanContext` returns the roadmap facts, and
  `runPlanItem` passes them.
- `ts/src/builder/artifacts/scaffoldSections.ts`: `LIBRARY_PLAN` is deleted.
- `ts/src/builder/artifacts/scaffoldState.ts`: `plan.md`'s list is the approval list
  (D4), and `unauthoredPlanSectionsFor` reads it.
- A new module in `ts/src/builder/artifacts/` holding the story-file state lines and
  `PLAN_STAGE_ARTIFACTS`; `activeCheckpoint.ts` imports it.
- `ts/test/builder/*`: tests. `ts/test/goldens/builder-lifecycle.golden.json`,
  `builder-command.golden.json`, and `README.md`: the scripted edits.
- `.pi/skills/mm-build/SKILL.md` and its generated Claude copies, and `REFERENCE.md`.

### Plateaus

Each closes with a commit, a push, and a green CI run that finishes before the next
plateau begins (CR112's plateau 1 lesson).

0. **Characterize and count.** The route before the change, recorded below. Counted per
   sequence: the 18 recorded Plan cards (15 in `builder-lifecycle`, 3 in
   `builder-command`), the library sentences in file snapshots, and the verdicts D4
   changes. The last is already done: no recorded state word changes. No behavior
   change.
1. **One answer, one line renderer.** D4. The shared state lines move to the artifacts
   layer. `build show` and both approval routes read one function. Tests. The card is
   unchanged.
2. **The card.** The renderer, the report's verdicts, and the next action. The 18
   recorded cards are edited by script under criterion 8's contract. Each new `story
   files` row is computed by running the product's reader, `judgeArtifact`, on the
   file bytes the step records, and the next-action row from the step's recorded
   input and that verdict; never by reading a run back (quality-assurance, second
   pass).
3. **One vocabulary.** D3. The library is retired, and the corpus file snapshots are
   edited by script with asserted counts.
4. **Words, validation, and handoff.** The skill and REFERENCE. The route after the
   change, the Navigator's walk, the handoff review, and the ledger.

### Acceptance criteria

1. The card prints no placeholder sentence. On every recorded and route-generated
   card, no line that `PLAN_SECTIONS` declares for a placeholder section, filled with
   the item's title, appears, and there is no `plan`, `scope`, `non-goals`,
   `acceptance`, or `validation` block. A test derives the sentences from the model,
   not from a hand list.
2. The card's `story files` rows are byte-identical to the `index.md`, `plan.md`, and
   `test-guide.md` rows `build show` prints for the same package at the same moment,
   in every state the route visits: scaffold, authored, and partly authored (steps 2,
   3, and 4), and a unit test on the shared renderer.
3. The card says each file's state:
   - an untouched scaffold reads `○ plan.md — scaffold`, with Objective, Scope,
     Acceptance Behavior, and Validation Route to author;
   - a plan authored before Plan reads `✓ plan.md — authored`, agreeing with the
     artifacts card's `↻ existing plan — authored` beneath it;
   - `--objective` reads `○ plan.md — partly authored`, without Objective in the list;
   - a journey with no project reads `not written`.
4. The next action follows the file and the route: the table's five cases are each
   pinned by a test, and the route shows three of them (steps 1, 3, and 5).
5. For any `plan.md`, `build show`, the Plan card, ordinary approval, and the
   preauthorized mismatch name the same sections in the same order (D4). With
   Non-Goals and Implementation Contract removed (step 6), `build show` reads
   `○ plan.md — partly authored` naming both, and approval refuses naming both. An
   untouched scaffold still reads `scaffold`.
6. One Plan vocabulary (D3). `LIBRARY_PLAN` is gone, and no library sentence remains in
   `ts/src`. `PlanOptions` takes no section text. Every scaffold the corpus records
   after a Plan step is the product's.
7. No scaffold byte the product writes for an item the roadmap lists changes. The
   `builder-command` goldens' materialized `index.md`, `plan.md`, and `test-guide.md`
   pass without edits, and route step 1's `plan.md` digest stays `dc4b78f3…`. The one
   byte D5 changes, for an item the roadmap does not list, is pinned by a test of its
   own.
8. The golden diff is a contract:
   - in the 18 recorded cards, only the five removed blocks, the `artifacts` rows (now
     `story files`), and the next-action rows change, and every other row is
     byte-identical;
   - in the corpus files, only library-to-product line substitutions change;
   - every edit is listed in `ts/test/goldens/README.md` with its reason and its count.
9. The skill no longer asks for plan content from the Plan checkpoint, tells the
   Driver to run `build show` and return its block before presenting, and to present
   from the file. The Claude copies are regenerated, and their guard is green.

### Validation route

CLI only, in a scratch home, with no Pi session (CR106). Its output before the change is
recorded under [Evidence](#the-route-before-the-change). Run it from the repository root
as a script, with `bash <file>`, so that no interactive alias applies. It deletes its
temporary directory:

```bash
V=$(mktemp -d) && mkdir -p "$V/home" && export MIRROR_HOME="$V/home" MIRROR_USER= NODE_OPTIONS=--no-warnings
cr111() { node ts/src/frontDoor/cli.ts "$@"; }
R="$V/p/docs/project/roadmap" && mkdir -p "$R/cv1/ds1" && printf '# Roadmap\n' > "$R/index.md"
printf '# CV1 — Checkout\n\n**Status:** 🟢 Active\n' > "$R/cv1/index.md"
printf '# CV1.DS1 — Checkout address\n\n**Status:** 🟡 Planned\n**Type:** Delivery Story\n\n## Candidate Stories\n\n| Code | Story | Type | Status |\n|------|-------|------|--------|\n| CV1.DS1.US1 | Enter an address | User Story | 🟡 Planned |\n| CV1.DS1.TS1 | Validate the address | Technical Story | 🟡 Planned |\n| CV1.DS1.US2 | Show the address | User Story | 🟡 Planned |\n| CV1.DS1.US3 | Edit the address | User Story | 🟡 Planned |\n' > "$R/cv1/ds1/index.md"
git -C "$V/p" init -q && printf '# j\n' | cr111 identity set journey j > /dev/null && cr111 journey set-path j "$V/p" > /dev/null 2>&1
cr111 build adopt --journey j --method ariad > /dev/null && cr111 build sync-cursor --journey j --method ariad > /dev/null
cr111 build set-cadence --journey j --method ariad --profile checkpoint > /dev/null
cr111 build pull-item --journey j --method ariad --item-code CV1.DS1 --item-level delivery_story --item-title 'Checkout address' --why-now now > /dev/null 2>&1
pull() { cr111 build pull-item --journey j --method ariad --item-code "$1" --item-level "$2" --item-title "$3" --why-now now > /dev/null 2>&1; }
pkg() { find "$R/cv1/ds1" -mindepth 1 -maxdepth 1 -type d -name "*$1*"; }
answer() { grep -o '<<<ARIAD:[A-Z_]*>>>\|^Error: .*' | paste -sd ' ' - | sed 's/^/  answer: /'; }
rows() { sed -n "/│ $1 /,/│ $2 /p" | sed '$d' | sed 's/│//g; s/ *$//'; }
card() { sed -n '/<<<ARIAD:PLAN_CHECKPOINT>>>/,/<<<END:PLAN_CHECKPOINT>>>/p'; }
view() { echo '  [story files]'; rows 'story files' granularity < "$1"; echo '  [granularity .. approval gate]'; rows granularity 'approval gate' < "$1"; echo '  [next action]'; rows 'next action' boundary < "$1"; }
sentences() { printf '  placeholder sentences on the card: %s\n' "$(grep -c 'as an observable slice\|Given the starting state needed for\|Plan the smallest coherent\|Run automated tests that cover' "$1")"; }
records() { cr111 build show --journey j --method ariad | sed -n '/│ records/,/│ boundary/p' | sed '1d;$d' | sed 's/│//g; s/ *$//'; }
agree() { rows 'story files' granularity < "$1" | sed '1d;$d' > "$V/card-files.txt"; records | sed -n '/index.md/,/validation.md/p' | sed '$d' > "$V/show-files.txt"; if [ -s "$V/card-files.txt" ] && diff -q "$V/card-files.txt" "$V/show-files.txt" > /dev/null; then echo '  card and build show: identical'; else echo '  card and build show: differ'; diff "$V/card-files.txt" "$V/show-files.txt" | sed 's/^/    /'; fi; }
echo '--- step 1: plan-item writes the scaffold'
pull CV1.DS1.US1 user_story 'Enter an address'
cr111 build plan-item --journey j --method ariad 2>&1 | card > "$V/c1.txt"; view "$V/c1.txt"; sentences "$V/c1.txt"
echo '  plan.md digest:' "$(md5 -q "$(pkg us1)/plan.md" 2>/dev/null || md5sum "$(pkg us1)/plan.md" | cut -c1-32)"
echo '--- step 2: the card and build show say the same of the three files'
agree "$V/c1.txt"
echo '--- step 3: a plan.md authored before plan-item'
pull CV1.DS1.TS1 technical_story 'Validate the address'
TS1="$(pkg ts1)"
printf '# Plan\n\n## Objective\n\nReject a malformed postcode.\n\n## Scope\n\n- Postcode format.\n\n## Non-Goals\n\n- Autocomplete.\n\n## Acceptance Behavior\n\nGiven ABC, the form refuses it.\n\n## Validation Route\n\n- Enter ABC; expect the refusal.\n\n## Implementation Contract\n\n- TDD.\n' > "$TS1/plan.md"
cr111 build plan-item --journey j --method ariad 2>&1 > "$V/o3.txt"; card < "$V/o3.txt" > "$V/c3.txt"; view "$V/c3.txt"; sentences "$V/c3.txt"
echo '  the artifacts card below it:'; grep '↻ existing plan' "$V/o3.txt" | sed 's/│//g; s/ *$//'
agree "$V/c3.txt"
echo '--- step 4: plan-item --objective'
pull CV1.DS1.US2 user_story 'Show the address'
cr111 build plan-item --journey j --method ariad --objective 'Show the saved address on the confirmation page.' 2>&1 | card > "$V/c4.txt"; view "$V/c4.txt"; sentences "$V/c4.txt"
echo '  plan.md Objective:' "$(sed -n '/^## Objective/,/^## Scope/p' "$(pkg us2)/plan.md" | sed -n 3p)"
agree "$V/c4.txt"
echo '--- step 5: the preauthorized route'
pull CV1.DS1.US3 user_story 'Edit the address'
cr111 build plan-item --journey j --method ariad --preauthorize-approval --stop-after navigator_validation 2>&1 > "$V/o5.txt"; answer < "$V/o5.txt"; card < "$V/o5.txt" > "$V/c5.txt"
echo '  [next action]'; rows 'next action' boundary < "$V/c5.txt"
echo '--- step 6: the four placeholder sections authored, Non-Goals and Implementation Contract removed'
US3="$(pkg us3)"
printf '# Plan\n\n## Objective\n\nLet the buyer edit the address.\n\n## Scope\n\n- The edit form.\n\n## Acceptance Behavior\n\nGiven a saved address, the buyer changes it.\n\n## Validation Route\n\n- Edit it; expect the new address.\n' > "$US3/plan.md"
records | sed -n '/plan.md/,/test-guide.md/p' | sed '$d'
cr111 build approve-plan --journey j --method ariad 2>&1 > "$V/o6.txt"; answer < "$V/o6.txt"
rows reason cursor < "$V/o6.txt"
unset MIRROR_HOME MIRROR_USER; rm -rf "$V"
```

Pass, after the change:

- Step 1: `[story files]` holds the three files, with `○ plan.md — scaffold` and its
  four sections to author. `[granularity .. approval gate]` holds only the granularity
  and the implementation contract. The next action reads "Driver authors plan.md and
  presents it; the Navigator approves it or requests changes." The card holds 0
  placeholder sentences, and the digest is unchanged.
- Step 2: `card and build show: identical`.
- Step 3: `✓ plan.md — authored` on the card, agreeing with `↻ existing plan — authored`
  beneath it. The next action reads "Navigator reads plan.md and approves it or
  requests changes." The card holds 0 placeholder sentences, and the card and `build
  show` are identical.
- Step 4: `○ plan.md — partly authored`, with Scope, Acceptance Behavior, and
  Validation Route to author. The card holds 0 placeholder sentences, the Objective is
  written to the file as before, and the card and `build show` are identical.
- Step 5: the three surfaces, as before. The next action reads "Driver authors
  plan.md, then consumes bounded authority."
- Step 6: `○ plan.md — partly authored`, with `to author: Non-Goals, Implementation
  Contract`, and approval refuses naming the same two.

Fail: a placeholder sentence on the card; any disagreement between the card,
`build show`, and a refusal; or a product scaffold byte that changed.

### Conscious exclusions

- Paths. The package row and the trailer stay absolute; that is CR082, with CR009.
- The ribbon's `✓ Expand` for a story pulled directly. That is CR113.
- The implementation contract's wording. The card's method lines and `plan.md`'s say
  the same rules in different words, and the method definition says them in a third.
  They are rules, true whatever the plan says, and unifying their wording is not a
  question of the card telling the truth.
- A digest of the authored plan (D1).
- The scaffold's text. The files keep what they hold. Changing the sentences would make
  every scaffold already on disk read as authored to CR112's reader.
- The card's name and place. It is still `PLAN_CHECKPOINT`, still first in the output,
  and the transport rule is unchanged.
- The Delivery Story Plan checkpoint. It was checked: it prints the objective the
  Navigator passes, which is required, and the child work packages, both of them true.

### Authority boundaries

Plan approval moves CR111 to `planned`. A human Driver and a Delivery reference are
required before `in_progress`. Proposed, as for every floor change: Driver
`@viniciusteles`, Delivery `mirror-ts-core`. `validated` requires the Navigator to walk
the route above and accept it. Each plateau is committed on the Delivery branch and
pushed when green, with GitHub Actions verified after every push. Merge, publication,
and release are not authorized.

Navigator decisions, 2026-09-30: the plan and D1–D5 approved as recorded, after the
second panel pass; Driver `@viniciusteles`, Delivery `mirror-ts-core`.

### Panel review (2026-09-30)

Two passes. The first, before the Navigator saw the plan. The baseline five were engineer,
quality-assurance, devops-engineer, security-engineer, and database-architect. The
lenses that own this change's words and shape were added: prompt-engineer (the skill),
experience-designer (the card), and product-designer (the gate). Synthesis: the change
is small in code and large in recorded bytes. Its risk is not the renderer but the
places where two answers could survive: the card beside `build show`, `build show`
beside approval, and the corpus beside the product. Every finding below closes one of
those. All are folded above:

- **The card must not reach into `build show`'s module, and the corpus must not
  compose its own card** (engineer). The state lines move to the artifacts layer, and
  the verdicts are made once in `planLifecycleItem` and carried on the report.
- **D4 as a second rule would drift like the first** (engineer). Approval reads the
  function `build show` reads. `unauthoredPlanSectionsFor` becomes its caller, not a
  sibling. A test pins that an untouched scaffold still reads `scaffold` once the
  default sections are judged.
- **No recorded card shows an authored plan** (quality-assurance). The corpus's only
  pre-existing plan is `incomplete`, so the authored card, the no-project card, and
  the next-action table are pinned by unit tests, and route step 3 walks the authored
  case end to end.
- **A card rewrite across 18 renders needs a contract, not a count** (quality-assurance).
  Criterion 8 names the rows that may change, and every other row is byte-identical.
- **The skill ships with the card, or agents present the scaffold as the plan**
  (devops-engineer). One commit carries both, with the Claude copies regenerated. The
  real US3 package was read before planning: its plan reads `authored` before and after
  D4, so the next story the floor serves is not disturbed.
- **Fix the paragraph that contradicts the sequence; do not add a third instruction**
  (prompt-engineer). One paragraph is edited. The card's words ("authors", "presents",
  "approves") are the skill's, and the card never names passing the check as the goal.
- **Two blocks naming the same three files is a scan done twice** (experience-designer).
  The path rows become the story files block, shaped like `build show`'s records, and
  the glyph carries only done or not, as there.
- **The gate's surface has moved** (product-designer). Right after `plan-item` the
  card almost always reads `scaffold`, which is true. The approval moment is `build
  show` reading `authored`, transported verbatim, with the Driver's presentation of the
  file. The card's next action says so, and the plan asks D1 rather than deciding it
  silently.

The other lenses were silent:

- security-engineer: the card prints fixed heading names and a file's state, never its
  content, and the files read are the resolved package's own, inside the project.
- database-architect: nothing persisted changes, and the cursor and the receipt keep
  their shapes.

**Second pass.** The Navigator asked which personas should review the plan and had
them do it. The Driver chose six, the lenses that own what the change touches:
engineer, quality-assurance, devops-engineer, prompt-engineer, experience-designer,
product-designer; and left out security-engineer (fixed heading names and a state,
never content; files inside the project), database-architect (nothing persisted
changes), and ai-engineer (no model in the loop; the skill's words are
prompt-engineer's). Synthesis: the shape holds, and the dissent is in what the first
pass under-specified: D4's mechanism, the route's coverage, and two instructions D1
leans on that the skill never gave. One finding was a decision made silently. All
folded above:

- **D4's obvious implementation misjudges the scaffold** (engineer): counting the
  defaults into the word reads an untouched scaffold as `partly authored`. The word is
  from the placeholder sections alone; the list adds the required defaults.
- **The title fallback was a choice made as a default** (engineer): the cursor holds
  the title Pull recorded, and the plan copied the front door's code fallback without
  saying so. Now D5, with criterion 7 scoped to items the roadmap lists.
- **Agreement proved once, in one state** (quality-assurance): the route now diffs the
  card against `build show` after steps 2, 3, and 4, one function call each; criterion
  2 names the three states.
- **The golden rows had no stated source** (quality-assurance): plateau 2 computes each
  `story files` row with the product's reader on the recorded bytes, as CR112's edits
  did, never by reading a run back.
- **D1 rests on two instructions the skill never gave** (prompt-engineer): step 3 read
  as a condition, not a command to run `build show` and return its block; "present"
  left how open, which is the failure D1 names. Both are now instructions.

Silent: devops-engineer (one commit ships the skill and the card, US3 reads `authored`
before and after, and each plateau waits for its run); experience-designer (the block
is the records block the Navigator already reads, same glyph rule and hanging indent);
product-designer (D1 and D2 as recommended; with the prompt-engineer's fold the gate's
surface is an instruction, not an assumption).

## Evidence

### The route before the change

At `8eca2782`:

```text
--- step 1: plan-item writes the scaffold
  [story files]
  [granularity .. approval gate]
 granularity
 user_story is implementable by default.

 plan
 Plan the smallest coherent, testable slice for Enter
 an address.

 scope
 ✓ Deliver Enter an address as an observable slice.
 ✓ Keep the implementation narrow enough to validate at
   the Plan-defined checkpoint.

 non-goals
 ○ Do not implement sibling roadmap item: Validate the
   address.
 ○ Do not implement sibling roadmap item: Show the
   address.
 ○ Do not implement sibling roadmap item: Edit the
   address.

 acceptance
 ✓ Given the starting state needed for Enter an address
 ✓ When the Navigator exercises Enter an address
 ✓ Then the planned observable behavior is visible
 ✓ And out-of-scope sibling roadmap items remain
   untouched

 validation
 ✓ Run automated tests that cover the planned behavior.
 ✓ Provide a Navigator-visible route with expected
   observation, pass condition, and fail condition.
 E2E: required unless Navigator explicitly accepts a
 narrower fixture-level validation route

 implementation contract
 TDD/characterization tests when behavior is testable.
 Keep changes scoped to the active story.
 Do not use git add .; commit only story-scoped files.

  [next action]
 next action
 Navigator approves the Plan or requests changes.

  placeholder sentences on the card: 4
  plan.md digest: dc4b78f345459252ea373938c99a8aab
--- step 2: the card and build show say the same of the three files
  card and build show: differ
    0a1,8
    >  ○ index.md — scaffold
    >    to author: User Story, Outcome, Acceptance Behavior
    >  ○ plan.md — scaffold
    >    to author: Objective, Scope, Acceptance Behavior,
    >               Validation Route
    >  ○ test-guide.md — scaffold
    >    to author: Automated Validation,
    >               Navigator Validation
--- step 3: a plan.md authored before plan-item
  [story files]
  [granularity .. approval gate]
 granularity
 technical_story is implementable by default.

 plan
 Plan the smallest coherent, testable slice for
 Validate the address.

 scope
 ✓ Deliver Validate the address as an observable slice.
 ✓ Keep the implementation narrow enough to validate at
   the Plan-defined checkpoint.

 non-goals
 ○ Do not implement sibling roadmap item: Enter an
   address.
 ○ Do not implement sibling roadmap item: Show the
   address.
 ○ Do not implement sibling roadmap item: Edit the
   address.

 acceptance
 ✓ Given the starting state needed for Validate the
   address
 ✓ When the Navigator exercises Validate the address
 ✓ Then the planned observable behavior is visible
 ✓ And out-of-scope sibling roadmap items remain
   untouched

 validation
 ✓ Run automated tests that cover the planned behavior.
 ✓ Provide a Navigator-visible route with expected
   observation, pass condition, and fail condition.
 E2E: required unless Navigator explicitly accepts a
 narrower fixture-level validation route

 implementation contract
 TDD/characterization tests when behavior is testable.
 Keep changes scoped to the active story.
 Do not use git add .; commit only story-scoped files.

  [next action]
 next action
 Navigator approves the Plan or requests changes.

  placeholder sentences on the card: 4
  the artifacts card below it:
 ↻ existing plan — authored
  card and build show: differ
    0a1,7
    >  ○ index.md — scaffold
    >    to author: Technical Story, Outcome,
    >               Acceptance Behavior
    >  ✓ plan.md — authored
    >  ○ test-guide.md — scaffold
    >    to author: Automated Validation,
    >               Navigator Validation
--- step 4: plan-item --objective
  [story files]
  [granularity .. approval gate]
 granularity
 user_story is implementable by default.

 plan
 Show the saved address on the confirmation page.

 scope
 ✓ Deliver Show the address as an observable slice.
 ✓ Keep the implementation narrow enough to validate at
   the Plan-defined checkpoint.

 non-goals
 ○ Do not implement sibling roadmap item: Validate the
   address.
 ○ Do not implement sibling roadmap item: Enter an
   address.
 ○ Do not implement sibling roadmap item: Edit the
   address.

 acceptance
 ✓ Given the starting state needed for Show the address
 ✓ When the Navigator exercises Show the address
 ✓ Then the planned observable behavior is visible
 ✓ And out-of-scope sibling roadmap items remain
   untouched

 validation
 ✓ Run automated tests that cover the planned behavior.
 ✓ Provide a Navigator-visible route with expected
   observation, pass condition, and fail condition.
 E2E: required unless Navigator explicitly accepts a
 narrower fixture-level validation route

 implementation contract
 TDD/characterization tests when behavior is testable.
 Keep changes scoped to the active story.
 Do not use git add .; commit only story-scoped files.

  [next action]
 next action
 Navigator approves the Plan or requests changes.

  placeholder sentences on the card: 3
  plan.md Objective: Show the saved address on the confirmation page.
  card and build show: differ
    0a1,8
    >  ○ index.md — scaffold
    >    to author: User Story, Outcome, Acceptance Behavior
    >  ○ plan.md — partly authored
    >    to author: Scope, Acceptance Behavior,
    >               Validation Route
    >  ○ test-guide.md — scaffold
    >    to author: Automated Validation,
    >               Navigator Validation
--- step 5: the preauthorized route
  answer: <<<ARIAD:PLAN_CHECKPOINT>>> <<<ARIAD:PLAN_PREAUTHORIZATION_RECORDED>>> <<<ARIAD:ARTIFACTS_MATERIALIZED>>>
  [next action]
 next action
 Driver completes Plan and consumes bounded authority.

--- step 6: the four placeholder sections authored, Non-Goals and Implementation Contract removed
 ✓ plan.md — authored
  answer: <<<ARIAD:CHECKPOINT_REFUSED>>>
 reason
 Plan approval needs an authored plan. Still to author
 in
 docs/project/roadmap/cv1/ds1/cv1-ds1-us3-edit-the-addr
 ess/plan.md:
 Non-Goals, Implementation Contract.
```

The card has no `story files` block yet, so steps 1–4 print it empty and the agreement
check after steps 2, 3, and 4 finds the card silent where `build show` names all three
files. Step 3 is the contradiction:
scaffold scope and acceptance, checked off, above `↻ existing plan — authored`. Step 6
is D4: `✓ plan.md — authored`, then a refusal naming two sections. Two runs of the route
printed identical output.

### Plateau 1 handoff (2026-09-30)

Now true: `build show` and both approval routes read one function. For `plan.md`,
`judgeArtifact` lists what approval would refuse: the placeholder sections not authored
and the required default sections missing or empty. `planSectionsToAuthor`, which both
approval routes call, returns that list, or every section when there is no file. The
word still comes from the placeholder sections alone. An untouched scaffold reads
`scaffold`, and route step 6 already meets its pass condition: `○ plan.md — partly
authored`, with `to author: Non-Goals, Implementation Contract`, and a refusal naming
the same two.

`PLAN_APPROVAL_SECTIONS` and `STORY_PLAN_REQUIRED_SECTIONS` moved from
`planPreauthorization.ts` into `scaffoldSections.ts`, beside the sections they name, so
the reader uses the list without depending on the approval layer. The story-file lines
and `PLAN_STAGE_ARTIFACTS` moved from `activeCheckpoint.ts` into
`artifacts/storyFiles.ts`, with `judgeStoryFiles`, which `build show` now calls and the
Plan card will. No recorded golden changed. 2882 tests pass, and the Builder smoke
passed 60 of 60.

Two things the plan did not say:

- **The list argument is gone.** `unauthoredPlanSectionsFor(path, requiredSections)`
  took a list, and every caller passed the same one. It became
  `planSectionsToAuthor(path)`, so no caller can hand approval a different rule.
- **A dead re-export went with the move.** `planPreauthorization.ts` re-exported
  `unfilledPlanSectionsFor`, and nothing imported it from there. Leaving it would have
  kept a dependency from the approval layer back into the reader.

Next: plateau 2, the card.

### Plateau 2 handoff (2026-09-30)

Now true: the Plan checkpoint prints no section of the plan. The `plan`, `scope`,
`non-goals`, `acceptance`, and `validation` blocks are gone. The `artifacts` path rows
became `story files`: the three files, each with its state and the sections it still
needs, judged by `planLifecycleItem` right after the write and carried on the report
(`storyFiles`), in the rows `build show` prints, from the same function. The next
action follows the table. The route passes every step: 0 placeholder sentences on each
card, the card and `build show` identical in the three states the route visits, and
the `plan.md` digest unchanged.

The 18 recorded cards were edited by script, under criterion 8's contract, and listed in
`ts/test/goldens/README.md`. 630 rows left, and 18 `story files` blocks of 129 rows
arrived. 2886 tests pass, and the Builder smoke passed 60 of 60.

What the corpus found:

- **The recorded cards held the contradiction thirteen times.** In 13 of the 18,
  `plan.md` was already authored when Plan ran, because the preauthorization and
  cadence sequences seed a complete plan before Plan. Every one of those cards printed
  template scope and acceptance, checked off, above a file that said something else:
  route step 3, recorded since the port. They now read `✓ plan.md — authored`, with the
  next action "Driver consumes bounded authority." in the eleven preauthorized ones.
- **Two tests asserted the card's non-goals** (CR019's sibling test and CR018's
  whole-title test). Their file assertions, the siblings in `plan.md`'s Non-Goals, stay.
  Their card halves now assert what D2 decided: no non-goals block, and the file's state.

Two things the plan did not say:

- **The scratch story setup became a helper.** `scaffoldRefusals.test.ts` built its
  world inline. The card tests needed the same one, so it moved to
  `ts/test/helpers/storyWorld.ts`, and both suites use it.
- **The route's agreement check compared a header with none.** It diffed the card's
  block, header and closing blank row included, against `build show`'s rows without
  them. The product's rows were identical from the first run. The helper now drops the
  two lines, in the script and in the copy above. The recorded before-output is
  unchanged, because the card had no block to drop them from.

Next: plateau 3, one vocabulary.

### Plateau 3 handoff (2026-09-30)

Now true: one Plan vocabulary. `planLifecycleItem` composes the scaffold itself from
`PRODUCT_PLAN`. It fills the title with the caller's, else the one Pull recorded, else
the item's code (D5), and names the siblings the caller read from the roadmap as
Non-Goals. `LIBRARY_PLAN` is gone, and a grep of `ts/src`, `ts/test`, and `ts/smoke`
finds none of its sentences. `PlanOptions` takes no section text, only `--objective`, a
title, and siblings. The report stopped carrying the section text that no reader used.
`roadmapPlanContext` became `roadmapPlanFacts`: the roadmap's title for the item and its
siblings, and no sentences. The compiler named the three callers of the old options,
and each was changed.

The corpus now records the product scaffold. 430 library lines in 78 snapshots across 15
sequences were replaced, each as a whole line, by the product sentence for the same
place, filled with the title on the step's cursor, and listed in the goldens README.
The corpus harness refuses a recorded Plan step that passes section text, which would
otherwise now be ignored silently. D5 has its own front-door test: an item the roadmap
does not list is scaffolded "for Unlisted story", where it said "for CV1.DS2.US7".
2886 tests pass, the Builder smoke reached its end, and the route's output is unchanged,
because every route item is listed in its roadmap.

Nothing departed from the plan.

Next: plateau 4, the words, then validation.

### Plateau 4 handoff (2026-09-30)

Now true: the words say what the card is. In `mm-build/SKILL.md`, the Plan section's
first paragraph no longer asks for plan content from the card. It says the card names
the story files and holds no plan, that the plan is read in `plan.md`, and that right
after `plan-item` there is no plan to present yet. In the sequence, step 3 is an
instruction: run `build show`, return its `ACTIVE_CHECKPOINT`, and author again until
it reads `authored`. Step 4 presents the plan from `plan.md`, section by section, as the
file states it. The Claude copies were regenerated. REFERENCE's Builder lifecycle
artifacts says the Plan checkpoint names the same files in the same rows and prints
none of the plan, that `build show`'s list for `plan.md` is what approval refuses on,
and how the scaffold is titled. The troubleshooting entry CR112 added stays true
unchanged, and D4 makes its last step reliable: `authored` now means approval passes.

The real US3 package, read with `build show`, still reads `authored` for all three
files.

### The route after the change (2026-09-30)

At `2646855c`, the last code commit, identical across two runs:

```text
--- step 1: plan-item writes the scaffold
  [story files]
 story files
 ○ index.md — scaffold
   to author: User Story, Outcome, Acceptance Behavior
 ○ plan.md — scaffold
   to author: Objective, Scope, Acceptance Behavior,
              Validation Route
 ○ test-guide.md — scaffold
   to author: Automated Validation,
              Navigator Validation

  [granularity .. approval gate]
 granularity
 user_story is implementable by default.

 implementation contract
 TDD/characterization tests when behavior is testable.
 Keep changes scoped to the active story.
 Do not use git add .; commit only story-scoped files.

  [next action]
 next action
 Driver authors plan.md and presents it; the Navigator
 approves it or requests changes.

  placeholder sentences on the card: 0
  plan.md digest: dc4b78f345459252ea373938c99a8aab
--- step 2: the card and build show say the same of the three files
  card and build show: identical
--- step 3: a plan.md authored before plan-item
  [story files]
 story files
 ○ index.md — scaffold
   to author: Technical Story, Outcome,
              Acceptance Behavior
 ✓ plan.md — authored
 ○ test-guide.md — scaffold
   to author: Automated Validation,
              Navigator Validation

  [granularity .. approval gate]
 granularity
 technical_story is implementable by default.

 implementation contract
 TDD/characterization tests when behavior is testable.
 Keep changes scoped to the active story.
 Do not use git add .; commit only story-scoped files.

  [next action]
 next action
 Navigator reads plan.md and approves it or requests
 changes.

  placeholder sentences on the card: 0
  the artifacts card below it:
 ↻ existing plan — authored
  card and build show: identical
--- step 4: plan-item --objective
  [story files]
 story files
 ○ index.md — scaffold
   to author: User Story, Outcome, Acceptance Behavior
 ○ plan.md — partly authored
   to author: Scope, Acceptance Behavior,
              Validation Route
 ○ test-guide.md — scaffold
   to author: Automated Validation,
              Navigator Validation

  [granularity .. approval gate]
 granularity
 user_story is implementable by default.

 implementation contract
 TDD/characterization tests when behavior is testable.
 Keep changes scoped to the active story.
 Do not use git add .; commit only story-scoped files.

  [next action]
 next action
 Driver authors plan.md and presents it; the Navigator
 approves it or requests changes.

  placeholder sentences on the card: 0
  plan.md Objective: Show the saved address on the confirmation page.
  card and build show: identical
--- step 5: the preauthorized route
  answer: <<<ARIAD:PLAN_CHECKPOINT>>> <<<ARIAD:PLAN_PREAUTHORIZATION_RECORDED>>> <<<ARIAD:ARTIFACTS_MATERIALIZED>>>
  [next action]
 next action
 Driver authors plan.md, then consumes bounded
 authority.

--- step 6: the four placeholder sections authored, Non-Goals and Implementation Contract removed
 ○ plan.md — partly authored
   to author: Non-Goals, Implementation Contract
  answer: <<<ARIAD:CHECKPOINT_REFUSED>>>
 reason
 Plan approval needs an authored plan. Still to author
 in
 docs/project/roadmap/cv1/ds1/cv1-ds1-us3-edit-the-addr
 ess/plan.md:
 Non-Goals, Implementation Contract.
```

Every step meets its pass condition:

1. The card holds the three story files and no plan block. Its next action tells the
   Driver to author and present. It carries 0 placeholder sentences, and the digest
   is `dc4b78f3…`, as before the change.
2. The card and `build show` are identical.
3. `✓ plan.md — authored`, agreeing with `↻ existing plan — authored` beneath it. The
   next action has the Navigator read `plan.md`. The card and `build show` are
   identical.
4. `○ plan.md — partly authored`, without Objective. The objective is written to the
   file as before, and the card and `build show` are identical.
5. The preauthorized next action has the Driver author, then consume.
6. `build show` and the refusal both name Non-Goals and Implementation Contract.

Next: the Navigator's walk of the route, then the handoff review.

## Outcome

Pending.
