"""Tests for the canonical Mirror Mind Claude plugin generator (CV21.E2.S1)."""

from __future__ import annotations

import json
from pathlib import Path

from memory.plugins import claude

PROJECT_ROOT = Path(__file__).resolve().parents[4]


def _write_skill(skills_root: Path, name: str, filename: str, body: str) -> None:
    skill_dir = skills_root / name
    skill_dir.mkdir(parents=True)
    (skill_dir / filename).write_text(body, encoding="utf-8")


def _make_repo(tmp_path: Path, skills: dict[str, tuple[str, str]], version: str = "9.9.9") -> Path:
    """Build a synthetic repo: pyproject + .claude/skills/<name>/<file>."""
    (tmp_path / "pyproject.toml").write_text(
        f'[project]\nname = "mirror"\nversion = "{version}"\n', encoding="utf-8"
    )
    skills_root = tmp_path / claude.SKILLS_SOURCE_DIR
    for name, (filename, body) in skills.items():
        _write_skill(skills_root, name, filename, body)
    return tmp_path


# --- manifest -------------------------------------------------------------


def test_manifest_has_required_keys_and_no_schema() -> None:
    manifest = claude.build_manifest("1.2.3")
    assert manifest["name"] == "mirror-mind"
    assert manifest["version"] == "1.2.3"
    assert "description" in manifest
    assert manifest["author"] == {"name": "Mirror Mind"}
    # The 2.1.114 validator rejects unknown keys such as $schema.
    assert "$schema" not in manifest


def test_manifest_version_matches_pyproject() -> None:
    version = claude.read_version(PROJECT_ROOT)
    files = claude.plan_generated_files(PROJECT_ROOT)
    manifest_file = next(f for f in files if f.relative_path.name == "plugin.json")
    assert json.loads(manifest_file.content)["version"] == version


# --- skill discovery / normalization --------------------------------------


def test_discovers_each_skill_directory(tmp_path: Path) -> None:
    repo = _make_repo(
        tmp_path,
        {
            "mm-mirror": ("SKILL.md", "mirror body"),
            "mm-build": ("SKILL.md", "build body"),
        },
    )
    discovered = {name for name, _ in claude.discover_skill_sources(repo)}
    assert discovered == {"mm-mirror", "mm-build"}


def test_normalizes_lowercase_skill_md_to_uppercase(tmp_path: Path) -> None:
    # A source skill may track a lowercase skill.md; the plugin must still
    # materialize an uppercase SKILL.md with the same content.
    repo = _make_repo(tmp_path, {"mm-identity": ("skill.md", "identity body")})
    files = claude.plan_generated_files(repo)
    skill_files = [f for f in files if f.relative_path.name == claude.SKILL_FILENAME]
    assert len(skill_files) == 1
    assert skill_files[0].relative_path == Path("plugins/mirror-mind/skills/mm-identity/SKILL.md")
    assert skill_files[0].content == "identity body"


def test_skill_content_is_copied_byte_faithfully(tmp_path: Path) -> None:
    body = "---\nname: mm:mirror\n---\n# Mirror\nUse `/mm:mirror`.\n"
    repo = _make_repo(tmp_path, {"mm-mirror": ("SKILL.md", body)})
    files = claude.plan_generated_files(repo)
    skill = next(f for f in files if f.relative_path.name == claude.SKILL_FILENAME)
    assert skill.content == body


# --- materialize / drift guard --------------------------------------------


def test_materialize_writes_then_check_is_clean(tmp_path: Path) -> None:
    repo = _make_repo(tmp_path, {"mm-mirror": ("SKILL.md", "mirror body")})
    assert claude.materialize(repo, write=True) == []
    assert claude.materialize(repo, write=False) == []


def test_check_reports_out_of_date_skill(tmp_path: Path) -> None:
    repo = _make_repo(tmp_path, {"mm-mirror": ("SKILL.md", "v1")})
    claude.materialize(repo, write=True)
    (repo / claude.SKILLS_SOURCE_DIR / "mm-mirror" / "SKILL.md").write_text("v2", encoding="utf-8")
    problems = claude.materialize(repo, write=False)
    assert any("out of date" in p for p in problems)


def test_write_removes_stale_generated_skill(tmp_path: Path) -> None:
    repo = _make_repo(tmp_path, {"mm-mirror": ("SKILL.md", "a"), "mm-old": ("SKILL.md", "b")})
    claude.materialize(repo, write=True)
    # Source skill removed -> regenerate -> stale plugin skill must be pruned.
    import shutil

    shutil.rmtree(repo / claude.SKILLS_SOURCE_DIR / "mm-old")
    claude.materialize(repo, write=True)
    assert not (repo / claude.PLUGIN_DIR / "skills" / "mm-old").exists()
    assert claude.materialize(repo, write=False) == []


# --- real-repo invariants -------------------------------------------------


def test_plugin_skill_set_matches_claude_skills() -> None:
    source = {name for name, _ in claude.discover_skill_sources(PROJECT_ROOT)}
    plugin_skills = {
        p.parent.name
        for p in (PROJECT_ROOT / claude.PLUGIN_DIR / "skills").glob(f"*/{claude.SKILL_FILENAME}")
    }
    assert plugin_skills == source
    assert all(":" not in name for name in source)
    assert all(":" not in name for name in plugin_skills)


def test_committed_plugin_is_in_sync_with_source() -> None:
    # CI drift guard: the committed plugin must equal what the generator produces.
    assert claude.materialize(PROJECT_ROOT, write=False) == []


def test_plugin_hooks_exist_and_are_plugin_relative() -> None:
    hooks_dir = PROJECT_ROOT / claude.PLUGIN_DIR / "hooks"
    expected = {
        "session-start.sh",
        "log-user-prompt.sh",
        "mirror-inject.sh",
        "log-session-end.sh",
    }
    for name in expected:
        assert (hooks_dir / name).is_file(), f"missing hook {name}"

    config = json.loads((hooks_dir / "hooks.json").read_text(encoding="utf-8"))
    commands = [
        hook["command"]
        for events in config["hooks"].values()
        for entry in events
        for hook in entry["hooks"]
    ]
    assert commands, "no hook commands declared"
    for command in commands:
        assert command.startswith("${CLAUDE_PLUGIN_ROOT}/hooks/"), command
