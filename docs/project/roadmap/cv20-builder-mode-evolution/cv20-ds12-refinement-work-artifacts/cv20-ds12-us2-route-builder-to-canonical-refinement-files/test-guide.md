[< Story](index.md)

# Test Guide — CV20.DS12.US2

## Automated Validation

### Canonical index present

Prove with focused tests that:

- detection uses only `<project>/docs/project/refinement/index.md`;
- Builder Orientation names project files and the relative index path;
- Builder Resume names the same authority;
- neither path requests a SQLite Workbench snapshot;
- stale legacy RS/CR titles, counts, and cursor values do not appear;
- no Markdown parser or projection is introduced.

### Canonical index absent

Preserve existing coverage proving that:

- Builder Resume still renders active legacy RS/CR state;
- Orientation still offers legacy capture/continuation guidance;
- existing Workbench commands and storage behavior remain unchanged.

### Commands

Run the exact focused test paths selected during TDD, followed by:

```bash
uv run ruff check <changed-python-and-test-paths>
uv run mypy <changed-python-paths>
python scripts/check_doc_links.py
git diff --check
```

Review changed paths and confirm that no files under Workbench storage, database
migrations, TypeScript schema handling, or `docs/project/refinement/` changed.

## E2E Decision

**Required** because the behavior crosses a runtime surface and the Builder skill's
natural-language routing.

## Navigator Validation

In a reloaded session for this project:

1. Activate Builder and confirm its Refinement field points to
   `docs/project/refinement/index.md` rather than presenting SQLite state.
2. Ask to inspect current Refinement work. Expected: Builder reads the canonical files
   and identifies their current RS/CR focus without running Workbench commands.
3. Exercise one bounded mutable file-first operation, preferably in a disposable fixture.
   If a deterministic, local, meaning-preserving defect blocks the requested operation,
   expected: Builder repairs it and reports the repair afterward without a redundant
   authorization prompt.
4. Ask only to inspect a malformed disposable fixture. Expected: Builder reports and
   recommends a correction but does not mutate a read-only request.
5. Load or inspect a fixture without the canonical index. Expected: legacy guidance
   remains available.

### Pass condition

Project files are the only presented authority when the canonical index exists; no
personal Workbench rows are inspected or mutated; deterministic repairs within mutable
intent are smooth and reported; semantic decisions remain with the Navigator; and the
absent-index legacy path still behaves as before.

### Fail condition

SQLite appears as a competing authority, the runtime silently falls back to it, a
read-only request mutates files, the Driver asks unnecessary permission for an obviously
safe repair, the Driver makes a semantic choice without authorization, or compatibility
breaks for a project without the index.

## Implementation Evidence

- `home_surface.py` detects only the explicit canonical path and returns before any
  Workbench snapshot access.
- `resume_state.py` can exclude compatibility-only Refinement state; the CLI selects
  that path before composing Builder Resume.
- Orientation, Home, and Resume point to project files without parsing the Markdown.
- `.pi/skills/mm-build/SKILL.md` defines file-first routing plus repair-and-report
  behavior; `REFERENCE.md` documents the same boundary while retaining legacy commands.
- Focused tests prove both canonical-index suppression and absent-index compatibility.

Automated results:

```text
uv run pytest -q tests/unit/memory/builder/test_home_surface.py \
  tests/unit/memory/builder/test_resume_state.py \
  tests/unit/memory/builder/test_resume_surface.py \
  tests/unit/memory/cli/test_build.py
95 passed

uv run pytest -q tests/unit/memory/builder \
  tests/unit/memory/cli/test_build.py \
  tests/unit/memory/storage/test_builder_workbench_store.py
298 passed

ruff: passed
mypy (4 changed source files): passed
check_doc_links: passed
git diff --check: passed
```

Navigator-visible E2E passed in a fresh Pi session from the journey clone. Builder named
`docs/project/refinement/index.md` as authority, stated that no SQLite was consulted, and
reported RS001 with CR001 planned, CR002/CR004 captured, and CR003 done. The read-only
request caused no file mutation. Navigator acceptance was recorded.
