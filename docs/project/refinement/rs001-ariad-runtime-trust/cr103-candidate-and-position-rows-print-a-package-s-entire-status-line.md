[< RS001](index.md) · [Canonical status](../index.md#change-requests)

# CR103 — Candidate and position rows print a roadmap package's entire status line

## Problem

### As captured (2026-09-26)

Builder surfaces interpolate a roadmap package's `**Status:**` value verbatim, and
several packages in this project use that line as a running changelog:

- `CV9.E2`'s status line is 5,458 characters on `HEAD` (5,228 at `dfd44051`). In
  `PROJECT_POSITION`'s candidate list it rendered as about 90 card lines during
  CR002's Navigator validation. That list is most of the first screen a fresh
  journey reads before choosing its first pull.
- `CV22`'s status line is 967 characters. `■ BUILDER RESUME` prints it whole in
  the `roadmap position` row, about 20 card lines, on every
  `/mm-build mirror-ts-core`.

Two formatters print the status raw. `formatCandidate`
(`ts/src/builder/pullCandidates.ts`) feeds the `PROJECT_POSITION` and
`PULL_CANDIDATES` lists and the `recommended pull` row. `formatPackage`
(`ts/src/builder/scopePhrases.ts`) feeds the resume row. Both behaviors predate
CR002, which kept the existing formats: `formatPackage` reproduces Python's
`_format_roadmap_position`.

### As characterized (2026-10-04)

Reproduced at `548e70a2` in a scratch home with the [validation route](#validation-route);
its output is under [Evidence](#the-route-before-the-change). The capture holds, and
the defect is wider than it says: three formatters feed five surfaces, and the readers
behind them classify a package by the same whole line.

**The two formatters the capture names.** On a copy of this repository's roadmap, a
journey with no item pulled gets a `PROJECT_POSITION` of 205 card lines, 190 of them
the project-wide candidate list, where CV9.E2's row is 117 lines and CV22's 24 (route
step 1); `PULL_CANDIDATES` is 209 (step 2). With CV22.DS10.US3 pulled, the resume's
`roadmap position` row is 23 lines (step 3): CV22's whole status, with ten `**` and two
relative links, `](../../decisions.md#…)`, which are true only in the file they were
written in. Of the 366 `**Status:**` lines under `docs/project/roadmap`, 54 are longer
than the 24 code points a status takes, 34 longer than a card row, 21 longer than 80,
and 8 longer than 200; the longest is 5,417. A status that continues on a second
physical line is read to the end of its first, so a row prints a fragment cut
mid-sentence: US3's reads `…drafted and panel-reviewed the`.

**A third formatter the capture missed: `statusMarker`'s fallback.** The
`ROADMAP_SNAPSHOT` focus row and `PROJECT_POSITION`'s `progress:` line print a marker
for a status that contains Active, In Progress, Candidate, Planned, or Done, and for any
other the whole status, lowercased, after `○`. `Blocked` is a candidate status
(`CANDIDATE_STATUSES`) with no marker. A Blocked CV in focus prints its status whole on
the right of the focus row, 86 code points in a 58-wide frame; `cardLine` gives the
title what is left, one column, so the title is `…` and the border is pushed off the
card (step 6). Seventeen of the 366 lines take the fallback.

**The row's words are Markdown inside a fixed-width card.** `**` and backticks print
raw (24 and 22 in the candidate list of step 1), and a terminal that renders the reply
as Markdown, Claude Code's, swallows them and shifts the border (CR102's evidence). A
link prints with its target.

**The readers classify by the whole line, by substring.** `hasCandidateStatus` keeps a
package whose status contains a candidate word anywhere; `recommend` ranks by the first
word found, in status order; `statusMarker` tests Active before Done. So (step 7):

- `🔴 Blocked — Planned work waits on the vendor` is recommended over a sibling
  `🟡 Candidate`, because `recommend`'s outer loop finds `Planned` in it first;
- `✅ Done — Active development moved to CV4` is listed as a candidate, under a row
  that says Done.

Today the whole line at least shows the reader why. A row that printed the first clause
alone, with the readers unchanged, would recommend a story it shows as Blocked and list
one it shows as Done: the fix would make the contradiction and hide its cause.

**The corpus supports the first clause.** Reduced to the clause before the first
separator (` — `, `; `, `, `, `. `, ` (`, ` · `, `: `), the 366 lines hold 18 distinct
clauses, each the status its author meant: `✅ Done` (260), `Done` (59), `🟡 Planned`
(15), `Planned` (7), `🟢 In Progress` (5), `Future`, `🟢 Active`, `⛔ Retired unported`,
`⏭️ Cancelled`, `Superseded by CV9.E6 Web Visibility`, `Deferred until the relevant
TypeScript migration seams mature`, and so on; seven legacy stories carry a bare `—`.
All but one lead with the status word (`🟢 Phase 1 + E2 Done`). Reading the clause
instead of the line changes no candidate and no recommendation on HEAD; it changes the
marker of four packages, none of which is a CV a journey can hold in focus. The 173
status cells of the candidate tables Expand reads give the same answer: none reads
differently for Done.

**A gate reads the same line and gets it wrong the other way.** The Delivery Story Done
preflight (`isDone` in `deliveryStoryRoadmapClosure.ts`, CR016) passes a package or a
table row only when its status line's last word is `done`. On HEAD it would refuse 47 of
this roadmap's 320 Done statuses (`✅ Done · 2026-05-11`, `✅ Done — 2026-09-25. …`) with
the words `package status is not Done`, and pass `Not done`. Captured as
[CR119](cr119-the-delivery-story-done-preflight-reads-a-status-line-s-last-word.md),
outside the floor (D4).

## Expected Behavior

A row states a package's status as the first clause of its `**Status:**` line, in the
author's words, with Markdown reduced and bounded to fit the row, and never prints the
whole authored line. The readers that choose candidates, rank them, and mark a focus
read that same clause, so a row never lists as a candidate what it shows as Done, nor
recommends what it shows as Blocked. The full status stays in the package, whose path
the row already names. A Blocked CV in focus keeps its title and its border.

## Impact

The codes, titles, and levels the Navigator needs to choose a pull are buried under
changelog prose. The agent reads the same surfaces, so each activation spends context on
thousands of characters of it: the two unscoped surfaces of this roadmap are 24,570
characters together. A Blocked CV in focus loses its title. And the Navigator's choice
can be steered by a word in a changelog: a Blocked story ranked first, a Done story
offered.

## Plan Or Decision

Captured 2026-09-26 while working CR002, and taken onto the Ariad trust floor on
2026-09-30 by the Navigator's decision
([Decisions](../../decisions.md#the-cv22-release-is-gated-on-an-ariad-trust-floor-worked-before-us3)),
sixth in floor order, after CR082 with CR009. The capture asked where the fix belongs:
rendering, authoring, or both. D1 below answers it.

**Approved 2026-10-04** by the Navigator, with D1 to D4 as taken the same day and
recorded under [Decisions](#decisions-the-navigator-took). The panel reviewed it twice
before the plan was presented ([record below](#panel-review-2026-10-04)), and both
passes' changes are folded in.

### Objective

Every Builder row that states a roadmap package's status states the first clause of
the package's `**Status:**` line, in the author's words, Markdown reduced, bounded to
fit the row; and every reader that classifies a package by its status reads that same
clause. The rest of the line stays in the package, whose path the row names. No Builder
surface prints the whole line, and a Blocked CV in focus keeps its title and its border.

### Design

**One reading of a status line (D2, D3).** `statusClause` in `roadmapGrammar.ts`,
beside `matchStatus` and `linkFreeTitle`, takes the line as written and returns its
clause:

1. `pyStrip`, as every cell and value in the grammar is stripped;
2. Markdown reduced: links and images to their labels through `linkFreeTitle`, which
   leaves a code span as written, then `**`, `__`, and backticks removed;
3. the clause cut before the first separator: ` — `, ` – `, ` - `, `; `, `, `, `. `,
   ` (`, ` · `, `: `. A separator at the start does not cut;
4. trailing `.`, `:`, `;`, and `,` dropped, and `pyStrip` again. A clause that is empty
   after the cut gives way to the reduced line;
5. bounded to `STATUS_CLAUSE_WIDTH`, 24 code points, by the rule `cardClipped` uses:
   `…` in the last place, and a cut that would split a word backed up to the word's
   start (CR018). That rule moves from `card.ts`'s private `clipped` to
   `ts/src/util/clipCodePoints.ts`; `card.ts` calls it, and its bytes do not change.

Why links first and the cut after: a separator inside a link's target, `plan - draft.md`,
must not cut, a label's words are the author's words and cut like any, and a `**` that
closes after the separator (`✅ **Done — 2026-09-23.**`) must still go. Why 24: the widest clause on this
roadmap that is a status and not a sentence is `🟢 Validated and reviewed`, 24; the
snapshot's focus row gives the title what the marker leaves of 54, so a marker of at
most 26 (`○ ` and the clause) leaves 27 for the title; and a candidate row keeps its
code, title, level, and status on its first two lines.

`matchStatus` keeps returning the line as written: it is graded as such (the
`match_status` goldens), and the Done preflight reads its own line (CR119). The clause
is applied where a status leaves a reader, so a status in a `PullCandidate`, a
`RoadmapSnapshotItem`, an `AuthoredPackage`, or a `CandidateChild` is a clause by
construction: `cvTableItems`, `dsTableItems`, `cvHeadingItems`,
`candidateFromIndexContent`, and `candidateDeliveryStoriesFromContent` in
`pullCandidates.ts`; `readPackage` in `roadmapScope.ts`; `parseCandidateStories` in
`roadmapGrammar.ts`. The four types say so where the next reader looks: the `status`
field of each is documented as the clause, not the line (panel: engineer).
`hasCandidateStatus`, `recommend`, `statusMarker`, Expand's `firstPendingChild`,
`formatCandidate`, `formatPackage`, `projectFocusLines`, and the snapshot's focus row
change no code: they read and print the clause, because that is what reaches them. The
seventh reader is D3's reach: the candidate-table cell Expand reads takes the same
clause, so `🟡 Planned — Done condition pending` is pending; on HEAD none of the 173
cells reads differently.

**`statusMarker` falls back to the clause.** Unchanged code; the fallback prints `○ `
and the clause lowercased, at most 26 code points, so the snapshot's focus row holds
its title and its border. A Blocked CV reads `○ 🔴 blocked`. No marker is added for
Blocked and none of the five is changed: the marker vocabulary is the two surfaces'
own, and the clause already says what the author wrote (D2).

**The surfaces.** `PROJECT_POSITION` and its Done trailer, `PULL_CANDIDATES`,
`ROADMAP_SNAPSHOT`, and `■ BUILDER RESUME`. No format string changes; the rows shrink
because the status they are given does. On this roadmap at `548e70a2`, the prototype of
the rule takes `PROJECT_POSITION` from 205 card lines to 71, `PULL_CANDIDATES` from 209
to 75, and the resume row from 23 to 4.

**A walk proves no surface prints the line.** `statusWalk.test.ts`, on `pathsWalk`'s
pattern: a project whose every status line carries a sentinel after its separator
(`🟡 Planned — TAIL-7c1e …`), a Blocked CV, a `✅ Done — Active …` story, and a
`🔴 Blocked — Planned …` story beside a `🟡 Candidate`. The commands walked are the
callers of the renderers that call `formatCandidate`, `formatPackage`, or
`statusMarker`, which is the rule for adding one (panel: quality-assurance): `build
load` with nothing pulled and with a story pulled, `pull-candidates` both ways,
`done-item` with its `PROJECT_POSITION` trailer, and `done-delivery-story` with its,
through a Delivery Story's flow as `pathsWalk` runs it. The Delivery Story's packages
are marked `✅ Done` with no tail before its Done, because the preflight that reads them
is CR119's and refuses a tail today (quality-assurance, second pass). No marked surface
holds the sentinel, no card row is wider than the frame, the Blocked CV's focus row
shows its title, no list names the Done story, and the Candidate is recommended over
the Blocked one.

**The skill says what a row's status is.** One subsection, under [Skill text](#skill-text),
beside CR082's `Paths on Ariad surfaces`: a row states the first clause; the whole line
is in the package the row names. The Claude copies regenerate (CR102).

**Goldens.** Eight scenarios in `builder-roadmap` change, over two fixture statuses:
the `dialect` project's `**🟡 Planned** with emphasis` becomes `🟡 Planned with
emphasis`, and the `main` project's `🔴 Blocked on an external decision`, 33 code
points with no separator, becomes `🔴 Blocked on an…` by the bound; the plan first
counted four, from the Markdown alone, and plateau 1 met the bound. Two
`pull_candidates` status fields and six rendered row groups, in `render_candidates__*`,
`render_position__*`, and `render_position_moved__*` for both projects, rewrapped.
They are edited by a script that applies the rule
and the card's wrap to the recorded row, never read back from TypeScript, with asserted
counts and a ledger row. `status__emphasis` under `match_status` is unchanged, because
`matchStatus` is. Every status in `builder-command`, `builder-orientation`, and
`builder-load` is `🟡 Planned` or `🟢 Active` and is its own clause. `builder-card` is
unchanged: the clip moved, its bytes did not.

### Skill text

The one edit to `.pi/skills/mm-build/SKILL.md`, as it will read: a subsection after
`### Paths on Ariad surfaces`, under the transport protocol. Everything else in the
skill stays.

```text
### Statuses on Ariad surfaces

A row that names a roadmap package states its status as the first clause of the
package's `**Status:**` line, links reduced to their labels, cut to fit the row. The
rest of the line is in the package the row names; read it there when you need more
than the status, such as why a package is Blocked.
```

### Decisions the Navigator took

Taken 2026-10-04, on the characterization, before the plan was written. Approving the
plan confirms them as recorded; amendments re-open it.

1. **D1: the fix is in what the runtime reads, not in how status lines are written.**
   Ariad renders roadmaps it did not author, so it cannot depend on another project's
   authoring discipline; and rewriting this repository's long lines would fix one
   roadmap and churn its history. If the Navigator wants that cleanup, it is a separate
   docs change, outside this CR. Alternative: both, with a status-line convention and
   this repository's 54 long lines rewritten to it.
2. **D2: a row prints the author's first clause**, links to their labels, `**`, `__`,
   and backticks removed, bounded to 24 code points with `…`. The two surfaces that
   print a marker keep it, and the marker's fallback prints the clause. Alternative: a
   normalized marker on every row (`◉ active`, `○ planned`), which needs a vocabulary
   that every project's wording must fit, with Blocked, Future, Superseded, Retired,
   Deferred, and Cancelled missing from it today.
3. **D3: one reading.** The candidate filter, the recommendation, the marker, and the
   candidate-table cell Expand reads classify the same clause the row prints, read once
   when the roadmap is parsed. The cost: a status that does not lead with its status
   word, such as `Phase 2 — Active`, stops being a candidate. None exists on this
   roadmap, and Ariad's own scaffolds put the word first. Alternative: change the
   formatters only and capture the classification as its own CR, leaving the rows to
   recommend what they show as Blocked and list what they show as Done.
4. **D4: the Done preflight's rule is CR119, outside the floor.** Found while
   characterizing; it is a gate, not a row, and the floor's rule is to capture what it
   finds. CR119's capture says its reading should be D3's, so the two cannot diverge
   again. Alternative: fold it in as a one-line change to `isDone`.

### Affected files

- `ts/src/builder/roadmapGrammar.ts`: `statusClause` and `STATUS_CLAUSE_WIDTH`;
  `parseCandidateStories` yields the clause.
- `ts/src/util/clipCodePoints.ts`, new: `clipCodePoints`, from `card.ts`'s `clipped`;
  `card.ts` imports it.
- `ts/src/builder/pullCandidates.ts`: the five readers yield the clause; the comments on
  `statusMarker` and `formatCandidate` say what they are given.
- `ts/src/builder/roadmapScope.ts`: `readPackage` yields the clause; the
  `AuthoredPackage.status` comment.
- `ts/src/builder/scopePhrases.ts`, `pullCandidatesRender.ts`: comments only.
- `.pi/skills/mm-build/SKILL.md` and its two generated Claude copies.
- `ts/test/builder/roadmap.test.ts`: the `statusClause` table; every reader yields the
  clause, on CR018's test shape; the classification cases.
- `ts/test/builder/statusWalk.test.ts`, new. `clipCodePoints` gets no test of its own:
  `card.test.ts` grades it through the card goldens, whose bytes do not change.
- `ts/test/goldens/builder-roadmap.golden.json` and `README.md`: the scripted edit and
  its ledger row.
- `docs/project/refinement/index.md`, this document, `rs001-ariad-runtime-trust/index.md`,
  CR119's document, and the collaboration strategy's sequence; `docs/project/decisions.md`
  at Done.

### Plateaus

Each closes with a commit, a push, and a green CI run that finishes before the next
plateau begins.

0. **Characterize and count.** The route before the change, recorded below. Counted:
   seven readers, five surfaces, eight golden scenarios (counted as four until plateau 1
   met the bound), zero candidates and
   recommendations changed on this roadmap, four markers changed and none in focus.
1. **The clause (D2, D3).** Red first: the `statusClause` table, the every-reader test,
   the classification cases, and the walk. Then `clipCodePoints`, `statusClause`, and
   the seven readers. Green. The four golden fields edited by script, with the ledger
   row.
2. **The skill.** The subsection, the Claude copies regenerated, and the comments that
   state what each formatter is given.
3. **Validation and handoff.** The route after the change, the Navigator's walk, the
   handoff review, and the ledger.

### Acceptance criteria

1. `statusClause` is graded by a table, one row per rule: a link and an image reduced to
   their labels, a target's separator not cutting, a code span's link kept, `**`, `__`, and backticks removed, each of the
   nine separators cutting, a separator at the start not cutting, trailing punctuation
   dropped, an empty cut giving way to the reduced line, a bare `—` returned as is, a
   clause of 24 kept whole, a clause of 25 clipped at a word boundary with `…`, and
   `pyStrip`'s set applied (a `\uFEFF` kept, a U+3000 stripped).
2. Every reader yields the clause: over one roadmap whose statuses carry a tail after
   the separator in each grammar position (the CV table, the DS table, the `## CV<n>:`
   heading, a package's `**Status:**`, the `Candidate Delivery Stories:` bullets, and a
   candidate-stories table), the status of every item, candidate, package, and child is
   the clause; and `matchStatus` still returns the line as written.
3. Classification reads the clause: `🔴 Blocked — Planned …` is not recommended over a
   `🟡 Candidate`; `✅ Done — Active …` is not a candidate; `firstPendingChild` treats
   `🟡 Planned — Done condition pending` as pending; `statusMarker("🔴 Blocked — see
   [the ticket](https://…)")` is `○ 🔴 blocked`.
4. The walk: through the front door, on a roadmap whose every status line carries a
   sentinel after its separator, no marked surface of `build load`, `pull-candidates`,
   `done-item`, or `done-delivery-story` holds the sentinel, scoped or unscoped; every
   card row is 58 code points wide; the Blocked CV's snapshot focus row shows its title;
   no list names the Done story; the Candidate is the recommendation.
5. On this repository's roadmap, the candidates and the recommendation are the same
   before and after: route step 7 on the real copy, or the counts of step 1 and 2 with
   every row's status its clause.
6. The golden diff is a contract: eight scenarios in `builder-roadmap`, two status
   fields and six row groups, listed in `ts/test/goldens/README.md` with their reason; every other byte of every golden is
   identical, `builder-card` included.
7. The skill carries the [Skill text](#skill-text); `node ts/scripts/buildClaudePlugin.ts
   --check` passes.
8. The route after the change meets its pass conditions.

### Validation route

CLI only, in a scratch home, with no Pi session (CR106). Its output before the change is
recorded under [Evidence](#the-route-before-the-change). Run it from the repository root
as a script, with `bash <file>` or `zsh <file>`, so that no interactive alias applies.
Steps 1 to 3 copy this repository's roadmap at the commit the script runs on, so their
numbers are the commit's; steps 4 to 7 build a roadmap of their own. It deletes its
temporary directory:

```bash
V=$(mktemp -d) && mkdir -p "$V/home" && export MIRROR_HOME="$V/home" MIRROR_USER= NODE_OPTIONS=--no-warnings
cr103() { node ts/src/frontDoor/cli.ts "$@"; }
card() { sed -n "/<<<ARIAD:$1>>>/,/<<<END:$1>>>/p" | sed -n '/^╭/,/^╰/p'; }
journey() { printf '# %s\n' "$1" | cr103 identity set journey "$1" > /dev/null && cr103 journey set-path "$1" "$2" > /dev/null 2>&1
  cr103 build adopt --journey "$1" --method ariad > /dev/null; cr103 build sync-cursor --journey "$1" --method ariad > /dev/null; }
pull() { cr103 build pull-item --journey "$1" --method ariad --item-code "$2" --item-level user_story --item-title "$3" --why-now now > /dev/null 2>&1; }
count() { wc -l | tr -d ' '; }
block() { awk -v h="$1" 'index($0, "│ " h) == 1 && !f { f = 1; next } f && $0 ~ /^│ +│$/ { exit } f'; }
row() { awk -v c="- $1 —" 'index($0, "│ " c) == 1 { f = 1; n = 1; next } f && /^│   / { n++; next } f { print n; exit }'; }
width() { perl -CS -ne 'chomp; print length, "\n"' | sort -n | tail -1; }
markdown() { grep -o '\*\*\|](\|`' | sort | uniq -c | tr -s ' \n' ' '; }

echo "=== this repository's roadmap at $(git rev-parse --short HEAD), copied; nothing pulled"
P="$V/real" && mkdir -p "$P/docs/project" && git archive HEAD docs/project/roadmap | tar -x -C "$P" && git -C "$P" init -q
journey u "$P"; journey s "$P"
cr103 build load u 2>/dev/null > "$V/load-u"
echo "--- 1. build load: PROJECT_POSITION $(card PROJECT_POSITION < "$V/load-u" | count) card lines; the candidate list $(card PROJECT_POSITION < "$V/load-u" | block 'project-wide candidates' | count); the CV9.E2 row $(card PROJECT_POSITION < "$V/load-u" | row CV9.E2), the CV22 row $(card PROJECT_POSITION < "$V/load-u" | row CV22)"
echo "    Markdown in the list: $(card PROJECT_POSITION < "$V/load-u" | block 'project-wide candidates' | markdown)"
echo "    the list, in order: $(card PROJECT_POSITION < "$V/load-u" | block 'project-wide candidates' | grep -o '^│ - [A-Z0-9.]*' | sed 's/^│ - //' | paste -sd ' ' -)"
echo "--- 2. pull-candidates: PULL_CANDIDATES $(cr103 build pull-candidates --journey u --method ariad 2>&1 | card PULL_CANDIDATES | count) card lines"
pull s CV22.DS10.US3 'npm distribution'
cr103 build load s 2>/dev/null | card BUILDER_RESUME | block 'roadmap position' > "$V/row-s"
echo "--- 3. CV22.DS10.US3 pulled: the resume's roadmap position row is $(count < "$V/row-s") card lines; Markdown: $(markdown < "$V/row-s")"
sed -n '1,2p;$p' "$V/row-s"

echo '=== a synthetic roadmap: Markdown in a status, a Blocked CV, a changelog that names another status'
R="$V/p/docs/project/roadmap" && mkdir -p "$R/cv1/ds1" "$R/cv2/ds1" "$R/cv3/ds1" "$R/cv3/ds2" "$R/cv3/ds3" "$R/cv3/ds4" && printf '# Roadmap\n' > "$R/index.md" && git -C "$V/p" init -q
printf '# CV1 — Checkout\n\n**Status:** 🟢 Active — restarted 2026-09-02; **DS1 done** ([decision](../../decisions.md)), `checkout` live\n' > "$R/cv1/index.md"
printf '# CV1.DS1 — Checkout address\n\n**Status:** 🟡 Planned — pulled 2026-09-30, [Plan](plan.md) drafted and panel-reviewed, waiting at its checkpoint\n**Type:** User Story\n' > "$R/cv1/ds1/index.md"
printf '# CV2 — Payments\n\n**Status:** 🔴 Blocked — waiting on the provider, see [the ticket](https://example.com/t/1)\n' > "$R/cv2/index.md"
printf '# CV2.DS1 — Pay by card\n\n**Status:** 🔴 Blocked — the provider sandbox is down\n**Type:** User Story\n' > "$R/cv2/ds1/index.md"
printf '# CV3 — Reports\n\n**Status:** 🟢 Active\n' > "$R/cv3/index.md"
printf '# CV3.DS1 — Export to CSV\n\n**Status:** 🔴 Blocked — Planned work waits on the vendor\n**Type:** User Story\n' > "$R/cv3/ds1/index.md"
printf '# CV3.DS2 — Export to PDF\n\n**Status:** 🟡 Candidate\n**Type:** User Story\n' > "$R/cv3/ds2/index.md"
printf '# CV3.DS3 — Monthly digest\n\n**Status:** ✅ Done — Active development moved to CV4\n**Type:** User Story\n' > "$R/cv3/ds3/index.md"
printf '# CV3.DS4 — Weekly digest\n\n**Status:** 🟡 Planned\n**Type:** User Story\n' > "$R/cv3/ds4/index.md"
journey a "$V/p"; journey b "$V/p"; journey c "$V/p"; journey d "$V/p"
echo '--- 4. pull-candidates, nothing pulled: the list'
cr103 build pull-candidates --journey a --method ariad 2>&1 | card PULL_CANDIDATES | block 'project-wide candidates'
pull b CV1.DS1 'Checkout address'
echo '--- 5. CV1.DS1 pulled: the resume row'
cr103 build load b 2>/dev/null | card BUILDER_RESUME | block 'roadmap position'
pull c CV2.DS1 'Pay by card'
cr103 build pull-candidates --journey c --method ariad 2>&1 | card ROADMAP_SNAPSHOT > "$V/snap"
echo "--- 6. CV2.DS1 pulled, CV2 Blocked in focus: the snapshot's widest line is $(width < "$V/snap") code points; the frame is $(head -1 "$V/snap" | width)"
sed -n 2p "$V/snap"
pull d CV3.DS4 'Weekly digest'
echo '--- 7. CV3.DS4 pulled: the candidates in CV3 and the recommendation'
cr103 build pull-candidates --journey d --method ariad 2>&1 | card PULL_CANDIDATES > "$V/pc-d"
block 'candidates in CV3' < "$V/pc-d"; echo '    recommended pull:'; block 'recommended pull' < "$V/pc-d"
unset MIRROR_HOME MIRROR_USER; rm -rf "$V"
```

Pass, after the change:

- Step 1: the CV9.E2 row and the CV22 row are 2 or 3 card lines each; the list holds no
  `**`, `](`, or backtick; the list names the same codes in the same order as before the
  change, at `548e70a2` the fifteen recorded below; `PROJECT_POSITION` is 71 card lines
  and the list 56.
- Step 2: at `548e70a2`, `PULL_CANDIDATES` is 75 card lines.
- Step 3: the row is 4 card lines, `CV22 — TypeScript Core Port (Database-Seam
  Strangler)`, `(🟢 Active)`, and the path; no Markdown.
- Step 4: every row's status is its clause: `🟡 Planned`, `🟢 Active`, `🔴 Blocked`,
  `🟡 Candidate`, with nothing after it but the path; no link, no `**`, no backtick;
  `CV3.DS3` is not in the list.
- Step 5: `CV1 — Checkout (🟢 Active)` and `[docs/project/roadmap/cv1/index.md]`, two
  lines.
- Step 6: the widest line is 58, the frame's width, and the focus row reads
  `🟪[CV2]  Payments` on the left and `○ 🔴 blocked` on the right.
- Step 7: the list is `CV3.DS1 … 🔴 Blocked` and `CV3.DS2 … 🟡 Candidate`, in that order,
  and the recommendation is `CV3.DS2 — Export to PDF`.

Fail: any row that prints text after its status word's clause; a `**`, `](`, or backtick
in a row; a code missing from step 1's list or out of its order; a snapshot line wider
than its frame; `CV3.DS3` in a list; `CV3.DS1` recommended.

Optional, by hand: `/mm:build mirror-ts-core` in Claude Code, where CR102's evidence was
taken. The resume's `roadmap position` row holds no `**`, so its right border stands
with the others (panel: quality-assurance).

### Conscious exclusions

- Rewriting this repository's 54 long status lines, or a status-line convention in the
  roadmap templates (D1).
- A marker for Blocked, or any change to the five markers (D2).
- The Done preflight's rule (D4, CR119).
- Single `*` and `_` emphasis in a status: left as written. A `*` is rare in a status,
  and `_` is a word character in a code.
- `formatPackage`'s path chunks (`index.` / `md]`): `cardWrapped` chunks a word longer
  than 54 code points, Python's rule, graded by the card goldens. A project-relative path
  of 57 chunks. The panel's experience lens asked for a break at `/`; declined here: it
  is a card rule for every surface, not a status matter.
- A row no longer says why a package is Blocked, or what superseded it; the package
  does, and the skill says to read it there (panel: product-designer, accepted as D2's
  cost).
- The fallback marker's shape, `○ 🔴 blocked`, a glyph after a glyph: the marker's own
  shape since Python, and stripping the author's glyph would be marker logic D2
  declined (panel: experience-designer, accepted).
- `hasCandidateStatus` and `recommend` match by substring, so `Unplanned` reads
  Planned, as before. The clause narrows what they read, not how (panel: engineer).
- A convention in the roadmap templates that a status line is a status: D1's
  alternative, declined (panel: product-designer).
- The roadmap index row and the package line disagreeing on CV22 (`🟢 In Progress` and
  `🟢 Active`): authored content, and both clauses mark `◉ active`.
- Candidate-table statuses are printed by no surface; they are read, by Expand.
- The `**Status:**` lines of journey identity documents (`journeyOptions.ts`,
  `orchestration.ts`): a different document, read by Mirror Mode, not a roadmap package.
- `CANDIDATE_STATUSES` not naming `In Progress`, which `statusMarker` treats as active:
  a candidate is chosen as before.

### Authority boundaries

Plan approval moves CR103 to `planned`. A human Driver and a Delivery reference are
required before `in_progress`. Proposed, as for every floor change: Driver
`@viniciusteles`, Delivery `mirror-ts-core`. `validated` requires the Navigator to walk
the route above and accept it. Each plateau is committed on the Delivery branch and
pushed when green, with GitHub Actions verified after every push. Merge, publication,
and release are not authorized.

Navigator decisions, 2026-10-04: D1 to D4 taken on the characterization; the plan
approved as recorded, after the second panel pass; Driver `@viniciusteles`, Delivery
`mirror-ts-core`.

### Panel review (2026-10-04)

One pass, before the plan was presented, by nine lenses: engineer, quality-assurance,
database-architect, devops-engineer, security-engineer, ai-engineer, prompt-engineer,
experience-designer, and product-designer. Each identity was loaded whole, one at a
time, and the plan read through it.

Synthesis: the plan aims at one cause, a status line read whole by every reader, and
its risk is not in the rule, which the corpus settles, but in proof: that every reader
took the clause, that the real roadmap chooses the same candidates after as before, and
that the walk reaches every surface that prints a status, including the one behind a
gate this change does not fix. Every finding below is folded into the plan above.

| Lens | Dissent | Resolution |
|---|---|---|
| engineer | Seven call sites is seven chances to forget the eighth; the every-reader test guards it, but the next reader looks at the type, and the four `status` fields say nothing | Each type's `status` is documented as the clause |
| engineer | `includes` stays under the clause, so `Unplanned` still reads Planned | Named as an exclusion: the clause narrows what the classifiers read, not how |
| quality-assurance | "No candidate and no recommendation changes on this roadmap" was established by a script nobody runs again; the route showed counts, not identity | Route step 1 prints the list's codes in order, and the pass condition is the same fifteen in the same order |
| quality-assurance | The walk named commands by hand; nothing says how the list is complete, and it left out `done-delivery-story`, which prints the same trailer | The walk's rule is the callers of the renderers that call the three formatters, and `done-delivery-story` is walked through the Delivery Story flow |
| quality-assurance | CR102's evidence was Claude Code's Markdown rendering; nothing in the route looks there | An optional manual step in Claude Code |
| prompt-engineer | "Read it there when the status matters" tells a model nothing about when; "which in some packages carries the package's history" is commentary inside an instruction | The sentence names the case: when you need more than the status, such as why a package is Blocked |
| experience-designer | With the status gone, the resume row's loudest noise is the path cut mid-word, `index.` / `md]`; a path could break at `/` | Declined, recorded: a card rule for every surface, pinned by the card goldens, not a status matter |
| experience-designer | `○ 🔴 blocked` is a glyph after a glyph | Accepted, recorded: the fallback's own shape, and stripping the author's glyph is marker logic D2 declined |
| product-designer | A Blocked row used to say why; now the Navigator opens the file to choose | Accepted as D2's cost, recorded, and the skill's sentence names it as the case to open the file |
| product-designer | D1 leaves the roadmap templates silent on what a status line is | Declined under D1; the Navigator can ask for it as a docs change |

Silent:

- database-architect: nothing stored changes; the clause is derived on read.
- devops-engineer: no migration, no consumer outside the Builder, the Claude copies
  checked in CI; the route's real-roadmap numbers are labelled by commit.
- security-engineer: a row prints less of untrusted roadmap content, not more, and a
  link's target no longer reaches a card at all; the separator rule is a fixed list.
- ai-engineer: the unscoped activation on this roadmap drops from 24,570 to about 8,800
  characters; the scoped resume loses CV22's history from its position row, which the
  journey identity's Stage line carries into the same activation, so the agent loses no
  orientation.

**Second pass.** By the lenses that own what the change touches: engineer (the
function, the readers, the moved clip), quality-assurance (the walk, the route, the
goldens), prompt-engineer (the skill's sentence), experience-designer and
product-designer (the rows). Three facts were checked first: `pathsWalk.test.ts` closes
a Delivery Story by rewriting its packages' statuses to `✅ Done`; `isDone` requires the
line's last word to be `done`; and `builder-card.golden.json` grades `cardClipped` and
`cardLine`, so a moved clip is graded without a new test. Synthesis: the first pass fixed
what the plan proved; the second found where the walk would have met the gate the plan
leaves to CR119. Folded above:

- **The walk's Delivery Story Done would be refused** (quality-assurance): a sentinel
  tail on a Done status fails `isDone`. The walk marks the Delivery Story's packages
  `✅ Done` with no tail before its Done, as `pathsWalk` does, and the plan says why.
- **Criterion 1 named no case for the moved clip** (engineer): `card.test.ts` already
  grades it through the card goldens; the plan says so instead of adding a test for a
  function whose bytes do not change.
- **The skill's sentence** (prompt-engineer): read again as folded; the case it names,
  why a package is Blocked, is the one the product lens raised.

Noted, not changed: `LINE_STATUS_RE` in `pullCandidates.ts` restates `STATUS_RE` from
`roadmapGrammar.ts` (engineer); it predates this change, both yield the clause through
`statusClause`, and collapsing them is not a status matter.

## Evidence

### As captured

- CR002's Navigator validation, 2026-09-26, step 2: the `CV9.E2` row of
  `PROJECT_POSITION` on the July tree.
- `git show HEAD:docs/project/roadmap/cv9-mirror-1-0/cv9-e2-stabilization/index.md | grep -m1 '^\*\*Status:\*\*' | wc -c`
  prints `5458`; the same for
  `docs/project/roadmap/cv22-typescript-core-port/index.md` prints `967`.
- The `■ BUILDER RESUME` rendered when CR002's session activated Builder Mode on
  2026-09-26 carries CV22's full status in its `roadmap position` row.
- CR102's Navigator validation, 2026-09-27, in Claude Code: the terminal renders
  the reply as Markdown, so the `**` in CV22's status line disappears from that
  row and shifts its right border. The agent's reply carried the row verbatim
  (the session transcript), so the damage is the status line's Markdown inside
  a fixed-width card, not the transport.

### The route before the change

At `548e70a2`, identical across two runs:

```text
=== this repository's roadmap at 548e70a2, copied; nothing pulled
--- 1. build load: PROJECT_POSITION 205 card lines; the candidate list 190; the CV9.E2 row 117, the CV22 row 24
    Markdown in the list:  5 ]( 24 ** 22 `
    the list, in order: CV10.E1 CV10.E2 CV10 CV17 CV20.DS10 CV20.DS11 CV20.DS7 CV20.DS8 CV20.DS9 CV22.DS10.US3 CV22 CV7.E1 CV7.E4 CV9.E2.S2 CV9.E2
--- 2. pull-candidates: PULL_CANDIDATES 209 card lines
--- 3. CV22.DS10.US3 pulled: the resume's roadmap position row is 23 card lines; Markdown:  2 ]( 10 **
│ CV22 — TypeScript Core Port (Database-Seam Strangler)  │
│ (🟢 Active — restarted 2026-09-02 after pause-window    │
│ md]                                                    │
=== a synthetic roadmap: Markdown in a status, a Blocked CV, a changelog that names another status
--- 4. pull-candidates, nothing pulled: the list
│ - CV1.DS1 — Checkout address [user_story] 🟡 Planned —  │
│   pulled 2026-09-30, [Plan](plan.md) drafted and       │
│   panel-reviewed, waiting at its checkpoint            │
│   (docs/project/roadmap/cv1/ds1/index.md)              │
│ - CV1 — Checkout [cv] 🟢 Active — restarted 2026-09-02; │
│   **DS1 done** ([decision](../../decisions.md)),       │
│   `checkout` live (docs/project/roadmap/cv1/index.md)  │
│ - CV2.DS1 — Pay by card [user_story] 🔴 Blocked — the   │
│   provider sandbox is down                             │
│   (docs/project/roadmap/cv2/ds1/index.md)              │
│ - CV2 — Payments [cv] 🔴 Blocked — waiting on the       │
│   provider, see [the ticket](https://example.com/t/1)  │
│   (docs/project/roadmap/cv2/index.md)                  │
│ - CV3.DS1 — Export to CSV [user_story] 🔴 Blocked —     │
│   Planned work waits on the vendor                     │
│   (docs/project/roadmap/cv3/ds1/index.md)              │
│ - CV3.DS2 — Export to PDF [user_story] 🟡 Candidate     │
│   (docs/project/roadmap/cv3/ds2/index.md)              │
│ - CV3.DS3 — Monthly digest [user_story] ✅ Done —       │
│   Active development moved to CV4                      │
│   (docs/project/roadmap/cv3/ds3/index.md)              │
│ - CV3.DS4 — Weekly digest [user_story] 🟡 Planned       │
│   (docs/project/roadmap/cv3/ds4/index.md)              │
│ - CV3 — Reports [cv] 🟢 Active                          │
│   (docs/project/roadmap/cv3/index.md)                  │
--- 5. CV1.DS1 pulled: the resume row
│ CV1 — Checkout (🟢 Active — restarted 2026-09-02; **DS1 │
│ done** ([decision](../../decisions.md)), `checkout`    │
│ live) [docs/project/roadmap/cv1/index.md]              │
--- 6. CV2.DS1 pulled, CV2 Blocked in focus: the snapshot's widest line is 86 code points; the frame is 58
│ … ○ 🔴 blocked — waiting on the provider, see [the ticket](https://example.com/t/1) │
--- 7. CV3.DS4 pulled: the candidates in CV3 and the recommendation
│ - CV3.DS1 — Export to CSV [user_story] 🔴 Blocked —     │
│   Planned work waits on the vendor                     │
│   (docs/project/roadmap/cv3/ds1/index.md)              │
│ - CV3.DS2 — Export to PDF [user_story] 🟡 Candidate     │
│   (docs/project/roadmap/cv3/ds2/index.md)              │
│ - CV3.DS3 — Monthly digest [user_story] ✅ Done —       │
│   Active development moved to CV4                      │
│   (docs/project/roadmap/cv3/ds3/index.md)              │
│ 4 more outside CV3                                     │
    recommended pull:
│ CV3.DS1 — Export to CSV [user_story] 🔴 Blocked —       │
│ Planned work waits on the vendor                       │
│ (docs/project/roadmap/cv3/ds1/index.md)                │
```

Steps 1 to 3 are the capture, measured: the two unscoped surfaces and the resume row.
Step 4 is the Markdown, raw in the rows. Step 6 is the fallback: a Blocked CV's whole
status on the right of the focus row, the title reduced to `…`, the border off the card.
Step 7 is the classification: a Done story listed, a Blocked one recommended over a
Candidate because its changelog says `Planned`.

### Plateau 1 handoff (2026-10-04)

Now true: a roadmap status enters Ariad as its first clause. `statusClause` in
`roadmapGrammar.ts` reduces a line, with the clip moved from `card.ts` to
`util/clipCodePoints.ts` and `card.ts`'s bytes unchanged. The seven readers yield it, the
four types say so, and the classifiers and formatters are given a clause with no change
of their own. Red first: `statusClause.test.ts` (the table, every reader, the
classifiers) and `statusWalk.test.ts` (a story's walk and a Delivery Story's, through
the front door, with a sentinel after every separator) failed on the sentinel in
`PROJECT_POSITION`, then passed. Two things the plan did not foresee: the golden count
was eight scenarios, not four, because the `main` fixture's `🔴 Blocked on an external
decision` meets the bound, not the Markdown; and `roadmapScope.test.ts` told the index
row from the package by a `(table)` suffix, which the clause now cuts, so the mark moved
inside the clause (`🟢 In Progress table`) and the test's claim stands. The goldens
were edited by script, which reproduced every recorded row group from its own wrap
before changing it, with the ledger row in `ts/test/goldens/README.md`. The route after
the change meets every pass condition; its output is under
[The route after the change](#the-route-after-the-change-2026-10-04). Plateau 2 is
the skill's subsection and the Claude copies.

### Plateau 2 handoff (2026-10-04)

Now true: `.pi/skills/mm-build/SKILL.md` carries `Statuses on Ariad surfaces` as
drafted under [Skill text](#skill-text), the two Claude copies are regenerated from it,
and `buildClaudePlugin.ts --check` and the skill parity check pass. `formatPackage` and
the render module say what they are given. Nothing else changed. Plateau 3 is the
Navigator's walk of the route, the handoff review, and the ledger.

### The route after the change (2026-10-04)

At the plateau 1 commit, on `f2d806b6`'s roadmap:

```text
=== this repository's roadmap at f2d806b6, copied; nothing pulled
--- 1. build load: PROJECT_POSITION 71 card lines; the candidate list 56; the CV9.E2 row 4, the CV22 row 4
    Markdown in the list:
    the list, in order: CV10.E1 CV10.E2 CV10 CV17 CV20.DS10 CV20.DS11 CV20.DS7 CV20.DS8 CV20.DS9 CV22.DS10.US3 CV22 CV7.E1 CV7.E4 CV9.E2.S2 CV9.E2
--- 2. pull-candidates: PULL_CANDIDATES 75 card lines
--- 3. CV22.DS10.US3 pulled: the resume's roadmap position row is 4 card lines; Markdown:
│ CV22 — TypeScript Core Port (Database-Seam Strangler)  │
│ (🟢 Active)                                             │
│ md]                                                    │
=== a synthetic roadmap: Markdown in a status, a Blocked CV, a changelog that names another status
--- 4. pull-candidates, nothing pulled: the list
│ - CV1.DS1 — Checkout address [user_story] 🟡 Planned    │
│   (docs/project/roadmap/cv1/ds1/index.md)              │
│ - CV1 — Checkout [cv] 🟢 Active                         │
│   (docs/project/roadmap/cv1/index.md)                  │
│ - CV2.DS1 — Pay by card [user_story] 🔴 Blocked         │
│   (docs/project/roadmap/cv2/ds1/index.md)              │
│ - CV2 — Payments [cv] 🔴 Blocked                        │
│   (docs/project/roadmap/cv2/index.md)                  │
│ - CV3.DS1 — Export to CSV [user_story] 🔴 Blocked       │
│   (docs/project/roadmap/cv3/ds1/index.md)              │
│ - CV3.DS2 — Export to PDF [user_story] 🟡 Candidate     │
│   (docs/project/roadmap/cv3/ds2/index.md)              │
│ - CV3.DS4 — Weekly digest [user_story] 🟡 Planned       │
│   (docs/project/roadmap/cv3/ds4/index.md)              │
│ - CV3 — Reports [cv] 🟢 Active                          │
│   (docs/project/roadmap/cv3/index.md)                  │
--- 5. CV1.DS1 pulled: the resume row
│ CV1 — Checkout (🟢 Active)                              │
│ [docs/project/roadmap/cv1/index.md]                    │
--- 6. CV2.DS1 pulled, CV2 Blocked in focus: the snapshot's widest line is 58 code points; the frame is 58
│ 🟪[CV2]  Payments                           ○ 🔴 blocked │
--- 7. CV3.DS4 pulled: the candidates in CV3 and the recommendation
│ - CV3.DS1 — Export to CSV [user_story] 🔴 Blocked       │
│   (docs/project/roadmap/cv3/ds1/index.md)              │
│ - CV3.DS2 — Export to PDF [user_story] 🟡 Candidate     │
│   (docs/project/roadmap/cv3/ds2/index.md)              │
│ 4 more outside CV3                                     │
    recommended pull:
│ CV3.DS2 — Export to PDF [user_story] 🟡 Candidate       │
│ (docs/project/roadmap/cv3/ds2/index.md)                │
```

### Navigator validation (2026-10-04)

The Navigator ran the route from the repository root at `6b372621`, in their own shell
(`bash <(awk …)` over this document's script). The output matched the Driver's run above
line for line, on the commit's roadmap: step 1 `71` card lines, the list `56`, the
CV9.E2 and CV22 rows `4` each, no Markdown, the fifteen codes in the recorded order;
step 2 `75`; step 3 the row at `4` lines with no Markdown; step 4 every row ending at
its status and `CV3.DS3` absent; step 5 the two lines; step 6 `58` against `58`, with
`Payments` on the row; step 7 `CV3.DS2 — Export to PDF` recommended, `CV3.DS1` listed as
`🔴 Blocked`, `CV3.DS3` absent. The optional Claude Code check was not taken. The
Navigator accepted the validation the same day.

The CV9.E2 and CV22 rows are 4 lines each, not 2 or 3 as the pass condition said: their
titles and paths wrap, and the status takes none of it. The condition's number was a
guess at the wrap; what it meant, that the status adds no line, holds.

The corpus counts in the characterization were taken by scripts over every `index.md`
under `docs/project/roadmap` at `548e70a2`: `matchStatus` on each (366 lines), the
first-clause reduction, `hasCandidateStatus` and `statusMarker` on the line and on the
clause, `isDone` on the line, and `parseCandidateStories` on each (173 cells).

### Handoff review (2026-10-04)

After the Navigator's walk, per the collaboration strategy. The nine lenses of the plan's
first pass reviewed the delivered code, tests, words, safety posture, operational cost,
and resumability. Every finding was checked against the code; the one about the walk's
completeness was checked against `commands.ts`. The cost was measured: the two new test
files run in under half a second together.

Synthesis: the delivery does what the plan said, the Navigator's walk matched it line
for line, and the classifiers now read what the rows print. The findings are in the
words and at one edge of the rule, not in the behavior the route proves.

| # | Lens | Finding | Class | Recommendation |
|---|---|---|---|---|
| 1 | engineer | `statusMarker`'s comment is broken: the `○ ` in "prints at most `○ ` and `STATUS_CLAUSE_WIDTH`" was written as a line break inside the code span, so the comment reads as two lines with an open backtick | Non-blocking debt, introduced here | Pay now: the sentence as meant |
| 2 | engineer | `statusClause`'s comment says a separator inside a label does not cut. It does, and the test says so (a link labelled `Done, finally` reads `Done`): the reduction protects a target, and a label's words are the author's words. The plan was corrected at plateau 1; the comment was not | Non-blocking debt, introduced here | Pay now: the comment says what the test says |
| 3 | engineer | `STATUS_SEPARATOR_RE` takes the dash forms with an optional space after (`\s?`), so ` -rc1` in `v2 -rc1` cuts, where the plan's separators are the spaced ` — `, ` – `, ` - `, and ` · `. Only ` (` opens without a space | Non-blocking debt, introduced here | Pay now: the dash and dot forms require the space on both sides; a table row grades `v2 -rc1` |

Checked and dropped:

- The walk names its commands by the renderers' callers and does not cross Done through
  `continue-lifecycle` (quality-assurance, as CR082's review found for paths).
  `runContinueLifecycle` prints `DONE_CHECKPOINT` and no `PROJECT_POSITION` trailer
  (`commands.ts`), so it calls none of the three renderers, and the walk's list is the
  callers' list. That `continue-lifecycle`'s Done prints no trailer where `done-item`'s
  does is a shape question of CR118's kind, noted here and not captured: nobody has
  asked for the trailer there.
- The skill says a status is "cut to fit the row" where the bound is 24 code points, less
  than a row (prompt-engineer). True in effect; the row is what the reader sees.
- The golden edit script lives in `/tmp`, uncommitted, as CR082's, CR111's, CR113's,
  and CR114's did (devops-engineer). The README row says what it derived and asserted,
  and that it reproduced every row group before changing it.

The other lenses were silent:

- database-architect: nothing stored changes; the clause is derived on read.
- security-engineer: a row prints less of untrusted roadmap content, and a link's
  target no longer reaches a card.
- ai-engineer: the measured saving stands, 24,570 to 8,758 characters on the two
  unscoped surfaces of this roadmap, and the journey identity's Stage line still carries
  CV22's history into the activation.
- experience-designer: the Navigator judged the rows in their terminal; the path chunk
  was declined at Plan.
- product-designer: the Blocked row's cost was accepted at Plan, and the skill names the
  case to open the file.

### Debt paid (2026-10-04)

The Navigator decided all three: "Pay all of them now". One commit pays them.

1. **`statusMarker`'s comment** reads as one sentence again, with the marker glyph in
   its code span.
2. **`statusClause`'s comment** says what the test says: a separator inside a link's
   target cannot cut, and a label's words cut like the author's own.
3. **The separator rule.** The dash and dot forms require the space on both sides; only
   ` (` opens without one. Red first: the new table row, `v2 -rc1 pending`, failed on
   the old rule and passes on the new. No status on this roadmap or in a fixture reads
   differently.

2942 tests pass, one row of them new. Typecheck, lint, the repository checks, and the
smokes are green, and the route still prints its recorded output exactly.

## Outcome

Done 2026-10-04. A roadmap status enters Ariad as its first clause: `statusClause`, in
`roadmapGrammar.ts`, reads a `**Status:**` line or a status cell as the status its
author declared, links to labels, `**`, `__`, and backticks out, cut before the first
separator, trailing punctuation off, bounded to 24 code points by the card's clip, which
moved to `util/clipCodePoints.ts`. It is applied at the seven places a status leaves a
reader, so every candidate, snapshot item, authored package, and candidate-table child
carries a clause by construction, and the classifiers and the three formatters read what
the rows print with no change of their own (D2, D3). The fix is in what the runtime
reads; this repository's 54 long lines stand as written (D1). The Done preflight's rule
is [CR119](cr119-the-delivery-story-done-preflight-reads-a-status-line-s-last-word.md),
outside the floor (D4).

On this roadmap, `PROJECT_POSITION` went from 205 card lines to 71, `PULL_CANDIDATES`
from 209 to 75, and the resume's roadmap position from 23 to 4, with the same fifteen
candidates in the same order; a Blocked CV in focus keeps its title at the frame's
width; a Candidate is recommended over a Blocked story whose changelog says Planned, and
a Done story whose changelog says Active is not listed. The skill says a row's status is
the clause and where the rest of the line is. Eight `builder-roadmap` scenarios changed,
two by the Markdown and six by the bound, edited by a script that reproduced every row
group before changing it; the count was four at Plan and eight when plateau 1 met the
bound.

Delivered on `mirror-ts-core` in `3d999558` (the clause), `6b372621` (the skill), and
`276733a3` (debt). CI was green on every push. Next in floor order: CR107, then CR117.

## Provenance

Captured on 2026-09-26 during CR002's Navigator validation, when the `CV9.E2` row of
`PROJECT_POSITION` rendered as about 90 card lines on the July tree, and the resume
that opened the session carried CV22's whole status. Captured without fixing, by the
floor's rule, and taken onto the floor on 2026-09-30 with every open RS001 request when
US3's Pull and Plan reopened it.
