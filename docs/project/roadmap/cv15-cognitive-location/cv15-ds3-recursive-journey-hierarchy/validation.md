[< Story](index.md)

# Validation — CV15.DS3 Recursive Journey Hierarchy

## Automated Evidence

Validated on 2026-08-13:

```text
uv run pytest tests/unit/ tests/integration/ -m "not live"
2424 passed

uv run ruff check src/ tests/
All checks passed

uv run ruff format --check src/ tests/
337 files already formatted

node --check src/memory/web/static/app.js
passed

uv run python scripts/check_doc_links.py
docs links and roadmap headings clean

git diff --check
passed
```

Focused mypy over the changed Python modules passed. Repository-wide mypy
remained at its pre-existing baseline after the one new local finding was fixed.

## Isolated Smoke

Database: `/tmp/mirror-cv15-ds3-ZHDOXx/memory.db`.

Validated:

- a five-level tree;
- full root-to-selected lineage;
- immediate-sibling semantics;
- subtree movement with unchanged ids and `project_path` values;
- indirect-cycle rejection without partial mutation;
- parent removal refusal while children exist;
- associated-leaf removal refusal;
- recursive CLI output;
- recursive Workspace navigation and All Journeys rendering.

Browser evidence: `/tmp/mirror-cv15-ds3-workspace.png`.

## Navigator Homologation

The Navigator validated the capability through normal Mirror conversation in the
development environment by creating `journey-tree-homologation` below
`builder-mode-evolution`, itself below `mirror-mind-development`.

The hierarchy was accepted and returned by the textual Mirror surface. This
homologation exposed one presentation defect: indentation at the third level
crossed Markdown's four-space code-block boundary, causing the deepest journey
to appear inside triple fences. The CLI tree prefix was changed to begin each
nested line with visible `│` connectors, and a regression assertion now rejects
any hierarchy line beginning with four spaces.

Final observed shape:

```text
🚧 mirror-mind-development
│  └─ 🚧 builder-mode-evolution
│  │  └─ 🚧 journey-tree-homologation
```

Navigator result: validated.
