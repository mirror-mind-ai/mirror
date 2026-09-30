[< RS001](index.md) · [Canonical status](../index.md#change-requests)

# CR113 — The Pull card claims Prepare did not run, names every level a Delivery Story, and skips the parent

## Problem

### As captured (2026-09-30)

`build pull-item` renders `DELIVERY_STORY_IDENTIFIED` (`renderPullReport`,
`ts/src/builder/pull.ts`) with four things that are not so.

**Its boundary line is false.** The card ends with `Prepare was not executed
automatically.` (`pull.ts:179`, a fixed string). The same command then runs Prepare and
prints `PREPARE_FIELD_READING` directly beneath it (`runPullItem`,
`ts/src/builder/commands.ts`), and the Builder skill documents that Pull runs Prepare.
Both cards arrive in one stdout, the first denying what the second shows. The goldens
record exactly this pair.

**Its title names the wrong level.** Every pull, of a Delivery Story, a User Story, or a
Technical Story, is headed `🟪■  DELIVERY STORY ACTIVATED` (`pull.ts:156`). The code
says so: "Every level renders the DELIVERY STORY ACTIVATED card, including a User Story.
Reproduced: the grammar is Python's, and changing it is a product decision." The
Python grammar is gone with its engine; the decision is now the Navigator's to take.

**Its placement tree skips the parent.** The tree prints the CV and the leaf:

```text
🟪[CV22] TypeScript Core Port (Database-Seam Strangler)
  └─ 🟦[US3] npm distribution
```

`CV22.DS10.US3` sits under DS10, which the tree does not show; the leaf's label is taken
from the last code segment into a variable named `dsCode` (`pull.ts:149`).
[CR018](cr018-story-titles-with-slashes-truncated-in-surfaces-and-scaffolds.md) named
the label and the one-segment rows as conscious exclusions; no Change Request carried
them.

**The ribbon marks a stage that never ran.** Every Delivery surface for an implementable
item shows `✓ Expand` once the cursor is past Prepare (`renderLifecycleRibbon`,
`ts/src/builder/lifecycleRibbon.ts`, which marks every stage before the current one as
done). A User Story or Technical Story never expands; the ribbon says it did.

### As characterized (2026-09-30)

Reproduced at `d0d67cab` in a scratch home with the [validation route](#validation-route);
its output is under [Evidence](#the-route-before-the-change). All four parts hold. The
characterization found four more things the capture did not know:

**The product prints this card only for stories.** A Delivery Story pull, through the
front door, renders the composite `DELIVERY_STORY_READY` instead (route step 1). So in
the product the card appears only after a User Story or Technical Story pull, and its
`DELIVERY STORY ACTIVATED` is wrong every time it is printed, not two times in three.
The corpus's five Delivery Story renders come from its pull operation, which renders
the card at any level.

**The marker names the level too.** The card is wrapped in `DELIVERY_STORY_IDENTIFIED`
for every level. Fixing the title alone would put `USER STORY ACTIVATED` inside a marker
that names a Delivery Story, and the transport rule shows the marker to the Navigator
with the card. Only `pull.ts` and the corpus harness name the marker; the skill and the
method definition do not.

**The ribbon is wrong before Expand too.** The Prepare card draws a story's Expand as
`○`, still to come, for a stage the story never reaches (step 2). From Plan on it reads
`✓` (step 5).

**The source row is false for an item the roadmap does not list.** Pulling
`CV1.DS2.US9`, which no roadmap row names, prints `source: roadmap candidate` under a
tree that files it straight under CV1 (step 4). This one was found while working the
floor, so it enters CR113 only by the Navigator's decision (D5).

One line the capture might suspect is true: `next event: Prepare`. Prepare is the event
after Pull, and its card follows in the same output.

## Expected Behavior

The Pull card states what happened: that Prepare ran, when it did, and what was not
executed. Its title names the level pulled — `USER STORY ACTIVATED`,
`TECHNICAL STORY ACTIVATED`, `DELIVERY STORY ACTIVATED` — with the level's own marker,
the way the roadmap tree already colors them. Its placement shows the item's lineage,
CV → Delivery Story → story, each with its code and title, so the reader sees where the
item lives. The ribbon shows Expand as not applicable for an implementable item, rather
than as done; a stage the item's level never reaches is drawn distinctly from one that
completed.

## Impact

Wrong at the decision point, and at the first one: the Pull card is what the Navigator
reads to confirm the right item was pulled before any plan exists. A boundary line that
denies what the next card shows, a level label that is wrong two times in three, and a
tree with the parent missing each cost the reader a second look; together they make the
card something the Navigator learns to skip, and a card nobody reads cannot stop a wrong
pull.

## Plan Or Decision

**Approved 2026-09-30** by the Navigator, with D1–D5 as recorded below; Driver and
Delivery assigned the same day.

On the Ariad trust floor by the Navigator's decision of 2026-09-30
([Decisions](../../decisions.md#the-cv22-release-is-gated-on-an-ariad-trust-floor-worked-before-us3)).
Third in floor order, after CR111. Goldens that record the card change by script, each
with its reason, as `ts/test/goldens/README.md` requires.

### Objective

The Pull card says what happened, at the level that happened, and where the item
lives. It names the level it pulled, under a marker that names no level. Its placement
is the item's lineage, CV, then Delivery Story, then story, each titled by the roadmap.
Its source row is true for an item the roadmap does not list, and it claims nothing
about Prepare. Every Delivery ribbon draws a stage the item's level never reaches as
not applicable, never as done or still to come.

### Design

**The boundary claims nothing about Prepare (D1).** `Prepare was not executed
automatically.` leaves the card. `Plan and later lifecycle work were not executed.` and
`next event: Prepare` stay: both are true in the command and in the corpus's pull
operation. Prepare's record is its own card, which the command prints next.

**The title names the level (D2).** The card is headed `USER STORY ACTIVATED`,
`TECHNICAL STORY ACTIVATED`, or `DELIVERY STORY ACTIVATED`, from the pulled level; the
product prints only the first two. The title keeps its `🟪■`: 🟪 marks the Pull
family's titles, as on `PULL CANDIDATES`. The level's own color lives in the tree.

**The marker names no level (D3).** `DELIVERY_STORY_IDENTIFIED` becomes
`ITEM_ACTIVATED`, one marker for every level, echoing the title's verb. Historical
documents keep the old name as history.

**The placement is the item's lineage.** A story reads, for route step 2:

```text
🟪[CV1] Checkout
  └─ 🟦[DS1] Checkout address
     └─ 🟩[US1] Enter an address
```

These are the three colors `DELIVERY_STORY_READY` already draws for the three levels.
Two readers title the lineage, each already the authority for its fact (engineer,
second pass). The CV row keeps `scopeFocus` over `inspectRoadmapSnapshot`, which reads
the roadmap index's CV table, so the row stays equal to Project Position's focus
(CR018, CR002). The Delivery Story's title and whether the roadmap lists the item come
from `inspectPullCandidates`, which scans every index file and candidate table, the
reader the Plan's sibling list uses (CR019); the snapshot cannot answer either.
`placementCvTitle` becomes `pullPlacement`, which composes both reads once, at the
command, and returns the lineage's titles and the listed flag; the corpus harness calls
it too. A Delivery Story the roadmap does not describe reads `no authored package`, as
the CV row already does. An item with no Delivery Story in its code reads CV,
then the item. One placement renderer draws the tree for Pull and for Ready: Ready's
is the same lineage, one level shorter, and its bytes do not change (engineer). The
leaf's variable, named `dsCode` for a story's code, becomes `leafCode`.

**The source row is true (D5).** It reads `roadmap candidate` when the roadmap lists the
item, and `not in the roadmap: pulled by its code` when it does not. The answer comes
from the same read that titles the lineage. It is the card's one remaining untrue row,
and the lineage makes it visible: an unlisted story would show a Delivery Story row
reading `no authored package` under a source row calling it a roadmap candidate.

**The skill says what an unlisted item means.** The Pull section gains one sentence
(prompt-engineer, second pass): when the Pull card reads `not in the roadmap`, say so
to the Navigator before planning, because the code may be mistyped or the roadmap
behind. The Claude copies regenerate (CR102).

**A stage the level never reaches is drawn as not applicable (D4).** For a User Story
or Technical Story, every Delivery ribbon draws `– Expand`: never `✓`, and never `○`.

```text
Delivery Flow: ✓ Pull → ✓ Prepare → – Expand → ◉ Plan → ○ Implement → ○ Validate → ○ Debt Review → ○ Done
```

`renderLifecycleRibbon(current, level)` takes the level as a required argument, so the
compiler names every caller and each decides (CR112's lesson). Which levels never
expand is not a list in the ribbon module: it is `isImplementableByDefault`'s answer,
negated, the one predicate Prepare and Plan already decide by (engineer, second pass).
A Delivery Story, and a ribbon with no level, draw as today. The resume-state golden grades the ribbon with no
level, and it does not move. The implementation guard's blocked card receives the
cursor's level: until now it received only the reason, so it would have kept drawing
`✓ Expand` for a story (engineer).

### Decisions this plan asks the Navigator to take

1. **D1: the Pull card drops its claim about Prepare.** The Prepare card that follows is
   the record that Prepare ran. Alternative: the card says "Prepare ran in this
   command". That needs a flag whose other branch only the corpus's pull operation
   takes, the kind of test-only branch CR111 retired.
2. **D2: the title names the level and keeps the Pull family's `🟪■`.** The level's color
   lives in the tree. Alternative: color the title by level, `🟦■` for a Delivery Story
   and `🟩■` for a story, which reuses the green of the `PLAN APPROVED` and `DONE`
   titles.
3. **D3: the marker becomes `ITEM_ACTIVATED`, one for every level.** Alternative: keep
   `DELIVERY_STORY_IDENTIFIED` as a protocol identifier, and let the Navigator see a
   story's card wrapped in a marker naming a Delivery Story.
4. **D4: a stage the level never reaches is drawn `– Expand`, in every ribbon of a User
   or Technical Story.** Alternative: leave Expand out of a story's ribbon, which gives
   the ribbon a different shape for each level.
5. **D5: the source row's untruth, found while working the floor, is fixed inside
   CR113**, because the lineage exposes it on the same card. Alternative: capture it as
   CR117, outside the floor.

Approving the plan approves these five as recorded; amendments re-open it.

### Affected files

- `ts/src/builder/pull.ts`: the card's title, marker, boundary, source row, and
  placement; `placementCvTitle` becomes `pullPlacement`.
- `ts/src/builder/deliveryStoryReady.ts`: Ready's tree, through the shared placement
  renderer, with bytes unchanged.
- `ts/src/builder/lifecycleRibbon.ts`: the level argument and the not-applicable glyph.
- Every caller of `renderLifecycleRibbon`: `prepare.ts`, `plan.ts`, `approve.ts`,
  `implementationGuard.ts` (both cards), `closure.ts` (four cards),
  `checkpointRefused.ts`, `activeCheckpoint.ts`, `expand.ts`, and `commands.ts` (the
  guard's blocked card, and the placement).
- `.pi/skills/mm-build/SKILL.md` and its generated Claude copies: the one sentence.
- `ts/test/builder/*`: new tests, among them one table-driven test over every
  ribbon-bearing surface, and the corpus harness's pull step.
  `ts/test/goldens/builder-lifecycle.golden.json`, `builder-command.golden.json`, and
  `README.md`: the scripted edits.

### Plateaus

Each closes with a commit, a push, and a green CI run that finishes before the next
plateau begins.

0. **Characterize and count.** The route before the change, recorded below. Counted: 9
   recorded Pull cards (7 lifecycle, 2 command), and 111 story-level ribbons that
   change (78 lifecycle, 33 command). 75 stay: Delivery Story items, items seeded with
   no level, and the resume-state grading.
1. **The Pull card.** D1, D2, D3, D5, the lineage through one placement renderer, and
   the skill's sentence. The 9 cards are edited by script under criterion 7.
2. **The ribbon.** D4 with the required level at every caller. The 111 ribbons are
   edited by script, each level taken from the recorded cursor or, in the command
   corpus, from the seeded scenario and the pulled level.
3. **Validation and handoff.** The route after the change, the Navigator's walk, the
   handoff review, and the ledger.

### Acceptance criteria

1. A User Story pull prints `USER STORY ACTIVATED`, and a Technical Story pull `TECHNICAL
   STORY ACTIVATED`, each under `ITEM_ACTIVATED`. No story's card or marker names a
   Delivery Story.
2. The Pull card makes no claim about Prepare. `next event: Prepare` and `Plan and later
   lifecycle work were not executed.` stay.
3. The placement reads CV, Delivery Story, then story, each with its code and its
   roadmap title. A Delivery Story the roadmap does not describe reads `no authored
   package`. The Ready card's tree is byte-identical (route step 1).
4. The source row reads `roadmap candidate` only for an item the roadmap lists, and
   `not in the roadmap: pulled by its code` otherwise (step 4).
5. For a User or Technical Story, every Delivery ribbon draws `– Expand`: on Pull,
   Prepare, Plan, approval, both guard cards, validation, review, coherence, Done, a
   refusal, and `build show`. One table-driven test renders every ribbon-bearing
   surface for a story cursor and asserts `– Expand`, and for a Delivery Story cursor
   asserts the glyph drawn today (quality-assurance, second pass). A ribbon with no
   level is unchanged, and the resume-state golden does not move.
6. `renderLifecycleRibbon` takes the level as a required argument.
7. The golden diff is a contract:
   - in the 9 Pull cards, only the title row, the marker and surface id, the tree rows,
     the source row, and the removed boundary line change;
   - in the 111 ribbons, only the Expand glyph changes;
   - every other byte is identical;
   - every edit is listed in `ts/test/goldens/README.md` with its reason and its count.

### Validation route

CLI only, in a scratch home, with no Pi session (CR106). Its output before the change is
recorded under [Evidence](#the-route-before-the-change). Run it from the repository root
as a script, with `bash <file>`, so that no interactive alias applies. It deletes its
temporary directory:

```bash
V=$(mktemp -d) && mkdir -p "$V/home" && export MIRROR_HOME="$V/home" MIRROR_USER= NODE_OPTIONS=--no-warnings
cr113() { node ts/src/frontDoor/cli.ts "$@"; }
R="$V/p/docs/project/roadmap" && mkdir -p "$R/cv1/ds1" && printf '# Roadmap\n' > "$R/index.md"
printf '# CV1 — Checkout\n\n**Status:** 🟢 Active\n' > "$R/cv1/index.md"
printf '# CV1.DS1 — Checkout address\n\n**Status:** 🟡 Planned\n**Type:** Delivery Story\n\n## Candidate Stories\n\n| Code | Story | Type | Status |\n|------|-------|------|--------|\n| CV1.DS1.US1 | Enter an address | User Story | 🟡 Planned |\n| CV1.DS1.TS1 | Validate the address | Technical Story | 🟡 Planned |\n' > "$R/cv1/ds1/index.md"
git -C "$V/p" init -q && printf '# j\n' | cr113 identity set journey j > /dev/null && cr113 journey set-path j "$V/p" > /dev/null 2>&1
cr113 build adopt --journey j --method ariad > /dev/null && cr113 build sync-cursor --journey j --method ariad > /dev/null
cr113 build set-cadence --journey j --method ariad --profile checkpoint > /dev/null
pull() { cr113 build pull-item --journey j --method ariad --item-code "$1" --item-level "$2" --item-title "$3" --why-now now 2>&1; }
answer() { grep -o '<<<ARIAD:[A-Z_]*>>>' | paste -sd ' ' - | sed 's/^/  answer: /'; }
ribbons() { grep '^Delivery Flow: \|^DS Flow: ' | sed 's/^/  /'; }
card() { sed -n '/^╭/,/^╰/p' | sed '1d;$d' | sed 's/│//g; s/ *$//'; }
rows() { awk -v h=" $1" '$0 == h { f = 1 } f && $0 == "" { exit } f { print }'; }
pullcard() { sed -nE '/<<<ARIAD:(DELIVERY_STORY_IDENTIFIED|ITEM_ACTIVATED)>>>/,/<<<END:/p'; }
echo '--- step 1: pull the Delivery Story; the front door prints its Ready card'
pull CV1.DS1 delivery_story 'Checkout address' > "$V/o1.txt"; answer < "$V/o1.txt"; ribbons < "$V/o1.txt"
card < "$V/o1.txt" | rows 'Where are we in the roadmap?'
r=$(cr113 build show --journey j --method ariad | ribbons); echo "  build show: ${r:-(no ribbon)}"
echo '--- step 2: pull the User Story; the command runs Pull, then Prepare'
pull CV1.DS1.US1 user_story 'Enter an address' > "$V/o2.txt"; answer < "$V/o2.txt"; ribbons < "$V/o2.txt"
pullcard < "$V/o2.txt" | card > "$V/c2.txt"
sed -n 1p "$V/c2.txt"; rows 'roadmap placement' < "$V/c2.txt"; rows source < "$V/c2.txt"; rows 'next event' < "$V/c2.txt"; rows boundary < "$V/c2.txt"
echo '--- step 3: pull the Technical Story'
pull CV1.DS1.TS1 technical_story 'Validate the address' > "$V/o3.txt"; answer < "$V/o3.txt"; ribbons < "$V/o3.txt"
pullcard < "$V/o3.txt" | card | sed -n 1p
echo '--- step 4: pull a story the roadmap does not list'
pull CV1.DS2.US9 user_story 'Unlisted story' > "$V/o4.txt"
pullcard < "$V/o4.txt" | card > "$V/c4.txt"; sed -n 1p "$V/c4.txt"; rows 'roadmap placement' < "$V/c4.txt"; rows source < "$V/c4.txt"
echo '--- step 5: the User Story again, planned; build show'
pull CV1.DS1.US1 user_story 'Enter an address' > /dev/null
cr113 build plan-item --journey j --method ariad 2>&1 | ribbons
echo '  build show:'; cr113 build show --journey j --method ariad | ribbons
unset MIRROR_HOME MIRROR_USER; rm -rf "$V"
```

Pass, after the change:

- Step 1: unchanged. The Ready card's tree and ribbon read as before.
- Step 2: the answer names `ITEM_ACTIVATED`. Both ribbons draw `– Expand`. The title
  reads `USER STORY ACTIVATED`, and the placement reads CV1, then DS1, then US1, each
  titled. The source is `roadmap candidate`, the next event `Prepare`, and the boundary
  holds only `Plan and later lifecycle work were not executed.`
- Step 3: `TECHNICAL STORY ACTIVATED`, and `– Expand` in both ribbons.
- Step 4: the placement's DS2 row reads `no authored package`, and the source reads `not
  in the roadmap: pulled by its code`.
- Step 5: the Plan card's ribbon and `build show`'s ribbon both draw `– Expand`.

Fail: a story's card or marker naming a Delivery Story; any claim that Prepare did not
run; a story ribbon with `✓` or `○` Expand; a changed Delivery Story ribbon; or a Ready
tree that moved.

### Conscious exclusions

- The Prepare card's `🟦[CV1.DS1.US1]` row. 🟦 there marks the active item, not a level,
  on the Prepare and Plan cards alike; recoloring them is not this change.
- `build show` printing no ribbon for a Delivery Story waiting on its story
  confirmation (step 1). That is an absence, not a false statement.
- Paths on the Pull card. It prints none.
- The Ready card's content beyond its tree.

### Authority boundaries

Plan approval moves CR113 to `planned`. A human Driver and a Delivery reference are
required before `in_progress`. Proposed, as for every floor change: Driver
`@viniciusteles`, Delivery `mirror-ts-core`. `validated` requires the Navigator to walk
the route above and accept it. Each plateau is committed on the Delivery branch and
pushed when green, with GitHub Actions verified after every push. Merge, publication,
and release are not authorized.

Navigator decisions, 2026-09-30: the plan and D1–D5 approved as recorded, after the
second panel pass; Driver `@viniciusteles`, Delivery `mirror-ts-core`.

### Panel review (2026-09-30)

One pass, before the Navigator saw the plan, by the eight lenses: engineer,
quality-assurance, devops-engineer, security-engineer, database-architect,
prompt-engineer, experience-designer, and product-designer. Synthesis: the card half is
small, and the ribbon half is wide. It has fourteen call sites and 111 recorded
ribbons, and its risk is a caller that keeps drawing the old glyph. The findings close
that, and name where each golden edit's level comes from. All are folded above:

- **The blocked guard card cannot know the level** (engineer). It receives only the
  reason, so the required argument would be answered with `null` and draw `✓ Expand`
  for a story. The command passes the cursor's level.
- **Ready carries a second copy of the tree** (engineer). The two would drift the moment
  Pull shows a lineage, so one placement renderer draws both, and Ready's bytes are the
  proof it did not move.
- **The lineage read must be one function the corpus shares** (engineer). This is
  CR112's harness lesson: `pullPlacement` replaces `placementCvTitle` for both.
- **The command corpus records no cursor** (quality-assurance). Each ribbon's level comes
  from the seeded scenario or the pulled level. The scenarios that seed no level keep
  their ribbons, and plateau 0 counted each group.
- **"Unchanged where true" needs walking** (quality-assurance). The route pulls a
  Delivery Story first, and the resume-state golden pins the ribbon with no level.
- **The glyph must not read as a separator or a failure** (experience-designer). The
  ribbon's separators are `→` and failure is `✕`. The en dash is the table convention
  for not applicable. The route prints every ribbon, so the Navigator judges it in
  their own terminal.
- **An unlisted item is the Pull card's most useful warning** (product-designer). A code
  the roadmap does not know may be a typo at the first decision point. D5 makes the
  source row say so, rather than call it a roadmap candidate.

The other lenses were silent:

- security-engineer: the card prints fixed strings and roadmap titles through the reader
  CR018 made link-free; nothing new is read or written.
- database-architect: the cursor's shape and values are unchanged.
- devops-engineer: nothing outside `pull.ts` and the corpus harness matches the old
  marker, and no migration or runtime integration is involved.
- prompt-engineer: the skill names neither the card nor its marker, and its Pull section
  stays true.

**Second pass.** The Navigator asked the Driver to choose the personas and have them
review the plan. The Driver chose six, the lenses that own what the change touches:
engineer, quality-assurance, devops-engineer, prompt-engineer, experience-designer,
product-designer; and left out security-engineer (fixed strings and link-free titles;
nothing new read or written), database-architect (the cursor is untouched), and
ai-engineer (no model in the loop). Three facts were checked first: the snapshot read
lists only the CV table; nothing outside `pull.ts` and the harness parses the marker,
in the repository or the installed runtime; the existing ribbon assertions match only
the `◉` stage. Synthesis: the plan is right about the card and the ribbon; its risks
were in what it assumed about the reads and the tests. All folded above:

- **The "one roadmap read" was two, unnamed** (engineer): the CV row's read cannot
  title a Delivery Story or say whether a story is listed. Now the CV row keeps
  `scopeFocus`, and the DS title and the listed flag come from `inspectPullCandidates`,
  composed once in `pullPlacement`.
- **"User Story or Technical Story" was about to become a second list** (engineer):
  the ribbon's not-applicable rule is `isImplementableByDefault`, negated.
- **Fourteen call sites were pinned only where the corpus holds a story cursor**
  (quality-assurance): one table-driven test renders every ribbon-bearing surface for
  a story cursor and for a Delivery Story cursor.
- **A warning nobody is told to act on** (prompt-engineer): the skill's Pull section
  says what to do when the card reads `not in the roadmap`.

Silent: devops-engineer (no external consumer of the marker; no migration);
experience-designer (the third row indents by the width of the row above, as Ready's
does; `PULL CANDIDATES` indents differently, which is that card's matter);
product-designer (D2 and D5 as recommended; `next event: Prepare` above the Prepare
card is redundant in the product and true in both contexts).


## Evidence

### As captured

Observed 2026-09-30 at `9dca47a0`, pulling `CV22.DS10.US3` (level `user_story`) in this
repository. The stdout held `DELIVERY_STORY_IDENTIFIED` ending in `Prepare was not
executed automatically.` followed by `PREPARE_FIELD_READING` with the ribbon at
`✓ Pull → ◉ Prepare`; the tree above is the one rendered. `build show` afterwards showed
`✓ Pull → ✓ Prepare → ✓ Expand → ◉ Plan`. The seven `DELIVERY_STORY_IDENTIFIED` entries
in `ts/test/goldens/builder-lifecycle.golden.json` and the two in
`builder-command.golden.json` carry the same line and label for every level.

### The route before the change

At `d0d67cab`, identical across two runs:

```text
--- step 1: pull the Delivery Story; the front door prints its Ready card
  answer: <<<ARIAD:DELIVERY_STORY_READY>>> <<<ARIAD:ARTIFACTS_MATERIALIZED>>>
  Delivery Flow: ✓ Pull → ✓ Prepare → ◉ Expand → ○ DS Plan → ○ Implement → ○ Validate → ○ Debt Review → ○ Done
 Where are we in the roadmap?
 🟪[CV1] Checkout
   └─ 🟦[DS1] Checkout address
  build show: (no ribbon)
--- step 2: pull the User Story; the command runs Pull, then Prepare
  answer: <<<ARIAD:DELIVERY_STORY_IDENTIFIED>>> <<<ARIAD:PREPARE_FIELD_READING>>>
  Delivery Flow: ◉ Pull → ○ Prepare → ○ Expand → ○ Plan → ○ Implement → ○ Validate → ○ Debt Review → ○ Done
  Delivery Flow: ✓ Pull → ◉ Prepare → ○ Expand → ○ Plan → ○ Implement → ○ Validate → ○ Debt Review → ○ Done
        🟪■  DELIVERY STORY ACTIVATED
 roadmap placement
 🟪[CV1] Checkout
   └─ 🟦[US1] Enter an address
 source
 roadmap candidate
 next event
 Prepare
 boundary
 Prepare was not executed automatically.
 Plan and later lifecycle work were not executed.
--- step 3: pull the Technical Story
  answer: <<<ARIAD:DELIVERY_STORY_IDENTIFIED>>> <<<ARIAD:PREPARE_FIELD_READING>>>
  Delivery Flow: ◉ Pull → ○ Prepare → ○ Expand → ○ Plan → ○ Implement → ○ Validate → ○ Debt Review → ○ Done
  Delivery Flow: ✓ Pull → ◉ Prepare → ○ Expand → ○ Plan → ○ Implement → ○ Validate → ○ Debt Review → ○ Done
        🟪■  DELIVERY STORY ACTIVATED
--- step 4: pull a story the roadmap does not list
        🟪■  DELIVERY STORY ACTIVATED
 roadmap placement
 🟪[CV1] Checkout
   └─ 🟦[US9] Unlisted story
 source
 roadmap candidate
--- step 5: the User Story again, planned; build show
  Delivery Flow: ✓ Pull → ✓ Prepare → ✓ Expand → ◉ Plan → ○ Implement → ○ Validate → ○ Debt Review → ○ Done
  build show:
  Delivery Flow: ✓ Pull → ✓ Prepare → ✓ Expand → ◉ Plan → ○ Implement → ○ Validate → ○ Debt Review → ○ Done
```

Step 2 carries three of the four parts: `DELIVERY STORY ACTIVATED` for a User Story,
the tree without DS1, and `Prepare was not executed automatically.` above the Prepare
card, under a marker naming a Delivery Story. Step 4 is D5's source row. Steps 2 and
5 are the ribbon, `○ Expand` before Plan and `✓ Expand` after it.

### Plateau 1 handoff (2026-09-30)

Now true: the Pull card names the level it pulled, `USER STORY ACTIVATED` or `TECHNICAL
STORY ACTIVATED`, under `ITEM_ACTIVATED`. The Delivery Story title keeps its old bytes,
padded to terminal columns like every Builder title literal. The card claims nothing
about Prepare. Its placement is the item's lineage, drawn by `placementRows`, which the
Ready card now draws its tree with too; Ready's recorded bytes did not move. Its source
row says whether the roadmap names the item. The skill's Pull section says what to do
when it does not. Route steps 2 to 4 meet their pass conditions for the card, and step
1 is unchanged. The ribbons are plateau 2's.

The 9 recorded cards were edited by script, under criterion 7, and listed in
`ts/test/goldens/README.md`. In 6 the source row now reads `not in the roadmap`. One of
them is the command fixture's Technical Story, `CV1.DS1.TS1`, which its roadmap never
names: D5 telling the truth about a recorded pull. Three CR018 tests asserted the old
tree row and header. They still prove that a title is whole where it is read and
clipped where it is restated; they now read the level's header and the story's row one
level down. `test/builder/pullCard.test.ts` holds seven tests. 2893 tests pass, and the
Builder smoke reached its end.

One departure from the plan's text, found in implementation: **the listed check does
not come from `inspectPullCandidates` alone.** That reader keeps only the statuses that
can be pulled and drops anything with a Done artifact. On its own it would call a story
marked Done, or a row in a Delivery Story's candidate table with no package yet, "not
in the roadmap", which is false and defeats D5's own words. The second pass's engineer
finding named it; the finding was mine, and it was wrong. So the item is named when a
package heading claims it (the status-blind rule `resolveStoryDirectory` and Expand
share), when its Delivery Story's candidate table lists it, or when it is a pull
candidate. A Delivery Story's title comes from its package heading, else the index's
listing. Expand's candidate-table parser moved to `roadmapGrammar.ts`, unchanged, so
Pull and Expand read the table by one rule. A test pins the Done case. The behavior D5
approved did not change; only the reader that implements it.

Next: plateau 2, the ribbon.

### Plateau 2 handoff (2026-09-30)

Now true: every Delivery ribbon of a User or Technical Story draws `– Expand`, at every
stage. `renderLifecycleRibbon(current, level)` takes the level as a required argument,
and which levels never expand is `isImplementableByDefault`'s answer. The compiler
named the fourteen callers and the resume-state test, and each passes the level it
holds. The Expand cards pass `delivery_story`, since only a Delivery Story reaches
Expand. The blocked guard gets the cursor's level from the command. A Delivery Story's
ribbon, and a ribbon with no level, are unchanged. `lifecycleRibbon.test.ts` pins the
glyph at every stage. One walk through the front door, pull to Done, collects every
Delivery ribbon a story's lifecycle prints, across eleven surfaces; a second walk shows
a Delivery Story's refusal still draws the Expand it reached. The route passes every
step.

What the walk found:

- **Two ribbons were hard-coded strings.** `DEBT_REVIEW_STARTED` and `DONE_CLOSURE_CONFIRMATION`,
  printed by `commands.ts` after a story's validation and review, carried their ribbon as
  a fixed string with `✓ Expand`. They were never calls, so the required argument could
  not name them. The walk failed on the first. Both now draw through
  `renderLifecycleRibbon` with the cursor's level, and for a Delivery Story or no level
  they produce the old string byte for byte, which was checked before the change. The
  Delivery Story flow's own cards keep their fixed `DS Plan` ribbons: a Delivery Story
  does expand.
- **The resume-state golden moved by one card, which the plan said it would not.** Its
  level-less `ribbons` map is unchanged, as planned. But it also records the
  implementation guard in eleven states, and `ds_plan_wrong_level` seeds a User Story
  cursor, so its blocked card now draws `– Expand`. The ribbon edits number 112, not
  111: 78 lifecycle, 33 command, 1 resume state.

The 112 ribbons were edited by script, each level taken from the record, and listed in
`ts/test/goldens/README.md`. 2897 tests pass, and the Builder smoke reached its end.

### The route after the change (2026-09-30)

At the plateau 2 commit, identical across two runs:

```text
--- step 1: pull the Delivery Story; the front door prints its Ready card
  answer: <<<ARIAD:DELIVERY_STORY_READY>>> <<<ARIAD:ARTIFACTS_MATERIALIZED>>>
  Delivery Flow: ✓ Pull → ✓ Prepare → ◉ Expand → ○ DS Plan → ○ Implement → ○ Validate → ○ Debt Review → ○ Done
 Where are we in the roadmap?
 🟪[CV1] Checkout
   └─ 🟦[DS1] Checkout address
  build show: (no ribbon)
--- step 2: pull the User Story; the command runs Pull, then Prepare
  answer: <<<ARIAD:ITEM_ACTIVATED>>> <<<ARIAD:PREPARE_FIELD_READING>>>
  Delivery Flow: ◉ Pull → ○ Prepare → – Expand → ○ Plan → ○ Implement → ○ Validate → ○ Debt Review → ○ Done
  Delivery Flow: ✓ Pull → ◉ Prepare → – Expand → ○ Plan → ○ Implement → ○ Validate → ○ Debt Review → ○ Done
        🟪■  USER STORY ACTIVATED
 roadmap placement
 🟪[CV1] Checkout
   └─ 🟦[DS1] Checkout address
      └─ 🟩[US1] Enter an address
 source
 roadmap candidate
 next event
 Prepare
 boundary
 Plan and later lifecycle work were not executed.
--- step 3: pull the Technical Story
  answer: <<<ARIAD:ITEM_ACTIVATED>>> <<<ARIAD:PREPARE_FIELD_READING>>>
  Delivery Flow: ◉ Pull → ○ Prepare → – Expand → ○ Plan → ○ Implement → ○ Validate → ○ Debt Review → ○ Done
  Delivery Flow: ✓ Pull → ◉ Prepare → – Expand → ○ Plan → ○ Implement → ○ Validate → ○ Debt Review → ○ Done
        🟪■  TECHNICAL STORY ACTIVATED
--- step 4: pull a story the roadmap does not list
        🟪■  USER STORY ACTIVATED
 roadmap placement
 🟪[CV1] Checkout
   └─ 🟦[DS2] no authored package
      └─ 🟩[US9] Unlisted story
 source
 not in the roadmap: pulled by its code
--- step 5: the User Story again, planned; build show
  Delivery Flow: ✓ Pull → ✓ Prepare → – Expand → ◉ Plan → ○ Implement → ○ Validate → ○ Debt Review → ○ Done
  build show:
  Delivery Flow: ✓ Pull → ✓ Prepare → – Expand → ◉ Plan → ○ Implement → ○ Validate → ○ Debt Review → ○ Done
```

Every step meets its pass condition:

1. Unchanged: the Ready card's tree and its Delivery Story ribbon.
2. `ITEM_ACTIVATED`, `USER STORY ACTIVATED`, and `– Expand` in both ribbons. The
   lineage reads CV1, then DS1, then US1. The source is a roadmap candidate, the next
   event Prepare, and the boundary no longer mentions Prepare.
3. `TECHNICAL STORY ACTIVATED`, with `– Expand` in both ribbons.
4. `no authored package` for DS2, and `not in the roadmap: pulled by its code`.
5. `– Expand` on the Plan card and in `build show`.

Next: the Navigator's walk of the route, then the handoff review.

### Navigator validation (2026-09-30)

The Navigator walked the [validation route](#validation-route) and accepted it:
"Everything looks fine."

- The route was run as `bash tmp/cr113-route.sh` from the repository root, in the
  Navigator's own shell. Its output matched the
  [recorded output](#the-route-after-the-change-2026-09-30) line for line, compared
  with `diff`:
  1. the Ready card's tree and Delivery Story ribbon unchanged;
  2. `ITEM_ACTIVATED`, `USER STORY ACTIVATED`, and `– Expand` in both ribbons, with the
     lineage CV1, DS1, US1, a roadmap candidate, and no claim about Prepare;
  3. `TECHNICAL STORY ACTIVATED`, with `– Expand`;
  4. `no authored package` for DS2, and `not in the roadmap: pulled by its code`;
  5. `– Expand` on the Plan card and in `build show`.
- D4's glyph was judged in the Navigator's terminal, as the plan asked. The dash reads
  as not applicable, not as a separator.

CI was green on every push that carried the change: plateau 1 (`f95992fd`) and plateau
2 (`05ac1dae`). Each ran Tests on both legs and the smoke.

## Outcome

Pending.
