[< RS001](index.md) · [Canonical status](../index.md#change-requests)

# CR107 — An escaped pipe in a candidate-table title is read as a cell border

## Problem

### As captured (2026-09-27)

Expand reads a Delivery Story's `## Candidate Stories` table by splitting every row on
`|` (`parseCandidateStories`, `ts/src/builder/expand.ts`). It does not honor the
Markdown escape `\|`, which is how an author writes a literal pipe inside a cell. A
title that contains one is cut at the pipe. The authored cell ``Read `a \| b` input``
becomes ``Read `a \``, and that fragment is what Expand recommends, what the child
package's heading says, and what every line of the child scaffold repeats.

Two neighbours share the shape. Both were found by reading the code; neither has been
run:

- The roadmap index reader (`rowCells`, `ts/src/builder/pullCandidates.ts`) and the
  Delivery Story closure's status-table reader (`ts/src/builder/deliveryStoryRoadmapClosure.ts`)
  split rows the same way.
- The Delivery Story scaffold Expand writes when no authored package exists
  (`renderDeliveryStoryIndex`, `ts/src/builder/artifacts/storyIndex.ts`) puts a title
  into a table cell without escaping a pipe in it, so the table it writes would not read
  back as written.

### As characterized (2026-10-04)

Reproduced at `1876297a` in a scratch home with the [validation route](#validation-route);
its output is under [Evidence](#the-route-before-the-change). The capture holds, both
neighbours run as read, and the defect is not as rare as the capture said.

**Three readers split on every pipe.** Each strips the row's leading and trailing pipes
and splits the rest on `|`: `rowCells` in `pullCandidates.ts` for the roadmap index's CV
and DS tables, `parseCandidateStories` in `roadmapGrammar.ts` for a Delivery Story's
candidate table, and `statusTableRows` in `deliveryStoryRoadmapClosure.ts` for the Done
preflight. None reads `\|`, GFM's one way to put a pipe in a cell. A cell with one
splits into two, and every column after it shifts by one:

- Expand recommends ``🟩[US1] Read `a \``, heads the child ``# CV1.DS1.US1 — Read `a \``,
  and names its folder `cv1-ds1-us1-read-a` (route step 1).
- The index's CV table row `| CV1 | Checkout, cash \| card | 🟢 Active |` reaches the
  snapshot's focus row as the title `Checkout, cash \` with the status `card`, marked
  `○ card` (step 2). The CV's real status is in the fourth cell, which nothing reads.
- The Done preflight reads a Done row's `Status` column from the cell the escape pushed
  into it, `User Story`, and refuses `done-delivery-story`: `table row CV1.DS1.US1 is
  not Done` (step 4).

**The one writer escapes nothing.** `renderDeliveryStoryIndex` writes the recommended
title into the scaffold's `Story` cell and, through `userStoryOutcome`, into its
`Outcome` cell. A Delivery Story pulled with the title `Pay by cash | card` gets a row of
seven cells where the header has five; read back, Expand recommends `Pay by cash`
(step 3). What Ariad writes, Ariad cannot read.

**Not rare: this repository has one.** `CV20.DS13.TS1`'s row in
`docs/project/roadmap/cv20-builder-mode-evolution/cv20-ds13-ds-grammar-roadmap-support/index.md`
carries six `\|` in its `Outcome` cell, quoting the table headers that story taught the
reader. On HEAD, `parseCandidateStories` gives it the status `Code \`, so Expand would
hold a Done story pending, and `inspectAuthoredClosure` for CV20.DS13 refuses: `table
row CV20.DS13.TS1 is not Done`. The story has been Done since July.

**The fragment, once written, is authored content.** Expand finds an existing child by
its heading code (CR018), so a child package headed by a fragment keeps being found by
its code, and CR079's rule keeps it from being rewritten. None exists on this roadmap: no
candidate table here has a `\|` in a `Story` cell, and the one row with escapes is Done
and expanded long ago.

## Expected Behavior

A `\|` inside a cell is part of the cell's text, in every roadmap table Ariad reads,
code spans included, as GFM reads it, and `\\` is a backslash wherever it stands, so
`\\|` is a backslash and a border. A title Ariad writes into a table cell has its pipes escaped, so the row
reads back exactly as written. The title reaches the Navigator whole on every card, in
the child's heading, and in its folder name, where the slug drops the pipe as it drops
any punctuation.

## Impact

CR018's class: a character inside a title treated as a delimiter. A title naming a
shell pipeline, a union type, or an either/or reaches the Navigator as a fragment, the
scaffold carries the fragment into the repository, and the fragment is what a `done.md`
and a roadmap row will name forever. Past the title, the shifted columns read a status
from the wrong cell: a Done story pending to Expand, and a Delivery Story that cannot
close through `done-delivery-story` until the author removes the escape, which GFM
requires. One Delivery Story on this roadmap is in that state.

## Plan Or Decision

Captured 2026-09-27 while characterizing CR018, outside the floor by that day's
decision, and taken onto the floor on 2026-09-30 with every open RS001 request
([Decisions](../../decisions.md#the-cv22-release-is-gated-on-an-ariad-trust-floor-worked-before-us3)),
seventh in floor order, after CR103.

**Approved 2026-10-04** by the Navigator, with D1 and D2 as recorded below; Driver and
Delivery assigned the same day. The panel
reviewed it twice before the plan was presented ([record below](#panel-review-2026-10-04)),
and both passes' changes are folded in.

### Objective

Every roadmap table Ariad reads splits a row on unescaped pipes only and gives each cell
with `\|` read as `|`; the one table Ariad writes escapes the pipes in what it puts into
a cell; and a title with a pipe reaches every card, heading, and folder whole. The row
this repository already has reads as Done.

### Design

**One row reader (D1).** `tableRowCells(line)` in `roadmapGrammar.ts`, beside the
heading and status patterns: it drops the row's leading pipes and its trailing
unescaped pipes, as `str.strip("|")` did, then walks the row once. A backslash before a
pipe yields a pipe, and a backslash before a backslash yields one backslash, so `\\|` is a
backslash and a border, as GFM reads it; any other character is itself, and an unescaped
pipe closes a cell. Each cell is `pyStrip`ped. The three readers call it where they
split today: `rowCells` in `pullCandidates.ts` becomes it, `parseCandidateStories`'s
`stripPipes(line).split("|")` becomes it, and `statusTableRows`'s `split("|")` becomes
it. The header detection and the separator-row skip stay as they are: a header row has
no escape, and `|---` is still `|---`. The code column still goes through
`stripMarkdownLink` and the story column through `linkFreeTitle`, on the unescaped text,
so a link labelled `a \| b` reads `a | b`, as GFM renders it.

**One cell writer (D2).** `tableCell(text)` beside it doubles every backslash, then
escapes every `|` as `\|`, so it is the reader's inverse for the characters the
reader interprets: ``a \| b`` as a title reads back as ``a \| b`` (panel: engineer).
`renderDeliveryStoryIndex` passes the recommended title and its outcome through it, the
two cells that carry a title. No other writer puts text into a table cell: the story
scaffolds have no tables, and the closure records have none.

**The title travels whole.** Nothing else changes for it: the heading is written from
the unescaped title, the cards print it, and `storyFolderName`'s slug drops the pipe as
it drops any punctuation, so ``Read `a \| b` input`` names the folder
`cv1-ds1-us1-read-a-b-input`.

**Skill text.** The candidate-table authoring contract gains one sentence, under
[Skill text](#skill-text), and the Claude copies regenerate (CR102).

**Goldens.** None change: no fixture row carries a backslash before a pipe, and a row
without one splits as before. The route and the tests prove it.

### Skill text

In `## Delivery Story Candidate Table Authoring Contract`, after the paragraph that
ends "the table is Expand-compatible by construction":

```text
A pipe inside a cell is written `\|`, as GFM writes it, and reads back as `|`;
Ariad escapes the pipes in any title it writes into a cell.
```

### Decisions this plan asks the Navigator to take

1. **D1: GFM's escape is the rule, in every table Ariad reads.** `\|` is a pipe inside
   the cell, a code span included, and `\\` is a backslash wherever it stands, so `\\|`
   is a backslash and a border (amended at plateau 1: the plan had said before a pipe
   only, and the writer's round trip showed that was not an inverse). Alternative: honor `\|` only in `parseCandidateStories`, the reader the
   capture names, and leave the index tables and the Done preflight as they are; the
   Done preflight would keep refusing CV20.DS13.
2. **D2: the scaffold escapes the pipes in a title it writes into a cell**, and the
   title goes unescaped into the heading, the cards, and the folder's slug.
   Alternative: refuse to expand a Delivery Story whose title holds a pipe, which
   would stop a title the heading and the cards can carry.

Approving the plan approves these two as recorded; amendments re-open it.

### Affected files

- `ts/src/builder/roadmapGrammar.ts`: `tableRowCells`, `tableCell`;
  `parseCandidateStories` reads through the first; `stripPipes` goes.
- `ts/src/builder/pullCandidates.ts`: `rowCells` becomes `tableRowCells`; the comment
  that named Python's split.
- `ts/src/builder/deliveryStoryRoadmapClosure.ts`: `statusTableRows` reads through it.
- `ts/src/builder/artifacts/storyIndex.ts`: the two cells through `tableCell`.
- `.pi/skills/mm-build/SKILL.md` and its two generated Claude copies.
- `ts/test/builder/escapedPipe.test.ts`, new: the reader's table; every reader, on CR103's
  every-reader shape, with `CV20.DS13.TS1`'s row as written; the writer's round trip;
  a front-door walk of Expand and the Done preflight.
- `docs/project/refinement/index.md`, this document, and the collaboration strategy's
  sequence; `docs/project/decisions.md` at Done.

### Plateaus

Each closes with a commit, a push, and a green CI run that finishes before the next
plateau begins.

0. **Characterize and count.** The route before the change, recorded below. Counted:
   three readers, one writer, one row on this roadmap, no golden.
1. **The reader and the writer (D1, D2).** Red first: the splitter's table, every
   reader, the round trip, and the walk. Then `tableRowCells`, `tableCell`, and the four
   call sites. Green; no golden moves.
2. **The skill.** The sentence and the Claude copies.
3. **Validation and handoff.** The route after the change, the Navigator's walk, the
   handoff review, and the ledger.

### Acceptance criteria

1. `tableRowCells` is graded by a table: a plain row, `\|` inside a cell, `\|` inside a
   code span, `\\|` as a backslash and a border, an escaped pipe at a cell's start and
   at its end, a row with leading and trailing pipe runs, an escaped trailing pipe kept
   as content, an empty cell, and a row with no pipes.
2. Every reader yields the cell's text with `\|` read as `|`: the CV table and the DS
   table through `snapshotItemsFromContent`, the candidate table through
   `parseCandidateStories`, and the Done preflight through `inspectAuthoredClosure` on a
   package whose Done row holds an escape; and `CV20.DS13.TS1`'s row, as written in
   this repository, reads with the status `✅ Done` and the level `technical_story`.
3. `renderDeliveryStoryIndex` with the title `Pay by cash | card` writes `Pay by cash \|
   card` in the Story cell and in the Outcome cell, and `parseCandidateStories` reads the
   row back with the title `Pay by cash | card`; with the title ``a \| b`` it writes
   ``a \\\| b`` and reads back ``a \| b``.
4. Through the front door: Pull on a Delivery Story whose table holds ``Read `a \| b`
   input`` recommends ``🟩[US1] Read `a | b` input``, heads the child with it, and names
   the folder `cv1-ds1-us1-read-a-b-input`; the snapshot's focus row for an index row
   with an escape reads the whole title and `◉ active`; a Delivery Story pulled with a
   piped title writes a row that a second Pull reads back whole; and `done-delivery-story`
   proceeds past the preflight on a Done row with an escape.
5. Every golden is byte-identical.
6. The skill carries the [Skill text](#skill-text); `node ts/scripts/buildClaudePlugin.ts
   --check` passes.
7. The route after the change meets its pass conditions.

### Validation route

CLI only, in a scratch home, with no Pi session (CR106). Its output before the change is
recorded under [Evidence](#the-route-before-the-change). Run it from the repository root
as a script, with `bash <file>` or `zsh <file>`, so that no interactive alias applies. It
deletes its temporary directory:

```bash
V=$(mktemp -d) && mkdir -p "$V/home" && export MIRROR_HOME="$V/home" MIRROR_USER= NODE_OPTIONS=--no-warnings
cr107() { node ts/src/frontDoor/cli.ts "$@"; }
card() { sed -n "/<<<ARIAD:$1>>>/,/<<<END:$1>>>/p" | sed -n '/^╭/,/^╰/p'; }
answer() { grep -o '<<<ARIAD:[A-Z_]*>>>\|^Error: .*' | paste -sd ' ' - | sed 's/^/    answer: /'; }
journey() { printf '# %s\n' "$1" | cr107 identity set journey "$1" > /dev/null && cr107 journey set-path "$1" "$2" > /dev/null 2>&1
  cr107 build adopt --journey "$1" --method ariad > /dev/null; cr107 build sync-cursor --journey "$1" --method ariad > /dev/null; }
pullds() { cr107 build pull-item --journey "$1" --method ariad --item-code "$2" --item-level delivery_story --item-title "$3" --why-now now 2>&1; }
R="$V/p/docs/project/roadmap" && mkdir -p "$R/cv1/ds1" && git -C "$V/p" init -q
printf '# Roadmap\n\n| Code | Capability Value | Status |\n|---|---|---|\n| CV1 | Checkout, cash \\| card | 🟢 Active |\n' > "$R/index.md"
printf '# CV1 — Checkout\n\n**Status:** 🟢 Active\n' > "$R/cv1/index.md"
printf '# CV1.DS1 — Checkout address\n\n**Status:** 🟡 Planned\n**Type:** Delivery Story\n\n## Candidate Stories\n\n| Code | Story | Type | Status |\n|------|-------|------|--------|\n| CV1.DS1.US1 | Read `a \\| b` input | User Story | 🟡 Planned |\n| CV1.DS1.TS1 | Validate the address | Technical Story | 🟡 Planned |\n' > "$R/cv1/ds1/index.md"
journey a "$V/p"; journey b "$V/p"; journey c "$V/p"
echo '--- 1. a Delivery Story whose candidate table holds `Read `a \| b` input`: Pull expands it'
pullds a CV1.DS1 'Checkout address' > "$V/pull-a"; answer < "$V/pull-a"
card DELIVERY_STORY_READY < "$V/pull-a" | grep -A1 "What is recommended next" | tail -1
echo "    the child heading: $(grep -m1 '^# ' "$R"/cv1/ds1/cv1-ds1-us1-*/index.md)"
echo "    the child folder:  $(ls -d "$R"/cv1/ds1/cv1-ds1-us1-* | xargs -n1 basename)"
echo "--- 2. the roadmap index: a CV title with an escaped pipe, on the snapshot's focus row"
cr107 build pull-candidates --journey a --method ariad 2>&1 | card ROADMAP_SNAPSHOT | sed -n '2,3p'
echo '--- 3. a Delivery Story with no package, pulled with a title that holds a pipe: the scaffold it writes'
pullds b CV1.DS2 'Pay by cash | card' | answer
DS2=$(grep -rl "^# CV1.DS2 " "$R" | head -1); echo "    written at: ${DS2#$R/}"; grep '^| \[' "$DS2" | sed 's/^/    /'
echo '    read back by Expand, the same Delivery Story pulled from another journey:'
pullds c CV1.DS2 'Pay by cash | card' | card DELIVERY_STORY_READY | grep -A1 "What is recommended next" | tail -1
echo '--- 4. the Done preflight on a table row whose Story cell holds an escaped pipe'
cr107 build set-flow-unit --journey a --method ariad --unit delivery_story > /dev/null 2>&1
cr107 build plan-delivery-story --journey a --method ariad --objective o --child CV1.DS1.US1 --child CV1.DS1.TS1 > /dev/null 2>&1
cr107 build approve-delivery-story-plan --journey a --method ariad > /dev/null 2>&1
cr107 build validate-delivery-story --journey a --method ariad --summary s --navigator-accepted > /dev/null 2>&1
cr107 build review-delivery-story --journey a --method ariad --decision no_action --summary s > /dev/null 2>&1
for f in $(find "$R/cv1/ds1" -name index.md); do perl -pi -e 's/🟡 Planned/✅ Done/g; s/^\*\*Status:\*\* .*/**Status:** ✅ Done/' "$f"; done
cr107 build done-delivery-story --journey a --method ariad --summary s 2>&1 | answer
unset MIRROR_HOME MIRROR_USER; rm -rf "$V"
```

Pass, after the change:

- Step 1: the recommendation row reads ``🟩[US1] Read `a | b` input``; the child heading
  is ``# CV1.DS1.US1 — Read `a | b` input``; the folder is `cv1-ds1-us1-read-a-b-input`.
- Step 2: the focus row reads `🟪[CV1]  Checkout, cash | card` on the left and
  `◉ active` on the right; the value line reads `value: Checkout, cash | card`.
- Step 3: the written row holds `Pay by cash \| card` in its second and fourth cells,
  and the read-back recommendation is `🟩[US1] Pay by cash | card`.
- Step 4: `<<<ARIAD:DELIVERY_STORY_CLOSURE_CHECKPOINT>>>` and its companions, no
  `Error:` line.

Fail: a backslash on any row or heading; a title cut at a pipe; `○ card`; a scaffold row
with a bare pipe inside a cell; the preflight's refusal.

### Conscious exclusions

- A child package already written with a fragment heading: authored content, found by
  its code, never rewritten (CR079). None exists on this roadmap.
- `CV20.DS13.TS1`'s row: read correctly after the change, not edited. It is Done, and
  the escape is what GFM requires.
- Other Markdown escapes in a cell (`\*`, `\_`, `\\` elsewhere than before a pipe):
  left as written, as they are in every other reader; only the pipe decides a cell.
- A pipe in a title written into a heading, a card, or a folder name: no escape needed
  and none written.
- Table cells in the roadmap index Ariad never writes.

### Authority boundaries

Plan approval moves CR107 to `planned`. A human Driver and a Delivery reference are
required before `in_progress`. Proposed, as for every floor change: Driver
`@viniciusteles`, Delivery `mirror-ts-core`. `validated` requires the Navigator to walk
the route above and accept it. Each plateau is committed on the Delivery branch and
pushed when green, with GitHub Actions verified after every push. Merge, publication,
and release are not authorized.

Navigator decisions, 2026-10-04: the plan and D1 and D2 approved as recorded, after the
second panel pass; Driver `@viniciusteles`, Delivery `mirror-ts-core`.

### Panel review (2026-10-04)

One pass, before the plan was presented, by the nine lenses loaded for CR103 in the
same session: engineer, quality-assurance, database-architect, devops-engineer,
security-engineer, ai-engineer, prompt-engineer, experience-designer, and
product-designer.

Synthesis: a small change with one real risk, that the writer and the reader disagree
at the one character both interpret. The rule is GFM's and the corpus has a row to
grade it on; what the plan had to get right was the inverse. Every finding below is
folded into the plan above.

| Lens | Dissent | Resolution |
|---|---|---|
| engineer | The writer escapes a pipe, but a title that already holds `\|` would be written `\\|`, which the reader gives back as a backslash and a border: the writer is not the reader's inverse | `tableCell` doubles every backslash before escaping the pipes (every, since plateau 1), so ``a \| b`` as a title reads back as ``a \| b``; the round trip is criterion 3's second case |
| engineer | "Other escapes left as written" is true for the reader but not stated for `\\` away from a pipe, which GFM renders as one backslash | Recorded at Plan; overturned at plateau 1, where the round trip showed the reader must give `\\` as `\` wherever it stands for the writer to have an inverse. No cell on this roadmap holds `\\` |
| quality-assurance | The one real row, `CV20.DS13.TS1`, is graded by a unit test on its text and never through the front door | Checked: the Delivery Story's child packages do not exist as folders, so `done-delivery-story` on a copy would refuse for `package CV20.DS13.TS1 was not found` before and after, and Expand's recommendation on a table whose children are all Done is its first child either way. The verbatim row in the every-reader test is the proof, and the synthetic route step 4 is the same gate on a row with an escape |
| product-designer | D2's alternative, refusing a piped title, would have been the safer floor change | Declined, recorded: the heading, the cards, and the slug carry the title already; only the cell needed the escape |

Silent:

- database-architect, devops-engineer, ai-engineer: nothing stored, no migration, no
  model.
- security-engineer: the reader is a single pass over the row with no backtracking; a
  cell's text was already untrusted content on a card.
- prompt-engineer: the skill's sentence states the convention and Ariad's side of it, in
  the section that already governs the table.
- experience-designer: a title with a pipe on a card prints as the author wrote it.

**Second pass.** By the lenses that own what the change touches: engineer (the reader,
the writer, the inverse) and quality-assurance (the walk, the goldens). Two facts were
checked first: no fixture row under `ts/test/fixtures` carries a backslash before a
pipe, and no roadmap cell here carries `\\`. Synthesis: the first pass fixed the inverse;
the second found nothing to add and confirmed the golden claim. Noted, not changed: the
reader's stripping of trailing pipes keeps an escaped trailing pipe as content, which
the table grades (engineer).


## Evidence

### As captured

Found while characterizing
[CR018](cr018-story-titles-with-slashes-truncated-in-surfaces-and-scaffolds.md) on
2026-09-27, at `4169c2ad`, on a scratch project with an isolated `MIRROR_HOME`. A
Delivery Story whose candidate table held the row
``| CV1.DS1.US1 | Read `a \| b` input | User Story | 🟡 Planned |`` was pulled. Expand's
recommendation read ``🟩[US1] Read `a \``, and the child it wrote was headed
``# CV1.DS1.US1 — Read `a \``.

### The route before the change

At `1876297a`, identical across two runs:

```text
--- 1. a Delivery Story whose candidate table holds `Read `a \| b` input`: Pull expands it
    answer: <<<ARIAD:DELIVERY_STORY_READY>>> <<<ARIAD:ARTIFACTS_MATERIALIZED>>>
│ 🟩[US1] Read `a \                                       │
    the child heading: # CV1.DS1.US1 — Read `a \
    the child folder:  cv1-ds1-us1-read-a
--- 2. the roadmap index: a CV title with an escaped pipe, on the snapshot's focus row
│ 🟪[CV1]  Checkout, cash \                        ○ card │
│ value: Checkout, cash \                                │
--- 3. a Delivery Story with no package, pulled with a title that holds a pipe: the scaffold it writes
    answer: <<<ARIAD:DELIVERY_STORY_READY>>> <<<ARIAD:ARTIFACTS_MATERIALIZED>>>
    written at: cv1/cv1-ds2-pay-by-cash-card/index.md
    | [CV1.DS2.US1](cv1-ds2-us1-pay-by-cash-card/index.md) | Pay by cash | card | User Story | Navigator can validate Pay by cash | card as an observable behavior. | 🟡 Planned |
    read back by Expand, the same Delivery Story pulled from another journey:
│ 🟩[US1] Pay by cash                                     │
--- 4. the Done preflight on a table row whose Story cell holds an escaped pipe
    answer: Error: authored roadmap is not ready for Delivery Story Done: docs/project/roadmap/cv1/ds1/index.md: table row CV1.DS1.US1 is not Done
```

The `CV20.DS13.TS1` reading was taken by a script at `1876297a`: `parseCandidateStories`
over its `index.md` gives the row the status `Code \`, and `inspectAuthoredClosure` for
`CV20.DS13` with that child refuses `table row CV20.DS13.TS1 is not Done`.

### Plateau 1 handoff (2026-10-04)

Now true: every roadmap table Ariad reads splits a row on unescaped pipes only, through
`tableRowCells` in `roadmapGrammar.ts`, and the Delivery Story scaffold writes a title
into its two cells through `tableCell`. Red first: `escapedPipe.test.ts` failed at its
import, then the splitter's table and the inverse failed on the rule as the plan wrote
it. That rule did not survive its own round trip. The plan said `\\` is a backslash only
before a pipe and the writer doubles only a backslash before a pipe; then ``a \| b`` as
a title, written ``a \\\| b``, read back as ``a \\| b``. GFM reads `\\` as one backslash
wherever it stands, and that is the rule now: the reader gives `\|` as `|` and `\\` as
`\`, and the writer doubles every backslash before escaping the pipes, so the two are
inverses for everything the reader interprets. The plan's D1 sentence and the panel's
second engineer row are amended below to say so. No roadmap cell here holds `\\`, no
fixture row holds a backslash before a pipe, and no golden moved: 2949 tests pass, 7 of
them new. The route after the change meets every pass condition; its output is under
[The route after the change](#the-route-after-the-change-2026-10-04). Plateau 2 is
the skill's sentence and the Claude copies.

### The route after the change (2026-10-04)

At the plateau 1 commit:

```text
--- 1. a Delivery Story whose candidate table holds `Read `a \| b` input`: Pull expands it
    answer: <<<ARIAD:DELIVERY_STORY_READY>>> <<<ARIAD:ARTIFACTS_MATERIALIZED>>>
│ 🟩[US1] Read `a | b` input                              │
    the child heading: # CV1.DS1.US1 — Read `a | b` input
    the child folder:  cv1-ds1-us1-read-a-b-input
--- 2. the roadmap index: a CV title with an escaped pipe, on the snapshot's focus row
│ 🟪[CV1]  Checkout, cash | card                 ◉ active │
│ value: Checkout, cash | card                           │
--- 3. a Delivery Story with no package, pulled with a title that holds a pipe: the scaffold it writes
    answer: <<<ARIAD:DELIVERY_STORY_READY>>> <<<ARIAD:ARTIFACTS_MATERIALIZED>>>
    written at: cv1/cv1-ds2-pay-by-cash-card/index.md
    | [CV1.DS2.US1](cv1-ds2-us1-pay-by-cash-card/index.md) | Pay by cash \| card | User Story | Navigator can validate Pay by cash \| card as an observable behavior. | 🟡 Planned |
    read back by Expand, the same Delivery Story pulled from another journey:
│ 🟩[US1] Pay by cash | card                              │
--- 4. the Done preflight on a table row whose Story cell holds an escaped pipe
    answer: <<<ARIAD:DELIVERY_STORY_CLOSURE_CHECKPOINT>>> <<<ARIAD:ARTIFACTS_MATERIALIZED>>> <<<ARIAD:PROJECT_POSITION>>>
```

## Outcome

Pending.
