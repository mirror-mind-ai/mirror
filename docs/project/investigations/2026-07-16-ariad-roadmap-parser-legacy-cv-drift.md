# Investigation — Ariad roadmap parser recommends legacy CVs and mis-expands DS roadmaps

- **Date:** 2026-07-16
- **Area:** mirror-core / Builder Mode (Ariad) roadmap reader
- **Status:** Open
- **Severity:** Medium — steers the Navigator toward retired work; degrades Expand fidelity
- **Found while:** working the `uncle-vinny` journey (Chapter 7 migration), pulling DS-35
- **Scope:** this is a Mirror Mind (`memory` core) defect, not an uncle-vinny defect.
  uncle-vinny's roadmap is correct; the parser fails to read its format.

## Summary

For a journey whose roadmap was imported to the Ariad **Delivery Story** format
(hyphenated `DS-NN` codes, `Chapter N` sections, `| Code | Delivery Story |
Status |` tables), the Ariad roadmap reader:

1. recommends a **legacy** CV (from `docs/project/roadmap/legacy/**`) as the pull
   candidate, and reports the real DS backlog as empty; and
2. on Expand, fabricates a **generic boilerplate child** instead of importing the
   Delivery Story's documented candidate stories.

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

## Impact

- The Navigator is steered toward **retired** legacy work as the recommended pull.
- Any journey migrated to the DS format (via `ariad-adoption` legacy import) has an
  invisible Delivery backlog and an empty roadmap snapshot/position.
- Expand produces low-fidelity child packages that drop the real decomposition, so
  `story_by_story` flow operates on a placeholder.

## Suggested fix directions (not executed)

1. **Exclude `legacy/`** from candidate/position globs (retired history is never a
   pull candidate).
2. **Accept hyphenated codes** in `_HEADING_RE` (e.g. allow `-` in the code class)
   so `DS-35` / `DS-35.US-1` parse.
3. **Recognize the DS roadmap grammar** in the snapshot parser:
   `| Code | Delivery Story | Status |` tables under `## Chapter N —` sections,
   and the per-DS `| Code | Story | Type | Status |` candidate table for Expand.
4. Add fixtures for a DS-format roadmap (hyphenated codes, Chapter sections,
   Delivery Story tables) to lock the behavior in.

## Provenance

Observed 2026-07-16 during `uncle-vinny` DS-35 pull. Related uncle-vinny
decisions: `docs/project/roadmap/ariad-adoption.md` (legacy CV → DS import).
Workaround used: explicit `pull-item --item-code DS-35` by code.
