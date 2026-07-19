# Plan — CV20.DS13 Delivery Story Grammar Roadmap Support

## Intent

Teach the Ariad Builder runtime the Delivery Story roadmap grammar without
breaking the CV grammar. The parser currently understands only the legacy
`CV → Epic → Story` shape; a DS-grammar roadmap (hyphenated `DS-NN` codes,
`## Chapter N —` sections, `| Code | Delivery Story | Status |` tables) breaks
three surfaces: pull candidates, Delivery Story expansion, and the delivery
cursor's child work packages.

## Confirmed Root Causes (verified against source)

1. **`pull_candidates.py`**
   - `inspect_pull_candidates` globs all `index.md` including `legacy/**`
     (`rglob("index.md")`, no exclusion) — retired CVs become live candidates.
   - `_HEADING_RE = ^#\s+([A-Z0-9.]+)\s+[—-]\s+...` excludes hyphens; `DS-35`
     never matches, so Delivery Stories are invisible.
   - `_snapshot_items_from_content` recognizes only the CV table and `## CVn:`
     fallback; DS tables under `## Chapter N —` produce no items.
   - **Missed by the handoff:** `_level_for` classifies a code as
     `delivery_story` via `".DS" in code`. Top-level `DS-35` has no dot, so it
     is classified `cv`; `_recommend` never prefers `cv`, so DS-35 would only
     surface via the `candidates[0]` fallback in `rglob` order.

2. **`roadmap_position.py`** — shares the same hyphen-excluding `_HEADING_RE`,
   has its own un-filtered `rglob` (a legacy Active CV could win position), and
   only treats `Active`/`🟢 Active` as a position.

3. **`lifecycle.py : expand_delivery_story`** — hardcodes
   `recommended_code = f"{active_item}.US1"`, materializes a single synthetic
   package, ignores the DS index candidate table, and forwards
   `child_work_items=existing.child_work_items` (never repopulated).
   - **Missed by the handoff:** the generated `_render_delivery_story_index`
     emits a **5-column** candidate table (`Code | Story | Type | Outcome |
     Status`), while `uncle-vinny` handwrites a **4-column** table
     (`Code | Story | Type | Status`). The Expand parser must be
     **header-driven**, not positional.

4. **Cursor freshness** — `pull_lifecycle_item` also forwards
   `child_work_items` and `aggregate_checkpoint_status` when the active item
   changes, so a fresh pull inherits the previous item's children even before
   expand.

## Design Decisions

- **Additive, header-driven parsing.** Recognize DS tables by exact header line;
  keep the CV table and `## CVn:` fallback untouched. Accumulate rows across
  multiple tables (do not `break` after the first).
- **Widen the code class** to `[A-Z0-9.\-]+`. Safe for CV codes (no hyphen).
- **`_level_for`** treats `^DS-\d+$` (and existing `.DS`) as `delivery_story`.
- **Cursor freshness (approved).** `pull_lifecycle_item` clears
  `child_work_items` and `aggregate_checkpoint_status` when `active_item`
  changes. Defense in depth beyond the expand fix.
- **Roadmap position (approved: minimal).** Legacy exclusion + hyphen tolerance.
  A pulled-but-planned DS yields `none` by design. Cursor-preferred position is
  a future story.
- **Expand materialization (approved: per child).** Materialize one package per
  **missing** child (never overwrite existing files), using real code/title/type.
  Matches the cross-workspace cleanup expectation.
- **DRY (in-cycle refactor).** Extract shared roadmap-grammar primitives into
  `src/memory/builder/roadmap_grammar.py`. The duplicated regex is the root cause
  of this defect class.

## Work Breakdown

Follows a strict test-first order. Each step: failing tests, then minimal fix.

1. **TS1 — pull candidates** (`pull_candidates.py`): legacy exclusion, hyphen
   regex, `_level_for` DS classification, DS-table snapshot parsing.
2. **TS2 — roadmap position** (`roadmap_position.py`): legacy exclusion, hyphen
   regex, documented `none` for planned DS.
3. **TS3 — expand** (`lifecycle.py`): header-driven candidate-table parsing,
   per-child materialization, `child_work_items` reset, first-pending recommend,
   type-aware renderer, fallback that still resets children.
4. **TS4 — cursor freshness** (`lifecycle.py` pull + `flow_unit.py` assertion):
   pull clears stale state on item change; scope confirmation reflects active DS.
5. **CLI e2e** (`cli/build.py` path): DS-grammar pull→expand end to end.
6. **TS5 — refactor**: shared `roadmap_grammar.py`, both modules consume it.

## Risks & Mitigations

- **CV regression** — mandatory CV-grammar fixtures kept; existing assertions
  unchanged. Full suite green through the refactor.
- **Widened regex over-matching** — codes are roadmap-authored; acceptable.
  Anchored on `^#\s+` heading lines only.
- **`rglob` cost** — unchanged order of magnitude; only adds a path-component
  filter.
- **Existing dirty cursors in the wild** (e.g. `uncle-vinny`) — not migrated by
  this story; documented as separate manual cleanup.
