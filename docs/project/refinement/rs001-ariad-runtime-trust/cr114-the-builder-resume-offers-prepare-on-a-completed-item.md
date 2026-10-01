[< RS001](index.md) · [Canonical status](../index.md#change-requests)

# CR114 — The Builder resume offers Prepare on a completed item

## Problem

### As captured (2026-09-30)

`■ BUILDER RESUME` chooses its `allowed next actions` from two facts: whether a
confirmation is pending, and whether the cursor has an active item
(`readBuilderResumeState`, `ts/src/builder/resumeState.ts`). It never reads the last
delivery event. So a cursor whose item closed — `last delivery event: done_complete`,
no checkpoint, nothing pending — is offered the list for an item in progress:

```text
active item            CV22.DS10.TS5
active checkpoint      none
pending confirmation   none
last delivery event    done_complete
allowed next actions   - prepare_active_item
                       - inspect_roadmap
                       - inspect_method
```

`prepare_active_item` on a done item is not a next action; the next action is to pull
the next item, which the list does not name. The same list serves every event between
Pull and Done, so a cursor at `implementation_started` is also told to Prepare.

### As characterized (2026-10-01)

Reproduced at `82c1084a` in a scratch home with the [validation route](#validation-route);
its output is under [Evidence](#the-route-before-the-change). The capture holds, and it
is wider than it knew.

**Every position where nothing is pending gets Prepare, the first one included.** Pull
runs Prepare in the same command, so a story rests at `prepare` from the moment it is
pulled, and the resume tells it to Prepare (route step 1). That is the position a session
most often ends at. The same list follows Plan approval, Validation, Debt Review,
Coherence, and Done (steps 3 to 7), a Delivery Story's Plan approval, Validation, Debt
Review, and Done (steps 12 to 15), and a Delivery Story whose Expand was blocked
(step 16). Only a cursor waiting on a confirmation gets a list that fits it (steps 2, 9
to 11). There is no `implementation_started` event: a cursor between approval and
Validation holds `plan_approved`.

**The command the list offers succeeds, and rewinds.** `prepare-item` has no guard. It
writes `prepare` over whatever the cursor holds and clears its checkpoint. Run on the
Done story, it put the story back before Plan (step 8), where `plan-item` accepts it
again. So the list does not only name a wrong step: it names a command that undoes the
lifecycle, and nothing refuses it.

**`build show` has no list, and where it names a step, the step is refused.** With an
item, its ribbon places the cursor, `◉ Plan` after Pull and `◉ Implement` after
approval, and the resume, read from the same cursor, says Prepare at both. For a journey
whose cursor was never synced, `build show` gives the literal Pull command, and Pull
refuses without a cursor; the resume says `sync_cursor` (step 0).

**The list is chosen twice.** `selectAllowedNextActions` in `resumeSurface.ts` and an
inline copy in `readBuilderResumeState` state the same two-fact rule, and only the copy
is called.

**The recorded corpus holds the defect.** The six `BUILDER_RESUME` renders in
`builder-load.golden.json` are of a cursor at `plan_approved`, told to Prepare. Two
`builder-resume-state` scenarios seed an active item with an event the runtime never
writes (`pulled`, and none) and record Prepare for them.

## Expected Behavior

The resume's next actions follow the cursor's position: after `done_complete`, pull the
next item or inspect the roadmap; after Pull, Prepare; after Prepare or Expand, Plan (or
the flow-unit choice for a Delivery Story); after Plan approval, implement; after
implementation, validate; and so on through the lifecycle the ribbon already draws. One
table, read by the resume and by `build show`, so the two cannot disagree — the way
[CR105](cr105-choosing-delivery-story-flow-leaves-the-story-confirmation-pending.md)
gave the flow-unit choice one table for the question it asks.

## Impact

Wrong at the decision point, on the first surface a session reads. The Builder skill
tells the agent to orient from this card; a card that offers Prepare on a closed item
sends the reader to the wrong command, or teaches the reader to ignore the list, which
is worse.

## Plan Or Decision

Captured 2026-09-30 while working the trust floor, and taken onto it the same day by the
Navigator's decision
([Decisions](../../decisions.md#the-cv22-release-is-gated-on-an-ariad-trust-floor-worked-before-us3)).
Fourth in floor order, one delivery with
[CR115](cr115-the-cadence-profile-is-shown-on-no-read-only-surface.md): both change
what the resume and `build show` print.

**Approved 2026-10-01** by the Navigator, with D1 to D5 as recorded below; Driver and
Delivery assigned the same day. The panel reviewed it twice before approval
([record below](#panel-review-2026-10-01)), and both passes' changes are folded in.

### Objective

The resume and `build show` name the step the cursor accepts next, from one table, and
the two print the same list in every state, a journey with no cursor included. A closed
item is offered the next pull. A position the table does not know is offered no
lifecycle step. Prepare, the step the resume offered everywhere, refuses once the item
is past it. Both surfaces, and the Builder orientation, print the journey's cadence
(CR115).

### Design

**One table says where the cursor stands (D1).** CR067 put the table that places a
cursor on the ribbon in `lifecycleRefusal.ts`, beside the order of the story's events.
Both move to a module of their own, `cursorPosition.ts`, as one ordered table of
positions: for each event the runtime writes, the ribbon stage it draws, as today, and
the steps the runtime accepts next when nothing is pending. The story's event order is
read from the table's story rows, so nothing lists the thirteen events twice (panel:
engineer, second pass). `lifecycleStageOf` moves with it, and a new `allowedNextActions`
reads the steps. `lifecycleRefusal.ts` keeps the steps, their completing events, and the
refusals, and imports the order (engineer). The steps are a closed union type,
`NextAction`, so the table, the tests, and the check on the skill share one vocabulary
(engineer).

| The cursor's last event, nothing pending | Next steps |
|---|---|
| `pull` | `prepare_active_item` |
| `prepare`, a User or Technical Story | `plan_active_item` |
| `prepare`, a Delivery Story | `expand_active_item` |
| `plan_approved`, `delivery_story_plan_approved` | `implement_active_item`, `validate_active_item` |
| `implementation_complete` | `validate_active_item` |
| `validation_passed`, `delivery_story_validation_complete` | `review_active_item_debt` |
| `review_complete` | `check_active_item_coherence`, `close_active_item` |
| `delivery_story_review_complete`, `coherence_complete`, `delivery_story_coherence_complete` | `close_active_item` |
| `done_complete`, `delivery_story_done_complete` | the list for no item: `inspect_roadmap`, `pull_candidate_if_known`, `inspect_method` |
| any other event, or none (D2) | no step |

Every list for an open item ends with `inspect_roadmap` and `inspect_method`. The rest
of the selection stays as it is, and moves into `allowedNextActions` with it: a pending
confirmation gives `answer_pending_confirmation` and `inspect_method` (CR105, decision
A1), a cursor with no item gives the list for no item, and no cursor gives
`sync_cursor` and `inspect_method`. Each step is one the runtime accepts at that
position. Validation is accepted from Plan approval, with the implementation evidence,
and Done from Debt Review. Coherence is optional for a story, and folded into Done for a
Delivery Story, as the Builder skill routes it. After `done_complete` the ribbon still
draws `◉ Done`, and the list offers the next pull.

The capture put the flow-unit choice after a Delivery Story's Prepare. In the product a
Delivery Story rests at `prepare` only when its Expand was blocked, since Pull runs
Expand (route step 16). What comes next there is Expand, which Pull runs again once the
candidate table is fixed. The flow-unit choice comes with Expand's question, which is
already pending when the resume reads it.

**The resume and `build show` call the one selector.** `selectAllowedNextActions` and
the inline copy in `readBuilderResumeState` go. The resume's cursor view gains the
item's level, which the table needs for `prepare`. `build show` prints the list in all
three of its branches, under the resume's label, `allowed next actions`. With an item,
the rows run `active checkpoint`, `cadence profile`, `allowed next actions`, `records`,
so the reader meets the condition before the action, as on the resume
(experience-designer, second pass). With no item, the list follows the Pull command it
already gives. With no cursor, the first row reads `no delivery cursor yet`, the fact
that chooses the step, where it read `no item pulled yet` (product-designer, second
pass), and the list, `sync_cursor` and `inspect_method`, replaces the Pull command,
which refuses there.

**Prepare refuses once the item is past it (D3).** Prepare becomes the seventh
`LifecycleStep`, with `plan` as its completing event, so `refuseIfAlreadyComplete`
refuses it from Plan on with CR067's own sentence: `Prepare is already complete for
CV1.DS1.US1: the cursor is at done_complete.` CR067's table-driven test then grades
Prepare at every ordered event with the six other steps (engineer, second pass). A
Delivery Story event, or one the table does not know, is refused `not_reached`, as Plan
refuses an event that is not its predecessor: `Prepare follows Pull: CV1.DS1 is at
delivery_story_done_complete.` Neither sentence claims more than where the cursor is
(prompt-engineer, second pass). A cursor at `pull`, at `prepare`, or with no event is
accepted, so Pull's own Prepare, which runs right after Pull writes `pull`, is untouched,
and Prepare at `prepare` still runs. `prepare-item` renders `CHECKPOINT_REFUSED`, exit
1, and nothing changes. No recorded sequence prepares past those three, so no golden
moves for it.

**The skill says what each step means, and that offering is not doing.** `mm-build`'s
activation section gains a rule for a journey with an active item: offer the step the
list names, in its order, and no lifecycle step it does not. Offering is not doing: the
Builder Activation Boundary still holds after a load, so no step runs before the
Navigator's instruction (panel: ai-engineer). Under the rule, one line per step names
the section or command it routes to. `answer_pending_confirmation` means asking the
Navigator the question the `pending confirmation` row names, never answering it
(prompt-engineer). `expand_active_item` means pulling the Delivery Story again, after
the Navigator fixes what `EXPAND_BLOCKED` named. In Delivery Story flow, the same names
route to the Delivery Story commands. A list with no lifecycle step on an open item
means the cursor holds a position Ariad does not know; the skill says to say so and
offer `sync-cursor`, then Pull, so D2 is a route and not a dead end (product-designer,
second pass). A test fails when the table can produce an identifier the skill does not
name (quality-assurance). `Show The Active Checkpoint` says `build show` prints the
list and the cadence, and stops saying the Plan-stage files are marked present or
missing, which has been untrue since CR112 gave them states (prompt-engineer). The
words are under [Skill text](#skill-text), so the Navigator approves words and not
intent (prompt-engineer, second pass). The Claude copies regenerate (CR102).

**CR115: the cadence on every orienting surface (D4).** One module, `cadence.ts`, holds
the effective profile and the rows that print it (engineer). It imports nothing from
the cursor's persistence module: it declares the two-field view it reads, and the
cursor satisfies it (engineer, second pass). A cursor that stores no cadence has the
profile `stepwise`, the one the runtime applies to it. The sync report and
`continue-lifecycle` each hold that default today, and they read the module instead.
The resume and `build show` print two more of their label-and-value pairs:
`cadence profile` and the profile, and under `autonomous`, `cadence limits` and the
limits joined by commas, or `none`. They follow `last delivery event` on the resume,
and `active checkpoint`, or the Pull command, on `build show`. With no cursor, both
print `none`. The orientation is written in questions, so it asks `How will the next
item run?` and answers in its own `label: value` rows, as it answers the Refinement
question: `cadence profile: checkpoint`, and under `autonomous`, `cadence limits: …`
(experience-designer). The block precedes `What can we do now?`.
`renderBuilderOrientationSurface` takes the cadence as a required argument, so every
caller decides. The skill's cadence section says where to read it.

### Skill text

The three edits to `.pi/skills/mm-build/SKILL.md`, as they will read. Everything else
in the skill stays.

In **Ariad Activation Surfaces**, after the paragraph that ends "or whether to inspect
the roadmap further, after the verbatim blocks":

```text
For an Ariad journey with an active item, the resume's `allowed next actions` are
the steps the cursor accepts next, the recommended one first; `build show` prints
the same list. Offer the step the list names, and no lifecycle step it does not.
Offering is not doing: the Builder Activation Boundary holds, and no step runs
before the Navigator says so. Each step routes to a section of this skill, or in
Delivery Story flow to its Delivery Story command:

- `answer_pending_confirmation`: ask the Navigator the question the `pending
  confirmation` row names. Never answer it.
- `prepare_active_item`: Prepare, `build prepare-item`.
- `expand_active_item`: Expand was blocked. After the Navigator fixes what
  `EXPAND_BLOCKED` named, pull the Delivery Story again.
- `plan_active_item`: Plan Ariad Work.
- `implement_active_item`: the implementation guard, then the approved Plan.
- `validate_active_item`: Validate Ariad Work.
- `review_active_item_debt`: Review Ariad Debt.
- `check_active_item_coherence`: Check Ariad Coherence.
- `close_active_item`: Close Ariad Done.
- `inspect_roadmap`, `pull_candidate_if_known`: the item is closed, or none is
  pulled. Inspect Roadmap And Pull Candidates, then Pull.
- `sync_cursor`, `adopt_method`, `inspect_method`: Sync Delivery Cursor, Adopt
  Ariad, Inspect Builder Method.

A list with no lifecycle step, on an item that is open, means the cursor holds a
position Ariad does not know. Say so, and offer `sync-cursor`, then Pull.
```

In **Show The Active Checkpoint**, the second paragraph's first two sentences become:

```text
Return the `ACTIVE_CHECKPOINT` surface verbatim. It shows the stage, the cursor's
position, the cadence, the steps the cursor accepts next, as the resume lists them,
and the story package's files: `index.md`, `plan.md`, and `test-guide.md` with their
state, and the closure records, each present or missing.
```

In **Pull And Prepare Ariad Work**, after the `autonomous` example:

```text
The Builder resume, `build show`, and the Builder orientation print the cadence
profile and, under `autonomous`, its limits. Read it there before Plan: under
`accelerated`, Plan continues into implementation without a Navigator turn.
```

### Decisions this plan asks the Navigator to take

1. **D1: the steps are named in the resume's own vocabulary**, one `<verb>_active_item`
   identifier per step, as `prepare_active_item` is. Alternative: print the literal
   `build` command for each step, as the no-item surfaces print Pull's. It is exact,
   but each command wraps to two or three card rows, and the Delivery Story steps
   would need their own commands in the list.
2. **D2: a position the table does not know offers no lifecycle step**, only the two
   inspections: an active item with an event the runtime never writes, or none. This
   is CR067's rule for the ribbon, never a guessed stage, applied to the list.
   Alternative: keep Prepare as the fallback, today's list, which on such a cursor
   rewinds whatever state it held.
3. **D3: Prepare's missing guard, found while characterizing, is fixed inside CR114**,
   because the resume offered the command that rewinds, and removing the offer leaves
   the rewind one keystroke away. Alternative: capture it as CR118, outside this
   delivery.
4. **D4: CR115 prints the cadence on the three surfaces its Expected Behavior names**,
   the resume, `build show`, and the orientation, and not on `build inspect-method
   --journey`, which answers which method governs the journey and reads no cursor.
   Alternative: add it there too, which puts the first cursor read into the method
   surfaces.
5. **D5: [CR117](cr117-a-delivery-story-s-flow-unit-outlives-it.md), found while
   characterizing CR115, joins the floor last, after CR107.** After a Delivery Story
   runs in Delivery Story flow, every story pulled next inherits its flow unit, and no
   story Plan can then be preauthorized, under `accelerated` or on the Navigator's
   explicit delegation. Alternative: keep it off the floor.

Approving the plan approves these five as recorded; amendments re-open it.

### Affected files

- `ts/src/builder/cursorPosition.ts`, new: the ordered table of positions, with
  `STORY_LIFECYCLE_EVENTS` and `lifecycleStageOf` from `lifecycleRefusal.ts`,
  `NextAction`, `allowedNextActions`, and the action lists. Every importer of the two
  follows them.
- `ts/src/builder/lifecycleRefusal.ts`: `prepare` as a `LifecycleStep`, completing at
  `plan`.
- `ts/src/builder/resumeState.ts`, `resumeSurface.ts`: the list from the selector, and
  the cadence rows. The resume's cursor view carries the level and the cadence.
- `ts/src/builder/activeCheckpoint.ts`: the list and the cadence rows, in every branch.
- `ts/src/builder/homeSurface.ts`, `load.ts`: the orientation's cadence, passed in.
- `ts/src/builder/prepare.ts`, `commands.ts`: Prepare's guard, and its refusal rendered.
- `ts/src/builder/cadence.ts`, new: the view it reads, the effective profile, and its
  rows. The sync report in `deliveryCursor.ts`, and `continue-lifecycle` in
  `commands.ts`, read it.
- `.pi/skills/mm-build/SKILL.md` and its generated Claude copies.
- `ts/test/builder/*`: new tests. A table-driven test over every event and level. A
  front-door walk through a story's lifecycle and a Delivery Story's, which compares the
  resume's list with `build show`'s at every position and runs each offered step's
  command there, forking where two are offered. Prepare in CR067's table-driven test,
  and refused at the Delivery Story events and at an unknown one. The skill naming
  every step.
- `ts/test/goldens/builder-load.golden.json`, `builder-resume-state.golden.json`,
  `builder-orientation.golden.json`, and `README.md`: the scripted edits.

### Plateaus

Each closes with a commit, a push, and a green CI run that finishes before the next
plateau begins.

0. **Characterize and count.** The route before the change, recorded below. Counted: 6
   recorded resume renders change their list (all at `plan_approved`, in `builder-load`),
   and 2 `builder-resume-state` expectations (D2). For CR115, the same 6 resume renders,
   and the 14 resume renders and 8 orientation renders in `builder-orientation`, each
   gain the cadence rows. No recorded sequence runs Prepare past `pull`, `prepare`, or no
   event. `ACTIVE_CHECKPOINT` is in no golden.
1. **The next steps (CR114).** D1 and D2: the table, `allowedNextActions`, the resume
   and `build show` reading it, and the skill's rule and list. The 8 recorded lists are
   edited by script, each derived from the table's rule, never from TypeScript output.
2. **Prepare's guard (D3).** Red first: route step 8 as a test. No golden should move.
3. **The cadence (CR115).** D4: `cadence.ts`, the rows on the three surfaces, and the
   skill's sentence. The 28 recorded renders gain their rows by script: `stepwise` for
   every recorded cursor, since none stores a cadence, and `none` for the 2 resume
   renders with no cursor. `builder-orientation` records its resume states as renderer
   input, lists included, and they are rendered as recorded; the table's rule is graded
   by its own test and by the `builder-load` renders.
4. **Validation and handoff.** The route after the change, the Navigator's walk, the
   handoff review, and the ledger.

### Acceptance criteria

1. At every position of a story's lifecycle and of a Delivery Story's in Delivery Story
   flow, and for a journey with no cursor, the resume's `allowed next actions` are the
   table's, and `build show` prints the identical list. With no item and nothing
   pending, where `build load` renders the orientation and no resume, `build show`
   prints the table's list for no item; the orientation keeps CR002's moves.
2. Every lifecycle step a list offers is one the runtime accepts at that position: the
   front-door walk runs the command each step routes to, on the position it was offered
   at, forking where two steps are offered, and none refuses.
3. After Done, of a story or a Delivery Story, the list is the list for no item. An
   active item with an event the table does not know, or none, is offered only the two
   inspections. `build show` never gives a command that refuses where it is given.
4. `lifecycleStageOf` and `allowedNextActions` read one table, and nothing else chooses
   the list.
5. Prepare is a `LifecycleStep`, and CR067's table-driven test grades it at every
   ordered event: it proceeds at `pull` and `prepare`, and is already complete from
   `plan` on. At every Delivery Story event, and at an event the table does not know,
   it is refused `not_reached`. `prepare-item` renders `CHECKPOINT_REFUSED`, exit 1,
   with the cursor and the project files unchanged. Pull still prepares, and Prepare
   with no event still runs.
6. The resume and `build show`, in each branch, print `cadence profile` with the
   effective profile, and under `autonomous` its `cadence limits`; the orientation
   prints the same values in its own rows. A cursor that stores none prints `stepwise`,
   and no cursor prints `none`. `cadence.ts` computes the effective profile for these
   surfaces, the sync report, and `continue-lifecycle`.
7. The golden diff is a contract:
   - in the 6 `builder-load` resume renders, the list rows change, and the cadence rows
     arrive;
   - in the 2 `builder-resume-state` expectations, only `allowed_next_actions` changes;
   - in the 22 `builder-orientation` renders, only the cadence rows arrive;
   - every other byte is identical, and every edit is listed in
     `ts/test/goldens/README.md` with its reason and its count.
8. The skill carries the [Skill text](#skill-text), and a test fails when the table can
   produce an identifier the skill does not name. `buildClaudePlugin.ts --check` passes.

### Validation route

CLI only, in a scratch home, with no Pi session (CR106). Its output before the change is
recorded under [Evidence](#the-route-before-the-change). Run it from the repository root
as a script, with `bash <file>` or `zsh <file>`, so that no interactive alias applies.
It deletes its temporary directory:

```bash
V=$(mktemp -d) && mkdir -p "$V/home" && export MIRROR_HOME="$V/home" MIRROR_USER= NODE_OPTIONS=--no-warnings
cr114() { node ts/src/frontDoor/cli.ts "$@"; }
R="$V/p/docs/project/roadmap" && mkdir -p "$R/cv1/ds1" "$R/cv1/ds2" && printf '# Roadmap\n' > "$R/index.md"
printf '# CV1 — Checkout\n\n**Status:** 🟢 Active\n' > "$R/cv1/index.md"
printf '# CV1.DS1 — Checkout address\n\n**Status:** 🟡 Planned\n**Type:** Delivery Story\n\n## Candidate Stories\n\n| Code | Story | Type | Status |\n|------|-------|------|--------|\n| CV1.DS1.US1 | Enter an address | User Story | 🟡 Planned |\n| CV1.DS1.TS1 | Validate the address | Technical Story | 🟡 Planned |\n' > "$R/cv1/ds1/index.md"
printf '# CV1.DS2 — Checkout payment\n\n**Status:** 🟡 Planned\n**Type:** Delivery Story\n\n## Candidate Stories\n\n| Family | Scope |\n|--------|-------|\n| cards | pay by card |\n' > "$R/cv1/ds2/index.md"
git -C "$V/p" init -q
for j in j k m; do printf '# %s\n' $j | cr114 identity set journey $j > /dev/null && cr114 journey set-path $j "$V/p" > /dev/null 2>&1
  cr114 build adopt --journey $j --method ariad > /dev/null; done
for j in j k; do cr114 build sync-cursor --journey $j --method ariad > /dev/null; done
b() { cr114 build "$@" --journey j --method ariad; }
answer() { grep -o '<<<ARIAD:[A-Z_]*>>>\|^Error: .*' | paste -sd ' ' - | sed 's/^/  answer: /'; }
card() { sed -n "/<<<ARIAD:$1>>>/,/<<<END:$1>>>/p" | sed -n '/^╭/,/^╰/p' | sed '1d;$d' | sed 's/│//g; s/ *$//'; }
rows() { awk -v h=" $1" '$0 == h { f = 1; next } f && $0 == "" { exit } f { sub(/^ +(- )?/, ""); printf "%s%s", (n++ ? ", " : ""), $0 } END { print (n ? "" : "(none)") }'; }
text() { awk -v h=" $1" '$0 == h { f = 1; next } f && $0 == "" { exit } f { sub(/^ +/, ""); printf "%s%s", (n++ ? " " : ""), $0 } END { print (n ? "" : "(none)") }'; }
inline() { awk -v k=" $1: " 'index($0, k) == 1 { print substr($0, length(k) + 1); f = 1; exit } END { if (!f) print "(none)" }'; }
where() {
  cr114 build load "${1:-j}" 2>/dev/null > "$V/load"; cr114 build show --journey "${1:-j}" --method ariad > "$V/show" 2>&1
  echo "  resume: $(card BUILDER_RESUME < "$V/load" | rows 'last delivery event') → $(card BUILDER_RESUME < "$V/load" | rows 'allowed next actions')"
  echo "  show:   $(card ACTIVE_CHECKPOINT < "$V/show" | rows 'last event') → $(card ACTIVE_CHECKPOINT < "$V/show" | rows 'allowed next actions')"
}
author() { awk '/^## /{print; print ""; print substr($0,4) ", as the Driver wrote it for this story."; print ""; s=1; next} !s{print}' "$1" > "$1.new" && mv "$1.new" "$1"; }
echo '--- 0. a journey adopted, its cursor not synced'; where m
echo "  show:   $(card ACTIVE_CHECKPOINT < "$V/show" | text 'active item')"
b set-cadence --profile checkpoint > /dev/null
echo '--- 1. a User Story pulled: Pull runs Prepare'
b pull-item --item-code CV1.DS1.US1 --item-level user_story --item-title 'Enter an address' --why-now now 2>&1 | answer; where
echo '--- 2. planned'; b plan-item 2>&1 | answer; where
S="$R/cv1/ds1/cv1-ds1-us1-enter-an-address"; author "$S/plan.md"; author "$S/index.md"
echo '--- 3. Plan approved'; b approve-plan 2>&1 | answer; where
echo '--- 4. validated'
b validate-item --implementation-complete --check 'npm test' --checks-status passed --e2e-decision not_required --e2e-evidence 'unit covered' \
  --navigator-route 'run it' --navigator-accepted --expected-observation 'it works' --pass-condition 'it works' --fail-condition 'it breaks' 2>&1 | answer; where
echo '--- 5. debt reviewed'; b review-item --debt 'No debt found' --decision no_action 2>&1 | answer; where
echo '--- 6. coherent'; b coherence-item --process p --project p --product p 2>&1 | answer; where
echo '--- 7. done'; b done-item --history-action h --roadmap-update r --next-recommendation n 2>&1 | answer; where
echo '--- 8. Prepare, run on the done story'; b prepare-item 2>&1 | answer
echo "  show:   $(b show 2>&1 | card ACTIVE_CHECKPOINT | rows 'last event')"
echo '--- 9. the Delivery Story pulled: Pull runs Prepare and Expand'
b pull-item --item-code CV1.DS1 --item-level delivery_story --item-title 'Checkout address' --why-now now 2>&1 | answer; where
echo '--- 10. Delivery Story flow chosen'; b set-flow-unit --unit delivery_story 2>&1 | answer; where
echo '--- 11. Delivery Story planned'; b plan-delivery-story --objective 'Checkout takes an address' --child CV1.DS1.US1 --child CV1.DS1.TS1 2>&1 | answer; where
echo '--- 12. Delivery Story Plan approved'; b approve-delivery-story-plan 2>&1 | answer; where
echo '--- 13. Delivery Story validated'; b validate-delivery-story --summary s --navigator-accepted 2>&1 | answer; where
echo '--- 14. Delivery Story debt reviewed'; b review-delivery-story --decision no_action --summary s 2>&1 | answer; where
for f in $(find "$R/cv1/ds1" -name index.md); do sed 's/🟡 Planned/✅ Done/g; s/Status:\*\* .*/Status:** ✅ Done/' "$f" > "$f.new" && mv "$f.new" "$f"; done
echo '--- 15. Delivery Story done'; b done-delivery-story --summary s 2>&1 | answer; where
echo '--- 16. a Delivery Story whose Expand is blocked'
b pull-item --item-code CV1.DS2 --item-level delivery_story --item-title 'Checkout payment' --why-now now 2>&1 | answer; where
echo '--- 17. the cadence on every orienting surface; journey k has no item pulled'
cadence() { if [ "$2" = autonomous ]; then cr114 build set-cadence --journey "$1" --method ariad --profile "$2" --limit 'stop before push'
  else cr114 build set-cadence --journey "$1" --method ariad --profile "$2"; fi > /dev/null; }
for p in stepwise checkpoint accelerated autonomous; do
  cadence j $p; cadence k $p
  cr114 build load j 2>/dev/null > "$V/load"; b show > "$V/show" 2>&1; cr114 build load k 2>/dev/null > "$V/home-k"
  echo "  $p: resume $(card BUILDER_RESUME < "$V/load" | rows 'cadence profile') [$(card BUILDER_RESUME < "$V/load" | rows 'cadence limits')]" \
    "| show $(card ACTIVE_CHECKPOINT < "$V/show" | rows 'cadence profile') [$(card ACTIVE_CHECKPOINT < "$V/show" | rows 'cadence limits')]" \
    "| orientation $(card BUILDER_ORIENTATION < "$V/home-k" | inline 'cadence profile') [$(card BUILDER_ORIENTATION < "$V/home-k" | inline 'cadence limits')]"
done
unset MIRROR_HOME MIRROR_USER; rm -rf "$V"
```

Pass, after the change. In every step, the `resume` line and the `show` line under it
hold the same list:

- Step 0: `sync_cursor, inspect_method`, and `build show` reads `no delivery cursor
  yet` with no Pull command.
- Step 1: `prepare → plan_active_item, inspect_roadmap, inspect_method`.
- Step 3: `plan_approved → implement_active_item, validate_active_item, inspect_roadmap,
  inspect_method`.
- Step 4: `validation_passed → review_active_item_debt, …`.
- Step 5: `review_complete → check_active_item_coherence, close_active_item, …`.
- Step 6: `coherence_complete → close_active_item, …`.
- Step 7: `done_complete → inspect_roadmap, pull_candidate_if_known, inspect_method`.
- Step 8: `CHECKPOINT_REFUSED`, and `build show` still at `done_complete`.
- Steps 2, 9, 10, and 11: `answer_pending_confirmation, inspect_method`, as before.
- Step 12: `delivery_story_plan_approved → implement_active_item, validate_active_item, …`.
- Step 13: `delivery_story_validation_complete → review_active_item_debt, …`.
- Step 14: `delivery_story_review_complete → close_active_item, …`.
- Step 15: `delivery_story_done_complete → inspect_roadmap, pull_candidate_if_known,
  inspect_method`.
- Step 16: `EXPAND_BLOCKED`, then `prepare → expand_active_item, …`.
- Step 17: each profile on all three surfaces, with `[(none)]` for its limits, except
  `autonomous: resume autonomous [stop before push] | show autonomous [stop before
  push] | orientation autonomous [stop before push]`.

Fail: `prepare_active_item` anywhere but after a bare Pull; a `resume` list and a `show`
list that differ; a Prepare that runs in step 8; a command on `build show` that refuses
where it is given; or a surface that omits the cadence, or prints limits for a profile
other than `autonomous`.

### Conscious exclusions

- The ribbon on `build show` for a Delivery Story event. CR067 left those events without
  a stage; that is an absence, not a false statement, and it stays.
- `◉ Done` on the ribbon after `done_complete`, where every stage is complete. The list
  says what comes next; the ribbon's glyph is a separate matter.
- `build load` rendering the resume, not the orientation, for a closed item. The list
  now points to the next pull; which surface a closed item deserves is a product
  decision nobody has asked for.
- A next action per kind of pending confirmation (CR105, A2, declined).
- A gloss of what each cadence profile does (product-designer, declined in the review).
- A transcript eval of the offer rule. The eval harness has no Builder case, and the
  skill-naming test is the floor (ai-engineer, second pass).
- An inspection form of `set-cadence`. The three orienting surfaces carry the cadence.
- `sync-cursor` resetting the cadence to `stepwise`. It prints the cadence in its report.
- CR117's flow unit. It is captured, and D5 places it.

### Authority boundaries

Plan approval moves CR114 and CR115 to `planned`. A human Driver and a Delivery
reference are required before `in_progress`. Proposed, as for every floor change: Driver
`@viniciusteles`, Delivery `mirror-ts-core`. `validated` requires the Navigator to walk
the route above and accept it. Each plateau is committed on the Delivery branch and
pushed when green, with GitHub Actions verified after every push. Merge, publication,
and release are not authorized.

Navigator decisions, 2026-10-01: the plan and D1 to D5 approved as recorded, after the
second panel pass; Driver `@viniciusteles`, Delivery `mirror-ts-core`, for CR114 and
CR115.

### Panel review (2026-10-01)

One pass, before the Navigator saw the plan, by nine lenses: engineer,
quality-assurance, database-architect, devops-engineer, security-engineer, ai-engineer,
prompt-engineer, experience-designer, and product-designer. The AI engineer sat in
because the change is to what an agent offers from a card it reads at every session
start.

Synthesis: the plan aims at the cause, a list chosen without the event, and its risk is
not in the table, which is small and fully enumerable. It is in the two readers around
the table: the agent, which must treat a correct list as an offer and not a mandate,
and the tests, which must prove that every offered step is one the runtime takes. Every
finding below is folded into the plan above.

| Lens | Dissent | Resolution |
|---|---|---|
| engineer | A table of positions and next steps in a module named for refusals is found by nobody looking for what the resume offers | `cursorPosition.ts` holds the table and `lifecycleStageOf`; `lifecycleRefusal.ts` keeps the event order and the refusals |
| engineer | Eleven identifiers as string literals across a table, a walk, and a skill check: a typo is a runtime surprise | `NextAction`, a closed union type |
| engineer | Card rows in `deliveryCursor.ts` would put presentation into the cursor's persistence module | `cadence.ts` holds the effective profile and the rows |
| quality-assurance | The mapping from step to command lives twice, in the walk and in the skill, and nothing ties the skill to the table | A test fails when the table can produce an identifier the skill does not name (criterion 8) |
| quality-assurance | Prepare's guard, tested only at Done, proves one position of twenty | Refused at every position the table knows but `pull` and `prepare`, at both levels, and at an unknown event (criterion 5) |
| quality-assurance | "The two cannot disagree" was unproven for a journey with no cursor, and there they do: `build show` gives a Pull command that refuses | `build show` prints the selector's list in every branch, and no Pull command without a cursor (route step 0, criteria 1 and 3) |
| ai-engineer | A truthful list is read by a model as a to-do list. `implement_active_item` after a load is a step an agent can take on its own | The skill says offering is not doing: the Builder Activation Boundary holds after a load |
| prompt-engineer | `answer_pending_confirmation` is the one step whose meaning a model can invert, by answering | The skill says to ask the Navigator the pending question, never to answer it |
| prompt-engineer | The `build show` paragraph this plan edits still says the Plan-stage files are marked present or missing, untrue since CR112 | Rewritten to be true while adding the list and the cadence |
| experience-designer | The orientation speaks in questions; a bare `cadence profile` row in it reads as a form field left behind | It asks `How will the next item run?` and answers in its own `label: value` rows |
| product-designer | The profile's name answers "which cadence", and only through recall "will my next Plan stop" | Declined. The name is the method's own vocabulary, defined once by `inspect-method ariad` and explained to the agent by the skill; a gloss on three cards would restate the method and drift from it. The Navigator can ask for it |

Silent:

- database-architect: nothing new is stored, and the cursor's shape is unchanged. The
  guard protects an invariant, that a closed item does not move back, at the one write
  that broke it. The reader stays lenient, and the list refuses to guess from an event it
  does not know, as the ribbon does.
- devops-engineer: no consumer outside the Builder reads the list or the cadence rows,
  in the repository or the installed runtime. No migration, and the Claude copies are
  checked in CI.
- security-engineer: the limits enter wrapped surfaces for the first time. They are the
  Navigator's own text, set in the Navigator's shell, and printed inside card rows like
  roadmap titles, which come from less trusted hands.

**Second pass.** The Navigator asked the Driver to choose the personas and have them
review the plan. The Driver chose six, the lenses that own what the change touches:
engineer (the table, the guard, module boundaries), quality-assurance (acceptance, the
walk, the goldens), ai-engineer (what an agent does with the list), prompt-engineer
(the skill's words), experience-designer (the card rows), and product-designer (the
decision point); and left out database-architect (nothing stored changes),
devops-engineer (no migration, no consumer outside the Builder), and security-engineer
(the limits are the Navigator's own text, in card rows like roadmap titles). Four
facts were checked first: CR067's table-driven test grades every step at every ordered
event against `isAlreadyComplete`; `check-implementation` allows
`delivery_story_plan_approved` in Delivery Story flow, since approval writes
`plan:approved`; `renderBuilderOrientationSurface` has one product caller; the eval
harness has no Builder case, and Biome 2.5 has `noImportCycles`, not enabled.
Synthesis: the first pass fixed what the plan said; the second found where it was
building what already existed, and where it asked the Navigator to approve a rule
without its words. All folded above:

- **Prepare's guard was a second refusal machinery** (engineer): a whitelist beside
  `refuseIfAlreadyComplete`, with its own sentence. Prepare becomes the seventh
  `LifecycleStep`, completing at `plan`, and CR067's test grades it with the others;
  Delivery Story and unknown events are refused as Plan refuses a wrong predecessor.
- **The thirteen events in two modules** (engineer): the stage table moved and the
  order stayed, pinned to each other by a test. The order is read from the table.
- **`cadence.ts` importing the persistence module** (engineer): it declares the
  two-field view it reads instead.
- **Criterion 1 compared two surfaces at a state where one does not render**
  (quality-assurance): with no item, `build load` prints the orientation. The criterion
  names the pairs.
- **The walk proved one branch of two** (quality-assurance): it forks where two steps
  are offered.
- **"Every position" for the guard** (quality-assurance): CR067's test, plus the
  Delivery Story events and an unknown one, named in criterion 5.
- **A rule approved without its words** (prompt-engineer): the skill's three edits are
  drafted under [Skill text](#skill-text).
- **A refusal that asserted a consequence** (prompt-engineer): "would move it back
  before Plan" left the sentence; both sentences say only where the cursor is.
- **The cadence after the list on `build show`** (experience-designer): it precedes
  the list, as on the resume.
- **D2 was a dead end** (product-designer): the skill says what a list with no
  lifecycle step means, and offers `sync-cursor`, then Pull.
- **`no item pulled yet` with no cursor** (product-designer): true, and not the fact
  that chooses `sync_cursor`. The row reads `no delivery cursor yet`.

Noted, not changed: the offer rule is prompt-layer behavior nothing measures today,
since the eval harness has no Builder case; the skill-naming test is the deterministic
floor, and a transcript eval is out of scope (ai-engineer).

## Evidence

### As captured

Observed 2026-09-30 at `9dca47a0`, the `build load mirror-ts-core` that opened this
session, with the cursor still on CV22.DS10.TS5 five days after its Done. The card above
is the one rendered. `ACTIVE_ITEM_ACTIONS` (`ts/src/builder/resumeSurface.ts`) is the
list, and `resumeState.ts` selects it whenever `activeItem` is set and nothing is
pending.

### The route before the change

At `82c1084a`, identical across two runs, and in bash and zsh:

```text
--- 0. a journey adopted, its cursor not synced
  resume: none → sync_cursor, inspect_method
  show:   (none) → (none)
  show:   no item pulled yet pull explicitly: mirror build pull-item --journey m --method ariad --item-code <code> --item-title "<title>" --item-level <level> --why-now "<why now>"
--- 1. a User Story pulled: Pull runs Prepare
  answer: <<<ARIAD:ITEM_ACTIVATED>>> <<<ARIAD:PREPARE_FIELD_READING>>>
  resume: prepare → prepare_active_item, inspect_roadmap, inspect_method
  show:   prepare → (none)
--- 2. planned
  answer: <<<ARIAD:PLAN_CHECKPOINT>>> <<<ARIAD:ARTIFACTS_MATERIALIZED>>>
  resume: plan → answer_pending_confirmation, inspect_method
  show:   plan → (none)
--- 3. Plan approved
  answer: <<<ARIAD:PLAN_APPROVED>>>
  resume: plan_approved → prepare_active_item, inspect_roadmap, inspect_method
  show:   plan_approved → (none)
--- 4. validated
  answer: <<<ARIAD:VALIDATION_CHECKPOINT>>> <<<ARIAD:DEBT_REVIEW_STARTED>>>
  resume: validation_passed → prepare_active_item, inspect_roadmap, inspect_method
  show:   validation_passed → (none)
--- 5. debt reviewed
  answer: <<<ARIAD:DEBT_REVIEW_CHECKPOINT>>> <<<ARIAD:DONE_CLOSURE_CONFIRMATION>>>
  resume: review_complete → prepare_active_item, inspect_roadmap, inspect_method
  show:   review_complete → (none)
--- 6. coherent
  answer: <<<ARIAD:COHERENCE_CHECKPOINT>>>
  resume: coherence_complete → prepare_active_item, inspect_roadmap, inspect_method
  show:   coherence_complete → (none)
--- 7. done
  answer: <<<ARIAD:DONE_CHECKPOINT>>> <<<ARIAD:PROJECT_POSITION>>>
  resume: done_complete → prepare_active_item, inspect_roadmap, inspect_method
  show:   done_complete → (none)
--- 8. Prepare, run on the done story
  answer: <<<ARIAD:PREPARE_FIELD_READING>>>
  show:   prepare
--- 9. the Delivery Story pulled: Pull runs Prepare and Expand
  answer: <<<ARIAD:DELIVERY_STORY_READY>>> <<<ARIAD:ARTIFACTS_MATERIALIZED>>>
  resume: expand → answer_pending_confirmation, inspect_method
  show:   expand → (none)
--- 10. Delivery Story flow chosen
  answer: <<<ARIAD:DELIVERY_STORY_SCOPE_CONFIRMATION>>>
  resume: navigator_flow_unit_selected → answer_pending_confirmation, inspect_method
  show:   navigator_flow_unit_selected → (none)
--- 11. Delivery Story planned
  answer: <<<ARIAD:DELIVERY_STORY_PLAN_CHECKPOINT>>> <<<ARIAD:ARTIFACTS_MATERIALIZED>>>
  resume: delivery_story_plan → answer_pending_confirmation, inspect_method
  show:   delivery_story_plan → (none)
--- 12. Delivery Story Plan approved
  answer: <<<ARIAD:DELIVERY_STORY_PLAN_CHECKPOINT>>> <<<ARIAD:ARTIFACTS_MATERIALIZED>>> <<<ARIAD:IMPLEMENTATION_STARTED>>>
  resume: delivery_story_plan_approved → prepare_active_item, inspect_roadmap, inspect_method
  show:   delivery_story_plan_approved → (none)
--- 13. Delivery Story validated
  answer: <<<ARIAD:DELIVERY_STORY_CLOSURE_CHECKPOINT>>> <<<ARIAD:ARTIFACTS_MATERIALIZED>>> <<<ARIAD:DEBT_REVIEW_STARTED>>>
  resume: delivery_story_validation_complete → prepare_active_item, inspect_roadmap, inspect_method
  show:   delivery_story_validation_complete → (none)
--- 14. Delivery Story debt reviewed
  answer: <<<ARIAD:DELIVERY_STORY_CLOSURE_CHECKPOINT>>> <<<ARIAD:ARTIFACTS_MATERIALIZED>>> <<<ARIAD:DONE_CLOSURE_CONFIRMATION>>>
  resume: delivery_story_review_complete → prepare_active_item, inspect_roadmap, inspect_method
  show:   delivery_story_review_complete → (none)
--- 15. Delivery Story done
  answer: <<<ARIAD:DELIVERY_STORY_CLOSURE_CHECKPOINT>>> <<<ARIAD:ARTIFACTS_MATERIALIZED>>> <<<ARIAD:PROJECT_POSITION>>>
  resume: delivery_story_done_complete → prepare_active_item, inspect_roadmap, inspect_method
  show:   delivery_story_done_complete → (none)
--- 16. a Delivery Story whose Expand is blocked
  answer: <<<ARIAD:EXPAND_BLOCKED>>>
  resume: prepare → prepare_active_item, inspect_roadmap, inspect_method
  show:   prepare → (none)
--- 17. the cadence on every orienting surface; journey k has no item pulled
  stepwise: resume (none) [(none)] | show (none) [(none)] | orientation (none) [(none)]
  checkpoint: resume (none) [(none)] | show (none) [(none)] | orientation (none) [(none)]
  accelerated: resume (none) [(none)] | show (none) [(none)] | orientation (none) [(none)]
  autonomous: resume (none) [(none)] | show (none) [(none)] | orientation (none) [(none)]
```

Every resting position but those waiting on a confirmation reads `prepare_active_item`
(steps 1, 3 to 7, 12 to 16). Step 8 is the rewind: `prepare-item` ran on the Done story
and left it at `prepare`. Step 0 is the Pull command `build show` gives a journey whose
Pull would refuse. Step 17 is CR115: no orienting surface prints the cadence.

## Outcome

Pending.
