[< CV20](../index.md)

# CV20.DS13 — Delivery Story Grammar Roadmap Support

**Status:** ✅ Done

---

## Outcome

The Ariad Builder runtime reads roadmaps written in the **Delivery Story grammar**
(hyphenated `DS-NN` codes, `## Chapter N —` sections, `| Code | Delivery Story |
Status |` tables) as correctly as it reads the legacy **CV → Epic → Story**
grammar. Pull candidates, roadmap position, Delivery Story expansion, and the
delivery cursor all understand both grammars.

This is a defect-fix Delivery Story. It was discovered while pulling `DS-35` in
the `uncle-vinny` journey after its roadmap was imported to the Delivery Story
grammar: the parser recommended a retired legacy CV, Expand fabricated a generic
`US1` child instead of the documented candidate stories, and the delivery cursor
kept the *previous* Delivery Story's child work packages. The `uncle-vinny`
roadmap is correct; the mirror-core parser could not read its format.

The fix is **additive**: Builder must support the CV grammar **and** the DS
grammar. Mirror's own roadmap uses the CV grammar and must not regress.

---

## Candidate Stories

| Code | Story | Type | Outcome | Status |
|------|-------|------|---------|--------|
| CV20.DS13.TS1 | Pull Candidates DS Grammar | Technical Story | `inspect_pull_candidates` and the roadmap snapshot exclude the `legacy/` archive, accept hyphenated `DS-NN` codes, classify top-level DS codes as `delivery_story`, and read `\| Code \| Delivery Story \| Status \|` tables under `## Chapter N —` sections | ✅ Done |
| CV20.DS13.TS2 | Roadmap Position DS Grammar | Technical Story | `resolve_roadmap_position` excludes the `legacy/` archive and tolerates hyphenated codes; a pulled-but-planned DS yields position `none` by design | ✅ Done |
| CV20.DS13.TS3 | Expand Reads Candidate Table | Technical Story | `expand_delivery_story` parses the active DS index candidate table (header-driven, 4- and 5-column), materializes a package per missing child with the real code/title/type, sets `child_work_items` to the parsed children, and recommends the first pending child | ✅ Done |
| CV20.DS13.TS4 | Delivery Cursor Freshness | Technical Story | Pulling a different active item clears stale `child_work_items` and `aggregate_checkpoint_status`; the flow-unit scope confirmation reflects the active DS's children | ✅ Done |
| CV20.DS13.TS5 | Shared Roadmap Grammar Module | Technical Story | Roadmap-grammar primitives (heading/status regex, legacy filter, link stripping) live in one shared module consumed by pull candidates, roadmap position, and expand | ✅ Done |

---

## Policy Boundary

- **HARD: do not break the CV grammar.** Mirror's own roadmap
  (`docs/project/roadmap/index.md`) uses `| Code | Capability Value | Status |`
  and per-CV pages. Builder Mode on the `mirror` journey depends on it. The fix
  is additive — support CV **and** DS grammars. A CV-grammar regression fixture
  and test are mandatory.
- Do **not** redesign the roadmap format.
- Changes stay inside `src/memory/builder/**` (+ CLI wiring for expand) and tests.
  No CLI contract changes.
- Adding `-` to the code character class is safe for CV codes (they have no hyphen).

---

## Conscious Non-Goals

- No change to the `uncle-vinny` roadmap; that workspace's cleanup is separate.
- No cursor-preferred roadmap position semantics; the minimal file-scan fix is
  chosen for this story, with cursor-preferred position left as a future option.
- No new pullable status: an in-progress DS remains resumed through the cursor,
  not re-pulled as a fresh candidate (consistent with CV behavior).

---

## Done Condition

DS13 is done when:

- pull candidates on a DS-grammar roadmap recommends the next planned `DS-NN`,
  never a `legacy/` CV, with planned DS items as backlog;
- pull candidates and snapshot on a CV-grammar roadmap are unchanged (regression);
- `expand_delivery_story` on a DS with a candidate table materializes the real
  children and sets `recommended_story` to the first pending one;
- after `set-flow-unit --unit delivery_story`, the scope confirmation lists the
  active DS's children, not the previous item's;
- roadmap position is correct (or intentionally `none`) for the pulled DS;
- the full suite, ruff, and mypy are green and CI passes.
