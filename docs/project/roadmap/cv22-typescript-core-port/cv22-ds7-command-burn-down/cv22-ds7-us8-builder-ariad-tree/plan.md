[< Story](index.md)

# Plan — CV22.DS7.US8 — Builder/Ariad tree

## Objective

Port the `build` command — 27 in-scope leaves across six groups — to the
TypeScript core with byte-exact `<<<ARIAD:…>>>` surface parity and
behaviorally identical delivery-cursor transitions graded as **ordered
sequences**, then route the whole family to TS behind one gate,
`MIRROR_TS_BUILD`, flipped as the last plateau. `explore story promote`, held
on Python by name since US7, flips with it as a routing entry.

This is the self-hosting story: the commands under port are the commands
recording this story's own lifecycle. The plan therefore spends its first
section on what the authored index got wrong when read from prose rather than
source, because two of those corrections change where the risk sits.

## Terrain (facts, read before planning — corrections to the index first)

### Corrections to the authored index

1. **`build load` is not provider-free.** The index's seam table says "DS8
   live provider: Nothing — `build` makes no LLM call". `cmd_load`
   (`cli/build.py` 244–305) calls `mem.search(query_text, limit=5,
   journey=slug)` and `mem.search(query_text, limit=5)` — two embedding
   calls through `services/memory.py::search` with `log_access=True`, so it
   also **writes** access counts — and then `switch_conversation(...)`, which
   runs `mem.end_conversation(old_conv_id, extract=True)` on the session's
   previous conversation: the full close tail, LLM extraction plus embeddings.
   `load` is a provider-backed leaf with the same shape as `mirror load
   --query` (DS8.US3) composed with the conversation close tail (DS8.US2).
   It needs a transport spec, replay fixtures, and the ai-engineer lens.
   Consequence for slicing: `load` is not "read-only orientation"; it is the
   most write-heavy, most cross-family leaf in the tree and gets its own
   plateau after every surface it composes has been proven alone.
2. **The retired Workbench is 20 leaves, not 15.** `build.py` declares
   `refinement-story {create, overview, pull, review, coherence, close, park}`
   (7) and `change-request {capture, attach, discard, select, confirm, resume,
   plan, mark-implemented, validate, done, park, reject, promote}` (13). The
   index lists 4 + 11 and omits `review|coherence|close` and
   `select|confirm`. Python's `build` has **47** leaves, not 42; the 27 in
   scope are confirmed by enumeration. The by-name refusal list must carry
   all twenty, and the index, ledger row, and DS10 item get corrected in this
   story's first docs commit.
3. **D1 retires the Workbench leaves, not the Workbench read.**
   `read_builder_resume_state(include_refinement=canonical_refinement_index
   is None)` and `home_surface.inspect_refinement_field` read
   `get_workbench_snapshot(store, journey)` whenever the project has no
   `docs/project/refinement/index.md`. Every `load` on a legacy-store project
   renders the `🧰 Refinement field` from SQLite Workbench tables. US8 ports
   that **read-only snapshot**; the twenty mutating leaves stay retired.
   `inspect_refinement_field` additionally reads a hard-coded
   `docs/project/roadmap/cv20-builder-mode-evolution/cv20-ds6-refinement-workbench-flow/plan.md`
   under the *user's* project to count "seed" CRs — Mirror Mind's own docs
   tree leaking into product code. Reproduced, and recorded as debt.
4. **Cursor bytes are load-bearing for the revert.** All Builder state lives
   in `runtime_sessions` rows — `__builder_delivery_cursor__:<journey>` and
   `__builder_method_adoption__:<journey>` — as `metadata` JSON written by
   `json.dumps(..., ensure_ascii=False)` with Python's default `", "` / `": "`
   separators and dataclass field order. `set_delivery_cursor(expected_cursor=…)`
   goes through `compare_and_swap_runtime_session_metadata`, which matches on
   **string equality of the serialized metadata**. If TS writes a cursor whose
   bytes differ from what Python would serialize for the same state, the next
   Python CAS after a `MIRROR_TS_BUILD=0` revert fails with
   `DeliveryCursorConflict`. So D2's "all-or-nothing" is necessary but not
   sufficient: the revert is only real if TS cursor bytes are Python cursor
   bytes, pinned at the cell level. No schema gap: DS6 already custodies
   `runtime_sessions`; TS lacks only the CAS helper.

### Inventory

- **Leaves.** 27 in scope (index groups 1–6, verified against `build.py`
  2240–2884). 20 Workbench leaves refused by name. `--session-id` is accepted
  by every leaf; `--journey` by every leaf except `load` (positional `slug`).
- **Python footprint in scope.** `cli/build.py` 3,156 lines minus the
  Workbench commands; `builder/` 9,703 lines minus `workbench.py` (784) and
  `workbench_surfaces.py` (519) ≈ 8,400; `surfaces/mode_transition.py` for
  the `■ BUILDER MODE ACTIVE` card. `lifecycle.py` alone is 2,303 lines and
  owns Pull, Expand, Prepare, Plan, Approve, Validate, Review, Coherence, Done,
  the artifact renderers, and the candidate-table grammar.
- **Wrapped surfaces (33 ids in scope).** `builder_orientation`,
  `builder_home`, `builder_resume`, `project_position`, `roadmap_snapshot`,
  `pull_candidates`, `delivery_story_identified`, `prepare_field_reading`,
  `expand_decision`, `expand_blocked`, `delivery_story_ready`,
  `plan_checkpoint`, `plan_approved`, `artifacts_materialized`,
  `implementation_guard` (allowed and blocked variants),
  `implementation_started` (story and DS variants),
  `plan_preauthorization_recorded` (story and DS), `plan_preauthorization_mismatch`
  (story and DS), `plan_preauthorization_already_consumed`,
  `validation_checkpoint`, `debt_review_checkpoint`, `debt_review_started`,
  `coherence_checkpoint`, `done_checkpoint`, `done_closure_confirmation`,
  `delivery_story_plan_checkpoint`, `delivery_story_closure_checkpoint`,
  `navigator_flow_unit` (plus the scope-confirmation variant rendered under a
  computed id), `release_intent`. Two of these are rendered in `cli/build.py`
  itself (`debt_review_started`, `done_closure_confirmation`), not in
  `builder/`. `wrap_ariad_surface` normalizes the id (`strip().upper()`,
  spaces → `_`) and `rstrip()`s the body — a trailing-newline rule the goldens
  must pin, since some call sites pass `body + "\n"` and some pass `body`.
- **Unwrapped renders.** `render_available_method`,
  `render_journey_method_state`, `render_journey_without_adopted_method`,
  `render_no_active_journey`, `render_method_adoption_report`,
  `render_template_preparation_report`, `render_delivery_cursor_sync_report`,
  `render_pull_report`, `render_prepare_report`, `render_expand_report`,
  `render_builder_mode_transition`, the lifecycle ribbons, the `Delivery` /
  `Artifacts` / `Mirror` section headers, the stderr banner with ANSI escapes,
  and the plain-text `Error: …` lines with their exit codes (1 for not-found /
  ValueError, 2 for the production-clone refusal).
- **Rendering primitives are duplicated ten times in Python, with two
  behaviors.** `_wrap_plain_text(text, *, width)` is copied into ten modules.
  Eight copies chunk a word longer than `width` into `width`-sized slices;
  `release_intent.py` and `workbench_surfaces.py` do **not** — an over-long
  token lands on its own line and `_card_text`'s `text[:54]` then truncates
  it silently. `_card_text` truncates to 54 code points **then** pads
  (`f"│ {text[:54]:<54} │"`). `_card_prefixed` has three variants: the
  common one (`none` for an empty tuple), `delivery_story_closure.py`'s
  (strips a leading `"- "` from each item first), and `flow_unit.py`'s
  (`none` only when the *rendered* list is empty). `text.split()` is Python
  whitespace semantics. US6's `util/pythonText.ts` (`pySplitWhitespace`,
  code-point slicing) is the primitive layer; TS ports **one** wrapper with a
  `chunkLongWords` flag and one `cardPrefixed` with the two switches, never
  ten copies.
- **Canonical hashing.** `scope_fingerprint` is `sha256` over
  `json.dumps(payload, ensure_ascii=True, separators=(",", ":"),
  sort_keys=True)`. Receipt equality across engines depends on reproducing
  that canonical form exactly; `pythonJsonDumpsEnsureAscii` exists but a
  sorted-compact variant does not yet.
- **Receipt semantics.** `PlanPreauthorizationReceipt` is stored inside the
  cursor JSON; `_invalidate_for_coordinate_change` flips a `pending` receipt
  to `invalidated` with one of five reasons on any coordinate change unless
  the write set the receipt explicitly; `_deserialize_preauthorization`
  returns `None` (drops the receipt) on any malformed field, including a
  `delivery_story` receipt with no children. These are the D3 refusals the
  security lens cares about, and they are only observable as **sequences**.
  The receipt's security property is **binding** — single-use,
  generation-bound, coordinate-bound, status-gated — not secrecy: the
  fingerprint is SHA-256 over public coordinates with no secret and is
  reconstructible by design. (The index's "must not be reconstructible" is
  corrected here.)
- **The cursor row, not the cell.** `upsert_runtime_session` writes
  `interface="builder_delivery_cursor"` (or `builder_method_adoption`),
  `journey`, `active`, `closed_at`, `updated_at`, and `metadata`;
  `get_delivery_cursor` refuses a row with `active=0`. Goldens grade the full
  column set with `updated_at` injected. The non-CAS path is a read-then-upsert
  with no transaction in Python; TS does both inside one transaction and does
  not widen the window.
- **Filesystem seams into the user's project.** Reads: roadmap parsing
  (`pull_candidates.py` 613, `roadmap_position.py`, `roadmap_grammar.py`,
  `story_paths.py`, `delivery_story_roadmap_closure.py`) over
  `docs/project/roadmap/**`, both the legacy `CV → Epic → Story` grammar and
  the DS grammar, excluding `legacy/`; `StoryPackageAmbiguityError` on
  duplicate heading codes; the `Candidate Stories` table (4- or 5-column,
  header-driven) for Expand; `plan.md` section completeness for
  preauthorization; `**Status:**` lines for the Done preflight; the canonical
  refinement index probe. Writes: story-package materialization (`index.md`,
  `plan.md`, `test-guide.md`, and at closure `validation.md`, `review.md`,
  `coherence.md`, `done.md`) with the `if not path.exists()` preservation
  rule; DS-level plan artifacts; method templates (`prepare-templates`,
  `preserved`/`created` per file); `create_story_directory` folder derivation
  from code + `title_leaf`. Titles are `"/"`-chained by convention
  (`title_leaf` takes the last segment, `_cv_title` the first), which is why
  this story's own Pull surface rendered `🟪[CV22] Builder └─ 🟦[US8] Ariad
  tree`. Reproduced; a CR, not a port decision.
- **Projection refresh.** 14 in-scope `request_projection_refresh` sites
  (`lifecycle.py` 5, `delivery_story_closure.py` 4, `delivery_story_plan.py`
  2, `delivery_cursor.py` 2, `story_plan_preauthorization.py` 1; the
  index's 20 includes `workbench.py`'s 6). `delivery_cursor.py` fires only
  when `_projected_active_work` changes — `(active_item, active_checkpoint,
  pending_confirmation, last_delivery_event or "active")` — and on clear.
  Reuses US7's `createPythonProjectionRefresh` seam unchanged.
- **The front door imports every route module statically.** `cli.ts` has no
  lazy `import()`. A `builder/` module that throws at load would kill the
  front door for **every** command, and `MIRROR_TS_BUILD=0` could never reach
  Python because routing never runs. Protocol item 4 is therefore not a test
  to write but a structural change: the Builder route is the first family
  imported lazily, after the routing decision, so the revert survives a
  broken core. A runtime throw inside a TS route bubbles to exit 1 with a
  `front-door.log` ERROR line and no silent Python retry — correct for cursor
  safety (one engine per invocation).
- **Callers bypass the front door.** `.pi/skills/mm-build/SKILL.md` carries
  55 `uv run python -m memory build …` invocations; `.claude` and
  `plugins/mirror-mind` copies carry 1 each (they are short-form); the three
  `mm-explore` copies reference Builder `load` for `promote`; `mm-soul`
  copies mention the `☾ SOUL → BUILDER BOUNDARY`. Additionally,
  `method_inspection.py` renders literal `uv run python -m memory build …`
  strings **inside surfaces** (lines 76, 140), so after the flip the
  Ariad surfaces will still instruct a Python invocation. Parity-bound here;
  a CR once TS owns the family.
- **Reuse.** `util/pythonText.ts`, `util/pyGenerators.ts`
  (`pythonJsonDumps`, `pythonJsonDumpsEnsureAscii`, `newId`, `nowIso`),
  `mode/operatingMode.ts` (`activateOperatingMode`, `getActiveOperatingMode`,
  `MODE_ICONS["Builder Mode"] = "■"`), `mirror/context.ts::loadMirrorContext`,
  `mirror/orchestration.ts::persistStickyDefaults`,
  `mirror/runtimeSession.ts` (`getRuntimeSession`, `upsertRuntimeSession`,
  `resolveRuntimeSessionId`), `conversation/logger.ts::switchConversation`
  with `LoggerDeps`, `search/` + `frontDoor/searchRoute.ts` for the ranked
  memories, `runtime/git.ts::inspectCloneRole`, `providers/transport.ts` +
  `providers/familyProviders.ts`, `explorer/projectionRefresh.ts`,
  `journey/` project-path reads, `frontDoor/args.ts`. There is **no** Builder
  module in TS today and no `■ BUILDER MODE ACTIVE` transition renderer.
- **Oracle corpus.** Python has 341 tests across
  `tests/unit/memory/builder/` and `tests/unit/memory/cli/test_build.py`
  (9,161 lines). They are the scenario source for the goldens — every
  refusal string in `lifecycle.py` (`"delivery cursor is required before
  <event>"`, `"Validation is blocked: pending confirmation …"`, `"Plan
  requires a User Story or Technical Story; expand the Delivery Story
  first"`, …) has a test, and the goldens are generated by driving Python
  through those same scenarios.
- **`cmd_load` reaches into a private.** `memory.skills.mirror._persist_global_sticky_defaults`,
  the same violation US6 and US7 recorded. TS calls `persistStickyDefaults`.
- **Session cadence.** The cursor is at `cadence_profile=stepwise`,
  generation 16, `after_plan` / `navigator_approval`. This plan stops here.

## Decisions Taken At Plan Time (single-owner rule)

**D1 — resolved before Pull: retire.** Amended by correction 2 (twenty
leaves, not fifteen) and correction 3 (the read-only snapshot is ported).

**D2 — cursor authority: all-or-nothing, with a byte contract.** One gate,
`MIRROR_TS_BUILD`, for all 27 leaves; no per-group flip; no interleaving of
engine writes inside one lifecycle by design. The revert is exercised only at
Ariad event boundaries (never mid-command), and its safety rests on two pinned
properties: (a) TS serializes the cursor and adoption rows to Python's exact
bytes, asserted cell-level against goldens and in the both-engine smoke after
every event; (b) every TS cursor write that Python does under CAS is done under
CAS in TS against the same serialized expectation. If (a) cannot be met for
some field, the plan's `plan_rule_conflict` stop fires and D2 is reopened —
the alternative would be a revert that corrupts on first use.

**D3 — load-bearing refusals, each with its own transition-sequence golden.**
From `lifecycle.py`, `delivery_story_plan.py`, `story_plan_preauthorization.py`,
`plan_preauthorization.py`, `delivery_cursor.py`, `flow_unit.py`,
`release_intent.py`, `delivery_story_roadmap_closure.py`, and `cli/build.py`:

1. Missing cursor / missing active item before every event (18 strings).
2. `pending_confirmation` blocks: Validation, Review, Coherence, Done each
   refuse while a foreign confirmation is pending.
3. Plan on a Delivery Story (`expand the Delivery Story first`); Expand on a
   non-DS item; `EXPAND_BLOCKED` on a table that does not parse or a
   duplicate heading code (`StoryPackageAmbiguityError`).
4. `Prepare must be completed before Plan`; Plan approval without a pending
   `after_plan` / `navigator_approval` checkpoint.
5. `check-implementation` guard: blocked vs allowed, including the
   `accelerated` cadence path.
6. Validation: requires approved Plan and completed implementation; requires
   the `--implementation-complete` evidence; blocked on Navigator acceptance;
   E2E `required` without evidence.
7. Debt Review: requires passed Validation; `pending`, `defer` without
   reason/trigger, and `pay_now` all stop; `no_action` and complete `defer`
   proceed.
8. Coherence: requires completed Debt Review; `pending_coherence` reentry
   valid only for the exact `navigator_coherence` state; `done-item` never
   consumes `navigator_coherence`.
9. Done: requires completed Debt Review and Coherence; the three required
   strings; `done_closure_confirmation` when the Navigator has not confirmed
   closure.
10. Preauthorization (story and DS): receipt recorded; `already_consumed`;
    `mismatch` on each of `cursor_generation_changed`, `active_item_changed`,
    `active_item_level_changed`, `flow_unit_changed`, `child_scope_changed`,
    `scope_fingerprint_changed`; Plan completeness (required sections present,
    no empty / `Pending` / TODO / TBD / placeholder body); story
    preauthorization refused outside `story_by_story`; DS preauthorization
    refused with no children; cancel with and without pending authority;
    malformed receipt dropped on read.
11. Cadence: unknown profile; `autonomous` without limits; `continue-lifecycle`
    refusing in `stepwise`; soft-stop bypass vs hard-gate stop under
    `accelerated`/`autonomous`.
12. Flow unit: DS-level Plan without `delivery_story` flow; scope
    confirmation surface.
13. Release intent: `--intent` outside the allowed set; inspection with no
    active DS ancestor; `release_intent` never authorizing.
14. DS closure: `done-delivery-story` preflight naming non-Done files;
    DS-level commands refused under `story_by_story`.
15. CAS conflict: `DeliveryCursorConflict` when the row changed under the
    caller.
16. `load`: journey not found (exit 1); production clone refusal (exit 2)
    with the four-line stderr message; `--ignore-production-role` override
    banner; no `project_path` trailer; the **degraded path** (embedding
    provider fails → FTS-only block, no notice, mode row still written).
17. **Refusals split into two classes by exit code** (panel, QA; measured at
    plateau 1 by driving the real CLI, not read):

    *Class A — argparse, exit 2, usage text on stderr.* A bare `build`; an
    unknown subcommand; a bare `change-request` / `refinement-story`; a
    missing `required` option (`--method`, `--why-now`, `--item-code`,
    `--item-title`, `--item-level`, `--summary`, `--objective`, `--profile`,
    `--title`, `--body`, `--evidence`, `--notes`, `--reason`,
    `--revisit-trigger`, `--target`, `--change-request-id`,
    `--refinement-story-id`); an out-of-set value for an option that
    declares `choices` (`--decision`, `--checks-status`, `--e2e-decision`,
    `--intent`, `--unit`, `--stop-after`); a flag given without its value.
    **Decision:** the recorded-divergence class Explorer established — TS
    refuses the same inputs with exit 2 and a one-line TS message, never
    argparse's usage block (which prints `usage: __main__.py …`, a Python
    program name TS cannot honestly reproduce). One test per argument pins
    the input set and the exit code, not the text.

    *Class B — domain, exit 1, `Error: <message>` on stderr.* Measured
    surprise: `--item-level` and `--method` carry **no** argparse `choices`,
    so an invalid value is refused downstream with Python's exact message —
    `Error: item level must be one of delivery_story, user_story,
    technical_story` and `Error: Builder method 'x' not found. Available
    methods: ariad` — at exit 1, **after** journey resolution (so with no
    journey resolvable, `pull-item --item-level bogus` reports the journey
    error, not the level error). These messages are byte-exact parity
    obligations, unlike Class A. Verified at plateau 1: a Class B refusal
    leaves the cursor untouched (`CV22.DS7.US8 / plan_approved / gen 16`
    before and after).

## Scope

**Module layout (panel, engineer).** One module per Ariad event —
`pull.ts`, `expand.ts`, `prepare.ts`, `plan.ts`, `approve.ts`, `validate.ts`,
`review.ts`, `coherence.ts`, `done.ts` — over a shared `cursorTransitions.ts`,
with renderers in `builder/artifacts/`; never a `lifecycle.ts` that mirrors
argparse's accretion. Python's `object()` "keep" sentinels become a
discriminated type (`{ kind: "keep" } | { kind: "set"; value }`). Goldens
are driven through the public CLI or service functions, never through
`tests/unit/memory/builder/conftest.py` helpers, so the corpus outlives the
Python tests DS10 deletes.

**A. Surface primitives and read-only orientation (`ts/src/builder/`).**
0. Plateau-1 terrain checks: every table `get_workbench_snapshot` reads is
   present in `ts/src/db/schema.ts` (a missing one is a DS6 bootstrap gap,
   stopped as `plan_rule_conflict`); the argparse refusal matrix (D3.17) is
   written down per leaf before any route code exists.
1. `surfaceProtocol.ts` (`wrapAriadSurface` with the exact normalization and
   `rstrip` rule), `card.ts` (`cardText`, `cardWrapped`, `cardPrefixed` with
   the `stripDash` and `emptyRule` switches, `wrapPlainText` with
   `chunkLongWords`), `ribbon.ts` (the three lifecycle ribbons and the
   `_render_progress_ribbon` glyph rules).
2. `methodDefinition.ts` + `ariadMethod.ts`: the method DSL as data, and
   `methodInspection.ts` with the nine `_render_*` sections of
   `render_available_method`, plus `render_journey_method_state`,
   `render_journey_without_adopted_method`, `render_no_active_journey`.
3. `roadmapGrammar.ts`, `storyPaths.ts` (`title_leaf`, `story_folder_name`,
   `resolve_story_directory` by heading code, duplicate detection,
   `create_story_directory`), `roadmapPosition.ts`, `pullCandidates.ts`
   (`inspect_roadmap_snapshot`, `inspect_pull_candidates`, and the three
   wrapped renders), over a **committed synthetic roadmap fixture tree**
   carrying both grammars, a `legacy/` archive, a duplicate heading, 4- and
   5-column candidate tables, a malformed table, Markdown-link cells,
   `/`-chained titles, and every status glyph the parser recognizes.
4. `resumeSurface.ts` + `homeSurface.ts` (`render_builder_resume_surface`,
   `render_builder_orientation_surface`, `render_builder_home_surface`) and
   the filesystem half of the Refinement field
   (`find_canonical_refinement_index`, the hard-coded seed-CR scan,
   `_refinement_snapshot`).

   **Boundary moved at plateau 1 (recorded, not silent):** the DB-backed
   composition — `read_builder_resume_state` and
   `inspect_refinement_field`'s Workbench branch, i.e. the **read-only**
   `get_workbench_snapshot` — moves to **plateau 2**. Reason: it needs
   `get_delivery_cursor` and `get_adopted_method`, and the cursor's reader and
   writer share one serialization. D2's revert argument is precisely that TS
   cursor bytes equal Python's, so reading a plateau ahead of writing would
   split the pair that has to be proven together. What stays here is what is
   pure: the three renderers, graded on synthetic states, and the pure
   allowed-next-actions selection. Same split US7 used (plateau 1 renderers,
   plateau 2 state).
5. `inspect-method` and `pull-candidates` end to end (argument parsing, journey
   resolution through the active operating mode, exit codes, Class A/B
   refusals) — no route wiring. Requires `methodAdoption.ts`, pulled forward
   from Scope B item 6: get/set/clear land together to keep a serializer with
   its parser, but that row is one JSON key with no CAS, no generation, and no
   receipt, so it does not carry the cursor's coupling. Without it plateau 1
   would deliver no observable leaf at all, only internal modules.

   **`check-implementation` moves to plateau 2** (recorded at plateau 1): it
   calls `assert_implementation_allowed`, which reads the delivery cursor and
   inspects `last_delivery_event`, `pending_confirmation`,
   `aggregate_checkpoint_status`, and the DS-plan approval combination. It is a
   cursor consumer, not an orientation leaf, and half-porting it here would
   mean porting the cursor read a plateau early — the same coupling that moved
   `resumeState`.

**B. Method and cursor state.**
6. `methodAdoption.ts` (`get/set/clear_adopted_method`), `deliveryCursor.ts`
   (the dataclass, `get/set/clear`, `_KEEP_*` sentinels, all normalizers,
   `_deserialize_preauthorization` drop rules, `_invalidate_for_coordinate_change`,
   `_projected_active_work`, `_serialize_cursor` to Python's bytes), and
   `compareAndSwapRuntimeSessionMetadata` in `mirror/runtimeSession.ts`.
7. `templateGeneration.ts` (`prepare_method_templates`, preserve-existing
   rule, report) and `adopt`, `prepare-templates`, `sync-cursor` end to end.
8. The projection-refresh call sites in `deliveryCursor.ts`, through US7's
   seam, firing on exactly Python's change set.

**C. Story lifecycle.**
9. `lifecycle.ts` part 1: `pull_lifecycle_item` (levels, `why_now`,
   `delivery_story_identified`), `expand_delivery_story` (candidate-table
   grammar, `expand_decision`, `expand_blocked`, `delivery_story_ready`,
   child materialization with the preservation rule),
   `prepare_lifecycle_item` (`prepare_field_reading` terrain checks),
   `plan_lifecycle_item` (`plan_checkpoint`, story-package materialization:
   `_render_story_index` / `_user_story_index` / `_technical_story_index` /
   `_plan_artifact` / `_test_guide_artifact`, `artifacts_materialized`),
   `approve_plan_checkpoint` (`plan_approved`, `implementation_started`).
10. `planPreauthorization.ts` (`scope_fingerprint` with a sorted-compact
    ASCII JSON canonicalizer added to `pyGenerators.ts`, `canonical_child_scope`,
    `_level_two_sections`, the placeholder regex, `STORY_PLAN_REQUIRED_SECTIONS`)
    and `storyPlanPreauthorization.ts` (record, approve-with, cancel, the four
    surfaces).
11. `pull-item`, `prepare-item`, `plan-item`, `approve-plan`,
    `cancel-plan-preauthorization` end to end, including `plan-item
    --preauthorize-approval` and `approve-plan --use-preauthorization`.

**D. Story closure.**
12. `lifecycle.ts` part 2: `validate_lifecycle_item`, `review_lifecycle_item`,
    `coherence_lifecycle_item` with reentry, `done_lifecycle_item`, and the
    closure artifacts (`validation.md`, `review.md`, `coherence.md`,
    `done.md`); the two CLI-rendered surfaces `debt_review_started` and
    `done_closure_confirmation`; the projection-refresh sites in lifecycle.
13. `validate-item`, `review-item`, `coherence-item`, `done-item` end to
    end with every D3 refusal in groups 6–9.

**E. Delivery Story lifecycle.**
14. `deliveryStoryPlan.ts` (`plan_delivery_story_checkpoint`,
    `approve_delivery_story_plan`, DS preauthorization and cancel, the DS
    artifact renderers, `implementation_started`), `deliveryStoryClosure.ts`
    (validate / review / coherence / done, `delivery_story_closure_checkpoint`),
    `deliveryStoryRoadmapClosure.ts` (`inspect_authored_closure` and the
    `**Status:**` preflight naming project-relative files).
14a. **The preflight owns its own walk** (panel, engineer). Python's
    `inspect_authored_closure` walks `sorted(rglob("index.md"))` with **no
    `legacy/` exclusion**, while `roadmapScan.ts` is defined as that walk
    MINUS `legacy/`. Reusing the scanner would silently let TypeScript close a
    Delivery Story Python refuses. The shared helper takes the exclusion as a
    parameter, or the preflight walks separately; either way a corpus case
    exists whose ONLY blocking evidence is a row under `legacy/`.
14b. Corpus cases the panel named, each pinning a behavior a tidier port would
    "fix": `_replace_status` **moves the replaced entry to the end** of
    `aggregate_checkpoint_status` (so a sequence must reach ≥2 entries and
    replace a MIDDLE one — same set, different bytes, and CAS compares bytes);
    `_ribbon("coherence")` falls through to the **Done** ribbon; `plan.md` is
    **preserved** on both Plan and approval despite
    `_write_delivery_story_package`'s docstring claiming an upsert (the
    docstring is wrong about its own code, and the corpus pins the code); the
    runtime's own `index.md` scaffold is `🟡 Planned`, so DS Done refuses until
    a human edits it.
14c. The DS approval's `DeliveryCursorConflict` recovery needs a write between
    the read and the CAS, which the corpus cannot interpose (panel,
    database-architect). Graded by a TypeScript test with an injected
    conflict, and **declared as corpus-unreachable** in the pending-list
    comment so a green corpus cannot imply it was covered.
15. The six DS leaves end to end, refused under `story_by_story`, plus
    `set-flow-unit` and `cancel-delivery-story-plan-preauthorization` — both
    **pulled forward from Scope F** (panel, engineer). `set-flow-unit` is the
    write side of a module whose read side already exists and is the FIRST step
    of the DS smoke; seeding the flow unit by a raw cursor write instead would
    repeat plateau 3a's lesson that an unrecorded mutation is not replayable.
    The cancel leaf is a wrapper over a function item 14 writes anyway, and
    splitting a module from its only caller across two plateaus is how a
    serializer drifts from its parser.

**F. Cadence, authority, continuation.**
16. `releaseIntent.ts`, `set-cadence` with profiles and limits, and
    `continue-lifecycle` with the soft-stop / hard-gate matrix per cadence and
    its multi-surface output. (`flowUnit.ts`'s write side and the DS
    preauthorization cancel moved to Scope E; what remains here is the part
    with behavior of its own.)

**G. `load` and the provider seam.**
17. `builder/transition.ts` (`render_builder_mode_transition`, the
    `■ BUILDER MODE ACTIVE` card over `mode_transition.py`'s `WIDTH = 56`
    `_box`/`_line`/`_wrap`), `_extract_query` (with its Portuguese section
    names and `[:500]`), the stderr banner bytes, the memories block, the
    `project_path=` / no-project-path trailer.
18. `BUILD_LOAD_TRANSPORT` in `providers/transport.ts`: `revertVar:
    MIRROR_TS_BUILD`, `replay: { llm: MIRROR_TS_BUILD_LLM_REPLAY, embedding:
    MIRROR_TS_BUILD_EMBEDDING_REPLAY }`, live reason `DS7.US8 build load
    live`. Family providers are built **only** for `load`; a test asserts
    `resolveFamilyProviders` is never reached by the other 26 leaves (the
    assertion is on the seam, not on "no call happened"). The route refuses
    by name on an incomplete fixture (CR077 rule). Replay fixtures are
    generated from the demo database only, never from a real home.
18b. **Amended 2026-09-14 after the plateau-7 panel: the transport is
    COMPOSED, not private.** Item 18 was written while replay was still the
    production route for these seams. DS8 changed that: `load` does not own a
    provider seam, it composes two families that are **already live in
    production** — its two embeddings ARE the search family, and its close tail
    IS the conversation-tail family. A private transport would mean
    `MIRROR_TS_SEARCH=0` reverts `memories --search` while `build load` keeps
    calling the same provider: one family, two answers.

    So the route resolves **all three** specs before printing any byte, and
    falls back to Python unless all three agree — `MIRROR_TS_BUILD=0`,
    `MIRROR_TS_SEARCH=0`, or `MIRROR_TS_CONVERSATION_LLM_TAIL=0` each send the
    whole command to Python. `BUILD_LOAD_TRANSPORT` survives as the family's
    own kill switch and as the owner of `load`'s replay fixtures, not as a
    replacement for the other two. This is D2's own argument applied one level
    down: a half-flipped session start cannot be reviewed.

    The decision is resolved **before the banner**, because `load` prints four
    surfaces before it reaches a provider and a fallback decided later would
    duplicate all of them.
18a. The `load` corpus carries the degraded scenario (provider failure →
    FTS-only block, identical rows, mode row written, degraded kind in the
    front-door log as metadata) and the ledger scenario (two embedding rows
    for the two searches plus the close-tail rows, count/role/bodies-withheld
    equal to Python's).
18c. **Degraded visibility stays a CR, not a liberty** (panel, ai-engineer).
    A degraded `load` renders a card indistinguishable from a healthy one, in
    the surface whose whole job is orienting a human about to choose a day's
    work. Reproduced as Python behaves and captured as a CR, so marking it
    lands as a product decision after the flip rather than as a change made
    inside a port.
18d. **Cost per `load` is measured before the flip** (panel, ai-engineer).
    `build load` is the only command in this story whose spend is scheduled by
    how often a human opens Builder Mode rather than by what they asked for,
    and after the flip its ledger cost becomes Mirror's per-session floor.
    Record count, role, and measured cost from `llm_calls` for one real `load`
    in the ledger entry, and attach that number to the double-embedding CR
    instead of describing it as a curiosity.
18e. **`log_access` makes `load` a mutating read** (panel,
    database-architect). It bumps `access_count` / `last_accessed_at` on the
    six returned memories, and the ranker's reinforcement term reads them — so
    a second `load` against the same database legitimately returns a different
    order. Grading rule for every artifact in this plateau: **one `load` per
    database copy**, or replay with a frozen clock and frozen scores. A smoke
    that runs `load` twice in one world and expects identical output is flaky
    for a correct reason.
19. `runBuildLoad` composition: identity read → clone-role guard
    (`inspectCloneRole`) → banner → transition → adopted-method branch (home +
    roadmap + candidates, or resume) → `loadMirrorContext(persona=engineer)`
    → two searches with access logging → merge/dedupe/sort/top-6 → memories
    block → `persistStickyDefaults` → `activateOperatingMode("Builder Mode")`
    → `switchConversation(persona=engineer, journey)` with `LoggerDeps` →
    trailer. Under backup-gated live write like every other TS write.
20. `explore story promote` tail: `exploreRoute.ts` calls `runBuildLoad` and
    `promote` joins `TS_EXPLORE_STORY_ACTIONS`.

**H. Front door, evidence, flip.**
21. `frontDoor/buildRoute.ts` imported **lazily** from `dispatchTs` after the
    routing decision; `routing.ts` gains the `build` entry with a two-level
    allowlist — `TS_BUILD_SUBCOMMANDS` (27 names) and, for `refinement-story`
    and `change-request`, an explicit refusal naming DS10 retirement for all
    20 actions — and `buildGateEnabled` defaulting **off** until the flip.
    The front-door log line carries `leaf=<subcommand>` (content-free) and,
    for `load`, `calls=N`.
21a. Path confinement matrix (panel, security): `--item-code "../../x"`,
    `--item-title "/etc/passwd"`, a title that is only `/`, and an empty
    leaf after `title_leaf`, through `create_story_directory`,
    `prepare_method_templates`, and DS child materialization, on both
    engines: nothing is written outside `docs/project/roadmap/`. Python's
    behavior is the contract; the port must not broaden it.
22. Goldens generated from Python, joining the determinism gate under 3.10
    and 3.12. **Command-level goldens run the real CLI in a SUBPROCESS**, one
    per case: `memory.config` resolves `DB_PATH` once at import, so an
    in-process oracle silently reuses the first case's database (measured at
    plateau 1 — fifteen correctly seeded cases recorded `journey not found`),
    and only a subprocess grades `print()` semantics, the stream split, and the
    exit code as a shell sees them. The corpora: (i) a **surface corpus** for every wrapped and unwrapped render
    × empty/absent optionals × over-long tokens × CJK, combining marks, NBSP,
    ideographic space × the `body`-vs-`body + "\n"` call-site split; (ii) a
    **cursor transition corpus** graded as ordered sequences of serialized
    metadata bytes for the full lifecycle, for every D3 refusal, for each
    receipt invalidation reason, and for CAS conflict; (iii) a **roadmap
    parsing corpus** over the fixture tree; (iv) an **artifact corpus**
    grading files written into a scratch project, byte for byte, including
    the preservation rule, folder derivation, and the DS Done preflight; (v)
    a **`load` corpus** under replay fixtures covering the sixteen `load`
    scenarios in D3.16 plus adopted/unadopted × active-item/none ×
    canonical-index/legacy-Workbench × previous-conversation/none.
23. Real-DB-copy write probes: `builder_cursor_state` (transition sequence
    across a whole lifecycle on the copy), `builder_artifacts` (scratch
    project), `builder_load` (replay). A both-engine **Ariad lifecycle smoke**
    on a disposable home and scratch project: adopt → prepare-templates →
    sync-cursor → load → pull-candidates → pull-item → prepare-item →
    plan-item → check-implementation → approve-plan → validate-item →
    review-item → coherence-item → done-item → load, asserting stdout,
    stderr, exit code, the cursor row bytes after every step, the written
    artifacts, and the published `operational.json` (never a log line), with
    **no gate in the environment**. A second run exercises the DS flow
    (set-flow-unit → pull-item as a Delivery Story with Expand →
    plan-delivery-story → approve → validate → review → done-delivery-story
    REFUSED by the authored preflight → a graded edit → done-delivery-story)
    and a third the preauthorization and cadence paths.
23a. The DS smoke needs a step type the harness does not have: an **edit
    between two commands**, flipping authored `**Status:**` lines so the second
    `done-delivery-story` succeeds (panel, devops). It is a first-class
    recorded step — declared, applied identically to both worlds, and graded
    like any other (the file comparison after it proves the edit landed the
    same way), never a `writeFileSync` slipped between two invocations. Its
    receipt delta must be **zero** on both sides: an authored edit is not a
    cursor write. Expect the smoke to roughly double in wall time (~10s →
    ~20s) because every DS write spawns the projection seam; recorded here so a
    later "CI is slow" does not begin by deleting the smoke.
24. Front-door redaction check: `build` argv carries `--why-now`,
    `--objective`, `--summary`, `--evidence`, `--debt`, `--limit`, `--child`,
    review and validation prose; a test asserts none of it reaches
    `front-door.log`. **Plus a `load` case** (panel, security): `load` takes no
    prose argument, but it DERIVES its query from the journey briefing — the
    Navigator's own words, up to 500 code points, sent to an embedding provider
    on every session start. The case seeds a recognizable sentinel in the
    briefing and asserts it never reaches the log; `leaf=` and `calls=` do. `--child` is nominally a work-item code and practically
    whatever the Navigator typed (panel, security), so the list is complete
    here rather than remembered at plateau 8.
25. The **broken-core revert drill**: a Node loader hook
    (`NODE_OPTIONS=--import=<hook>` registering a resolver that answers
    `#builder/index.ts` with a throwing module — no copy of the checkout, no
    edit) under which `node cli.ts build inspect-method ariad` with
    `MIRROR_TS_BUILD=0` reaches Python, and, with the gate absent, `soul
    load`, `explore load`, and `welcome` still answer from TS.
25a. Regression in the flip checklist: `conversation_lifecycle_smoke.ts`,
    the Explorer smoke, and `welcome --status-line` after a `load` (it reads
    the operating-mode row `load` writes), all green before the gate moves.
    Refusals are exercised through the process boundary in the smokes —
    exit code and stderr as the shell sees them — not only as thrown errors.
26. Oracle registration in `ts/parity/oracle-baseline.json` of
    `cli/build.py`, every in-scope `builder/*.py`, and
    `surfaces/mode_transition.py`; generators in `tests.yml`.
27. Flip: gate default on; all three `mm-build` skill copies to the front
    door (55 + 1 + 1 invocations); the three `mm-explore` copies' `promote`
    note; ledger per-leaf table and flip checklist; US7's `promote` row
    updated; index, ledger, and DS10 corrected to twenty Workbench leaves.

## Non-Goals

- **No Ariad semantics change.** No new stage, no cadence change, no surface
  text change — including the literal `uv run python -m memory build …`
  strings rendered inside surfaces, the `"/"`-chain title convention that
  split this story's own title, the `release_intent` overflow, and every
  refusal string. Each is reproduced; each that is wrong is a CR.
- **No Workbench leaf port.** The twenty mutating leaves are refused by name
  to Python until DS10 deletes them. Only the read snapshot for resume/home
  surfaces is ported.
- **No projection publisher port.** TS calls US7's Python seam. Nothing in
  TS writes under `.mirror/projections`.
- **No `switch_conversation` or search re-port.** `load` composes the existing
  TS close tail and TS search; if either needs a change to compose, that is a
  `scope_change_detected` stop, not a ride-along.
- **No generalization of lazy route loading.** Only `build` is imported
  lazily here; the pre-existing weakness for every other family is recorded
  as a CR, not paid.
- **No CR071 payment.** Three `mm-build` copies are updated, not
  deduplicated — the fourth story to pay it.
- **No MCP, web, rename, npm, Python deletion** (DS9, DS10).
- **No live-provider change.** `load` reuses DS8's provider substrate and
  ledger hooks as is.

## Acceptance Behavior

```text
Given the synthetic roadmap fixture tree and a fresh adopted journey
When `build pull-candidates --method ariad --journey <j>` runs in TS
Then ROADMAP_SNAPSHOT and PULL_CANDIDATES equal Python's byte for byte,
  including markers, ribbons, section headers, and the trailing-newline rule

Given the surface corpus (every render × absent optionals × over-long tokens
  × CJK, combining marks, NBSP, ideographic space)
When each surface renders in TS
Then every line equals Python's — truncation at 54, padding, chunked vs
  unchunked long words, `- ` stripping, and the `none` rules included

Given a journey with no cursor
When any lifecycle leaf runs
Then TS prints Python's exact `Error: delivery cursor is required before
  <event>` line on stderr and exits 1, and writes nothing

Given the full story lifecycle driven on a database copy
When each of pull → prepare → plan → approve → validate → review → coherence
  → done runs in TS
Then the sequence of serialized cursor metadata bytes after each step equals
  Python's sequence, generation by generation, receipt by receipt

Given a pending story preauthorization receipt
When the active item, level, flow unit, generation, child scope, or scope
  fingerprint changes
Then the receipt is invalidated with Python's reason string, and
  `approve-plan --use-preauthorization` renders PLAN_PREAUTHORIZATION_MISMATCH

Given a plan.md with a required section whose body is `Pending`
When `approve-plan --use-preauthorization` runs
Then TS refuses exactly as Python does and the receipt stays pending

Given a cursor row changed between read and write
When TS performs the CAS write
Then it raises the DeliveryCursorConflict path with Python's message

Given a Delivery Story whose index has a `| Family | Scope | Type | Risk |`
  table
When `pull-item --item-level delivery_story` runs
Then EXPAND_BLOCKED renders identically and no child package is written

Given an authored story package with a hand-written plan.md
When `plan-item` runs
Then plan.md and index.md bytes are untouched and only missing artifacts are
  created, matching Python's ARTIFACTS_MATERIALIZED markers

Given a DS with one child package still `🟡 Planned`
When `done-delivery-story` runs
Then the preflight names that project-relative file and the cursor is not
  mutated

Given a disposable home with a previous conversation on the session
When `build load <journey> --session-id <s>` runs under replay fixtures
Then stdout and stderr equal Python's byte for byte — banner, transition,
  resume or home surfaces, mirror context, six ranked memories, trailer — and
  the previous conversation is closed with the same extraction rows, the
  operating-mode row, sticky defaults, and the new conversation match

Given `build load` on a project with no canonical refinement index
When it renders the resume surface
Then the 🧰 Refinement field is read from the SQLite Workbench snapshot and
  equals Python's

Given a production-marked clone
When `build load` runs without `--ignore-production-role`
Then the four-line refusal reaches stderr and the exit code is 2

Given `build change-request capture …` or `build refinement-story review …`
When it runs through the front door
Then it is refused to Python by name with a reason naming DS10 retirement

Given `MIRROR_TS_BUILD=0`
When any of the 27 leaves runs
Then Python answers with identical output and the front-door log says python

Given `ts/src/builder/index.ts` throws at import
When `MIRROR_TS_BUILD=0 build inspect-method ariad` runs
Then Python answers; and `soul load`, `explore load`, `welcome` still answer
  from TS

Given a live Pi Builder session after the flip
When `/mm-build <slug>` runs and a story is pulled, planned, and approved
Then every surface renders as before and front-door.log shows `build ts`
  with no `fell_back` and no argument text
```

## Parity Contract And Known Divergence Classes (pinned by golden)

- **Card text.** `text[:54]` then `:<54` pad are code-point operations;
  `text.split()` is Python whitespace. Astral-plane emoji (`🟪`, `🟦`, `🧰`,
  `✎`) appear in every card title and count as one code point each; the
  goldens pin them, plus combining marks, NBSP, and ideographic space.
- **Two wrapping behaviors.** Chunked (eight modules) vs unchunked
  (`release_intent`) for tokens longer than the width, with the silent
  truncation that follows the unchunked one. One TS function, one flag,
  pinned in both modes.
- **`_card_prefixed` variants.** `"- "` stripping in DS closure; the
  `none`-on-empty-input vs `none`-on-empty-output rule.
- **Wrapper newline rule.** `wrap_ariad_surface` `rstrip()`s; call sites
  differ in whether they append `"\n"`; the result is identical, and the
  golden proves TS does not double-strip or double-append.
- **JSON bytes.** Cursor and adoption metadata: `ensure_ascii=False`,
  Python default separators, dataclass field order, `null` for `None`,
  arrays for tuples, integers for `cursor_generation` (never `16.0`),
  nested receipt dict order. Fingerprint payload: `ensure_ascii=True`,
  compact separators, sorted keys. Both asserted as strings.
- **Receipt drop rules.** Malformed receipts read as absent (booleans where
  ints are expected, negative generation, DS receipt without children, bad
  status); pinned per field.
- **Regex dialect in the roadmap grammar.** `HEADING_RE` with `[—-]`,
  `STATUS_RE` with `.+?` and `re.MULTILINE`, the placeholder regex with
  inline case-insensitivity, the candidate-table header matcher. Ported as
  explicit patterns; corpus rows for the em dash vs hyphen, a title with a
  trailing space, a status with Markdown emphasis.
- **Timestamps and ids.** `_now()` and `_uuid()` injected as in US6/US7 so
  the cursor rows and conversation rows are deterministic.
- **Absolute paths are machine-dependent golden content.** Several Builder
  messages name filesystem paths — `StoryPackageAmbiguityError` lists the
  claiming packages, the DS Done preflight names non-Done files, and the
  artifact surfaces print package paths. A golden that records them raw is
  byte-stable on one machine and wrong on every other, which a
  regenerate-twice check on one machine cannot detect (found in CI at plateau
  1, after local determinism passed). **Rule for every generator in this
  story:** redact the fixture/project root to a stable token, apply the same
  substitution in the TS test so the message shape stays fully graded, and fail
  the generator if any absolute path survives into the payload. Plateau 3's
  artifact corpus and plateau 5's closure preflight carry the most exposure.
- **stderr.** Banner ANSI bytes (`\033[38;5;117m…\033[0m`), the override
  banner, and error lines are graded as bytes; exit codes are graded.
- **Argument acceptance.** Python refuses `--mirror-home` on `build` with
  argparse's exit 2 where the TS front door accepts it — the same recorded
  divergence Soul and Explorer carry.
- **Ordered list cells in the cursor.** `aggregate_checkpoint_status` and
  `child_work_items` enter the byte contract at plateau 5.
  `_replace_status` removes every `checkpoint:*` entry and APPENDS the new
  one, so two engines can hold the same set and different bytes — and
  compare-and-swap compares bytes, not sets. Pinned by sequences that replace
  a middle entry.
- **The DS Done preflight's path escape.** `_relative()` calls
  `resolve().relative_to(project_root)` and RAISES when a roadmap file
  resolves outside the project (a symlinked package). Python's CLI catches the
  `ValueError` and prints the interpreter's own prose
  (`'…' is not in the subpath of '…'`). **Recorded divergence, not
  reproduced** (panel, security): TypeScript says what happened in its own
  words rather than copying CPython's error text. Confinement itself is
  already proven by the plateau-3 path matrix.

## Validation Route

Automated: the five golden corpora under the determinism gate (3.10 and 3.12,
`TZ=UTC`, offline); unit tests for every D3 refusal group; the CAS conflict
test; the receipt matrix; the two-level allowlist including the twenty
named Workbench refusals; the redaction test; the broken-core drill; the
three real-DB-copy probes; the three Ariad lifecycle smokes through both
engines with no gate in the environment; `.pi` typecheck; oracle
registration.

Navigator route (real home, in this order):
1. **Read-only, both engines, byte-diffed:** `inspect-method ariad`,
   `inspect-method --journey mirror-ts-core`, `pull-candidates --method ariad
   --journey mirror-ts-core`, `check-implementation --method ariad --journey
   mirror-ts-core`. Expected: identical.
2. **`load` on a disposable session id, on two fresh copies of the real
   database — one per engine** (panel, database-architect: `log_access=True`
   bumps `access_count` on the returned memories, and the ranker's
   reinforcement term would reorder the block for whichever engine runs
   second on a shared database). Expected: identical banner, transition,
   resume surface, context, trailer, and the same six entries in the ranked
   block; byte parity of the block itself is proven under replay in step 3.
3. **A full lifecycle on a copy of the real database and a scratch clone of
   this repository**, both engines, cursor bytes diffed after every step.
   Expected: diff-clean.
4. **The self-hosting closure.** After Validation is accepted: `backup`,
   then the **restore drill** — the dated zip restored into a scratch home
   and `build load` run against it (a backup that has never been restored is
   a belief) — then this story's own `review-item`, `coherence-item`, and
   `done-item` run through the **TS front door**, each first dry-run on a
   copy against Python and diffed. Expected: identical cursor bytes and surfaces; the
   real cursor advances on TS. This is the "complete lifecycle executed on
   TS, indistinguishable to the Navigator" done condition, and it is the
   only time the story depends on the code under test — deliberately, after
   the code is proven.
5. **A live Pi Builder session after the flip:** `/mm-build mirror-ts-core`,
   `pull-candidates`, and one Workbench command refused by name. Expected:
   unchanged experience; `front-door.log` shows `build ts`, no `fell_back`,
   no argument text; the Workbench line says python.
6. **Revert:** `MIRROR_TS_BUILD=0` on `pull-candidates`. Expected: identical
   output, Python in the log. Then the broken-core drill output from CI,
   reviewed.

Pass: 1, 3, 6 identical; 2 identical outside the ranked block and same six
entries inside it; 4 diff-clean on the copy and the real cursor advancing; 5
unchanged with `build ts` in the log. Fail: any surface difference, any
cursor-byte difference at any step, any `fell_back`, any argument text in the
log, any TS answer for a Workbench leaf, any Python answer for an in-scope
leaf with the gate absent.

E2E decision: **required** — Builder is a lived mode and the self-hosting
property is only observable by running the story's own lifecycle on the
ported engine.

## Implementation Contract

Plateaus, one commit each, each ending resumable with its state written into
this package or the ledger; nothing routes until plateau 8, and the gate
defaults off until the flip:

1. **Primitives and orientation.** Scope A. Surface corpus part one, roadmap
   parsing corpus, the fixture tree. Docs commit correcting the Workbench
   count in the index, the ledger, and DS10.
2. **Method and cursor state.** Scope B. Cursor transition corpus part one
   (adopt, sync, receipt invalidation, drop rules, CAS conflict), the
   `builder_cursor_state` probe.
3. **Story lifecycle.** Scope C. Artifact corpus, transition corpus part
   two, the `builder_artifacts` probe.
4. **Story closure.** Scope D. Transition corpus part three, the story
   lifecycle smoke (unrouted, calling the TS module directly).
5. **Delivery Story lifecycle.** Scope E — the six DS leaves plus
   `set-flow-unit` and `cancel-delivery-story-plan-preauthorization`,
   re-sequenced from F after the plateau-5 panel. Transition corpus part four
   (aggregate status as ordered bytes), the authored-closure preflight corpus,
   the DS smoke with its graded edit step.
6. **Cadence and authority.** Scope F. The preauthorization/cadence smoke;
   `continue-lifecycle`'s multi-surface ordering.
7. **`load` and the provider seam.** Scope G. The `load` corpus under
   replay, the `builder_load` probe, the `promote` tail.
8. **Front door, gate off.** Scope H items 21–26. Lazy route import, the
   two-level allowlist, redaction, the broken-core drill, oracle
   registration, CI entries, ledger pre-flip entry.
9. **Flip.** Scope H item 27 — the gate predicate, the three skill copies,
   and the ledger, nothing else, so reverting the commit is as clean as
   setting the variable — after Navigator validation steps 1–3 and 6, and
   before step 4 (the self-hosting closure runs on the flipped route).

Rules: `uv run` for Python commands and tests; the golden is generated from
Python before the TS implementation exists; the Python corpus scenarios are
taken from the 341 existing tests, not invented; no `git add .`; commits
scoped to the story; descriptive English commit messages explaining why.

Self-hosting protocol, applied where it bites: this story's own Ariad
lifecycle is driven through `uv run python -m memory build …` (Python by
construction, no gate needed) through plateau 8. From plateau 9 the skill
invokes the front door; the story's remaining events run with a fresh
`backup` before each and follow validation step 4.

## Persona Review (plan stage — full panel plus ai-engineer, since `load` crosses the provider seam)

**Synthesis.** The plan is sound where it is most likely to be wrong: it read
the seam from source and found that `load` spends money and closes
conversations, that the Workbench is twenty leaves, and that the revert is a
byte contract rather than a gate. Risk concentrates in three places — the
cursor byte contract (D2 rests on it), the filesystem writes into the user's
project (the only US8 surface with a traversal shape), and the self-hosting
closure, which is the one moment the story depends on the code under test.
For it to succeed, the ordered-sequence goldens must grade the whole
`runtime_sessions` row and not only `metadata`, argparse-level refusals must
be classified before plateau 1 rather than discovered at the front door, and
validation step 2 must not let one engine's access-count writes poison the
other's ranking.

**◇ engineer** — Do not ship a `lifecycle.ts` "part 1 / part 2". The plateau
split is a delivery order, not a module boundary; `lifecycle.py` is 2,303
lines because argparse dispatch grew there, and reproducing that shape
imports the cohesion debt with the behavior. One module per Ariad event
(`pull.ts`, `expand.ts`, `prepare.ts`, `plan.ts`, `approve.ts`,
`validate.ts`, `review.ts`, `coherence.ts`, `done.ts`) over a shared
`cursorTransitions.ts`, with the artifact renderers in `artifacts/`. Second:
the `_KEEP_PREAUTHORIZATION` / `_KEEP_RELEASE_INTENT` `object()` sentinels
are a Python idiom for "argument absent"; in TS that is a type —
`{ kind: "keep" } | { kind: "set"; value: … }` — not a module-level symbol
compared by identity. Types are design here because the whole D2 argument is
about which fields a write touches. Third: the goldens are to be driven
through the public CLI or service functions, never by importing
`tests/unit/memory/builder/conftest.py` helpers into a generator — the corpus
must survive the Python tests being deleted in DS10.

**◇ quality-assurance** — The critical journey is validation step 4, and it is
covered. The gap is a refusal class D3 does not list: **argparse's own
refusals**. `--decision`, `--checks-status`, `--e2e-decision`, `--intent`,
`--unit`, and `--stop-after` carry `choices`; `--method`, `--why-now`,
`--item-code`, `--summary`, `--objective`, and others are `required`; a bare
`build` with no subcommand is an error. Python answers all of these with
argparse usage text on stderr and exit 2. Explorer classified `--mirror-home`
as a recorded divergence and `usageError()` returns 2 with a TS message;
that is the right precedent, but it must be **decided per argument before
plateau 1** and pinned as a class (same inputs, same exit code, TS message),
not found leaf by leaf at plateau 8. Second: the smokes must exercise refusals
**through the process boundary** — exit codes and stderr as the shell sees
them — not only as thrown errors in module tests, because `dispatch` turns a
throw into exit 1 plus a log line, and the story's own agent reads exit codes.
Third: regression is not optional for this family — `load` now calls
`switchConversation` and `promote` moves out of Python — so the existing
`conversation_lifecycle_smoke.ts`, the Explorer smoke, and `welcome
--status-line` (which reads the operating-mode row `load` writes) run in the
flip checklist, green, before the gate moves.

**◇ database-architect** — Grade the **row**, not the `metadata` cell.
`upsert_runtime_session` writes `interface="builder_delivery_cursor"`,
`journey`, `active`, `closed_at`, `updated_at`, and `metadata`; a Python read
after a revert sees all of them, and `get_delivery_cursor` refuses a row with
`active=0`. The transition corpus must compare the full column set with
timestamps injected, or a TS write that gets `metadata` right and `interface`
wrong passes the golden and fails the revert. Second: `set_delivery_cursor`
reads `previous` then writes — a read-then-upsert with no transaction on the
non-CAS path. Python's window is the contract; TS does the read and the write
inside one transaction and does not widen it, the same rule US7 applied to
the Explorer upsert. Third: validation step 2 on the real home is
self-defeating as written. `load`'s search runs with `log_access=True`, so
the first engine bumps `access_count` on the six memories it returns, and
the ranker's reinforcement term then reorders the block for the second
engine. Run step 2 on two fresh copies of the real database, one per engine,
or accept that the ranked block cannot be compared live at all. Fourth:
confirm at plateau 1 that every table `get_workbench_snapshot` reads is in
`ts/src/db/schema.ts` — DS6 custodied the schema, but the Workbench tables
have had no TS reader until now, and a missing one is a bootstrap gap, not a
port gap.

**◇ devops-engineer** — A backup that has never been restored is a belief.
Before validation step 4 touches the real cursor on TS, restore the dated zip
into a scratch home and run `build load` against it; that is the restore
drill, and it costs five minutes. Second: the broken-core drill as written
copies the TS tree and edits a file — brittle in CI and slow. Prefer a
Node loader hook (`NODE_OPTIONS=--import=<hook>` registering a resolver that
answers `#builder/index.ts` with a throwing module) so the drill injects the
failure without touching the checkout; the assertion stays the same. Third:
`front-door.log` should carry `leaf=<subcommand>` for `build` (content-free,
like `calls=N` for `descriptor`), because "`build ts exit=1`" across 27
leaves is not a diagnosable line for the tired human this log exists for.
Fourth: the flip commit is the gate predicate, the three skill copies, and
the ledger — nothing else — so reverting the commit is as clean as setting
the variable.

**◇ security-engineer** — Two corrections and one control. Correction one:
the index says authority receipts "must not be reconstructible". They are
reconstructible by design — `scope_fingerprint` is SHA-256 over public
coordinates with no secret — and the property that matters is **binding**:
single-use, generation-bound, coordinate-bound, status-gated. State it that
way in the plan so nobody adds an HMAC "for parity" or, worse, decides the
TS port may skip the fingerprint because it is "just a hash". Correction
two: the plan says only `load` constructs a provider; make it a test, as US4
did for the deterministic `mirror load` — the other 26 leaves must never
resolve a key, and the assertion is that `resolveFamilyProviders` is not
reached, not that no call was made. The control: `create_story_directory`,
`prepare_method_templates`, and the DS child materialization derive paths
under the user's project from `--item-code` and `--item-title`, both
caller-supplied. `_sanitize_code_segment` and `title_leaf` exist; pin that
`../`, an absolute segment, and a title that is only `/` cannot escape
`docs/project/roadmap/`, on both engines — Python's behavior is the contract,
but the port must not broaden it. Also: replay fixtures for the `load`
corpus are generated from the demo database only; a fixture generated from a
real home carries real memory content into the repository.

**◇ ai-engineer** — `load` is a model-backed leaf and the plan now treats it
as one; two scenarios are still missing from the `load` corpus. First, the
**degraded path**: `search_with_status` catches the embedding failure and
falls back to FTS-only, silently, and `cmd_load` uses `search`, which drops
the status — so on a provider outage Python still activates Builder Mode
with a lexically ranked block and no notice. TS `memorySearch.ts` has the
degraded path; pin that `load` reaches it, that the block is identical, that
the mode row is written, and that the front-door log records the degraded
kind as metadata. Second, the **ledger**: one `build load` writes two
embedding rows to `llm_calls` (same query, scoped and global) plus the
previous conversation's close-tail rows through DS8's hook; pin count, role,
and bodies-withheld against Python, because that ledger is the only cost
record the product has. The double embedding is parity-bound; record the CR
and do not "optimize" it inside the port.

**Consolidated: proceed with amendments.** Blocking inputs before plateau 1:
the argparse refusal classification; full-row transition goldens with
injected timestamps; the Workbench-table schema check; per-event module
layout; the sentinel-as-type rule. Before plateau 7: the degraded-`load` and
ledger scenarios; the provider-isolation test for the 26 other leaves; the
path-confinement matrix. Before the flip: the restore drill, the regression
smokes in the checklist, `leaf=` in the log, the two-copies rule for
validation step 2, and the loader-hook shape for the broken-core drill.

## Persona Review — Plateau 5 (Scope E, before implementation)

Run 2026-09-14 against a QA-drafted slice plan for the Delivery Story
lifecycle, per the collaboration strategy's standing rule that every story
above a small slice gets a Plan-stage panel. Four lenses dissented; the design
and model-in-the-loop lenses stayed silent, correctly — this plateau changes no
Navigator-facing semantics and makes no model call.

- **engineer** — the preflight's walk is *almost* `roadmapScan.ts` and differs
  on the one thing that decides a refusal (`legacy/`); and the Implementation
  Contract had `set-flow-unit` in plateau 6 while the plateau-5 smoke opens
  with it. Both resolved in Scope E above (items 14a, 15). Also: pin the
  coherence ribbon's fall-through before porting it.
- **database-architect** — ordered list cells enter the byte contract here, and
  `_replace_status` is move-to-end; the story-level corpus never exercised
  `aggregate_checkpoint_status` at all. Resolved by item 14b. The DS approval's
  CAS-conflict recovery is corpus-unreachable and must be declared, not implied
  (item 14c).
- **devops-engineer** — the DS smoke needs a graded edit step between two
  `done-delivery-story` calls, with a zero receipt delta, and the smoke's wall
  time roughly doubles. Resolved by item 23a.
- **security-engineer** — `--child` was missing from the plateau-8 redaction
  list (item 24, corrected), and the preflight's symlink escape should be a
  recorded divergence rather than a copied CPython message (Parity Contract).

No dissent argued for changing Ariad semantics, and none was accepted that
would have: every amendment above is about what the corpus GRADES and in which
plateau the work lands.

## Persona Review — Plateau 7 (Scope G, before implementation)

Run 2026-09-14 against a QA-drafted slice plan for `load` and the provider seam.
Five lenses dissented, including ai-engineer, which stayed silent at plateau 5 and
speaks here because this is the only `build` leaf that crosses the model.

- **engineer** — item 18's private transport predates DS8. `load` composes two
  families that are already live, so a private gate makes `MIRROR_TS_SEARCH=0`
  mean two different things in two commands. Resolved by item 18b: a composed
  decision over three revert variables, taken before the first byte.
- **ai-engineer** — `load` spends on a schedule set by how often a human opens
  Builder Mode, and nobody has measured it (item 18d); and the degraded card is
  indistinguishable from the healthy one in the surface whose job is orientation
  (item 18c, reproduced and captured as a CR).
- **database-architect** — `log_access` makes this read mutate the ranking inputs,
  so "run it twice, expect the same block" is wrong by construction (item 18e).
- **devops-engineer** — four surfaces print before the first provider call, so an
  outage leaves a half-written session; reproduce Python's ordering and pin it
  with an injected provider failure rather than discovering it during an incident.
- **security-engineer** — the query is the Navigator's own briefing prose; the
  plateau-8 redaction case must carry a `load` sentinel (item 24).

Navigator decisions taken the same day: **compose the revert** (a half-flipped
session start cannot be reviewed) and **reproduce degraded rendering, capture the
CR** (marking it is a product change that belongs after the flip).

## Persona Review — Plateau 8 (handoff, after automated validation)

Run 2026-09-14 against the delivered route, before Navigator validation.
Three lenses dissented; database-architect, security-engineer, and ai-engineer
converged with no objection.

- **engineer** — three readers of one token grammar (`buildRoute.ts`'s
  `positional`/`optionValue`, and two closures in `argv.ts` whose read-only
  variant repeats three switch arms verbatim). DRY debt, graded by the corpus,
  but the class that drifts when a leaf grows an option. Also
  `test/helpers/builderInvoke.ts` is now a pure re-export shim. Both carried to
  Debt Review below.
- **quality-assurance** — argparse accepts `--method=ariad` and unambiguous
  abbreviations (`allow_abbrev` defaults on); `validateBuilderArgv` exits 2 on
  both. No skill or doc uses either form, so this is the recorded-divergence
  class Explorer set for `--mirror-home` — but it must be **recorded and pinned**
  before plateau 9, not found as a "regression" after the flip. Added to the
  divergence candidates below.
- **devops-engineer** — `builder_lifecycle_smoke.ts` sets
  `MIRROR_TS_BUILD=1` in the child environment. Plateau 9 must delete that line
  so the smoke proves the shipped default, as the `backup` smoke does. Added to
  the plateau-9 steps.

Release read: **ready for Navigator validation with one named divergence.**

## Debt / CRs To Capture At Debt Review (candidates)

- **TS `build` argv grammar is narrower than argparse's.** `--opt=value` and
  unambiguous long-option abbreviations succeed in Python and exit 2 in TS.
  Same divergence class as `--mirror-home` (which goes the other way). Decide
  once, pin with a test on the input set and exit code, record in the
  divergence table. (Plateau-8 panel, quality-assurance.)
- **Three readers of the Builder token grammar** — `buildRoute.ts` helpers plus
  two closures in `argv.ts`; the read-only invoker repeats three switch arms.
  Extract one token module and one arm table. `test/helpers/builderInvoke.ts` is
  a pure re-export shim after plateau 8; repoint or justify. (Plateau-8 panel,
  engineer.)

- **Exactly tied search scores are ordered differently by the two engines.** Found
  at plateau 7 while building a `load` case with symmetric embeddings: three
  candidates scored identically to six decimals, and Python emitted them in one
  order while TypeScript emitted another — numpy's `argmax` and the TypeScript
  selection loop break an MMR tie differently. It belongs to the SEARCH family
  (`memories --search` has the same ranker), not to `load`, and the DS2 corpus
  never exercised an exact tie. Not pinned by a US8 case, because a case
  engineered to provoke a tie would be describing the test rather than the
  product; recorded here so the search owner can decide whether ties should be
  broken deterministically (by id, say) in both engines.
- **`load`'s ordering depends on a live clock.** The ranker's recency term reads
  `now`, so two candidates whose scores differ in the sixth decimal can swap
  between one run and the next. Harmless for real corpora, fatal for a golden: it
  made a plateau-7 case pass alone and fail inside the suite, where the elapsed
  time differed. Corpus cases must keep scores off the knife edge — recorded as a
  harness rule in the handoff, and as a CR here because a Navigator comparing two
  sessions sees the same instability.
- **A degraded `load` is indistinguishable from a healthy one — and usually
  empty.** When the provider fails, the memories block falls back to FTS-only and
  renders in a card with no marker, in the one surface a Navigator reads to decide
  what to work on. Measured at plateau 7, it is worse than "differently ordered":
  `_fts_query` ANDs every whitespace word of the query, and `load`'s query is a
  briefing paragraph cut at 500 code points, so on a real journey the AND matches
  nothing and the block DISAPPEARS. A Navigator opening Builder Mode during an
  outage sees a session start with no memories and no reason given, on a machine
  whose corpus is full. Both shapes are recorded
  (`load_lexical_offline` ranks lexically, `load_degraded_briefing_query` renders
  nothing); reproduced rather than fixed, because marking it is a product change.
- **`build load` is Mirror's per-session cost floor — and the floor is the close
  tail, not the double embedding.** Two embeddings for the same query (scoped and
  global) plus the previous conversation's close tail, on every Builder session
  start. Measured at plateau 7 from the real ledger (31 identical-prompt embedding
  pairs, the `build load` signature, on `openai/text-embedding-3-small`):

  | | per session start |
  |---|---|
  | the two query embeddings | median **$0.0000046**, mean $0.0000061 (67–595 prompt tokens) |
  | of which the duplicate call | **half** — about $0.000003 |
  | the close tail `load` triggers | median **$0.0011**, mean $0.0030, max $0.024 per conversation |

  So the duplicate embedding is roughly **0.3%** of what a Builder session start
  costs, and the close tail is the other ~99.7%: `conversation_title` alone is the
  largest line in the whole ledger (181 calls, $0.19). The double embedding stays
  parity-bound and is worth fixing for latency and honesty, not for spend; the
  cost argument belongs to CR076 and CR057, which already target the close tail.
  Recording the number here so nobody re-opens the question from intuition.

- **The DS Done preflight would refuse this repository's own roadmap.** `_is_done`
  is `strip().casefold().endswith("done")`, so `Done` and `✅ DONE` pass while
  `✅ Done (2026-09-08)` and `✅ Done — flipped and validated 2026-09-09` do not —
  and the dated form is the convention CV22's own packages use. A Delivery Story
  closed here through `done-delivery-story` would be blocked by its own history.
  Found at plateau 5 while writing the preflight corpus, reproduced
  (`authored_closure_status_suffix_rule`), and NOT repaired: widening the test is a
  product change to a guard whose whole value is refusing on explicit evidence.
- **Python keeps two different unfilled-Plan rules.**
  `plan_preauthorization.unfilled_plan_sections_for` matches `placeholder` only at
  line start; `delivery_story_plan._unfilled_plan_sections` also refuses a body
  containing the section's exact scaffold line, or `placeholder` anywhere. The DS
  rule is strictly broader, so the same Plan can be complete at story level and
  unfilled at DS level. Ported as two functions because that is what Python does;
  converging them is a product decision about how much authority a Driver's prose
  can buy.

- **The front door loads every route module eagerly**, so no family's
  `MIRROR_TS_<X>=0` revert survives a TS core that fails to load. Fixed for
  `build` here by lazy import; the general case is a CR under RS009.
- **Surfaces render `uv run python -m memory build …` literals**
  (`method_inspection.py` and wherever else the corpus finds them). After the
  flip they instruct the wrong engine; changing them is a product change
  that lands in TS with Python compatibility-only.
- **`_wrap_plain_text` × 10 with two behaviors** and `_card_prefixed` × 3 in
  Python; the `release_intent` overflow is an inherited rendering defect.
- **`inspect_refinement_field` hard-codes a CV20 path** under the user's
  project.
- **`"/"` in a story title is read as an ancestor chain**, which split this
  story's own title in its Pull surface.
- **`load` embeds the same query twice** (scoped and global search) — two
  provider calls where one would do; parity-bound.
- **`cmd_load` imports `_persist_global_sticky_defaults`**, a private —
  third occurrence (US6, US7, US8).
- **CR071 paid a fourth time**: three `mm-build` copies, 57 invocations
  edited.
- **Index/ledger undercount** (42 → 47 leaves, 15 → 20 Workbench): corrected
  in plateau 1; the class — "written from reading rather than code" — is the
  one US7 recorded twice.
- **Python's `build` refuses `--mirror-home`** where TS accepts it; the same
  recorded divergence as Soul and Explorer.
- **`resume_surface._resume_phase` is dead code** — a seven-branch function no
  caller reaches. Deliberately **not** ported: unreachable code is not parity
  surface, and carrying it into TS would import a maintenance obligation with
  no observable behavior. Its deletion belongs to Python, which is
  compatibility-only here, so it is recorded rather than removed.
- **`inspect_refinement_field` counts seed CRs from a hard-coded CV20 path**
  inside the *user's* project, so Mirror Mind's own roadmap layout leaks into
  product code. Any other project reports zero and behaves correctly by
  accident.
- **The Workbench read is guarded on one path and not the other.**
  `home_surface._safe_workbench_snapshot` swallows `sqlite3.OperationalError`,
  but `read_builder_resume_state` calls `get_workbench_snapshot` directly — so a
  database predating CV20.DS6 (no `builder_refinement_stories`) makes Builder
  Home degrade and `■ BUILDER RESUME` **raise**. Found at plateau 2 and
  reproduced in both halves, because guarding it in TS would diverge from the
  engine being replaced. The escape hatch is real but accidental: a project with
  a canonical refinement index passes `include_refinement=False` and never
  performs the read. Worth a CR — the asymmetry means the same install is
  resumable or not depending on which surface renders first.
- **`assert_implementation_allowed` does not require an active item.** A cursor
  whose `last_delivery_event` is `plan_approved` with `active_item=None` is
  ALLOWED, and the guard surface prints `active item / none`. Reproduced.
- **Four distinct DS-plan failures share one message.** Wrong level, wrong flow
  unit, absent aggregate status, and a different aggregate status all print
  `approved Plan is required before Implement.`, so a Navigator cannot tell
  which condition is missing. Parity-bound; a better message is a product
  change.
- **Two Ariad surfaces print ABSOLUTE machine paths.** `plan_checkpoint` prints
  the story package, the three artifact paths, and the four `*_path=` trailer
  lines raw; `expand_decision` prints `materialized_paths` raw; `expand_blocked`
  embeds the resolved directory in its reason. Every artifact surface, by
  contrast, relativizes through `artifact_surfaces._display_path`, so the same
  file is shown two different ways in one command's output — see
  `plan-item`, where the checkpoint prints `/Users/…/cv1-ds1-us1-story/plan.md`
  and `ARTIFACTS MATERIALIZED` prints `docs/project/roadmap/…/plan.md`. Found at
  plateau 3 while building the corpus: it is why the golden cannot grade those
  rows byte for byte on two machines (`ts/parity/builder_surface_paths.py`
  records the compensating rule). Reproduced, not fixed — relativizing would be
  a product change, and a Navigator-facing one. Worth a CR.

## Stop Conditions

- `scope_change_detected` — any request to change a surface, a refusal
  string, a stage, or cadence semantics in the port; any proposal to port a
  Workbench leaf or the projection publisher; any change needed inside
  `switchConversation` or the search route to make `load` compose.
- `plan_rule_conflict` — a cursor or receipt field whose Python bytes TS
  cannot reproduce, which would make the D2 revert unsafe; or the lazy
  import turning out to need changes to other families' dispatch.
- `failing_required_check_without_clear_fix` — a roadmap-grammar or
  wrapping divergence that cannot be reproduced deterministically across
  3.10 and 3.12; or a `load` golden that is not stable under replay.
- `navigator_decision_needed` — before the flip (plateau 9); before running
  this story's own closure through TS (validation step 4); before any
  `build` write against the real home that is not this story's own
  lifecycle; before any `prepare-templates` or artifact write against a real
  project directory outside the scratch clone.

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
