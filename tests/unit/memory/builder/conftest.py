"""Shared fixtures for Builder roadmap-grammar tests."""

from __future__ import annotations

from pathlib import Path

import pytest


def _write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


@pytest.fixture
def make_ds_roadmap():
    """Build a Delivery Story grammar roadmap tree mirroring uncle-vinny's shape.

    Returns the project root (tmp_path). The tree contains:
      - a roadmap index.md with ``## Chapter N —`` sections and
        ``| Code | Delivery Story | Status |`` tables;
      - per-DS index files (``ds-34`` done, ``ds-35`` planned with a 4-column
        candidate table, ``ds-36`` planned);
      - a retired ``legacy/cv5-learning-loop/index.md`` that must never be a
        live candidate.
    """

    def _build(tmp_path: Path) -> Path:
        roadmap = tmp_path / "docs" / "project" / "roadmap"
        _write(
            roadmap / "index.md",
            """# Roadmap

## Chapter 6 — Data Foundation — ✅ Done

| Code | Delivery Story | Status |
|------|----------------|--------|
| [DS-34](ds-34-data-model-migration/index.md) | Data Model Migration | ✅ Done |

## Chapter 7 — Platform Migration to Next.js (ts-core) — 🟡 Planned

| Code | Delivery Story | Status |
|------|----------------|--------|
| [DS-35](ds-35-application-admin-parity/index.md) | Application & Admin Parity | 🟡 Planned |
| [DS-36](ds-36-billing-parity/index.md) | Billing Parity | 🟡 Planned |
""",
        )
        _write(
            roadmap / "ds-34-data-model-migration" / "index.md",
            "# DS-34 — Data Model Migration\n\n**Status:** ✅ Done\n",
        )
        _write(
            roadmap / "ds-35-application-admin-parity" / "index.md",
            """# DS-35 — Application & Admin Parity

**Status:** 🟡 Planned

---

## Candidate Stories

| Code | Story | Type | Status |
|------|-------|------|--------|
| DS-35.US-1 | Port the application step flow | User Story | 🟡 Planned |
| DS-35.US-2 | Port the review step | User Story | 🟡 Planned |
| DS-35.TS-1 | Admin authentication parity | Technical Story | 🟡 Planned |
| DS-35.TS-2 | Admin data grid parity | Technical Story | 🟡 Planned |
""",
        )
        _write(
            roadmap / "ds-36-billing-parity" / "index.md",
            "# DS-36 — Billing Parity\n\n**Status:** 🟡 Planned\n",
        )
        _write(
            roadmap / "legacy" / "cv5-learning-loop" / "index.md",
            "# CV5 — Learning Loop\n\n**Status:** Planned\n",
        )
        return tmp_path

    return _build
