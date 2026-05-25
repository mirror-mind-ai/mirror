"""Tests for runtime status CLI."""

import sqlite3
import zipfile
from pathlib import Path

from memory.cli.runtime import (
    BackupVerification,
    CloneRole,
    CoreMigrationHealth,
    ExtensionHealth,
    GitStatus,
    GitUpdatePlan,
    GitWorktreeEntry,
    ReleaseDoctorCheck,
    ReleaseDoctorReport,
    ReleasePromotionResult,
    RuntimeReleaseNote,
    RuntimeStatusReport,
    RuntimeUpdateAvailability,
    RuntimeUpdateDryRun,
    RuntimeUpdateResult,
    RuntimeUpdateStage,
    RuntimeVersionReport,
    build_release_doctor_report,
    build_runtime_update_dry_run,
    check_runtime_update_availability,
    cmd_runtime,
    diagnose_runtime,
    inspect_clone_role,
    inspect_core_migrations,
    inspect_extension_health,
    inspect_git_update_plan,
    read_release_note_from_ref,
    render_release_doctor,
    render_release_promotion_result,
    render_runtime_backup_created,
    render_runtime_diagnosis,
    render_runtime_status,
    render_runtime_update_availability,
    render_runtime_update_dry_run,
    render_runtime_update_result,
    render_runtime_version,
    run_release_promotion,
    run_runtime_update,
    run_runtime_update_repair,
    verify_backup_archive,
)
from memory.db.migrations import MIGRATIONS
from memory.extensions.migrations import run_migrations


def _report(**overrides) -> RuntimeStatusReport:
    base = {
        "version": "0.7.0",
        "git": GitStatus(
            repository=Path("/repo"),
            branch="main",
            commit="abc1234",
            dirty=False,
        ),
        "mirror_home": Path("/home/.mirror-minds/alisson"),
        "mirror_home_error": None,
        "db_path": Path("/home/.mirror-minds/alisson/memory.db"),
        "db_exists": True,
        "core_migrations": CoreMigrationHealth(True, len(MIGRATIONS), len(MIGRATIONS), ()),
        "extensions": ("maestro",),
        "extension_health": (ExtensionHealth("maestro", True),),
        "clone_role": CloneRole("dev", Path("/repo/.mirror-clone-role")),
        "python_version": "3.12.0",
        "memory_env": "production",
    }
    base.update(overrides)
    return RuntimeStatusReport(**base)


def _write_command_extension(root: Path, extension_id: str = "hello") -> Path:
    ext_dir = root / "extensions" / extension_id
    (ext_dir / "migrations").mkdir(parents=True)
    (ext_dir / "extension.py").write_text(
        "def register(api):\n    return None\n",
        encoding="utf-8",
    )
    (ext_dir / "skill.yaml").write_text(
        f"""
id: {extension_id}
name: Hello
category: extension
kind: command-skill
summary: Hello extension
entrypoint:
  module: extension
runtimes:
  pi:
    command_name: ext-{extension_id}
""".strip()
        + "\n",
        encoding="utf-8",
    )
    return ext_dir


def test_render_runtime_status_ready():
    rendered = render_runtime_status(_report())

    assert "Mirror runtime status" in rendered
    assert "Version: 0.7.0" in rendered
    assert "Repository: /repo" in rendered
    assert "Git dirty: no" in rendered
    assert f"Core migrations: current ({len(MIGRATIONS)}/{len(MIGRATIONS)})" in rendered
    assert "Installed extensions: 1 (maestro)" in rendered
    assert "Extension health: ready (1 checked)" in rendered
    assert "Status: ready" in rendered


def test_render_runtime_status_attention_needed_when_git_dirty():
    report = _report(git=GitStatus(Path("/repo"), "main", "abc1234", True))

    rendered = render_runtime_status(report)

    assert "Git dirty: yes" in rendered
    assert "Status: attention needed" in rendered


def test_render_runtime_status_attention_needed_when_mirror_home_missing():
    report = _report(
        mirror_home=None,
        mirror_home_error="Mirror home is not configured. Set MIRROR_HOME or MIRROR_USER.",
        db_path=None,
        db_exists=None,
        core_migrations=CoreMigrationHealth(False, None, len(MIGRATIONS), ()),
        extensions=(),
        extension_health=(),
    )

    rendered = render_runtime_status(report)

    assert "Mirror home: not configured" in rendered
    assert "Mirror home note: Mirror home is not configured" in rendered
    assert "Database exists: unknown" in rendered
    assert "Status: attention needed" in rendered


def test_render_runtime_status_attention_needed_when_core_migrations_missing():
    report = _report(
        core_migrations=CoreMigrationHealth(
            False, len(MIGRATIONS) - 1, len(MIGRATIONS), (MIGRATIONS[-1][0],)
        )
    )

    rendered = render_runtime_status(report)

    assert "Core migrations: attention needed" in rendered
    assert MIGRATIONS[-1][0] in rendered
    assert "Status: attention needed" in rendered


def test_render_runtime_status_attention_needed_when_extension_health_fails():
    report = _report(
        extension_health=(
            ExtensionHealth(
                "hello", False, "pending migrations", pending_migrations=("001_init.sql",)
            ),
        )
    )

    rendered = render_runtime_status(report)

    assert "Extension health: attention needed (1 checked, 1 issue(s))" in rendered
    assert "hello: pending migrations; pending 001_init.sql" in rendered
    assert "Status: attention needed" in rendered


def test_inspect_core_migrations_reports_current(tmp_path):
    db_path = tmp_path / "memory.db"
    with sqlite3.connect(db_path) as conn:
        conn.execute("CREATE TABLE _migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)")
        conn.executemany(
            "INSERT INTO _migrations (id, applied_at) VALUES (?, 'now')",
            [(migration_id,) for migration_id, _ in MIGRATIONS],
        )

    health = inspect_core_migrations(db_path, True)

    assert health.ready is True
    assert health.applied_count == len(MIGRATIONS)
    assert health.missing == ()


def test_inspect_core_migrations_reports_missing_without_mutating(tmp_path):
    db_path = tmp_path / "memory.db"

    health = inspect_core_migrations(db_path, False)

    assert health.ready is False
    assert health.note == "database missing"
    assert not db_path.exists()


def test_inspect_core_migrations_reports_missing_ids(tmp_path):
    db_path = tmp_path / "memory.db"
    with sqlite3.connect(db_path) as conn:
        conn.execute("CREATE TABLE _migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)")
        conn.executemany(
            "INSERT INTO _migrations (id, applied_at) VALUES (?, 'now')",
            [(migration_id,) for migration_id, _ in MIGRATIONS[:-1]],
        )

    health = inspect_core_migrations(db_path, True)

    assert health.ready is False
    assert health.missing == (MIGRATIONS[-1][0],)


def test_inspect_core_migrations_reports_unknown_ids(tmp_path):
    db_path = tmp_path / "memory.db"
    with sqlite3.connect(db_path) as conn:
        conn.execute("CREATE TABLE _migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)")
        conn.executemany(
            "INSERT INTO _migrations (id, applied_at) VALUES (?, 'now')",
            [(migration_id,) for migration_id, _ in MIGRATIONS],
        )
        conn.execute("INSERT INTO _migrations (id, applied_at) VALUES ('999_local', 'now')")

    health = inspect_core_migrations(db_path, True)

    assert health.ready is False
    assert health.missing == ()
    assert health.unknown == ("999_local",)


def test_inspect_extension_health_reports_prompt_skill_ready(tmp_path):
    ext_dir = tmp_path / "extensions" / "prompt"
    ext_dir.mkdir(parents=True)
    (ext_dir / "SKILL.md").write_text("# Prompt\n", encoding="utf-8")
    (ext_dir / "skill.yaml").write_text(
        """
id: prompt
name: Prompt
category: extension
kind: prompt-skill
summary: Prompt extension
runtimes:
  pi:
    command_name: ext-prompt
    skill_file: SKILL.md
""".strip()
        + "\n",
        encoding="utf-8",
    )
    db_path = tmp_path / "memory.db"
    db_path.touch()

    health = inspect_extension_health(tmp_path, db_path, True)

    assert health == (ExtensionHealth("prompt", True),)


def test_inspect_extension_health_reports_invalid_manifest(tmp_path):
    ext_dir = tmp_path / "extensions" / "broken"
    ext_dir.mkdir(parents=True)
    (ext_dir / "skill.yaml").write_text("id: broken\n", encoding="utf-8")
    db_path = tmp_path / "memory.db"
    db_path.touch()

    health = inspect_extension_health(tmp_path, db_path, True)

    assert len(health) == 1
    assert health[0].extension_id == "broken"
    assert health[0].ready is False
    assert "missing required field" in (health[0].note or "")


def test_inspect_extension_health_reports_pending_command_migration(tmp_path):
    ext_dir = _write_command_extension(tmp_path)
    (ext_dir / "migrations" / "001_init.sql").write_text(
        "CREATE TABLE ext_hello_pings (id INTEGER PRIMARY KEY);\n", encoding="utf-8"
    )
    db_path = tmp_path / "memory.db"
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            "CREATE TABLE _ext_migrations (extension_id TEXT, filename TEXT, "
            "checksum TEXT, applied_at TEXT, PRIMARY KEY (extension_id, filename))"
        )

    health = inspect_extension_health(tmp_path, db_path, True)

    assert health == (
        ExtensionHealth("hello", False, "pending migrations", pending_migrations=("001_init.sql",)),
    )


def test_inspect_extension_health_reports_checksum_drift(tmp_path):
    ext_dir = _write_command_extension(tmp_path)
    migration = ext_dir / "migrations" / "001_init.sql"
    migration.write_text(
        "CREATE TABLE ext_hello_pings (id INTEGER PRIMARY KEY);\n", encoding="utf-8"
    )
    db_path = tmp_path / "memory.db"
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            "CREATE TABLE _ext_migrations (extension_id TEXT, filename TEXT, "
            "checksum TEXT, applied_at TEXT, PRIMARY KEY (extension_id, filename))"
        )
        run_migrations(conn, extension_id="hello", migrations_dir=ext_dir / "migrations")
    migration.write_text(
        "CREATE TABLE ext_hello_pings (id INTEGER PRIMARY KEY, title TEXT);\n",
        encoding="utf-8",
    )

    health = inspect_extension_health(tmp_path, db_path, True)

    assert health == (
        ExtensionHealth(
            "hello", False, "migration checksum drift", drifted_migrations=("001_init.sql",)
        ),
    )


def test_inspect_extension_health_reports_unknown_migration(tmp_path):
    ext_dir = _write_command_extension(tmp_path)
    (ext_dir / "migrations" / "002_current.sql").write_text(
        "CREATE TABLE ext_hello_current (id INTEGER PRIMARY KEY);\n",
        encoding="utf-8",
    )
    db_path = tmp_path / "memory.db"
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            "CREATE TABLE _ext_migrations (extension_id TEXT, filename TEXT, "
            "checksum TEXT, applied_at TEXT, PRIMARY KEY (extension_id, filename))"
        )
        conn.execute(
            "INSERT INTO _ext_migrations (extension_id, filename, checksum, applied_at) "
            "VALUES ('hello', '001_legacy.sql', 'abc', 'now')"
        )

    health = inspect_extension_health(tmp_path, db_path, True)

    assert health[0].ready is False
    assert health[0].unknown_migrations == ("001_legacy.sql",)


def test_inspect_extension_health_reports_database_table_error(monkeypatch, tmp_path):
    _write_command_extension(tmp_path)
    db_path = tmp_path / "memory.db"
    db_path.touch()

    def raise_table_error(conn, table):
        raise sqlite3.OperationalError("unable to open database file")

    monkeypatch.setattr("memory.cli.runtime._table_exists", raise_table_error)

    health = inspect_extension_health(tmp_path, db_path, True)

    assert len(health) == 1
    assert health[0].extension_id == "hello"
    assert health[0].ready is False
    assert "database unavailable: unable to open database file" == health[0].note


def test_diagnose_runtime_reports_drift_findings():
    report = _report(
        core_migrations=CoreMigrationHealth(
            False,
            len(MIGRATIONS),
            len(MIGRATIONS),
            (),
            unknown=("999_local",),
        ),
        extension_health=(
            ExtensionHealth(
                "maestro",
                False,
                "unknown applied migrations",
                unknown_migrations=("001_init.sql",),
            ),
        ),
    )

    findings = diagnose_runtime(report, (GitWorktreeEntry("??", "pi-session-x.html"),))

    assert [finding.code for finding in findings] == [
        "git_dirty",
        "core_migration_unknown",
        "extension_migration_unknown",
    ]
    assert "archive or ignore" in findings[0].recommendation


def test_render_runtime_diagnosis_ready():
    rendered = render_runtime_diagnosis(())

    assert "Mirror runtime drift diagnosis" in rendered
    assert "Findings: 0" in rendered
    assert "Status: ready" in rendered


def test_cmd_runtime_status_dispatches(monkeypatch, capsys):
    monkeypatch.setattr(
        "memory.cli.runtime.build_runtime_status", lambda mirror_home_arg=None: _report()
    )

    rc = cmd_runtime(["status"])

    out = capsys.readouterr().out
    assert rc == 0
    assert "Mirror runtime status" in out
    assert "Status: ready" in out


def test_cmd_runtime_status_returns_nonzero_when_attention_needed(monkeypatch, capsys):
    monkeypatch.setattr(
        "memory.cli.runtime.build_runtime_status",
        lambda mirror_home_arg=None: _report(git=GitStatus(Path("/repo"), "main", "abc1234", True)),
    )

    rc = cmd_runtime(["status"])

    out = capsys.readouterr().out
    assert rc == 1
    assert "Status: attention needed" in out


def test_inspect_clone_role_defaults_to_production_when_marker_missing(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr("memory.cli.runtime._resolve_repo_root", lambda start: Path(tmp_path))

    role = inspect_clone_role(Path(tmp_path))

    assert role.value == "production"
    assert role.source is None
    assert role.note is None


def test_inspect_clone_role_reads_dev_marker(tmp_path, monkeypatch):
    (tmp_path / ".mirror-clone-role").write_text("dev\n", encoding="utf-8")
    monkeypatch.setattr("memory.cli.runtime._resolve_repo_root", lambda start: Path(tmp_path))

    role = inspect_clone_role(Path(tmp_path))

    assert role.value == "dev"
    assert role.source == tmp_path / ".mirror-clone-role"
    assert role.note is None


def test_inspect_clone_role_normalizes_whitespace_and_case(tmp_path, monkeypatch):
    (tmp_path / ".mirror-clone-role").write_text("  Production  \n", encoding="utf-8")
    monkeypatch.setattr("memory.cli.runtime._resolve_repo_root", lambda start: Path(tmp_path))

    role = inspect_clone_role(Path(tmp_path))

    assert role.value == "production"


def test_inspect_clone_role_falls_back_to_production_for_unknown_value(tmp_path, monkeypatch):
    (tmp_path / ".mirror-clone-role").write_text("staging\n", encoding="utf-8")
    monkeypatch.setattr("memory.cli.runtime._resolve_repo_root", lambda start: Path(tmp_path))

    role = inspect_clone_role(Path(tmp_path))

    assert role.value == "production"
    assert role.note is not None
    assert "staging" in role.note


def test_inspect_clone_role_returns_production_outside_git(tmp_path, monkeypatch):
    monkeypatch.setattr("memory.cli.runtime._resolve_repo_root", lambda start: None)

    role = inspect_clone_role(Path(tmp_path))

    assert role.value == "production"
    assert role.note == "no repository"


def test_render_runtime_status_includes_clone_role():
    rendered = render_runtime_status(
        _report(clone_role=CloneRole("production", Path("/repo/.mirror-clone-role")))
    )

    assert "Clone role: production" in rendered


def test_render_runtime_version():
    rendered = render_runtime_version(
        RuntimeVersionReport(
            "0.7.0",
            GitStatus(Path("/repo"), "main", "abc1234", False),
            CloneRole("dev", Path("/repo/.mirror-clone-role")),
        )
    )

    assert "Mirror runtime version" in rendered
    assert "Version: 0.7.0" in rendered
    assert "Git branch: main" in rendered
    assert "Git commit: abc1234" in rendered
    assert "Clone role: dev" in rendered


def test_check_runtime_update_availability_reports_up_to_date(monkeypatch):
    def fake_run_git(args, *, cwd):
        if args[0] == "rev-parse" and args[1] == "--show-toplevel":
            return 0, "/repo", ""
        if args == ["branch", "--show-current"]:
            return 0, "main", ""
        if args == ["rev-parse", "--short", "HEAD"]:
            return 0, "abc1234", ""
        if args == ["status", "--porcelain"]:
            return 0, "", ""
        if args[:2] == ["rev-parse", "--abbrev-ref"]:
            return 0, "origin/main", ""
        if args == ["rev-parse", "--verify", "origin/main"]:
            return 0, "origin/main", ""
        if args[:2] == ["rev-list", "--left-right"]:
            return 0, "0 0", ""
        if args[:3] == ["config", "--get", "remote.origin.url"]:
            return 0, "https://example.test/repo.git", ""
        if args[:2] == ["ls-remote", "origin"]:
            return 0, "abcdef1234567890\trefs/heads/main", ""
        if args == ["rev-parse", "HEAD"]:
            return 0, "abcdef1234567890", ""
        raise AssertionError(args)

    monkeypatch.setattr("memory.cli.runtime._run_git", fake_run_git)
    monkeypatch.setattr("memory.cli.runtime.package_version", lambda: "0.7.0")

    report = check_runtime_update_availability(Path("/repo"), channel="main")

    assert report.status == "up_to_date"
    assert report.remote_commit == "abcdef1234567890"


def test_check_runtime_update_availability_reports_update_available(monkeypatch):
    def fake_run_git(args, *, cwd):
        if args[0] == "rev-parse" and args[1] == "--show-toplevel":
            return 0, "/repo", ""
        if args == ["branch", "--show-current"]:
            return 0, "main", ""
        if args == ["rev-parse", "--short", "HEAD"]:
            return 0, "abc1234", ""
        if args == ["status", "--porcelain"]:
            return 0, "", ""
        if args[:2] == ["rev-parse", "--abbrev-ref"]:
            return 0, "origin/main", ""
        if args == ["rev-parse", "--verify", "origin/main"]:
            return 0, "origin/main", ""
        if args[:2] == ["rev-list", "--left-right"]:
            return 0, "0 1", ""
        if args[:3] == ["config", "--get", "remote.origin.url"]:
            return 0, "https://example.test/repo.git", ""
        if args[:2] == ["ls-remote", "origin"]:
            return 0, "def5678901234567\trefs/heads/main", ""
        if args == ["rev-parse", "HEAD"]:
            return 0, "abcdef1234567890", ""
        raise AssertionError(args)

    monkeypatch.setattr("memory.cli.runtime._run_git", fake_run_git)
    monkeypatch.setattr("memory.cli.runtime.package_version", lambda: "0.7.0")

    report = check_runtime_update_availability(Path("/repo"), channel="main")

    assert report.status == "update_available"
    assert report.upstream == "origin/main"


def test_render_runtime_update_availability():
    rendered = render_runtime_update_availability(
        RuntimeUpdateAvailability(
            "0.7.0",
            "origin/main",
            "abcdef1234567890",
            "def5678901234567",
            "update_available",
        )
    )

    assert "Mirror runtime update check" in rendered
    assert "Availability: update_available" in rendered
    assert "runtime update --dry-run" in rendered


def test_render_runtime_update_availability_stable_without_fetched_release_details():
    from memory.cli.runtime import UpdateChannel

    rendered = render_runtime_update_availability(
        RuntimeUpdateAvailability(
            "0.8.0",
            "origin/stable",
            "abcdef1234567890",
            "def5678901234567",
            "update_available",
            update_channel=UpdateChannel("stable", None),
        )
    )

    assert "Release details: not fetched by this check" in rendered
    assert "uv run python -m memory runtime update --dry-run" in rendered
    assert "uv run python -m memory runtime update" in rendered


def test_render_runtime_update_availability_with_release_details(tmp_path):
    from memory.cli.runtime import UpdateChannel

    note = RuntimeReleaseNote(
        "v0.9.0", "Self-Update Done", tmp_path / "v0.9.0.md", digest="Release summary."
    )
    rendered = render_runtime_update_availability(
        RuntimeUpdateAvailability(
            "0.8.0",
            "origin/stable",
            "abcdef1234567890",
            "def5678901234567",
            "update_available",
            update_channel=UpdateChannel("stable", None),
            target_release=note,
        )
    )

    assert "Release available: v0.9.0 — Self-Update Done" in rendered
    assert "Summary: Release summary." in rendered


def test_inspect_git_update_plan_reports_missing_upstream(monkeypatch):
    def fake_run_git(args, *, cwd):
        if args[:2] == ["rev-parse", "--abbrev-ref"]:
            return 128, "", "no upstream configured"
        raise AssertionError(args)

    monkeypatch.setattr("memory.cli.runtime._run_git", fake_run_git)

    plan = inspect_git_update_plan(GitStatus(Path("/repo"), "main", "abc1234", False))

    assert plan == GitUpdatePlan(None, None, None, False, "blocked", "no upstream configured")


def test_inspect_git_update_plan_reports_equal_branch(monkeypatch):
    def fake_run_git(args, *, cwd):
        if args[:2] == ["rev-parse", "--abbrev-ref"]:
            return 0, "origin/main", ""
        if args[:2] == ["rev-list", "--left-right"]:
            return 0, "0 0", ""
        raise AssertionError(args)

    monkeypatch.setattr("memory.cli.runtime._run_git", fake_run_git)

    plan = inspect_git_update_plan(GitStatus(Path("/repo"), "main", "abc1234", False))

    assert plan == GitUpdatePlan("origin/main", 0, 0, True, "none", "already up to date")


def test_inspect_git_update_plan_reports_behind_branch(monkeypatch):
    def fake_run_git(args, *, cwd):
        if args[:2] == ["rev-parse", "--abbrev-ref"]:
            return 0, "origin/main", ""
        if args[:2] == ["rev-list", "--left-right"]:
            return 0, "0 3", ""
        raise AssertionError(args)

    monkeypatch.setattr("memory.cli.runtime._run_git", fake_run_git)

    plan = inspect_git_update_plan(GitStatus(Path("/repo"), "main", "abc1234", False))

    assert plan == GitUpdatePlan("origin/main", 0, 3, True, "pull", "pull 3 remote commit(s)")


def test_inspect_git_update_plan_blocks_ahead_branch(monkeypatch):
    def fake_run_git(args, *, cwd):
        if args[:2] == ["rev-parse", "--abbrev-ref"]:
            return 0, "origin/main", ""
        if args[:2] == ["rev-list", "--left-right"]:
            return 0, "2 0", ""
        raise AssertionError(args)

    monkeypatch.setattr("memory.cli.runtime._run_git", fake_run_git)

    plan = inspect_git_update_plan(GitStatus(Path("/repo"), "main", "abc1234", False))

    assert plan == GitUpdatePlan("origin/main", 2, 0, False, "blocked", "local commits present")


def test_inspect_git_update_plan_blocks_diverged_branch(monkeypatch):
    def fake_run_git(args, *, cwd):
        if args[:2] == ["rev-parse", "--abbrev-ref"]:
            return 0, "origin/main", ""
        if args[:2] == ["rev-list", "--left-right"]:
            return 0, "2 4", ""
        raise AssertionError(args)

    monkeypatch.setattr("memory.cli.runtime._run_git", fake_run_git)

    plan = inspect_git_update_plan(GitStatus(Path("/repo"), "main", "abc1234", False))

    assert plan == GitUpdatePlan("origin/main", 2, 4, False, "blocked", "branch diverged")


def test_render_runtime_update_dry_run_blocks_dirty_status():
    dry_run = RuntimeUpdateDryRun(
        _report(git=GitStatus(Path("/repo"), "main", "abc1234", True)), None
    )

    rendered = render_runtime_update_dry_run(dry_run)

    assert "Mirror runtime update dry-run" in rendered
    assert "Current status: attention needed" in rendered
    assert "git tree is dirty" in rendered
    assert "Dry-run result: blocked" in rendered


def test_render_runtime_update_dry_run_ready_plan_includes_backup_and_validation():
    dry_run = RuntimeUpdateDryRun(
        _report(), GitUpdatePlan("origin/main", 0, 3, True, "pull", "pull 3 remote commit(s)")
    )

    rendered = render_runtime_update_dry_run(dry_run)

    assert "Current status: ready" in rendered
    assert "Upstream: origin/main" in rendered
    assert "Update plan: pull 3 remote commit(s)" in rendered
    assert "Backup: required before real update" in rendered
    assert 'uv run pytest tests/unit/ tests/integration/ -m "not live"' in rendered
    assert "Dry-run result: ready" in rendered


def test_render_runtime_update_dry_run_shows_stable_release_details(tmp_path):
    from memory.cli.runtime import UpdateChannel

    dry_run = RuntimeUpdateDryRun(
        _report(update_channel=UpdateChannel("stable", None)),
        GitUpdatePlan("origin/stable", 0, 2, True, "pull", "pull 2 remote commit(s)"),
        RuntimeReleaseNote(
            "v0.9.0", "Self-Update Done", tmp_path / "v0.9.0.md", digest="Release summary."
        ),
    )

    rendered = render_runtime_update_dry_run(dry_run)

    assert "Release available: v0.9.0 — Self-Update Done" in rendered
    assert "Summary: Release summary." in rendered
    assert "uv run python -m memory runtime update" in rendered


def test_build_runtime_update_dry_run_loads_newer_stable_release(monkeypatch, tmp_path):
    from memory.cli.runtime import UpdateChannel

    monkeypatch.setattr(
        "memory.cli.runtime.build_runtime_status",
        lambda mirror_home_arg=None, channel=None: _report(
            version="0.8.0",
            git=GitStatus(tmp_path, "main", "abc1234", False),
            update_channel=UpdateChannel("stable", None),
        ),
    )
    monkeypatch.setattr(
        "memory.cli.runtime.inspect_git_update_plan",
        lambda git, update_channel=None: GitUpdatePlan(
            "origin/stable", 0, 1, True, "pull", "pull 1 remote commit(s)"
        ),
    )
    monkeypatch.setattr(
        "memory.cli.runtime.read_release_note_from_ref",
        lambda ref, start=None: RuntimeReleaseNote(
            "v0.9.0", "Self-Update Done", tmp_path / "v0.9.0.md"
        ),
    )

    dry_run = build_runtime_update_dry_run(channel="stable")

    assert dry_run.target_release is not None
    assert dry_run.target_release.version == "v0.9.0"


def test_cmd_runtime_diagnose_dispatches(monkeypatch, capsys):
    monkeypatch.setattr(
        "memory.cli.runtime.build_runtime_status",
        lambda mirror_home_arg=None: _report(
            core_migrations=CoreMigrationHealth(
                False,
                len(MIGRATIONS),
                len(MIGRATIONS),
                (),
                unknown=("999_local",),
            )
        ),
    )
    monkeypatch.setattr("memory.cli.runtime.inspect_git_worktree", lambda repository: ())

    rc = cmd_runtime(["diagnose"])

    out = capsys.readouterr().out
    assert rc == 1
    assert "core_migration_unknown" in out
    assert "Status: attention needed" in out


def test_cmd_runtime_update_with_only_check_does_not_invoke_executor(monkeypatch, capsys):
    monkeypatch.setattr(
        "memory.cli.runtime.check_runtime_update_availability",
        lambda: RuntimeUpdateAvailability(
            "0.7.0", "origin/main", "abc1234", "abc1234", "up_to_date"
        ),
    )
    called: list[bool] = []
    monkeypatch.setattr(
        "memory.cli.runtime.run_runtime_update",
        lambda **kwargs: called.append(True),
    )

    rc = cmd_runtime(["update", "--check"])

    assert rc == 0
    assert called == []
    assert "Availability: up_to_date" in capsys.readouterr().out


def test_cmd_runtime_version_dispatches(monkeypatch, capsys):
    monkeypatch.setattr(
        "memory.cli.runtime.build_runtime_version_report",
        lambda start=None: RuntimeVersionReport(
            "0.7.0",
            GitStatus(Path("/repo"), "main", "abc1234", False),
            CloneRole("dev", Path("/repo/.mirror-clone-role")),
        ),
    )

    rc = cmd_runtime(["version"])

    out = capsys.readouterr().out
    assert rc == 0
    assert "Mirror runtime version" in out
    assert "Version: 0.7.0" in out


def test_cmd_runtime_update_check_dispatches(monkeypatch, capsys):
    monkeypatch.setattr(
        "memory.cli.runtime.check_runtime_update_availability",
        lambda: RuntimeUpdateAvailability(
            "0.7.0", "origin/main", "abc1234", "def5678", "update_available"
        ),
    )

    rc = cmd_runtime(["update", "--check"])

    out = capsys.readouterr().out
    assert rc == 0
    assert "Mirror runtime update check" in out
    assert "Availability: update_available" in out


def test_cmd_runtime_update_dry_run_dispatches(monkeypatch, capsys):
    monkeypatch.setattr(
        "memory.cli.runtime.build_runtime_update_dry_run",
        lambda mirror_home_arg=None: RuntimeUpdateDryRun(
            _report(),
            GitUpdatePlan("origin/main", 0, 0, True, "none", "already up to date"),
        ),
    )

    rc = cmd_runtime(["update", "--dry-run"])

    out = capsys.readouterr().out
    assert rc == 0
    assert "Mirror runtime update dry-run" in out
    assert "Dry-run result: ready" in out


def test_cmd_runtime_update_dry_run_returns_nonzero_when_blocked(monkeypatch, capsys):
    monkeypatch.setattr(
        "memory.cli.runtime.build_runtime_update_dry_run",
        lambda mirror_home_arg=None: RuntimeUpdateDryRun(
            _report(git=GitStatus(Path("/repo"), "main", "abc1234", True)), None
        ),
    )

    rc = cmd_runtime(["update", "--dry-run"])

    out = capsys.readouterr().out
    assert rc == 1
    assert "Dry-run result: blocked" in out


def test_verify_backup_archive_accepts_memory_db_zip(tmp_path):
    backup_path = tmp_path / "memory.zip"
    with zipfile.ZipFile(backup_path, "w") as zf:
        zf.writestr("memory.db", "db")
        zf.writestr("memory.db-wal", "wal")

    verification = verify_backup_archive(backup_path)

    assert verification == BackupVerification(backup_path, True, ("memory.db", "memory.db-wal"))


def test_verify_backup_archive_rejects_missing_file(tmp_path):
    backup_path = tmp_path / "missing.zip"

    verification = verify_backup_archive(backup_path)

    assert verification == BackupVerification(backup_path, False, (), "backup file not found")


def test_verify_backup_archive_rejects_non_zip(tmp_path):
    backup_path = tmp_path / "not.zip"
    backup_path.write_text("not a zip", encoding="utf-8")

    verification = verify_backup_archive(backup_path)

    assert verification == BackupVerification(
        backup_path, False, (), "backup file is not a readable zip"
    )


def test_verify_backup_archive_rejects_zip_without_memory_db(tmp_path):
    backup_path = tmp_path / "memory.zip"
    with zipfile.ZipFile(backup_path, "w") as zf:
        zf.writestr("notes.txt", "no")

    verification = verify_backup_archive(backup_path)

    assert verification.valid is False
    assert verification.note == "memory.db missing from backup"


def test_verify_backup_archive_rejects_unsafe_entries(tmp_path):
    backup_path = tmp_path / "memory.zip"
    with zipfile.ZipFile(backup_path, "w") as zf:
        zf.writestr("memory.db", "db")
        zf.writestr("../escape", "bad")

    verification = verify_backup_archive(backup_path)

    assert verification.valid is False
    assert verification.note == "unsafe archive entry: ../escape"


def test_render_runtime_backup_created_includes_recovery_route(tmp_path):
    backup_path = tmp_path / "backups" / "memory.zip"
    verification = BackupVerification(backup_path, True, ("memory.db",))

    rendered = render_runtime_backup_created(
        backup_path=backup_path, mirror_home=tmp_path, verification=verification
    )

    assert "Mirror runtime backup" in rendered
    assert "Verification result: valid" in rendered
    assert "Manual recovery route:" in rendered
    assert "Recovery is manual" in rendered


def test_cmd_runtime_backup_creates_and_verifies_archive(tmp_path, capsys):
    db_path = tmp_path / "memory.db"
    db_path.write_text("db content", encoding="utf-8")

    rc = cmd_runtime(["backup", "--mirror-home", str(tmp_path)])

    out = capsys.readouterr().out
    assert rc == 0
    assert "Mirror runtime backup" in out
    assert "Verification result: valid" in out
    assert list((tmp_path / "backups").glob("memory_*.zip"))


def test_cmd_runtime_backup_missing_database_returns_nonzero(tmp_path, capsys):
    rc = cmd_runtime(["backup", "--mirror-home", str(tmp_path)])

    captured = capsys.readouterr()
    assert rc == 1
    assert "Database not found" in captured.err
    assert not (tmp_path / "backups").exists()


def test_cmd_runtime_backup_verify_dispatches(tmp_path, capsys):
    backup_path = tmp_path / "memory.zip"
    with zipfile.ZipFile(backup_path, "w") as zf:
        zf.writestr("memory.db", "db")

    rc = cmd_runtime(["backup", "--verify", str(backup_path)])

    out = capsys.readouterr().out
    assert rc == 0
    assert "Mirror runtime backup verification" in out
    assert "Verification result: valid" in out


def test_cmd_runtime_backup_verify_returns_nonzero_for_invalid_archive(tmp_path, capsys):
    backup_path = tmp_path / "bad.zip"
    backup_path.write_text("bad", encoding="utf-8")

    rc = cmd_runtime(["backup", "--verify", str(backup_path)])

    out = capsys.readouterr().out
    assert rc == 1
    assert "Verification result: invalid" in out


# CV9.E3.S7 — Safe Runtime Update Execution


def _ready_report(monkeypatch):
    monkeypatch.setattr(
        "memory.cli.runtime.build_runtime_status", lambda mirror_home_arg=None: _report()
    )


def _attention_report(monkeypatch):
    monkeypatch.setattr(
        "memory.cli.runtime.build_runtime_status",
        lambda mirror_home_arg=None: _report(git=GitStatus(Path("/repo"), "main", "abc1234", True)),
    )


def test_run_runtime_update_blocks_when_status_not_ready(monkeypatch):
    _attention_report(monkeypatch)

    result = run_runtime_update()

    assert not result.success
    assert result.stages[0].name == "status gate"
    assert result.stages[0].state == "fail"
    assert "runtime diagnose" in " ".join(result.recovery)


def test_run_runtime_update_exits_clean_when_already_up_to_date(monkeypatch):
    _ready_report(monkeypatch)
    monkeypatch.setattr("memory.cli.runtime._git_fetch", lambda remote, branch, cwd: (True, ""))
    monkeypatch.setattr(
        "memory.cli.runtime.inspect_git_update_plan",
        lambda git: GitUpdatePlan("origin/main", 0, 0, True, "none", "already up to date"),
    )

    result = run_runtime_update()

    assert result.success is True
    stage_names = [stage.name for stage in result.stages]
    assert "status gate" in stage_names
    assert "fetch" in stage_names
    assert "plan" in stage_names
    assert "fast-forward" not in stage_names


def test_run_runtime_update_blocks_on_ahead_plan(monkeypatch):
    _ready_report(monkeypatch)
    monkeypatch.setattr("memory.cli.runtime._git_fetch", lambda remote, branch, cwd: (True, ""))
    monkeypatch.setattr(
        "memory.cli.runtime.inspect_git_update_plan",
        lambda git: GitUpdatePlan("origin/main", 2, 0, False, "blocked", "local commits present"),
    )

    result = run_runtime_update()

    assert not result.success
    plan_stage = next(stage for stage in result.stages if stage.name == "plan")
    assert plan_stage.state == "fail"
    assert any("ahead" in entry for entry in result.recovery)


def test_run_runtime_update_blocks_when_fetch_fails(monkeypatch):
    _ready_report(monkeypatch)
    monkeypatch.setattr(
        "memory.cli.runtime.inspect_git_update_plan",
        lambda git: GitUpdatePlan("origin/main", 0, 1, True, "pull", "pull 1 commit"),
    )
    monkeypatch.setattr(
        "memory.cli.runtime._git_fetch",
        lambda remote, branch, cwd: (False, "remote unreachable"),
    )

    result = run_runtime_update()

    assert not result.success
    fetch_stage = next(stage for stage in result.stages if stage.name == "fetch")
    assert fetch_stage.state == "fail"
    assert "remote unreachable" in fetch_stage.detail
    assert any("--no-fetch" in entry for entry in result.recovery)


def test_run_runtime_update_runs_full_happy_path(monkeypatch, tmp_path):
    _ready_report(monkeypatch)
    monkeypatch.setattr("memory.cli.runtime.resolve_mirror_home", lambda **kw: tmp_path)
    monkeypatch.setattr("memory.cli.runtime._git_fetch", lambda remote, branch, cwd: (True, ""))
    monkeypatch.setattr(
        "memory.cli.runtime.inspect_git_update_plan",
        lambda git: GitUpdatePlan("origin/main", 0, 1, True, "pull", "pull 1 commit"),
    )
    backup_path = tmp_path / "memory.zip"
    backup_path.write_bytes(b"PK")
    monkeypatch.setattr(
        "memory.cli.runtime.create_backup",
        lambda silent, mirror_home: backup_path,
    )
    monkeypatch.setattr(
        "memory.cli.runtime.verify_backup_archive",
        lambda path: BackupVerification(path, True, ("memory.db",)),
    )
    monkeypatch.setattr("memory.cli.runtime._git_fast_forward", lambda upstream, cwd: (True, ""))
    monkeypatch.setattr(
        "memory.cli.runtime._git_installed_changes",
        lambda repository, previous_commit, new_commit: ("def5678 Add update UX",),
    )
    monkeypatch.setattr("memory.cli.runtime._apply_migrations", lambda mirror_home_arg: (True, ""))
    monkeypatch.setattr(
        "memory.cli.runtime.read_release_note",
        lambda version="latest", start=None: RuntimeReleaseNote(
            "v0.9.0", "Self-Update Done", tmp_path / "v0.9.0.md"
        ),
    )
    monkeypatch.setattr(
        "memory.cli.runtime._run_git",
        lambda args, *, cwd: (
            (0, "def5678", "") if args == ["rev-parse", "--short", "HEAD"] else (0, "", "")
        ),
    )

    result = run_runtime_update()

    assert result.success is True
    assert result.backup_path == backup_path
    assert result.new_commit == "def5678"
    assert result.installed_changes == ("def5678 Add update UX",)
    assert result.installed_release is not None
    assert result.installed_release.version == "v0.9.0"
    stage_names = [stage.name for stage in result.stages]
    assert stage_names == [
        "status gate",
        "fetch",
        "plan",
        "backup",
        "verify backup",
        "fast-forward",
        "migrations",
        "post-update status",
    ]


def test_run_runtime_update_migrations_failure_includes_recovery(monkeypatch, tmp_path):
    _ready_report(monkeypatch)
    monkeypatch.setattr("memory.cli.runtime.resolve_mirror_home", lambda **kw: tmp_path)
    monkeypatch.setattr("memory.cli.runtime._git_fetch", lambda remote, branch, cwd: (True, ""))
    monkeypatch.setattr(
        "memory.cli.runtime.inspect_git_update_plan",
        lambda git: GitUpdatePlan("origin/main", 0, 1, True, "pull", "pull 1 commit"),
    )
    backup_path = tmp_path / "memory.zip"
    monkeypatch.setattr(
        "memory.cli.runtime.create_backup",
        lambda silent, mirror_home: backup_path,
    )
    monkeypatch.setattr(
        "memory.cli.runtime.verify_backup_archive",
        lambda path: BackupVerification(path, True, ("memory.db",)),
    )
    monkeypatch.setattr("memory.cli.runtime._git_fast_forward", lambda upstream, cwd: (True, ""))
    monkeypatch.setattr(
        "memory.cli.runtime._git_installed_changes",
        lambda repository, previous_commit, new_commit: ("def5678 Add update UX",),
    )
    monkeypatch.setattr(
        "memory.cli.runtime._run_git",
        lambda args, *, cwd: (
            (0, "def5678", "") if args == ["rev-parse", "--short", "HEAD"] else (0, "", "")
        ),
    )
    monkeypatch.setattr(
        "memory.cli.runtime._apply_migrations",
        lambda mirror_home_arg: (False, "constraint failed"),
    )

    result = run_runtime_update()

    assert not result.success
    migrations_stage = next(stage for stage in result.stages if stage.name == "migrations")
    assert migrations_stage.state == "fail"
    assert result.installed_changes == ("def5678 Add update UX",)
    assert any("Backup:" in entry for entry in result.recovery)
    assert any("git reset --hard" in entry for entry in result.recovery)


def test_run_runtime_update_no_fetch_skips_fetch(monkeypatch):
    _ready_report(monkeypatch)
    monkeypatch.setattr(
        "memory.cli.runtime.inspect_git_update_plan",
        lambda git: GitUpdatePlan("origin/main", 0, 0, True, "none", "already up to date"),
    )

    called: list[bool] = []
    monkeypatch.setattr(
        "memory.cli.runtime._git_fetch",
        lambda remote, branch, cwd: called.append(True) or (True, ""),
    )

    result = run_runtime_update(fetch=False)

    assert result.success is True
    assert called == []
    fetch_stage = next(stage for stage in result.stages if stage.name == "fetch")
    assert fetch_stage.state == "skip"


def test_render_runtime_update_result_success(tmp_path):
    backup = tmp_path / "memory.zip"
    result = RuntimeUpdateResult(
        stages=(
            RuntimeUpdateStage("status gate", "pass"),
            RuntimeUpdateStage("plan", "pass", "pull 1 commit"),
            RuntimeUpdateStage("backup", "pass", str(backup)),
            RuntimeUpdateStage("verify backup", "pass"),
            RuntimeUpdateStage("fast-forward", "pass", "abc1234 -> def5678"),
            RuntimeUpdateStage("migrations", "pass"),
            RuntimeUpdateStage("post-update status", "pass"),
        ),
        previous_commit="abc1234",
        new_commit="def5678",
        backup_path=backup,
        success=True,
        installed_changes=("def5678 Add update UX", "fed9012 Improve release summary"),
        installed_release=RuntimeReleaseNote(
            "v0.9.0", "Self-Update Done", tmp_path / "v0.9.0.md", digest="Release summary."
        ),
    )

    rendered = render_runtime_update_result(result)

    assert "Mirror runtime update" in rendered
    assert "[✓] status gate" in rendered
    assert "[✓] fast-forward: abc1234 -> def5678" in rendered
    assert f"Backup: {backup}" in rendered
    assert "Installed release: v0.9.0 — Self-Update Done" in rendered
    assert "Summary: Release summary." in rendered
    assert "Installed changes:" in rendered
    assert "- def5678 Add update UX" in rendered
    assert "- fed9012 Improve release summary" in rendered
    assert "Update result: success" in rendered


def test_render_runtime_update_result_failure_renders_recovery():
    result = RuntimeUpdateResult(
        stages=(RuntimeUpdateStage("status gate", "fail", "runtime status is not ready"),),
        previous_commit=None,
        new_commit=None,
        backup_path=None,
        success=False,
        recovery=("Run: python -m memory runtime diagnose",),
    )

    rendered = render_runtime_update_result(result)

    assert "[✗] status gate: runtime status is not ready" in rendered
    assert "Update result: failed" in rendered
    assert "Recovery:" in rendered
    assert "- Run: python -m memory runtime diagnose" in rendered


def test_cmd_runtime_update_executes_and_returns_zero_on_success(monkeypatch, capsys):
    monkeypatch.setattr(
        "memory.cli.runtime.run_runtime_update",
        lambda mirror_home_arg=None, fetch=True, migrate=True: RuntimeUpdateResult(
            stages=(RuntimeUpdateStage("status gate", "pass"),),
            previous_commit="abc",
            new_commit="abc",
            backup_path=None,
            success=True,
        ),
    )

    rc = cmd_runtime(["update"])

    out = capsys.readouterr().out
    assert rc == 0
    assert "Update result: success" in out


def test_cmd_runtime_update_returns_nonzero_on_failure(monkeypatch, capsys):
    monkeypatch.setattr(
        "memory.cli.runtime.run_runtime_update",
        lambda mirror_home_arg=None, fetch=True, migrate=True: RuntimeUpdateResult(
            stages=(RuntimeUpdateStage("status gate", "fail", "not ready"),),
            previous_commit=None,
            new_commit=None,
            backup_path=None,
            success=False,
            recovery=("Run: python -m memory runtime diagnose",),
        ),
    )

    rc = cmd_runtime(["update"])

    out = capsys.readouterr().out
    assert rc == 1
    assert "Update result: failed" in out
    assert "Recovery:" in out


def test_cmd_runtime_update_passes_flag_overrides(monkeypatch, capsys):
    captured: dict = {}

    def fake_run(*, mirror_home_arg=None, fetch=True, migrate=True):
        captured["fetch"] = fetch
        captured["migrate"] = migrate
        return RuntimeUpdateResult(
            stages=(RuntimeUpdateStage("status gate", "pass"),),
            previous_commit=None,
            new_commit=None,
            backup_path=None,
            success=True,
        )

    monkeypatch.setattr("memory.cli.runtime.run_runtime_update", fake_run)

    cmd_runtime(["update", "--no-fetch", "--skip-migrations"])

    assert captured == {"fetch": False, "migrate": False}


# CV9.E3.S9 — Updater Self-Recovery


def test_runtime_update_falls_back_to_repair_when_status_crashes(monkeypatch, tmp_path):
    monkeypatch.setattr(
        "memory.cli.runtime.build_runtime_status",
        lambda mirror_home_arg=None: (_ for _ in ()).throw(RuntimeError("status exploded")),
    )
    monkeypatch.setattr(
        "memory.cli.runtime.inspect_git",
        lambda start: GitStatus(tmp_path, "main", "abc1234", False),
    )
    monkeypatch.setattr(
        "memory.cli.runtime.inspect_git_update_plan",
        lambda git: GitUpdatePlan("origin/main", 0, 1, True, "pull", "pull 1 commit"),
    )
    monkeypatch.setattr("memory.cli.runtime._git_fetch", lambda remote, branch, cwd: (True, ""))
    backup_path = tmp_path / "backup.zip"
    monkeypatch.setattr("memory.cli.runtime.resolve_mirror_home", lambda: tmp_path)
    monkeypatch.setattr(
        "memory.cli.runtime.default_db_path_for_home", lambda home: tmp_path / "memory.db"
    )
    (tmp_path / "memory.db").write_text("db", encoding="utf-8")
    monkeypatch.setattr("memory.cli.runtime.create_backup", lambda silent, mirror_home: backup_path)
    monkeypatch.setattr(
        "memory.cli.runtime.verify_backup_archive",
        lambda path: BackupVerification(path, True, ("memory.db",)),
    )
    monkeypatch.setattr("memory.cli.runtime._git_fast_forward", lambda upstream, cwd: (True, ""))
    monkeypatch.setattr(
        "memory.cli.runtime._run_git",
        lambda args, *, cwd: (
            (0, "def5678", "") if args == ["rev-parse", "--short", "HEAD"] else (0, "", "")
        ),
    )
    monkeypatch.setattr(
        "memory.cli.runtime._git_installed_changes",
        lambda repository, previous_commit, new_commit: ("def5678 Fix updater",),
    )

    result = run_runtime_update()

    assert result.success is True
    assert result.backup_path == backup_path
    assert result.installed_changes == ("def5678 Fix updater",)
    assert result.next_steps == ("Run: python -m memory runtime update",)
    assert result.stages[0] == RuntimeUpdateStage(
        "status gate", "fail", "runtime status crashed before update planning: status exploded"
    )
    assert any(stage.name == "code repair fast-forward" for stage in result.stages)
    migrations_stage = next(stage for stage in result.stages if stage.name == "migrations")
    assert migrations_stage.state == "skip"


def test_runtime_update_repair_blocks_dirty_tree(monkeypatch, tmp_path):
    monkeypatch.setattr(
        "memory.cli.runtime.inspect_git",
        lambda start: GitStatus(tmp_path, "main", "abc1234", True),
    )

    result = run_runtime_update_repair()

    assert result.success is False
    repair_stage = next(stage for stage in result.stages if stage.name == "repair preflight")
    assert repair_stage.state == "fail"
    assert "dirty" in repair_stage.detail
    assert any("Commit, stash" in entry for entry in result.recovery)


def test_runtime_update_repair_allows_code_only_without_database(monkeypatch, tmp_path):
    monkeypatch.setattr(
        "memory.cli.runtime.inspect_git",
        lambda start: GitStatus(tmp_path, "main", "abc1234", False),
    )
    monkeypatch.setattr(
        "memory.cli.runtime.inspect_git_update_plan",
        lambda git: GitUpdatePlan("origin/main", 0, 1, True, "pull", "pull 1 commit"),
    )
    monkeypatch.setattr("memory.cli.runtime._git_fetch", lambda remote, branch, cwd: (True, ""))
    monkeypatch.setattr("memory.cli.runtime.resolve_mirror_home", lambda: tmp_path)
    monkeypatch.setattr(
        "memory.cli.runtime.default_db_path_for_home", lambda home: tmp_path / "missing.db"
    )
    monkeypatch.setattr("memory.cli.runtime._git_fast_forward", lambda upstream, cwd: (True, ""))
    monkeypatch.setattr(
        "memory.cli.runtime._run_git",
        lambda args, *, cwd: (
            (0, "def5678", "") if args == ["rev-parse", "--short", "HEAD"] else (0, "", "")
        ),
    )

    result = run_runtime_update_repair()

    assert result.success is True
    backup_stage = next(stage for stage in result.stages if stage.name == "backup")
    assert backup_stage.state == "skip"
    assert backup_stage.detail == "database not found"
    migrations_stage = next(stage for stage in result.stages if stage.name == "migrations")
    assert migrations_stage.state == "skip"


def test_render_runtime_update_result_renders_next_steps():
    result = RuntimeUpdateResult(
        stages=(RuntimeUpdateStage("code repair fast-forward", "pass", "abc1234 -> def5678"),),
        previous_commit="abc1234",
        new_commit="def5678",
        backup_path=None,
        success=True,
        next_steps=("Run: python -m memory runtime update",),
    )

    rendered = render_runtime_update_result(result)

    assert "Next:" in rendered
    assert "- Run: python -m memory runtime update" in rendered


def test_cmd_runtime_update_repair_updater_invokes_repair(monkeypatch, capsys):
    captured: dict = {}

    def fake_repair(*, mirror_home_arg=None, fetch=True):
        captured["fetch"] = fetch
        captured["mirror_home_arg"] = mirror_home_arg
        return RuntimeUpdateResult(
            stages=(RuntimeUpdateStage("repair preflight", "pass"),),
            previous_commit="abc1234",
            new_commit="abc1234",
            backup_path=None,
            success=True,
        )

    monkeypatch.setattr("memory.cli.runtime.run_runtime_update_repair", fake_repair)

    rc = cmd_runtime(["update", "--repair-updater", "--no-fetch", "--mirror-home", "/tmp/m"])

    assert rc == 0
    assert captured == {"fetch": False, "mirror_home_arg": "/tmp/m"}
    assert "Update result: success" in capsys.readouterr().out


# CV9.E3.S10 — Release Channel Update Management


def test_inspect_update_channel_defaults_to_stable_outside_repo(monkeypatch, tmp_path):
    monkeypatch.setattr("memory.cli.runtime._resolve_repo_root", lambda start: None)

    from memory.cli.runtime import inspect_update_channel

    channel = inspect_update_channel(tmp_path)

    assert channel.value == "stable"
    assert channel.note == "no repository"


def test_inspect_update_channel_reads_local_marker(monkeypatch, tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / ".mirror-update-channel").write_text("main\n", encoding="utf-8")
    monkeypatch.setattr("memory.cli.runtime._resolve_repo_root", lambda start: repo)

    from memory.cli.runtime import inspect_update_channel

    channel = inspect_update_channel(repo)

    assert channel.value == "main"
    assert channel.source == repo / ".mirror-update-channel"


def test_inspect_update_channel_invalid_defaults_to_stable(monkeypatch, tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    marker = repo / ".mirror-update-channel"
    marker.write_text("nightly\n", encoding="utf-8")
    monkeypatch.setattr("memory.cli.runtime._resolve_repo_root", lambda start: repo)

    from memory.cli.runtime import inspect_update_channel

    channel = inspect_update_channel(repo)

    assert channel.value == "stable"
    assert channel.source == marker
    assert "unknown channel" in (channel.note or "")


def test_inspect_git_update_plan_uses_update_channel(monkeypatch, tmp_path):
    calls: list[list[str]] = []

    def fake_run_git(args, *, cwd):
        calls.append(args)
        if args == ["rev-parse", "--verify", "origin/stable"]:
            return 0, "origin/stable", ""
        if args == ["rev-list", "--left-right", "--count", "HEAD...origin/stable"]:
            return 0, "0 2", ""
        raise AssertionError(args)

    monkeypatch.setattr("memory.cli.runtime._run_git", fake_run_git)

    from memory.cli.runtime import UpdateChannel

    plan = inspect_git_update_plan(
        GitStatus(tmp_path, "main", "abc1234", False), UpdateChannel("stable", None)
    )

    assert plan.upstream == "origin/stable"
    assert plan.behind == 2
    assert plan.action == "pull"
    assert ["rev-parse", "--verify", "origin/stable"] in calls


def test_render_runtime_version_includes_update_channel():
    from memory.cli.runtime import UpdateChannel

    rendered = render_runtime_version(
        RuntimeVersionReport(
            "0.7.0",
            GitStatus(Path("/repo"), "main", "abc1234", False),
            CloneRole("production", None),
            UpdateChannel("stable", None),
        )
    )

    assert "Update channel: stable" in rendered


def test_render_runtime_status_includes_update_channel():
    from memory.cli.runtime import UpdateChannel

    rendered = render_runtime_status(_report(update_channel=UpdateChannel("main", None)))

    assert "Update channel: main" in rendered


def test_read_release_note_from_ref_reads_latest_note(monkeypatch, tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    calls: list[list[str]] = []

    def fake_run_git(args, *, cwd):
        calls.append(args)
        if args == ["ls-tree", "-r", "--name-only", "origin/stable", "docs/releases"]:
            return 0, "docs/releases/v0.8.0.md\ndocs/releases/v0.9.0.md", ""
        if args == ["show", "origin/stable:docs/releases/v0.9.0.md"]:
            return (
                0,
                """---
digest: >
  Release summary.
---

# v0.9.0 — Self-Update Done

## Highlights

- Release-aware notices.
""",
                "",
            )
        raise AssertionError(args)

    monkeypatch.setattr("memory.cli.runtime._resolve_repo_root", lambda start: repo)
    monkeypatch.setattr("memory.cli.runtime._run_git", fake_run_git)

    note = read_release_note_from_ref("origin/stable", start=repo)

    assert note is not None
    assert note.version == "v0.9.0"
    assert note.title == "Self-Update Done"
    assert note.digest == "Release summary."
    assert ["show", "origin/stable:docs/releases/v0.9.0.md"] in calls


def test_runtime_release_notes_latest_reads_digest_and_highlights(tmp_path, monkeypatch):
    repo = tmp_path / "repo"
    notes = repo / "docs" / "releases"
    notes.mkdir(parents=True)
    (notes / "v0.8.0.md").write_text(
        """---
digest: >
  Release summary line one.
  Release summary line two.
---

# v0.8.0 — Runtime Update Awareness

## Highlights

- Welcome shows the installed version.
- Stable channel support.

## What Changed

Details.
""",
        encoding="utf-8",
    )
    monkeypatch.setattr("memory.cli.runtime._resolve_repo_root", lambda start: repo)

    from memory.cli.runtime import read_release_note, render_release_note

    note = read_release_note("latest", start=repo)
    assert note is not None
    assert note.version == "v0.8.0"
    assert note.title == "Runtime Update Awareness"
    assert note.digest == "Release summary line one. Release summary line two."
    assert note.highlights == (
        "Welcome shows the installed version.",
        "Stable channel support.",
    )

    rendered = render_release_note(note)
    assert "Release: v0.8.0 — Runtime Update Awareness" in rendered
    assert "Release summary line one. Release summary line two." in rendered
    assert "- Stable channel support." in rendered


def test_cmd_runtime_release_notes_dispatches(monkeypatch, tmp_path, capsys):
    from memory.cli.runtime import RuntimeReleaseNote

    monkeypatch.setattr(
        "memory.cli.runtime.read_release_note",
        lambda version: RuntimeReleaseNote("v0.8.0", "Runtime Update Awareness", tmp_path / "n.md"),
    )

    rc = cmd_runtime(["release-notes", "latest"])

    assert rc == 0
    assert "Release: v0.8.0 — Runtime Update Awareness" in capsys.readouterr().out


# CV9.E3.S15 — Release Promotion Checklist / Doctor


def _write_release_files(repo: Path, version: str = "v0.9.0") -> None:
    releases = repo / "docs" / "releases"
    releases.mkdir(parents=True)
    (releases / f"{version}.md").write_text(
        f"""---
digest: >
  Release summary.
---

# {version} — Self-Update Done

## Highlights

- Release doctor.
""",
        encoding="utf-8",
    )
    (releases / "index.md").write_text(
        f"# Releases\n\n- [{version} — Self-Update Done]({version}.md)\n", encoding="utf-8"
    )


def _write_pyproject(repo: Path, version: str = "0.9.0") -> None:
    (repo / "pyproject.toml").write_text(
        f'[project]\nname = "mirror"\nversion = "{version}"\n', encoding="utf-8"
    )


def test_render_release_doctor_result_with_warnings(tmp_path):
    report = ReleaseDoctorReport(
        "v0.9.0",
        tmp_path,
        (
            ReleaseDoctorCheck("git tree clean", "pass"),
            ReleaseDoctorCheck("release tag", "warn", "v0.9.0 not created yet"),
        ),
    )

    rendered = render_release_doctor(report)

    assert "Mirror runtime release doctor" in rendered
    assert "Target: v0.9.0" in rendered
    assert "[✓] git tree clean" in rendered
    assert "[!] release tag: v0.9.0 not created yet" in rendered
    assert "Release doctor result: ready with warnings" in rendered
    assert "read-only" in rendered


def test_build_release_doctor_report_passes_local_files_with_expected_warnings(
    monkeypatch, tmp_path
):
    _write_pyproject(tmp_path)
    _write_release_files(tmp_path)
    monkeypatch.setattr("memory.cli.runtime._resolve_repo_root", lambda start: tmp_path)
    monkeypatch.setattr(
        "memory.cli.runtime.inspect_git",
        lambda start: GitStatus(tmp_path, "main", "abc1234", False),
    )

    def fake_ref(repository, ref):
        if ref == "HEAD":
            return "abcdef1234567890"
        return None

    monkeypatch.setattr("memory.cli.runtime._git_ref_full_commit", fake_ref)

    report = build_release_doctor_report(target="v0.9.0", start=tmp_path)

    assert not report.has_failures
    assert ReleaseDoctorCheck("package version", "pass", "0.9.0") in report.checks
    assert any(check.name == "release tag" and check.state == "warn" for check in report.checks)
    assert any(check.name == "stable ref" and check.state == "warn" for check in report.checks)


def test_build_release_doctor_report_fails_dirty_tree(monkeypatch, tmp_path):
    _write_pyproject(tmp_path)
    _write_release_files(tmp_path)
    monkeypatch.setattr("memory.cli.runtime._resolve_repo_root", lambda start: tmp_path)
    monkeypatch.setattr(
        "memory.cli.runtime.inspect_git",
        lambda start: GitStatus(tmp_path, "main", "abc1234", True),
    )
    monkeypatch.setattr("memory.cli.runtime._git_ref_full_commit", lambda repository, ref: None)

    report = build_release_doctor_report(target="v0.9.0", start=tmp_path)

    assert report.has_failures
    assert any(check.name == "git tree clean" and check.state == "fail" for check in report.checks)


def test_build_release_doctor_report_fails_version_mismatch(monkeypatch, tmp_path):
    _write_pyproject(tmp_path, "0.8.0")
    _write_release_files(tmp_path)
    monkeypatch.setattr("memory.cli.runtime._resolve_repo_root", lambda start: tmp_path)
    monkeypatch.setattr(
        "memory.cli.runtime.inspect_git",
        lambda start: GitStatus(tmp_path, "main", "abc1234", False),
    )
    monkeypatch.setattr("memory.cli.runtime._git_ref_full_commit", lambda repository, ref: None)

    report = build_release_doctor_report(target="v0.9.0", start=tmp_path)

    assert report.has_failures
    assert any(
        check.name == "package version" and check.state == "fail" and "0.8.0" in check.detail
        for check in report.checks
    )


def test_build_release_doctor_report_fails_missing_release_note(monkeypatch, tmp_path):
    _write_pyproject(tmp_path)
    (tmp_path / "docs" / "releases").mkdir(parents=True)
    (tmp_path / "docs" / "releases" / "index.md").write_text("# Releases\n", encoding="utf-8")
    monkeypatch.setattr("memory.cli.runtime._resolve_repo_root", lambda start: tmp_path)
    monkeypatch.setattr(
        "memory.cli.runtime.inspect_git",
        lambda start: GitStatus(tmp_path, "main", "abc1234", False),
    )
    monkeypatch.setattr("memory.cli.runtime._git_ref_full_commit", lambda repository, ref: None)

    report = build_release_doctor_report(target="v0.9.0", start=tmp_path)

    assert report.has_failures
    assert any(
        check.name == "release note exists" and check.state == "fail" for check in report.checks
    )
    assert any(check.name == "release index" and check.state == "fail" for check in report.checks)


def test_build_release_doctor_report_fails_tag_mismatch(monkeypatch, tmp_path):
    _write_pyproject(tmp_path)
    _write_release_files(tmp_path)
    monkeypatch.setattr("memory.cli.runtime._resolve_repo_root", lambda start: tmp_path)
    monkeypatch.setattr(
        "memory.cli.runtime.inspect_git",
        lambda start: GitStatus(tmp_path, "main", "abcdef1", False),
    )

    def fake_ref(repository, ref):
        return {"HEAD": "abcdef1234567890", "v0.9.0": "9999999999999999"}.get(ref)

    monkeypatch.setattr("memory.cli.runtime._git_ref_full_commit", fake_ref)

    report = build_release_doctor_report(target="v0.9.0", start=tmp_path)

    assert report.has_failures
    assert any(check.name == "release tag" and check.state == "fail" for check in report.checks)


def test_build_release_doctor_report_warns_when_stable_behind(monkeypatch, tmp_path):
    _write_pyproject(tmp_path)
    _write_release_files(tmp_path)
    monkeypatch.setattr("memory.cli.runtime._resolve_repo_root", lambda start: tmp_path)
    monkeypatch.setattr(
        "memory.cli.runtime.inspect_git",
        lambda start: GitStatus(tmp_path, "main", "abcdef1", False),
    )

    def fake_ref(repository, ref):
        return {
            "HEAD": "abcdef1234567890",
            "v0.9.0": "abcdef1234567890",
            "origin/stable": "1111111111111111",
        }.get(ref)

    def fake_contains(repository, ancestor, descendant):
        if ancestor == "origin/stable" and descendant == "HEAD":
            return True
        if ancestor == "HEAD" and descendant == "origin/stable":
            return False
        return None

    monkeypatch.setattr("memory.cli.runtime._git_ref_full_commit", fake_ref)
    monkeypatch.setattr("memory.cli.runtime._git_ref_contains", fake_contains)

    report = build_release_doctor_report(target="v0.9.0", start=tmp_path)

    assert not report.has_failures
    assert any(check.name == "stable ref" and check.state == "warn" for check in report.checks)


def test_cmd_runtime_release_doctor_dispatches(monkeypatch, tmp_path, capsys):
    monkeypatch.setattr(
        "memory.cli.runtime.build_release_doctor_report",
        lambda target, stable_ref="origin/stable": ReleaseDoctorReport(
            target,
            tmp_path,
            (ReleaseDoctorCheck("package version", "fail", "expected 0.9.0, found 0.8.0"),),
        ),
    )

    rc = cmd_runtime(["release-doctor", "--target", "v0.9.0"])

    assert rc == 1
    assert "Release doctor result: failed" in capsys.readouterr().out


# CV9.E3.S16 — Stable Promotion Execution Path


def _doctor_report(tmp_path, *, failures=False):
    checks = (
        ReleaseDoctorCheck(
            "package version", "fail" if failures else "pass", "bad" if failures else "0.9.0"
        ),
    )
    return ReleaseDoctorReport("v0.9.0", tmp_path, checks)


def test_render_release_promotion_result_success():
    result = ReleasePromotionResult(
        "v0.9.0",
        (
            RuntimeUpdateStage("release doctor", "pass", "ready"),
            RuntimeUpdateStage("tag", "pass", "created v0.9.0 at HEAD"),
            RuntimeUpdateStage("push", "skip", "use --push to publish tag and stable"),
        ),
        True,
    )

    rendered = render_release_promotion_result(result)

    assert "Mirror runtime release promotion" in rendered
    assert "Target: v0.9.0" in rendered
    assert "[✓] release doctor: ready" in rendered
    assert "[-] push: use --push" in rendered
    assert "Release promotion result: success" in rendered


def test_run_release_promotion_blocks_on_doctor_failures(monkeypatch, tmp_path):
    monkeypatch.setattr(
        "memory.cli.runtime.build_release_doctor_report",
        lambda target, stable_ref: _doctor_report(tmp_path, failures=True),
    )

    result = run_release_promotion(target="v0.9.0")

    assert result.success is False
    assert result.stages[0].name == "release doctor"
    assert result.stages[0].state == "fail"
    assert any("release-doctor" in entry for entry in result.recovery)


def test_run_release_promotion_dry_run_does_not_mutate(monkeypatch, tmp_path):
    monkeypatch.setattr(
        "memory.cli.runtime.build_release_doctor_report",
        lambda target, stable_ref: _doctor_report(tmp_path),
    )
    monkeypatch.setattr(
        "memory.cli.runtime._git_ref_full_commit",
        lambda repository, ref: "abcdef1234567890" if ref == "HEAD" else None,
    )
    called: list[str] = []
    monkeypatch.setattr(
        "memory.cli.runtime._git_create_tag",
        lambda tag, cwd: called.append("tag") or (True, ""),
    )
    monkeypatch.setattr(
        "memory.cli.runtime._git_move_branch",
        lambda branch, cwd: called.append("branch") or (True, ""),
    )

    result = run_release_promotion(target="v0.9.0", dry_run=True)

    assert result.success is True
    assert result.dry_run is True
    assert called == []
    assert any(stage.name == "tag" and stage.state == "skip" for stage in result.stages)
    assert any(stage.name == "stable branch" and stage.state == "skip" for stage in result.stages)


def test_run_release_promotion_creates_missing_tag_and_stable(monkeypatch, tmp_path):
    monkeypatch.setattr(
        "memory.cli.runtime.build_release_doctor_report",
        lambda target, stable_ref: _doctor_report(tmp_path),
    )
    refs: dict[str, str | None] = {"HEAD": "abcdef1234567890", "v0.9.0": None, "stable": None}
    monkeypatch.setattr(
        "memory.cli.runtime._git_ref_full_commit", lambda repository, ref: refs.get(ref)
    )
    calls: list[tuple[str, str]] = []
    monkeypatch.setattr(
        "memory.cli.runtime._git_create_tag",
        lambda tag, cwd: (
            calls.append(("tag", tag)) or refs.__setitem__(tag, refs["HEAD"]) or (True, "")
        ),
    )
    monkeypatch.setattr(
        "memory.cli.runtime._git_move_branch",
        lambda branch, cwd: (
            calls.append(("branch", branch)) or refs.__setitem__(branch, refs["HEAD"]) or (True, "")
        ),
    )

    result = run_release_promotion(target="v0.9.0")

    assert result.success is True
    assert ("tag", "v0.9.0") in calls
    assert ("branch", "stable") in calls
    assert any(stage.name == "push" and stage.state == "skip" for stage in result.stages)


def test_run_release_promotion_reuses_existing_tag_at_head(monkeypatch, tmp_path):
    monkeypatch.setattr(
        "memory.cli.runtime.build_release_doctor_report",
        lambda target, stable_ref: _doctor_report(tmp_path),
    )
    monkeypatch.setattr(
        "memory.cli.runtime._git_ref_full_commit",
        lambda repository, ref: "abcdef1234567890" if ref in {"HEAD", "v0.9.0", "stable"} else None,
    )

    result = run_release_promotion(target="v0.9.0")

    assert result.success is True
    assert any(
        stage.name == "tag" and "already at HEAD" in (stage.detail or "") for stage in result.stages
    )
    assert any(
        stage.name == "stable branch" and "already at HEAD" in (stage.detail or "")
        for stage in result.stages
    )


def test_run_release_promotion_blocks_divergent_local_stable(monkeypatch, tmp_path):
    monkeypatch.setattr(
        "memory.cli.runtime.build_release_doctor_report",
        lambda target, stable_ref: _doctor_report(tmp_path),
    )
    monkeypatch.setattr(
        "memory.cli.runtime._git_ref_full_commit",
        lambda repository, ref: {
            "HEAD": "abcdef1234567890",
            "v0.9.0": "abcdef1234567890",
            "stable": "1111111111111111",
        }.get(ref),
    )
    monkeypatch.setattr(
        "memory.cli.runtime._git_ref_contains", lambda repository, ancestor, descendant: False
    )

    result = run_release_promotion(target="v0.9.0")

    assert result.success is False
    assert any(stage.name == "stable branch" and stage.state == "fail" for stage in result.stages)


def test_run_release_promotion_pushes_only_when_requested(monkeypatch, tmp_path):
    monkeypatch.setattr(
        "memory.cli.runtime.build_release_doctor_report",
        lambda target, stable_ref: _doctor_report(tmp_path),
    )
    monkeypatch.setattr(
        "memory.cli.runtime._git_ref_full_commit",
        lambda repository, ref: "abcdef1234567890" if ref in {"HEAD", "v0.9.0", "stable"} else None,
    )
    pushes: list[str] = []
    monkeypatch.setattr(
        "memory.cli.runtime._git_push_ref",
        lambda remote, ref, cwd: pushes.append(ref) or (True, ""),
    )

    result = run_release_promotion(target="v0.9.0", push=True)

    assert result.success is True
    assert pushes == ["v0.9.0", "stable"]
    assert any(stage.name == "push tag" and stage.state == "pass" for stage in result.stages)
    assert any(stage.name == "push stable" and stage.state == "pass" for stage in result.stages)


def test_cmd_runtime_release_promote_dispatches(monkeypatch, capsys):
    monkeypatch.setattr(
        "memory.cli.runtime.run_release_promotion",
        lambda target, dry_run=False, push=False, stable_branch="stable", remote="origin": (
            ReleasePromotionResult(
                target,
                (RuntimeUpdateStage("release doctor", "pass", "ready"),),
                True,
                dry_run,
            )
        ),
    )

    rc = cmd_runtime(["release-promote", "--target", "v0.9.0", "--dry-run"])

    assert rc == 0
    out = capsys.readouterr().out
    assert "Mirror runtime release promotion" in out
    assert "Mode: dry-run" in out
