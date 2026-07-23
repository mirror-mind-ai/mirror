"""Self-test for the docs link/anchor checker and the roadmap heading guard.

Each case here reproduces a failure mode the checker actually caught (or
missed, before being fixed) during the repo-wide docs link audit -- this is
the "checker is a test artifact and must self-test" guard from the
engineering principles doc: without it, this tool rots exactly like
`evals/routing.py` did (D-005 -- fixtures drifting silently out of sync
with reality). ``TestCheckRoadmapDuplicateHeadings`` applies the same
self-test discipline to the roadmap duplicate-heading CI guard added for the
Ariad Expand path-divergence fix (handoff-ariad-fix.MD / plan-ariad-fix.md).
"""

from __future__ import annotations

from pathlib import Path

from memory.docs_lint import (
    check_file,
    check_repo,
    check_roadmap_duplicate_headings,
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


class TestCheckRoadmapDuplicateHeadings:
    # This is the CI guard for the class of defect fixed by
    # memory.builder.story_paths.resolve_story_directory's "one code -> one
    # package" invariant -- first seen as CR048 (DS6.TS5), recurring as
    # CV22.DS7. See handoff-ariad-fix.MD / plan-ariad-fix.md.

    def test_clean_roadmap_has_no_duplicates(self, tmp_path: Path) -> None:
        package = tmp_path / "docs/project/roadmap/cv2-ds1"
        package.mkdir(parents=True)
        (package / "index.md").write_text("# CV2.DS1 — Title\n")

        assert check_roadmap_duplicate_headings(tmp_path) == []

    def test_flags_two_packages_claiming_the_same_code(self, tmp_path: Path) -> None:
        for suffix in ("a", "b"):
            package = tmp_path / f"docs/project/roadmap/cv2-ds1-{suffix}"
            package.mkdir(parents=True)
            (package / "index.md").write_text("# CV2.DS1 — Duplicate\n")

        problems = check_roadmap_duplicate_headings(tmp_path)

        assert len(problems) == 1
        assert problems[0].code == "CV2.DS1"
        assert problems[0].paths == (
            "docs/project/roadmap/cv2-ds1-a/index.md",
            "docs/project/roadmap/cv2-ds1-b/index.md",
        )

    def test_reports_no_roadmap_directory_as_clean(self, tmp_path: Path) -> None:
        assert check_roadmap_duplicate_headings(tmp_path) == []

    def test_ignores_legacy_archive_packages(self, tmp_path: Path) -> None:
        live = tmp_path / "docs/project/roadmap/cv2-ds1"
        live.mkdir(parents=True)
        (live / "index.md").write_text("# CV2.DS1 — Live\n")
        legacy = tmp_path / "docs/project/roadmap/legacy/cv2-ds1"
        legacy.mkdir(parents=True)
        (legacy / "index.md").write_text("# CV2.DS1 — Archived\n")

        assert check_roadmap_duplicate_headings(tmp_path) == []

    def test_handles_a_repo_root_that_is_not_pre_resolved(self, tmp_path: Path) -> None:
        # find_duplicate_roadmap_headings returns already-resolved directories
        # internally; a non-normalized repo_root (containing a trailing "..",
        # or -- on macOS -- a /var vs /private/var symlink) must not crash
        # Path.relative_to. Real bug caught via manual smoke-testing: green
        # unit tests alone missed it because pytest's tmp_path happened to
        # already be pre-resolved on this system.
        for suffix in ("a", "b"):
            package = tmp_path / f"docs/project/roadmap/cv2-ds1-{suffix}"
            package.mkdir(parents=True)
            (package / "index.md").write_text("# CV2.DS1 — Duplicate\n")
        non_normalized_root = tmp_path / "unrelated" / ".."

        problems = check_roadmap_duplicate_headings(non_normalized_root)

        assert len(problems) == 1
        assert problems[0].code == "CV2.DS1"
        assert problems[0].paths == (
            "docs/project/roadmap/cv2-ds1-a/index.md",
            "docs/project/roadmap/cv2-ds1-b/index.md",
        )
