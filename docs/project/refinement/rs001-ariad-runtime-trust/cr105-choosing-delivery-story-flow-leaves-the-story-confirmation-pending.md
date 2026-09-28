[< RS001](index.md) · [Canonical status](../index.md#change-requests)

# CR105 — Choosing Delivery Story flow leaves the story-by-story confirmation pending

## Problem

### As captured (2026-09-26)

When `pull-item` expands a Delivery Story, Expand records the story-by-story stop on
the cursor: `active_checkpoint=next_story_confirmation` and
`pending_confirmation=navigator_story_confirmation` (`ts/src/builder/expand.ts`).
`set-flow-unit --unit delivery_story` then changes only the flow unit and
`last_delivery_event`, and carries both fields forward untouched
(`setNavigatorFlowUnit`, `ts/src/builder/flowUnit.ts`). Delivery Story flow never
consumes that confirmation; `plan-delivery-story` overwrites it.

Until the Delivery Story is planned, every surface that reads the cursor reports a stop
the chosen flow will never ask for. `■ BUILDER RESUME` shows the story-by-story
checkpoint as pending and offers `answer_pending_confirmation` as the next action.
Planning the Delivery Story is not among its allowed actions.

CR001 makes this state routine. The Builder skill now ends the agent's turn at the
Delivery Story scope confirmation, so every Delivery Story flow crosses a turn boundary
in exactly this state.

### As characterized (2026-09-28)

Reproduced on `1de9438f` in a scratch home with the
[validation route](#validation-route), in bash and zsh alike. Its output is under
[Evidence](#the-route-before-the-change). This document carries the plan for CR105 and
[CR090](cr090-debt-review-surface-mixes-portuguese-into-english.md), one delivery with
one validation route, as the floor decision paired them.

**The defect reproduces as captured.** After Expand, the cursor holds the story-by-story
stop. `set-flow-unit --unit delivery_story` prints `DELIVERY_STORY_SCOPE_CONFIRMATION`
and leaves that stop in place, so `build show` and `■ BUILDER RESUME` report
`navigator_story_confirmation` pending while the scope question is the one just asked.

**The reverse switch holds only by accident, and breaks after the Plan.** Right after
Expand, `set-flow-unit --unit story_by_story` prints `NEXT_STORY_CONFIRMATION`, and the
cursor agrees only because nothing ever cleared Expand's stop. After the Delivery Story
Plan it breaks:

- `set-flow-unit --unit story_by_story` prints "Is this the right next story?" while the
  cursor still holds `navigator_delivery_story_plan_approval`;
- `approve-delivery-story-plan` then succeeds, because it does not check the flow unit,
  and starts Delivery Story implementation under story-by-story flow;
- `validate-delivery-story` then refuses with
  `Error: Delivery Story closure requires navigator_flow_unit=delivery_story`, so the
  Delivery Story cannot close.

**The same command asks questions about nothing.** With no item pulled, choosing Delivery
Story flow prints a scope confirmation for no Delivery Story. With a child story active,
it prints a Delivery Story scope confirmation about that user story, and
`plan-delivery-story` then refuses: `Delivery Story Plan requires an active Delivery
Story`.

**Where the flow unit is chosen.** `pull-item` runs Prepare and Expand, so a real
Delivery Story reaches the choice with Expand's stop pending. The recorded lifecycle
sequences choose it on a Delivery Story seeded at `prepare`, with nothing pending. Both
are the same decision point, before the Delivery Story's Plan.

**CR090 reproduces too, and its audit found more.** `DEBT_REVIEW_STARTED` still reads
"record this as sem ação necessária". The audit CR090 asked for found the Ariad method's
nine lifecycle glosses in Portuguese, printed by `build inspect-method ariad`:
`Pull escolhe o foco`, `Review encara a dívida`, and so on. The other Portuguese in
`ts/src/builder/` is input: `QUERY_SECTIONS` in `transition.ts` names sections in
project documents that may be Portuguese.

## Expected Behavior

After `set-flow-unit --unit delivery_story`, the cursor and every surface that reads it
describe what Delivery Story flow is actually waiting for. No story-by-story
confirmation remains pending that the chosen flow will never consume, and the resume
surface's allowed next actions include the flow's real next step.

## Impact

The resume surface is what a new session reads first. At this point it contradicts the
scope confirmation rendered one turn earlier. It steers the Navigator and the agent
toward a next-story question Delivery Story flow never asks, and it omits the Plan that
the scope confirmation promised.

## Plan Or Decision

Pending. Captured while working the Ariad trust floor on CR001, which captures what it
finds instead of fixing it
([decision](../../decisions.md#the-cv22-release-is-gated-on-an-ariad-trust-floor-worked-before-us3));
this CR is not on the floor. Decide first whether choosing Delivery Story flow clears
the story-level confirmation or replaces it with a stop Delivery Story flow owns.
CR001 declined runtime enforcement of the scope stop, so the second would be a new
decision, not a follow-through. The reverse switch, from Delivery Story flow back to
story by story, was not exercised and should be checked while planning.

**2026-09-27: added to the Ariad trust floor** by the Navigator's decision after the Workbench inspection that followed the Ariad trust floor ([amendment](../../decisions.md#the-cv22-release-is-gated-on-an-ariad-trust-floor-worked-before-us3)). The statement above that this CR is not on the floor no longer holds. CR090 rides along with it.

**Planned and assigned 2026-09-28, one delivery with CR090.** Quality assurance drafted
the plan, and the technical panel reviewed it the same day
([record below](#panel-review-2026-09-28)). The panel's changes are folded in. Navigator
decisions, 2026-09-28: [R2](#decision-r-what-choosing-delivery-story-flow-records),
[S1](#decision-s-choosing-outside-the-decision-point),
[A1](#decision-a-the-resumes-next-actions), and
[C2](#decision-c-the-ariad-methods-lifecycle-glosses). Plan approved, with Driver
`@viniciusteles` and Delivery `mirror-ts-core` for both.

### Objective

Choosing a flow unit records the stop its own surface asks, so the cursor and every
surface that reads it agree with the question just asked. The flow unit is chosen at the
Delivery Story's flow decision, after Prepare or Expand and before its Plan. Anywhere
else, choosing refuses and changes nothing. Ariad's output reads in one language.

### Design

1. **One definition of the flow decision.** `flowUnit.ts` states it once: the active
   item is a Delivery Story, its Plan is not recorded, and nothing is pending but a flow
   stop, or nothing at all. Whether the Plan is recorded is answered by one function
   beside `replaceStatus`, the writer of the aggregate status it reads (panel:
   engineer).
2. **Choosing records the stop its surface asks
   ([decision R](#decision-r-what-choosing-delivery-story-flow-records)).**
   `delivery_story` records `delivery_story_scope_confirmation` /
   `navigator_scope_confirmation`, the question `DELIVERY_STORY_SCOPE_CONFIRMATION` asks.
   `story_by_story` records `next_story_confirmation` / `navigator_story_confirmation`,
   the question `NEXT_STORY_CONFIRMATION` asks and Expand records. `plan-delivery-story`
   replaces the scope stop, as it replaced the story stop. The runtime does not enforce
   the wait: CR001's decision stands.
3. **Refused outside the decision
   ([decision S](#decision-s-choosing-outside-the-decision-point)).** One
   `Error: no flow unit was chosen: …` line, exit 1, and the cursor unchanged, for no
   item pulled, a story as the active item (naming its Delivery Story), a Delivery Story
   Plan already recorded, or a pending confirmation that is not a flow stop.
   `set-flow-unit` without `--unit` still inspects, anywhere.
4. **The resume surface
   ([decision A](#decision-a-the-resumes-next-actions)).** Its next actions keep their
   vocabulary. With the scope stop pending, `answer_pending_confirmation` points at the
   scope question, and the pending row names it.
5. **The skill.** One sentence in `mm-build`'s Delivery Story Navigator Flow: a Builder
   resume that shows `navigator_scope_confirmation` is this same question, still open,
   and the runtime records it without enforcing it (panel: prompt-engineer). Ask it
   again, or render it again with `set-flow-unit --unit delivery_story` (panel:
   ai-engineer), and plan only on the Navigator's answer. The Claude Code copies are
   regenerated from the Pi copy (CR102).
6. **CR090.** `sem ação necessária` becomes `no action needed`, the runtime's own words
   for `no_action`, and the nine lifecycle glosses are translated
   ([decision C](#decision-c-the-ariad-methods-lifecycle-glosses)).

### Decision R: what choosing Delivery Story flow records

- **R1. Clear Expand's stop.** The resume then says nothing is pending and offers
  Prepare, which is done. The scope question just asked is recorded nowhere, so a new
  session cannot know it is open.
- **R2. Replace it with the stop Delivery Story flow owns (chosen).** The scope
  question, recorded and not enforced. CR001 declined an enforced stop, a pending state
  plus an acknowledgement. This has no acknowledgement command: `plan-delivery-story`
  consumes it by replacing it.

### Decision S: choosing outside the decision point

- **S1. Refuse, and change nothing (chosen).** It removes the stranding the reverse
  switch showed, and the questions the command asked about no Delivery Story.
- **S2. Keep today's behavior** there, and capture the stranding as a new CR.

### Decision A: the resume's next actions

- **A1. Keep the vocabulary (chosen).** `answer_pending_confirmation` now points at the
  scope question, which is what Delivery Story flow waits for at that moment. The Plan
  follows the answer.
- **A2. Add `plan_delivery_story`** while the scope stop is pending. It invites planning
  before the answer, the AF-004 shape CR001 closed.

### Decision C: the Ariad method's lifecycle glosses

- **C1. Fix the Debt Review sentence only.**
- **C2. Translate the nine glosses too (chosen).** Ariad surfaces are transported
  verbatim, and CR090's rule is that output is English. Pull chooses the focus, Prepare
  reads the terrain, Expand unfolds the granularity, Plan firms the contract, Implement
  changes the system, Validation proves behavior, Review faces the debt, Coherence
  integrates the traces, and Done records and closes.

### Affected files

- `ts/src/builder/flowUnit.ts`: the flow decision, the recorded stop, and the refusal.
- `ts/src/builder/deliveryStoryPlan.ts`: the one function that answers whether a
  Delivery Story Plan is recorded.
- `ts/src/builder/commands.ts`: the Debt Review sentence.
- `ts/src/builder/ariadMethod.ts`: the nine glosses.
- `.pi/skills/mm-build/SKILL.md`, and both Claude Code copies regenerated.
- Tests:
  - both shapes of the decision point, a prepared Delivery Story and an expanded one,
    in both directions, through the real commands (panel: quality-assurance);
  - `■ BUILDER RESUME` at the scope stop, not only the cursor;
  - `plan-delivery-story` consuming the scope stop;
  - each refusal, with the cursor unchanged;
  - the Debt Review sentence and the glosses.
- Goldens, each edit by a script with asserted counts and a README row:
  - `builder-lifecycle`: the cursors the two flow-unit sequences record after choosing;
  - `builder-command`: the three `DEBT_REVIEW_STARTED` renders, rewrapped, and the
    `inspect-method` render;
  - `builder-method`: the method definition's glosses and the inspection surface.

### Plateaus

One reason per golden diff.

1. **Choosing records its stop.** Red first: route step 2 as a test, over an expanded
   and a prepared Delivery Story. Then the flow decision and the recorded stop, the
   skill sentence, and the `builder-lifecycle` edit.
2. **Refused outside the decision.** Red first: route step 5, and the no-item and
   child-story cases. No golden should move.
3. **One language (CR090).** Red first: the Debt Review sentence and the glosses. Then
   the `builder-command` and `builder-method` edits.
4. **Close.** The route's output after the change, Navigator validation, the handoff
   review, Debt Review, and Done.

### Acceptance criteria

1. After `pull-item` expands a Delivery Story and `set-flow-unit --unit delivery_story`
   prints `DELIVERY_STORY_SCOPE_CONFIRMATION`, the cursor holds
   `delivery_story_scope_confirmation` / `navigator_scope_confirmation`. `build show` and
   `■ BUILDER RESUME` say so, and no story-by-story confirmation remains.
2. At the decision point, `set-flow-unit --unit story_by_story` records
   `next_story_confirmation` / `navigator_story_confirmation`. Switching back and forth
   leaves the cursor holding the question of the last surface printed.
3. On a Delivery Story seeded at `prepare`, as the recorded sequences seed it, each
   choice records its own stop too.
4. `plan-delivery-story` after the scope stop records the Plan as it does today. It
   still plans without the stop: the wait is not enforced.
5. `set-flow-unit` refuses with one `Error:` line, exit 1, and the cursor and project
   files unchanged, when no item is pulled, when a story is the active item, when the
   Delivery Story Plan is recorded or approved, and when a confirmation other than a
   flow stop is pending. Inspection without `--unit` still answers.
6. `DEBT_REVIEW_STARTED` reads "record this as no action needed", and
   `inspect-method ariad` lists the nine glosses in English.
7. `npm test`, `npm run typecheck`, `npm run lint`, the repository checks, the smokes,
   and CI are green, and every golden edit has its README row.

### Validation route

CLI only, in a scratch home, with no Pi session (CR106). Its output before the change is
recorded under [Evidence](#the-route-before-the-change). Run it from the repository root
as a script, with `bash <file>`, so that no interactive alias applies. It deletes its
temporary directory:

```bash
V=$(mktemp -d) && mkdir -p "$V/home" && export MIRROR_HOME="$V/home" MIRROR_USER= NODE_OPTIONS=--no-warnings
cr105() { node ts/src/frontDoor/cli.ts "$@"; }
R="$V/p/docs/project/roadmap" && mkdir -p "$R/cv1/ds1" && printf '# Roadmap\n' > "$R/index.md"
printf '# CV1 — Checkout\n\n**Status:** 🟢 Active\n' > "$R/cv1/index.md"
printf '# CV1.DS1 — Checkout address\n\n**Status:** 🟡 Planned\n**Type:** Delivery Story\n\n## Candidate Stories\n\n| Code | Story | Type | Status |\n|------|-------|------|--------|\n| CV1.DS1.US1 | Enter an address | User Story | 🟡 Planned |\n| CV1.DS1.TS1 | Validate the address | Technical Story | 🟡 Planned |\n' > "$R/cv1/ds1/index.md"
git -C "$V/p" init -q && printf '# j\n' | cr105 identity set journey j > /dev/null && cr105 journey set-path j "$V/p" > /dev/null 2>&1
cr105 build adopt --journey j --method ariad > /dev/null && cr105 build sync-cursor --journey j --method ariad > /dev/null
cr105 build set-cadence --journey j --method ariad --profile checkpoint > /dev/null
cursor() { cr105 build show --journey j --method ariad | awk -F'│' '/│ (last event|pending confirmation|active checkpoint) /{l=$2; getline; v=$2; gsub(/^ +| +$/, "", l); gsub(/^ +| +$/, "", v); printf "  %s: %s\n", l, v}'; }
resume() { cr105 build load j 2>/dev/null | awk -F'│' '/│ allowed next actions/{on=1; next} on&&/│ - /{v=$2; gsub(/^ +| +$/, "", v); a=a " " v; next} on{on=0} END{print "  allowed next actions:" a}'; }
answer() { grep -o '<<<ARIAD:[A-Z_]*>>>\|^Error: .*' | paste -sd ' ' - | sed 's/^/  answer: /'; }
echo '--- step 1: pull the Delivery Story; Expand stops for the next story'
cr105 build pull-item --journey j --method ariad --item-code CV1.DS1 --item-level delivery_story --item-title 'Checkout address' --why-now now 2>&1 | answer
cursor; resume
echo '--- step 2: choose Delivery Story flow; the scope question is asked'
cr105 build set-flow-unit --journey j --method ariad --unit delivery_story 2>&1 | answer
cursor; resume
echo '--- step 3: switch back to story by story'
cr105 build set-flow-unit --journey j --method ariad --unit story_by_story 2>&1 | answer
cursor; resume
echo '--- step 4: Delivery Story flow again, then its Plan'
cr105 build set-flow-unit --journey j --method ariad --unit delivery_story > /dev/null 2>&1
cr105 build plan-delivery-story --journey j --method ariad --objective 'Checkout takes an address' --child CV1.DS1.US1 --child CV1.DS1.TS1 2>&1 | answer
cursor
echo '--- step 5: switch to story by story with the Delivery Story Plan awaiting approval'
cr105 build set-flow-unit --journey j --method ariad --unit story_by_story 2>&1 | answer
cursor
echo '--- step 6: a story at its Debt Review (CR090)'
cr105 build pull-item --journey j --method ariad --item-code CV1.DS1.US1 --item-level user_story --item-title 'Enter an address' --why-now now > /dev/null 2>&1
cr105 build plan-item --journey j --method ariad > /dev/null 2>&1 && cr105 build approve-plan --journey j --method ariad > /dev/null 2>&1
cr105 build validate-item --journey j --method ariad --implementation-complete --check 'npm test' --checks-status passed \
  --e2e-decision not_required --e2e-evidence 'unit covered' --navigator-route 'run it' --navigator-accepted \
  --expected-observation 'it works' --pass-condition 'it works' --fail-condition 'it breaks' 2>&1 | sed -n '/Navigator check/,/╰/p' | sed '$d'
echo '--- step 7: the method Ariad describes (CR090 audit)'
cr105 build inspect-method ariad 2>&1 | sed -n '/^lifecycle$/,/^$/p' | sed '$d'
unset MIRROR_HOME MIRROR_USER; rm -rf "$V"
```

Pass:

- Step 1: as before, Expand's stop, `navigator_story_confirmation`.
- Step 2: `DELIVERY_STORY_SCOPE_CONFIRMATION`, then `navigator_scope_confirmation` and
  `delivery_story_scope_confirmation`, and the next actions `answer_pending_confirmation`
  and `inspect_method`.
- Step 3: `NEXT_STORY_CONFIRMATION`, then `navigator_story_confirmation` and
  `next_story_confirmation`.
- Step 4: the Plan checkpoint, `navigator_delivery_story_plan_approval`, and
  `after_delivery_story_plan`.
- Step 5: one `Error: no flow unit was chosen: …` line, and the cursor exactly as step 4
  left it.
- Step 6: "record this as no action needed and continue toward closure."
- Step 7: nine glosses in English.

Fail: a pending confirmation that contradicts the surface just printed, a flow unit
accepted in step 5, or Portuguese in step 6 or 7.

### Conscious exclusions

- Enforcing the scope stop. `plan-delivery-story` still plans without it, as CR001
  decided.
- Renaming Expand's stop. `DELIVERY_STORY_READY` presents it as a choice between
  confirming the story and choosing Delivery Story flow, and it keeps its name.
- A next action for each kind of confirmation on the resume surface (A2).
- A route to choose the flow again after a Plan. Revisit when a Navigator first asks
  for one.
- Cursors already stranded by the old behavior. The manual route is `sync-cursor`, then
  pulling the Delivery Story again.
- The Portuguese trigger phrases in `mm-build`, which are what a Navigator types, and
  `QUERY_SECTIONS`, which reads project documents.
- The Soul harvest's Portuguese journal template, outside Ariad. The Navigator has not
  decided whether it is a defect.

### Authority boundaries

Plan approval moves CR105 and CR090 to `planned`. A human Driver and a Delivery
reference are required before `in_progress`. `validated` requires the Navigator to walk
the route above and accept it. Each plateau is committed on the Delivery branch and
pushed when green, with GitHub Actions verified after every push. Merge, publication,
and release are not authorized.

Navigator decisions, 2026-09-28: Driver `@viniciusteles`, Delivery `mirror-ts-core`.

### Panel review (2026-09-28)

This is the plan review before implementation, per the CV22 collaboration strategy. The
quality-assurance draft was reviewed by the engineer, database-architect,
devops-engineer, security-engineer, ai-engineer, prompt-engineer, experience-designer,
and product-designer lenses. Only dissent was recorded.

Synthesis: the plan is small and aimed at the cause. One rule says when a flow unit can
be chosen, and choosing records exactly what its surface asks, which also removes the
stranding the reverse switch showed. The risk sits in the two shapes of the decision
point and in a stop that is recorded being read as enforced.

| Lens | Dissent | Resolution |
|---|---|---|
| quality-assurance | The recorded sequences choose the flow unit on a prepared Delivery Story, and a real Pull always expands. A test of one shape proves nothing about the other, and a cursor test proves nothing about the resume a new session reads | Both shapes, in both directions, through the real commands, and the resume render at the scope stop ([Affected files](#affected-files)) |
| engineer | Whether a Delivery Story Plan is recorded is known by the aggregate status's writer. Testing a `plan:` string in `flowUnit.ts` would be a second copy of that knowledge | One function beside `replaceStatus` (design 1) |
| ai-engineer | A new session at the scope stop has no surface to re-read: `build show` names the stop but not the question, so an agent would paraphrase the scope from memory | The skill says to render it again with `set-flow-unit --unit delivery_story`, which is repeatable at the decision point (design 5) |
| prompt-engineer | The skill says "the runtime does not enforce the wait". With the stop recorded, an agent may infer that `plan-delivery-story` now refuses while it is pending | The sentence says the stop is recorded and not enforced (design 5) |
| product-designer | S1 removes choosing the flow unit after a Plan, with no route back | Accepted: a stranded Delivery Story is worse than a refusal. A route to plan again waits for a Navigator who needs it ([exclusions](#conscious-exclusions)) |

The database-architect, devops-engineer, security-engineer, and experience-designer
lenses raised no objection. The cursor columns are free text, so the new stop needs no
migration, and cursors already stored are not rewritten.

## Evidence

Reproduced 2026-09-26 on `mirror-ts-core` at `724938a1` with the real front door, an
isolated `MIRROR_HOME`, a scratch Git project under `/tmp`, and no `.env` loaded,
during [CR001](cr001-scope-confirmation-checkpoint.md)'s reproduction:

- After `pull-item --item-level delivery_story`, the cursor held
  `next_story_confirmation` / `navigator_story_confirmation` / `expand`.
- After `set-flow-unit --unit delivery_story`, it held `next_story_confirmation` /
  `navigator_story_confirmation` / `navigator_flow_unit_selected`, with flow unit
  `delivery_story`.
- `build load` at that point rendered `■ BUILDER RESUME` with
  `active checkpoint: next_story_confirmation`,
  `pending confirmation: navigator_story_confirmation`, and allowed next actions
  `answer_pending_confirmation` and `inspect_method`.

### Characterization (2026-09-28)

Every finding under [As characterized](#as-characterized-2026-09-28) was produced in
scratch homes with the real front door on `1de9438f`, with no `.env` and no Pi session:

- The defect, the reverse switch, and CR090's two surfaces: the
  [validation route](#validation-route), whose output follows.
- The stranding: the same project, with `approve-delivery-story-plan` and then
  `validate-delivery-story` run after step 5's switch. The first printed
  `IMPLEMENTATION_STARTED`, and the second refused on the flow unit.
- The questions about nothing: `set-flow-unit --unit delivery_story` with no item
  pulled, and again with `CV1.DS1.US1` pulled after the Delivery Story's Expand.
- The two shapes of the decision point: the `delivery_story_flow_happy_path` and
  `navigator_flow_unit_faces` sequences in `builder-lifecycle.golden.json`, which seed
  the Delivery Story at `prepare`, against the route's `pull-item`.
- The audit: a search of `ts/src` for Portuguese in string literals, sorted into output
  and input.

### The route before the change

The [validation route](#validation-route), run on `1de9438f`, in bash and zsh alike:

```text
--- step 1: pull the Delivery Story; Expand stops for the next story
  answer: <<<ARIAD:DELIVERY_STORY_READY>>> <<<ARIAD:ARTIFACTS_MATERIALIZED>>>
  last event: expand
  pending confirmation: navigator_story_confirmation
  active checkpoint: next_story_confirmation
  allowed next actions: - answer_pending_confirmation - inspect_method
--- step 2: choose Delivery Story flow; the scope question is asked
  answer: <<<ARIAD:DELIVERY_STORY_SCOPE_CONFIRMATION>>>
  last event: navigator_flow_unit_selected
  pending confirmation: navigator_story_confirmation
  active checkpoint: next_story_confirmation
  allowed next actions: - answer_pending_confirmation - inspect_method
--- step 3: switch back to story by story
  answer: <<<ARIAD:NEXT_STORY_CONFIRMATION>>>
  last event: navigator_flow_unit_selected
  pending confirmation: navigator_story_confirmation
  active checkpoint: next_story_confirmation
  allowed next actions: - answer_pending_confirmation - inspect_method
--- step 4: Delivery Story flow again, then its Plan
  answer: <<<ARIAD:DELIVERY_STORY_PLAN_CHECKPOINT>>> <<<ARIAD:ARTIFACTS_MATERIALIZED>>>
  last event: delivery_story_plan
  pending confirmation: navigator_delivery_story_plan_approval
  active checkpoint: after_delivery_story_plan
--- step 5: switch to story by story with the Delivery Story Plan awaiting approval
  answer: <<<ARIAD:NEXT_STORY_CONFIRMATION>>>
  last event: navigator_flow_unit_selected
  pending confirmation: navigator_delivery_story_plan_approval
  active checkpoint: after_delivery_story_plan
--- step 6: a story at its Debt Review (CR090)
│ Navigator check                                        │
│ If there is no relevant debt to address now, I can     │
│ record this as sem ação necessária and continue toward │
│ closure.                                               │
--- step 7: the method Ariad describes (CR090 audit)
lifecycle
- Pull escolhe o foco
- Prepare lê o terreno
- Expand desdobra granularidade
- Plan firma o contrato
- Implement muda o sistema
- Validation prova comportamento
- Review encara a dívida
- Coherence integra os rastros
- Done registra e fecha
```

Steps 2, 5, 6, and 7 fail as characterized. Step 3 passes only because nothing cleared
Expand's stop.

### Plateau 1 handoff (2026-09-28)

Now true: choosing a flow unit records the question its surface asks, at a Delivery
Story's flow decision. `FLOW_STOPS` in `ts/src/builder/flowUnit.ts` names each flow
unit's stop, and Expand takes its own from it. `atFlowDecision` states the decision
point once: the active item is a Delivery Story, its Plan is not recorded, and nothing
is pending but a flow stop. Whether the Plan is recorded is answered by
`hasDeliveryStoryPlan`, which moved with `replaceStatus`, its writer, into
`ts/src/builder/aggregateStatus.ts`. That module keeps `flowUnit.ts` free of an import
cycle with `deliveryStoryPlan.ts`. Outside the decision point, choosing still leaves the
stops as they were, which is plateau 2's to refuse. The `mm-build` skill says the scope
stop is recorded and not enforced, and how to ask it again at a resume. The Claude Code
copies were regenerated.

Evidence:

- Red first, through the real commands over a scratch project:
  - after Expand, choosing Delivery Story flow left the story stop;
  - on a Delivery Story seeded at `prepare`, choosing left no stop;
  - the Builder resume at that moment named `navigator_story_confirmation`.
- Green now:
  - both shapes record each flow unit's stop, in both directions;
  - the resume names only the scope question, with `answer_pending_confirmation` and
    `inspect_method` as its next actions;
  - `plan-delivery-story` replaces the scope stop, and plans without it, since the
    stop is recorded and not enforced.
- One golden edit, by script with an asserted count and a README row:
  `builder-lifecycle`, five cursors in the two flow-unit sequences.
- Route steps 2 and 3 now print their pass conditions.
- The full suite passes (2,822 tests), along with typecheck, lint, the repository
  checks, and the Builder lifecycle smoke. CI was green on the plan commit.

Remaining: the refusal outside the decision point, and CR090. Next: plateau 2.

### Plateau 2 handoff (2026-09-28)

Now true: a flow unit is chosen only at the Delivery Story's flow decision. Anywhere
else, `set-flow-unit --unit` refuses with one `Error: no flow unit was chosen: …` line,
exits 1, and changes neither the cursor nor the project. `flowDecisionRefusal` in
`ts/src/builder/flowUnit.ts` replaces plateau 1's predicate. It gives four reasons, in
this order:

1. no item pulled;
2. a story as the active item, naming its Delivery Story;
3. the Delivery Story Plan already recorded;
4. a confirmation other than a flow stop pending.

Inspection without `--unit` still answers anywhere. The `mm-build` skill says where the
choice is made, and tells the agent to relay a refusal rather than reset or re-pull to
force it.

Evidence:

- Red first: each of the four cases accepted the choice. After the Plan, the stranding
  sequence from the characterization ran to completion.
- Green now: each refuses with its reason, the cursor and project files byte-identical.
  The refusal holds in both directions after the Plan, and after its approval too.
  Inspection answers after the Plan.
- No golden moved: every recorded choice is made at the decision point.
- Route step 5 now prints the refusal, and the cursor stays as step 4 left it.
- The full suite passes (2,827 tests), along with typecheck, lint, the repository
  checks, and the Builder lifecycle smoke. CI was green on plateau 1.

Remaining: CR090. Next: plateau 3.

### Plateau 3 handoff (2026-09-28)

Now true: Ariad's output reads in one language (CR090). `DEBT_REVIEW_STARTED` offers to
"record this as no action needed", the runtime's own words for `no_action`, where it
said "sem ação necessária". `build inspect-method ariad` lists the nine lifecycle
glosses in English, from the method definition in `ts/src/builder/ariadMethod.ts`
(decision C2). A guard in `ts/test/builder/oneLanguage.test.ts` fails on a Portuguese
letter in any line of Builder source that is not a comment, unless that line names a
listed input. The one listed input is `QUERY_SECTIONS`, which reads section names from
project documents.

Evidence:

- Red first:
  - the Debt Review surface, reached through the real commands over a scratch
    project, still read "sem ação necessária";
  - `inspect-method` listed the Portuguese glosses;
  - the guard found both.
- Golden edits, by script with asserted counts and a README row:
  - `builder-command`: the three Debt Review cards and the `inspect-method` render;
  - `builder-method`: the nine meanings in the method definition, and the one
    inspection surface.
  The script re-implemented the card's wrap and padding, and required the old
  paragraph's wrap to match every recorded card before it replaced any.
- Route steps 6 and 7 now print their pass conditions.
- The full suite passes (2,830 tests), along with typecheck, lint, the repository
  checks, and the Builder lifecycle smoke. CI was green on plateau 2.

Remaining: plateau 4, meaning the route's output recorded, Navigator validation, the
handoff review, Debt Review, and Done.

### The route after the change (2026-09-28)

The same route at `be66a102`, with CI green on it, in bash and zsh alike. Every pass
condition holds, and no fail marker appears:

```text
--- step 1: pull the Delivery Story; Expand stops for the next story
  answer: <<<ARIAD:DELIVERY_STORY_READY>>> <<<ARIAD:ARTIFACTS_MATERIALIZED>>>
  last event: expand
  pending confirmation: navigator_story_confirmation
  active checkpoint: next_story_confirmation
  allowed next actions: - answer_pending_confirmation - inspect_method
--- step 2: choose Delivery Story flow; the scope question is asked
  answer: <<<ARIAD:DELIVERY_STORY_SCOPE_CONFIRMATION>>>
  last event: navigator_flow_unit_selected
  pending confirmation: navigator_scope_confirmation
  active checkpoint: delivery_story_scope_confirmation
  allowed next actions: - answer_pending_confirmation - inspect_method
--- step 3: switch back to story by story
  answer: <<<ARIAD:NEXT_STORY_CONFIRMATION>>>
  last event: navigator_flow_unit_selected
  pending confirmation: navigator_story_confirmation
  active checkpoint: next_story_confirmation
  allowed next actions: - answer_pending_confirmation - inspect_method
--- step 4: Delivery Story flow again, then its Plan
  answer: <<<ARIAD:DELIVERY_STORY_PLAN_CHECKPOINT>>> <<<ARIAD:ARTIFACTS_MATERIALIZED>>>
  last event: delivery_story_plan
  pending confirmation: navigator_delivery_story_plan_approval
  active checkpoint: after_delivery_story_plan
--- step 5: switch to story by story with the Delivery Story Plan awaiting approval
  answer: Error: no flow unit was chosen: CV1.DS1's Delivery Story Plan is already recorded, and the flow unit is chosen before it.
  last event: delivery_story_plan
  pending confirmation: navigator_delivery_story_plan_approval
  active checkpoint: after_delivery_story_plan
--- step 6: a story at its Debt Review (CR090)
│ Navigator check                                        │
│ If there is no relevant debt to address now, I can     │
│ record this as no action needed and continue toward    │
│ closure.                                               │
--- step 7: the method Ariad describes (CR090 audit)
lifecycle
- Pull chooses the focus
- Prepare reads the terrain
- Expand unfolds the granularity
- Plan firms the contract
- Implement changes the system
- Validation proves behavior
- Review faces the debt
- Coherence integrates the traces
- Done records and closes
```

### Navigator validation (2026-09-28)

The Navigator walked the [validation route](#validation-route) and accepted it, for
CR105 and CR090.

- The route was extracted from this document and run as `bash /tmp/cr105-route.sh`. It
  printed the [recorded output](#the-route-after-the-change-2026-09-28) line for line:
  1. Expand's stop, `navigator_story_confirmation`;
  2. `DELIVERY_STORY_SCOPE_CONFIRMATION`, then `navigator_scope_confirmation` and
     `delivery_story_scope_confirmation`, with `answer_pending_confirmation` and
     `inspect_method` as the next actions;
  3. `NEXT_STORY_CONFIRMATION`, then `navigator_story_confirmation` and
     `next_story_confirmation`;
  4. the Plan checkpoint, with `navigator_delivery_story_plan_approval` pending;
  5. `Error: no flow unit was chosen: CV1.DS1's Delivery Story Plan is already
     recorded, …`, and the cursor exactly as step 4 left it;
  6. "record this as no action needed and continue toward closure.";
  7. the nine lifecycle glosses in English.

CI was green on each plateau's last push: plateau 1 (`1f9e1dfa`), plateau 2
(`9ef16c41`), and plateau 3 (`be66a102`), Tests and Docs.

### Handoff review (2026-09-28)

This review came after validation, per the collaboration strategy. The baseline panel
(engineer, quality-assurance, database-architect, devops-engineer, security-engineer)
and the lenses that reviewed the plan (ai-engineer, prompt-engineer,
experience-designer, product-designer) reviewed the delivered code, tests, safety
posture, operational cost, and resumability. The one finding was checked against the
code before it was written down, by a search for every reader of the aggregate status.

Synthesis: the delivery does what the plan said. The source grew by 130 lines and lost
35 across seven files, the tests grew by 443 in two new files, and three goldens were
edited by script. The refusal sits
where it belongs, before any write, and the stranding the characterization found
cannot happen any more. The weak point is a sentence, not code: the new module claims
more than it holds.

| # | Lens | Finding | Class | Recommendation |
|---|---|---|---|---|
| 1 | engineer | `aggregateStatus.ts` says the aggregate status's entry format "has one home" there. It does not: `implementationGuard.ts` and `deliveryStoryPlan.ts` still test `plan:approved` by hand, and `deliveryStoryClosure.ts` tests its expected entries and their prefixes | Non-blocking debt, introduced here | Pay now: the comment says what the module holds, the writer and the flow unit's reader, and no more |

Checked and dropped: a refusal that names a `maintenance` item would read "is a
maintenance". It cannot be reached, because `pull-item` accepts only the Delivery Story,
user story, and technical story levels.

Accepted as a limitation: the one-language guard finds Portuguese letters, not
Portuguese words. Six of the nine glosses carried no accented letter, and the test
that pins the `inspect-method` lines is what caught them. A word list would be brittle.

The other lenses were silent:

- database-architect: the new stop needs no migration, and a cursor stored in the old
  mid-decision state recovers on the next choice, since its story stop is a flow stop.
- devops-engineer, security-engineer: no new operation, input, or secret.
- ai-engineer, prompt-engineer: the skill states the stop, how to ask it again, and to
  relay a refusal rather than force a choice.
- experience-designer, product-designer: every surface now asks the question the cursor
  is at, and the one capability removed, choosing after a Plan, is an accepted boundary.

## Outcome

Pending.
