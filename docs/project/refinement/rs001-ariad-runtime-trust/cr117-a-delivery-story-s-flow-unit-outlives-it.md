[< RS001](index.md) · [Canonical status](../index.md#change-requests)

# CR117 — A Delivery Story's flow unit outlives it, and no story after it can be preauthorized

## Problem

### As captured (2026-10-01)

A flow unit is chosen at a Delivery Story's flow decision, after Prepare or Expand and
before its Plan
([CR105](cr105-choosing-delivery-story-flow-leaves-the-story-confirmation-pending.md)).
In Delivery Story flow the Delivery Story is the lifecycle unit. But Pull carries
`navigator_flow_unit` forward to whatever item is pulled next, with the cadence
(`carriedForward`, `ts/src/builder/cursorTransitions.ts`), while it clears the other
fields that belong to the Delivery Story, its child work items and its aggregate status,
when the item changes (`pullLifecycleItem`, `ts/src/builder/pull.ts`).

So after a Delivery Story runs in Delivery Story flow, every story pulled next holds
`delivery_story`, whichever Delivery Story it belongs to:

- `set-flow-unit` with no `--unit` tells a User Story `Selected flow unit:
  delivery_story`, and that the Delivery Story becomes the lifecycle unit.
- Under `accelerated`, `plan-item` refuses the story: `Error: story Plan
  preauthorization requires story_by_story flow`. No Plan is written. The Navigator's
  explicit delegation, `plan-item --preauthorize-approval --stop-after
  navigator_validation`, refuses the same way under any cadence.
- The remedy the error names cannot be taken. `set-flow-unit --unit story_by_story`
  refuses on a story, as CR105 decided: `no flow unit was chosen: the active item,
  CV1.DS2.US1, is a user story. The flow unit is chosen for its Delivery Story, CV1.DS2,
  before that Delivery Story's Plan.`
- An ordinary Plan works, and so does its approval, with a story's cursor still naming
  Delivery Story flow.

### As characterized (2026-10-05)

Reproduced at `1bec9856` in a scratch home with the [validation route](#validation-route);
its output is under [Evidence](#the-route-before-the-change). The capture holds, and two
more facts shape the fix.

**Every claim runs as captured (route steps 1 to 6).** After `CV1.DS1` runs in Delivery
Story flow to Done, the story pulled next in `CV1.DS2` holds `delivery_story`;
`set-flow-unit` tells it so; `set-flow-unit --unit story_by_story` refuses it, as CR105
decided; `plan-item` under `accelerated` and `plan-item --preauthorize-approval` under
`checkpoint` refuse with `story Plan preauthorization requires story_by_story flow`; an
ordinary Plan and its approval go through with the story's cursor still naming Delivery
Story flow.

**Pulling the story again does not clear it (step 7).** Pull carries the flow unit
through `carriedForward` on every Pull, the same item or another, so the one remedy a
Navigator might try on a story, pulling it again, leaves it where it was. The only ways
out stay `sync-cursor`, which resets the cadence with every other field, and a cadence
change.

**Re-pulling the Delivery Story after other items keeps it too (step 8).** A Delivery
Story pulled fresh, after other items, is back at its flow decision, where the unit is
chosen; carrying the old one past that decision is the same carry one item later. The
one Pull where keeping is right is the Delivery Story re-pulled as the cursor's current
item, mid-flow, where its children and its aggregate status are kept too.

**The real database has the case.** The `finances` journey's cursor holds `CV1.TS3`, a
Technical Story at `done_complete`, with the flow unit `delivery_story`. The next story
pulled there is refused under `accelerated` today, and told to choose a flow unit a
story cannot choose. The `mirror-ts-core` cursor holds `story_by_story`.

**Only Pull carries it blindly.** Every other lifecycle write copies
`navigatorFlowUnit` from the cursor it read, which is right: the item has not changed.
`carriedForward` in `cursorTransitions.ts`, named for the fields every write keeps, is
called by Pull alone, and Pull is the one write where the item changes.

**No golden records the case.** A prototype of the rule below passed every test and
moved no golden: no recorded sequence pulls another item after a Delivery Story ran in
Delivery Story flow.


## Expected Behavior

A flow unit belongs to the Delivery Story it was chosen for. Pulling another item does
not carry it, as Pull already does not carry that Delivery Story's children or aggregate
status: the next item starts from the default, `story_by_story`, and a story can be
planned, and preauthorized, as it could before any Delivery Story ran in Delivery Story
flow.

## Impact

Wrong at the decision point, with no way through. A Navigator who chose `accelerated`
to skip the Plan turn is refused on the first story after any Delivery Story run in
Delivery Story flow, and told to change a flow unit the runtime will not let a story
change. The ways out are to change the cadence, or `sync-cursor`, which resets the
cadence with every other field. Nothing on the resume says why.

## Plan Or Decision

Captured 2026-10-01 while characterizing
[CR115](cr115-the-cadence-profile-is-shown-on-no-read-only-surface.md). On the Ariad
trust floor, last, after CR107, by the Navigator's decision of 2026-10-01
([CR114, decision D5](cr114-the-builder-resume-offers-prepare-on-a-completed-item.md#decisions-this-plan-asks-the-navigator-to-take);
[Decisions](../../decisions.md#the-cv22-release-is-gated-on-an-ariad-trust-floor-worked-before-us3)).

**Approved 2026-10-05** by the Navigator, with D1 and D2 as recorded below; Driver and
Delivery assigned the same day. The panel
reviewed it twice before the plan was presented ([record below](#panel-review-2026-10-05)),
and both passes' changes are folded in.

### Objective

A flow unit belongs to the Delivery Story it was chosen for. Pull keeps it only for that
Delivery Story, re-pulled as the same item; any other Pull, a story in another Delivery
Story, a story in the same one, or a story pulled again, starts from `story_by_story`,
so the story can be planned and preauthorized as it could before any Delivery Story ran
in Delivery Story flow. A cursor written before this change, a story holding
`delivery_story`, is cleared by pulling the story again, and the refusal it meets until
then says so.

### Design

**Pull carries the flow unit only to the Delivery Story it was chosen for (D1).** In
`pullLifecycleItem`, `navigatorFlowUnit` is the cursor's when the pulled code equals the cursor's
active item and the level is `delivery_story`, and `null` otherwise; a predicate of its
own, not `itemChanged`, which is false for a cursor with no item (panel: engineer). The
children and the aggregate status keep their rule.
`carriedForward` in `cursorTransitions.ts` loses the flow unit and keeps the cadence,
which is what every write keeps; its comment says that the flow unit is Pull's own
decision, by this rule. No other write changes: each copies the flow unit it read,
and the item has not changed under it. `sync-cursor` resets as before.

A cursor written before this change that holds `delivery_story` on a story is cleared by
the next Pull of that story, since a story never keeps a flow unit through Pull. No
migration: the `finances` cursor is at `done_complete`, and its next Pull is of another
item anyway.

**The refusal names the way out (D2).** `plan-item`'s refusal, reachable after D1 only
through such a cursor, reads: `story Plan preauthorization requires story_by_story
flow; the cursor holds delivery_story from a Delivery Story pulled before this story.
Pull the story again to start it in story_by_story flow.` It stays an `Error:` line,
as it is: it is not a lifecycle refusal of a step at a stage, and no checkpoint stands
behind it.

**Tests.** `flowUnitCarry.test.ts`, one file for the table and the walk (panel:
engineer). A table over Pull through `pullLifecycleItem`:
the same Delivery Story re-pulled keeps `delivery_story`; a story in another Delivery
Story, a story in the same one, and the same story pulled again get `null`; a cursor
holding `story_by_story` or none is unchanged by any of them. A front-door walk on
`builderWorld`: the route's steps through the walk, with
`plan-item` under `accelerated` and the delegation route under `checkpoint` both
rendering `PLAN_CHECKPOINT` and `PLAN_PREAUTHORIZATION_RECORDED` on the story pulled
after the Delivery Story; and a cursor seeded as `finances` stands, a story at
`done_complete` with `delivery_story`, whose story `plan-item` under `accelerated`
refuses with D2's words, and whose re-pull clears it.

**Skill.** No change: the skill already says the flow unit is chosen at a Delivery
Story's flow decision and nowhere else; the carry was the runtime's, and the runtime
no longer carries.

**Goldens.** One field: the refusal's words are recorded in `builder-lifecycle`'s
`authority_requires_story_by_story_flow`, and D2 changes them; found at plateau 1, the
plan having counted the prototype's D1 and not D2's words. No recorded sequence pulls
another item after a Delivery Story in Delivery Story flow.

### Decisions this plan asks the Navigator to take

1. **D1: Pull keeps a flow unit only for the same Delivery Story.** The item unchanged
   and a Delivery Story; otherwise `null`, the default `story_by_story`. Alternative:
   keep it within the same Delivery Story, as release intent is kept, so a child story
   pulled after its Delivery Story inherits `delivery_story`. Declined: the unit says
   the Delivery Story is the lifecycle unit, which a story cursor is not, and that is
   the contradictory state this CR describes.
2. **D2: the refusal names the remedy that works**, pulling the story again, and says
   where the unit came from. Alternative: leave the words; after D1 the refusal is
   reachable only through a cursor written before it, and `finances` is one.

Approving the plan approves these two as recorded; amendments re-open it.

### Affected files

- `ts/src/builder/pull.ts`: the flow unit by D1's rule.
- `ts/src/builder/cursorTransitions.ts`: `carriedForward` keeps the cadence only; its
  comment.
- `ts/src/builder/plan.ts`: the refusal's words (D2).
- `ts/test/builder/flowUnitCarry.test.ts`, new: the Pull table, the walk, and the
  legacy cursor.
- `docs/project/refinement/index.md`, this document, and the collaboration strategy's
  sequence; `docs/project/decisions.md` at Done.

### Plateaus

Each closes with a commit, a push, and a green CI run that finishes before the next
plateau begins.

0. **Characterize and count.** The route before the change, recorded below. Counted:
   one write carries, one refusal to reword, one real cursor, one golden field (counted
   as none until plateau 1 reworded the refusal).
1. **The carry and the words (D1, D2).** Red first: the Pull table and the walk. Then
   `pull.ts`, `cursorTransitions.ts`, and `plan.ts`. Green; no golden moves.
2. **Validation and handoff.** The route after the change, the Navigator's walk, the
   handoff review, and the ledger.

### Acceptance criteria

1. `pullLifecycleItem` keeps `navigatorFlowUnit` only when the pulled code equals the
   cursor's active item and the level is `delivery_story`; every other Pull writes
   `null`. A table grades the five cases.
2. Through the front door, after a Delivery Story runs in Delivery Story flow to Done:
   a story pulled in another Delivery Story reads `story_by_story` on
   `NAVIGATOR_FLOW_UNIT`; `plan-item` under `accelerated` renders `PLAN_CHECKPOINT` and
   `PLAN_PREAUTHORIZATION_RECORDED`; so does `plan-item --preauthorize-approval
   --stop-after navigator_validation` under `checkpoint`; a child of the closed
   Delivery Story pulled next reads `story_by_story` too; the Delivery Story re-pulled
   as the same item mid-flow still reads `delivery_story`.
3. A cursor holding a story with `delivery_story`, written directly as `finances`
   stands, is refused by `plan-item` under `accelerated` with D2's words, and a Pull of
   that story clears the unit, after which `plan-item` proceeds.
4. The golden diff is one field, the refusal's words in `builder-lifecycle`, listed in
   `ts/test/goldens/README.md`; every other byte is identical.
5. The route after the change meets its pass conditions.

### Validation route

CLI only, in a scratch home, with no Pi session (CR106). Its output before the change is
recorded under [Evidence](#the-route-before-the-change). Run it from the repository root
as a script, with `bash <file>` or `zsh <file>`, so that no interactive alias applies. It
deletes its temporary directory:

```bash
V=$(mktemp -d) && mkdir -p "$V/home" && export MIRROR_HOME="$V/home" MIRROR_USER= NODE_OPTIONS=--no-warnings
cr117() { node ts/src/frontDoor/cli.ts "$@"; }
b() { cr117 build "$@" --journey j --method ariad; }
answer() { grep -o '<<<ARIAD:[A-Z_]*>>>\|^Error: .*' | paste -sd ' ' - | sed 's/^/    answer: /'; }
flow() { b set-flow-unit 2>&1 | sed -n '/<<<ARIAD:NAVIGATOR_FLOW_UNIT>>>/,/<<<END/p' | awk 'index($0, "│ Selected flow unit") == 1 { getline; sub(/^│ +/, ""); sub(/ +│$/, ""); print "    flow unit: " $0 }'; }
cursor() { b show 2>&1 | sed -n '/<<<ARIAD:ACTIVE_CHECKPOINT>>>/,/<<<END/p' | awk 'index($0, "│ active item") == 1 { getline; sub(/^│ +/, ""); sub(/ +│$/, ""); i = $0 } index($0, "│ last event") == 1 { getline; sub(/^│ +/, ""); sub(/ +│$/, ""); e = $0 } END { print "    cursor: item=" i " event=" e }'; }
author() { awk '/^## /{print; print ""; print substr($0,4) ", as the Driver wrote it for this story."; print ""; s=1; next} !s{print}' "$1" > "$1.new" && mv "$1.new" "$1"; }
R="$V/p/docs/project/roadmap" && mkdir -p "$R/cv1/ds1" "$R/cv1/ds2" && printf '# Roadmap\n' > "$R/index.md" && git -C "$V/p" init -q
printf '# CV1 — Checkout\n\n**Status:** 🟢 Active\n' > "$R/cv1/index.md"
for n in 1 2; do printf '# CV1.DS%s — Delivery %s\n\n**Status:** 🟡 Planned\n**Type:** Delivery Story\n\n## Candidate Stories\n\n| Code | Story | Type | Status |\n|------|-------|------|--------|\n| CV1.DS%s.US1 | Story %s | User Story | 🟡 Planned |\n| CV1.DS%s.US2 | Story %s b | User Story | 🟡 Planned |\n| CV1.DS%s.US3 | Story %s c | User Story | 🟡 Planned |\n' $n $n $n $n $n $n $n $n > "$R/cv1/ds$n/index.md"; done
printf '# j\n' | cr117 identity set journey j > /dev/null && cr117 journey set-path j "$V/p" > /dev/null 2>&1 && b adopt > /dev/null && b sync-cursor > /dev/null && b set-cadence --profile checkpoint > /dev/null
echo '--- 1. CV1.DS1 in Delivery Story flow, through Done'
b pull-item --item-code CV1.DS1 --item-level delivery_story --item-title 'Delivery 1' --why-now now > /dev/null 2>&1
b set-flow-unit --unit delivery_story > /dev/null 2>&1; flow
b plan-delivery-story --objective o --child CV1.DS1.US1 > /dev/null 2>&1; b approve-delivery-story-plan > /dev/null 2>&1
b validate-delivery-story --summary s --navigator-accepted > /dev/null 2>&1; b review-delivery-story --decision no_action --summary s > /dev/null 2>&1
for f in $(find "$R/cv1/ds1" -name index.md); do perl -pi -e 's/🟡 Planned/✅ Done/g; s/^\*\*Status:\*\* .*/**Status:** ✅ Done/' "$f"; done
b done-delivery-story --summary s 2>&1 | answer; cursor
echo '--- 2. a story in CV1.DS2 pulled: the flow unit it holds'
b pull-item --item-code CV1.DS2.US1 --item-level user_story --item-title 'Story 2' --why-now now 2>&1 | answer; cursor; flow
echo '--- 3. the remedy the refusal will name: choose story by story on the story'
b set-flow-unit --unit story_by_story 2>&1 | answer
echo '--- 4. accelerated: plan-item on the story'
b set-cadence --profile accelerated > /dev/null; b plan-item 2>&1 | answer
echo '--- 5. the natural explicit delegation, under checkpoint, on the next story'
b set-cadence --profile checkpoint > /dev/null; b pull-item --item-code CV1.DS2.US2 --item-level user_story --item-title 'Story 2 b' --why-now now > /dev/null 2>&1
b plan-item --preauthorize-approval --stop-after navigator_validation 2>&1 | answer
echo '--- 6. an ordinary Plan, then its approval, on a third story'
b pull-item --item-code CV1.DS2.US3 --item-level user_story --item-title 'Story 2 c' --why-now now > /dev/null 2>&1
b plan-item > "$V/plan6" 2>&1; answer < "$V/plan6"; S=$(dirname "$(grep -o "^plan_artifact_path=.*" "$V/plan6" | cut -d= -f2)"); author "$S/plan.md"; author "$S/index.md"; b approve-plan 2>&1 | answer; cursor; flow
echo '--- 7. the same story pulled again: what Pull carries'
b pull-item --item-code CV1.DS2.US3 --item-level user_story --item-title 'Story 2 c' --why-now now 2>&1 | answer; flow
echo '--- 8. CV1.DS1 pulled again, the Delivery Story the unit was chosen for'
b pull-item --item-code CV1.DS1 --item-level delivery_story --item-title 'Delivery 1' --why-now now 2>&1 | answer; flow
unset MIRROR_HOME MIRROR_USER; rm -rf "$V"
```

Pass, after the change:

- Step 1: unchanged: `flow unit: delivery_story` after the choice, the three closure
  surfaces, the cursor at `delivery_story_done_complete`.
- Step 2: `flow unit: story_by_story`.
- Step 3: the same refusal as before: a story chooses no flow unit (CR105).
- Step 4: `<<<ARIAD:PLAN_CHECKPOINT>>> <<<ARIAD:PLAN_PREAUTHORIZATION_RECORDED>>>
  <<<ARIAD:ARTIFACTS_MATERIALIZED>>>`.
- Step 5: the same three surfaces, on the second story.
- Step 6: `PLAN_CHECKPOINT`, `PLAN_APPROVED`, the cursor at `plan_approved`, and
  `flow unit: story_by_story`.
- Step 7: `flow unit: story_by_story`.
- Step 8: `flow unit: story_by_story`: the Delivery Story pulled again, after other
  items, starts at its flow decision.

Fail: `delivery_story` on any step but 1; an `Error:` line on step 4 or 5.

### Conscious exclusions

- Turning the preauthorization refusal into a `CHECKPOINT_REFUSED` surface: it refuses
  no step at a stage, and after D1 it is reachable only through an old cursor.
- A migration of cursors written before this change: the next Pull of the story clears
  it, and `finances`' next Pull is of another item.
- Printing the flow unit on the resume or `build show`: `set-flow-unit` without `--unit`
  prints it, and after this change a story's is always the default.
- The skill: no sentence changes, since the rule it states is the one the runtime now
  keeps.

### Authority boundaries

Plan approval moves CR117 to `planned`. A human Driver and a Delivery reference are
required before `in_progress`. Proposed, as for every floor change: Driver
`@viniciusteles`, Delivery `mirror-ts-core`. `validated` requires the Navigator to walk
the route above and accept it. Each plateau is committed on the Delivery branch and
pushed when green, with GitHub Actions verified after every push. Merge, publication,
and release are not authorized.

Navigator decisions, 2026-10-05: the plan and D1 and D2 approved as recorded, after the
second panel pass; Driver `@viniciusteles`, Delivery `mirror-ts-core`.

### Panel review (2026-10-05)

One pass, before the plan was presented, by the nine lenses loaded in this session:
engineer, quality-assurance, database-architect, devops-engineer, security-engineer,
ai-engineer, prompt-engineer, experience-designer, and product-designer.

Synthesis: a one-line rule in one write, whose risk is in its predicate, not its
intent. The question is which Pull may keep a Delivery Story's unit, and the plan's
first answer, "the item unchanged", borrowed a predicate written for another purpose.
Every finding below is folded into the plan above.

| Lens | Dissent | Resolution |
|---|---|---|
| engineer | `itemChanged` is false when the cursor has no active item, so a cursor with no item and a stale unit would keep it through a Delivery Story's first Pull; the predicate was written to keep children, not to decide a unit | The rule reads the pulled code equals the cursor's active item, and the level is `delivery_story`; `sync-cursor` leaves no unit, but the rule does not depend on it |
| engineer | `carriedForward` is named for what every write keeps and is called by Pull alone; with the unit gone it carries the cadence, which Pull alone threatens to drop | Kept, with the cadence only, and its comment says that the flow unit is Pull's decision, not a carried field |
| engineer | The plan put the Pull table in `cursor.test.ts`, a file about the cursor's persistence, and the walk in a file of its own | One file, `flowUnitCarry.test.ts`, holds the table and the walk, as CR105's `flowUnitStops.test.ts` holds the stops |
| quality-assurance | Criterion 2 names a child of the closed Delivery Story pulled next; the route has no such step | Checked: the walk grades it, and the route stays at eight steps the Navigator can read; the child case is D1's alternative, declined, and the test is where a declined alternative is pinned |

Silent:

- database-architect: one nullable field written `null` one write earlier; nothing
  stored changes shape.
- devops-engineer: no migration; the one real cursor clears on its next Pull.
- security-engineer, ai-engineer: nothing.
- prompt-engineer: D2's sentence names the fact, the cause, and the remedy, in that
  order; the skill's rule about where a flow unit is chosen was already true of the
  method and is now true of the runtime.
- experience-designer, product-designer: a story after a Delivery Story behaves as a
  story did before any Delivery Story ran, which is the only shape a Navigator was ever
  shown.

**Second pass.** By engineer and quality-assurance, over the folded plan. Two facts
were checked first: `pullLifecycleItem` is the only caller of `carriedForward`, and
`sync-cursor` writes the flow unit `null`. Synthesis: the first pass fixed the
predicate; the second found nothing to add. Noted, not changed: Pull of a Delivery
Story at a level other than `delivery_story` clears the unit, which is right, since a
flow unit belongs to a Delivery Story pulled as one.


## Evidence

### As captured

Reproduced 2026-10-01 at `82c1084a`, in a scratch home, with no `.env` and no Pi
session. The roadmap held CV1 with two Delivery Stories, `CV1.DS1` and `CV1.DS2`, one
User Story each. Under `checkpoint`, `CV1.DS1` was pulled, Delivery Story flow chosen,
and the Delivery Story planned, approved, validated, reviewed, and closed. Then:

```text
--- pull a story in DS2
  answer: <<<ARIAD:ITEM_ACTIVATED>>> <<<ARIAD:PREPARE_FIELD_READING>>>
  cursor: item=CV1.DS2.US1 level=user_story event=prepare flow=delivery_story cadence=checkpoint
--- inspect the flow unit; try to choose story by story
│ Selected flow unit                                     │
│ delivery_story                                         │
  answer: Error: no flow unit was chosen: the active item, CV1.DS2.US1, is a user story. The flow unit is chosen for its Delivery Story, CV1.DS2, before that Delivery Story's Plan.
--- accelerated: plan-item
  answer: Error: story Plan preauthorization requires story_by_story flow
--- the natural explicit delegation route, under checkpoint
  answer: Error: story Plan preauthorization requires story_by_story flow
--- ordinary Plan under checkpoint, then approve
  answer: <<<ARIAD:PLAN_CHECKPOINT>>> <<<ARIAD:ARTIFACTS_MATERIALIZED>>>
  answer: <<<ARIAD:PLAN_APPROVED>>>
  cursor: item=CV1.DS2.US1 level=user_story event=plan_approved flow=delivery_story cadence=checkpoint
```

The shape exists outside the scratch home. In the Navigator's database, another
journey's cursor holds a closed Technical Story whose flow unit is `delivery_story`.

### The route before the change

At `1bec9856`:

```text
--- 1. CV1.DS1 in Delivery Story flow, through Done
    flow unit: delivery_story
    answer: <<<ARIAD:DELIVERY_STORY_CLOSURE_CHECKPOINT>>> <<<ARIAD:ARTIFACTS_MATERIALIZED>>> <<<ARIAD:PROJECT_POSITION>>>
    cursor: item=CV1.DS1 — Delivery 1 event=delivery_story_done_complete
--- 2. a story in CV1.DS2 pulled: the flow unit it holds
    answer: <<<ARIAD:ITEM_ACTIVATED>>> <<<ARIAD:PREPARE_FIELD_READING>>>
    cursor: item=CV1.DS2.US1 — Story 2 event=prepare
    flow unit: delivery_story
--- 3. the remedy the refusal will name: choose story by story on the story
    answer: Error: no flow unit was chosen: the active item, CV1.DS2.US1, is a user story. The flow unit is chosen for its Delivery Story, CV1.DS2, before that Delivery Story's Plan.
--- 4. accelerated: plan-item on the story
    answer: Error: story Plan preauthorization requires story_by_story flow
--- 5. the natural explicit delegation, under checkpoint, on the next story
    answer: Error: story Plan preauthorization requires story_by_story flow
--- 6. an ordinary Plan, then its approval, on a third story
    answer: <<<ARIAD:PLAN_CHECKPOINT>>> <<<ARIAD:ARTIFACTS_MATERIALIZED>>>
    answer: <<<ARIAD:PLAN_APPROVED>>>
    cursor: item=CV1.DS2.US3 — Story 2 c event=plan_approved
    flow unit: delivery_story
--- 7. the same story pulled again: what Pull carries
    answer: <<<ARIAD:ITEM_ACTIVATED>>> <<<ARIAD:PREPARE_FIELD_READING>>>
    flow unit: delivery_story
--- 8. CV1.DS1 pulled again, the Delivery Story the unit was chosen for
    answer: <<<ARIAD:DELIVERY_STORY_READY>>> <<<ARIAD:ARTIFACTS_MATERIALIZED>>>
    flow unit: delivery_story
```

Steps 2 to 6 are the capture, each Plan route on its own story. Step 7 is the remedy
that does not work: the story pulled again keeps the unit. Step 8 is the one keep that
is right today, and will not be after the change: a Delivery Story pulled after other
items starts at its flow decision, where the unit is chosen.

### Plateau 1 handoff (2026-10-05)

Now true: Pull keeps a flow unit only when the pulled code equals the cursor's active
item and the level is `delivery_story`, by `keepsFlowUnit` in `pull.ts`; `carriedForward`
carries the cadence alone, and its comment says why; the preauthorization refusal in
`plan.ts` names where the unit came from and the Pull that clears it. Red first:
`flowUnitCarry.test.ts`, the five-case table plus the same story pulled again, the walk
through both preauthorized routes and the child of the closed Delivery Story, and the
cursor seeded as `finances` stands, failed on `delivery_story` where `null` was due and
on the old refusal; then passed. Two things the plan did not foresee. The refusal's old
words are recorded once, in `builder-lifecycle`'s `authority_requires_story_by_story_flow`,
so one golden field moves, by script, with its ledger row; the plan said none, counting
the prototype's D1 and not D2's words. And the route as first recorded had a broken
fixture: an edit to its script had dropped the `printf` arguments that number the
Delivery Stories, so both read `CV1.DS —`, Expand scaffolded a second package, and step
1's Done refused on it; the fixture is fixed, and the route before the change was
re-recorded on `1bec9856` before the change was applied. 2952 tests pass, 3 of them new.
The route after the change meets every pass condition; its output is under
[The route after the change](#the-route-after-the-change-2026-10-05). Plateau 2 is the
Navigator's walk, the handoff review, and the ledger.

### The route after the change (2026-10-05)

At the plateau 1 commit:

```text
--- 1. CV1.DS1 in Delivery Story flow, through Done
    flow unit: delivery_story
    answer: <<<ARIAD:DELIVERY_STORY_CLOSURE_CHECKPOINT>>> <<<ARIAD:ARTIFACTS_MATERIALIZED>>> <<<ARIAD:PROJECT_POSITION>>>
    cursor: item=CV1.DS1 — Delivery 1 event=delivery_story_done_complete
--- 2. a story in CV1.DS2 pulled: the flow unit it holds
    answer: <<<ARIAD:ITEM_ACTIVATED>>> <<<ARIAD:PREPARE_FIELD_READING>>>
    cursor: item=CV1.DS2.US1 — Story 2 event=prepare
    flow unit: story_by_story
--- 3. the remedy the refusal will name: choose story by story on the story
    answer: Error: no flow unit was chosen: the active item, CV1.DS2.US1, is a user story. The flow unit is chosen for its Delivery Story, CV1.DS2, before that Delivery Story's Plan.
--- 4. accelerated: plan-item on the story
    answer: <<<ARIAD:PLAN_CHECKPOINT>>> <<<ARIAD:PLAN_PREAUTHORIZATION_RECORDED>>> <<<ARIAD:ARTIFACTS_MATERIALIZED>>>
--- 5. the natural explicit delegation, under checkpoint, on the next story
    answer: <<<ARIAD:PLAN_CHECKPOINT>>> <<<ARIAD:PLAN_PREAUTHORIZATION_RECORDED>>> <<<ARIAD:ARTIFACTS_MATERIALIZED>>>
--- 6. an ordinary Plan, then its approval, on a third story
    answer: <<<ARIAD:PLAN_CHECKPOINT>>> <<<ARIAD:ARTIFACTS_MATERIALIZED>>>
    answer: <<<ARIAD:PLAN_APPROVED>>>
    cursor: item=CV1.DS2.US3 — Story 2 c event=plan_approved
    flow unit: story_by_story
--- 7. the same story pulled again: what Pull carries
    answer: <<<ARIAD:ITEM_ACTIVATED>>> <<<ARIAD:PREPARE_FIELD_READING>>>
    flow unit: story_by_story
--- 8. CV1.DS1 pulled again, the Delivery Story the unit was chosen for
    answer: <<<ARIAD:DELIVERY_STORY_READY>>> <<<ARIAD:ARTIFACTS_MATERIALIZED>>>
    flow unit: story_by_story
```

### Navigator validation (2026-10-05)

The Navigator ran the route from the repository root at `0360b972`, in their own shell
(`bash <(awk …)` over this document's script). The output matched the Driver's run above
line for line: step 1 unchanged, with the three closure surfaces; `story_by_story` on
steps 2, 6, 7, and 8; the CR105 refusal on step 3; `PLAN_CHECKPOINT`,
`PLAN_PREAUTHORIZATION_RECORDED`, and `ARTIFACTS_MATERIALIZED` on steps 4 and 5;
`PLAN_APPROVED` and the cursor at `plan_approved` on step 6. The Navigator accepted the
validation the same day.

### Handoff review (2026-10-05)

After the Navigator's walk, per the collaboration strategy. The nine lenses reviewed the
delivered code, tests, words, safety posture, operational cost, and resumability,
against the diff from `3bac0124` to `0360b972`: one predicate in Pull, one field fewer
in `carriedForward`, one refusal reworded, one test file.

Synthesis: the change is the size of its rule, the walk proves both preauthorized
routes on the story after a Delivery Story, and the one cursor in the real database
clears on its next Pull. No finding is in the code.

| # | Lens | Finding | Class | Recommendation |
|---|---|---|---|---|
| — | — | No blocker and no debt in the delivered code | — | — |

Checked and dropped:

- The route's "before" output was recorded once on a fixture an edit to the script had
  broken, and read only when "after" failed step 1 (quality-assurance). The document's
  script was byte-equal to the one run each time, so the authority was never wrong,
  but a recorded output is evidence only once it is read. Not a code debt; the lesson
  is in this review and in the plateau handoff.
- `carriedForward` keeps its name with one field fewer (engineer). It still names what
  Pull carries unchanged, and the comment says what left it and why.
- The D2 refusal stays an `Error:` line rather than a `CHECKPOINT_REFUSED` surface
  (engineer): an exclusion the plan made, and after D1 the line is reachable only
  through a cursor older than the rule.
- The `finances` cursor still holds `delivery_story` on a closed story (devops-engineer):
  it is cleared by that journey's next Pull, which is of another item, and no migration
  touches a cursor for one field one write would fix.

The other lenses were silent: nothing stored changes shape; no model; a story after a
Delivery Story behaves as every story did before one ran; the refusal's sentence names
the fact, the cause, and the remedy.

## Outcome

Pending.
