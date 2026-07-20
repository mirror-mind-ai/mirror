# Investigation — Ariad roadmap parser recommends legacy CVs and mis-expands DS roadmaps

- **Date:** 2026-07-16
- **Area:** mirror-core / Builder Mode (Ariad) roadmap reader
- **Status:** ✅ Resolved by [CV20.DS13](../roadmap/cv20-builder-mode-evolution/cv20-ds13-ds-grammar-roadmap-support/index.md) (`f954417`, 2026-07-17)
- **Severity:** Medium-High — steers the Navigator toward retired work, degrades Expand fidelity, and corrupts live Delivery cursor scope
- **Found while:** working the `uncle-vinny` journey (Chapter 7 migration), pulling DS-35
- **Scope:** this is a Mirror Mind (`memory` core) defect, not an uncle-vinny defect.
  uncle-vinny's roadmap is correct; the parser fails to read its format.

## Resolution

Fixed by **[CV20.DS13 — Delivery Story Grammar Roadmap Support](../roadmap/cv20-builder-mode-evolution/cv20-ds13-ds-grammar-roadmap-support/index.md)**
(`f954417`, 2026-07-17). All three symptoms are resolved; both roadmap grammars
(CV and DS) are now supported additively, guarded by a CV-grammar regression
fixture so Mirror's own roadmap cannot regress.

| Symptom | Resolution |
|---------|------------|
| 1 — legacy CV recommended, empty DS backlog | `pull_candidates`/snapshot exclude `legacy/`, accept hyphenated codes, classify top-level `DS-NN` as `delivery_story`, and read DS tables under `## Chapter N —` sections |
| 2 — Expand fabricates a generic child | `expand_delivery_story` parses the DS index candidate table and materializes one package per missing child with its real code/title/type |
| 3 — stale cursor carryover | `pull_lifecycle_item` clears stale `child_work_items`/`aggregate_checkpoint_status` when replacing a different active item |

Shared grammar primitives were extracted into a `roadmap_grammar` module, and
DS-format fixtures lock the behavior in. The already-dirtied `uncle-vinny` cursor
is separate workspace cleanup, deferred by DS13 as a non-goal.

## Summary

For a journey whose roadmap was imported to the Ariad **Delivery Story** format
(hyphenated `DS-NN` codes, `Chapter N` sections, `| Code | Delivery Story |
Status |` tables), the Ariad roadmap reader:

1. recommends a **legacy** CV (from `docs/project/roadmap/legacy/**`) as the pull
   candidate, and reports the real DS backlog as empty; and
2. on Expand, fabricates a **generic boilerplate child** instead of importing the
   Delivery Story's documented candidate stories; and
3. on the Delivery Story flow-unit scope confirmation, lists the **previous
   Delivery Story's** child work packages as the new item's scope (stale cursor
   carryover).

## Symptoms (observed)

### Symptom 1 — `pull-candidates` recommends a retired legacy CV

`uv run python -m memory build pull-candidates --method ariad` on `uncle-vinny`:

- `ROADMAP SNAPSHOT`: `roadmap field: none`, `Backlog: none`
  (source: `docs/project/roadmap/index.md`).
- `PULL CANDIDATES`: recommended pull =
  `CV5 — Learning Loop [cv] Planned (docs/project/roadmap/legacy/cv5-learning-loop/index.md)`.

Expected: the next live Delivery Story, **DS-35 — Application & Admin Parity**
(`docs/project/roadmap/ds-35-application-admin-parity/index.md`, Status `🟡
Planned`), with the other planned DS-3x as backlog. Legacy CVs are archived
history and should not be pull candidates at all.

### Symptom 2 — Expand fabricates a generic child

`uv run python -m memory build pull-item --method ariad --item-code DS-35
--item-title "Application & Admin Parity" --item-level delivery_story` expanded
DS-35 into a single boilerplate child
(`ds-35-us1-application-admin-parity/index.md`):

> As a user, I want to Application & Admin Parity, So that I can receive the
> value of this story.

Expected: the six candidate stories documented in the DS-35 index's
`| Code | Story | Type | Status |` table (US-1 port application flow, US-2
financial routing, US-3 consent, US-4 admin, TS-1 admin auth parity, TS-2
Playwright suite).

### Symptom 3 — flow-unit scope confirmation shows the previous item's children

`uv run python -m memory build set-flow-unit --method ariad --unit delivery_story`
(active delivery correctly `🟦[DS-35]`) returned a
`DELIVERY_STORY_SCOPE_CONFIRMATION` whose "Work packages in scope" were the eight
children of the **previous, done** Delivery Story:
`DS-34.US-1…US-6`, `DS-34.TS-1`, `DS-34.TS-2`.

Expected: DS-35's six children (`DS-35.US-1…US-4`, `DS-35.TS-1`, `DS-35.TS-2`).
Confirmed by diffing the two DS index candidate tables. The drift has now
escalated from advisory (recommendation) to **live cursor/flow state** used to
build the DS Plan.

## Root cause (confirmed for Symptom 1)

`src/memory/builder/pull_candidates.py`:

- `inspect_pull_candidates` globs `roadmap_root.rglob("index.md")` with **no
  exclusion of `legacy/`**, so archived legacy CV index files are scanned as
  live candidates.
- `_HEADING_RE = r"^#\s+(?P<code>[A-Z0-9.]+)\s+[—-]\s+(?P<title>.+?)\s*$"`. The
  code character class `[A-Z0-9.]+` **excludes `-`**, and the separator requires
  whitespace before the dash. So:
  - `# CV5 — Learning Loop` → matches (code `CV5`), becomes a `[cv]` candidate.
  - `# DS-35 — Application & Admin Parity` → **does not match** (`DS-35` has a
    hyphen; `-35 —` breaks the `\s+[—-]\s+` separator). The Delivery Story is
    invisible to the reader.
- `_snapshot_items_from_content` only recognizes a `| Code | Capability Value |
  Status |` table or `## CVn:` headings. uncle-vinny's index uses
  `| Code | Delivery Story | Status |` tables under `## Chapter N — …` headings,
  so no items are parsed → `roadmap field: none`.

`src/memory/builder/roadmap_position.py` shares the same `_HEADING_RE` and only
treats `Active`/`🟢 Active` as a position, which is why `build load` reports
`roadmap position: none` for a `🟡 Planned` DS.

## Root cause (suspected for Symptom 2)

The Expand path (suspected `src/memory/builder/ariad_method.py`) does not read the
Delivery Story index's `| Code | Story | Type | Status |` candidate table; it
synthesizes a single generic `US1`. Not yet confirmed at source level.

## Root cause (suspected for Symptom 3)

The delivery cursor appears to **retain the prior Delivery Story's child work
packages** when a new DS is pulled/flow-set. Because Expand (Symptom 2) did not
populate DS-35's real children, the scope confirmation falls back to the stale
DS-34 child list held in the cursor. Suspected in the cursor/flow-unit state
handling (`src/memory/builder/flow_unit.py` and the delivery cursor persistence).
Not yet confirmed at source level.

## Impact

- The Navigator is steered toward **retired** legacy work as the recommended pull.
- Any journey migrated to the DS format (via `ariad-adoption` legacy import) has an
  invisible Delivery backlog and an empty roadmap snapshot/position.
- Expand produces low-fidelity child packages that drop the real decomposition, so
  `story_by_story` flow operates on a placeholder.
- A newly pulled Delivery Story inherits the **previous item's** work packages as
  its scope, so the DS Plan is built against the wrong children unless corrected
  by passing explicit `--child` codes.

## Suggested fix directions (executed by CV20.DS13)

1. **Exclude `legacy/`** from candidate/position globs (retired history is never a
   pull candidate).
2. **Accept hyphenated codes** in `_HEADING_RE` (e.g. allow `-` in the code class)
   so `DS-35` / `DS-35.US-1` parse.
3. **Recognize the DS roadmap grammar** in the snapshot parser:
   `| Code | Delivery Story | Status |` tables under `## Chapter N —` sections,
   and the per-DS `| Code | Story | Type | Status |` candidate table for Expand.
4. Add fixtures for a DS-format roadmap (hyphenated codes, Chapter sections,
   Delivery Story tables) to lock the behavior in.
5. Reset/repopulate the delivery cursor's child work packages on Pull/Expand so a
   new Delivery Story never inherits the previous item's children.

## Provenance

Observed 2026-07-16 during `uncle-vinny` DS-35 pull. Related uncle-vinny
decisions: `docs/project/roadmap/ariad-adoption.md` (legacy CV → DS import).
Workarounds used: explicit `pull-item --item-code DS-35` by code; and (planned)
explicit `plan-delivery-story --child DS-35.US-1 … --child DS-35.TS-2` to override
the stale cursor scope.
