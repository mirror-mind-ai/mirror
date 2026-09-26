[< RS001](index.md) · [Canonical status](../index.md#change-requests)

# CR002 — Builder's Position And Next-Pull Surfaces Ignore The Journey

Retitled 2026-09-26 from "Refuse ambiguous roadmap selection during cursor sync"
after characterization placed the defect in the roadmap readers, not in cursor
sync. The filename is kept: five documents link it, and the ID is the identity.

## Problem

### As captured (2026-07-30)

After the Builder delivery cursor was intentionally cleared for the DS12 restart,
Builder load reported `cursor_sync_required` but presented `CV9.DS7 — Conversation
Metadata Lifecycle` as the roadmap position for the `builder-mode-evolution` journey.
The intended work was the explicitly authored `CV20.DS12.TS1` candidate.

The repository contains more than one historical or active-looking roadmap position.
A global scan can therefore produce a syntactically valid but contextually wrong
recommendation.

### As characterized (2026-09-26, TypeScript runtime)

Cursor sync selects nothing: `sync-cursor` writes a fixed cursor with no active item.
The wrong answer comes from the two roadmap readers that fill "where are we" and
"what next" on Builder surfaces, and neither knows which journey is asking:

- `resolveRoadmapPosition` (`ts/src/builder/roadmapPosition.ts`) returns the first
  non-legacy `index.md`, in path order, whose `**Status:**` contains the substring
  `Active` (which also matches `Inactive`). It takes no journey. `build load` renders
  it as the `roadmap position` row of `■ BUILDER RESUME` whether or not the cursor
  has an active item.
- `inspectPullCandidates` and `inspectRoadmapSnapshot` (`ts/src/builder/pullCandidates.ts`)
  accept a `journey` and only echo it into the report. `recommend()` ranks every
  candidate in the project by status then level; `focusItem()` derives "where are we
  now" from that recommendation.

Nothing in the runtime binds a journey to a part of the roadmap. The only roadmap
fact a journey owns is the active item in its delivery cursor, and no reader uses it.

CV9.DS7 qualifies because its status still reads `Active Delivery Story; expansion
accepted` although 10 of its 12 stories are Done and 2 are Validated: it was never
closed. That is real metadata drift, but it only exposes the defect. This project
carries open work for more than one journey (CV20 and CV22), so no status cleanup
makes a single "first Active" answer right for both.

## Expected Behavior

Builder position and next-pull surfaces derive from the journey's own cursor, and
refuse honestly when the cursor gives them nothing to derive from:

- With an active item (including after it is Done, when the cursor still holds it),
  the roadmap position is the Capability Value the active item belongs to by code, and
  the recommended next pull is chosen only among that CV's descendants, never the
  active item itself.
- Without an active item, there is no position and no recommended pull. The
  project-wide candidate list is shown, labelled as project-wide, and the surface
  gives the literal Pull command.
- No surface ever names a roadmap package chosen by scanning the whole project for a
  status word.

## Impact

Trusting the inferred position can pull or resume unrelated Delivery Work. Concretely:

- The two readers disagree for the same journey (`CV9.DS7` on the resume surface,
  `CV20` on `PROJECT_POSITION` after the cursor is synchronized).
- After an explicit Pull, the resume surface contradicts itself on every load:
  `active item CV20.DS12.TS1`, `roadmap position CV9.DS7`.
- The same unscoped recommendation feeds `build load`'s orientation, `pull-candidates`,
  and the `PROJECT_POSITION` trailer of both `done-item` and `done-delivery-story`, so
  the "what looks next" advice after closing a story can belong to another journey.
- This journey (`mirror-ts-core`) will hit it: on a copy of today's roadmap with CV22
  and CV22.DS10.US3 marked Done, the position reverts to CV9.DS7 and the recommended
  next pull becomes CV20.DS10.

## Plan Or Decision

Decisions taken by the Navigator on 2026-09-26: retitle; cover position **and**
recommendation across every consumer, no half-measure; scope by the cursor's active
item, with honest refusal when there is none; no new journey→roadmap binding. The
technical panel reviewed the first draft the same day ([record below](#panel-review-2026-09-26));
the Navigator approved the plan with the panel's three changes applied, and they are
folded into the sections that follow.

### Objective

Every Builder surface that answers "where are we" or "what next" derives its answer
from the delivery cursor of the journey that asked, or says plainly that it cannot.

### Design

One scope, resolved once per command from the cursor, consumed by every reader.
Identity is the authored heading code throughout; folders never decide membership.

```text
RoadmapScope
  | { kind: "unscoped", reason: "no_cursor" | "no_active_item" }
  | { kind: "active_item", activeItem, cvCode, position }

position
  | cv_package    { code, title, status, path }   the CV's own authored package
  | item_package  { code, title, status, path }   the CV has none; the active item's own
  | no_package                                    neither has one
  | ambiguous     { code, paths }                 two or more packages claim the CV code
  | no_project                                    the journey has no project path
```

- Pull is the only cursor writer that sets the active item and `sync-cursor` the only
  one that clears it; every other writer carries it forward. So `unscoped` always
  means no item has been pulled since the cursor was last synchronized.
- `cvCode` is the active item's code up to the first `.`, the roadmap grammar's
  hierarchy separator and the rule `focusItem` and the snapshot's `current` row already
  use. A code with no `.` (`CV22`, `DS-35`) is its own CV.
- The position resolves `cvCode` with the existing `resolveStoryDirectory` (heading-code
  lookup, never folder arithmetic). No CV package: fall back to the active item's own
  package, labelled. Ambiguity is caught and stated; nothing throws into `build load`.
- Membership is strict descent: `code.startsWith(cvCode + ".")`. The dot keeps `CV2`
  from swallowing `CV22`. Strictness keeps the CV out of its own candidates:
  `recommend()` falls back to `candidates[0]` at any level, so a CV still marked Active
  with no children left would otherwise be recommended as its own next pull. The
  active item is excluded from the list and the recommendation. Membership needs no
  package, so scoping holds even when the position cannot be rendered.
- One helper owns the rule. `roadmapPlanContext`'s sibling filter (`commands.ts`)
  calls it instead of its own copy; its output does not change, because it already
  used strict descent, and CR019's parent-as-sibling defect stays CR019's.
- `inspectPullCandidates` keeps the raw project scan and loses its `recommended`
  field, so every consumer has to go through `scopePullCandidates(report, scope)` →
  `{ scope, shown, outsideCount, recommended }` and the compiler finds every call
  site. `recommend()` keeps its status/level preference and runs over `shown` only;
  its golden coverage moves to a direct assertion over the recorded candidate pools.
- `focusItem()` gives way to `scopeFocus(items, scope)`: the roadmap index row for
  `cvCode`, else the CV package heading, else a labelled placeholder; `null` when
  unscoped.
- `resolveRoadmapPosition` and its `Active`/`Inactive` substring marker are deleted.
- `renderBuilderHomeSurface` is deleted. Nothing in production calls it: `build load`
  renders `PROJECT_POSITION` and `BUILDER_ORIENTATION`. Its one distinctive line is a
  project-wide `recommended pull`.

### Surface strings

Fixed now, because the agent acts on them and the goldens will pin them. Four phrases,
used identically on every surface:

| Phrase | Where |
|---|---|
| `no item pulled yet` | The value of every position row when unscoped: `■ BUILDER RESUME` → `roadmap position`; `PROJECT_POSITION` → "Where are we now?"; `BUILDER_ORIENTATION` → "Where are we in the roadmap?"; `ROADMAP SNAPSHOT` → `roadmap field` |
| `pull explicitly: mirror build pull-item --journey <slug> --method ariad --item-code <code> --item-title "<title>" --item-level <level> --why-now "<why now>"` | Wherever a recommendation would stand and there is none: `PULL_CANDIDATES` → `recommended pull`; `PROJECT_POSITION` → "What looks next?"; the first move of `BUILDER_ORIENTATION` → "What can we do now?". `<slug>` is the journey's real slug; the other placeholders are filled from the candidate the Navigator names |
| `no remaining candidates in <CV>` | Scoped with nothing left to pull, on the line before `pull explicitly: …` |
| `project-wide candidates`, or `candidates in <CV>` then `<n> more outside <CV>` | List headers, replacing "available candidates" and "Available path"; the count line only when `n > 0`. `BUILDER_ORIENTATION` keeps its question and opens the answer with `project-wide candidates` |

- Scoped rows keep today's formats: the resume row `CV22 — <title> (<status>) [<path>]`,
  the recommendation `🟦[<code>] <title leaf> — recommended next pull`, the snapshot's
  `◉ current`.
- Scoped fallbacks on the resume row: the active item's own package line followed by
  `no authored package for <CV>`; `no authored package for <CV> or <item>`;
  `<CV> is claimed by <n> packages: <paths>`; `no project path configured`.
- `■ BUILDER RESUME` without a cursor shows `no item pulled yet` and no command line:
  the next move there is `sync-cursor`, which its `allowed next actions` already names.
- The unscoped `ROADMAP SNAPSHOT` renders only the `roadmap field` row. `Backlog`
  belongs to a focus; the project-wide list is in the `PULL_CANDIDATES` surface the
  same command prints.
- `no item pulled yet` names a beginning, not a loss. `none` stays only in fields that
  are genuinely empty.

### Affected files

Code (`ts/src/builder/`): new `roadmapScope.ts`; `pullCandidates.ts`;
`pullCandidatesRender.ts`; `homeSurface.ts` (`renderBuilderHomeSurface` deleted);
`resumeSurface.ts`; `load.ts`; `commands.ts` (`runPullCandidates`, `runDoneItem`,
`runDoneDeliveryStory`, `roadmapPlanContext`); `roadmapPosition.ts` deleted.

Tests: new `ts/test/builder/roadmapScope.test.ts` covering resolver states,
membership, and scoped renders with hand-written expectations, on fixture trees built
by the test: the July shape (a stale `Active` Delivery Story in one CV, Planned work in
another) and two journeys on one project. `roadmap.test.ts` and `orientation.test.ts`
adapt to the new inputs.

Goldens, edited by hand under the TS5 freeze. Each edit is a scripted transformation
of the recorded bytes with asserted counts, never TypeScript output, and each commit
adds one README row listing every changed field:

| Golden | Change |
|---|---|
| `builder-roadmap` | `roadmap_position` kind removed (9); `render_project_position` (18), `render_pull_candidates` (9), `render_roadmap_snapshot` (9) take the unscoped form |
| `builder-orientation` | `home` kind removed (9); `orientation` (8) unscoped; the 14 `BUILDER_RESUME` renders take the position each scenario's cursor implies |
| `builder-command` | `pull-candidates` (3 × 2 surfaces) and the Done trailers (2 `PROJECT_POSITION`) |
| `builder-load` | 6 `BUILDER_RESUME` position rows |

`builder-roadmap` and `builder-orientation` start carrying `PROGRAM` (`mirror`), so the
README's PROGRAM list and US3's `inherited.md` item 2 go from seven goldens to nine.

Docs: `.pi/skills/mm-build/SKILL.md`, where the activation-surface list names what
`build load` really emits (`PROJECT_POSITION`, `BUILDER_ORIENTATION`; no `■ Builder
Home`) and the no-active-item instruction becomes "ask which item to pull from the
project-wide list, or whether to inspect the roadmap". The Claude Code and plugin
copies carry no Ariad section (CR102) and are not touched. Also
`docs/project/decisions.md` (Builder position is the cursor's active item, never a
scan), `docs/process/troubleshooting.md` and `worklog.md` where they describe these
rows, and this document's Evidence and Outcome.

### Plateaus

Solo operating model: each plateau ends green with a handoff statement in this
document.

1. `roadmapScope.ts` (scope, membership, focus, candidate scoping) with unit tests;
   `roadmapPlanContext` on the shared helper. No surface changes.
2. `■ BUILDER RESUME` reads the scope; `resolveRoadmapPosition` deleted; `resume`,
   `builder-load`, and `roadmap_position` goldens.
3. `PULL_CANDIDATES`, `PROJECT_POSITION`, `ROADMAP SNAPSHOT`, and
   `BUILDER_ORIENTATION` read the scoped view; `renderBuilderHomeSurface` deleted;
   `builder-roadmap` and `builder-orientation` goldens.
4. `pull-candidates`, `done-item`, and `done-delivery-story` pass the cursor;
   `builder-command` goldens; the July-shape and two-journey scenarios end to end.
5. Docs, README rows, the US3 inherited item, Navigator validation, handoff review.

### Acceptance criteria

1. `build load` with no cursor: `roadmap position` reads `no item pulled yet`, never a
   scanned file.
2. `build load` with an empty cursor: `PROJECT_POSITION` and `BUILDER_ORIENTATION`
   show `no item pulled yet`, the `project-wide candidates` list with no `▸` marker,
   and the literal `pull explicitly: …` command carrying the journey's slug.
3. After `pull-item CVx.…`: `roadmap position` is CVx's package on that load and every
   later one; it never names another CV.
4. `pull-candidates` with an active item in CVx: `candidates in CVx` lists only CVx's
   strict descendants minus the active item, followed by `<n> more outside CVx`;
   `recommended pull` is one of them.
5. Both Done trailers: "Where are we now?" is CVx; "What looks next?" is inside CVx, or
   `no remaining candidates in CVx` followed by `pull explicitly: …`; never another CV.
6. CV package missing, ambiguous, or no project path: the resume row says which;
   scoping still applies because membership is by code; `build load` exits 0.
7. `CV2` does not scope `CV22`'s candidates; a CV never recommends itself; the active
   item is never recommended.
8. Two journeys on one project with active items in different CVs get different
   positions and recommendations.
9. `resolveRoadmapPosition` and `renderBuilderHomeSurface` are gone; no code path picks
   a roadmap file by status substring over the whole tree.
10. `npm test`, `npm run typecheck`, `npm run lint`, and CI are green; every golden
    edit has its README row.

### Validation route

Isolated home (`MIRROR_HOME=/tmp/…`, no `.env`), scratch journey, project path set to
a copy of the roadmap at `dfd44051` (the July tree):

1. `build load` before any cursor → `roadmap position: no item pulled yet` (was
   `CV9.DS7`).
2. `sync-cursor`, `build load` → `PROJECT_POSITION` with `no item pulled yet` and
   `pull explicitly: …`, no recommendation (was `CV20.DS7.US1` recommended, `CV20`
   focus).
3. `pull-item CV20.DS12.TS1 … --item-level technical_story`, `build load` → position
   `CV20 — Builder Mode Evolution …`; `pull-candidates` → `candidates in CV20` and a
   recommendation inside CV20.

Then on this journey: `build load` → position `CV22`, now by derivation;
`pull-candidates` → `CV22.DS10.US3`. On a temp copy with CV22 and US3 marked Done,
`pull-candidates` → `no remaining candidates in CV22`, never `CV20.DS10`.

Pass: exactly those outcomes. Fail: any surface names `CV9.DS7` or a CV20 item for
`mirror-ts-core`. This route is the E2E; no personal data is involved.

### Conscious exclusions

- CV9.DS7's stale status: docs housekeeping, done separately and only after
  validation so it cannot mask the reproduction.
- `roadmapPlanContext`'s parent-as-sibling defect: CR019's territory. This CR only
  moves its membership rule into the shared helper, without changing its output.
- A persisted journey→roadmap binding: a data-model change; its own story if ever
  needed.
- `recommend()`'s status/level preference order.
- CR018 (slash titles) and CR082 (absolute paths), although the same renderers are
  touched.
- The Claude Code and plugin `mm-build` copies, which lack the Ariad section: CR102.
- Python parity: there is no oracle; goldens are hand-edited with reasons.

### Authority boundaries

Plan approval moves this CR to `planned`. A human Driver and a Delivery reference are
required before `in_progress`. `validated` requires the Navigator to walk the route
above and accept it.

Navigator decisions, 2026-09-26: Driver `@viniciusteles`, Delivery `mirror-ts-core`.
Each plateau is committed on the Delivery branch and pushed when green, with GitHub
Actions verified after every push. Merge, publication, and release are not
authorized.

### Panel review (2026-09-26)

Plan review before implementation, per the CV22 collaboration strategy: the
quality-assurance draft reviewed by engineer, database-architect, devops-engineer,
security-engineer, ai-engineer, prompt-engineer, experience-designer, and
product-designer. Only dissent was recorded.

Synthesis: sound; risk concentrated in mixing two identity systems, deferring the
surface strings the goldens would freeze, and a scoped list that still carried the
whole project's rows.

| Lens | Dissent | Resolution |
|---|---|---|
| engineer | The first draft resolved the item by heading code and its CV by folder ancestry, although a package may live under any folder; `CV2`/`cv2` prefix traps; a second copy of the membership rule in `roadmapPlanContext` | Heading-code identity throughout, strict-descent membership with the dot, one helper ([Design](#design)) |
| prompt-engineer | Strings deferred to implementation are agent instructions the goldens will pin; four near-synonyms for one state; the action must be the literal command | [Surface strings](#surface-strings) fixed in this plan |
| experience-designer | A fresh journey's first screen read as failure (`none` three times) | `no item pulled yet` names a beginning; `none` only for genuinely empty fields |
| product-designer | The scoped list still printed every other CV's backlog | `candidates in <CV>` plus one count line |

The database-architect, devops-engineer, security-engineer, and ai-engineer lenses
raised no objection. Quality assurance added the edge cases now in the acceptance
criteria and plateau 4: the pending Delivery Story confirmation, whose Expand
recommendation comes from the candidate table and must be unaffected, and journeys
without Ariad, which render none of these surfaces.

## Evidence

### As captured (2026-07-30, Python runtime)

Reproduced during the document-first DS12 restart:

```text
resumable: no
reason: cursor_sync_required
roadmap position: CV9.DS7 — Conversation Metadata Lifecycle
active item: none
```

The cursor was synchronized empty, then `CV20.DS12.TS1` was pulled explicitly. No
implicit CV9 work was executed.

### Characterization (2026-09-26, TypeScript runtime, isolated home)

Setup: `MIRROR_HOME=/tmp/cr002-home`, no `.env`, scratch journey `bme-repro`, project
path a `git archive dfd44051 docs/project/roadmap` copy. Real database and repository
untouched; scratch state deleted afterwards.

| Step | What `build load` rendered |
|---|---|
| `build load`, no cursor | `■ BUILDER RESUME`: `resumable: no`, `reason: cursor_sync_required`, `roadmap position: CV9.DS7 — Conversation Metadata Lifecycle (Active Delivery Story; expansion accepted)` |
| `sync-cursor`, then `build load` | `PROJECT_POSITION`: "Where are we now?" `🟪[CV20]`, "What looks next?" `🟦[CV20.DS7.US1] … recommended next pull` |
| `pull-item CV20.DS12.TS1`, then `build load` (twice) | `■ BUILDER RESUME`: `resumable: yes`, `active item: CV20.DS12.TS1`, `roadmap position: CV9.DS7 …` |

Direct reader calls on the July tree: one `index.md` matches `Active` (CV9.DS7);
`inspectPullCandidates` returns 16 candidates and recommends `CV20.DS7.US1` for any
journey string. `CV20.DS12.TS1` is not a candidate (status `🟠 Implemented — validation
pending`), which is why the explicit Pull was needed.

On today's tree (`HEAD`, 366 non-legacy files): two matches, `CV22` then `CV9.DS7`,
`CV22` first only because `cv22-…` sorts before `cv9-…`; 16 candidates, recommended
`CV22.DS10.US3` for any journey string. On a temp copy with CV22 and CV22.DS10.US3
marked Done: position `CV9.DS7`, recommended `CV20.DS10`.

CV9.DS7 package: no `done.md` at any level; children 10 × Done, 2 × Validated.

Readers and consumers: `resolveRoadmapPosition` has one caller (`load.ts`).
`inspectPullCandidates` has five: `load.ts` (the orientation path), `runPullCandidates`,
`roadmapPlanContext`, `runDoneDeliveryStory`, `runDoneItem`. `renderBuilderHomeSurface`
has no production caller. Pinned by `test/builder/roadmap.test.ts` and
`test/builder/orientation.test.ts` against goldens recorded from Python and frozen
since TS5.

### Plateau 1 handoff (2026-09-26)

- **True now:** `ts/src/builder/roadmapScope.ts` resolves a journey's scope from its
  cursor (`resolveRoadmapScope`), owns the membership rule (`cvCodeOf`, `isInsideCv`),
  scopes the candidate list (`scopePullCandidates`), and picks the focus
  (`scopeFocus`). `storyPaths.ts` exposes the heading-claim map
  (`roadmapHeadingDirectories`) so ambiguity is stated, not thrown.
  `roadmapPlanContext` uses the shared rule; its output is unchanged.
- **Intentionally undone:** no surface reads the scope yet; `resolveRoadmapPosition`,
  the project-wide `recommended` field, and `renderBuilderHomeSurface` still exist.
- **Next:** plateau 2: `■ BUILDER RESUME` reads the scope.
- **Evidence:** `test/builder/roadmapScope.test.ts`, 14 tests with hand-derived
  expectations over the July and edge trees. A mutation check of the four rules
  that matter (dot in membership, active item excluded, CV not its own candidate,
  ambiguity stated) fails 3, 3, 3, and 2 tests. Plan checkpoint goldens unchanged.
  `typecheck`, `lint`, `npm test` (2694 pass), `git diff --check` green. CI green on
  `3efd1601`.

### Plateau 2 handoff (2026-09-26)

- **True now:** `■ BUILDER RESUME` states the journey's own position.
  `renderBuilderResumeSurface` requires the scope, which `build load` resolves from
  the cursor it already renders. The row reads `no item pulled yet` without an
  active item, the CV's package with one, and says which fallback applies
  otherwise. `resolveRoadmapPosition` is deleted. The four phrases have one owner,
  `scopePhrases.ts`; the position row and `no item pulled yet` exist so far.
- **Intentionally undone:** the recommendation surfaces (`PULL_CANDIDATES`,
  `PROJECT_POSITION`, `ROADMAP SNAPSHOT`, `BUILDER_ORIENTATION`) still recommend
  project-wide, and `renderBuilderHomeSurface` still exists.
- **Next:** plateau 3: the recommendation surfaces read the scoped view.
- **Evidence:** goldens hand-edited with a README row (11 resume renders, 6 load
  renders, 9 `roadmap_position` scenarios removed), by a script asserting those
  counts. New hand-written tests for every resume-row variant and for paragraph
  layout. `typecheck`, `lint`, `npm test` (2697 pass), the Builder lifecycle smoke
  (54/54), and `git diff --check` green.

## Outcome

Pending.
