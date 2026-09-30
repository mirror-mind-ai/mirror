[< RS001](index.md) · [Canonical status](../index.md#change-requests)

# CR112 — A scaffold cannot be told from authored content, and ordinary Plan approval never reads the plan

## Problem

### As captured (2026-09-30)

Ariad writes three kinds of scaffold into a project and then protects them as if a
person had written them.

Expand writes a child story's `index.md` from a template
(`userStoryStatement`, `ts/src/builder/artifacts/storyIndex.ts:20`):

```text
As a user,
I want to npm distribution,
So that I can receive the value of this story.
```

Plan writes `plan.md` and `test-guide.md` the same way (`renderPlanArtifact`,
`renderTestGuideArtifact`, `ts/src/builder/artifacts/planArtifacts.ts`). None of the
three carries a mark. [CR079](cr079-preserve-authored-content-in-every-lifecycle-artifact.md)'s
rule, never overwrite an authored artifact, is implemented as never overwrite an
existing file, so a scaffold is protected exactly like an authored one, and nothing ever
tells the Driver that a file is still the template.

Nothing reads the files either. `build show` (`ts/src/builder/activeCheckpoint.ts`)
prints each record as present or missing and cannot say "present, and still the
scaffold". Ordinary `approve-plan` (`runApprovePlan`, `ts/src/builder/commands.ts`,
the branch without `--use-preauthorization`) calls `approvePlanCheckpoint` and never
opens `plan.md`, so an untouched scaffold is approvable.

### As characterized (2026-09-30)

Reproduced at `316a631f` in a scratch home with the [validation route](#validation-route);
its output is under [Evidence](#the-route-before-the-change). Two things the capture did
not know:

**The preauthorized route approves the scaffold too.** The capture assumed the
completeness check on that route would refuse it. It does not: `unfilledPlanSectionsFor`
(`ts/src/builder/planPreauthorization.ts`) is structure only — a section is unfilled
when it is empty, or a line starts with `pending`, or is `todo`/`tbd`/`...`/`n/a`/`none`,
or matches the placeholder pattern. The story scaffold's sections hold full sentences
("Deliver Enter an address as an observable slice."), which are none of those. So
`plan-item --preauthorize-approval` followed by `approve-plan --use-preauthorization`
on the untouched scaffold prints `PLAN_APPROVED` and `IMPLEMENTATION_STARTED`, and the
Builder skill's promise for that route — "required sections must exist and contain no
empty, Pending, TODO/TBD, or placeholder body" — is kept to the letter while the plan
is five template sentences.

**Only the Delivery Story route knows its own scaffold.** Its scaffold lines are
`Pending — <guidance>` (`placeholderLine`, `ts/src/builder/artifacts/deliveryStoryArtifacts.ts`),
which the structural rule catches, and its check also compares the body against the
exact scaffold line for each section. The story route has no such line to compare
against, because its scaffold is written to read like a plan.

The route also confirms the rest: Expand's child index carries the template statement;
`build show` prints `○ plan.md` before Plan and `✓ plan.md` after, for a file
byte-identical to the scaffold; the Plan checkpoint prints that scaffold as the plan
([CR111](cr111-the-plan-checkpoint-renders-template-sentences-as-the-plan.md)); and
ordinary `approve-plan` moves the cursor to `plan_approved`.

## Expected Behavior

The runtime knows the bytes it would write, so it can tell a scaffold from anything else
without a marker in the file. `build show` and the Plan checkpoint report each artifact
as `scaffold` or `authored`: a file byte-identical to what Ariad would write for this
item today is a scaffold; so is a `plan.md` any of whose required sections still holds
its scaffold guidance, or an `index.md` whose story statement is still the template
sentence, since an edit elsewhere in the file does not author those. Ordinary
`approve-plan` refuses a `plan.md` in that state, in one line that names the file and
the sections to author, the way
[CR067](cr067-render-the-refused-checkpoint-not-a-hardcoded-implement-stage.md) taught
refusals to speak; the preauthorized route refuses the same file for the same reason.
The completeness rule is one implementation shared by every approval route, not a
second definition of "placeholder". A scaffold is still never overwritten, and an
authored file is still never rewritten.

## Impact

Silent, the trust floor's first class: a placeholder can reach approval, and from there
implementation, with every surface saying present — on both story approval routes. On
the preauthorized one no Navigator turn stands between the scaffold and implementation.
CV22.DS10.US3's `index.md` held the template sentence above from 2026-09-19 to
2026-09-30, eleven days, through a Pull and a Prepare that read the package and reported
nothing. Its siblings were authored by Driver discipline, not by mechanism.

## Plan Or Decision

**Approved 2026-09-30** by the Navigator, with D1–D5 as recorded below; Driver and
Delivery assigned the same day.

On the Ariad trust floor by the Navigator's decision of 2026-09-30
([Decisions](../../decisions.md#the-cv22-release-is-gated-on-an-ariad-trust-floor-worked-before-us3)).
First in floor order: it is the one change where a wrong state can advance.
[CR111](cr111-the-plan-checkpoint-renders-template-sentences-as-the-plan.md) prints the
answer this change computes.

### Objective

Give every scaffold Ariad writes one definition the runtime can check: the sections it
would write, and for each, whether the text is a placeholder for content or a default
that may stand. Report each Plan-stage artifact's state — missing, scaffold, partly
authored, authored — on every surface that names it, and refuse a Plan approval, on
either route, while `plan.md`'s placeholder sections are still the scaffold's. Change
no scaffold byte.

### Design

**One section model, shared by the writer and the checker.** The three story scaffold
renderers (`renderStoryIndexArtifact`, `renderPlanArtifact`,
`renderTestGuideArtifact`) are refactored to build a list of sections — header, lines,
kind — and to join it into the markdown they write today. The joined bytes do not
change; the goldens that grade them prove it. A new `ts/src/builder/artifacts/scaffoldState.ts`
reads a file back through the same list: it does not carry a second copy of any template
sentence, so the checker cannot drift from the writer, which is how the story route's
check drifted from the story scaffold in the first place. The model is the only home
of those sentences: `roadmapPlanContext` (`ts/src/builder/commands.ts`) and the
defaults inside `planLifecycleItem` (`ts/src/builder/plan.ts`), which each hold a copy
today, become readers of it or are deleted, in this change and not in CR111 (engineer
finding).

**Two kinds of section (D1).** A `placeholder` section is where the scaffold stands in
for content the Driver must write: for `plan.md`, the Objective line, Scope, Acceptance
Behavior, Validation Route; for `index.md`, the story statement, Outcome, Acceptance
Behavior; for `test-guide.md`, Automated Validation and Navigator Validation. A
`default` section is a rule or a default that may legitimately stand as written:
Non-Goals (the sibling exclusions), Implementation Contract, Stop Conditions, Approval
Gate, E2E Decision, Out Of Scope, Validation Evidence. A Driver who keeps "Do not use
git add ." verbatim has not left a placeholder; a Driver who keeps "Deliver X as an
observable slice" has.

**Four states per section, from structure alone.** `missing` (no file, or no such
heading); `unfilled` (empty, or the existing rule: a line starting with `pending`, a
throwaway token, the placeholder pattern); `scaffold` (every non-blank line is one of
the lines the scaffold would write for this section and this item today); `authored`
(anything else). Prose is never judged — one real line under a template heading is
authored, as `unfilledPlanSectionsFor` already decides today. The file's state follows
its placeholder sections: `missing`; `scaffold` when none is authored and the file still
carries the scaffold's text; `incomplete` when none is authored and none of it is the
scaffold's; `partly authored` when some are; `authored` when all are. (`incomplete` was
added at plateau 2, when the corpus showed a Driver's own plan, written without the
required headings, reading as a scaffold: see the plateau 2 handoff.) `unfilledPlanSectionsFor` is re-expressed on
this module and keeps its verdicts on the existing tests; the Delivery Story plan's own
check moves onto it if its verdicts survive unchanged (D3).

**Template lines carry slots; the checker matches around them.** A scaffold line is a
fixed text with a `{title}` or `{code}` slot ("Deliver {title} as an observable
slice."); the checker matches the fixed text before and after the slot and lets the
slot hold anything. So the check reads nothing but the file and the model: not the
cursor's title, which a re-pull can change, and not the roadmap's siblings, which the
Non-Goals default names and which never gate (engineer and devops findings). A custom
`--objective` given at Plan is authored by construction, because it does not match the
default line's fixed text.

**Every surface that names an artifact says its state (D2).** `build show`'s records
list gains `index.md` and `test-guide.md` above `plan.md` and prints each of the three
with its state in words, the glyph carrying only done or not: `✓ plan.md — authored`,
and `○ plan.md — missing`, `○ plan.md — scaffold`, `○ plan.md — partly authored`, the
last two followed by one wrapped line, `to author: Scope, Validation Route`, in the
exact `## ` heading text (experience-designer and prompt-engineer findings). Closure
records keep present or missing; their
truth is the seal. `ARTIFACTS_MATERIALIZED` says `↻ existing story index — scaffold`
or `— authored` where it says `↻ existing story index` today. CR111 prints the same
states on the Plan checkpoint through this module.

**Approval refuses a plan that is not yet a plan, on both routes (D2).** Ordinary
`approve-plan` reads `plan.md` from the canonical package path — inside the journey's
project, as every artifact path must be — and throws `LifecycleRefusal("plan",
"missing_evidence", …)` when the file is missing or any placeholder section is
`unfilled` or `scaffold`; `runApprovePlan` renders it as `CHECKPOINT_REFUSED`, the way
[CR067](cr067-render-the-refused-checkpoint-not-a-hardcoded-implement-stage.md) made
every refused lifecycle command do, naming the file and the sections to author. Nothing
is written before the refusal. The preauthorized route's mismatch reason lists the same
sections; `PLAN_PREAUTHORIZATION_MISMATCH` then falls back to ordinary approval, which
refuses for the same reason until the plan is authored. The two precondition errors `approve-plan` prints today as plain
`Error:` lines — no cursor, and no pending `after_plan` checkpoint, which the route
meets when a plan is approved twice — take the same `CHECKPOINT_REFUSED` shape, since
CR067's rule is that a refused lifecycle step says where the cursor stands. A journey
with no project path has no file to read and approves as today; a journey with a project path and no
`plan.md` is refused, since Plan wrote one there.

**Done refuses a story whose index is still Expand's (D4).** `done-item` reads
`index.md` and refuses when its placeholder sections are still the scaffold's, in the
same refusal shape: a story cannot close while its record says "I want to <title>".
`test-guide.md` is reported everywhere and enforced nowhere: the Validation checkpoint
already requires the route, the observation, and the pass and fail conditions as
arguments, and the guide's Validation Evidence section is `pending` by definition until
implementation ends.

**The corpus authors before it approves, and before it closes (D5).** The recorded
lifecycle corpus approves scaffolds today because nothing ever read them. Every
sequence that approves a story plan gains an `author` step that writes one real line
under each placeholder section before the approval, and every sequence that reaches
story Done on an Expand-written child gains one for `index.md` before the Done, so the
recorded approvals and closures keep their meaning; sequences that exist to test
refusal record the new refusal (quality-assurance finding). The `builder-command` seeds that approve with no
`plan.md` on disk gain an authored one, or record the refusal, by what each scenario is
for. The smoke (`ts/smoke/builder_lifecycle_smoke.ts`) authors `plan.md` before its two
approvals, because it models the real flow. Every golden edit is a script with asserted
counts, listed in `ts/test/goldens/README.md` with its reason.

**The skill states the bar, not the check (prompt-engineer finding).** A structural
check is a floor: one real line under a heading passes it. `mm-build/SKILL.md`'s Plan
section says what an authored plan is — the plan the Navigator approves from, in
Navigator-facing language — and the sequence: `plan-item`; author `plan.md` (and
`index.md` when `build show` names it a scaffold); `build show` reads `authored`;
present the plan; the Navigator approves; `approve-plan`. A refusal means: author what
it names, re-run `build show`, re-present — never re-run `approve-plan` in the same turn
as if the approval were still standing. The preauthorized route's paragraph says the
same for its receipt. The Claude copies regenerate from the Pi source (CR102). The
troubleshooting page gains one entry: a refusal naming `to author:` after an update
means the file was never authored, not that the update broke (devops finding); the
refusal prints the project-relative path, as every artifact surface will after CR082.

**Forwarded to CR111, not decided here (product-designer finding).** Once the Plan
card stops printing the scaffold, the approval gate has no runtime-rendered plan: the
Navigator approves from the Driver's prose and the file. Whether `build show` and the
Plan card should render a digest of the authored plan — each placeholder section's
heading, first line, and line count — is CR111's question; this change's state
function is what would feed it.

### Decisions this plan asks the Navigator to take

1. **D1 — Sections have a kind, and only placeholder sections must be authored.**
   Alternative: every section must differ from the scaffold, which refuses a plan that
   keeps the Implementation Contract's rules verbatim.
2. **D2 — `plan.md` is enforced at approval on both routes; `index.md` at story Done;
   `test-guide.md` is reported only.** Alternative: enforce all three at approval, which
   asks for a validation route before implementation exists.
3. **D3 — The Delivery Story plan's check moves onto the shared module when its
   verdicts survive unchanged on the existing tests**; otherwise it stays, with the
   reason recorded. Alternative: leave it now, as a second definition.
4. **D4 — Story Done refuses an index that is still Expand's scaffold.** Alternative:
   report only, and let the roadmap carry template statements into history.
5. **D5 — The corpus is edited by script with asserted counts: an `author` step before
   every approval that follows a scaffold, and refusal scenarios where refusal is the
   subject.** Alternative: a harness that authors implicitly — a hidden fixture behavior
   the goldens would not show.

Approving the plan approves these five as recorded; amendments re-open it.

### Affected files

- `ts/src/builder/artifacts/storyIndex.ts`, `planArtifacts.ts` — the section model,
  with slots; bytes unchanged.
- `ts/src/builder/commands.ts` (`roadmapPlanContext`), `ts/src/builder/plan.ts` (the
  report defaults) — readers of the model, or deleted.
- `ts/src/builder/artifacts/scaffoldState.ts` — new: per-section and per-file state.
- `ts/src/builder/planPreauthorization.ts` — `unfilledPlanSectionsFor` re-expressed on
  the module; `planPreauthorizationMismatchReason` names sections that are not authored.
- `ts/src/builder/artifacts/deliveryStoryArtifacts.ts` — its check onto the module (D3).
- `ts/src/builder/approve.ts`, `commands.ts` (`runApprovePlan`, `runDoneItem`) — the
  refusals, rendered by `renderCheckpointRefused`.
- `ts/src/builder/activeCheckpoint.ts`, `artifacts/planArtifacts.ts` (the artifacts
  surface) — the states.
- `ts/smoke/builder_lifecycle_smoke.ts` — authors before approving.
- `ts/test/builder/*` — new tests; `ts/test/goldens/builder-lifecycle.golden.json`,
  `builder-command.golden.json`, `README.md` — the scripted edits.
- `.pi/skills/mm-build/SKILL.md` (and its generated Claude copies), `REFERENCE.md`
  (Builder lifecycle artifacts), `docs/process/troubleshooting.md` — the rule, the
  sequence, the refusal loop, the states.

### Plateaus

Each closes with a commit, green CI, and a handoff line under Evidence.

0. **Characterize and count.** The route above, recorded. The corpus counted: every
   sequence that approves after a scaffold, every sequence that reaches story Done on
   an Expand-written index, every command scenario that approves with no file, the
   smoke's two approvals, and the Delivery Story check's current verdicts. No behavior
   change.
1. **The section model and the checker.** Renderers refactored, goldens unchanged;
   `scaffoldState.ts` with its tests: each artifact, both story levels, siblings; the
   untouched scaffold; one real line under a placeholder heading; an edit elsewhere in
   `index.md` with the statement intact (US3's case); a custom objective over template
   scope; `unfilledPlanSectionsFor` re-expressed with its existing tests green; the
   Delivery Story check under D3.
2. **The surfaces.** `build show` records and `ARTIFACTS_MATERIALIZED` with states;
   their goldens edited by hand with the reason.
3. **The refusals.** Ordinary and preauthorized approval; story Done; the corpus and
   the smoke author before approving and before closing; refusal scenarios recorded;
   the golden diff held to criterion 8; the skill, REFERENCE, and troubleshooting say
   what approval requires and what a refusal means.
4. **Validation and handoff.** The route after the change; the Navigator's walk; the
   handoff review; the ledger.

### Acceptance criteria

1. Every scaffold byte Ariad writes is unchanged: the goldens that grade
   `index.md`, `plan.md`, and `test-guide.md` scaffolds pass without edits after
   plateau 1.
2. On an untouched scaffold, `build show` prints `○ index.md — scaffold`,
   `○ plan.md — scaffold`, `○ test-guide.md — scaffold`, each with its `to author:`
   line; on the authored plan it prints `✓ plan.md — authored`.
3. Ordinary `approve-plan` on an untouched or partly authored `plan.md` renders
   `CHECKPOINT_REFUSED` naming the file and exactly the placeholder sections still
   unauthored, and the cursor is unchanged; on an authored one it renders
   `PLAN_APPROVED` as today.
4. `approve-plan --use-preauthorization` on the same scaffold renders
   `PLAN_PREAUTHORIZATION_MISMATCH` naming the same sections; on an authored plan it
   approves and starts implementation as today.
5. An `index.md` edited elsewhere but carrying the template statement reads `partly
   authored` with the statement section named; `done-item` refuses it (D4).
6. A journey with no project path approves as before; a journey with a project path and
   no `plan.md` is refused with the path named.
7. No template sentence exists in two places: `grep` for any scaffold sentence finds
   one definition, and neither `roadmapPlanContext` nor `planLifecycleItem` carries
   one.
8. The corpus and the smoke approve only authored plans and close only authored
   indexes. The golden diff is a contract: the added `author` steps, the `plan.md` and
   `index.md` bytes in the steps after them, and the new refusal scenarios change;
   every other recorded surface is byte-identical. Every edit is listed with its
   reason and its count.
9. A scaffold check reads only the file and the section model: a re-pull that changes
   the item's title, or a roadmap edit that changes its siblings, changes no verdict.
10. `to author:` lists and refusals print the exact `## ` heading text, pinned by a
    test that greps the file for each name printed.

### Validation route

CLI only, in a scratch home, with no Pi session (CR106). Its output before the change is
recorded under [Evidence](#the-route-before-the-change). Run it from the repository root
as a script, with `bash <file>`, so that no interactive alias applies. It deletes its
temporary directory:

```bash
V=$(mktemp -d) && mkdir -p "$V/home" && export MIRROR_HOME="$V/home" MIRROR_USER= NODE_OPTIONS=--no-warnings
cr112() { node ts/src/frontDoor/cli.ts "$@"; }
R="$V/p/docs/project/roadmap" && mkdir -p "$R/cv1/ds1" && printf '# Roadmap\n' > "$R/index.md"
printf '# CV1 — Checkout\n\n**Status:** 🟢 Active\n' > "$R/cv1/index.md"
printf '# CV1.DS1 — Checkout address\n\n**Status:** 🟡 Planned\n**Type:** Delivery Story\n\n## Candidate Stories\n\n| Code | Story | Type | Status |\n|------|-------|------|--------|\n| CV1.DS1.US1 | Enter an address | User Story | 🟡 Planned |\n| CV1.DS1.TS1 | Validate the address | Technical Story | 🟡 Planned |\n| CV1.DS1.US2 | Show the address | User Story | 🟡 Planned |\n' > "$R/cv1/ds1/index.md"
git -C "$V/p" init -q && printf '# j\n' | cr112 identity set journey j > /dev/null && cr112 journey set-path j "$V/p" > /dev/null 2>&1
cr112 build adopt --journey j --method ariad > /dev/null && cr112 build sync-cursor --journey j --method ariad > /dev/null
cr112 build set-cadence --journey j --method ariad --profile checkpoint > /dev/null
answer() { grep -o '<<<ARIAD:[A-Z_]*>>>\|^Error: .*' | paste -sd ' ' - | sed 's/^/  answer: /'; }
records() { cr112 build show --journey j --method ariad | sed -n '/│ records/,/│ boundary/p' | sed '1d;$d' | sed 's/│//g; s/ *$//'; }
cursor() { cr112 build show --journey j --method ariad | awk -F'│' '/│ (last event|pending confirmation|active checkpoint) /{l=$2; getline; v=$2; gsub(/^ +| +$/, "", l); gsub(/^ +| +$/, "", v); printf "  %s: %s\n", l, v}'; }
author() { printf '\n## %s\n\n- %s\n' "$2" "$3" >> "$1"; }
echo '--- step 1: pull the Delivery Story; Expand writes the child indexes'
cr112 build pull-item --journey j --method ariad --item-code CV1.DS1 --item-level delivery_story --item-title 'Checkout address' --why-now now 2>&1 | answer
US1="$(find "$R/cv1/ds1" -mindepth 1 -maxdepth 1 -type d -name '*us1*')"
echo "  child index written by Expand ($(basename "$US1")/index.md):"
sed -n '/^## User Story/,/^## Outcome/p' "$US1/index.md" | sed '$d' | sed 's/^/    /'
echo '--- step 2: pull the child; build show reports its records'
cr112 build pull-item --journey j --method ariad --item-code CV1.DS1.US1 --item-level user_story --item-title 'Enter an address' --why-now now 2>&1 | answer
records
echo '--- step 3: plan-item writes the scaffold; the checkpoint prints it as the plan'
cr112 build plan-item --journey j --method ariad 2>&1 | sed -n '/│ plan  /,/│ implementation contract/p' | sed '$d' | sed 's/│//g; s/ *$//'
records
echo '  plan.md is byte-identical to the scaffold: ' "$(md5 -q "$US1/plan.md" 2>/dev/null || md5sum "$US1/plan.md" | cut -c1-32)"
echo '--- step 4: approve-plan on the untouched scaffold'
cr112 build approve-plan --journey j --method ariad 2>&1 | answer
cursor
echo '--- step 4b: author Scope in place, then approve; then author the rest, then approve'
sed -i.bak 's/^- Deliver Enter an address as an observable slice\.$/- The address form takes street, number, and postcode./' "$US1/plan.md" && rm -f "$US1/plan.md.bak"
cr112 build approve-plan --journey j --method ariad 2>&1 | answer
records
author "$US1/plan.md" 'Objective' 'Take an address at checkout.'
author "$US1/plan.md" 'Acceptance Behavior' 'Given a valid address, the order shows it.'
author "$US1/plan.md" 'Validation Route' 'Enter 1 Main St; expect it on the confirmation page.'
cr112 build approve-plan --journey j --method ariad 2>&1 | answer
cursor
echo '--- step 5: the preauthorized route on the sibling, same scaffold'
cr112 build pull-item --journey j --method ariad --item-code CV1.DS1.TS1 --item-level technical_story --item-title 'Validate the address' --why-now now > /dev/null 2>&1
cr112 build plan-item --journey j --method ariad --preauthorize-approval --stop-after navigator_validation 2>&1 | answer
cr112 build approve-plan --journey j --method ariad --use-preauthorization 2>&1 | answer
cursor
echo '--- step 5b: after the mismatch, author the sibling and take the ordinary fallback'
TS1="$(find "$R/cv1/ds1" -mindepth 1 -maxdepth 1 -type d -name '*ts1*')"
for s in 'Objective|Reject a malformed postcode.' 'Scope|Postcode format and street presence.' 'Acceptance Behavior|Given a bad postcode, the form refuses it.' 'Validation Route|Enter ABC; expect the refusal.'; do author "$TS1/plan.md" "${s%%|*}" "${s#*|}"; done
cr112 build approve-plan --journey j --method ariad 2>&1 | answer
cursor
echo '--- step 6: the preauthorized route on an authored plan'
cr112 build pull-item --journey j --method ariad --item-code CV1.DS1.US2 --item-level user_story --item-title 'Show the address' --why-now now > /dev/null 2>&1
cr112 build plan-item --journey j --method ariad --preauthorize-approval --stop-after navigator_validation 2>&1 | answer
US2="$(find "$R/cv1/ds1" -mindepth 1 -maxdepth 1 -type d -name '*us2*')"
for s in 'Objective|Show the saved address.' 'Scope|The confirmation page.' 'Acceptance Behavior|Given a saved address, the page shows it.' 'Validation Route|Open the page; expect the address.'; do author "$US2/plan.md" "${s%%|*}" "${s#*|}"; done
records
cr112 build approve-plan --journey j --method ariad --use-preauthorization 2>&1 | answer
cursor
unset MIRROR_HOME MIRROR_USER; rm -rf "$V"
```

Pass, after the change:

- Step 1: as before; the child index carries the template statement (Expand still
  writes it; the statement is what `build show` will name).
- Step 2: `○ index.md — scaffold` with `to author: User Story, Outcome, Acceptance
  Behavior`; `○ plan.md`.
- Step 3: the checkpoint no longer prints template sentences as the plan (CR111);
  `○ plan.md — scaffold` with `to author: Objective, Scope, Acceptance Behavior,
  Validation Route`; `○ test-guide.md — scaffold`.
- Step 4: `CHECKPOINT_REFUSED`; the cursor still at `plan`, `navigator_approval`,
  `after_plan`.
- Step 4b: first approval refused naming `Objective, Acceptance Behavior, Validation
  Route`, with `○ plan.md — partly authored`; after the three are authored, the second
  approval prints `PLAN_APPROVED` with the cursor at `plan_approved`.
- Step 5: `PLAN_PREAUTHORIZATION_MISMATCH` naming the four placeholder sections; the
  cursor still at `plan`.
- Step 5b: the mismatch invalidated the receipt, so the fallback is ordinary approval:
  after authoring, `PLAN_APPROVED`, the cursor at `plan_approved`.
- Step 6: `PLAN_CHECKPOINT` and `PLAN_PREAUTHORIZATION_RECORDED`; after authoring,
  `build show` reads `✓ plan.md — authored`; the preauthorized approval prints
  `PLAN_APPROVED` and `IMPLEMENTATION_STARTED`, the cursor at `plan_approved`.

Fail: an approval on a scaffold, a refusal that names a section that was authored or
omits one that was not, a `to author:` list that disagrees between `build show` and the
refusal, or a scaffold byte that changed.

### Conscious exclusions

- Judging prose. One real line under a placeholder heading is authored; the Navigator
  reads plans, the runtime reads structure.
- A marker in the files. The runtime knows its own bytes; a marker would be one more
  thing a Driver forgets to remove.
- Enforcing `test-guide.md`. Reported, for the reason in the design.
- Closure records. Their state is present, missing, or preserved by seal, and that
  mechanism is untouched.
- Rewriting Expand's or Plan's scaffold text. CR111 changes what the Plan checkpoint
  prints, not what the files hold; the template statement is the thing this change
  makes visible, and a different template would still be one.

### Authority boundaries

Plan approval moves CR112 to `planned`. A human Driver and a Delivery reference are
required before `in_progress`. `validated` requires the Navigator to walk the route above
and accept it. Each plateau is committed on the Delivery branch and pushed when green,
with GitHub Actions verified after every push. Merge, publication, and release are not
authorized.

Navigator decisions, 2026-09-30: the plan and D1–D5 approved as recorded; Driver
`@viniciusteles`, Delivery `mirror-ts-core`.

### Panel review (2026-09-30)

Two passes. The Driver's first pass, before the Navigator saw the plan, ran the
baseline five (engineer, quality-assurance, devops-engineer, security-engineer,
database-architect) and folded: the `placeholder`/`default` kind (D1, engineer); a
partly authored plan refused by name and the positive path in the route
(quality-assurance); `test-guide.md` reported only, since its evidence section is
`pending` before implementation (quality-assurance, D2); an explicit `author` step in the
corpus, never an implicit harness behavior (devops-engineer, D5); the read bounded to
the canonical package path with nothing written before a refusal (security-engineer);
the persisted mismatch reason keeping its string shape (database-architect).

The Navigator then asked which personas should review the plan and had them do it.
The Driver chose six — engineer, quality-assurance, devops-engineer, prompt-engineer,
experience-designer, product-designer — and left out database-architect (no
persistence change beyond the reason string, already folded), security-engineer (the
read is bounded, nothing executes, nothing is written before a refusal), and
ai-engineer (no model in the loop). Synthesis: the design holds — one section model,
structure-only verdicts, refusals in CR067's shape — and the dissent concentrates in the
checker's dependency on mutable state, the corpus's real scope, and the words the agent
will read. None changes the shape; all change what "complete" means for plateaus 1 and
3. Findings, all folded above:

- **the checker regenerated the scaffold from the cursor's title and the roadmap's
  siblings** (engineer, devops-engineer) — an identity check depending on state that
  moves; now template lines with slots, matched around the slot, reading only the file
  and the model (criterion 9);
- **criterion 7 would have been false at close** (engineer) — `roadmapPlanContext` and
  `planLifecycleItem`'s defaults each hold a copy of the sentences; now readers of the
  model or deleted, in this change;
- **the corpus was under-counted** (quality-assurance) — D4 makes Done refuse a
  scaffold index, so every closure sequence on an Expand-written child refuses too; the
  `author` step now covers `index.md` before Done, and plateau 0 counts those sequences;
- **the route never walked the preauthorized positive half, and its `author` helper
  leaned on the heading-merge quirk** (quality-assurance) — step 4b edits Scope in
  place, step 5b takes the ordinary fallback after a mismatch, step 6 authors a third
  story and approves it with its receipt;
- **"scripted with counts" is not an acceptance** (quality-assurance) — criterion 8 is
  now a diff contract: only the `author` steps, the file bytes after them, and the new
  refusal scenarios change;
- **the rollout will refuse things that used to pass, in other repositories**
  (devops-engineer) — one troubleshooting entry, and the project-relative path in the
  refusal;
- **the skill would state the check and the agent would hear "make it pass"**
  (prompt-engineer) — the skill now states the bar and the sequence, and what a refusal
  means: author, `build show`, re-present, never re-run `approve-plan` as if the
  approval stood; `to author:` and refusals print exact heading text, pinned
  (criterion 10);
- **four circles for four states** (experience-designer) — the glyph now carries only
  done or not; the state is a word;
- **the approval gate is left with no runtime-rendered plan** (product-designer) — a
  digest of the authored plan is CR111's question, forwarded, with this change's state
  function as its feed. On D4, the panel converged.

## Evidence

### Characterization (2026-09-30)

The route above, run at `316a631f` before any change. The scratch project holds one CV,
one Delivery Story with two candidate stories, and an initialized git repository; the
journey `j` points at it, adopts Ariad, syncs its cursor, and sets `checkpoint`
cadence.

### The route before the change

```text
--- step 1: pull the Delivery Story; Expand writes the child indexes
  answer: <<<ARIAD:DELIVERY_STORY_READY>>> <<<ARIAD:ARTIFACTS_MATERIALIZED>>>
  child index written by Expand (cv1-ds1-us1-enter-an-address/index.md):
    ## User Story
    
    As a user,
    I want to Enter an address,
    So that I can receive the value of this story.
    
--- step 2: pull the child; build show reports its records
  answer: <<<ARIAD:DELIVERY_STORY_IDENTIFIED>>> <<<ARIAD:PREPARE_FIELD_READING>>>
 docs/project/roadmap/cv1/ds1/cv1-ds1-us1-enter-an-addr
 ess
 ○ plan.md
 ○ validation.md
 ○ review.md
 ○ coherence.md
 ○ done.md

--- step 3: plan-item writes the scaffold; the checkpoint prints it as the plan
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

 docs/project/roadmap/cv1/ds1/cv1-ds1-us1-enter-an-addr
 ess
 ✓ plan.md
 ○ validation.md
 ○ review.md
 ○ coherence.md
 ○ done.md

  plan.md is byte-identical to the scaffold:  7a3dba323bdb86a05974342a6cd3f43c
--- step 4: approve-plan on the untouched scaffold
  answer: <<<ARIAD:PLAN_APPROVED>>>
  last event: plan_approved
  pending confirmation: none
  active checkpoint: none
--- step 4b: author Scope in place, then approve; then author the rest, then approve
  answer: Error: Plan approval requires a pending after_plan navigator_approval checkpoint
 docs/project/roadmap/cv1/ds1/cv1-ds1-us1-enter-an-addr
 ess
 ✓ plan.md
 ○ validation.md
 ○ review.md
 ○ coherence.md
 ○ done.md

  answer: Error: Plan approval requires a pending after_plan navigator_approval checkpoint
  last event: plan_approved
  pending confirmation: none
  active checkpoint: none
--- step 5: the preauthorized route on the sibling, same scaffold
  answer: <<<ARIAD:PLAN_CHECKPOINT>>> <<<ARIAD:PLAN_PREAUTHORIZATION_RECORDED>>> <<<ARIAD:ARTIFACTS_MATERIALIZED>>>
  answer: <<<ARIAD:PLAN_APPROVED>>> <<<ARIAD:IMPLEMENTATION_STARTED>>>
  last event: plan_approved
  pending confirmation: none
  active checkpoint: none
--- step 5b: after the mismatch, author the sibling and take the ordinary fallback
  answer: Error: Plan approval requires a pending after_plan navigator_approval checkpoint
  last event: plan_approved
  pending confirmation: none
  active checkpoint: none
--- step 6: the preauthorized route on an authored plan
  answer: <<<ARIAD:PLAN_CHECKPOINT>>> <<<ARIAD:PLAN_PREAUTHORIZATION_RECORDED>>> <<<ARIAD:ARTIFACTS_MATERIALIZED>>>
 docs/project/roadmap/cv1/ds1/cv1-ds1-us2-show-the-addr
 ess
 ✓ plan.md
 ○ validation.md
 ○ review.md
 ○ coherence.md
 ○ done.md

  answer: <<<ARIAD:PLAN_APPROVED>>> <<<ARIAD:IMPLEMENTATION_STARTED>>>
  last event: plan_approved
  pending confirmation: none
  active checkpoint: none
```

Steps 4b, 5b, and 6 were added at plan time so the positive paths and the in-place
edit are walked too. Before the change they meet a plan already approved in step 4 or
5, and show one more thing: `approve-plan` on an already-approved plan prints a plain
`Error:` line where CR067's rule asks for `CHECKPOINT_REFUSED`; folded into the
refusal work above.

### Plateau 1 handoff (2026-09-30)

`d0d68089`. Now true: every sentence a story scaffold carries lives once, in
`ts/src/builder/artifacts/scaffoldSections.ts`, as a template with `{title}`/`{code}`
slots and a `placeholder` or `default` kind. `storyIndex.ts`, `planArtifacts.ts`,
`roadmapPlanContext`, and `planLifecycleItem`'s defaults read it; the 2830 tests that
grade scaffold bytes passed unchanged, so no scaffold byte moved (criterion 1).
`ts/src/builder/artifacts/scaffoldState.ts` reads a file back through the same templates
and answers per section and per file; `unfilledPlanSectionsFor` moved beside it with
its rule unchanged, and `unauthoredPlanSectionsFor` also counts the scaffold's own
sentences. 24 new tests in `scaffoldState.test.ts` (27 after plateau 2).

Three things the plan did not say:

- **Two Plan vocabularies, each recorded once (Driver decision).** The front door
  writes one set of sentences (`roadmapPlanContext`); `planLifecycleItem` called with
  no sections writes another, reached only by the recorded corpus and the tests.
  Deleting the second now would move the `plan.md` bytes of every corpus sequence and
  the Plan card's sentences, which CR111 rewrites anyway, so the same bytes would be
  edited twice. Both are in the model, each once, and retiring the library vocabulary
  is handed to CR111. Criterion 7 holds: no sentence is defined in two places, and
  neither caller carries one.
- **D3's outcome: the Delivery Story check stays.** Its rule is strictly broader than
  the story rule, since it matches the scaffold line anywhere in a body and "placeholder"
  anywhere, and `delivery_story_preauthorization_refuses_prose_placeholder` grades that
  difference. Moving it onto the shared module would change a recorded verdict, which is
  the condition under which D3 said it stays.
- **One mutant the tests cannot kill, recorded.** Judging `scaffold` before `unfilled`
  leaves every test green, because with today's tables no line is both a scaffold line
  and an unfilled line, so the order is unobservable. The order stays as designed for
  the day a table holds a `Pending` line.

**Pushed red, and fixed in plateau 2.** `d0d68089` failed CI's lint step: the new test
file's imports were not in Biome's order. The Driver ran the formatter on it but not the
full lint, and began plateau 2 without watching the run finish, which the development
guide forbids. Plateau 2's commit carries the fix and ran green on both legs
(`2839d4ca`). Every plateau from here waits for its run.

### Plateau 2 handoff (2026-09-30)

Now true: `build show` lists `index.md`, `plan.md`, and `test-guide.md` with their state
before the closure records, and under an unauthored one the sections still to write,
by exact heading text, with a hanging indent so a wrapped list reads as one item. The
glyph carries only done or not. `ARTIFACTS_MATERIALIZED` names what an existing file is
(`↻ existing story index — scaffold`), for a story Plan's three files and for Expand's
child indexes; Delivery Story package artifacts are unchanged. Goldens edited by
script, counts asserted, listed in `ts/test/goldens/README.md`: 18 artifact notes in 15
`builder-lifecycle` steps and 3 `builder-command` Plan renders. 2858 tests pass.

What the corpus found:

- **A Driver's file is not a scaffold.** `plan_preserves_authored_plan` records a plan a
  person wrote with none of the required headings. With every placeholder section
  missing and none authored, the first model called it a scaffold, which says Ariad
  wrote what it did not. The file state gained `incomplete`: nothing authored and
  nothing of the scaffold's. Approval will refuse it like a scaffold; the card says
  what it is.
- **The harness had its own copy of `planPackageArtifacts`**, the kind of duplicate this
  change exists to remove: it could not carry the note, and would have kept the corpus
  blind to it. The product's function moved to `planArtifacts.ts` and both call it; the
  harness's five inline artifact maps became one `artifactRecord`.

Next: plateau 3, the refusals.

### Plateau 3 handoff (2026-09-30)

Now true: approval reads the plan and Done reads the story's record. Ordinary
`approve-plan` refuses, before any write and as `CHECKPOINT_REFUSED`, a `plan.md`
whose Objective, Scope, Acceptance Behavior, or Validation Route is missing, empty,
pending, or still the scaffold's, naming each by its heading and the file by its
project-relative path; the preauthorized route refuses the same file with
`PLAN_PREAUTHORIZATION_MISMATCH`, reason `plan_incomplete` as before, and the surface
now lists the sections. Both read one list, `PLAN_APPROVAL_SECTIONS`. The approval
precondition is a refusal told apart as not reached, waiting on another
confirmation, or already complete (`plan_approval` joined the step table, and the
table-driven test runs it against every event). Story Done refuses an `index.md`
still carrying the scaffold's statement, Outcome, or acceptance block. A journey
with no project approves and closes as before.

The corpus and the smoke author before they approve and close: one `write_file`
step in `story_lifecycle_happy_path`, and in the smoke an authored-edit step, whose
check is now each edit's own claim rather than the Delivery Story's Done marker.
Four command tests author through the shared helper, and the CR067 walk gained
the scaffold refusal and the approve-twice refusal. `scaffoldRefusals.test.ts` holds
13 tests, one per criterion; three mutants (approval stops reading the plan, Done
stops reading the index, the preauthorized route falls back to the structural
rule) each fail them. The skill states the bar, the sequence, and the refusal loop;
REFERENCE and troubleshooting say what the refusal means. 2871 tests pass.

Two places where the implementation departs from this document's text:

- **No cursor stays a plain `Error:`.** The design grouped it with the checkpoint
  error as a refusal. Every other lifecycle command since CR067 keeps "no cursor"
  as an error, since the journey has no lifecycle yet to say where it stands, and
  approval follows them.
- **Ordinary approval also requires Non-Goals and Implementation Contract to be
  non-empty**, as the preauthorized route always has. D2 named only the
  placeholder sections; the design also said one rule for every approval route, and
  the two could not both hold. One rule won.

## Outcome

Pending.
