[< CV9.E5.S1](index.md)

# Test Guide — Adopt Development Process and Prospective Versioning

This story changes documentation and process. Verification checks coherence, links, versioning claims, and repository cleanliness. It does not require product runtime smoke tests because no runtime behavior changes.

---

## Automated Checks

Run from the repository root:

```bash
uv sync --extra dev
uv run pytest tests/unit/ tests/integration/ -m "not live"
uv run ruff check src/ tests/
uv run ruff format --check src/ tests/
uv run mypy src/memory
git diff --check
```

Expected result: all commands pass.

---

## Documentation Presence Checks

```bash
test -f docs/process/development-guide.md
test -f docs/process/triad.md
test -f docs/process/expand-collapse.md
test -f docs/process/versioning.md
test -f docs/process/release-notes.md
test -f docs/releases/index.md
test -f docs/project/roadmap/cv9-mirror-1-0/cv9-e5-process-versioning-alignment/index.md
test -f docs/project/roadmap/cv9-mirror-1-0/cv9-e5-process-versioning-alignment/cv9-e5-s1-adopt-development-process/index.md
test -f docs/project/roadmap/cv9-mirror-1-0/cv9-e5-process-versioning-alignment/cv9-e5-s1-adopt-development-process/plan.md
test -f docs/project/roadmap/cv9-mirror-1-0/cv9-e5-process-versioning-alignment/cv9-e5-s1-adopt-development-process/test-guide.md
```

Expected result: no output and exit code 0.

---

## Content Checks

Confirm the adopted concepts are present:

```bash
rg "process.*project.*product|project.*product.*process" docs/process/development-guide.md docs/process/triad.md
rg "expand|collapse" docs/process/development-guide.md docs/process/expand-collapse.md
rg "prospective|v0\.7\.0|historical" docs/process/versioning.md docs/releases/index.md docs/project/decisions.md
rg "MAJOR|MINOR|PATCH|Capability Value" docs/process/versioning.md
rg "release notes|docs/releases" docs/process/release-notes.md docs/process/development-guide.md docs/index.md
rg "CV9.E5" docs/project/roadmap/index.md docs/project/roadmap/cv9-mirror-1-0/index.md
```

Expected result: each command returns at least one relevant match.

---

## Stale Claim Checks

These checks should return no matches except historical worklog entries where the old version is explicitly part of history:

```bash
rg "CV9.E4 \(Documentation Polish\) in progress|CV0–CV9.E3 complete" CLAUDE.md docs --glob '!**/test-guide.md' || true
```

Expected result: no active-state matches.

Check that versioning docs do not claim retroactive semantic reinterpretation:

```bash
rg "retroactive|reinterpret" docs/process/versioning.md docs/releases/index.md docs/project/decisions.md
```

Expected result: matches should say old versions are not reinterpreted.

---

## Link Sanity Checks

Use `rg` for obvious broken relative references introduced by this story:

```bash
rg "triad\.md|expand-collapse\.md|versioning\.md|release-notes\.md|docs/releases|releases/index\.md" docs/process docs/index.md docs/project/roadmap/cv9-mirror-1-0 docs/project/decisions.md
```

Then manually open the changed docs and verify each new relative link resolves.

Expected result: all new links point to existing files.

---

## Manual Coherence Review

Read the changed docs in this order:

1. `docs/process/triad.md`
2. `docs/process/expand-collapse.md`
3. `docs/process/versioning.md`
4. `docs/process/release-notes.md`
5. `docs/process/development-guide.md`
6. `docs/project/decisions.md`
7. `docs/project/roadmap/cv9-mirror-1-0/index.md`
8. `docs/project/roadmap/cv9-mirror-1-0/cv9-e5-process-versioning-alignment/index.md`
9. `docs/index.md`

Confirm:

- The docs are in English.
- CV still means Capability Value.
- The model distinguishes Value, Progress, and Work.
- Versioning is explicitly prospective.
- Historical versions through `v0.7.0` remain historical.
- Release notes begin prospectively.
- The story lifecycle contains checkpoints and coherence check.
- Engineering principles are linked, not duplicated wholesale.

---

## Done Criteria

The story can be marked done when:

- All automated checks pass.
- Documentation presence checks pass.
- Content checks pass.
- Manual coherence review finds no unresolved contradiction.
- CV9.E5.S1 status is updated to ✅.
- CV9.E5 and CV9 index statuses are updated.
- Worklog has a completion entry.
