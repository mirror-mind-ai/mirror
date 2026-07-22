# Handoff — Ariad Expand Scaffolder Path-Divergence Fix

**Status:** Ready to implement (analysis + plan complete; no fix applied yet)
**Severity:** High — recurring, corrupts the roadmap tree on every Delivery Story pull
**Class:** Second occurrence of the CR048 defect (first was DS6.TS5) — this is a
class bug, not a one-off; it must be fixed in code, not hand-relocated again.
**Where to fix:** Python core `src/memory/builder/` on `main` (in this
`mirror-dev` workspace). Python is maintenance-only for the TS port, but this is
an Ariad/Builder-method (CV20) defect, so it lands on `main` and syncs to the
`mirror-ts-core` branch via the normal maintenance-sync merge.
**Discovered in:** the `mirror-ts-core` journey (CV22 TS Core Port) while pulling
`CV22.DS7`. All code locations below exist identically on `main` (the port branch
had just merged the v0.31.3 Python core).

---

## TL;DR

When Ariad **Expand**s a Delivery Story, it **derives** the story's doc folder by
doing arithmetic on the item code + title (`_artifact_directory()` in
`lifecycle.py`) instead of **resolving** the real, already-authored package on
disk (which the pull-candidates scanner already knows how to do). The derivation
is also just wrong: it assumes `title` is a `/`-joined chain of ancestor titles
(CV-title / DS-title), but the delivery cursor only stores the **leaf** DS title.
So the single leaf title lands on the **CV** folder level and the DS level gets no
title — producing a brand-new, divergent CV folder instead of nesting under the
existing one.

Fix direction: **resolve, don't derive.** Expand should locate the authored
package by matching the item code against roadmap `index.md` headings, reuse it,
and only *create* a package when none exists — and even then nest it under the
**resolved** parent CV folder with canonical `<code>-<title-slug>` naming. Add a
loud failure when a package exists but its candidate table can't be parsed, and a
CI guard that rejects duplicate `# <code> —` headings so this class can never
recur silently.

---

## Reproduction

Active journey `mirror-ts-core`, Ariad adopted, `CV22.DS6` Done. A full DS7
package was hand-authored first at the correct convention path
(`docs/project/roadmap/cv22-typescript-core-port/cv22-ds7-command-burn-down/index.md`)
and linked from the CV22 index. Then:

```bash
uv run python -m memory build pull-item --method ariad \
  --journey mirror-ts-core \
  --item-code CV22.DS7 \
  --item-title "Command Burn-Down & Re-homed Feature Work" \
  --item-level delivery_story \
  --why-now "..."
```

Pull auto-ran Prepare, then Expand.

**Observed (wrong).** Expand created a duplicate, divergent tree and ignored the
authored package:

```
docs/project/roadmap/
  cv22-command-burn-down-re-homed-feature-work/      ← NEW, wrong: DS title used as a CV folder
    cv22-ds7/                                        ← wrong: bare code, no title
      index.md                                       ← generic skeleton DS package
      cv22-ds7-us1-command-burn-down-re-homed-feature-work/
        index.md                                     ← placeholder US1 ("As a user, I want to Command Burn-Down…")
```

**Expected (right).** Expand should have resolved and reused:

```
docs/project/roadmap/
  cv22-typescript-core-port/                         ← existing CV folder (CV22 = "TypeScript Core Port")
    cv22-ds7-command-burn-down/
      index.md                                       ← the authored DS package (with real candidate stories)
      <child stories materialized HERE>
```

---

## Root Cause (code-grounded)

### The defective function

`src/memory/builder/lifecycle.py` → `_artifact_directory()` (≈ line 1822):

```python
def _artifact_directory(project_path: Path, code: str, title: str) -> Path:
    parts = code.lower().replace("_", "-").split(".")
    titles = tuple(part.strip() for part in title.split("/") if part.strip())
    path = project_path / "docs" / "project" / "roadmap"
    accumulated: list[str] = []
    for index, part in enumerate(parts):
        accumulated.append(part)
        prefix = "-".join(accumulated)
        title_slug = kebab_slug(titles[index]) if index < len(titles) else ""
        path = path / (f"{prefix}-{title_slug}" if title_slug else prefix)
    return path
```

### Trace for `code="CV22.DS7"`, `title="Command Burn-Down & Re-homed Feature Work"`

- `parts = ["cv22", "ds7"]`
- `titles = ("Command Burn-Down & Re-homed Feature Work",)` — **one** element (the
  cursor stores only the DS's leaf title; there is no `/` chain).
- index 0 (`cv22`): `title_slug = kebab_slug(titles[0])` →
  `…/cv22-command-burn-down-re-homed-feature-work`
- index 1 (`ds7`): `index (1) >= len(titles) (1)` → `title_slug = ""` →
  `…/cv22-ds7`
- Result: `roadmap/cv22-command-burn-down-re-homed-feature-work/cv22-ds7` ✗

The function assumes `title` is `"TypeScript Core Port / Command Burn-Down & …"`
(a per-level chain). It is only ever given the leaf. Every level is therefore
misaligned: the leaf title decorates the **root** level, deeper levels degrade to
bare codes.

### Two compounding defects

1. **Derive-instead-of-resolve (primary).** Expand fabricates a path from
   code+title rather than resolving the authored package's real location. A
   sibling module already resolves it correctly — `pull_candidates.py`
   `inspect_pull_candidates()` walks `roadmap_root.rglob("index.md")` and matches
   each file's `# <code> — <title>` heading via `roadmap_grammar.HEADING_RE`,
   yielding `PullCandidate(code, …, path)`. Expand should use the same resolution.
   Any divergence between the fabricated path and the authored path *guarantees* a
   duplicate + an orphan.

2. **Title-chain assumption mismatch.** `_artifact_directory` expects a
   `/`-joined ancestor-title chain but receives a leaf title, so it can never
   reconstruct the real CV folder name (`cv22-typescript-core-port`) — that name
   is the **CV's** title, which the DS cursor simply does not carry.

> **Note on CR048.** The first occurrence (DS6.TS5) produced
> `cv22/cv22-ds6/cv22-ds6-ts5` — *all bare codes, no titles*. Today's path
> carries the leaf title on the wrong level. That strongly suggests
> `_artifact_directory` was **partially patched after CR048** (title-slugging was
> added) without supplying the ancestor-title chain — turning one wrong path into
> a *different* wrong path. A partial fix; the resolve-don't-derive fix supersedes
> both.

### Consequence chain (why the US1 is also garbage)

`expand_delivery_story()` (≈ line 406):

1. `ds_dir = _artifact_directory(...)` → divergent path.
2. `ds_index = ds_dir / "index.md"`; `ds_exists = ds_index.exists()` → **False**
   (authored index is elsewhere).
3. `children = _parse_candidate_stories(...) if ds_exists else []` → **[]**.
4. Empty-children branch fabricates `recommended_code = f"{active_item}.US1"` and
   `recommended_title = _title_leaf(title)`, then writes a skeleton DS `index.md`
   and a generic US1 at the divergent path.
5. Cursor updated with `child_work_items = ("CV22.DS7.US1",)` — **codes, not
   paths**.

### Secondary defect — authored-package grammar coupling

Even with the path fixed, Expand would still fabricate a US1 here, because
`_parse_candidate_stories()` (≈ line 550) only recognizes a table whose header
contains `code`, `story`, `type`, `status`:

```python
if {"code", "story", "type", "status"}.issubset(lowered):
```

The hand-authored DS7 package used `| Family | Scope | Type | Risk |` (no
`Code`/`Story`/`Status`), so the parser returns `[]` and Expand invents a generic
US1. DS6's package used the canonical `| Code | Story | Type | Outcome | Status |`
header, which is why its expansion behaved. **There is an implicit contract**
between hand-authored DS packages and the Expand parser that is currently
undocumented and unenforced. When Expand finds a package but can't parse
candidates, it should **fail loudly**, not silently fabricate at a fabricated
path.

---

## Multi-Persona Analysis

### ◇ engineer (primary owner)
- The bug is a **derive-vs-resolve** design error localized to Expand.
  `_artifact_directory()` has exactly **one caller** (`expand_delivery_story`,
  line 424), so the core fix is contained — but see the database-architect note
  on auditing downstream stages that must also locate the package.
- `_story_folder_name(code, title)` (≈ 1835) is *correct*
  (`<code>-<title-slug>`); reuse it for child folders. The defect is purely the
  ancestor-path assembly in `_artifact_directory`.
- Preferred fix: introduce a `resolve_story_directory(project_path, code)` that
  scans the roadmap tree for the `index.md` whose heading code equals `code`
  (reuse `roadmap_grammar.HEADING_RE` and the pull-candidates walk). Expand uses
  it to find the authored package; `_artifact_directory` is demoted to a
  *fallback creator* used only when no package exists — and its fallback must
  nest under the **resolved parent** (resolve `CV22`'s folder, append
  `<ds-code>-<ds-title-slug>`), never re-slug one title across levels.

### ◇ database-architect (cursor / state model)
- **Verified: the delivery cursor is code-keyed, not path-keyed.** Probing the
  live journey DB (`~/.mirror-minds/vinicius-ts/memory.db`): the divergent doc
  path appears **0** times; the item code `CV22.DS7` appears **7** times.
  `child_work_items` stores codes (`CV22.DS7.US1`). **No data migration is needed**
  and relocating/deleting the divergent doc tree cannot desync the runtime — which
  is exactly why CR048 was a doc-only fix.
- Action item: `_artifact_directory` is only *called* by Expand, but Plan /
  Validate / Done must also locate the story package. Audit how those stages
  resolve the path (they should route through the same `resolve_story_directory`)
  so a corrected Expand path stays consistent through the whole lifecycle. If they
  independently re-derive, fix them too.

### ◇ devops-engineer (recurrence guardrail + rollout)
- **Add a CI roadmap-integrity check** so this class fails the build instead of
  being hand-fixed each DS: reject any two `index.md` files that share the same
  `# <code> —` heading (duplicate-package detector). This would have caught both
  CR048 and DS7. Extend the existing repo doc-link checker referenced in the CR048
  commit (`78f3ee6`).
- Optional stronger guard: every code referenced by a delivery cursor must resolve
  to exactly one on-disk package.
- **Rollout:** fix lands on `main` here in `mirror-dev`; it then flows to the
  `mirror-ts-core` branch via a maintenance-sync merge. Register the touched
  Python oracle(s) in the TS port's `ts/parity/oracle-baseline.json` expectations
  if any ported surface depends on them (the Builder tree is not yet ported —
  CV22.DS7 — so likely no TS oracle impact today; note it for the DS7 port).

### ◇ security-engineer (path derivation from free text)
- Deriving filesystem paths from free-text titles is a traversal surface.
  Mitigated today because `memory.utils.kebab_slug` strips to `[a-z0-9-]` with an
  80-char cap, so `../` and separators are neutralized — keep that invariant.
- The new resolver will `rglob` and read roadmap files: keep the existing
  `is_relative_to(root)` escape guard (see `_target_path` in
  `template_generation.py`) so resolution and any creation stay within
  `roadmap_root`. Low risk, but assert it in a test.

### ◇ quality-assurance (how it escaped + test matrix)
- **How it escaped:** no test asserts that Expand *resolves the authored
  package's real directory*; existing tests likely construct the DS via the same
  derivation and check self-consistency, so a wrong-but-consistent path passes.
  There is no duplicate-package detector.
- Required regression tests (see Test Plan). The highest-value one: author a DS
  package at a realistic CV folder (`cv22-typescript-core-port/cv22-ds7-…`), run
  Expand, and assert (a) it reuses that dir, (b) it parses the authored candidate
  table, (c) it creates **no** `cv22-<title>/` divergent tree.

### ◇ ai-engineer (agent-in-the-loop posture)
- No model in the loop here — this is deterministic scaffolding, so most of this
  lens is N/A. One real point: this tool runs **inside an agent Builder loop**.
  Silent path fabrication produces orphaned artifacts an agent may then reason
  over and act on, eroding Navigator trust. The correct posture for
  agent-invoked tooling is **resolve deterministically, and fail loudly rather
  than fabricate** — which the fix delivers.

---

## Fix Plan (phased)

### P0 — Clean up the current DS7 mess (do first, in the fix session)
This also serves as a live before/after for the code fix.
1. Delete the divergent tree
   `docs/project/roadmap/cv22-command-burn-down-re-homed-feature-work/` (two
   generated stub files; nothing to preserve). Safe — cursor is code-keyed.
2. Fix the **authored** DS7 candidate table (in the port branch package
   `cv22-typescript-core-port/cv22-ds7-command-burn-down/index.md`) to the
   canonical grammar `| Code | Story | Type | Outcome | Status |` so Expand can
   consume it. (It currently uses `| Family | Scope | Type | Risk |`.) Assign real
   child codes (`CV22.DS7.US1…`/`TS…`) to the risk-first families.
3. Re-run Expand and confirm it resolves the authored dir, parses the real
   children, and creates no divergent tree.

### P1 — Core code fix: resolve, don't derive
1. Add `resolve_story_directory(project_path, code) -> Path | None` that walks
   `roadmap_root.rglob("index.md")`, matches `HEADING_RE` code == `code` (skip
   `is_legacy_path`), and returns that file's parent. Reuse/factor the
   pull-candidates walk so both share one resolver.
2. In `expand_delivery_story`, replace
   `ds_dir = _artifact_directory(project_path, existing.active_item, title)` with
   a resolve-first lookup; on hit, use the resolved dir.
3. Demote `_artifact_directory` to a **fallback creator** used only when
   resolution misses: it must resolve the parent (the CV `index.md` folder) and
   append `<ds-code>-<ds-title-slug>` via `_story_folder_name` — no `/`-title-chain
   assumption. Consider deleting the multi-level accumulation entirely.

### P2 — Fail loud on ambiguity
- If a DS package is resolved but `_parse_candidate_stories` returns `[]`, emit an
  explicit error/surface ("authored DS package at `<path>` has no canonical
  `| Code | Story | Type | … | Status |` candidate table; refusing to fabricate")
  and stop. Never write a divergent skeleton.

### P3 — CI guardrail (kill the class)
- Add a roadmap-integrity check (extend the doc-link checker): no two `index.md`
  may share a `# <code> —` heading. Wire into CI. Optionally: every cursor code
  resolves to exactly one package.

### P4 — Authoring contract + template
- Document the canonical candidate-table grammar in the DS index template
  (`docs/project/roadmap/templates/delivery-story-index.md`) and the mm-build
  authoring guidance, so hand-authored DS packages are Expand-compatible by
  construction.

### Tracking
- File as a **Refinement CR against the Ariad/Builder method (CV20)** — root
  cause: Expand path derivation; supersedes the CR048 hand-relocate. Reference
  both occurrences (DS6.TS5, CV22.DS7).

---

## Test Plan

1. **Resolve-existing:** authored DS package at a real CV folder → Expand reuses
   it, parses its candidate table, materializes children under it, creates no
   divergent folder. (Primary regression; would have caught this bug.)
2. **Fallback-create:** pull a DS with **no** authored package → Expand creates it
   under the resolved parent CV folder with `<code>-<title-slug>` naming (assert
   the exact path; assert no `cv<major>-<leaf-title>/` folder).
3. **Unparseable-table:** authored package present but non-canonical table →
   Expand fails loudly, writes nothing.
4. **Path-escape:** malicious/pathological title (`../`, slashes, >80 chars) →
   stays within `roadmap_root` (assert `is_relative_to`).
5. **Duplicate-heading CI check:** a fixture with two `# CVx.DSy —` headings fails
   the integrity check.
6. **Lifecycle consistency:** after a corrected Expand, Plan/Validate/Done locate
   the same resolved package (no re-divergence downstream).

---

## Cursor-Safety Note (verified, not assumed)

```
DB: ~/.mirror-minds/vinicius-ts/memory.db
  hits for 'cv22-command-burn-down-re-homed-feature-work' (divergent path): 0
  hits for 'CV22.DS7' (item code):                                          7
```

The runtime tracks the Delivery Story by **code**. Deleting/relocating the
divergent doc tree is a pure doc-hygiene operation with no state impact — same
conclusion as the CR048 commit (`78f3ee6`), which touched zero state files.

---

## Key Code Locations

| What | Location |
|---|---|
| Defective path derivation | `src/memory/builder/lifecycle.py` → `_artifact_directory()` (≈ 1822) |
| Only caller | same file → `expand_delivery_story()` (≈ 406, call at ≈ 424) |
| Correct child-folder namer (reuse) | same file → `_story_folder_name()` (≈ 1835) |
| Candidate-table parser + required header | same file → `_parse_candidate_stories()` (≈ 550) |
| Fabricated-US1 fallback | same file → empty-children branch (≈ 458–486), `_title_leaf()` (≈ 2169) |
| Resolver to reuse (code → real path) | `src/memory/builder/pull_candidates.py` → `inspect_pull_candidates()`, `_candidates_from_file()` |
| Shared heading/status regex | `src/memory/builder/roadmap_grammar.py` → `HEADING_RE`, `is_legacy_path`, `strip_markdown_link` |
| Path-escape guard precedent | `src/memory/builder/template_generation.py` → `_target_path()` |
| Cursor read/write (code-keyed) | `src/memory/builder/delivery_cursor.py` → `get_delivery_cursor` / `set_delivery_cursor` (`child_work_items`) |
| CR048 precedent (doc-only relocate) | commit `78f3ee6` on the `mirror-ts-core` branch |

---

## Open Questions / Decisions

1. **Delete vs keep `_artifact_directory`'s multi-level accumulation.** Recommend
   deleting it and letting the fallback creator use resolve-parent +
   `_story_folder_name`. Confirm no other roadmap grammar depends on the old
   multi-level behavior.
2. **Where the fix is tracked** — a CV20 refinement CR vs a plain `main`
   maintenance patch. Recommend a CV20 CR since it's an Ariad-method defect, then
   maintenance-sync to `mirror-ts-core`.
3. **Do we also normalize existing divergent artifacts repo-wide?** Only DS6.TS5
   (already relocated) and this DS7 are known; the CI duplicate-heading check will
   surface any others.
