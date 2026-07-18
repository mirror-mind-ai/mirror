"""Self-test for the docs link/anchor checker.

Each case here reproduces a failure mode the checker actually caught (or
missed, before being fixed) during the repo-wide docs link audit -- this is
the "checker is a test artifact and must self-test" guard from the
engineering principles doc: without it, this tool rots exactly like
`evals/routing.py` did (D-005 -- fixtures drifting silently out of sync
with reality).
"""

from __future__ import annotations

from pathlib import Path

from memory.docs_lint import (
    check_file,
    check_repo,
    compute_anchors,
    slugify,
    strip_fenced_code,
)


class TestSlugify:
    def test_preserves_underscores(self) -> None:
        # The real bug this guards: docs/reference/configuration.md linked
        # to `#memory-env` for a `## MEMORY_ENV` heading. GitHub's slugger
        # keeps underscores; hyphenating them produces a dead anchor.
        assert slugify("MEMORY_LOG_LLM_CALLS") == "memory_log_llm_calls"

    def test_preserves_existing_hyphens(self) -> None:
        assert slugify("Local-first architecture") == "local-first-architecture"

    def test_strips_punctuation_to_double_hyphen(self) -> None:
        # An em dash (not a real hyphen) is stripped outright, leaving the
        # surrounding spaces to collapse into a double hyphen -- this is
        # the exact pattern behind `D1 — Local-first architecture`.
        assert slugify("D1 — Local-first architecture") == "d1--local-first-architecture"

    def test_strips_backticks_and_slashes(self) -> None:
        assert slugify("`src/memory/skills/`") == "srcmemoryskills"


class TestComputeAnchors:
    def test_disambiguates_duplicate_headings(self) -> None:
        text = "# Intro\n## Setup\n## Setup\n"
        assert compute_anchors(text) == {"intro", "setup", "setup-1"}

    def test_empty_document_has_no_anchors(self) -> None:
        assert compute_anchors("just prose, no headings\n") == set()


class TestStripFencedCode:
    def test_removes_link_like_text_inside_a_fence(self) -> None:
        text = "before\n```\n[fake](nonexistent.md)\n```\nafter\n"
        stripped = strip_fenced_code(text)
        assert "[fake]" not in stripped

    def test_preserves_line_count_so_reported_lines_stay_accurate(self) -> None:
        text = "before\n```\nline\nline\n```\nafter\n"
        stripped = strip_fenced_code(text)
        assert stripped.count("\n") == text.count("\n")


class TestCheckFile:
    def test_flags_missing_target(self, tmp_path: Path) -> None:
        doc = tmp_path / "a.md"
        doc.write_text("See [broken](missing.md).\n")

        problems = check_file(doc, tmp_path)

        assert len(problems) == 1
        assert problems[0].reason == "target file does not exist"
        assert problems[0].line == 1

    def test_accepts_an_existing_target(self, tmp_path: Path) -> None:
        (tmp_path / "b.md").write_text("# B\n")
        doc = tmp_path / "a.md"
        doc.write_text("See [ok](b.md).\n")

        assert check_file(doc, tmp_path) == []

    def test_flags_missing_anchor_in_same_file(self, tmp_path: Path) -> None:
        doc = tmp_path / "a.md"
        doc.write_text("# Real Heading\n\nSee [bad](#nope).\n")

        problems = check_file(doc, tmp_path)

        assert len(problems) == 1
        assert problems[0].reason == "anchor not found in this file"

    def test_accepts_a_valid_cross_file_anchor(self, tmp_path: Path) -> None:
        (tmp_path / "b.md").write_text("## Target Section\n")
        doc = tmp_path / "a.md"
        doc.write_text("See [ok](b.md#target-section).\n")

        assert check_file(doc, tmp_path) == []

    def test_flags_missing_anchor_in_target_file(self, tmp_path: Path) -> None:
        (tmp_path / "b.md").write_text("## Real Section\n")
        doc = tmp_path / "a.md"
        doc.write_text("See [bad](b.md#not-real).\n")

        problems = check_file(doc, tmp_path)

        assert len(problems) == 1
        assert problems[0].reason == "anchor not found in target file"

    def test_skips_link_like_text_inside_fenced_code(self, tmp_path: Path) -> None:
        # The exact false positive found mid-audit: an "api, []" example
        # inside a fenced block was originally scanned as a broken link.
        doc = tmp_path / "a.md"
        doc.write_text("```\n[fake link](does-not-exist.md)\n```\n")

        assert check_file(doc, tmp_path) == []

    def test_ignores_external_links(self, tmp_path: Path) -> None:
        doc = tmp_path / "a.md"
        doc.write_text("[Docs](https://example.com/nonexistent)\n")

        assert check_file(doc, tmp_path) == []

    def test_excludes_roadmap_template_placeholder_links(self, tmp_path: Path) -> None:
        # roadmap/templates/*.md link to a bare `index.md` breadcrumb that
        # only resolves once the template is copied into a real story
        # folder. templates/ itself never has an index.md -- by design,
        # not a bug.
        templates_dir = tmp_path / "docs" / "project" / "roadmap" / "templates"
        templates_dir.mkdir(parents=True)
        doc = templates_dir / "plan.md"
        doc.write_text("[< Story index](index.md)\n")

        assert check_file(doc, tmp_path) == []

    def test_does_not_exempt_index_md_outside_templates(self, tmp_path: Path) -> None:
        doc = tmp_path / "docs" / "some-story" / "plan.md"
        doc.parent.mkdir(parents=True)
        doc.write_text("[< Story index](index.md)\n")

        problems = check_file(doc, tmp_path)

        assert len(problems) == 1
        assert problems[0].reason == "target file does not exist"


class TestCheckRepo:
    def test_aggregates_problems_across_files(self, tmp_path: Path) -> None:
        (tmp_path / "good.md").write_text("# Good\n")
        (tmp_path / "bad.md").write_text("[dead](nowhere.md)\n")

        problems = check_repo(tmp_path)

        assert len(problems) == 1
        assert problems[0].source_file == "bad.md"

    def test_clean_tree_has_no_problems(self, tmp_path: Path) -> None:
        (tmp_path / "a.md").write_text("# A\n\nSee [b](b.md).\n")
        (tmp_path / "b.md").write_text("# B\n")

        assert check_repo(tmp_path) == []
