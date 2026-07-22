from memory.builder.story_paths import (
    StoryPackageAmbiguityError,
    create_story_directory,
    find_duplicate_roadmap_headings,
    resolve_story_directory,
    story_folder_name,
    title_leaf,
)


class TestStoryFolderName:
    def test_appends_slugified_title(self):
        assert story_folder_name("CV2.DS1", "Command Burn-Down") == "cv2-ds1-command-burn-down"

    def test_drops_trailing_hyphen_for_empty_slug(self):
        assert story_folder_name("DS-35.TS-1", "!!! ???") == "ds-35-ts-1"


class TestTitleLeaf:
    def test_returns_leaf_segment_of_a_chain_title(self):
        assert title_leaf("TypeScript Core Port / Command Burn-Down") == "Command Burn-Down"

    def test_passes_through_a_plain_title_unchanged(self):
        assert title_leaf("Command Burn-Down") == "Command Burn-Down"


class TestResolveStoryDirectory:
    def test_resolves_by_heading_regardless_of_folder_name(self, tmp_path):
        package = tmp_path / "docs/project/roadmap/legacy-folder-name"
        package.mkdir(parents=True)
        (package / "index.md").write_text("# CV2.DS1 — Command Burn-Down\n", encoding="utf-8")

        assert resolve_story_directory(tmp_path, "CV2.DS1") == package

    def test_returns_none_when_no_package_claims_the_code(self, tmp_path):
        (tmp_path / "docs/project/roadmap").mkdir(parents=True)

        assert resolve_story_directory(tmp_path, "CV2.DS1") is None

    def test_returns_none_when_roadmap_root_does_not_exist(self, tmp_path):
        assert resolve_story_directory(tmp_path, "CV2.DS1") is None

    def test_raises_when_two_packages_claim_the_same_code(self, tmp_path):
        for suffix in ("a", "b"):
            package = tmp_path / f"docs/project/roadmap/cv2-ds1-{suffix}"
            package.mkdir(parents=True)
            (package / "index.md").write_text("# CV2.DS1 — Duplicate\n", encoding="utf-8")

        try:
            resolve_story_directory(tmp_path, "CV2.DS1")
        except StoryPackageAmbiguityError as exc:
            assert "CV2.DS1" in str(exc)
        else:
            raise AssertionError("expected StoryPackageAmbiguityError")

    def test_skips_legacy_archive_packages(self, tmp_path):
        legacy = tmp_path / "docs/project/roadmap/legacy/cv2-ds1"
        legacy.mkdir(parents=True)
        (legacy / "index.md").write_text("# CV2.DS1 — Archived\n", encoding="utf-8")

        assert resolve_story_directory(tmp_path, "CV2.DS1") is None


class TestCreateStoryDirectory:
    def test_single_segment_code_nests_at_roadmap_root(self, tmp_path):
        target = create_story_directory(tmp_path, "DS-35", "Application Parity")

        assert target == tmp_path / "docs/project/roadmap/ds-35-application-parity"

    def test_dotted_code_nests_under_resolved_existing_parent(self, tmp_path):
        parent = tmp_path / "docs/project/roadmap/cv2-typescript-core-port"
        parent.mkdir(parents=True)
        (parent / "index.md").write_text("# CV2 — TypeScript Core Port\n", encoding="utf-8")

        target = create_story_directory(tmp_path, "CV2.DS1", "Command Burn-Down")

        assert target == parent / "cv2-ds1-command-burn-down"

    def test_dotted_code_nests_under_parent_named_from_root_snapshot(self, tmp_path):
        roadmap = tmp_path / "docs/project/roadmap/index.md"
        roadmap.parent.mkdir(parents=True)
        roadmap.write_text(
            "# Roadmap\n\n"
            "| Code | Capability Value | Status |\n"
            "|------|------------------|--------|\n"
            "| CV2 | Checkout Flow | In Progress |\n",
            encoding="utf-8",
        )

        target = create_story_directory(tmp_path, "CV2.DS1", "Checkout entry and address capture")

        assert target == (
            tmp_path
            / "docs/project/roadmap/cv2-checkout-flow"
            / "cv2-ds1-checkout-entry-and-address-capture"
        )

    def test_dotted_code_falls_back_to_bare_parent_segment_when_nothing_documented(self, tmp_path):
        target = create_story_directory(tmp_path, "CV2.DS1", "Command Burn-Down")

        assert target == tmp_path / "docs/project/roadmap/cv2/cv2-ds1-command-burn-down"

    def test_applies_title_leaf_to_a_chain_style_title_for_its_own_folder_name(self, tmp_path):
        target = create_story_directory(
            tmp_path, "CV2.DS1", "Checkout Flow / Checkout entry and address capture"
        )

        assert target.name == "cv2-ds1-checkout-entry-and-address-capture"

    def test_stays_within_roadmap_root_for_an_adversarial_title(self, tmp_path):
        roadmap_root = (tmp_path / "docs" / "project" / "roadmap").resolve()

        target = create_story_directory(tmp_path, "DS-1", "../../../etc/passwd" + "x" * 200)

        assert target.resolve().is_relative_to(roadmap_root)


class TestFindDuplicateRoadmapHeadings:
    def test_returns_empty_when_every_code_is_unique(self, tmp_path):
        for code, folder in (("CV2", "cv2"), ("CV2.DS1", "cv2/cv2-ds1")):
            package = tmp_path / "docs/project/roadmap" / folder
            package.mkdir(parents=True)
            (package / "index.md").write_text(f"# {code} — Title\n", encoding="utf-8")

        assert find_duplicate_roadmap_headings(tmp_path) == {}

    def test_reports_every_code_claimed_by_more_than_one_package(self, tmp_path):
        for suffix in ("a", "b"):
            package = tmp_path / f"docs/project/roadmap/cv2-ds1-{suffix}"
            package.mkdir(parents=True)
            (package / "index.md").write_text("# CV2.DS1 — Duplicate\n", encoding="utf-8")
        unique = tmp_path / "docs/project/roadmap/cv3-ds1"
        unique.mkdir(parents=True)
        (unique / "index.md").write_text("# CV3.DS1 — Unique\n", encoding="utf-8")

        duplicates = find_duplicate_roadmap_headings(tmp_path)

        assert set(duplicates.keys()) == {"CV2.DS1"}
        assert len(duplicates["CV2.DS1"]) == 2

    def test_ignores_legacy_archive_packages(self, tmp_path):
        live = tmp_path / "docs/project/roadmap/cv2-ds1"
        live.mkdir(parents=True)
        (live / "index.md").write_text("# CV2.DS1 — Live\n", encoding="utf-8")
        legacy = tmp_path / "docs/project/roadmap/legacy/cv2-ds1"
        legacy.mkdir(parents=True)
        (legacy / "index.md").write_text("# CV2.DS1 — Archived\n", encoding="utf-8")

        assert find_duplicate_roadmap_headings(tmp_path) == {}

    def test_returns_empty_when_roadmap_root_does_not_exist(self, tmp_path):
        assert find_duplicate_roadmap_headings(tmp_path) == {}
