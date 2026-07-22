# Plan — Ariad Expand Scaffolder Path-Divergence Fix

**Status:** P1 (core fix), P2 (fail-loud on ambiguity/unparseable), and P3 (CI duplicate-heading guard)
implemented and green. Pre-flight fixes applied. P4 pending.
**Companion:** `handoff-ariad-fix.MD` (original analysis). This plan supersedes the handoff's phasing
where they differ (notably: the correct resolver already exists; the fix is a DRY consolidation).
**Tracking:** maintenance patch on `main` in this `mirror-dev` workspace. No Ariad CR / no method adoption.
**Scope:** this workspace only. **Out of scope:** the port-branch P0 cleanup and all `mirror-ts-core` work.
**Class:** second occurrence of the CR048 defect (first: DS6.TS5; second: CV22.DS7). Fix in code, not by hand.

**Design revision during implementation (Navigator-approved):** Decision #2 below ("fallback-create
fails loud when the parent can't be resolved") was revised after real test evidence showed it conflated
two different concerns. See **P1 Implementation Record** for the corrected tiered design actually shipped.

---

## Locked decisions (Navigator-approved)

1. **Resolve by heading (content), not folder name.** A package *is* `CV2.DS1` because its `index.md`
   heading says so (`# CV2.DS1 — …`), regardless of folder name. This unifies with the pull-candidates
   scanner, which already trusts the heading.
2. **Fallback-create fails loud when the parent can't be resolved.** Never fabricate a package at the
   roadmap root. If the parent folder does not exist, stop and report — do not guess.
3. **Full DRY consolidation.** One shared resolver + creator in the builder core, used by both Expand and
   the CLI plan path. Delete *both* current derive paths: `lifecycle._artifact_directory` and the CLI's
   `_roadmap_title_parts` fallback. This also fixes the CLI's latent fallback bug (see Root Cause §2).

---

## Verified diagnosis (against `main`, v0.31.3)

| Claim | Status | Ground truth |
|---|---|---|
| `_artifact_directory` derives leaf-title path, misaligns levels | Confirmed | `lifecycle.py:1822`; `CV22.DS7` trace reproduces exactly |
| Single caller (`expand_delivery_story`) | Confirmed | Only call at `lifecycle.py:424` |
| Empty-children fabricates `{code}.US1` + skeleton | Confirmed | `lifecycle.py:455–486`; `_title_leaf` at `2169` |
| `_parse_candidate_stories` requires `{code,story,type,status}` | Confirmed | `lifecycle.py:563` (accepts 5-col via `issubset`) |
| Cursor is code-keyed; no doc paths → no migration | Confirmed | `delivery_cursor.py`: `child_work_items: tuple[str,...]`, journey-scoped session JSON |
| `_story_folder_name` is correct; reuse it | Confirmed | `lifecycle.py:1835` = `<code>-<title-slug>` |
| Resolver to reuse (code→path) exists | Confirmed | `pull_candidates.py` `HEADING_RE` walk; `_index_code` |
| `kebab_slug` neutralizes traversal (`[a-z0-9-]`, 80 cap) | Confirmed | `utils.py:12` |
| `is_relative_to` escape-guard precedent | Confirmed | `template_generation.py` `_target_path` |
| Extend existing doc checker for CI guard | Confirmed | `docs_lint.py` + self-tested `test_docs_lint.py` + `.github/workflows/docs.yml` |
| Plan/Validate/Done re-derive | **Refined** | Plan already **resolves** via `_canonical_package_path`; Validate/Review/Done build no package paths |

---

## Root cause (refined, code-grounded)

### 1. The correct resolver already exists — Expand just doesn't use it

`cli/build.py:_canonical_package_path` (used by Plan / DS-Plan) already does **resolve-first**:

```
_canonical_package_path → _find_existing_package_path(project_root, active_code)   # RESOLVE (rglob)
                        → (only on miss) derive via _roadmap_title_parts chain     # FALLBACK
```

So Plan resolves correctly today; only Expand's `_artifact_directory` is the buggy **derive-only** copy.
This makes the fix a DRY consolidation of two implementations into one, with Expand wired to it.

### 2. Correction to the handoff: the CLI *fallback* is also latently buggy

`PullCandidate.title` is **not** a reliable `/`-joined chain:

- From a package's own `index.md` heading it is the **leaf** title (`pull_candidates.py:401`).
- From the top-level roadmap index bullets it is **chained** `"{cv}/{ds}"` (`pull_candidates.py:445`).

So `_roadmap_title_parts` yields a correct chain **only** when the roadmap index uses the `## CVn:` bullet
format; otherwise it degrades to the same leaf-only bug as `_artifact_directory`. **Plan is saved purely by
resolve-first, not by a correct fallback.** Conclusion: title-chain arithmetic is fragile in *both*
implementations, so the correct design abandons title chains entirely (resolve the parent instead).

### 3. How it escaped (regression gap)

Every Expand test seeds `active_item="DS-35"` — a **single-segment** code — via `_seed_ds_cursor`, and
`_write_ds_index` writes to `ds-35-application-admin-parity`. For a single-segment code, derive == resolve
(the leaf title decorates the only level, which is correct). The bug requires a **dotted** code (`CV2.DS1`,
`CV22.DS7`) to surface, and no Expand test uses one. Wrong-but-consistent path → green.

### 4. Secondary defect: authored-package grammar coupling

Even at the right path, Expand fabricates a US1 when `_parse_candidate_stories` returns `[]`. The DS7 package
used `| Family | Scope | Type | Risk |` (no `Code`/`Story`/`Status`), so the parser returned `[]` and Expand
invented a generic US1 at a fabricated path. There is an implicit, unenforced contract between hand-authored
DS packages and the parser. When Expand resolves a package but can't parse candidates, it must **fail loud**,
not fabricate.

---

## Design — one shared resolver + creator

New module `src/memory/builder/story_paths.py` (or beside `pull_candidates`), reusing
`roadmap_grammar.HEADING_RE` / `is_legacy_path` and `lifecycle._story_folder_name`.

```python
def resolve_story_directory(project_path: Path, code: str) -> Path | None:
    """Directory of the authored package whose index.md heading code == code.
    Resolves by heading (HEADING_RE), skipping is_legacy_path. UNCONDITIONAL, always tried
    first -- this is the actual bug fix. Raises StoryPackageAmbiguityError if more than one
    package claims the same code."""

def create_story_directory(project_path: Path, code: str, leaf_title: str) -> Path:
    """Canonical directory for a NEW package. Only reached when resolve_story_directory(code)
    already returned None for the code being created -- nothing exists yet for it, so nothing
    can diverge. Nests under the best-available PARENT coordinate:
      1. resolve_story_directory(parent) -- parent already has an authored package -> use it.
      2. else name it from the root roadmap snapshot (inspect_roadmap_snapshot -- the CV's own
         planning-stage title, before it has a folder; handles both the legacy bullet grammar
         and the CV/DS table grammar).
      3. else recurse to the grandparent, ultimately falling back to a bare code segment.
    Never fails loud in this tier (see 'Design revision' below for why). Applies title_leaf()
    to leaf_title before slugging the item's OWN folder name (tolerates an accidental '/'-chain
    input without ever using it for cross-level arithmetic). Enforces
    target.resolve().is_relative_to(roadmap_root.resolve())."""
```

- `_parent_code` splits on `.`: single-segment codes (`DS-35`) have no parent → nest at roadmap root
  (matches today's correct single-segment behavior); dotted codes resolve/create their parent coordinate.
- **No title-chain arithmetic across code levels, ever.** `title_leaf()` only extracts an item's OWN leaf
  segment when a chain-style title is accidentally given; it never index-aligns chain segments with code
  dot-segments (that alignment assumption was the second defect in the original bug).

### Design revision during implementation (Navigator-approved)

The original Decision #2 ("fallback-create fails loud when the parent can't be resolved") conflated two
separate concerns, discovered via real, pre-existing test evidence during P1 implementation:

- **Never diverge from an already-authored package** — the actual CV22.DS7 bug. Fully solved by
  `resolve_story_directory`, unconditional, always tried first. This never changed.
- **Always find a nice parent title before creating anything new** — a naming/cosmetic concern, not a
  divergence risk. If nothing is authored anywhere for a code yet, a first path for it cannot diverge from
  anything.

Multiple existing CLI tests legitimately exercise "create a brand-new nested package with no authored parent
  yet," sourcing the parent's title from the root `docs/project/roadmap/index.md` snapshot (both the legacy
  bullet grammar and the table grammar — reusing the existing, tested `pull_candidates.inspect_roadmap_snapshot`
  / `_snapshot_items_from_content`) or gracefully degrading to a bare code segment when no documentation
  exists at all. **Revised:** `create_story_directory` never fails loud; it degrades gracefully through the
  three tiers above. Fail-loud is reserved for P2 (Expand resolves a package but can't parse its candidate
  table) — a different module, a different condition, genuine ambiguity rather than pure creation.

One pre-existing test (`test_build_pull_delivery_story_prepares_and_expands`) relied on an undocumented,
  per-level "/"-joined title-chain convention (index-aligning chain segments with code dot-segments) that was
  never a documented Navigator contract and directly matches the mechanism that produced the real CV22.DS7
  bug (a Navigator who didn't know the convention supplied a leaf-only title). That test was updated to
  author a realistic root roadmap snapshot and supply a leaf-only title, matching the corrected contract,
  rather than reintroducing the chain-arithmetic mechanism.

### Wiring (as implemented)

- `expand_delivery_story` (`lifecycle.py:424`):
  `ds_dir = resolve_story_directory(project_path, code) or create_story_directory(project_path, code, title)`
  — `_artifact_directory` deleted.
- `cli._canonical_package_path`: resolves via the shared resolver; on miss,
  `create_story_directory(root, code, cursor.active_item_title or code)`. `_find_existing_package_path`'s
  folder-name match and the `_roadmap_title_parts` chain-derivation loop are deleted.
- `_story_folder_name` and `_title_leaf` moved from `lifecycle.py` into `story_paths.py` as public
  `story_folder_name`/`title_leaf` (shared primitives now, not lifecycle-private); `lifecycle.py` re-imports
  them aliased with the original underscore names so its 3+3 existing call sites and direct unit tests were
  unaffected.
- Resolver returns/raises deterministically for EXISTING packages, so both call sites enforce **one code →
  exactly one package** for anything already authored.

---

## Phased plan (this workspace, maintenance patch)

### Pre-flight — ✅ done
- Ran the duplicate-heading scan against `mirror-dev`'s own `docs/**/index.md` (259 packages) before
  implementing. Found two real, pre-existing issues, both fixed:
  - **`CV20.DS4.US2` duplicate:** a dropped/replaced story
    (`cv20-ds4-us2-plan-checkpoint-gate/index.md`) still carried the live heading of its replacement
    (`cv20-ds4-us2-plan-package-and-granularity-gate/index.md`). Retitled to
    `# Historical note — Plan Checkpoint Gate`, mirroring the existing `cv13-e1-docs-browser` precedent
    (`# Historical note — Docs Browser`) exactly.
  - **`HEADING_RE` gap:** the code character class was uppercase-only (`[A-Z0-9.\-]+`), so
    `CV21.E2.S1b` (lowercase sub-story suffix) never matched — a pre-existing gap shared with
    `pull_candidates.py`, which the new resolver would have inherited. Extended to
    `[A-Za-z0-9.\-]+`; re-scanned to confirm no new false-positive matches anywhere in the 259 packages.
  - Re-verified after both fixes: 259 matched, 259 unique codes, 0 duplicates. Full test suite +
    `scripts/check_doc_links.py` green.

### P1 — Consolidate the resolver (core fix) — ✅ done
- Added `src/memory/builder/story_paths.py`: `resolve_story_directory`, `create_story_directory`,
  `story_folder_name`, `title_leaf`, `StoryPackageAmbiguityError`.
- Wired Expand (`lifecycle.py`) onto it; deleted `_artifact_directory`.
- Refactored `cli._canonical_package_path` onto it; deleted `_find_existing_package_path` and
  `_roadmap_title_parts`. Removed the now-orphaned `kebab_slug` import from `cli/build.py`.
- TDD: QA tests 1 (`test_expand_resolves_authored_dotted_code_package_reusing_it`) and a second test
  proving heading-over-folder-name resolution (`test_expand_resolves_by_heading_content_not_by_folder_name`)
  written red-first against the pre-fix code, confirmed failing for the correct reason (wrong-directory
  write, not a crash), then made green.
- Design revision (see above) discovered and approved mid-implementation via real test evidence; implemented
  as the graceful 3-tier `create_story_directory`.
- Fixed 4 pre-existing test fixtures as a direct, mechanical consequence of the approved design:
  3 bare-heading fixtures (`# CODE` with no title — matched 0 of the 259 real packages) given minimal
  realistic titles; 1 fixture relying on undocumented chain-title arithmetic updated to a realistic root
  snapshot + leaf-only title. Updated one hardcoded module list in `test_utils.py`'s DRY-consolidation guard
  test (`cli/build` no longer imports `kebab_slug` at all — delegates entirely to `story_paths`).
- **Result:** full repo test suite green (all packages), `ruff check` clean, doc-link checker clean,
  duplicate-heading re-scan clean.

### P2 — Fail loud on ambiguity / unparseable — ✅ done
- Added `ExpandBlockedError(ValueError)` in `lifecycle.py`. `expand_delivery_story` now raises it when a
  package is resolved (`ds_exists`) but `_parse_candidate_stories` returns no children — the resolved path is
  named in the message; nothing is written (no fabricated skeleton). The pre-existing "fresh creation, nothing
  authored yet" fabricate-a-skeleton path is unchanged (`not ds_exists`).
- Added `render_expand_blocked(active_item, reason)`, a `wrap_ariad_surface("expand_blocked", ...)` surface
  matching the visual grammar of the other lifecycle cards (ribbon, box, `_card_text`/`_card_wrapped`).
  Visually verified against `render_implementation_guard_blocked`/`render_expand_report` line widths after an
  initial hand-typed border came out short (53 vs the required 58 chars) — fixed by extracting and reusing
  the exact verified border string programmatically rather than retyping box-drawing characters by hand.
- Wired in `cli/build.py`'s `cmd_pull_item`: the `expand_delivery_story` call is wrapped in
  `try/except (ExpandBlockedError, StoryPackageAmbiguityError)`, rendering `render_expand_blocked` and
  `sys.exit(1)` — the same catch-and-render-then-exit pattern already established for
  `assert_implementation_allowed`/`render_implementation_guard_blocked`. Ambiguity
  (`StoryPackageAmbiguityError`, already raised unconditionally by `resolve_story_directory` since P1)
  required no new raise site — it now simply gets caught and rendered instead of propagating as a raw
  traceback.
- TDD: 2 new lifecycle-level tests (unparseable-table on a resolved package; ambiguous duplicate heading) +
  2 new CLI-level tests (same two conditions through the real `cmd_pull_item` entry point, asserting
  `EXPAND_BLOCKED` renders and `DELIVERY_STORY_READY`/`ARTIFACTS_MATERIALIZED` do not). All written red-first.
- **Result:** full repo test suite green, `ruff check` clean, doc-link checker clean.

### P3 — CI guardrail (kill the class) — ✅ done
- Refactored `story_paths.py`: extracted the shared scan primitive `_group_roadmap_headings` (used
  internally by `resolve_story_directory` since P1) and added public `find_duplicate_roadmap_headings
  (project_path) -> dict[str, tuple[Path, ...]]` — every code claimed by more than one `index.md` heading,
  whole-tree. Closed a real gap while here: `story_paths.py` had zero direct unit tests since P1 (only
  indirect coverage via `test_lifecycle.py`'s Expand tests); added
  `tests/unit/memory/builder/test_story_paths.py` with full direct coverage, including the still-pending
  path-escape test from the original matrix (item #4 — now done).
- Extended `docs_lint.py`: new `DuplicateRoadmapHeading` dataclass + `check_roadmap_duplicate_headings
  (repo_root)`, wrapping `find_duplicate_roadmap_headings` for deterministic, sorted, repo-relative CI
  output. Self-tested in `test_docs_lint.py` (`TestCheckRoadmapDuplicateHeadings`), matching the file's
  established "checker is a test artifact and must self-test" convention.
- Wired into the existing `scripts/check_doc_links.py` (no new workflow — `docs.yml` already triggers on
  `docs/**`, `scripts/check_doc_links.py`, and `src/memory/docs_lint.py`; `story_paths.py` changes are also
  covered by `tests.yml`, which runs on everything except pure `docs/**`-only edits). The script now runs
  both checks and reports either/both.
- **Caught a real bug via manual smoke-testing, not by trusting green unit tests alone:**
  `check_roadmap_duplicate_headings` crashed (`ValueError` from `Path.relative_to`) when given a
  non-pre-resolved `repo_root` (reproduced first via a macOS `/var` vs `/private/var` symlink, then
  confirmed with a portable `tmp_path / "unrelated" / ".."` case that doesn't depend on OS-specific symlink
  behavior) — `find_duplicate_roadmap_headings` returns already-resolved directories internally, so an
  unresolved `repo_root` broke the comparison. `scripts/check_doc_links.py` always passes an already-resolved
  root today, so this wasn't reachable in the current CI wiring, but the function itself was fragile. Fixed
  by resolving `repo_root` before the comparison; added a permanent regression test
  (`test_handles_a_repo_root_that_is_not_pre_resolved`), confirmed red-before-green by temporarily reverting
  the fix and re-running.
- Dogfooded against this repo's own real roadmap (259 packages): clean, as expected post-pre-flight.
- **Result:** full repo test suite green, `ruff check` clean, doc-link checker clean (both checks). Noted,
  not fixed (unrelated, pre-existing, confirmed flaky by re-run in isolation and in the full suite twice):
  `tests/benchmark/test_search_scale.py::test_search_latency_at_10k_memories` intermittently raises a
  `sqlite3.IntegrityError: UNIQUE constraint failed: memories.id` under full-suite load — out of scope for
  this patch, flagging for separate attention.

### P4 — Authoring contract + template + skill guidance
- Document the canonical candidate-table grammar `| Code | Story | Type | Outcome | Status |` (header must
  contain code/story/type/status) in the DS index template under `docs/project/roadmap/templates/…` and in
  mm-build authoring guidance, so hand-authored DS packages are Expand-compatible by construction.

### Security cross-cut — ✅ done
- `is_relative_to(roadmap_root)` enforced in `create_story_directory` (reuses the `_target_path` precedent).
  `kebab_slug` stays the only slugger for path components. TDD:
  `test_stays_within_roadmap_root_for_an_adversarial_title` in `test_story_paths.py`.

---

## Test matrix

1. ✅ **Resolve-existing (dotted, primary — would have caught this):** implemented as
   `test_expand_resolves_authored_dotted_code_package_reusing_it` +
   `test_expand_resolves_by_heading_content_not_by_folder_name` (the latter also directly proves the
   heading-over-folder-name design decision). Both written red-first, confirmed failing for the correct
   reason pre-fix, green post-fix.
2. ✅ **Fallback-create (dotted), parent named from the root snapshot only:** covered by the (now updated)
   pre-existing `test_build_plan_item_renders_checkpoint_and_updates_cursor` (legacy bullet grammar) and
   `test_build_pull_delivery_story_prepares_and_expands` (table grammar) — no dedicated new test written for
   this case, since real pre-existing coverage already exercises it end to end through the CLI.
3. ✅ **Unparseable-table:** implemented as `test_expand_blocks_on_unparseable_candidate_table_for_resolved_package`
   (lifecycle) and `test_build_pull_delivery_story_blocks_on_unparseable_candidate_table` (CLI, real entry
   point). Also added an ambiguity counterpart (`_blocks_on_ambiguous_duplicate_heading`, both levels), one
   test beyond the original matrix item, since P2 groups both conditions under one fail-loud path.
4. ✅ **Path-escape:** `test_stays_within_roadmap_root_for_an_adversarial_title` in `test_story_paths.py`
   (`../../../etc/passwd` + a 200-char overlong segment; asserts `is_relative_to(roadmap_root)`).
5. ✅ **Duplicate-heading guard (CI):** `find_duplicate_roadmap_headings` (story_paths.py) +
   `check_roadmap_duplicate_headings` (docs_lint.py), wired into `scripts/check_doc_links.py`, self-tested,
   dogfooded clean against this repo's real 259-package roadmap. `resolve_story_directory`'s runtime
   `StoryPackageAmbiguityError` (P1/P2) enforces "exactly one" at resolution time; P3 adds the static,
   pre-runtime CI guard on top -- two independent layers, per the devops-engineer persona note.
6. ✅ **Lifecycle consistency:** `cli._canonical_package_path` and `expand_delivery_story` now share the exact
   same `resolve_story_directory`/`create_story_directory` — provable by construction (one resolver, one
   creator, both call sites), and exercised indirectly by the full CLI + builder test suite.

All existing single-segment Expand tests remain green (common-path regression safety confirmed).

---

## Multi-persona notes

- **quality-assurance** — owns the escape analysis (§3) and the matrix above. Highest-value test is #1.
- **engineer** (primary) — DRY consolidation; heading-based resolve; parent-resolve create; delete both derive
  paths. Reuse `_story_folder_name`, `HEADING_RE`, `is_legacy_path`, `_index_code`.
- **database-architect** — cursor is code-keyed; identity key is the heading code; enforce one code → exactly
  one package (replace `min(by path length)` tiebreak with "exactly one or raise"). No migration.
- **security-engineer** — `kebab_slug` invariant confirmed; enforce `is_relative_to(roadmap_root)` on resolve
  + create; heading-based resolve shrinks the traversal surface.
- **devops-engineer** — extend `docs_lint.py` via existing `docs.yml`; two-layer guard (static heading
  uniqueness + runtime "exactly one"); single patch on `main`; keep `tests.yml` green.
- **ai-engineer** — deterministic scaffolding inside the agent loop; resolve deterministically, fail loud
  rather than fabricate (prevents orphaned artifacts the agent reasons over).
- **prompt-engineer** — `EXPAND_BLOCKED` must be a wrapped `transport=verbatim` surface, not a traceback;
  keep the EXPAND DECISION "materialized" list honest (reused vs created); own the P4 authoring contract.

---

## Key code locations (as implemented)

| What | Location |
|---|---|
| **New shared resolver module** | `src/memory/builder/story_paths.py` — `resolve_story_directory`, `create_story_directory`, `story_folder_name`, `title_leaf`, `find_duplicate_roadmap_headings`, `StoryPackageAmbiguityError` |
| Expand wiring (was: defective derivation) | `src/memory/builder/lifecycle.py:426` `expand_delivery_story` — `_artifact_directory` deleted |
| Fabricated-US1 fallback (unchanged, still gated by `_parse_candidate_stories`) | `lifecycle.py` empty-children branch |
| Candidate-table parser + required header | `lifecycle.py` `_parse_candidate_stories` (header check `{code,story,type,status}`) |
| CLI resolve-first (refactored onto shared) | `cli/build.py` `_canonical_package_path` — `_find_existing_package_path` + `_roadmap_title_parts` deleted |
| CLI plan-path callers (unchanged) | `cli/build.py` `_plan_artifact_path`; `_checkpoint_artifact_path` |
| Root-snapshot lookup (reused, not reimplemented) | `pull_candidates.py` `inspect_roadmap_snapshot` / `_snapshot_items_from_content` (handles both CV grammars) |
| Shared heading/legacy grammar (extended) | `builder/roadmap_grammar.py` `HEADING_RE` (now `[A-Za-z0-9.\-]+`), `is_legacy_path` |
| Path-escape guard | `story_paths.create_story_directory` (`is_relative_to`), precedent in `builder/template_generation.py` `_target_path` |
| Cursor read/write (code-keyed) | `builder/delivery_cursor.py` `get/set_delivery_cursor` (`child_work_items`) |
| Slugger invariant | `memory/utils.py:12` `kebab_slug` |
| CI hook + self-test (P3, done) | `src/memory/docs_lint.py` `DuplicateRoadmapHeading`/`check_roadmap_duplicate_headings`; `scripts/check_doc_links.py`; `tests/unit/memory/test_docs_lint.py`; `.github/workflows/docs.yml` (unchanged, already triggers) |
| Direct unit tests for `story_paths.py` (new, closed a P1 gap) | `tests/unit/memory/builder/test_story_paths.py` |
| Pre-flight fix: retitled historical file | `docs/project/roadmap/cv20-builder-mode-evolution/cv20-ds4-story-lifecycle-runtime/cv20-ds4-us2-plan-checkpoint-gate/index.md` |
| New/updated Expand tests | `tests/unit/memory/builder/test_lifecycle.py` (2 new, after `test_expand_handles_paragraph_length_child_titles`) |
| Updated CLI test fixtures | `tests/unit/memory/cli/test_build.py` (4 fixtures: 3 bare-heading, 1 chain-title → realistic snapshot) |
| Updated DRY-consolidation guard | `tests/unit/memory/test_utils.py` `TestSlugConsolidation` |

---

## Out of scope (per Navigator)

- Port-branch P0: deleting the divergent DS7 tree and fixing the authored DS7 candidate table in
  `cv22-typescript-core-port/cv22-ds7-command-burn-down/index.md`.
- Any `mirror-ts-core` branch/journey work and `oracle-baseline.json` registration (Builder tree not yet
  ported; revisit when CV22.DS7 is ported).
