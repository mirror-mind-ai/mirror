[< Story](index.md)

# Handoff — CV22.DS7.US8 — Builder/Ariad tree (plateaus 1–3 complete, 4 nearly)

**Status:** plateaus 1, 2, and 3 of 9 complete; **plateau 4 complete except its
smoke**. **15 of the 27 in-scope leaves answer from TypeScript.** **Nothing is
routed** — `routing.ts` is untouched and every `build` invocation still reaches
Python, which is the intended state until plateau 8 adds the gate and plateau 9
flips it.

## Resume here

The next piece is **plateau 4's story-lifecycle smoke**: one unrouted run of the
whole lifecycle (adopt → … → done) calling the TypeScript modules directly, with
**no gate in the environment**, so it proves the shipped default rather than a
configured one. It is the first thing in this story that exercises a whole lifecycle
instead of grading a step, so expect it to find composition defects the per-step
corpus cannot see.

Two constraints that apply to it specifically:

- the self-hosting protocol still holds — this story's OWN Ariad lifecycle runs on
  Python (`MIRROR_TS_BUILD=0` by construction until plateau 9), so the smoke must
  exercise the TypeScript modules without becoming the thing that records US8's
  state;
- it writes files, so it goes in a disposable project, and the repository-fingerprint
  guard exists because that rule was broken twice already.

Then plateaus 5–9: Delivery Story lifecycle, cadence and authority, `load` plus the
provider seam (the one with real unknowns — `load` embeds its query twice and runs
the previous conversation's close tail), front door with the gate off, and the flip.

## Current state, verifiable without re-deriving it

| Corpus | Coverage |
|---|---|
| `builder-lifecycle.golden.json` | 86 sequences / 274 steps / 161 surfaces / 40 refusals — all graded |
| `builder-command.golden.json` | 80 cases across 15 leaves — all graded |
| `PENDING_OPS` / `PENDING_LEAVES` | both empty; plateau 5 refills them |
| Write probes | `builder_cursor_state`, `builder_artifacts` |

Written for the session that resumes this story — possibly a different session, a
different Mirror, or a later collaborator. It assumes only the repository, and it
exists so a resuming session does not have to re-derive the measurements below.

---

## What is now true

Six of the 27 in-scope leaves answer from TypeScript end to end, behind no route:
`inspect-method`, `pull-candidates`, `adopt`, `prepare-templates`, `sync-cursor`,
`check-implementation`.

Ten commits, oldest first:

| Commit | What |
|---|---|
| `7e651537` | Card primitives (`card.ts`, `surfaceProtocol.ts`) — 516-row golden |
| `a991b873` | Leaf inventory corrected across ledger, index, DS10, decisions |
| `0bea14c7` | Roadmap parsing (`roadmapGrammar`, `roadmapScan`, `pullCandidates` + renderers, `roadmapPosition`, `storyPaths`) — 145 rows over an 8-project fixture tree |
| `54ded9d2` | Absolute-path leak in a golden, found by CI |
| `e8687fa8` | The Ariad DSL as data (`methodDefinition` + validator, `ariadMethod`, `methodInspection`) |
| `056edf06` | The three activation surfaces (`resumeSurface`, `homeSurface`, `refinementField`) |
| `5eaadc37` | First two leaves end to end (`commands.ts`, `methodAdoption`) |
| `f4dcf8f8` | **The delivery cursor** (`deliveryCursor.ts`, CAS helper, widened `run()` seam) |
| `9d1be54f` | `resumeState`, `workbenchSnapshot`, `implementationGuard`, `lifecycleRibbon` |
| `fef52ce2` | `templateGeneration`, four more leaves, the `builder_cursor_state` write probe |

**Checks at handoff:** TS suite 2137 pass / 0 fail; `tsc --noEmit` clean; biome
clean (one pre-existing `routing.ts` warning, not from this story); Python suite
green; doc links and roadmap-heading checks clean; CI green on all five jobs at
`fef52ce2`; `builder_cursor_state` write probe green on a copy of a real database.

**Seven golden corpora**, all in the CI determinism gate, all generated from
Python before the TypeScript existed:
`builder-card`, `builder-roadmap` (+ fixture tree), `builder-method`,
`builder-orientation` (+ fixture tree), `builder-command` (+ fixture project),
`builder-cursor`, `builder-resume-state`.

---

## What a resuming session must not re-derive

These cost measurement to find. Each is already encoded in a test, but the
reasoning is here so nobody "simplifies" one back.

1. **The cursor's bytes are the contract, not its values.**
   `set_delivery_cursor(expected_cursor=…)` compare-and-swaps on STRING EQUALITY
   of the serialized metadata, so TypeScript must write the bytes Python writes —
   `pythonJsonDumps` separators, `ensure_ascii=False`, Python's key order.
   Divergent bytes mean `MIRROR_TS_BUILD=0` fails on its first lifecycle write:
   the revert would corrupt exactly when it is needed. The write probe does **not**
   prove this (the harness canonicalizes that cell); `builder-cursor.golden.json`
   does.
2. **`re.MULTILINE` is not the `m` flag.** JavaScript's `m` anchors `$` at U+2028
   too, so a lazy title silently truncates at an embedded line separator. The
   roadmap patterns use explicit `(?<=^|\n)` / `(?=\n|$)` anchors and no `m`.
   Python's `\s`, `.`, `str.strip()`, and `str.splitlines()` all differ from their
   JavaScript spellings; `#util/pythonText.ts` is the answer to all four.
3. **`sorted(rglob(...))` sorts path COMPONENTS, not strings.** That order decides
   `_recommend`, i.e. the Navigator-facing "recommended next pull". Latent on the
   real 352-file tree today — the two orders coincide — so the fixture stages the
   collision and a test asserts it stays staged.
4. **Python's frame literals are ragged** (54/55/57/58 inner code points where
   `cardText` gives 56). Normalizing them is prettier and fails parity on four
   lines.
5. **Two Python helpers have two behaviors each.** `_wrap_plain_text` chunks
   over-long words in eight modules and not in `release_intent`;
   `_card_prefixed` strips a leading `"- "` only in `delivery_story_closure`. TS
   ships one of each with a flag, and the test asserts the owner→flag mapping so a
   tenth Python copy cannot drift in silently.
6. **`policies` / `openQuestions` / `stateSemantics` keys are content.**
   `_append_mapping_fields` prints them verbatim into a surface, so
   `message_style` must stay `message_style`.
7. **The Workbench read is guarded on one path and not the other** — see the
   open item below.

---

## What remains intentionally undone

Plateaus 3–9, unchanged from the approved plan:

3. **Story lifecycle** — `pull-item` (with Expand and the candidate-table
   grammar), `prepare-item`, `plan-item`, `approve-plan`, story-package artifact
   materialization with the `if not path.exists()` preservation rule, and
   `planPreauthorization` (sha256 over canonical sorted-compact ASCII JSON).
4. **Story closure** — `validate-item`, `review-item`, `coherence-item`,
   `done-item`, the closure artifacts, and the two CLI-rendered surfaces
   (`debt_review_started`, `done_closure_confirmation`).
5. **Delivery Story lifecycle** — the six DS leaves and the authored roadmap
   closure preflight.
6. **Cadence and authority** — `set-cadence`, `set-flow-unit`, `release-intent`,
   both preauthorization cancels, `continue-lifecycle`.
7. **`load` and the provider seam** — the correction that reshaped the plan:
   `build load` is **not** provider-free. It embeds the query twice and runs the
   previous conversation's close tail, so it needs `BUILD_LOAD_TRANSPORT`, replay
   fixtures, and the degraded-search case.
8. **Front door, gate off** — lazy route import, the two-level allowlist with all
   twenty Workbench leaves refused by name, redaction, the broken-core drill,
   oracle registration.
9. **Flip** — gate on, three `mm-build` skill copies, ledger, `explore story
   promote` released.

### Starting plateau 3

Read first: the plan's Scope C and the panel's module-layout constraint — **one
module per Ariad event** (`pull.ts`, `expand.ts`, `prepare.ts`, `plan.ts`,
`approve.ts`) over a shared `cursorTransitions.ts`, never a `lifecycle.ts` that
mirrors `lifecycle.py`'s 2,303 lines. Renderers go in `builder/artifacts/`.

Two plateau-3-specific rules already established:

- **The artifact corpus will carry paths**, and a golden that records an absolute
  path is byte-stable on one machine and wrong on every other. Redact the project
  root to a token, apply the same substitution in the test so the message shape
  stays fully graded, and fail the generator if any absolute path survives (the
  `_assert_no_absolute_paths` pattern in `generate_builder_roadmap_golden.py`).
- **A test that writes files must write to a disposable copy.** At plateau 2 the
  generic case loop pointed `prepare-templates` at the committed fixture and
  created nine files inside it — caught by `git status`, not by an assertion.

---

## Open items carried forward

The `builder_artifacts` probe encodes each file as an ordinary `{id, cells}` state
row rather than adding a file-aware probe type. `python_state` was never row-shaped
by contract — it is a list of identified cell bags — so a file maps onto it without
stretching the abstraction, and the harness needed no new diffing, redaction, or
failure reporting whose only user would be this one probe. A probe whose harness is
buggy reports a false verdict, which is worse than having no probe.

Its safety rule is stated in both halves and is the important part: the probe NEVER
writes into the journey's real `project_path`. It reads the journey and cursor from
the database copy and materializes into a disposable tree beside each engine's own
copy — separate trees, because one shared tree would make the second engine report
`existing` where the first reported `created`.

Recorded in the plan's Debt / CRs section; none of the rest blocks plateau 4.

- **Python's Workbench-read asymmetry.** `home_surface._safe_workbench_snapshot`
  swallows `sqlite3.OperationalError`; `read_builder_resume_state` does not. On a
  database predating CV20.DS6 the Home path degrades and `■ BUILDER RESUME`
  raises — the same install is resumable or not depending on which surface renders
  first. Reproduced in both halves, and a mutation that "fixes" it in TypeScript
  fails on purpose. Worth a CR.
- **`inspect_refinement_field` hard-codes a CV20 path** inside the *user's*
  project; every other project reports zero seed CRs and is correct by accident.
- **`_resume_phase` is dead code** — not ported; unreachable code is not parity
  surface.
- **The guard needs no active item**, and four distinct DS-plan failures share one
  message. Both parity-bound.
- **Surfaces still print `uv run python -m memory build …`**, which is wrong the
  moment TypeScript answers the family. A CR after the flip, not a liberty inside
  a port.
- **The front door imports every route module eagerly**, so no family's revert
  survives a TS core that fails to load. Fixed for `build` at plateau 8 by lazy
  import; the general case is a CR under RS009.
- **`--probe`'s choices cannot be derived from `PROBES`** — four probes are built
  inline in `write_parity.py`, including the default. Tried and reverted; the
  comment in that file names why.

---

## Method notes worth keeping

- **Mutation testing found three real coverage gaps** the corpora missed, each
  fixed by adding an oracle case rather than an assertion: the CV-table
  termination rule (needed a *second* CV table), `_recommend`'s loop order
  (needed a Candidate user story against a Planned delivery story), and
  `_projected_active_work`'s `or "active"` default (needed an event moving
  between absent and the literal `"active"`).
- **Three mutants are equivalent, and are recorded as such** rather than counted
  as kills: truncate-then-pad vs pad-then-truncate, the boolean guard in the
  generation normalizer (`Number.isInteger(true)` is already `false` in
  JavaScript), and hardcoding the roadmap surface instead of consulting the DSL
  route (equivalent under the current definition).
- **A mutation harness must assert the file changed.** Two early "survivors" were
  silent no-ops — one targeting a string in a different module, one hitting a
  file's own header comment.
- **Command-level goldens need a subprocess.** `memory.config` resolves `DB_PATH`
  once at import, so an in-process oracle reuses the first case's database; and
  `print(x + "\n")` ends the stream with two newlines, which no renderer-level
  golden can see.
- **`uv run pytest` on this machine resolves a global pytest** from mise's Python
  3.14, not the project venv. `uv sync --extra dev --frozen` fixes it; CI was
  always correct.

---

## Plateau 3 progress

Plateau 3 (Scope C — story lifecycle) is being delivered in **three commits**,
because it is the largest plateau in the story and its two halves fail
differently: surface rendering is cheap to grade, while writes into the
Navigator's project are the only US8 surface with a traversal shape.

1. **Oracle first — done.** `ts/parity/generate_builder_lifecycle_golden.py`
   (53 sequences, 171 graded steps, 109 surfaces, 27 refusals) and 25 new
   command-level cases in `generate_builder_command_golden.py`. No TypeScript
   exists yet, which is the point: the corpus was generated from Python before
   the port could influence it.
2. **`pull` + `expand` — done.** `pull.ts`, `expand.ts`, `cursorTransitions.ts`,
   `artifacts/artifactSurfaces.ts`, `artifacts/storyIndex.ts`. **20 of 53
   sequences now grade step for step** — every sequence whose lifecycle ops are
   only `pull` and `expand` — comparing the cursor dump, the serialized metadata
   cell, every surface, every file on disk, the artifact statuses, the projection
   requests, and the refusal messages.
3. **`prepare` + `plan` + `approve` + preauthorization — split in two.**
   - **3a, done.** The module level: `prepare.ts`, `plan.ts`, `approve.ts`,
     `planPreauthorization.ts`, `storyPlanPreauthorization.ts`,
     `deliveryStoryReady.ts`, `flowUnit.ts` (read side), and
     `artifacts/planArtifacts.ts`. **`PENDING_OPS` is empty and all 53 sequences /
     172 steps grade step for step.**
   - **3b, done except the probe.** The five command leaves in `commands.ts` —
     `pull-item` (with the CLI's auto-Prepare and the Delivery Story Expand
     branch), `prepare-item`, `plan-item`, `approve-plan`,
     `cancel-plan-preauthorization` — plus `_roadmap_plan_context` and the CLI
     artifact helpers. **`PENDING_LEAVES` is empty: 11 of the 27 in-scope leaves
     answer from TypeScript, all 64 command cases graded.**
   - **3c, done: the `builder_artifacts` write probe.** Materializes a story package
     on a copy of a real database and grades the resulting FILES. Green on the demo
     database, and it goes red — removing `writeStoryPackage`'s existence guard
     reports `match: false`.

**Plateau 3 is complete.** 11 of the 27 in-scope leaves answer from TypeScript.

### Plateau 4 progress

Scope D (story closure) at the module level is **done**: `closure.ts` and
`artifacts/closureArtifacts.ts` port Validate, Debt Review, Coherence, and Done, and
**all 86 sequences / 274 steps of the corpus grade step for step**. The four command
leaves (`validate-item`, `review-item`, `coherence-item`, `done-item`), the two
CLI-rendered surfaces (`debt_review_started`, `done_closure_confirmation`), and the
unrouted story-lifecycle smoke remain.

What commit 2 measured:

- **The four verbs share one shape and it is the shape a port gets wrong.** Each
  computes a missing-evidence tuple, and that tuple decides three cursor fields at
  once (`activeCheckpoint`, `pendingConfirmation`, `lastDeliveryEvent`). So
  "incomplete" is not an error and not a different surface -- it is the same surface
  over different persisted state, and a port can render the right card while writing
  the wrong three fields.
- **Two verbs allow exact-state re-entry, one does not.** Review answers its own
  `navigator_debt_decision` and Coherence its own `navigator_coherence`; Done refuses
  every pending confirmation, including the ones its predecessors left. Removing
  either re-entry deadlocks the lifecycle, which is why Python grew them after a live
  failure on another project.
- **Done accepts `review_complete` directly** -- Coherence is an option, not a
  precondition.
- **CR079 is reproduced, and pinned in both directions.** The closure verbs overwrite
  authored artifacts; `closure_overwrites_authored_artifacts` records it, and adding
  the "obvious" existence guard to `writeClosureArtifact` FAILS the corpus. A future
  session cannot fix it inside the port without the test objecting.
- **Mutation testing earned its keep again.** Five of six mutants died on the corpus
  as generated -- Done's precondition, both re-entries, `pay_now`, and the CR079
  guard -- but turning validation's `if/elif` into two `if`s SURVIVED, because the
  default route is non-empty and no scenario passed whitespace. Fixed by adding
  `validate_blank_route_reports_only_the_route`, an oracle case, which is the same
  correction plateaus 1 and 3 each needed.

What commit 3 measured (the four closure leaves):

- **Their refusal shape is not the ordinary one.** A blocked lifecycle call renders
  `IMPLEMENTATION_GUARD` on STDOUT and exits 1, rather than printing `Error: …` to
  stderr — the same trap `check-implementation` set at plateau 2. Routing them through
  the ordinary refusal helper loses a surface the transport protocol requires verbatim,
  and the mutant that does so dies.
- **Two leaves emit a second, CLI-only surface** that `lifecycle.py` does not have and
  the module corpus therefore cannot see: `debt_review_started` after a passed
  Validation, `done_closure_confirmation` after a `no_action` Debt Review with nothing
  missing. `done-item` also prints the project position, reading the roadmap a second
  time after the write.
- **Seeding must target the guard under test.** Three `validate-item` cases first used
  `adopted_prepared`, and all three refused with `Validation requires an approved Plan
  and completed implementation` — a real guard, but one case already covers it and the
  other two proved nothing about the behavior they were written for. Validation starts
  from `plan_approved`, so `adopted_closure_plan_approved` exists; the wrong-event
  refusal is now its own case.
- **One mutant is UNREACHABLE, and is recorded rather than counted as a kill.**
  `miniCardWrapped` uses Python's NON-chunking wrapper, and flipping it to chunk
  survives the whole corpus — correctly, because every string those two surfaces wrap
  is a fixed literal with no word over 54 code points, and the one variable field
  (`activeItem`) goes through the truncating `miniCardText` instead. So the flag has no
  observable behavior today. It is set to match Python anyway, so a future surface that
  wraps variable text through this helper inherits the right behavior instead of
  discovering it. Same treatment plateau 1 gave its three equivalent mutants.
- **A complete `defer` offers no closure.** Dropping the `no_action` check survived
  until `review_item_defer_complete_offers_no_closure` existed, because every other
  complete decision in the corpus WAS `no_action`. Oracle case, not assertion.

   Split because the module level reached a coherent, fully graded state and the
   command level is a separate failure mode (argv parsing, guard order, exit
   codes) that deserves its own review boundary.

### What commit 1 measured that a resuming session should not re-derive

- **Token redaction and a truncating renderer are incompatible.** The first
  corpus ran under `tempfile.mkdtemp()` and replaced the project root with
  `<PROJECT>`, the pattern `generate_builder_roadmap_golden.py` uses. It cannot
  work for Scope C: `_card_text` truncates at 54 code points, so the golden
  recorded `│ /private/var/folders/5k/q6bjkgn95gzd_qss7_5flyzw0000gp │` — a
  truncated PREFIX no full-string substitution can match. The module-level corpus
  therefore runs under a repo-relative root and grades the bytes;
  `ts/parity/builder_surface_paths.py` owns the command-level rule and explains
  what stays graded.
- **Only a `/`-leading row may open a path run.** The first version of that rule
  asked whether a row's text was a fragment of some absolute path, which is also
  true of every RELATIVIZED row (`docs/project/…` is a substring of
  `/abs/prefix/project/docs/project/…`), so it collapsed the
  `artifacts_materialized` rows too and erased content that is machine-independent
  and must stay graded.
- **`.mirror/projections` cannot be snapshotted.** Every cursor write requests a
  Journey projection refresh, and the publisher names each receipt
  `op-<uuid4>.json`; including that tree made `builder-command.golden.json` differ
  between two consecutive runs on one machine. The corpus now grades the authored
  files exactly and the projection seam as `{documents, receipts}` — the receipt
  COUNT is the part that is behavior, and it already shows refused cases producing
  no refresh.
- **A generator must assert it did not touch the repository.** A scenario seeded an
  EMPTY project path; `Path("")` resolves to the process cwd, which for a
  subprocess launched from the repository root is the repository, so `pull-item`
  materialized a fabricated `CV1.DS1 — A delivery story` package under this
  project's real CV1 — a second package claiming a live code, which
  `resolve_story_directory` would refuse as ambiguous. Found by `git status`, like
  plateau 2's fixture pollution. `_repo_docs_fingerprint` now fails the generator
  instead.
- **Seed the state the guard under test actually needs.** Two refusal cases
  initially hit the delivery-cursor guard instead of the guard they were written
  for (`active item is required before prepare`, and the Delivery Story
  project-path refusal), because both sit BEHIND the cursor guard. Scenario
  `adopted_cursor_empty` exists for that reason.
- **The preservation rule only bites at the derived path.** The authored-plan
  scenario first wrote `plan.md` one level too high
  (`roadmap/cv1-us1-…` instead of `roadmap/cv1/cv1-us1-…`, since a dotted code
  nests under its parent coordinate), so Plan created all three artifacts and the
  corpus would have passed a port that overwrites authored work. It now authors two
  of three files and grades `existing / existing / created`.

### What commit 2 measured

- **Path-row normalization must be root-LENGTH invariant, and the marker is the
  only stable signal.** The rule first opened a collapse run at any `/`-leading
  row, since each absolute path starts with one. So does an arbitrary continuation
  chunk: where a wrapped path splits depends on the prefix length. Under the
  generator's repo-relative root, `materialized`'s four paths produced eight
  `/`-leading rows and eight token rows; under the test's `/tmp` root, four. Runs
  now open on `_card_prefixed`'s list marker and continue through its two-space
  indent, which is structural rather than positional. The cross-check is free and
  worth keeping in mind: **Python generates under one root length and the
  TypeScript test replays under another, so the byte comparison itself proves the
  invariance** — no separate test needed, and CI's Linux runner adds a third root.
- **A wrapped path's last chunk can carry the sentence's punctuation.** Wrapping
  splits on whitespace, so `<path>,` is one word and `dmap/cv9-ds1-duplicate-a,`
  is not a substring of any recorded path. That row survived normalization into the
  committed golden — a machine-dependent tail of a temp root. Found through
  `expand_blocked`, whose reason embeds two paths.
- **`_display_path` needs `relative_to`'s three outcomes, not two.** The first port
  guarded with `!resolve(relation).startsWith("/")`, which is always false, so every
  artifact path rendered absolute. Python raises only when the path is not under the
  root and returns `.` when they are equal; the guard is a `..` prefix or an
  absolute result, plus the empty-result case.
- **Expand treats a `/` in a title two OPPOSITE ways**, and mutation testing is what
  surfaced it: replacing `child.title` with `title_leaf(child.title)` survived the
  entire corpus. A child's folder slugs its FULL title
  (`ds-35-us-1-application-flow-review-step-parity`), while the Delivery Story's own
  title goes through `title_leaf` and keeps only the tail
  (`ds-77-application-admin-parity` from `"Delivery / Application & Admin Parity"`).
  Fixed by adding two oracle cases rather than an assertion, which is the same
  correction plateau 1 applied three times.
- **Five other mutants died on the corpus as it stood**: never resetting stale
  children, not advancing the generation, always preserving release intent,
  recommending the first child regardless of `Done`, and overwriting an existing
  child `index.md`.

### What commit 3a measured

- **`resolveStoryDirectory` did not resolve the roadmap root, and Python always
  does.** Latent since plateau 1, because every test and every real caller passes an
  ABSOLUTE project path — the front door reads it from the journey row, where
  `journey set-path` stores an absolute one. Under a relative project root Python
  printed absolute package paths and TypeScript printed relative ones in the same
  surface, and `createStoryDirectory`'s confinement guard would have compared a
  relative candidate against a resolved root. Fixed in `storyPaths.ts`; found only
  because the replay had to run under the generator's own relative root.
- **The replay must use the sequence's recorded `project_root`, not a `mkdtemp`
  directory.** `plan_checkpoint` prints its package path unrelativized (CR082), so
  the generator hands Plan a repo-relative path to keep those rows byte-stable.
  Replaying under an absolute temp root pushes the rows through path normalization
  and stops grading them. Both sides now stage `tmp/parity/builder-lifecycle/<name>`,
  gitignored, which also satisfies the database copy guard.
- **A scenario deleted a file without recording a step.** The missing-Plan authority
  scenario unlinked `plan.md` inline, so the snapshot showed it absent while nothing
  in the sequence said so and the replay refused nothing. `delete_file` is a recorded
  op now. The rule: every mutation a scenario performs is a step, or the sequence is
  not replayable.
- **Plan passes its receipt EXPLICITLY**, which bypasses the cursor's
  coordinate-change invalidation — that is what lets a freshly recorded receipt
  survive the write that records it. It also writes `refreshProjection: false` and
  then requests the refresh itself, once, after the artifacts exist.
- **Existence is sampled BEFORE Plan writes.** The CLI's `_artifact_existence` runs
  first, so a preserved file reports `existing` and a created one `created`. Sampling
  afterwards makes preservation and overwrite indistinguishable.
