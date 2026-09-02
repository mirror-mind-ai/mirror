"""Tests for bootstrapping a user home from repository templates."""

from pathlib import Path

from memory.cli.init import (
    _substitute_user_name,
    default_user_home,
    find_templates_identity_root,
    init_user_home,
)


def _write_template(path: Path, content: str = "template") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def test_init_user_home_copies_templates_into_identity_root(tmp_path):
    templates_root = tmp_path / "templates" / "identity"
    _write_template(templates_root / "self" / "config.yaml", "config: value\n")
    _write_template(templates_root / "personas" / "writer.yaml", "persona_id: writer\n")

    destination_root = tmp_path / ".mirror" / "testuser"

    created_identity_root = init_user_home(
        "testuser", templates_identity_root=templates_root, user_home=destination_root
    )

    assert created_identity_root == destination_root / "identity"
    assert (created_identity_root / "self" / "config.yaml").read_text(
        encoding="utf-8"
    ) == "config: value\n"
    assert (created_identity_root / "personas" / "writer.yaml").read_text(
        encoding="utf-8"
    ) == "persona_id: writer\n"


def test_init_user_home_creates_parent_directories(tmp_path):
    templates_root = tmp_path / "templates" / "identity"
    _write_template(templates_root / "self" / "config.yaml", "config: value\n")

    destination_root = tmp_path / ".mirror" / "testuser"
    assert not destination_root.exists()

    init_user_home("testuser", templates_identity_root=templates_root, user_home=destination_root)

    assert destination_root.exists()
    assert (destination_root / "identity").exists()


def test_init_user_home_fails_when_identity_root_is_non_empty(tmp_path):
    templates_root = tmp_path / "templates" / "identity"
    _write_template(templates_root / "self" / "config.yaml", "config: value\n")

    destination_root = tmp_path / ".mirror" / "testuser"
    existing_identity_root = destination_root / "identity"
    _write_template(existing_identity_root / "self" / "soul.yaml", "existing: value\n")

    try:
        init_user_home(
            "testuser", templates_identity_root=templates_root, user_home=destination_root
        )
        raise AssertionError("Expected init_user_home() to fail for non-empty identity root")
    except FileExistsError as exc:
        assert "already exists" in str(exc)

    assert (existing_identity_root / "self" / "soul.yaml").read_text(
        encoding="utf-8"
    ) == "existing: value\n"


def test_init_user_home_fails_when_templates_are_missing(tmp_path):
    missing_templates_root = tmp_path / "templates" / "identity"
    destination_root = tmp_path / ".mirror" / "testuser"

    try:
        init_user_home(
            "testuser", templates_identity_root=missing_templates_root, user_home=destination_root
        )
        raise AssertionError("Expected init_user_home() to fail when templates are missing")
    except FileNotFoundError as exc:
        assert "templates" in str(exc)

    assert not destination_root.exists()


def test_substitute_user_name_replaces_token_in_yaml_files(tmp_path):
    identity_root = tmp_path / "identity"
    soul = identity_root / "self" / "soul.yaml"
    soul.parent.mkdir(parents=True)
    soul.write_text("soul: |\n  I am {{user_name}}'s mirror.\n", encoding="utf-8")

    user_yaml = identity_root / "user" / "identity.yaml"
    user_yaml.parent.mkdir(parents=True)
    user_yaml.write_text("user: |\n  You are speaking with {{user_name}}.\n", encoding="utf-8")

    _substitute_user_name(identity_root, "alice")

    assert "{{user_name}}" not in soul.read_text(encoding="utf-8")
    assert "alice" in soul.read_text(encoding="utf-8")
    assert "{{user_name}}" not in user_yaml.read_text(encoding="utf-8")
    assert "alice" in user_yaml.read_text(encoding="utf-8")


def test_substitute_user_name_leaves_files_without_token_unchanged(tmp_path):
    identity_root = tmp_path / "identity"
    config = identity_root / "self" / "config.yaml"
    config.parent.mkdir(parents=True)
    original = "name: Mirror AI\nversion: '1.0.0'\n"
    config.write_text(original, encoding="utf-8")

    _substitute_user_name(identity_root, "alice")

    assert config.read_text(encoding="utf-8") == original


def test_init_user_home_substitutes_user_name_in_templates(tmp_path):
    templates_root = tmp_path / "templates" / "identity"
    soul = templates_root / "self" / "soul.yaml"
    soul.parent.mkdir(parents=True)
    soul.write_text("soul: |\n  I am {{user_name}}'s mirror.\n", encoding="utf-8")

    destination_root = tmp_path / ".mirror" / "alice"
    init_user_home("alice", templates_identity_root=templates_root, user_home=destination_root)

    seeded_soul = (destination_root / "identity" / "self" / "soul.yaml").read_text(encoding="utf-8")
    assert "{{user_name}}" not in seeded_soul
    assert "alice" in seeded_soul


def test_default_user_home_uses_current_layout_for_fresh_installs(tmp_path):
    assert default_user_home("alice", home=tmp_path) == tmp_path / ".mirror-minds" / "alice"


def test_default_user_home_keeps_existing_legacy_home(tmp_path):
    legacy = tmp_path / ".mirror" / "alice"
    legacy.mkdir(parents=True)

    assert default_user_home("alice", home=tmp_path) == legacy


def test_default_user_home_prefers_current_layout_when_both_exist(tmp_path):
    (tmp_path / ".mirror" / "alice").mkdir(parents=True)
    (tmp_path / ".mirror-minds" / "alice").mkdir(parents=True)

    assert default_user_home("alice", home=tmp_path) == tmp_path / ".mirror-minds" / "alice"


def test_find_templates_identity_root_finds_repo_templates(tmp_path):
    repo_root = tmp_path / "repo"
    templates_root = repo_root / "templates" / "identity"
    _write_template(templates_root / "self" / "config.yaml", "config: value\n")
    cli_file = repo_root / "src" / "memory" / "cli" / "init.py"
    cli_file.parent.mkdir(parents=True, exist_ok=True)
    cli_file.write_text("# placeholder\n", encoding="utf-8")

    found = find_templates_identity_root(cli_file)

    assert found == templates_root
