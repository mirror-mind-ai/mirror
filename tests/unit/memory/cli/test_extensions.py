"""Tests for external skill extension CLI helpers."""

import json
import os
from pathlib import Path
from textwrap import dedent

import pytest

from memory.cli.extensions import (
    cleanup_claude_runtime_skills,
    cmd_extensions,
    discover_extensions,
    expose_claude_runtime_skills,
    filter_manifests_for_runtime,
    install_extension,
    load_extension_manifest,
    sync_extensions_for_runtime,
    uninstall_extension,
)

PROJECT_ROOT = Path(__file__).resolve().parents[4]

# Legacy Claude skill directories used the ``ext:name`` namespace on disk. A colon
# is an illegal path character on Windows, so such a directory can never exist on
# an NTFS filesystem. These tests seed a legacy ``ext:...`` directory to exercise
# the migration/cleanup path, which is only reachable on POSIX systems.
requires_posix_colon_paths = pytest.mark.skipif(
    os.name == "nt",
    reason="legacy 'ext:' skill directories cannot exist on Windows (':' is illegal in paths)",
)


def _write(path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(dedent(content).lstrip(), encoding="utf-8")


def test_load_prompt_skill_manifest(tmp_path):
    ext_dir = tmp_path / "extensions" / "review-copy"
    _write(ext_dir / "SKILL.md", "# Review Copy\n")
    _write(
        ext_dir / "skill.yaml",
        """
        id: review-copy
        name: Review Copy
        category: extension
        kind: prompt-skill
        summary: Multi-LLM copy review workflow
        runtimes:
          claude:
            command_name: ext:review-copy
            skill_file: SKILL.md
          pi:
            command_name: ext-review-copy
            skill_file: SKILL.md
        """,
    )

    manifest = load_extension_manifest(ext_dir)

    assert manifest["id"] == "review-copy"
    assert manifest["kind"] == "prompt-skill"
    assert manifest["runtimes"]["claude"]["command_name"] == "ext:review-copy"


def test_load_command_skill_manifest(tmp_path):
    ext_dir = tmp_path / "extensions" / "xdigest"
    _write(ext_dir / "extension.py", "def register(api):\n    pass\n")
    _write(
        ext_dir / "skill.yaml",
        """
        id: xdigest
        name: X Digest
        category: extension
        kind: command-skill
        summary: Generate digest reports
        entrypoint:
          module: extension
        runtimes:
          claude:
            command_name: ext:xdigest
          pi:
            command_name: ext-xdigest
        """,
    )

    manifest = load_extension_manifest(ext_dir)

    assert manifest["kind"] == "command-skill"
    assert manifest["entrypoint"]["module"] == "extension"
    assert manifest["entrypoint"]["module_path"].endswith("extension.py")
    assert manifest["table_prefix"] == "ext_xdigest_"


def test_load_command_skill_rejects_missing_module(tmp_path):
    ext_dir = tmp_path / "extensions" / "xdigest"
    _write(
        ext_dir / "skill.yaml",
        """
        id: xdigest
        name: X Digest
        category: extension
        kind: command-skill
        summary: Generate digest reports
        entrypoint:
          module: extension
        runtimes:
          claude:
            command_name: ext:xdigest
        """,
    )

    import pytest

    from memory.cli.extensions import ExtensionValidationError

    with pytest.raises(ExtensionValidationError) as excinfo:
        load_extension_manifest(ext_dir)
    assert "extension.py" in str(excinfo.value)


def test_load_command_skill_rejects_mismatched_table_prefix(tmp_path):
    ext_dir = tmp_path / "extensions" / "xdigest"
    _write(ext_dir / "extension.py", "def register(api):\n    pass\n")
    _write(
        ext_dir / "skill.yaml",
        """
        id: xdigest
        name: X Digest
        category: extension
        kind: command-skill
        summary: Generate digest reports
        table_prefix: ext_other_
        entrypoint:
          module: extension
        runtimes:
          claude:
            command_name: ext:xdigest
        """,
    )

    import pytest

    from memory.cli.extensions import ExtensionValidationError

    with pytest.raises(ExtensionValidationError) as excinfo:
        load_extension_manifest(ext_dir)
    assert "table_prefix" in str(excinfo.value)


def test_discover_extensions_reports_invalid_manifests(tmp_path):
    root = tmp_path / "extensions"
    valid_dir = root / "review-copy"
    _write(valid_dir / "SKILL.md", "# Review Copy\n")
    _write(
        valid_dir / "skill.yaml",
        """
        id: review-copy
        name: Review Copy
        category: extension
        kind: prompt-skill
        summary: Multi-LLM copy review workflow
        runtimes:
          claude:
            command_name: ext:review-copy
            skill_file: SKILL.md
        """,
    )
    invalid_dir = root / "bad-skill"
    _write(
        invalid_dir / "skill.yaml",
        """
        id: bad skill
        name: Bad Skill
        category: extension
        kind: prompt-skill
        summary: Broken manifest
        runtimes:
          claude:
            command_name: ext:bad-skill
            skill_file: SKILL.md
        """,
    )

    manifests, errors = discover_extensions(root)

    assert [m["id"] for m in manifests] == ["review-copy"]
    assert errors
    assert errors[0][0] == "bad-skill"


def test_cmd_extensions_list_reads_from_explicit_extensions_root(tmp_path, capsys):
    root = tmp_path / "extensions"
    ext_dir = root / "review-copy"
    _write(ext_dir / "SKILL.md", "# Review Copy\n")
    _write(
        ext_dir / "skill.yaml",
        """
        id: review-copy
        name: Review Copy
        category: extension
        kind: prompt-skill
        summary: Multi-LLM copy review workflow
        runtimes:
          claude:
            command_name: ext:review-copy
            skill_file: SKILL.md
        """,
    )

    cmd_extensions(["list", "--extensions-root", str(root)])

    output = capsys.readouterr().out
    assert "review-copy [prompt-skill]" in output
    assert "claude=ext:review-copy" in output


def test_cmd_extensions_validate_exits_on_invalid_manifest(tmp_path):
    root = tmp_path / "extensions"
    bad_dir = root / "bad-skill"
    _write(
        bad_dir / "skill.yaml",
        """
        id: bad-skill
        name: Bad Skill
        category: extension
        kind: prompt-skill
        summary: Broken manifest
        runtimes:
          pi:
            command_name: not-namespaced
            skill_file: SKILL.md
        """,
    )

    with pytest.raises(SystemExit):
        cmd_extensions(["validate", "--extensions-root", str(root)])


def test_cmd_extensions_uses_mirror_home_default_extensions_dir(tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    ext_dir = mirror_home / "extensions" / "review-copy"
    _write(ext_dir / "SKILL.md", "# Review Copy\n")
    _write(
        ext_dir / "skill.yaml",
        """
        id: review-copy
        name: Review Copy
        category: extension
        kind: prompt-skill
        summary: Multi-LLM copy review workflow
        runtimes:
          pi:
            command_name: ext-review-copy
            skill_file: SKILL.md
        """,
    )

    cmd_extensions(["list", "--mirror-home", str(mirror_home)])

    output = capsys.readouterr().out
    assert f"Extensions root: {mirror_home / 'extensions'}" in output
    assert "review-copy [prompt-skill]" in output


def test_cmd_extensions_list_filters_by_runtime(tmp_path, capsys):
    root = tmp_path / "extensions"
    review_copy = root / "review-copy"
    _write(review_copy / "SKILL.md", "# Review Copy\n")
    _write(
        review_copy / "skill.yaml",
        """
        id: review-copy
        name: Review Copy
        category: extension
        kind: prompt-skill
        summary: Multi-LLM copy review workflow
        runtimes:
          claude:
            command_name: ext:review-copy
            skill_file: SKILL.md
          pi:
            command_name: ext-review-copy
            skill_file: SKILL.md
        """,
    )
    xdigest = root / "xdigest"
    _write(xdigest / "extension.py", "def register(api):\n    pass\n")
    _write(
        xdigest / "skill.yaml",
        """
        id: xdigest
        name: X Digest
        category: extension
        kind: command-skill
        summary: Generate digest reports
        entrypoint:
          module: extension
        runtimes:
          claude:
            command_name: ext:xdigest
        """,
    )

    cmd_extensions(["list", "--extensions-root", str(root), "--runtime", "pi"])

    output = capsys.readouterr().out
    assert "Runtime filter: pi" in output
    assert "review-copy [prompt-skill]" in output
    assert "xdigest [command-skill]" not in output


def test_filter_manifests_for_runtime_returns_matching_extensions_only(tmp_path):
    root = tmp_path / "extensions"
    review_copy = root / "review-copy"
    _write(review_copy / "SKILL.md", "# Review Copy\n")
    _write(
        review_copy / "skill.yaml",
        """
        id: review-copy
        name: Review Copy
        category: extension
        kind: prompt-skill
        summary: Multi-LLM copy review workflow
        runtimes:
          claude:
            command_name: ext:review-copy
            skill_file: SKILL.md
          pi:
            command_name: ext-review-copy
            skill_file: SKILL.md
        """,
    )
    manifests, _errors = discover_extensions(root)

    filtered = filter_manifests_for_runtime(manifests, "pi")

    assert [manifest["id"] for manifest in filtered] == ["review-copy"]


def test_sync_extensions_for_runtime_materializes_skill_tree(tmp_path):
    manifests = [load_extension_manifest(PROJECT_ROOT / "examples" / "extensions" / "review-copy")]
    target_root = tmp_path / "pi-skills"

    synced = sync_extensions_for_runtime(manifests, "pi", target_root)

    assert len(synced) == 1
    assert (target_root / "ext-review-copy" / "SKILL.md").exists()
    assert (target_root / "extensions.json").exists()

    catalog = json.loads((target_root / "extensions.json").read_text(encoding="utf-8"))
    assert catalog["schema_version"] == "1"
    assert catalog["runtime"] == "pi"
    assert catalog["target_root"] == str(target_root)
    assert len(catalog["extensions"]) == 1
    assert catalog["extensions"][0]["id"] == "review-copy"
    assert catalog["extensions"][0]["command_name"] == "ext-review-copy"
    assert catalog["extensions"][0]["installed_skill_path"].endswith("SKILL.md")


def test_cmd_extensions_sync_requires_runtime_and_target_root(tmp_path):
    root = tmp_path / "extensions"
    ext_dir = root / "review-copy"
    _write(ext_dir / "SKILL.md", "# Review Copy\n")
    _write(
        ext_dir / "skill.yaml",
        """
        id: review-copy
        name: Review Copy
        category: extension
        kind: prompt-skill
        summary: Multi-LLM copy review workflow
        runtimes:
          pi:
            command_name: ext-review-copy
            skill_file: SKILL.md
        """,
    )

    with pytest.raises(SystemExit):
        cmd_extensions(["sync", "--extensions-root", str(root)])


def test_cmd_extensions_sync_writes_runtime_surface(tmp_path, capsys):
    target_root = tmp_path / "pi-skills"

    cmd_extensions(
        [
            "sync",
            "--extensions-root",
            str(PROJECT_ROOT / "examples" / "extensions"),
            "--runtime",
            "pi",
            "--target-root",
            str(target_root),
        ]
    )

    output = capsys.readouterr().out
    assert "Synced 1 extension(s)" in output
    assert (target_root / "ext-review-copy" / "SKILL.md").exists()
    assert (target_root / "extensions.json").exists()


def test_install_extension_copies_source_tree_and_syncs_runtime_targets(tmp_path):
    mirror_home = tmp_path / ".mirror" / "pati"

    result = install_extension(
        "review-copy",
        source_root=PROJECT_ROOT / "examples" / "extensions",
        mirror_home=mirror_home,
    )

    assert (mirror_home / "extensions" / "review-copy" / "skill.yaml").exists()
    assert (mirror_home / "runtime" / "skills" / "pi" / "ext-review-copy" / "SKILL.md").exists()
    assert (mirror_home / "runtime" / "skills" / "claude" / "ext-review-copy" / "SKILL.md").exists()
    assert result["extension_id"] == "review-copy"


@requires_posix_colon_paths
def test_install_extension_removes_owned_legacy_claude_skill_dir(tmp_path):
    mirror_home = tmp_path / ".mirror" / "pati"
    legacy_dir = mirror_home / "runtime" / "skills" / "claude" / "ext:review-copy"
    legacy_dir.mkdir(parents=True)
    (legacy_dir / "SKILL.md").write_text('---\nname: "ext-review-copy"\n---\n', encoding="utf-8")

    install_extension(
        "review-copy",
        source_root=PROJECT_ROOT / "examples" / "extensions",
        mirror_home=mirror_home,
    )

    assert not legacy_dir.exists()
    assert (mirror_home / "runtime" / "skills" / "claude" / "ext-review-copy" / "SKILL.md").exists()


@requires_posix_colon_paths
def test_install_extension_preserves_unowned_legacy_claude_skill_dir(tmp_path):
    mirror_home = tmp_path / ".mirror" / "pati"
    legacy_dir = mirror_home / "runtime" / "skills" / "claude" / "ext:review-copy"
    legacy_dir.mkdir(parents=True)
    (legacy_dir / "SKILL.md").write_text('---\nname: "someone-else"\n---\n', encoding="utf-8")

    install_extension(
        "review-copy",
        source_root=PROJECT_ROOT / "examples" / "extensions",
        mirror_home=mirror_home,
    )

    assert legacy_dir.exists()
    assert (mirror_home / "runtime" / "skills" / "claude" / "ext-review-copy" / "SKILL.md").exists()


def test_cmd_extensions_install_requires_mirror_home_and_source_root():
    with pytest.raises(SystemExit):
        cmd_extensions(["install", "review-copy"])


def test_cmd_extensions_install_writes_user_home_and_runtime_surfaces(tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"

    cmd_extensions(
        [
            "install",
            "review-copy",
            "--extensions-root",
            str(PROJECT_ROOT / "examples" / "extensions"),
            "--mirror-home",
            str(mirror_home),
        ]
    )

    output = capsys.readouterr().out
    assert "Installed extension/review-copy" in output
    assert (mirror_home / "extensions" / "review-copy" / "skill.yaml").exists()
    assert (mirror_home / "runtime" / "skills" / "pi" / "ext-review-copy" / "SKILL.md").exists()
    assert (mirror_home / "runtime" / "skills" / "claude" / "ext-review-copy" / "SKILL.md").exists()


def test_install_extension_can_limit_runtime_sync(tmp_path):
    mirror_home = tmp_path / ".mirror" / "pati"

    install_extension(
        "review-copy",
        source_root=PROJECT_ROOT / "examples" / "extensions",
        mirror_home=mirror_home,
        runtime="pi",
    )

    assert (mirror_home / "extensions" / "review-copy" / "skill.yaml").exists()
    assert (mirror_home / "runtime" / "skills" / "pi" / "ext-review-copy" / "SKILL.md").exists()
    assert not (
        mirror_home / "runtime" / "skills" / "claude" / "ext-review-copy" / "SKILL.md"
    ).exists()


@requires_posix_colon_paths
def test_uninstall_extension_removes_source_tree_and_runtime_surfaces(tmp_path):
    mirror_home = tmp_path / ".mirror" / "pati"
    install_extension(
        "review-copy",
        source_root=PROJECT_ROOT / "examples" / "extensions",
        mirror_home=mirror_home,
    )
    legacy_dir = mirror_home / "runtime" / "skills" / "claude" / "ext:review-copy"
    legacy_dir.mkdir(parents=True)
    (legacy_dir / "SKILL.md").write_text('---\nname: "ext-review-copy"\n---\n', encoding="utf-8")

    result = uninstall_extension("review-copy", mirror_home=mirror_home)

    assert result["source_removed"] is True
    assert not (mirror_home / "extensions" / "review-copy").exists()
    assert not (mirror_home / "runtime" / "skills" / "pi" / "ext-review-copy").exists()
    assert not (mirror_home / "runtime" / "skills" / "claude" / "ext-review-copy").exists()
    assert not legacy_dir.exists()


def test_uninstall_extension_can_limit_runtime_removal(tmp_path):
    mirror_home = tmp_path / ".mirror" / "pati"
    install_extension(
        "review-copy",
        source_root=PROJECT_ROOT / "examples" / "extensions",
        mirror_home=mirror_home,
    )

    result = uninstall_extension("review-copy", mirror_home=mirror_home, runtime="pi")

    assert result["source_removed"] is False
    assert (mirror_home / "extensions" / "review-copy" / "skill.yaml").exists()
    assert not (mirror_home / "runtime" / "skills" / "pi" / "ext-review-copy").exists()
    assert (mirror_home / "runtime" / "skills" / "claude" / "ext-review-copy").exists()

    catalog = json.loads(
        (mirror_home / "runtime" / "skills" / "pi" / "extensions.json").read_text(encoding="utf-8")
    )
    assert catalog["extensions"] == []


def test_cmd_extensions_uninstall_requires_mirror_home():
    with pytest.raises(SystemExit):
        cmd_extensions(["uninstall", "review-copy"])


def test_cmd_extensions_uninstall_removes_installed_extension(tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    install_extension(
        "review-copy",
        source_root=PROJECT_ROOT / "examples" / "extensions",
        mirror_home=mirror_home,
    )

    cmd_extensions(["uninstall", "review-copy", "--mirror-home", str(mirror_home)])

    output = capsys.readouterr().out
    assert "Uninstalled extension/review-copy" in output
    assert not (mirror_home / "extensions" / "review-copy").exists()


def test_expose_claude_runtime_skills_copies_runtime_surface_into_project(tmp_path):
    mirror_home = tmp_path / ".mirror" / "pati"
    project_root = tmp_path / "project"
    install_extension(
        "review-copy",
        source_root=PROJECT_ROOT / "examples" / "extensions",
        mirror_home=mirror_home,
    )

    result = expose_claude_runtime_skills(mirror_home, project_root)

    assert (project_root / ".claude" / "skills" / "ext-review-copy" / "SKILL.md").exists()
    assert (project_root / ".claude" / "skills" / "extensions.external.json").exists()
    assert result["exposed"]


@requires_posix_colon_paths
def test_expose_claude_runtime_skills_prunes_previous_overlay_entries(tmp_path):
    mirror_home = tmp_path / ".mirror" / "pati"
    project_root = tmp_path / "project"
    install_extension(
        "review-copy",
        source_root=PROJECT_ROOT / "examples" / "extensions",
        mirror_home=mirror_home,
    )
    legacy_dir = project_root / ".claude" / "skills" / "ext:review-copy"
    legacy_dir.mkdir(parents=True)
    (legacy_dir / "SKILL.md").write_text('---\nname: "ext-review-copy"\n---\n', encoding="utf-8")
    stale_dir = project_root / ".claude" / "skills" / "ext-stale-skill"
    stale_dir.mkdir(parents=True)
    stale_skill = stale_dir / "SKILL.md"
    stale_skill.write_text("# stale\n", encoding="utf-8")
    overlay_catalog = project_root / ".claude" / "skills" / "extensions.external.json"
    overlay_catalog.write_text(
        json.dumps([{"target_skill_path": str(stale_skill)}], indent=2) + "\n",
        encoding="utf-8",
    )

    result = expose_claude_runtime_skills(mirror_home, project_root)

    assert not stale_skill.exists()
    assert not stale_dir.exists()
    assert not legacy_dir.exists()
    assert str(stale_skill) in result["removed"]
    assert str(legacy_dir) in result["removed"]
    assert (project_root / ".claude" / "skills" / "ext-review-copy" / "SKILL.md").exists()


def test_cleanup_claude_runtime_skills_removes_overlay_artifacts(tmp_path):
    project_root = tmp_path / "project"
    skill_dir = project_root / ".claude" / "skills" / "ext-review-copy"
    skill_dir.mkdir(parents=True)
    skill_path = skill_dir / "SKILL.md"
    skill_path.write_text("# Review Copy\n", encoding="utf-8")
    overlay_catalog = project_root / ".claude" / "skills" / "extensions.external.json"
    overlay_catalog.write_text(
        json.dumps([{"target_skill_path": str(skill_path)}], indent=2) + "\n",
        encoding="utf-8",
    )

    result = cleanup_claude_runtime_skills(project_root)

    assert str(skill_path) in result["removed"]
    assert not skill_path.exists()
    assert not skill_dir.exists()
    assert not overlay_catalog.exists()


def test_cmd_extensions_expose_claude_requires_mirror_home(tmp_path, monkeypatch):
    monkeypatch.delenv("MIRROR_HOME", raising=False)
    monkeypatch.delenv("MIRROR_USER", raising=False)

    with pytest.raises(SystemExit):
        cmd_extensions(["expose-claude", "--target-root", str(tmp_path / "project")])


def test_cmd_extensions_expose_claude_requires_explicit_target_root(tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"

    with pytest.raises(SystemExit):
        cmd_extensions(["expose-claude", "--mirror-home", str(mirror_home)])

    output = capsys.readouterr().out
    assert "expose-claude requires --target-root PATH" in output


def test_cmd_extensions_expose_claude_writes_project_skill_surface(tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    project_root = tmp_path / "project"
    install_extension(
        "review-copy",
        source_root=PROJECT_ROOT / "examples" / "extensions",
        mirror_home=mirror_home,
    )

    cmd_extensions(
        ["expose-claude", "--mirror-home", str(mirror_home), "--target-root", str(project_root)]
    )

    output = capsys.readouterr().out
    assert "Exposed Claude external skills" in output
    assert (project_root / ".claude" / "skills" / "ext-review-copy" / "SKILL.md").exists()


def test_cmd_extensions_clean_claude_requires_explicit_target_root(capsys):
    with pytest.raises(SystemExit):
        cmd_extensions(["clean-claude"])

    output = capsys.readouterr().out
    assert "clean-claude requires --target-root PATH" in output


def test_cmd_extensions_clean_claude_removes_project_skill_surface(tmp_path, capsys):
    project_root = tmp_path / "project"
    skill_dir = project_root / ".claude" / "skills" / "ext-review-copy"
    skill_dir.mkdir(parents=True)
    skill_path = skill_dir / "SKILL.md"
    skill_path.write_text("# Review Copy\n", encoding="utf-8")
    overlay_catalog = project_root / ".claude" / "skills" / "extensions.external.json"
    overlay_catalog.write_text(
        json.dumps([{"target_skill_path": str(skill_path)}], indent=2) + "\n",
        encoding="utf-8",
    )

    cmd_extensions(["clean-claude", "--target-root", str(project_root)])

    output = capsys.readouterr().out
    assert "Removed Claude external skills" in output
    assert not skill_path.exists()
    assert not overlay_catalog.exists()


def test_reference_review_copy_example_manifest_is_valid():
    manifest = load_extension_manifest(PROJECT_ROOT / "examples" / "extensions" / "review-copy")

    assert manifest["id"] == "review-copy"
    assert manifest["runtimes"]["claude"]["command_name"] == "ext:review-copy"
    assert manifest["runtimes"]["pi"]["command_name"] == "ext-review-copy"
