[< RS001](index.md) · [Canonical status](../index.md#change-requests)

# CR018 — Story titles containing `/` are truncated to the text after the last slash in surfaces and scaffolds

## Problem

### As captured (2026-09-07)

When a pulled item's title contains a `/`, the Ariad surfaces and the Plan
scaffold render only the text after the **last** slash. Two reproductions on
2026-09-07, with a consistent signature:

- `CV8.DS4.TS1` — authored title (tail) and what `PLAN_CHECKPOINT` rendered:

  ```text
  … (ver [CV8.DS5](../cv8-ds5-aposentadoria-da-superficie-web/index.md)): o caminho morto sai sem ressalva
  Plan the smallest coherent, testable slice for index.md)): o caminho morto sai sem ressalva.
  ```

  The last slash is inside the link path.
- `CV8.DS4.TS3` — authored title (fragment) and what `DELIVERY_STORY_IDENTIFIED`
  and `PLAN_CHECKPOINT` rendered:

  ```text
  … itens `pub`/`allow(dead_code)` (Rust), auditoria de chaves i18n …
  `allow(dead_code)` (Rust), auditoria de chaves i18n …
  ```

  The last slash is between two inline-code spans.

Prose with a slash is being split by a rule meant for paths (or for a
`code/title` pair). The same rule reached the Plan scaffold: `plan.md` and
`index.md` were generated with the truncated title in their Objective, Scope
and Acceptance sections, and the runtime's non-goal list named sibling stories
by their truncated titles too.

A second, related symptom lives in Expand: the child-story `index.md`
scaffolds echo the **full** authored title — Markdown links included — five
times each, at the Delivery Story's relative depth, so every link inside the
scaffold is one level short once the file sits in the story's own folder. The
consuming project documented that side as its own finding
(kia-desktop CR193: 17 broken relative links found, the scaffold interpolation
the dominant cause).

### As characterized (2026-09-27, TypeScript runtime)

Every symptom reproduces, and the cause is one convention with two halves.
`candidateDeliveryStoriesFromContent` (`ts/src/builder/pullCandidates.ts`) names a
Delivery Story found in a CV's `Candidate Delivery Stories:` bullet list
`"<CV title> / <DS title>"`. It is the only code that builds that chain. Five readers
undo it by cutting every title they meet:

| Reader | Cut | Where it shows |
|---|---|---|
| `titleLeaf` (`storyPaths.ts`) | after the last `/` | Pull and Ready headers and item rows; the synthesized story's title; new package folder names |
| `cvTitle` (`cursorTransitions.ts`) | before the first `/` | the CV row of Pull and Ready, which borrows the item's title |
| `lastTitleSegment` (`pullCandidatesRender.ts`) | after the last `/` | the snapshot's current and backlog rows; the Project Position recommendation |
| `candidateShortTitle` (`homeSurface.ts`) | after the last `/` | Builder Orientation's candidate list |
| `roadmapPlanContext` (`commands.ts`) | after the last `/` | the Plan's objective, scope, acceptance, and sibling non-goals, on the card and in `plan.md` |

A title authored as a heading or a table cell never carries the chain, so for those
titles every cut is pure loss. Three further findings:

- **The CV row borrows the item's title whenever it has no `/`.** CR002 found it once;
  it is every Pull and Ready surface the goldens record, twelve CV rows.
- **Expand's links are one level short.** A child's `index.md` repeats the
  candidate-table title five times, links included, one folder deeper than the table
  they were written for. From the child, `../../../decisions/d12.md` resolves to
  `docs/project/roadmap/decisions/d12.md`.
- **Width truncation is silent.** A one-line row is cut at 54 code points with no mark.
  Ready's recommended story reads as below, and nothing says it goes on:

  ```text
  🟩[US1] Retire the web surface (per [D12](../../../deci
  ```

Two defects in neighbouring code turned up while characterizing
([decision D](#decision-d-two-defects-found-while-characterizing)):

1. **An escaped pipe inside a candidate-table title is read as a cell border.** Expand
   reads ``Read `a \| b` input`` as ``Read `a \``. Captured as
   [CR107](cr107-an-escaped-pipe-in-a-candidate-table-title-is-read-as-a-cell-border.md).
2. **Expand writes a second package for a child that already has one.** It finds an
   existing child by the folder name it would give it, not by the child's heading. When
   the authored child lives in another folder, Expand writes a second package claiming
   the same code. Every Builder command that then resolves that code dies with an
   uncaught `StoryPackageAmbiguityError` stack trace, `plan-item` first among them.
   Fixed here, by the Navigator's decision.

The [validation route](#validation-route) reproduces all of it at `4169c2ad`, except the
escaped pipe, identically in bash and zsh. Its output is under
[Evidence](#characterization-2026-09-27).

## Expected Behavior

A title is prose. It is carried verbatim through surfaces and scaffolds, or
truncated only by the surface's width rule with a visible ellipsis. No
character inside a title is a delimiter.

Scaffolds that interpolate a title into a file at a different depth either
rewrite the relative links for the destination or interpolate a link-free form
of the title; they never emit links that resolve nowhere.

## Impact

The checkpoint the Navigator is asked to approve describes a story by a
fragment of its name, sometimes a meaningless one (`index.md)): o caminho …`).
The generated artifacts carry the same fragment into the project's roadmap,
where the Driver must rewrite them before they can be read — which the
`kia-desktop` Driver did for all three stories of CV8.DS4. Sister of CR004
(scaffold **replacing** authored content); this is about what the scaffold
**contains**.

## Plan Or Decision

Drafted by quality assurance on 2026-09-27 and reviewed by the technical panel the same
day ([record below](#panel-review-2026-09-27)), with the panel's three changes folded in.
Navigator decisions, 2026-09-27: [B1](#decision-b-links-inside-a-title),
[C1](#decision-c-width), and [D](#decision-d-two-defects-found-while-characterizing): the
duplicate child package is fixed here and the escaped pipe is captured as CR107. Driver
`@viniciusteles`, Delivery `mirror-ts-core`. The decisions changed the design after the
review, so the changed parts went back to the panel
([delta review](#delta-review-2026-09-27)).

### Objective

A title is one opaque string, from the roadmap or `--item-title` to every surface, file,
and folder name. No character inside it is a delimiter, and its links are shown by their
labels. A row that must cut a title for width says so with `…`. The CV row names the CV
by its own title. Expand never writes a second package for a code an authored package
already claims, and a code claimed twice is refused, never a crash.

### Design

1. **Expand finds children by heading.** Expand reads the roadmap's heading claims once
   and settles every child before it writes anything. A code one package claims is
   reported `existing`, wherever that package lives, and is not written. A code no
   package claims is created in the Delivery Story's folder, as today. A code two
   packages claim blocks Expand with `EXPAND_BLOCKED`, whose "No files were
   materialized" then stays true. The lookup is `storyPaths.ts`'s own rule applied to a
   map read once, so `resolveStoryDirectory` and Expand cannot drift apart.
2. **A doubly claimed code is refused, not a crash.** Fourteen Builder commands resolve
   the active item's package, and each crashes today when two packages claim its code:
   `show`, `plan-item`, `approve-plan --use-preauthorization`, `continue-lifecycle`, the
   four story closure leaves, `plan-delivery-story`, `approve-delivery-story-plan`, and
   the four Delivery Story closure leaves. Each resolves the package before its first
   write. The two Builder dispatchers turn `StoryPackageAmbiguityError` into one line,
   `Error: <n> roadmap packages claim code '<code>': <paths>`, and exit 1. Like every
   `Error:` line, it makes no claim about what changed. Pull keeps rendering
   `EXPAND_BLOCKED`.
3. **No chain, no cuts.** The bullet reader gives a Delivery Story its own title. With
   the chain gone nothing needs cutting, so `titleLeaf`, `cvTitle`, `lastTitleSegment`,
   `candidateShortTitle`, and the split in `roadmapPlanContext` are deleted.
4. **The CV's own title.** Pull and Ready take the CV row from `scopeFocus` over the
   journey's scope: the roadmap index row, else the CV package's heading, else the words
   `scopePhrases.ts` already uses (`no authored package`, `no project path`). That is the
   focus Project Position shows, so the two surfaces cannot disagree, and it follows
   CR002's rule that a surface takes its position from `roadmapScope.ts` and does not
   scan. The renderers stay pure: one helper in the command layer computes the title for
   both.
5. **Folder names.** `createStoryDirectory` slugs the whole title, the rule Expand already
   applies to children. With design 1 in place, a changed folder name can no longer
   duplicate a package, because every writer finds an authored package by heading first.
6. **Width** ([decision C](#decision-c-width)): the rows in [Surface rows](#surface-rows).
7. **Links** ([decision B](#decision-b-links-inside-a-title)). `linkFreeTitle(title)` in
   `roadmapGrammar.ts`, beside `stripMarkdownLink`, reduces every Markdown link or image
   outside a code span to its label text. It runs where a title enters Ariad, not where
   one is shown: the roadmap readers (package headings, CV headings, index-table and
   bullet titles, Expand's candidate table) and Pull's `--item-title`. Every surface,
   file, and folder name downstream then gets the same link-free title, and a renderer
   added later cannot forget the rule. `stripMarkdownLink` stays for codes; what it did
   for a title that is one whole link becomes a case of the new rule. The cursor stores
   the link-free title, and one stored before this change keeps its links until its item
   is pulled again.

### Decision B: links inside a title

- **B1. Labels everywhere (chosen).** Surfaces, files, and folder names show only a
  link's label. The draft priced it at about ten more render sites. Reduced where a title
  enters Ariad instead of wherever one is shown, it touches four files.
- **B2. Surfaces as authored, files link-free.** What the CR asks, literally, and what the
  draft recommended.
- **B3. Rewrite link targets for the destination.** Keeps navigation, but only Expand
  knows which file a title came from.

### Decision C: width

- **C1. Whole where it is read, `…` where it repeats (chosen).** A title's only or first
  appearance in a command's output, and any row an agent is told to copy a title from,
  wraps in full. A row that restates a title already shown whole in the same output stays
  on one line and ends in `…` when cut. The table below is the whole rule.
- **C2. Wrap every title row.**
- **C3. Keep silent truncation,** and capture it separately.

### Surface rows

| Surface | Row | Today | Planned |
|---|---|---|---|
| Pull (`DELIVERY_STORY_IDENTIFIED`) | header | tail after the last `/`, cut at 54 | wraps in full |
| | `🟪[CV]` | head of the item's title | the CV's own title, wraps in full |
| | `└─ 🟦[code]` | tail, cut at 54 | one line, `…` when cut |
| Ready (`DELIVERY_STORY_READY`) | What was pulled? | tail, wrapped | wraps in full |
| | `🟪[CV]` | head of the item's title | the CV's own title, wraps in full |
| | `└─ 🟦[code]` | tail, cut | one line, `…` when cut |
| | `🟩[code]` recommended | whole, cut at 54 | wraps in full: the skill copies it |
| Roadmap Snapshot | `🟪[CV]` with its status | whole, cut | one line, `…` when cut (the `value:` row repeats it) |
| | `value:` | whole, cut | wraps in full |
| | `└─ 🟦[code]` current | tail, cut | one line, `…` when cut |
| | Backlog `○ 🟦[code]` | tail, cut | one line, `…` when cut (Pull Candidates, in the same output, lists each whole) |

Candidate lists, Expand Decision, Builder Orientation, and the Plan card already wrap;
they only stop cutting at `/`.

### Decision D: two defects found while characterizing

The floor decision captures anything found while working the floor. The Navigator
decided otherwise for the duplicate child package: it is fixed inside CR018 (designs 1
and 2), recorded as an amendment to the
[floor decision](../../decisions.md#the-cv22-release-is-gated-on-an-ariad-trust-floor-worked-before-us3).
It is the floor's first class, silent damage, and design 7 depends on it: link-free
titles rename the folders Expand derives for children whose titles carry links, so
without design 1 each such child already expanded would be written a second time. The
escaped pipe is captured as CR107, outside the floor.

### Affected files

- `ts/src/builder/storyPaths.ts`: one claim lookup shared by `resolveStoryDirectory` and
  Expand; `titleLeaf` deleted; `createStoryDirectory` slugs the whole title.
- `ts/src/builder/expand.ts`: children settled by heading before any write;
  `linkFreeTitle` on candidate-table titles; the synthesized story takes the whole title.
- `ts/src/builder/argv.ts`: both dispatchers answer `StoryPackageAmbiguityError` with an
  `Error:` line.
- `ts/src/builder/pullCandidates.ts`: the bullet reader stops chaining; `linkFreeTitle` on
  heading, table, and bullet titles.
- `ts/src/builder/roadmapScope.ts`: `linkFreeTitle` on package titles.
- `ts/src/builder/roadmapGrammar.ts`: `linkFreeTitle`.
- `ts/src/builder/cursorTransitions.ts`: `cvTitle` deleted.
- `ts/src/builder/pull.ts` and `deliveryStoryReady.ts`: `linkFreeTitle` on
  `--item-title`; the CV title as a render input; rows per the table.
- `ts/src/builder/pullCandidatesRender.ts` and `homeSurface.ts`: no cut; Snapshot rows per
  the table.
- `ts/src/builder/commands.ts`: `roadmapPlanContext` without the split; the one CV-title
  helper for Pull and Ready.
- `ts/src/builder/card.ts`: a one-line row that ends in `…` when cut, for `cardText` and
  `cardLine` rows.
- Tests: in `ts/test/builder/roadmap.test.ts` the two `titleLeaf` tests are replaced;
  unit tests for the claim lookup, `linkFreeTitle`, and the cut row; one test that walks
  all fourteen commands over a doubly claimed code; one end-to-end regression over the
  validation route's roadmap.
- Goldens: `builder-roadmap` (the `title_leaf` kind removed; `create_story_directory`
  for `Chained title / with a leaf segment` and `/etc/passwd`; the `heading_grammar`
  candidate titles and their three renders; the `dialect` package titled with one whole
  link, and its three renders); `builder-command` and `builder-lifecycle` (the twelve CV
  rows, the chained `DS-35` title, and every row C1 marks with `…`). Each edit is made
  by a script that parses the golden, changes only the named rows, and asserts their
  count. The README row records the counts.

### Plateaus

One reason per golden diff. Expand comes first because it is silent damage, and because
plateau 5 changes the folder names Expand derives.

1. **Expand finds children by heading, and a doubly claimed code is refused.** Red first:
   the route's human-named child and its duplicated package.
2. **Whole titles:** the chain and the five cuts go, and the folder rule changes. Golden
   edits for titles.
3. **The CV's own title:** the CV rows of Pull and Ready come from the scope. Golden edits
   for the twelve CV rows.
4. **Width** (C1): wraps and `…` per the table. Golden edits for the marked rows.
5. **Link-free titles** (B1): `linkFreeTitle` where titles enter. Golden edits for the
   `dialect` package.
6. **Close:** the validation route's observed output recorded, Navigator validation, and
   the handoff review.

### Acceptance criteria

1. Expand reports an authored child `existing`, wherever its heading lives, and writes no
   second package. A child no package claims is created as today.
2. A child code claimed twice blocks Expand with `EXPAND_BLOCKED` before any file is
   written.
3. When two packages claim the active item's code, each of the fourteen commands either
   refuses for a reason it checks earlier or prints one `Error:` line naming both
   claimants, exits 1, and prints no stack trace. The cursor and the project tree are
   unchanged either way.
4. On the route's roadmap, no surface shows a title fragment that begins after a `/` or
   ends before one: not `index.md)): the dead path goes`, `write paths`, `server split`,
   `hygiene`, or `or fallbacks`.
5. Pull and Ready name CV1 `Builder/Ariad trust`, the title Project Position shows, and
   never the item's. With no roadmap row or package for the CV, the row carries the
   scope placeholder, never borrowed text.
6. A Delivery Story from a CV's bullet list is named by its own title.
7. The Plan's objective, scope, acceptance, and sibling non-goals name titles whole, on
   the card and in `plan.md`. The sibling non-goal reads ``Audit `pub`/`allow(dead_code)`
   items and read/write paths``.
8. Under C1, rows marked "wraps in full" never cut. Rows marked `…` end in `…` exactly
   when cut, and are byte-identical to today when they fit.
9. Under B1, no surface, generated file, or new folder name carries a title's link
   target. Each keeps the label: `(see CV1.DS2)`, `(per D12)`. A link inside a code span,
   and a link with an empty label, are left as written.
10. An authored package is still found by heading. A new package whose title contains `/`
    gets the whole-title slug, and traversal-shaped titles (`../../escape`, `/etc/passwd`)
    still land inside the roadmap root.
11. The cursor stores `--item-title` with its links reduced to labels. Nothing already
    stored is rewritten.
12. An authored `index.md` and `plan.md` still survive `plan-item` byte for byte (CR079).
13. `npm test`, `npm run typecheck`, `npm run lint`, and CI are green, and every golden
    edit has its README row with counts.

### Validation route

CLI only, with an isolated home (`MIRROR_HOME=/tmp/…`, no `.env`). No Pi session: one in a
scratch home copies the whole Pi history into it (CR106). It is the characterization
script: today it prints every defect above, and after the change it must print none.

Runnable from the repository root in bash or zsh. It deletes its temporary directory. The
helper carries a `cr018` prefix so no shell alias can shadow it, and the step markers are
`echo`s, because an interactive zsh does not treat `#` as a comment by default:

```bash
V=$(mktemp -d) && mkdir -p "$V/home" && export MIRROR_HOME="$V/home" NODE_OPTIONS=--no-warnings
cr018() { node ts/src/frontDoor/cli.ts "$@"; }
R="$V/p/docs/project/roadmap" && mkdir -p "$R/cv1/ds1/ts1" "$R/cv1/ds1/ts2" "$R/cv1/ds2/us2-kept-by-a-human" && printf '# Roadmap\n' > "$R/index.md"
printf '# CV1 — Builder/Ariad trust\n\n**Status:** 🟢 Active\n' > "$R/cv1/index.md"
printf '# CV1.DS1 — Dead code / hygiene\n\n**Status:** 🟡 Planned\n**Type:** Delivery Story\n' > "$R/cv1/ds1/index.md"
printf '# CV1.DS1.TS1 — Remove the dormant pair (`executeToolCallsWeb` + route `/v1/mcp/execute`) (see [CV1.DS2](../../ds2/index.md)): the dead path goes\n\n**Status:** 🟡 Planned\n**Type:** Technical Story\n' > "$R/cv1/ds1/ts1/index.md"
printf '# CV1.DS1.TS2 — Audit `pub`/`allow(dead_code)` items and read/write paths\n\n**Status:** 🟡 Planned\n**Type:** Technical Story\n' > "$R/cv1/ds1/ts2/index.md"
printf '# CV1.DS2 — Web retirement: client/server split\n\n**Status:** 🟡 Planned\n**Type:** Delivery Story\n\n## Candidate Stories\n\n| Code | Story | Type | Status |\n|------|-------|------|--------|\n| CV1.DS2.US1 | Retire the web surface (per [D12](../../../decisions/d12.md)) and its and/or fallbacks | User Story | 🟡 Planned |\n| [CV1.DS2.US2](us2-kept-by-a-human/index.md) | Keep the export | User Story | 🟡 Planned |\n' > "$R/cv1/ds2/index.md"
printf '# CV1.DS2.US2 — Keep the export\n\n**Status:** 🟡 Planned\n**Type:** User Story\n\nAuthored by a human.\n' > "$R/cv1/ds2/us2-kept-by-a-human/index.md"
git -C "$V/p" init -q && printf '# j\n' | cr018 identity set journey j > /dev/null && cr018 journey set-path j "$V/p" > /dev/null 2>&1
cr018 build adopt --journey j --method ariad > /dev/null && cr018 build sync-cursor --journey j --method ariad > /dev/null
echo '--- step 1: pull a Technical Story whose title has a link and slashes inside code'
cr018 build pull-item --journey j --method ariad --item-code CV1.DS1.TS1 --item-level technical_story --why-now "CR018" \
  --item-title 'Remove the dormant pair (`executeToolCallsWeb` + route `/v1/mcp/execute`) (see [CV1.DS2](../../ds2/index.md)): the dead path goes' \
  | sed -n '/ACTIVATED/,/│ intent/p'
echo '--- step 2: plan it; the card, then plan.md'
cr018 build prepare-item --journey j --method ariad > /dev/null
cr018 build plan-item --journey j --method ariad | sed -n '/│ plan  /,/│ acceptance/p'
sed -n '/^## Objective/,/^## Acceptance/p' "$R/cv1/ds1/ts1/plan.md"
echo '--- step 3: pull a Delivery Story; Expand writes one child and finds the other'
cr018 build pull-item --journey j --method ariad --item-code CV1.DS2 --item-level delivery_story --why-now "CR018" \
  --item-title 'Web retirement: client/server split' \
  | sed -n '/What was pulled/,/What did Prepare/p;/recommended next/,/Recommended flow/p;/existing US/{N;p;};/created US/{N;p;}'
grep -h 'D12' "$R"/cv1/ds2/*/index.md
grep -rl '^# CV1.DS2.US2 ' "$R" | sed "s|$R/||"
echo '--- step 4: the roadmap snapshot'
cr018 build pull-candidates --journey j --method ariad | sed -n '/ROADMAP SNAPSHOT/,/Recently promoted/p' | grep '🟦\|🟪'
echo '--- step 5: two packages claim one code, then Plan'
cp -R "$R/cv1/ds1/ts2" "$R/cv1/ds1/ts2-copy"
cr018 build pull-item --journey j --method ariad --item-code CV1.DS1.TS2 --item-level technical_story --why-now "CR018" \
  --item-title 'Audit `pub`/`allow(dead_code)` items and read/write paths' > /dev/null
cr018 build prepare-item --journey j --method ariad > /dev/null
cr018 build plan-item --journey j --method ariad > "$V/out" 2>&1; echo "exit $?"; grep -c '^ *at ' "$V/out" | sed 's/^/stack lines: /'; grep -m1 'claim' "$V/out" | sed 's|[^ ,]*/docs/project/roadmap/||g'
unset MIRROR_HOME; rm -rf "$V"
```

Pass:

- Step 1: the header shows the whole TS1 title, reading `(see CV1.DS2)`; the CV row is
  `🟪[CV1] Builder/Ariad trust`; the item row starts `└─ 🟦[TS1] Remove the dormant pair`
  and ends in `…`.
- Step 2: the whole title, link-free, on the card and in `plan.md`, and the TS2 sibling
  whole.
- Step 3: `Web retirement: client/server split`, `🟪[CV1] Builder/Ariad trust`, and the
  whole US1 title as the recommendation, reading `(per D12)`. US1 is `created`; US2 is
  `existing` at `us2-kept-by-a-human`. The D12 lines read `(per D12)`, with no `](`, and
  one file claims `CV1.DS2.US2`.
- Step 4: every item named whole or ending in `…`, and US2 listed once.
- Step 5: `exit 1`, `stack lines: 0`, and one `Error:` line naming `cv1/ds1/ts2` and
  `cv1/ds1/ts2-copy`.

Fail: any fragment from criterion 4; `🟪[CV1] Remove` or `🟪[CV1] Web retirement`; `](` in
step 3's D12 lines; a second file claiming `CV1.DS2.US2`; or any stack line in step 5.

### Conscious exclusions

- Link rewriting (B3).
- Escaped pipes in tables: [CR107](cr107-an-escaped-pipe-in-a-candidate-table-title-is-read-as-a-cell-border.md).
- The Pull card's `DELIVERY STORY ACTIVATED` label for every level, and tree rows that
  name only the last code segment.
- Absolute paths in Plan and Expand surfaces (CR082), including the claimants the new
  `Error:` line and `EXPAND_BLOCKED` name.
- `build show` on a doubly claimed code prints the same `Error:` line, rather than a
  checkpoint that names the conflict.
- Titles already stored in cursors: a chained or linked title stored before this change
  shows as stored until its item is pulled again.
- Generated files already in repositories: they are records.
- Reference-style links (`[label][ref]`) in titles, and truncation of rows that carry no
  title.

### Authority boundaries

Plan approval moves CR018 to `planned`. A human Driver and a Delivery reference are
required before `in_progress`. `validated` requires the Navigator to walk the route above
and accept it. Each plateau is committed on the Delivery branch and pushed when green,
with GitHub Actions verified after every push. Merge, publication, and release are not
authorized.

Navigator decisions, 2026-09-27: Driver `@viniciusteles`, Delivery `mirror-ts-core`.

### Panel review (2026-09-27)

Plan review before implementation, per the CV22 collaboration strategy: the
quality-assurance draft reviewed by engineer, database-architect, devops-engineer,
security-engineer, ai-engineer, prompt-engineer, experience-designer, and
product-designer. Only dissent was recorded.

Synthesis: sound, and aimed at the cause rather than the symptoms. One function builds a
`/` chain and five copies of one cut undo it, so removing the chain removes every cut.
Risk concentrates in two places. One is which one-line rows may still cut a title,
because agents copy titles out of surfaces. The other is the frozen goldens, where about
forty expected values change by hand. The plan succeeds if every title a Navigator or an
agent reads is whole or visibly cut, and no file Ariad writes carries a link resolved for
another file.

| Lens | Dissent | Resolution |
|---|---|---|
| ai-engineer | The skill tells the agent to pull a confirmed child "using the recommended code/title from the surface". The draft cut Ready's recommended row, so the agent would pass a `…`-cut title to `--item-title`, and the cursor and the Plan's `index.md` heading would carry it | Rows an agent copies from, and a title's only appearance in an output, wrap in full; only restatements are cut ([Surface rows](#surface-rows)) |
| engineer | The draft's first plateau bundled four behaviors, and its golden diff mixed two reasons: cut titles and the borrowed CV title. A frozen golden edited for two reasons at once cannot be reviewed row by row | One reason per golden diff ([Plateaus](#plateaus)) |
| devops-engineer | About forty expected values in frozen goldens change by hand, and a hand edit is where a regression can pass as intent | Every edit by a script that parses the golden, changes only the named rows, and asserts their count, as CR008 and F19 did; the counts go in the README row |
| experience-designer | B2 puts raw Markdown into the Navigator's decision card. A terminal cannot render a link, so its target is machinery showing through, and a kia-desktop title with two links turns the Pull header into several lines of paths | The Navigator chose B1 |

The database-architect, security-engineer, prompt-engineer, and product-designer lenses
raised no objection to the draft. Removing the chain retires a field that encoded two
values behind a delimiter the values themselves contain. `kebabSlug` and the confinement
guard checked after resolution, not `titleLeaf`, were always what kept a title inside the
roadmap root, and criterion 10 keeps both traversal scenarios.

### Delta review (2026-09-27)

The Navigator's decisions changed three parts of the plan after the review: B1 applied
where titles enter, Expand finding children by heading, and the refusal of a doubly
claimed code. Those parts went back to the same panel.

| Lens | Dissent | Resolution |
|---|---|---|
| engineer | A catch in the dispatchers turns `StoryPackageAmbiguityError` into an `Error:` line wherever it is thrown, including after a write in some future command, where the line would hide the write | Today every throw precedes its command's first write, and the test that walks the fourteen commands asserts the cursor and the project tree unchanged. The line claims nothing about what changed, as the skill already says of every `Error:` line |
| engineer | Expand writes the Delivery Story's `index.md`, then its children one by one. Resolving each child in turn would let a doubly claimed third child block Expand after two were written, while `EXPAND_BLOCKED` says no files were materialized | Every child is settled before the first write ([Design](#design) 1) |

The database architect accepted that a cursor written before the change keeps its links
until its item is pulled again: no reader depends on the shape, and a backfill would
rewrite what the Navigator typed. The security engineer noted that resolving a child
anywhere in the tree adds no write, because an existing child is reported and never
touched. The other lenses raised nothing new.

## Evidence

Session of 2026-09-07 on journey `kia-desktop`. The `PLAN_CHECKPOINT` for
`CV8.DS4.TS1` and the `DELIVERY_STORY_IDENTIFIED` / `PLAN_CHECKPOINT` for
`CV8.DS4.TS3` as rendered by the runtime; the generated
`cv8-ds4-ts1-…/plan.md` and `cv8-ds4-ts3-…/plan.md` before the Driver rewrote
them (visible in the kia-desktop history as the scaffold the story commits
replaced). Depth symptom: kia-desktop CR193 and the five `TD-007` / `CR143`
link repairs it records.

### Found during CR002's validation (2026-09-26)

The other half of the same convention. The Pull surface's `roadmap placement` row
names the CV with the pulled item's own title:

```text
pull-item CV20.DS12.TS1 --item-title "Canonical Refinement Index And Artifact Convention"

roadmap placement
🟪[CV20] Canonical Refinement Index And Artifact Conven
  └─ 🟦[TS1] Canonical Refinement Index And Artifact Co
```

`renderPullReport` (`ts/src/builder/pull.ts`) takes that row's title from
`cvTitle(item.title)` (`ts/src/builder/cursorTransitions.ts`), the head of a
`CV title / item title` chain, just as `titleLeaf` takes its tail. A title with
no `/` has no chain, so its head is the whole item title. The CV code on the row
is right; only its title is borrowed. Carrying titles as opaque strings, as the
expected behavior asks, leaves the row with nothing to borrow: the CV's title has
to come from the CV's own package or roadmap row. Reported by
[CR002](cr002-cursor-sync-roadmap-selection.md), which did not touch `pull.ts`.

### Characterization (2026-09-27)

The real front door at `4169c2ad` ran the [validation route](#validation-route) against
an isolated `MIRROR_HOME`, with no `.env` and no Pi session. Bash and zsh printed
identical output:

```text
--- step 1: pull a Technical Story whose title has a link and slashes inside code
│        🟪■  DELIVERY STORY ACTIVATED                   │
│                                                        │
│ index.md)): the dead path goes                         │
│                                                        │
│ source                                                 │
│ roadmap candidate                                      │
│                                                        │
│ roadmap placement                                      │
│ 🟪[CV1] Remove the dormant pair (`executeToolCallsWeb`  │
│   └─ 🟦[TS1] index.md)): the dead path goes             │
│                                                        │
│ intent                                                 │
--- step 2: plan it; the card, then plan.md
│ plan                                                   │
│ Plan the smallest coherent, testable slice for         │
│ index.md)): the dead path goes.                        │
│                                                        │
│ scope                                                  │
│ ✓ Deliver index.md)): the dead path goes as an         │
│   observable slice.                                    │
│ ✓ Keep the implementation narrow enough to validate at │
│   the Plan-defined checkpoint.                         │
│                                                        │
│ non-goals                                              │
│ ○ Do not implement sibling roadmap item: write paths.  │
│                                                        │
│ acceptance                                             │
## Objective

Plan the smallest coherent, testable slice for index.md)): the dead path goes.

## Scope

- Deliver index.md)): the dead path goes as an observable slice.
- Keep the implementation narrow enough to validate at the Plan-defined checkpoint.

## Non-Goals

- Do not implement sibling roadmap item: write paths.

## Acceptance Behavior
--- step 3: pull a Delivery Story; Expand writes one child and finds the other
│ What was pulled?                                       │
│ server split                                           │
│                                                        │
│ Where are we in the roadmap?                           │
│ 🟪[CV1] Web retirement: client                          │
│   └─ 🟦[DS2] server split                               │
│                                                        │
│ What did Prepare find?                                 │
│ What is recommended next?                              │
│ 🟩[US1] Retire the web surface (per [D12](../../../deci │
│                                                        │
│ Recommended flow unit                                  │
│ ✓ created US1 package                                  │
│ docs/project/roadmap/cv1/ds2/cv1-ds2-us1-retire-the-we │
│ ✓ created US2 package                                  │
│ docs/project/roadmap/cv1/ds2/cv1-ds2-us2-keep-the-expo │
# CV1.DS2.US1 — Retire the web surface (per [D12](../../../decisions/d12.md)) and its and/or fallbacks
I want to Retire the web surface (per [D12](../../../decisions/d12.md)) and its and/or fallbacks,
Navigator can validate Retire the web surface (per [D12](../../../decisions/d12.md)) and its and/or fallbacks as an observable behavior.
Given the user is ready for Retire the web surface (per [D12](../../../decisions/d12.md)) and its and/or fallbacks
- Retire the web surface (per [D12](../../../decisions/d12.md)) and its and/or fallbacks
cv1/ds2/cv1-ds2-us2-keep-the-export/index.md
cv1/ds2/us2-kept-by-a-human/index.md
--- step 4: the roadmap snapshot
│ 🟪[CV1]  Builder/Ariad trust                   ◉ active │
│    └─ 🟦[US1] or fallbacks                    ◉ current │
│       ○ 🟦[CV1.DS1] hygiene                             │
│       ○ 🟦[CV1.DS1.TS1] index.md)): the dead path goes  │
│       ○ 🟦[CV1.DS1.TS2] write paths                     │
│       ○ 🟦[CV1.DS2.US1] or fallbacks                    │
│       ○ 🟦[CV1.DS2.US2] Keep the export                 │
│       ○ 🟦[CV1.DS2.US2] Keep the export                 │
--- step 5: two packages claim one code, then Plan
exit 1
stack lines: 10
StoryPackageAmbiguityError: 2 roadmap packages claim code 'CV1.DS1.TS2': cv1/ds1/ts2, cv1/ds1/ts2-copy
```

The escaped pipe was reproduced on its own scratch project: an authored table cell
``Read `a \| b` input`` gave Expand's recommendation and the child's heading
``Read `a \``.

### Plateau 1 handoff (2026-09-27)

Now true: Expand settles a Delivery Story and every child against one reading of the
roadmap before it writes anything. A child an authored package claims is reported
`existing` where it lives and never written again. A child two packages claim blocks
Expand with `EXPAND_BLOCKED` while nothing is yet on disk. A Delivery Story with no
package refuses to invent a `US1` that an authored package already claims.
`storyDirectoryResolver` in `storyPaths.ts` is that one reading, and
`resolveStoryDirectory` asks it about one code, so the two cannot drift. Both Builder
dispatchers answer `StoryPackageAmbiguityError` with one `Error:` line naming the
claimants, exit 1.

Evidence: four tests, red first. The human-named child was written a second time; a
doubly claimed child let Expand exit 0 and write its sibling; a package-less Delivery
Story invented a duplicate `US1`; and `show` threw. They are green now. A mutant that
settles each child only in its turn fails the double-claim test, because the table lists
TS2 before the doubly claimed TS1. The walk over all fourteen commands asserts, for each,
one `Error:` line naming both claimants, an empty stdout, and the database and project
tree unchanged. Every one of them crashed before the change. On the real front door,
route steps 3 and 5 now print `existing US2 package` at `us2-kept-by-a-human`, one file
claiming `CV1.DS2.US2`, and `exit 1`, `stack lines: 0`, and one `Error:` line. No golden
changed. The full suite passes (2,731 tests), along with typecheck, lint, the four
repository checks, and the Builder lifecycle smoke.

Remaining: every title change. Next: plateau 2, whole titles.

### Plateau 2 handoff (2026-09-27)

Now true: no reader cuts a title at a `/`. A Delivery Story from a CV's bullet list
carries its own title, and `titleLeaf`, `lastTitleSegment`, `candidateShortTitle`, and
the split in `roadmapPlanContext` are gone. Pull, Ready, the Snapshot, Project Position,
Builder Orientation, and the Plan's prose name titles whole. A new package's folder is
named from the whole title, as Expand already named a child's, and the story Expand
invents for a Delivery Story with no package takes the whole title too. `cvTitle`
remains, and the CV row still borrows the item's title: that is plateau 3's.

Evidence: the end-to-end test over the route's roadmap, without its links, was red first
on Pull's header. It is green now for Pull's header and tree rows, the Plan's objective,
scope, and sibling non-goal on the card and in `plan.md`, Ready's pulled, tree, and
recommended rows, and the Snapshot's current and backlog rows. A roadmap test pins the
bullet-list title and the whole-title folder; a mutant that restores the prefix and one
that restores the cut in folder names each fail it. Golden edits, by script with asserted
counts and a README row: `builder-roadmap` (the `title_leaf` kind, two folders, the
`heading_grammar` titles and renders), `builder-orientation`, which the plan did not
name, for the one real slash-bearing title in the goldens (`Builder/Ariad tree`, two
scenarios), and `builder-lifecycle` (a Pull and a Ready, and the sequence that pinned the
old rule, renamed `expand_fallback_uses_the_whole_delivery_story_title`). The full suite
passes (2,732 tests), along with typecheck, lint, the repository checks, and the Builder
lifecycle smoke. CI was green on plateau 1.

Remaining: the CV's own title, width, and links. Next: plateau 3.

### Plateau 3 handoff (2026-09-27)

Now true: Pull and Ready name the CV by its own title. `placementCvTitle` in `pull.ts`
composes CR002's `resolveRoadmapScope` and `scopeFocus`, so the row is the focus Project
Position shows for the same cursor: the roadmap index row, else the CV package's
heading, else `no authored package` or `no project path`. The renderers take the title
as an input. The command layer and the lifecycle replay both call the one helper, and
`cvTitle` is deleted.

Evidence: two end-to-end tests, red first. On the route's roadmap, Pull and Ready read
`🟪[CV1] Builder/Ariad trust`, the Snapshot's own name for it, where they read
`Remove the dormant pair …`. With the CV's package removed, Pull reads
`🟪[CV1] no authored package`, where it read ``Audit `pub` ``. Golden edits, by script
with a README row: ten CV rows, three in `builder-command` and seven in
`builder-lifecycle`, and nothing else in any surface. Each new value was checked against
the files its sequence's project holds at that step: five of those projects hold no row
or package for their CV, so their Pulls had named a CV with nothing but the item's own
title. The full suite passes (2,734 tests), along with typecheck, lint, the repository
checks, and the Builder lifecycle smoke. CI was green on plateau 2.

Remaining: width and links. Next: plateau 4.

### Plateau 4 handoff (2026-09-27)

Now true: every row in the [Surface rows](#surface-rows) table behaves as the table says.
Pull's header, the CV rows of Pull and Ready, Ready's recommendation, and the Snapshot's
`value:` row wrap in full. The tree rows of Pull and Ready, and the Snapshot's focus,
current, and backlog rows, stay on one line and end in `…` when cut, and the Snapshot
keeps its status marker whole. `card.ts` gains `cardClipped` and a `clip` option on
`cardLine`. `cardText` still cuts silently, for every row that carries no title.

Evidence: unit tests for the two primitives, and an end-to-end test over a roadmap whose
CV, Delivery Story, and story titles all exceed the card; both were red first. A row
that fits is unchanged, which the goldens prove across the board: no golden changed,
because every title row they record fits the card. The plateau 2 test's backlog check
now reads a row without its `…`. The full suite passes (2,737 tests), along with
typecheck, lint, the repository checks, and the Builder lifecycle smoke. CI was green on
plateau 3.

Remaining: links. Next: plateau 5.

Plateau 4's first push failed CI's Biome step: the new card test was pushed unformatted,
after a lint of `src/builder` alone. `7a69fb38` formats it and changes nothing else. The
whole-tree `npm run lint` is back in the pre-push set.

### Plateau 5 handoff (2026-09-27)

Now true: a title enters Ariad with each Markdown link reduced to its label.
`linkFreeTitle` in `roadmapGrammar.ts` does it, beside `stripMarkdownLink`, and runs
where a title enters: the package-heading and CV-heading readers, the index-table and
bullet readers, Expand's candidate table, the package reader behind the scope, and
Pull's `--item-title`. So every surface, every generated file, and every new folder name
carries the label, never a target written for another file. A link inside a code span
stays as written, as does a link with an empty label. The cursor stores the link-free
title.

Evidence: unit tests for twelve cases of `linkFreeTitle`, and an end-to-end test over the
route's linked roadmap, red first on the cursor. It asserts Pull's header, the stored
title, the Plan's objective and card, Ready's recommendation, the child folder named
from the label, the child scaffold holding the label five times with no link one level
short, and the Snapshot and Pull Candidates. A mutant that drops the rule from the
package-heading reader fails the end-to-end test; one that ignores code spans fails the
unit test. Golden edits, by script with a README row: the `dialect` fixture's package,
whose heading's title is one whole link (one title, three renders). The validation route
now prints every pass condition, in bash and zsh alike. The full suite passes (2,739
tests), along with typecheck, the whole-tree lint, the repository checks, and the Builder
lifecycle smoke.

Remaining: plateau 6, meaning the route's output recorded, Navigator validation, and the
handoff review.

## Outcome

Pending.
