[< Story](index.md)

# Plan — CV22.DS10.TS4 — Retire the unported surfaces with cutoffs

**Pulled:** 2026-09-23
**Level:** Technical Story (implementable; no Expand)
**Gate it clears:** [Command Surfaces Assigned From DS7](../index.md#command-surfaces-assigned-from-ds7-decision-2026-09-07),
items 2, 3, 5, 6, plus the `journey_admin` disposition recorded in
[CR089](../../../../refinement/rs009-cv22-front-door-routing-correctness/cr089-the-journey-route-swallows-export-registry-and-mutate.md)

---

## Objective

Delete the last five Python command surfaces DS7 assigned to DS10 instead of
porting — `migrate-legacy`, `memory-rehearse-migration`, the twenty SQLite
Refinement Workbench leaves with the `get_workbench_snapshot` read that fed
`build load`, the `conversations --metadata-backfill-*` flags, and `journey
export-registry` / `journey mutate` — each behind a published cutoff, and give
the front door a way to say *removed* that does not depend on Python being
there to say *unknown*. After this story the only Python commands left are
`runtime`'s update/release half (US2) and the Python core itself (TS5).

## What Is True Before This Story

- **Five surfaces, ~4,300 lines of Python including tests**, none reachable by
  a skill, hook, or runtime script. `scripts/check_skill_command_parity.py`'s
  `PYTHON_ALLOWLIST` names only the six `runtime` verbs US2 owns; nothing under
  `.pi/`, `.github/`, `scripts/`, or `ts/` invokes any of the five. The
  consumers are: humans typing `uv run python -m memory ...` from
  `REFERENCE.md`, `mm-build`'s *Legacy SQLite path* section, and Mirror
  Desktop's Rust (`journey_admin`, see below).
- **`migrate-legacy`** — `src/memory/cli/migrate_legacy.py` (525 lines),
  `tests/unit/memory/cli/test_migrate_legacy.py` (465), the `__main__.py` help
  block and dispatch, a help-text assertion in `tests/unit/memory/test_main.py`,
  and two `REFERENCE.md` invocations (`validate`, `run`) under the legacy
  migration workflow. It converts a Portuguese-era (`travessia`) home. Not
  claimed by the front door: it falls through to Python today. What survives
  it: `resolveMirrorHome` still honors the legacy `~/.mirror/<user>` path, so a
  home that was migrated keeps resolving — only the *conversion* goes.
- **`memory-rehearse-migration`** — a `pyproject.toml` console script
  (`memory.cli.migration_rehearsal:main`, `src/memory/cli/migration_rehearsal.py`,
  12 KB) with `tests/unit/memory/cli/test_migration_rehearsal.py`. It rehearses
  the Python migration engine, whose custody DS6 moved to TS. No front-door
  route, no doc row outside the roadmap. No hit in `src/` or `scripts/` for the
  hyphenated name: it exists only as the script entry and its module.
- **The SQLite Workbench** — `src/memory/builder/workbench.py` (778),
  `workbench_surfaces.py` (519), the `refinement-story` (7) and
  `change-request` (13) subparsers and dispatch in `src/memory/cli/build.py`
  (~lines 2720–2870 and 3065–3140), the snapshot calls in `resume_state.py` and
  `home_surface.py`, `tests/unit/memory/builder/test_workbench.py` (1,334) plus
  the snapshot cases in `test_resume_state.py` and `test_build.py`,
  `scripts/reset_sandbox_pet_store.py::_clear_workbench_state`, and the
  `workbench.py` entry in `oracle_drift.py`. Nineteen `REFERENCE.md` rows
  (375–393) and the prose at ~413 document the verbs; `.pi/skills/mm-build/SKILL.md`
  carries the *Legacy SQLite path* (~100 lines) that routes to them when
  `docs/project/refinement/index.md` is absent. The front door already refuses
  the twenty **by name** (`TS_BUILD_WORKBENCH_ACTIONS`, US8 D1) — refuses them
  *to Python*, with `reason: retires unported in DS10`. On the TS side,
  `ts/src/builder/workbenchSnapshot.ts` (173 lines, US8 plateau 2) ports
  `get_workbench_snapshot`; `load.ts` and `resumeState.ts` call it; and
  `refinementField.ts` folds it into three `storage_state` values —
  `"project files"` (index present), `"implemented"` (no index, tables present),
  `"not implemented yet"` (no index, no tables). The DS index is explicit that
  the snapshot **is deleted here**: *"US8 ports that read-only snapshot. DS10
  deletes it with the rest."*
  **The rows are real.** The Navigator's `memory.db` holds **10 Refinement
  Stories** (`active`, `closed`) and **52 Change Requests** (`active`,
  `captured`, `validated`, `done`, `parked`) in `builder_refinement_stories` /
  `builder_change_requests`. Under the
  [2026-07-30 decision](../../../../decisions.md#project-files-supersede-the-sqlite-workbench-as-shared-refinement-authority)
  they are compatibility-only local state, never implicitly exported or
  deleted, and migrations `015`/`016` stay intact while supported databases
  carry the tables. This project has had the file-first index since CV20.DS12;
  those rows have not been the authority for anything since.
- **`conversations --metadata-backfill-preview|--metadata-backfill-apply|--metadata-backfill-mode`**
  — `src/memory/cli/conversations.py` (lines 65–115) and
  `ConversationService.preview_metadata_backfill` / `apply_metadata_backfill`
  (`src/memory/services/conversation.py` ~177–240), with cases in
  `tests/unit/memory/cli/test_conversations.py` and
  `tests/unit/memory/services/test_conversation.py`. The front door refuses
  the two flags **by name** to Python (`DS10_BACKFILL_FLAGS`), pinned by
  `ts/test/frontDoor/routing.test.ts` (lines 180, 878). The one-shot backfill
  of pre-ES-001 rows ran once (CV9.DS7); the lifecycle *engine* is TS-owned
  (DS7.US10/US11). **Not to be confused with** `conversation-logger
  backfill-pi-sessions|backfill-codex-session|backfill-assistant-messages` and
  `ts/src/conversation/backfill.ts` / `transcriptBackfill.ts` — those are the
  transcript backfills, ported, and untouched by this story.
- **`journey export-registry` / `journey mutate`** —
  `src/memory/services/journey_admin.py` (345), the dispatch at
  `src/memory/cli/journey.py:120–124` with its parser, references in
  `storage/store.py` and `client.py`, and
  `tests/unit/memory/services/test_journey_admin.py` (201) plus cases in
  `tests/unit/memory/cli/test_journey.py`. They arrived in the pause-window
  merge, never entered the DS7 denominator, and the disposition (retire, TS4)
  was recorded in TS1. **CR089 is the front-door half:** the TS `journey`
  route (`routing.ts:873`) claims the whole family and treats any verb it does
  not know as a *slug*, so `journey export-registry` renders an empty status
  for a nonexistent journey with exit 0, and `journey mutate` — a **write** on
  stdin — is a silent no-op with exit 0. CR089 is `captured` in RS009, no
  Driver, no Delivery, and says the fix "should land before TS4 deletes the
  Python behind it". Mirror Desktop's Rust calls both verbs through Python
  directly; it is outside the migration and pins to the last Python-bearing
  release (TS1's cutoff already says so).
- **There is no "removed" shape at the front door.** A retired name (`web`,
  `eval`, `journey-projection`) is unclaimed by `routing.ts`, falls through to
  Python, and Python prints `Unknown command: web` with its usage block, exit 1.
  That answer is Python's, and it disappears with TS5. CR089 asks for *"a clear
  'removed in vX; see release note' refusal"*.
- **Cutoffs go to
  [`docs/releases/pending-cutoffs.md`](../../../../../releases/pending-cutoffs.md)**
  (CV22 releases once). Each answers three things: what no longer exists, what
  to do instead, what still works if you do nothing. The file's closing comment
  reserves TS4's place. `scripts/check_retired_surfaces.py` carries one
  `RetiredSurface` row per retiring story (TS1, US1, TS2, TS3) with
  `absent_paths`, `forbidden_patterns`, and named `exemptions`; its docstring
  already counts *"a set of unported commands (TS4)"* as the fifth.

## Scope

### A. The front door learns to say *removed* (TS only; Python untouched)

- `ts/src/frontDoor/routing.ts` gains a `RETIRED_SURFACES` **list of
  predicates** — `{ matches(argv), surface, anchor }` — not a map keyed by
  command name, because the six shapes are four different matchers (whole
  command; command + verb; command + flag; command + subcommand + verb) and a
  map would push those differences into ad-hoc string checks inside `route()`.
  It yields a third decision shape beside `ts`/`python`: **`engine:
  "retired"`** with `reason` naming the cutoff. `cli.ts` renders it as one
  line, no traceback, **exit 1**: `migrate-legacy was removed in the CV22
  migration — see docs/releases/pending-cutoffs.md#<anchor>`.
- **Three properties of the refusal, each pinned by a test:** it is emitted
  **before any stdin read** and consumes nothing (`journey mutate` takes JSON
  on stdin; `echo '{}' | ... journey mutate` and `... journey mutate
  < /dev/null` both exit 1 immediately); it **echoes nothing** — not argv, not
  `--source`/`--target-home` paths, not the unknown token, not stdin; and the
  printed anchor is a **static constant per entry**, never derived from argv,
  so the one line a caller sees cannot carry injected text. The front-door
  log records the decision as `command` + `engine=retired` + anchor under
  `frontDoorLog.ts`'s existing no-payloads rule, so "my command vanished" is
  answerable from the log later.
- Six entries land here, matching argv by name and never by inheritance:
  `migrate-legacy` (any argv), `journey export-registry`, `journey mutate`,
  `conversations` with either `--metadata-backfill-*` flag, `build
  refinement-story <verb>` and `build change-request <verb>` for the twenty
  verbs (`TS_BUILD_WORKBENCH_ACTIONS` is retained as the name list and its
  route flips from `python` to `retired`). `web`, `eval`, `journey-projection`
  are **not** added: their stories are closed and their refusal is TS5's to
  shape when Python's `Unknown command` goes; adding them here would reopen
  three done packages for a cosmetic change.
- **CR089, delivered here as the two named entries (decision 2 below).**
  `journey export-registry` and `journey mutate` are matched by the `retired`
  predicates **before** the `journey` family's status-read fallthrough, so
  neither can be read as a slug again. That is the whole of what a routing fix
  can do: at the front door a verb and a slug have the same shape — one
  positional token — so no enumeration can refuse `journey nonsense-verb`
  without also refusing `journey mirror-ts-core`. The bare-slug status read is
  **unchanged byte-for-byte**, including its empty document and exit 0 for a
  slug that resolves to no journey — that is Python's own behavior, verified
  on both engines, and it is
  [CR095](../../../../refinement/rs009-cv22-front-door-routing-correctness/cr095-journey-status-renders-an-empty-document-for-an-unknown-slug.md),
  captured separately on 2026-09-23 and sequenced after TS5. The routing test
  for the family covers `set-path`, `update`, no argument, an existing slug,
  an unknown slug (still the status read), and the two retired verbs.
- **Not** touched: the `fallbackPython` path itself, the `MIRROR_TS_*` gates,
  the `Unknown command` fallthrough for names this story does not own, and
  the `journey <slug>` status read for unresolvable slugs (CR095).

### B. `migrate-legacy` and `memory-rehearse-migration` — deletion

- Delete `src/memory/cli/migrate_legacy.py`, `migration_rehearsal.py`, their
  two test files, the `__main__.py` help block and dispatch for
  `migrate-legacy`, and the `memory-rehearse-migration` line in
  `[project.scripts]`. Fix the `test_main.py` help assertion.
- `REFERENCE.md`: the two invocations and the legacy-migration workflow
  paragraph become a pointer to the cutoff. `AGENTS.md` references
  `REFERENCE.md#legacy-migration-workflow` — the anchor keeps existing, its
  body says *pre-DS10 release*.
- Cutoff: Portuguese-era homes convert with the last Python-bearing release,
  once; a converted home keeps working, and the legacy `~/.mirror/<user>`
  path keeps resolving. `docs/product/extensions/migrations.md:161` mentions
  `ext <id> migrate-legacy` — an *extension-owned* subcommand name — and is
  recorded as an exemption, not residue.

### C. `journey export-registry` / `journey mutate` — deletion

- Delete `src/memory/services/journey_admin.py`, its test file, the two
  verbs' parser and dispatch in `cli/journey.py`, the cases in
  `test_journey.py`, and the `JourneyAdminService` references in `store.py` /
  `client.py`. `oracle_drift.py` keeps `cli/journey.py` at file granularity;
  the `journey-update` golden is regenerated only if the file's graded output
  changed (it should not — the verbs live in a different branch).
- Cutoff: removed; Mirror Desktop pins (TS1 precedent); no TS replacement.

### D. `conversations --metadata-backfill-*` — deletion

- Delete the three flags from `cli/conversations.py`, the two service methods
  and their `metadata_backfill_apply` source tag from
  `services/conversation.py`, and the tests that cover them. Anything in
  `metadata_lifecycle.py` that only the backfill called goes with it; anything
  the lifecycle engine shares stays — the boundary is decided by the tests
  that remain green.
- `DS10_BACKFILL_FLAGS` moves into the `retired` table (A); the two pinned
  routing tests flip from `engine: python` to `engine: retired`.
- Cutoff: the backfill ran once; pre-ES-001 rows that were never backfilled
  keep their empty metadata and every listing, search, and lifecycle face
  keeps working on them.

### E. The SQLite Workbench — deletion, Python side first

The order is forced by the goldens. `builder-resume-state.golden.json` (11
index-less cases) and `builder-orientation.golden.json` (70) are **produced
by** Python's `get_workbench_snapshot` — `ts/parity/generate_builder_resume_state_golden.py`
imports it. Changing TS first fails those tests against the old goldens;
deleting Python first kills the generator. So, four commits in this order,
reverted as a set:

1. **Python renders the single state.** `resume_state.py` and
   `home_surface.py` stop calling `get_workbench_snapshot`; with no canonical
   index the `🧰 Refinement field` renders `authority: project files (not
   started)` and the next move names `docs/project/refinement/index.md` as the
   file to create. `workbench.py` still exists and is now imported by nothing
   but its own CLI and tests.
2. **Goldens regenerated from Python.** `generate_builder_resume_state_golden.py`
   drops its `get_workbench_snapshot` import and the refinement fields it
   dumped; `builder-resume-state`, `builder-orientation`, and `builder-load`
   are regenerated and the diff is confined to the refinement field.
3. **TS follows.** Delete `ts/src/builder/workbenchSnapshot.ts`;
   `refinementField.ts` loses its `workbench` argument and the `"implemented"`
   / `"not implemented yet"` states collapse into the same single state;
   `load.ts` and `resumeState.ts` stop calling the snapshot; `load.test.ts`,
   `loadSurfaces.test.ts`, `resumeState.test.ts`, and `orientation.test.ts`
   follow. TS suite green against the new goldens.
4. **Python's Workbench deleted.** `builder/workbench.py`,
   `workbench_surfaces.py`, the two subparser families and their dispatch in
   `cli/build.py`, `test_workbench.py`, the snapshot cases in
   `test_resume_state.py` / `test_build.py`, `_clear_workbench_state` in
   `reset_sandbox_pet_store.py`, and the `workbench.py` line in
   `oracle_drift.py`.
- **Docs/skills:** `REFERENCE.md` rows 375–393 and the prose at ~413 go;
  `.pi/skills/mm-build/SKILL.md` drops the *Legacy SQLite path* and its
  branch in *Choose the Refinement authority* — file-first is the only path.
  If the skill is mirrored for other runtimes under `runtime/skills/`, the
  mirror is regenerated the way TS2/TS3 did it, not hand-edited.
- **Database: nothing.** Migrations `015`/`016` stay applied and
  `schemaState.ts` keeps recognizing them; the two tables and their 62 rows
  stay, inert, exactly as `eval-history/` and `web/preferences.json` were
  left. No export, no reconciliation, no drop. **Retention needs an access
  path or it is soft deletion with better wording:** this story deletes the
  only narrative reader (`refinement-story overview`), so the cutoff carries
  the actual queries —

  ```sql
  select display_code, title, status from builder_refinement_stories order by position;
  select display_code, title, status, refinement_story_id
    from builder_change_requests order by position;
  ```

  — beside the last Python-bearing release, so "what to do instead" is true
  for the human with 52 CRs.

### F. Cutoffs, guard, sweep

- `pending-cutoffs.md`: **one section per surface** (five), each with the
  three answers, each linked from this package. A user searches for the
  command they lost, not for the story that removed it.
- `check_retired_surfaces.py`: **one `RetiredSurface` row per surface**, all
  `story="CV22.DS10.TS4"`, with `absent_paths` for every deleted file and
  `forbidden_patterns` written as **command shapes and module names, never
  bare vocabulary** — `mutate`, `change-request`, and `refinement-story` are
  living Ariad words in the file-first flow, the `mm-build` skill, and the TS
  builder surfaces, and a guard that matches them is either red on day one or
  hollowed out by exemptions. The patterns: `journey mutate\b`,
  `journey export-registry`, `build refinement-story`, `build change-request`,
  `--metadata-backfill-`, `metadata_backfill`, `memory-rehearse-migration`,
  `migrate_legacy`, `migration_rehearsal`, `journey_admin`,
  `workbench_surfaces`, `get_workbench_snapshot`, `workbenchSnapshot`.
  Exemptions: `docs/product/extensions/migrations.md` (extension-owned
  `ext <id> migrate-legacy`), and the `mm-build` skill only if a sentence
  explaining the file-first-only rule needs to name what it replaced.
- Before the last commit: `rg -n "<each name>" src/ tests/ scripts/ ts/ .pi/
  REFERENCE.md README.md docs/` outside `docs/project/`, `worklog.md`, and
  `docs/releases/` — every hit is in the deletion set, an exemption, or a
  stop condition. `__main__.py --help` lists none of the five.

## Non-Goals

- **No port of anything.** If a surface turns out to have a live consumer that
  needs it, that is a stop condition and a Navigator decision, not a quiet
  port.
- **No export or migration of Workbench rows**, and no `DROP TABLE`. Explicit
  export was named a separate change in the 2026-07-30 decision; dropping the
  tables is a schema decision for TS5 or later, if ever.
- **No touch on `conversation-logger backfill-*`** or the TS transcript
  backfills.
- **No `runtime update|pull|stable|backup|release-doctor|release-promote`** —
  US2.
- **No removal of `fallbackPython`, `MIRROR_TS_*` gates, `uv`, `pyproject.toml`,
  `ts/parity/`, or the oracle** — TS5.
- **No `retired` entries for `web`, `eval`, `journey-projection`** — TS5
  shapes the post-Python `Unknown command` answer for everything at once.
- **No Mirror Desktop change** — outside the migration.
- **No change to `docs/project/refinement/index.md`** beyond CR089's own row
  and document, and only under decision 2. (CR095 was captured at Plan time,
  before implementation, and is not TS4 work.)
- **No change to the `journey <slug>` status read** — CR095, after TS5.

## Plateaus

Each plateau is a commit and a resumable state; each deletion plateau is a
single commit whose revert restores the surface whole — except plateau 5,
which is four commits reverted as a set.

0. **Baseline.** Before any change: `build load mirror-ts-core` stdout
   captured into this package as `baseline-build-load.txt`, and a read-only
   copy of `memory.db` placed under `/tmp/ts4-home/` for the index-less route.
   "Byte-identical to before" in the acceptance means a diff against this
   file, not against memory.
1. **The front door says *removed*.** A lands with tests: `retired` engine,
   the six predicates, the three refusal properties, CR089's two named
   entries. Python is untouched; the five surfaces are now reachable only by
   invoking Python directly. This is the shape TS5 inherits.
2. **The two migration tools.** B. Python suite green, `uv run
   memory-rehearse-migration` no longer resolves, `--help` clean.
3. **`journey_admin`.** C. `journey-update` golden unchanged or regenerated
   with the reason recorded.
4. **The backfill flags.** D. The lifecycle suites (`test_metadata_lifecycle`,
   DS7.US10/US11 TS tests) green — the boundary held.
5. **The Workbench.** E, in its four-commit order: Python renders the single
   state → goldens regenerated → TS follows → Python's Workbench deleted.
   `build load` on an index-less project renders the single state on both
   engines; on this project the field diffs clean against the baseline.
6. **Cutoffs, guard, sweep.** F; `check_retired_surfaces.py` passes with five
   new rows; full pre-push set green; DS index candidate row and this package
   updated.

## Rollback

Plateau 1 is additive on the TS side: reverting it restores the Python
fallthrough for all six names. Plateaus 2–4 are one commit each; each revert
restores the files, the dispatch, and the tests. Plateau 5 is **four commits
reverted as a set**: reverting the TS commit alone leaves the goldens ahead of
the code, and reverting the deletion alone leaves `workbench.py` imported by
nothing. The database is never written: no migration, no row change, so
nothing on the Navigator's home is at risk in either direction.

## Acceptance Behavior

```text
Given any of: migrate-legacy, journey export-registry, journey mutate,
      conversations --metadata-backfill-preview, build change-request capture
When  the Navigator runs it through the front door
Then  one line names the surface and its cutoff anchor, nothing else prints,
      and the exit code is 1
And   `journey mutate` with JSON piped on stdin, or with stdin closed, exits 1
      immediately without reading or echoing it
And   `journey <slug>` for an existing journey, and with no argument, are
      byte-identical to before this story (CR095 is not taken here)

Given `uv run python -m memory --help`
When  the story is done
Then  none of migrate-legacy, refinement-story, change-request, export-registry,
      mutate, or --metadata-backfill appear, and `memory-rehearse-migration` is
      not an installed script

Given this project (which has docs/project/refinement/index.md)
When  `build load mirror-ts-core` runs
Then  the 🧰 Refinement field renders `authority: project files` and the index
      path, byte-identical to before this story

Given a project with no docs/project/refinement/index.md
When  `build load <slug>` runs
Then  the 🧰 Refinement field renders the single file-first state and names the
      index to create, with no SQLite read behind it

Given the Navigator's memory.db
When  the story is done
Then  builder_refinement_stories still holds 10 rows and
      builder_change_requests 52, the _migrations ledger still lists
      015_create_builder_workbench and 016_builder_workbench_display_codes,
      and ts/test/db/schemaState.test.ts still pins both as recognized
```

## Validation Route

**Automated (every plateau):** `npm run typecheck`, `npm run lint`, `npm test`,
`uv run pytest`, the pre-push set; `python scripts/check_retired_surfaces.py`
and `check_skill_command_parity` after plateau 6.

**Navigator route (free, after plateau 1):**
`node --env-file=.env ts/src/frontDoor/cli.ts journey export-registry; echo $?`
→ *expected:* one line naming the cutoff, `1`. *Today:* `=== journey:
export-registry ===` with an empty memories list, `0`.
`echo '{"x":1}' | ... cli.ts journey mutate; echo $?` and `... cli.ts journey
mutate < /dev/null; echo $?` → *expected:* the same one line, `1`, at once —
no hang, no echo of the JSON.
`... cli.ts journey mirror-ts-core` → *expected:* unchanged status document.

**Navigator route (free, after plateau 5):** `build load mirror-ts-core` — the
`🧰 Refinement field` block diffs clean against `baseline-build-load.txt`.
Then, **without writing to the real home**: `MIRROR_HOME=/tmp/ts4-home
... cli.ts build load <a journey whose project_path has no refinement index>`
→ the single file-first state naming the index to create.
*Fail:* a SQLite error, an `"implemented"` state, a reference to Workbench
rows, or any diff against the baseline.

**Navigator route (free, after plateau 6):** `uv run python -m memory --help`
shows none of the five; `uv run memory-rehearse-migration` does not resolve
(`uv run` re-syncs the editable install, so the shim is gone — a non-`uv`
editable install would keep a dangling one, which is not a Mirror case);
`sqlite3 "file:$HOME/.mirror-minds/vinicius-ts/memory.db?mode=ro&immutable=1"
"select count(*) from builder_refinement_stories"` → `10`; the same
read-only `sqlite3` with `select id from _migrations where id like '015%' or
id like '016%'` → both rows; `schemaState.test.ts` green.

**E2E decision: not required as a paid or separate run.** The routes are
deterministic and keyless; the Navigator's real-home `build load` after
plateau 5 *is* the end-to-end check, at no cost, and is part of the route
above.

## Implementation Contract

- TDD: the `retired` decision shape, the six predicates, the three refusal
  properties (no stdin read, no argv/stdin echo, static anchor), and CR089's
  two named entries as failing routing tests before `routing.ts` changes;
  each deletion preceded by flipping the tests that pinned the old route.
- Plateau 5 in its four-commit order; goldens regenerated from Python after
  Python renders the single state and before Python's Workbench is deleted,
  never the other way round.
- `uv run` for every Python command; `git add` by path; commit per plateau;
  English messages explaining why; `gh run watch` green before the next
  plateau.
- No `any`; the `retired` shape is a discriminated union member, not a string
  check.
- The database is opened read-only by every check this story runs.

## Stop Conditions

- **scope_change_detected** — a live consumer of any of the five surfaces
  turns up outside the deletion set (a skill, hook, workflow, extension
  manifest, or a Desktop path that is not already covered by the pin); the
  backfill boundary in `metadata_lifecycle.py` cannot be cut without touching
  the engine; the `journey-update` golden changes for a reason the story
  cannot explain; a golden regenerated in plateau 5 differs anywhere outside
  the refinement field.
- **navigator_decision_needed** — any of the three decisions below is
  declined; a Workbench row turns out to be referenced by a non-Workbench
  table or cursor; the `mm-build` skill mirror cannot be regenerated.
- **failing_required_check_without_clear_fix** — Python suite, TS suite, or
  pre-push set red after a deletion plateau for a reason outside that
  plateau's set.
- **plan_rule_conflict** — a cutoff cannot truthfully answer "what still
  works if you do nothing".

## Decisions This Plan Asks The Navigator To Take

1. **The front door gains a TS-native `retired` decision** (name → cutoff
   anchor, one line, exit 1), applied to these six shapes now and reusable by
   TS5 for the rest. Alternative: leave the Python `Unknown command`
   fallthrough until TS5 — cheaper today, but the five surfaces would then
   fail with a Python usage block that names commands DS10 already removed.
2. **CR089 is delivered inside plateau 1 as the two named `retired` entries
   — and only that.** The "unknown slug exits 0" half is Python parity, not a
   routing defect; it is CR095, captured separately on 2026-09-23 and
   sequenced after TS5, and TS4 leaves `journey <slug>` byte-identical to the
   oracle. Under the file-first protocol that requires a `Driver` and
   `Delivery` before `in_progress`: Driver Vinícius, Delivery the TS4 branch
   (PR link once open); CR089 moves to `done` at plateau 6 with TS4 as its
   evidence. Alternative: land CR089 first as its own Refinement Work, then
   pull TS4 again.
3. **The `🧰 Refinement field` collapses to one file-first state when a
   project has no refinement index**, and the 62 Workbench rows stay in the
   database untouched, unexported, with migrations `015`/`016` intact. The
   cutoff tells a journey still living in SQLite rows to adopt the index with
   a pre-DS10 release, as the DS index already words it.

## Review

Per the [collaboration strategy](../../collaboration-strategy.md), this story
is above a small slice — five deletions across two engines, a front-door
behavior change, and a live surface the Navigator sees every session.

- **Plan review, before implementation — done 2026-09-23.** Panel chosen by
  the Navigator: engineer, quality-assurance, security-engineer,
  database-architect, devops-engineer. Synthesis: sound where it matters —
  isolated deletions, no live consumer, database never written, a proven
  cutoff pattern — with risk concentrated in two things the draft
  mis-described rather than mis-scoped. Six findings, all folded above:
  the draft's CR089 promise conflated a verb with a slug and hid a parity
  deviation (engineer, QA) — §A and decision 2 shrunk to the two named
  entries, the unknown-slug behavior captured as CR095; plateau 5's order was
  backwards for goldens produced by Python's snapshot (engineer) — §E is now
  Python-first in four commits reverted as a set; the guard's forbidden
  patterns would have matched living Ariad vocabulary (devops-engineer) — §F
  names command shapes and module names; the route lacked a captured
  baseline, a copy-home for the index-less case, and the stdin edge cases
  (QA) — plateau 0 and the routes; retention of 62 rows without a reader is
  soft deletion (database-architect) — the cutoff carries the queries and
  acceptance pins `015`/`016` recognition; the refusal's no-stdin-read /
  no-echo / static-anchor properties and its log entry were assumed, not
  pinned (security-engineer, devops-engineer) — §A pins them with tests. Not
  requested by the Navigator and therefore not run: ai-engineer,
  prompt-engineer, experience-designer, product-designer.
- **Handoff review, after plateau 6 validation:** same panel.

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- Implementation is blocked until the Navigator approves this Plan and the
  three decisions above. Plan review by the panel precedes approval.
