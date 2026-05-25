"""Runtime status inspection for Mirror Mind."""

from __future__ import annotations

import argparse
import re
import sqlite3
import subprocess
import sys
import zipfile
from dataclasses import dataclass, field
from importlib import metadata
from pathlib import Path

from memory.cli.backup import backup as create_backup
from memory.cli.extensions import ExtensionValidationError, load_extension_manifest
from memory.config import (
    MEMORY_ENV,
    default_db_path_for_home,
    default_extensions_dir_for_home,
    resolve_mirror_home,
)
from memory.db.migrations import MIGRATIONS
from memory.extensions.migrations import ExtensionMigrationError, inspect_migration_files

_CLONE_ROLE_FILENAME = ".mirror-clone-role"
_DEFAULT_CLONE_ROLE = "production"
_KNOWN_CLONE_ROLES = frozenset({"production", "dev"})
_UPDATE_CHANNEL_FILENAME = ".mirror-update-channel"
_DEFAULT_UPDATE_CHANNEL = "stable"
_KNOWN_UPDATE_CHANNELS = frozenset({"stable", "main"})


@dataclass(frozen=True)
class CloneRole:
    value: str
    source: Path | None
    note: str | None = None

    @property
    def is_production(self) -> bool:
        return self.value == "production"


@dataclass(frozen=True)
class UpdateChannel:
    value: str
    source: Path | None
    note: str | None = None

    @property
    def upstream(self) -> str:
        return f"origin/{self.value}"


@dataclass(frozen=True)
class BackupVerification:
    backup_path: Path
    valid: bool
    entries: tuple[str, ...]
    note: str | None = None


@dataclass(frozen=True)
class GitStatus:
    repository: Path | None
    branch: str | None
    commit: str | None
    dirty: bool | None
    error: str | None = None


@dataclass(frozen=True)
class CoreMigrationHealth:
    ready: bool
    applied_count: int | None
    known_count: int
    missing: tuple[str, ...]
    unknown: tuple[str, ...] = ()
    note: str | None = None


@dataclass(frozen=True)
class ExtensionHealth:
    extension_id: str
    ready: bool
    note: str | None = None
    pending_migrations: tuple[str, ...] = ()
    drifted_migrations: tuple[str, ...] = ()
    unknown_migrations: tuple[str, ...] = ()


@dataclass(frozen=True)
class GitWorktreeEntry:
    status: str
    path: str


@dataclass(frozen=True)
class DriftFinding:
    code: str
    severity: str
    subject: str
    detail: str
    recommendation: str
    repair_route: str


@dataclass(frozen=True)
class RuntimeVersionReport:
    version: str
    git: GitStatus
    clone_role: CloneRole
    update_channel: UpdateChannel = field(
        default_factory=lambda: UpdateChannel(_DEFAULT_UPDATE_CHANNEL, None)
    )


@dataclass(frozen=True)
class RuntimeUpdateAvailability:
    version: str
    upstream: str | None
    local_commit: str | None
    remote_commit: str | None
    status: str
    note: str | None = None
    update_channel: UpdateChannel = field(
        default_factory=lambda: UpdateChannel(_DEFAULT_UPDATE_CHANNEL, None)
    )
    target_release: RuntimeReleaseNote | None = None


@dataclass(frozen=True)
class GitUpdatePlan:
    upstream: str | None
    ahead: int | None
    behind: int | None
    ready: bool
    action: str
    note: str | None = None


@dataclass(frozen=True)
class RuntimeReleaseNote:
    version: str
    title: str
    path: Path
    digest: str | None = None
    highlights: tuple[str, ...] = ()


@dataclass(frozen=True)
class ReleaseDoctorCheck:
    name: str
    state: str
    detail: str | None = None


@dataclass(frozen=True)
class ReleaseDoctorReport:
    target: str
    repository: Path | None
    checks: tuple[ReleaseDoctorCheck, ...]

    @property
    def has_failures(self) -> bool:
        return any(check.state == "fail" for check in self.checks)


@dataclass(frozen=True)
class RuntimeUpdateDryRun:
    status_report: RuntimeStatusReport
    git_plan: GitUpdatePlan | None
    target_release: RuntimeReleaseNote | None = None

    @property
    def ready(self) -> bool:
        return self.status_report.status == "ready" and bool(self.git_plan and self.git_plan.ready)


@dataclass(frozen=True)
class RuntimeUpdateStage:
    name: str
    state: str
    detail: str | None = None


@dataclass(frozen=True)
class RuntimeUpdateResult:
    stages: tuple[RuntimeUpdateStage, ...]
    previous_commit: str | None
    new_commit: str | None
    backup_path: Path | None
    success: bool
    recovery: tuple[str, ...] = ()
    installed_changes: tuple[str, ...] = ()
    installed_release: RuntimeReleaseNote | None = None
    next_steps: tuple[str, ...] = ()


@dataclass(frozen=True)
class ReleasePromotionResult:
    target: str
    stages: tuple[RuntimeUpdateStage, ...]
    success: bool
    dry_run: bool = False
    recovery: tuple[str, ...] = ()


@dataclass(frozen=True)
class RuntimeStatusReport:
    version: str
    git: GitStatus
    mirror_home: Path | None
    mirror_home_error: str | None
    db_path: Path | None
    db_exists: bool | None
    core_migrations: CoreMigrationHealth
    extensions: tuple[str, ...]
    extension_health: tuple[ExtensionHealth, ...]
    clone_role: CloneRole
    python_version: str
    memory_env: str
    update_channel: UpdateChannel = field(
        default_factory=lambda: UpdateChannel(_DEFAULT_UPDATE_CHANNEL, None)
    )

    @property
    def status(self) -> str:
        if self.mirror_home_error:
            return "attention needed"
        if self.git.error:
            return "attention needed"
        if self.git.dirty:
            return "attention needed"
        if self.db_exists is False:
            return "attention needed"
        if not self.core_migrations.ready:
            return "attention needed"
        if any(not health.ready for health in self.extension_health):
            return "attention needed"
        return "ready"


def _resolve_repo_root(start: Path) -> Path | None:
    code, stdout, _stderr = _run_git(["rev-parse", "--show-toplevel"], cwd=start)
    if code != 0 or not stdout:
        return None
    return Path(stdout).resolve()


def inspect_clone_role(start: Path | None = None) -> CloneRole:
    start_path = (start or Path.cwd()).expanduser().resolve()
    repo_root = _resolve_repo_root(start_path)
    if repo_root is None:
        return CloneRole(_DEFAULT_CLONE_ROLE, None, note="no repository")
    marker = repo_root / _CLONE_ROLE_FILENAME
    if not marker.exists():
        return CloneRole(_DEFAULT_CLONE_ROLE, None)
    try:
        raw = marker.read_text(encoding="utf-8")
    except OSError as exc:
        return CloneRole(_DEFAULT_CLONE_ROLE, marker, note=f"unreadable: {exc}")
    value = raw.strip().lower()
    if value in _KNOWN_CLONE_ROLES:
        return CloneRole(value, marker)
    return CloneRole(
        _DEFAULT_CLONE_ROLE,
        marker,
        note=f"unknown role '{value}', defaulting to production",
    )


def inspect_update_channel(start: Path | None = None, override: str | None = None) -> UpdateChannel:
    if override:
        value = override.strip().lower()
        if value in _KNOWN_UPDATE_CHANNELS:
            return UpdateChannel(value, None, note="command override")
        return UpdateChannel(
            _DEFAULT_UPDATE_CHANNEL,
            None,
            note=f"unknown channel '{value}', defaulting to stable",
        )

    start_path = (start or Path.cwd()).expanduser().resolve()
    repo_root = _resolve_repo_root(start_path)
    if repo_root is None:
        return UpdateChannel(_DEFAULT_UPDATE_CHANNEL, None, note="no repository")
    marker = repo_root / _UPDATE_CHANNEL_FILENAME
    if not marker.exists():
        return UpdateChannel(_DEFAULT_UPDATE_CHANNEL, None)
    try:
        raw = marker.read_text(encoding="utf-8")
    except OSError as exc:
        return UpdateChannel(_DEFAULT_UPDATE_CHANNEL, marker, note=f"unreadable: {exc}")
    value = raw.strip().lower()
    if value in _KNOWN_UPDATE_CHANNELS:
        return UpdateChannel(value, marker)
    return UpdateChannel(
        _DEFAULT_UPDATE_CHANNEL,
        marker,
        note=f"unknown channel '{value}', defaulting to stable",
    )


def package_version() -> str:
    try:
        return metadata.version("mirror")
    except metadata.PackageNotFoundError:
        return _version_from_pyproject(Path.cwd()) or "unknown"


def _repo_file(start: Path, *parts: str) -> Path:
    repo_root = _resolve_repo_root(start) or start.resolve()
    return repo_root.joinpath(*parts)


def _parse_semver(version: str) -> tuple[int, int, int]:
    match = re.fullmatch(r"v?(\d+)\.(\d+)\.(\d+)", version.strip())
    if not match:
        return (-1, -1, -1)
    major, minor, patch = match.groups()
    return int(major), int(minor), int(patch)


def _release_notes_dir(start: Path | None = None) -> Path:
    return _repo_file((start or Path.cwd()).resolve(), "docs", "releases")


def _extract_frontmatter_digest(text: str) -> str | None:
    if not text.startswith("---"):
        return None
    parts = text.split("---", 2)
    if len(parts) < 3:
        return None
    frontmatter = parts[1]
    match = re.search(r"digest:\s*>\s*\n(?P<body>(?:\s+.*\n?)*)", frontmatter)
    if not match:
        return None
    lines = [line.strip() for line in match.group("body").splitlines() if line.strip()]
    return " ".join(lines) or None


def _extract_highlights(text: str) -> tuple[str, ...]:
    match = re.search(r"^## Highlights\s*$", text, flags=re.MULTILINE)
    if not match:
        return ()
    tail = text[match.end() :]
    next_heading = re.search(r"^## ", tail, flags=re.MULTILINE)
    section = tail[: next_heading.start()] if next_heading else tail
    highlights: list[str] = []
    current: list[str] = []
    for line in section.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("- "):
            if current:
                highlights.append(" ".join(current))
            current = [stripped[2:].strip()]
        elif current:
            current.append(stripped)
    if current:
        highlights.append(" ".join(current))
    return tuple(highlights)


def _release_note_from_text(path: Path, text: str) -> RuntimeReleaseNote:
    title_match = re.search(r"^#\s+(v\d+\.\d+\.\d+)\s+—\s+(.+)$", text, re.MULTILINE)
    note_version = title_match.group(1) if title_match else path.stem
    title = title_match.group(2).strip() if title_match else path.stem
    return RuntimeReleaseNote(
        version=note_version,
        title=title,
        path=path,
        digest=_extract_frontmatter_digest(text),
        highlights=_extract_highlights(text),
    )


def read_release_note(
    version: str = "latest", start: Path | None = None
) -> RuntimeReleaseNote | None:
    notes_dir = _release_notes_dir(start)
    if not notes_dir.exists():
        return None
    candidates = sorted(
        notes_dir.glob("v*.md"),
        key=lambda path: _parse_semver(path.stem),
        reverse=True,
    )
    if version != "latest":
        wanted = version if version.startswith("v") else f"v{version}"
        candidates = [notes_dir / f"{wanted}.md"]
    for path in candidates:
        if not path.exists() or not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        return _release_note_from_text(path, text)
    return None


def read_release_note_from_ref(
    ref: str, version: str = "latest", start: Path | None = None
) -> RuntimeReleaseNote | None:
    start_path = (start or Path.cwd()).resolve()
    repository = _resolve_repo_root(start_path) or start_path
    if version == "latest":
        code, stdout, _stderr = _run_git(
            ["ls-tree", "-r", "--name-only", ref, "docs/releases"], cwd=repository
        )
        if code != 0 or not stdout:
            return None
        names = [
            line.strip()
            for line in stdout.splitlines()
            if re.search(r"docs/releases/v\d+\.\d+\.\d+\.md$", line.strip())
        ]
        if not names:
            return None
        selected = sorted(names, key=lambda name: _parse_semver(Path(name).stem), reverse=True)[0]
    else:
        wanted = version if version.startswith("v") else f"v{version}"
        selected = f"docs/releases/{wanted}.md"

    code, text, _stderr = _run_git(["show", f"{ref}:{selected}"], cwd=repository)
    if code != 0 or not text:
        return None
    return _release_note_from_text(Path(selected), text)


def _newer_release_note(
    note: RuntimeReleaseNote | None, current_version: str
) -> RuntimeReleaseNote | None:
    if note is None:
        return None
    if _parse_semver(note.version) <= _parse_semver(current_version):
        return None
    return note


def render_release_note(note: RuntimeReleaseNote | None) -> str:
    if note is None:
        return "Mirror runtime release notes\n\nRelease notes: not found\n"
    lines = ["Mirror runtime release notes", ""]
    lines.append(f"Release: {note.version} — {note.title}")
    lines.append(f"Path: {note.path}")
    if note.digest:
        lines.append("")
        lines.append("Summary:")
        lines.append(note.digest)
    if note.highlights:
        lines.append("")
        lines.append("Highlights:")
        for highlight in note.highlights:
            lines.append(f"- {highlight}")
    return "\n".join(lines) + "\n"


def _normalize_version(version: str) -> str:
    return version.strip()[1:] if version.strip().startswith("v") else version.strip()


def _target_release_path(repository: Path, target: str) -> Path:
    version = target if target.startswith("v") else f"v{target}"
    return repository / "docs" / "releases" / f"{version}.md"


def _git_ref_full_commit(repository: Path, ref: str) -> str | None:
    code, stdout, _stderr = _run_git(["rev-parse", ref], cwd=repository)
    if code != 0 or not stdout:
        return None
    return stdout.strip()


def _git_ref_contains(repository: Path, ancestor: str, descendant: str) -> bool | None:
    code, _stdout, _stderr = _run_git(
        ["merge-base", "--is-ancestor", ancestor, descendant], cwd=repository
    )
    if code == 0:
        return True
    if code == 1:
        return False
    return None


def _release_note_heading_matches(path: Path, target: str) -> bool:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return False
    wanted = target if target.startswith("v") else f"v{target}"
    return bool(re.search(rf"^#\s+{re.escape(wanted)}\s+—\s+.+$", text, re.MULTILINE))


def _release_index_links_target(repository: Path, target: str) -> bool:
    wanted = target if target.startswith("v") else f"v{target}"
    index_path = repository / "docs" / "releases" / "index.md"
    try:
        text = index_path.read_text(encoding="utf-8")
    except OSError:
        return False
    return f"{wanted}.md" in text


def build_release_doctor_report(
    *, target: str, start: Path | None = None, stable_ref: str = "origin/stable"
) -> ReleaseDoctorReport:
    start_path = (start or Path.cwd()).resolve()
    repository = _resolve_repo_root(start_path)
    checks: list[ReleaseDoctorCheck] = []
    normalized_target = _normalize_version(target)
    display_target = f"v{normalized_target}"

    if repository is None:
        return ReleaseDoctorReport(
            display_target,
            None,
            (ReleaseDoctorCheck("repository", "fail", "not a git repository"),),
        )

    checks.append(ReleaseDoctorCheck("repository", "pass", str(repository)))
    git = inspect_git(repository)
    if git.error:
        checks.append(ReleaseDoctorCheck("git status", "fail", git.error))
    elif git.dirty:
        checks.append(ReleaseDoctorCheck("git tree clean", "fail", "working tree is dirty"))
    else:
        checks.append(ReleaseDoctorCheck("git tree clean", "pass"))

    package = _version_from_pyproject(repository)
    if package == normalized_target:
        checks.append(ReleaseDoctorCheck("package version", "pass", package))
    else:
        detail = f"expected {normalized_target}, found {package or 'unknown'}"
        checks.append(ReleaseDoctorCheck("package version", "fail", detail))

    release_path = _target_release_path(repository, display_target)
    if release_path.exists():
        checks.append(ReleaseDoctorCheck("release note exists", "pass", str(release_path)))
        if _release_note_heading_matches(release_path, display_target):
            checks.append(ReleaseDoctorCheck("release note heading", "pass", display_target))
        else:
            checks.append(
                ReleaseDoctorCheck(
                    "release note heading", "fail", f"missing heading for {display_target}"
                )
            )
    else:
        checks.append(ReleaseDoctorCheck("release note exists", "fail", str(release_path)))
        checks.append(ReleaseDoctorCheck("release note heading", "fail", "release note missing"))

    if _release_index_links_target(repository, display_target):
        checks.append(ReleaseDoctorCheck("release index", "pass", f"links {display_target}"))
    else:
        checks.append(ReleaseDoctorCheck("release index", "fail", f"missing {display_target}.md"))

    head = _git_ref_full_commit(repository, "HEAD")
    tag_commit = _git_ref_full_commit(repository, display_target)
    if tag_commit is None:
        checks.append(
            ReleaseDoctorCheck("release tag", "warn", f"{display_target} not created yet")
        )
    elif head and tag_commit == head:
        checks.append(ReleaseDoctorCheck("release tag", "pass", f"{display_target} points to HEAD"))
    else:
        checks.append(
            ReleaseDoctorCheck(
                "release tag", "fail", f"{display_target} points to {tag_commit[:7]}"
            )
        )

    stable_commit = _git_ref_full_commit(repository, stable_ref)
    if stable_commit is None:
        checks.append(
            ReleaseDoctorCheck("stable ref", "warn", f"{stable_ref} not available locally")
        )
    elif head is None:
        checks.append(ReleaseDoctorCheck("stable ref", "fail", "HEAD unavailable"))
    elif stable_commit == head:
        checks.append(ReleaseDoctorCheck("stable ref", "pass", f"{stable_ref} is at HEAD"))
    else:
        stable_contains_head = _git_ref_contains(repository, head, stable_ref)
        head_contains_stable = _git_ref_contains(repository, stable_ref, "HEAD")
        if stable_contains_head is True:
            checks.append(ReleaseDoctorCheck("stable ref", "pass", f"{stable_ref} contains HEAD"))
        elif head_contains_stable is True:
            checks.append(ReleaseDoctorCheck("stable ref", "warn", f"{stable_ref} is behind HEAD"))
        elif stable_contains_head is False and head_contains_stable is False:
            checks.append(
                ReleaseDoctorCheck("stable ref", "fail", f"{stable_ref} diverged from HEAD")
            )
        else:
            checks.append(ReleaseDoctorCheck("stable ref", "fail", f"cannot compare {stable_ref}"))

    return ReleaseDoctorReport(display_target, repository, tuple(checks))


def render_release_doctor(report: ReleaseDoctorReport) -> str:
    lines = ["Mirror runtime release doctor", ""]
    lines.append(f"Target: {report.target}")
    lines.append(f"Repository: {report.repository if report.repository else 'unknown'}")
    lines.append("")
    marks = {"pass": "✓", "warn": "!", "fail": "✗"}
    for check in report.checks:
        mark = marks.get(check.state, "?")
        line = f"[{mark}] {check.name}"
        if check.detail:
            line = f"{line}: {check.detail}"
        lines.append(line)
    lines.append("")
    lines.append(
        f"Release doctor result: {'failed' if report.has_failures else 'ready with warnings' if any(check.state == 'warn' for check in report.checks) else 'ready'}"
    )
    lines.append(
        "Note: release doctor is read-only; it does not tag, merge, push, fetch, or edit files."
    )
    return "\n".join(lines) + "\n"


def _version_from_pyproject(start: Path) -> str | None:
    for parent in (start.resolve(), *start.resolve().parents):
        pyproject = parent / "pyproject.toml"
        if not pyproject.exists():
            continue
        for line in pyproject.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("version ="):
                return line.partition("=")[2].strip().strip('"')
    return None


def _run_git(args: list[str], *, cwd: Path) -> tuple[int, str, str]:
    try:
        completed = subprocess.run(
            ["git", *args],
            cwd=cwd,
            text=True,
            capture_output=True,
            timeout=2,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return 1, "", str(exc)
    return completed.returncode, completed.stdout.strip(), completed.stderr.strip()


def _parse_porcelain_line(line: str) -> GitWorktreeEntry | None:
    if not line:
        return None
    status = line[:2]
    path = line[2:].strip()
    if " -> " in path:
        path = path.split(" -> ", 1)[1]
    return GitWorktreeEntry(status=status, path=path)


def inspect_git_worktree(repository: Path | None) -> tuple[GitWorktreeEntry, ...]:
    if repository is None:
        return ()
    code, stdout, _stderr = _run_git(["status", "--porcelain"], cwd=repository)
    if code != 0 or not stdout:
        return ()
    entries = [_parse_porcelain_line(line) for line in stdout.splitlines()]
    return tuple(entry for entry in entries if entry is not None)


def inspect_git(start: Path) -> GitStatus:
    code, stdout, stderr = _run_git(["rev-parse", "--show-toplevel"], cwd=start)
    if code != 0 or not stdout:
        return GitStatus(
            repository=None,
            branch=None,
            commit=None,
            dirty=None,
            error=stderr or "not a git repository",
        )

    repository = Path(stdout).resolve()
    branch_code, branch, branch_err = _run_git(["branch", "--show-current"], cwd=repository)
    commit_code, commit, commit_err = _run_git(["rev-parse", "--short", "HEAD"], cwd=repository)
    dirty_code, dirty_out, dirty_err = _run_git(["status", "--porcelain"], cwd=repository)

    errors = [
        err
        for code, err in (
            (branch_code, branch_err),
            (commit_code, commit_err),
            (dirty_code, dirty_err),
        )
        if code != 0 and err
    ]

    return GitStatus(
        repository=repository,
        branch=branch if branch_code == 0 and branch else None,
        commit=commit if commit_code == 0 and commit else None,
        dirty=bool(dirty_out) if dirty_code == 0 else None,
        error="; ".join(errors) if errors else None,
    )


def list_installed_extensions(mirror_home: Path | None) -> tuple[str, ...]:
    if mirror_home is None:
        return ()
    extensions_dir = default_extensions_dir_for_home(mirror_home)
    if not extensions_dir.exists() or not extensions_dir.is_dir():
        return ()
    return tuple(
        sorted(
            child.name
            for child in extensions_dir.iterdir()
            if child.is_dir() and (child / "skill.yaml").exists()
        )
    )


def _connect_read_only(db_path: Path) -> sqlite3.Connection:
    uri = f"{db_path.resolve().as_uri()}?mode=ro"
    return sqlite3.connect(uri, uri=True)


def _table_exists(conn: sqlite3.Connection, table: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", (table,)
    ).fetchone()
    return row is not None


def inspect_core_migrations(db_path: Path | None, db_exists: bool | None) -> CoreMigrationHealth:
    known_ids = tuple(migration_id for migration_id, _ in MIGRATIONS)
    if db_path is None:
        return CoreMigrationHealth(False, None, len(known_ids), (), note="database path unknown")
    if db_exists is not True:
        return CoreMigrationHealth(False, None, len(known_ids), (), note="database missing")
    try:
        with _connect_read_only(db_path) as conn:
            if not _table_exists(conn, "_migrations"):
                return CoreMigrationHealth(
                    False, 0, len(known_ids), known_ids, note="migration ledger missing"
                )
            rows = conn.execute("SELECT id FROM _migrations").fetchall()
    except sqlite3.Error as exc:
        return CoreMigrationHealth(False, None, len(known_ids), known_ids, note=str(exc))

    known_set = set(known_ids)
    applied = {row[0] for row in rows}
    missing = tuple(migration_id for migration_id in known_ids if migration_id not in applied)
    unknown = tuple(
        sorted(migration_id for migration_id in applied if migration_id not in known_set)
    )
    return CoreMigrationHealth(
        ready=not missing and not unknown,
        applied_count=len(applied.intersection(known_ids)),
        known_count=len(known_ids),
        missing=missing,
        unknown=unknown,
    )


def inspect_extension_health(
    mirror_home: Path | None, db_path: Path | None, db_exists: bool | None
) -> tuple[ExtensionHealth, ...]:
    if mirror_home is None:
        return ()
    extensions_dir = default_extensions_dir_for_home(mirror_home)
    if not extensions_dir.exists() or not extensions_dir.is_dir():
        return ()

    results: list[ExtensionHealth] = []
    conn: sqlite3.Connection | None = None
    if db_path is not None and db_exists is True:
        try:
            conn = _connect_read_only(db_path)
        except sqlite3.Error:
            conn = None

    try:
        for child in sorted(extensions_dir.iterdir()):
            if not child.is_dir() or not (child / "skill.yaml").exists():
                continue
            extension_id = child.name
            try:
                manifest = load_extension_manifest(child)
                extension_id = manifest["id"]
            except ExtensionValidationError as exc:
                results.append(ExtensionHealth(extension_id, False, str(exc)))
                continue

            if manifest["kind"] != "command-skill":
                results.append(ExtensionHealth(extension_id, True))
                continue

            if conn is None:
                results.append(ExtensionHealth(extension_id, False, "database unavailable"))
                continue
            try:
                has_ext_migration_table = _table_exists(conn, "_ext_migrations")
            except sqlite3.Error as exc:
                results.append(ExtensionHealth(extension_id, False, f"database unavailable: {exc}"))
                continue
            if not has_ext_migration_table:
                migrations_dir = child / "migrations"
                has_migrations = migrations_dir.exists() and any(migrations_dir.glob("*.sql"))
                results.append(
                    ExtensionHealth(
                        extension_id,
                        not has_migrations,
                        "extension migration ledger missing" if has_migrations else None,
                    )
                )
                continue

            try:
                migrations_dir = child / "migrations"
                pending, drifted = inspect_migration_files(
                    conn, extension_id=extension_id, migrations_dir=migrations_dir
                )
                known_files = {path.name for path in migrations_dir.glob("*.sql") if path.is_file()}
                rows = conn.execute(
                    "SELECT filename FROM _ext_migrations WHERE extension_id = ?",
                    (extension_id,),
                ).fetchall()
                unknown = tuple(
                    sorted(str(row[0]) for row in rows if str(row[0]) not in known_files)
                )
            except (ExtensionMigrationError, sqlite3.Error) as exc:
                results.append(ExtensionHealth(extension_id, False, str(exc)))
                continue
            note = None
            if pending:
                note = "pending migrations"
            if drifted:
                note = "migration checksum drift" if note is None else f"{note}; checksum drift"
            if unknown:
                note = "unknown applied migrations" if note is None else f"{note}; unknown applied"
            results.append(
                ExtensionHealth(
                    extension_id,
                    not pending and not drifted and not unknown,
                    note,
                    pending_migrations=pending,
                    drifted_migrations=drifted,
                    unknown_migrations=unknown,
                )
            )
    finally:
        if conn is not None:
            conn.close()

    return tuple(results)


def build_runtime_status(
    *,
    start: Path | None = None,
    mirror_home_arg: str | Path | None = None,
    channel: str | None = None,
) -> RuntimeStatusReport:
    start_path = (start or Path.cwd()).expanduser().resolve()
    git = inspect_git(start_path)

    mirror_home: Path | None = None
    mirror_home_error: str | None = None
    try:
        mirror_home = resolve_mirror_home(mirror_home=mirror_home_arg)
    except ValueError as exc:
        mirror_home_error = str(exc)

    db_path = default_db_path_for_home(mirror_home) if mirror_home else None
    db_exists = db_path.exists() if db_path else None

    return RuntimeStatusReport(
        version=package_version(),
        git=git,
        mirror_home=mirror_home,
        mirror_home_error=mirror_home_error,
        db_path=db_path,
        db_exists=db_exists,
        core_migrations=inspect_core_migrations(db_path, db_exists),
        extensions=list_installed_extensions(mirror_home),
        extension_health=inspect_extension_health(mirror_home, db_path, db_exists),
        clone_role=inspect_clone_role(start_path),
        python_version=sys.version.split()[0],
        memory_env=MEMORY_ENV,
        update_channel=inspect_update_channel(start_path, override=channel),
    )


def verify_backup_archive(backup_path: Path) -> BackupVerification:
    if not backup_path.exists():
        return BackupVerification(backup_path, False, (), "backup file not found")
    try:
        with zipfile.ZipFile(backup_path) as zf:
            entries = tuple(sorted(zf.namelist()))
    except zipfile.BadZipFile:
        return BackupVerification(backup_path, False, (), "backup file is not a readable zip")

    for entry in entries:
        entry_path = Path(entry)
        if entry_path.is_absolute() or ".." in entry_path.parts:
            return BackupVerification(backup_path, False, entries, f"unsafe archive entry: {entry}")
    if "memory.db" not in entries:
        return BackupVerification(backup_path, False, entries, "memory.db missing from backup")
    allowed = {"memory.db", "memory.db-wal", "memory.db-shm"}
    unexpected = tuple(entry for entry in entries if entry not in allowed)
    if unexpected:
        return BackupVerification(
            backup_path, False, entries, f"unexpected archive entries: {', '.join(unexpected)}"
        )
    return BackupVerification(backup_path, True, entries)


def render_backup_verification(verification: BackupVerification) -> str:
    lines: list[str] = []
    lines.append("Mirror runtime backup verification")
    lines.append("")
    lines.append(f"Backup: {verification.backup_path}")
    if verification.entries:
        lines.append(f"Entries: {', '.join(verification.entries)}")
    if verification.note:
        lines.append(f"Verification note: {verification.note}")
    lines.append(f"Verification result: {'valid' if verification.valid else 'invalid'}")
    return "\n".join(lines) + "\n"


def render_runtime_backup_created(
    *, backup_path: Path, mirror_home: Path, verification: BackupVerification
) -> str:
    lines: list[str] = []
    lines.append("Mirror runtime backup")
    lines.append("")
    lines.append(f"Mirror home: {mirror_home}")
    lines.append(f"Backup: {backup_path}")
    lines.append(f"Verification result: {'valid' if verification.valid else 'invalid'}")
    if verification.entries:
        lines.append(f"Entries: {', '.join(verification.entries)}")
    if verification.note:
        lines.append(f"Verification note: {verification.note}")
    lines.append("")
    lines.append("Manual recovery route:")
    lines.append("  1. Stop active runtime sessions that could write to the database.")
    lines.append("  2. Move current memory.db, memory.db-wal, and memory.db-shm aside.")
    lines.append("  3. Extract memory.db and sidecars from this backup into the Mirror home.")
    lines.append("  4. Run runtime status against the Mirror home.")
    lines.append("  5. Do not retry update execution until status is ready.")
    lines.append("")
    lines.append("Recovery is manual in this version; no files were restored.")
    return "\n".join(lines) + "\n"


def build_runtime_version_report(
    start: Path | None = None, channel: str | None = None
) -> RuntimeVersionReport:
    start_path = (start or Path.cwd()).resolve()
    return RuntimeVersionReport(
        version=package_version(),
        git=inspect_git(start_path),
        clone_role=inspect_clone_role(start_path),
        update_channel=inspect_update_channel(start_path, override=channel),
    )


def render_runtime_version(report: RuntimeVersionReport) -> str:
    lines: list[str] = ["Mirror runtime version", ""]
    lines.append(f"Version: {report.version}")
    lines.append(f"Repository: {report.git.repository if report.git.repository else 'unknown'}")
    lines.append(f"Git branch: {report.git.branch or 'unknown'}")
    lines.append(f"Git commit: {report.git.commit or 'unknown'}")
    if report.git.error:
        lines.append(f"Git status note: {report.git.error}")
    lines.append(f"Clone role: {report.clone_role.value}")
    if report.clone_role.note:
        lines.append(f"Clone role note: {report.clone_role.note}")
    lines.append(f"Update channel: {report.update_channel.value}")
    if report.update_channel.note:
        lines.append(f"Update channel note: {report.update_channel.note}")
    return "\n".join(lines) + "\n"


def _split_upstream(upstream: str) -> tuple[str, str] | None:
    if "/" not in upstream:
        return None
    remote, branch = upstream.split("/", 1)
    if not remote or not branch:
        return None
    return remote, branch


def check_runtime_update_availability(
    start: Path | None = None, channel: str | None = None
) -> RuntimeUpdateAvailability:
    start_path = (start or Path.cwd()).resolve()
    git = inspect_git(start_path)
    version = package_version()
    update_channel = inspect_update_channel(start_path, override=channel)
    if git.repository is None:
        return RuntimeUpdateAvailability(
            version,
            None,
            None,
            None,
            "unknown",
            "repository unavailable",
            update_channel=update_channel,
        )

    git_plan = _inspect_update_plan(git, update_channel)
    if git_plan.upstream is None:
        return RuntimeUpdateAvailability(
            version, None, git.commit, None, "no_upstream", git_plan.note, update_channel
        )
    if git_plan.ahead and git_plan.behind:
        return RuntimeUpdateAvailability(
            version, git_plan.upstream, git.commit, None, "diverged", git_plan.note, update_channel
        )
    if git_plan.ahead and not git_plan.behind:
        return RuntimeUpdateAvailability(
            version,
            git_plan.upstream,
            git.commit,
            None,
            "local_ahead",
            git_plan.note,
            update_channel,
        )

    split = _split_upstream(git_plan.upstream)
    if split is None:
        return RuntimeUpdateAvailability(
            version,
            git_plan.upstream,
            git.commit,
            None,
            "unknown",
            "unexpected upstream name",
            update_channel,
        )
    remote, branch = split
    code, remote_url, remote_err = _run_git(
        ["config", "--get", f"remote.{remote}.url"], cwd=git.repository
    )
    if code != 0 or not remote_url:
        return RuntimeUpdateAvailability(
            version,
            git_plan.upstream,
            git.commit,
            None,
            "unknown",
            remote_err or f"remote {remote} has no url",
            update_channel,
        )
    code, output, ls_err = _run_git(
        ["ls-remote", remote, f"refs/heads/{branch}"], cwd=git.repository
    )
    if code != 0 or not output:
        return RuntimeUpdateAvailability(
            version,
            git_plan.upstream,
            git.commit,
            None,
            "unknown",
            ls_err or "remote query failed",
            update_channel,
        )
    parts = output.split()
    if len(parts) < 2:
        return RuntimeUpdateAvailability(
            version,
            git_plan.upstream,
            git.commit,
            None,
            "unknown",
            f"unexpected ls-remote output: {output}",
            update_channel,
        )
    remote_commit = parts[0]
    local_full_code, local_full, _err = _run_git(["rev-parse", "HEAD"], cwd=git.repository)
    local_commit = local_full if local_full_code == 0 and local_full else git.commit
    status = "up_to_date" if remote_commit.startswith(local_commit or "") else "update_available"
    if local_commit and len(local_commit) < len(remote_commit):
        status = "up_to_date" if remote_commit.startswith(local_commit) else "update_available"
    elif local_commit:
        status = "up_to_date" if remote_commit == local_commit else "update_available"
    return RuntimeUpdateAvailability(
        version,
        git_plan.upstream,
        local_commit,
        remote_commit,
        status,
        update_channel=update_channel,
    )


def render_runtime_update_availability(report: RuntimeUpdateAvailability) -> str:
    lines: list[str] = ["Mirror runtime update check", ""]
    lines.append(f"Version: {report.version}")
    lines.append(f"Update channel: {report.update_channel.value}")
    if report.update_channel.note:
        lines.append(f"Update channel note: {report.update_channel.note}")
    lines.append(f"Current: {report.local_commit[:7] if report.local_commit else 'unknown'}")
    if report.upstream:
        remote = report.remote_commit[:7] if report.remote_commit else "unknown"
        lines.append(f"Upstream: {report.upstream} @ {remote}")
    else:
        lines.append("Upstream: none")
    lines.append(f"Availability: {report.status}")
    if report.note:
        lines.append(f"Reason: {report.note}")
    if report.status == "update_available":
        lines.append("")
        if report.target_release:
            lines.append(
                f"Release available: {report.target_release.version} — {report.target_release.title}"
            )
            if report.target_release.digest:
                lines.append(f"Summary: {report.target_release.digest}")
        elif report.update_channel.value == "stable":
            lines.append(
                "Release details: not fetched by this check; dry-run can show them when local refs contain release notes."
            )
        lines.append("Preview:")
        lines.append("uv run python -m memory runtime update --dry-run")
        lines.append("")
        lines.append("Update:")
        lines.append("uv run python -m memory runtime update")
    elif report.status == "up_to_date":
        lines.append("")
        lines.append("Next: no update needed")
    return "\n".join(lines) + "\n"


def inspect_git_update_plan(
    git: GitStatus, update_channel: UpdateChannel | None = None
) -> GitUpdatePlan:
    if git.repository is None:
        return GitUpdatePlan(None, None, None, False, "blocked", "repository unavailable")
    if update_channel is None:
        code, upstream, stderr = _run_git(
            ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], cwd=git.repository
        )
        if code != 0 or not upstream:
            return GitUpdatePlan(
                None, None, None, False, "blocked", stderr or "no upstream configured"
            )
    else:
        upstream = update_channel.upstream
        code, _stdout, stderr = _run_git(["rev-parse", "--verify", upstream], cwd=git.repository)
        if code != 0:
            return GitUpdatePlan(
                upstream,
                None,
                None,
                False,
                "blocked",
                stderr or f"update channel {update_channel.value} is not fetched",
            )

    count_code, counts, count_err = _run_git(
        ["rev-list", "--left-right", "--count", f"HEAD...{upstream}"], cwd=git.repository
    )
    if count_code != 0 or not counts:
        return GitUpdatePlan(
            upstream, None, None, False, "blocked", count_err or "cannot compare upstream"
        )
    try:
        ahead_text, behind_text = counts.split()
        ahead = int(ahead_text)
        behind = int(behind_text)
    except ValueError:
        return GitUpdatePlan(
            upstream, None, None, False, "blocked", f"unexpected git count: {counts}"
        )

    if ahead == 0 and behind == 0:
        return GitUpdatePlan(upstream, ahead, behind, True, "none", "already up to date")
    if ahead == 0 and behind > 0:
        return GitUpdatePlan(
            upstream, ahead, behind, True, "pull", f"pull {behind} remote commit(s)"
        )
    if ahead > 0 and behind == 0:
        return GitUpdatePlan(upstream, ahead, behind, False, "blocked", "local commits present")
    return GitUpdatePlan(upstream, ahead, behind, False, "blocked", "branch diverged")


def _build_status_for_channel(
    *,
    start: Path | None = None,
    mirror_home_arg: str | Path | None = None,
    channel: str | None = None,
) -> RuntimeStatusReport:
    if start is None and channel is None:
        return build_runtime_status(mirror_home_arg=mirror_home_arg)
    if start is None:
        return build_runtime_status(mirror_home_arg=mirror_home_arg, channel=channel)
    if channel is None:
        return build_runtime_status(start=start, mirror_home_arg=mirror_home_arg)
    return build_runtime_status(start=start, mirror_home_arg=mirror_home_arg, channel=channel)


def _inspect_update_plan(git: GitStatus, update_channel: UpdateChannel | None) -> GitUpdatePlan:
    try:
        return inspect_git_update_plan(git, update_channel)
    except TypeError:
        return inspect_git_update_plan(git)


def build_runtime_update_dry_run(
    *,
    start: Path | None = None,
    mirror_home_arg: str | Path | None = None,
    channel: str | None = None,
) -> RuntimeUpdateDryRun:
    status_report = _build_status_for_channel(
        start=start, mirror_home_arg=mirror_home_arg, channel=channel
    )
    git_plan = (
        _inspect_update_plan(status_report.git, status_report.update_channel)
        if status_report.status == "ready"
        else None
    )
    target_release = None
    if (
        git_plan is not None
        and git_plan.action == "pull"
        and git_plan.upstream
        and status_report.git.repository
        and status_report.update_channel.value == "stable"
    ):
        target_release = _newer_release_note(
            read_release_note_from_ref(git_plan.upstream, start=status_report.git.repository),
            status_report.version,
        )
    return RuntimeUpdateDryRun(
        status_report=status_report, git_plan=git_plan, target_release=target_release
    )


def _yes_no(value: bool | None) -> str:
    if value is None:
        return "unknown"
    return "yes" if value else "no"


def _render_core_migrations(health: CoreMigrationHealth) -> str:
    if health.ready:
        return f"Core migrations: current ({health.applied_count}/{health.known_count})"
    count = "unknown" if health.applied_count is None else str(health.applied_count)
    detail = f"{count}/{health.known_count} applied"
    if health.missing:
        detail = f"{detail}; missing {', '.join(health.missing)}"
    if health.unknown:
        detail = f"{detail}; unknown {', '.join(health.unknown)}"
    if health.note:
        detail = f"{detail}; {health.note}"
    return f"Core migrations: attention needed ({detail})"


def _render_extension_health(items: tuple[ExtensionHealth, ...]) -> list[str]:
    if not items:
        return ["Extension health: ready (0 checked)"]
    issue_count = sum(1 for item in items if not item.ready)
    if issue_count == 0:
        return [f"Extension health: ready ({len(items)} checked)"]

    lines = [f"Extension health: attention needed ({len(items)} checked, {issue_count} issue(s))"]
    for item in items:
        if item.ready:
            continue
        details: list[str] = []
        if item.note:
            details.append(item.note)
        if item.pending_migrations:
            details.append(f"pending {', '.join(item.pending_migrations)}")
        if item.drifted_migrations:
            details.append(f"drifted {', '.join(item.drifted_migrations)}")
        if item.unknown_migrations:
            details.append(f"unknown {', '.join(item.unknown_migrations)}")
        lines.append(
            f"  - {item.extension_id}: {'; '.join(details) if details else 'attention needed'}"
        )
    return lines


def _runtime_status_blockers(report: RuntimeStatusReport) -> list[str]:
    blockers: list[str] = []
    if report.mirror_home_error:
        blockers.append("mirror home is not configured")
    if report.git.error:
        blockers.append(f"git status error: {report.git.error}")
    if report.git.dirty:
        blockers.append("git tree is dirty")
    if report.db_exists is False:
        blockers.append("database is missing")
    if not report.core_migrations.ready:
        blockers.append("core migrations are not current")
    for health in report.extension_health:
        if not health.ready:
            blockers.append(f"extension {health.extension_id} needs attention")
    return blockers


def _git_dirty_finding(entry: GitWorktreeEntry) -> DriftFinding:
    is_session_html = entry.path.startswith("pi-session-") and entry.path.endswith(".html")
    if entry.status == "??" and is_session_html:
        recommendation = "archive or ignore generated session HTML before update planning"
        repair_route = "manual review"
    elif entry.status == "??":
        recommendation = "review untracked file before update planning"
        repair_route = "manual review"
    else:
        recommendation = "commit, stash, or discard intentional work before update planning"
        repair_route = "commit or manual review"
    return DriftFinding(
        code="git_dirty",
        severity="attention",
        subject="repository",
        detail=f"{entry.status} {entry.path}",
        recommendation=recommendation,
        repair_route=repair_route,
    )


def diagnose_runtime(
    report: RuntimeStatusReport,
    worktree_entries: tuple[GitWorktreeEntry, ...] = (),
) -> tuple[DriftFinding, ...]:
    findings: list[DriftFinding] = []
    if report.mirror_home_error:
        findings.append(
            DriftFinding(
                "mirror_home_missing",
                "blocker",
                "mirror home",
                report.mirror_home_error,
                "configure MIRROR_HOME or MIRROR_USER before update planning",
                "configuration",
            )
        )
    if report.db_exists is False:
        findings.append(
            DriftFinding(
                "database_missing",
                "blocker",
                "database",
                str(report.db_path) if report.db_path else "unknown",
                "restore or initialize the memory database before update planning",
                "restore or initialize",
            )
        )

    findings.extend(_git_dirty_finding(entry) for entry in worktree_entries)

    for migration_id in report.core_migrations.missing:
        findings.append(
            DriftFinding(
                "core_migration_pending",
                "blocker",
                "database _migrations",
                migration_id,
                "run pending core migrations only after backup",
                "backup then migrate",
            )
        )
    for migration_id in report.core_migrations.unknown:
        findings.append(
            DriftFinding(
                "core_migration_unknown",
                "attention",
                "database _migrations",
                migration_id,
                "classify as legacy core row, extension-owned row, or experimental drift",
                "manual review",
            )
        )
    if report.core_migrations.note:
        findings.append(
            DriftFinding(
                "core_migration_unreadable",
                "blocker",
                "database _migrations",
                report.core_migrations.note,
                "restore readable migration tracking before update planning",
                "database repair",
            )
        )

    for extension in report.extension_health:
        if extension.note and "missing required field" in extension.note:
            findings.append(
                DriftFinding(
                    "extension_manifest_invalid",
                    "blocker",
                    f"extension/{extension.extension_id}",
                    extension.note,
                    "repair or reinstall the extension manifest before update planning",
                    "extension repair",
                )
            )
        for filename in extension.pending_migrations:
            findings.append(
                DriftFinding(
                    "extension_migration_pending",
                    "blocker",
                    f"extension/{extension.extension_id}",
                    filename,
                    "run pending extension migrations only after backup",
                    "backup then extension migrate",
                )
            )
        for filename in extension.drifted_migrations:
            findings.append(
                DriftFinding(
                    "extension_migration_checksum_drift",
                    "blocker",
                    f"extension/{extension.extension_id}",
                    filename,
                    "restore the original migration file or create a new migration",
                    "extension repair",
                )
            )
        for filename in extension.unknown_migrations:
            findings.append(
                DriftFinding(
                    "extension_migration_unknown",
                    "attention",
                    f"extension/{extension.extension_id}",
                    filename,
                    "compare installed extension with canonical source and classify history",
                    "manual review or reinstall",
                )
            )
    return tuple(findings)


def render_runtime_diagnosis(findings: tuple[DriftFinding, ...]) -> str:
    lines: list[str] = ["Mirror runtime drift diagnosis", ""]
    if not findings:
        lines.append("Findings: 0")
        lines.append("")
        lines.append("Status: ready")
        return "\n".join(lines) + "\n"

    lines.append(f"Findings: {len(findings)} attention needed")
    for finding in findings:
        lines.append("")
        lines.append(f"[{finding.severity}] {finding.code}: {finding.detail}")
        lines.append(f"Subject: {finding.subject}")
        lines.append(f"Recommendation: {finding.recommendation}")
        lines.append(f"Repair route: {finding.repair_route}")
    lines.append("")
    lines.append("Status: attention needed")
    return "\n".join(lines) + "\n"


def render_runtime_update_dry_run(dry_run: RuntimeUpdateDryRun) -> str:
    report = dry_run.status_report
    lines: list[str] = []
    lines.append("Mirror runtime update dry-run")
    lines.append("")
    lines.append(f"Current status: {report.status}")
    lines.append(f"Repository: {report.git.repository if report.git.repository else 'unknown'}")
    lines.append(f"Git branch: {report.git.branch or 'unknown'}")

    blockers = _runtime_status_blockers(report)
    if blockers:
        lines.append("Blocked:")
        for blocker in blockers:
            lines.append(f"  - {blocker}")
        lines.append("")
        lines.append("Dry-run result: blocked")
        return "\n".join(lines) + "\n"

    git_plan = dry_run.git_plan
    if git_plan is None:
        lines.append("Blocked:")
        lines.append("  - git update plan unavailable")
        lines.append("")
        lines.append("Dry-run result: blocked")
        return "\n".join(lines) + "\n"

    lines.append(f"Upstream: {git_plan.upstream or 'not configured'}")
    if git_plan.ahead is not None and git_plan.behind is not None:
        lines.append(f"Git relation: ahead {git_plan.ahead}, behind {git_plan.behind}")

    if not git_plan.ready:
        lines.append("Blocked:")
        lines.append(f"  - {git_plan.note or 'git update is not safe to plan'}")
        lines.append("")
        lines.append("Dry-run result: blocked")
        return "\n".join(lines) + "\n"

    lines.append(f"Update plan: {git_plan.note or git_plan.action}")
    if dry_run.target_release:
        lines.append("")
        lines.append(
            f"Release available: {dry_run.target_release.version} — {dry_run.target_release.title}"
        )
        if dry_run.target_release.digest:
            lines.append(f"Summary: {dry_run.target_release.digest}")
        lines.append("")
        lines.append("Preview:")
        lines.append("uv run python -m memory runtime update --dry-run")
        lines.append("")
        lines.append("Update:")
        lines.append("uv run python -m memory runtime update")
    elif report.update_channel.value == "stable" and git_plan.action == "pull":
        lines.append("")
        lines.append("Release details: unavailable in local refs; commit summary will be used.")
    if report.mirror_home:
        lines.append(f"Backup: required before real update ({report.mirror_home / 'backups'})")
    else:
        lines.append("Backup: required before real update")
    lines.append("Validation after update:")
    lines.append('  - uv run pytest tests/unit/ tests/integration/ -m "not live"')
    lines.append("  - uv run ruff check src/ tests/")
    lines.append("  - uv run ruff format --check src/ tests/")
    lines.append("Note: dry-run does not fetch, pull, back up, migrate, or modify files.")
    lines.append("")
    lines.append("Dry-run result: ready")
    return "\n".join(lines) + "\n"


def render_runtime_status(report: RuntimeStatusReport) -> str:
    lines: list[str] = []
    lines.append("Mirror runtime status")
    lines.append("")
    lines.append(f"Version: {report.version}")
    lines.append(f"Repository: {report.git.repository if report.git.repository else 'unknown'}")
    lines.append(f"Git branch: {report.git.branch or 'unknown'}")
    lines.append(f"Git commit: {report.git.commit or 'unknown'}")
    lines.append(f"Git dirty: {_yes_no(report.git.dirty)}")
    if report.git.error:
        lines.append(f"Git status note: {report.git.error}")
    lines.append(f"Mirror home: {report.mirror_home if report.mirror_home else 'not configured'}")
    if report.mirror_home_error:
        lines.append(f"Mirror home note: {report.mirror_home_error}")
    lines.append(f"Database: {report.db_path if report.db_path else 'unknown'}")
    lines.append(f"Database exists: {_yes_no(report.db_exists)}")
    lines.append(_render_core_migrations(report.core_migrations))
    if report.extensions:
        lines.append(
            f"Installed extensions: {len(report.extensions)} ({', '.join(report.extensions)})"
        )
    else:
        lines.append("Installed extensions: 0")
    lines.extend(_render_extension_health(report.extension_health))
    lines.append(f"Clone role: {report.clone_role.value}")
    if report.clone_role.note:
        lines.append(f"Clone role note: {report.clone_role.note}")
    lines.append(f"Update channel: {report.update_channel.value}")
    if report.update_channel.note:
        lines.append(f"Update channel note: {report.update_channel.note}")
    lines.append(f"Python: {report.python_version}")
    lines.append(f"MEMORY_ENV: {report.memory_env}")
    lines.append("")
    lines.append(f"Status: {report.status}")
    return "\n".join(lines) + "\n"


def _git_fetch(remote: str, branch: str, cwd: Path) -> tuple[bool, str]:
    code, _stdout, stderr = _run_git(["fetch", remote, branch], cwd=cwd)
    if code != 0:
        return False, stderr or "git fetch failed"
    return True, ""


def _git_fast_forward(upstream: str, cwd: Path) -> tuple[bool, str]:
    code, _stdout, stderr = _run_git(["merge", "--ff-only", upstream], cwd=cwd)
    if code != 0:
        return False, stderr or "git merge --ff-only refused"
    return True, ""


def _git_create_tag(tag: str, cwd: Path) -> tuple[bool, str]:
    code, _stdout, stderr = _run_git(["tag", tag, "HEAD"], cwd=cwd)
    if code != 0:
        return False, stderr or f"git tag {tag} HEAD failed"
    return True, ""


def _git_move_branch(branch: str, cwd: Path) -> tuple[bool, str]:
    code, _stdout, stderr = _run_git(["branch", "--force", branch, "HEAD"], cwd=cwd)
    if code != 0:
        return False, stderr or f"git branch --force {branch} HEAD failed"
    return True, ""


def _git_push_ref(remote: str, ref: str, cwd: Path) -> tuple[bool, str]:
    code, _stdout, stderr = _run_git(["push", remote, ref], cwd=cwd)
    if code != 0:
        return False, stderr or f"git push {remote} {ref} failed"
    return True, ""


def _git_installed_changes(
    repository: Path, previous_commit: str | None, new_commit: str | None, *, limit: int = 8
) -> tuple[str, ...]:
    if not previous_commit or not new_commit or previous_commit == new_commit:
        return ()
    code, stdout, _stderr = _run_git(
        [
            "log",
            "--oneline",
            "--no-decorate",
            "--reverse",
            f"-{limit}",
            f"{previous_commit}..{new_commit}",
        ],
        cwd=repository,
    )
    if code != 0 or not stdout:
        return ()
    return tuple(line.strip() for line in stdout.splitlines() if line.strip())


def _apply_migrations(mirror_home_arg: str | Path | None) -> tuple[bool, str]:
    try:
        from memory.client import MemoryClient

        mirror_home = (
            Path(mirror_home_arg).expanduser() if mirror_home_arg else resolve_mirror_home()
        )
        client = MemoryClient(env="production", db_path=default_db_path_for_home(mirror_home))
        client.close()
    except Exception as exc:
        return False, str(exc)
    return True, ""


def _try_runtime_backup(
    mirror_home_arg: str | Path | None,
) -> tuple[RuntimeUpdateStage, RuntimeUpdateStage | None, Path | None, tuple[str, ...]]:
    try:
        mirror_home = (
            Path(mirror_home_arg).expanduser() if mirror_home_arg else resolve_mirror_home()
        )
    except ValueError:
        return (
            RuntimeUpdateStage("backup", "skip", "mirror home not configured"),
            None,
            None,
            (),
        )

    db_path = default_db_path_for_home(mirror_home)
    if not db_path.exists():
        return RuntimeUpdateStage("backup", "skip", "database not found"), None, None, ()

    try:
        backup_path = create_backup(silent=True, mirror_home=mirror_home)
    except Exception as exc:
        return (
            RuntimeUpdateStage("backup", "fail", str(exc)),
            None,
            None,
            (f"Backup directory must be writable: {mirror_home / 'backups'}",),
        )
    if backup_path is None:
        return (
            RuntimeUpdateStage("backup", "fail", "database not found"),
            None,
            None,
            (f"Expected database at: {db_path}",),
        )

    verification = verify_backup_archive(backup_path)
    if not verification.valid:
        return (
            RuntimeUpdateStage("backup", "pass", str(backup_path)),
            RuntimeUpdateStage("verify backup", "fail", verification.note or "invalid backup"),
            backup_path,
            (f"Backup created but failed verification: {backup_path}",),
        )
    return (
        RuntimeUpdateStage("backup", "pass", str(backup_path)),
        RuntimeUpdateStage("verify backup", "pass"),
        backup_path,
        (),
    )


def run_runtime_update_repair(
    *,
    reason: str | None = None,
    mirror_home_arg: str | Path | None = None,
    fetch: bool = True,
    channel: str | None = None,
) -> RuntimeUpdateResult:
    stages: list[RuntimeUpdateStage] = []
    recovery: list[str] = []
    next_steps: list[str] = []
    backup_path: Path | None = None
    previous_commit: str | None = None
    new_commit: str | None = None
    installed_changes: tuple[str, ...] = ()

    if reason:
        stages.append(RuntimeUpdateStage("status gate", "fail", reason))

    git = inspect_git(Path.cwd())
    if git.repository is None:
        stages.append(RuntimeUpdateStage("repair preflight", "fail", "repository unavailable"))
        recovery.append("Mirror must be a git checkout to repair the updater.")
        return RuntimeUpdateResult(tuple(stages), None, None, None, False, recovery=tuple(recovery))
    if git.error:
        stages.append(RuntimeUpdateStage("repair preflight", "fail", git.error))
        recovery.append("Resolve git status errors manually, then retry runtime update.")
        return RuntimeUpdateResult(tuple(stages), None, None, None, False, recovery=tuple(recovery))
    if git.dirty:
        stages.append(RuntimeUpdateStage("repair preflight", "fail", "git tree is dirty"))
        recovery.append("Commit, stash, or discard local changes before updater repair.")
        return RuntimeUpdateResult(tuple(stages), None, None, None, False, recovery=tuple(recovery))
    update_channel = inspect_update_channel(Path.cwd(), override=channel)
    stages.append(
        RuntimeUpdateStage(
            "repair preflight", "pass", f"clean git tree; channel {update_channel.value}"
        )
    )
    previous_commit = git.commit

    plan_before = _inspect_update_plan(git, update_channel)
    if plan_before.upstream is None:
        stages.append(RuntimeUpdateStage("plan", "fail", plan_before.note or "no upstream"))
        recovery.append("Configure an upstream branch with git, then retry runtime update.")
        return RuntimeUpdateResult(
            tuple(stages), previous_commit, None, None, False, recovery=tuple(recovery)
        )

    if fetch:
        split = _split_upstream(plan_before.upstream)
        if split is None:
            stages.append(RuntimeUpdateStage("fetch", "fail", "unexpected upstream name"))
            recovery.append("Resolve upstream tracking manually, then retry runtime update.")
            return RuntimeUpdateResult(
                tuple(stages), previous_commit, None, None, False, recovery=tuple(recovery)
            )
        remote_name, branch_name = split
        ok, err = _git_fetch(remote_name, branch_name, git.repository)
        if not ok:
            stages.append(RuntimeUpdateStage("fetch", "fail", err))
            recovery.append("Check network connectivity and remote access.")
            recovery.append("Retry with --no-fetch to repair from local refs only.")
            return RuntimeUpdateResult(
                tuple(stages), previous_commit, None, None, False, recovery=tuple(recovery)
            )
        stages.append(RuntimeUpdateStage("fetch", "pass", f"{remote_name} {branch_name}"))
    else:
        stages.append(RuntimeUpdateStage("fetch", "skip", "--no-fetch"))

    plan = _inspect_update_plan(git, update_channel)
    if plan.upstream is None:
        stages.append(RuntimeUpdateStage("plan", "fail", plan.note or "no upstream"))
        recovery.append("Configure an upstream branch with git, then retry runtime update.")
        return RuntimeUpdateResult(
            tuple(stages), previous_commit, None, None, False, recovery=tuple(recovery)
        )
    if plan.action == "none":
        stages.append(RuntimeUpdateStage("plan", "pass", "already up to date"))
        next_steps.append("Run: python -m memory runtime update")
        return RuntimeUpdateResult(
            tuple(stages),
            previous_commit,
            previous_commit,
            None,
            True,
            next_steps=tuple(next_steps),
        )
    if plan.action != "pull":
        stages.append(RuntimeUpdateStage("plan", "fail", plan.note or plan.action))
        recovery.append("Updater repair only supports fast-forward updates from upstream.")
        return RuntimeUpdateResult(
            tuple(stages), previous_commit, None, None, False, recovery=tuple(recovery)
        )
    stages.append(RuntimeUpdateStage("plan", "pass", plan.note or "pull"))

    backup_stage, verify_stage, backup_path, backup_recovery = _try_runtime_backup(mirror_home_arg)
    stages.append(backup_stage)
    if verify_stage:
        stages.append(verify_stage)
    if backup_stage.state == "fail" or (verify_stage and verify_stage.state == "fail"):
        recovery.extend(backup_recovery)
        return RuntimeUpdateResult(
            tuple(stages), previous_commit, None, backup_path, False, recovery=tuple(recovery)
        )

    ok, err = _git_fast_forward(plan.upstream, git.repository)
    if not ok:
        stages.append(RuntimeUpdateStage("code repair fast-forward", "fail", err))
        recovery.append("Working tree is unchanged because fast-forward refused.")
        if backup_path:
            recovery.append(f"Backup: {backup_path}")
        recovery.append(f"Previous commit: {previous_commit}")
        return RuntimeUpdateResult(
            tuple(stages), previous_commit, None, backup_path, False, recovery=tuple(recovery)
        )

    code, new_short, _err = _run_git(["rev-parse", "--short", "HEAD"], cwd=git.repository)
    new_commit = new_short if code == 0 and new_short else None
    stages.append(
        RuntimeUpdateStage(
            "code repair fast-forward",
            "pass",
            f"{previous_commit} -> {new_commit}" if new_commit else "completed",
        )
    )
    installed_changes = _git_installed_changes(git.repository, previous_commit, new_commit)
    stages.append(RuntimeUpdateStage("migrations", "skip", "updater repair"))
    next_steps.append("Run: python -m memory runtime update")

    return RuntimeUpdateResult(
        tuple(stages),
        previous_commit,
        new_commit,
        backup_path,
        True,
        installed_changes=installed_changes,
        next_steps=tuple(next_steps),
    )


def run_runtime_update(
    *,
    mirror_home_arg: str | Path | None = None,
    fetch: bool = True,
    migrate: bool = True,
    channel: str | None = None,
) -> RuntimeUpdateResult:
    stages: list[RuntimeUpdateStage] = []
    recovery: list[str] = []
    backup_path: Path | None = None
    previous_commit: str | None = None
    new_commit: str | None = None
    installed_changes: tuple[str, ...] = ()
    installed_release: RuntimeReleaseNote | None = None

    try:
        report = _build_status_for_channel(mirror_home_arg=mirror_home_arg, channel=channel)
    except Exception as exc:
        return run_runtime_update_repair(
            reason=f"runtime status crashed before update planning: {exc}",
            mirror_home_arg=mirror_home_arg,
            fetch=fetch,
            channel=channel,
        )
    if report.status != "ready":
        stages.append(RuntimeUpdateStage("status gate", "fail", "runtime status is not ready"))
        recovery.append("Run: python -m memory runtime diagnose")
        recovery.append("Resolve the reported drift, then retry runtime update.")
        return RuntimeUpdateResult(
            tuple(stages), None, None, None, success=False, recovery=tuple(recovery)
        )
    stages.append(RuntimeUpdateStage("status gate", "pass"))
    previous_commit = report.git.commit

    upstream_full: str | None = None
    remote_name: str | None = None
    branch_name: str | None = None
    if report.git.repository is None:
        stages.append(RuntimeUpdateStage("plan", "fail", "repository unavailable"))
        recovery.append("Mirror must be a git checkout to run runtime update.")
        return RuntimeUpdateResult(
            tuple(stages),
            previous_commit,
            None,
            None,
            success=False,
            recovery=tuple(recovery),
        )

    if fetch:
        plan_before = _inspect_update_plan(report.git, report.update_channel)
        if plan_before.upstream is None:
            stages.append(
                RuntimeUpdateStage("fetch", "fail", plan_before.note or "no upstream configured")
            )
            recovery.append("Configure an upstream branch with git, then retry runtime update.")
            return RuntimeUpdateResult(
                tuple(stages),
                previous_commit,
                None,
                None,
                success=False,
                recovery=tuple(recovery),
            )
        split = _split_upstream(plan_before.upstream)
        if split is None:
            stages.append(RuntimeUpdateStage("fetch", "fail", "unexpected upstream name"))
            recovery.append("Resolve upstream tracking manually, then retry runtime update.")
            return RuntimeUpdateResult(
                tuple(stages),
                previous_commit,
                None,
                None,
                success=False,
                recovery=tuple(recovery),
            )
        remote_name, branch_name = split
        upstream_full = plan_before.upstream
        ok, err = _git_fetch(remote_name, branch_name, report.git.repository)
        if not ok:
            stages.append(RuntimeUpdateStage("fetch", "fail", err))
            recovery.append("Check network connectivity and remote access.")
            recovery.append("Retry runtime update, or use --no-fetch to plan from local refs only.")
            return RuntimeUpdateResult(
                tuple(stages),
                previous_commit,
                None,
                None,
                success=False,
                recovery=tuple(recovery),
            )
        stages.append(RuntimeUpdateStage("fetch", "pass", f"{remote_name} {branch_name}"))
    else:
        stages.append(RuntimeUpdateStage("fetch", "skip", "--no-fetch"))

    plan = _inspect_update_plan(report.git, report.update_channel)
    if plan.upstream is None:
        stages.append(RuntimeUpdateStage("plan", "fail", plan.note or "no upstream"))
        recovery.append("Configure an upstream branch with git, then retry runtime update.")
        return RuntimeUpdateResult(
            tuple(stages),
            previous_commit,
            None,
            None,
            success=False,
            recovery=tuple(recovery),
        )
    upstream_full = upstream_full or plan.upstream

    if plan.action == "none":
        stages.append(RuntimeUpdateStage("plan", "pass", "already up to date"))
        return RuntimeUpdateResult(
            tuple(stages),
            previous_commit,
            previous_commit,
            None,
            success=True,
        )
    if plan.action != "pull":
        stages.append(RuntimeUpdateStage("plan", "fail", plan.note or plan.action))
        if plan.action == "blocked" and plan.ahead and plan.behind:
            recovery.append("Branch diverged; reconcile local and upstream commits manually.")
        elif plan.ahead:
            recovery.append("Local branch is ahead of upstream; push or reset before updating.")
        else:
            recovery.append("Resolve the blocking condition manually, then retry runtime update.")
        return RuntimeUpdateResult(
            tuple(stages),
            previous_commit,
            None,
            None,
            success=False,
            recovery=tuple(recovery),
        )
    stages.append(RuntimeUpdateStage("plan", "pass", plan.note or "pull"))

    try:
        mirror_home = (
            Path(mirror_home_arg).expanduser() if mirror_home_arg else resolve_mirror_home()
        )
    except ValueError as exc:
        stages.append(RuntimeUpdateStage("backup", "fail", str(exc)))
        recovery.append("Configure MIRROR_HOME or MIRROR_USER, then retry runtime update.")
        return RuntimeUpdateResult(
            tuple(stages),
            previous_commit,
            None,
            None,
            success=False,
            recovery=tuple(recovery),
        )

    try:
        backup_path = create_backup(silent=True, mirror_home=mirror_home)
    except Exception as exc:
        stages.append(RuntimeUpdateStage("backup", "fail", str(exc)))
        recovery.append(f"Backup directory must be writable: {mirror_home / 'backups'}")
        return RuntimeUpdateResult(
            tuple(stages),
            previous_commit,
            None,
            None,
            success=False,
            recovery=tuple(recovery),
        )
    if backup_path is None:
        stages.append(RuntimeUpdateStage("backup", "fail", "database not found"))
        recovery.append(f"Expected database at: {default_db_path_for_home(mirror_home)}")
        return RuntimeUpdateResult(
            tuple(stages),
            previous_commit,
            None,
            None,
            success=False,
            recovery=tuple(recovery),
        )
    stages.append(RuntimeUpdateStage("backup", "pass", str(backup_path)))

    verification = verify_backup_archive(backup_path)
    if not verification.valid:
        stages.append(
            RuntimeUpdateStage("verify backup", "fail", verification.note or "invalid backup")
        )
        recovery.append(f"Backup created but failed verification: {backup_path}")
        recovery.append("Inspect the archive before retrying runtime update.")
        return RuntimeUpdateResult(
            tuple(stages),
            previous_commit,
            None,
            backup_path,
            success=False,
            recovery=tuple(recovery),
        )
    stages.append(RuntimeUpdateStage("verify backup", "pass"))

    ok, err = _git_fast_forward(upstream_full, report.git.repository)
    if not ok:
        stages.append(RuntimeUpdateStage("fast-forward", "fail", err))
        recovery.append("Working tree is unchanged because fast-forward refused.")
        recovery.append(f"Backup: {backup_path}")
        recovery.append(f"Previous commit: {previous_commit}")
        return RuntimeUpdateResult(
            tuple(stages),
            previous_commit,
            None,
            backup_path,
            success=False,
            recovery=tuple(recovery),
        )
    code, new_short, _err = _run_git(["rev-parse", "--short", "HEAD"], cwd=report.git.repository)
    new_commit = new_short if code == 0 and new_short else None
    stages.append(
        RuntimeUpdateStage(
            "fast-forward",
            "pass",
            f"{previous_commit} -> {new_commit}" if new_commit else "completed",
        )
    )
    installed_changes = _git_installed_changes(report.git.repository, previous_commit, new_commit)
    if report.update_channel.value == "stable" and previous_commit != new_commit:
        installed_release = read_release_note("latest", start=report.git.repository)

    if migrate:
        ok, err = _apply_migrations(mirror_home_arg)
        if not ok:
            stages.append(RuntimeUpdateStage("migrations", "fail", err))
            recovery.append(f"Backup: {backup_path}")
            recovery.append(f"Previous commit: {previous_commit}")
            recovery.append(
                f"Restore database from backup and run: git reset --hard {previous_commit}"
            )
            return RuntimeUpdateResult(
                tuple(stages),
                previous_commit,
                new_commit,
                backup_path,
                success=False,
                recovery=tuple(recovery),
                installed_changes=installed_changes,
                installed_release=installed_release,
            )
        stages.append(RuntimeUpdateStage("migrations", "pass"))
    else:
        stages.append(RuntimeUpdateStage("migrations", "skip", "--skip-migrations"))

    post_report = _build_status_for_channel(mirror_home_arg=mirror_home_arg, channel=channel)
    if post_report.status != "ready":
        stages.append(
            RuntimeUpdateStage("post-update status", "fail", "runtime status is not ready")
        )
        recovery.append("Code is on the new commit, database may be migrated.")
        recovery.append(f"Backup: {backup_path}")
        recovery.append("Run: python -m memory runtime diagnose")
        return RuntimeUpdateResult(
            tuple(stages),
            previous_commit,
            new_commit,
            backup_path,
            success=False,
            recovery=tuple(recovery),
            installed_changes=installed_changes,
            installed_release=installed_release,
        )
    stages.append(RuntimeUpdateStage("post-update status", "pass"))

    return RuntimeUpdateResult(
        tuple(stages),
        previous_commit,
        new_commit,
        backup_path,
        success=True,
        installed_changes=installed_changes,
        installed_release=installed_release,
    )


def run_release_promotion(
    *,
    target: str,
    dry_run: bool = False,
    push: bool = False,
    stable_branch: str = "stable",
    remote: str = "origin",
) -> ReleasePromotionResult:
    display_target = target if target.startswith("v") else f"v{target}"
    stages: list[RuntimeUpdateStage] = []
    recovery: list[str] = []
    doctor = build_release_doctor_report(
        target=display_target, stable_ref=f"{remote}/{stable_branch}"
    )
    if doctor.has_failures:
        failures = sum(1 for check in doctor.checks if check.state == "fail")
        stages.append(RuntimeUpdateStage("release doctor", "fail", f"{failures} failure(s)"))
        recovery.append("Run: python -m memory runtime release-doctor --target " + display_target)
        recovery.append("Resolve failed checks before release promotion.")
        return ReleasePromotionResult(
            display_target, tuple(stages), False, dry_run, tuple(recovery)
        )
    warning_count = sum(1 for check in doctor.checks if check.state == "warn")
    detail = f"{warning_count} warning(s)" if warning_count else "ready"
    stages.append(RuntimeUpdateStage("release doctor", "pass", detail))

    repository = doctor.repository
    if repository is None:
        stages.append(RuntimeUpdateStage("repository", "fail", "repository unavailable"))
        return ReleasePromotionResult(display_target, tuple(stages), False, dry_run)

    head = _git_ref_full_commit(repository, "HEAD")
    if head is None:
        stages.append(RuntimeUpdateStage("HEAD", "fail", "HEAD unavailable"))
        return ReleasePromotionResult(display_target, tuple(stages), False, dry_run)

    tag_commit = _git_ref_full_commit(repository, display_target)
    if tag_commit is None:
        if dry_run:
            stages.append(
                RuntimeUpdateStage("tag", "skip", f"would create {display_target} at HEAD")
            )
        else:
            ok, err = _git_create_tag(display_target, repository)
            if not ok:
                stages.append(RuntimeUpdateStage("tag", "fail", err))
                return ReleasePromotionResult(display_target, tuple(stages), False, dry_run)
            stages.append(RuntimeUpdateStage("tag", "pass", f"created {display_target} at HEAD"))
    elif tag_commit == head:
        stages.append(RuntimeUpdateStage("tag", "pass", f"{display_target} already at HEAD"))
    else:
        stages.append(
            RuntimeUpdateStage("tag", "fail", f"{display_target} points to {tag_commit[:7]}")
        )
        recovery.append("Do not move release tags automatically; inspect tag history manually.")
        return ReleasePromotionResult(
            display_target, tuple(stages), False, dry_run, tuple(recovery)
        )

    stable_commit = _git_ref_full_commit(repository, stable_branch)
    if stable_commit is None:
        if dry_run:
            stages.append(
                RuntimeUpdateStage("stable branch", "skip", f"would create {stable_branch} at HEAD")
            )
        else:
            ok, err = _git_move_branch(stable_branch, repository)
            if not ok:
                stages.append(RuntimeUpdateStage("stable branch", "fail", err))
                return ReleasePromotionResult(display_target, tuple(stages), False, dry_run)
            stages.append(
                RuntimeUpdateStage("stable branch", "pass", f"created {stable_branch} at HEAD")
            )
    elif stable_commit == head:
        stages.append(
            RuntimeUpdateStage("stable branch", "pass", f"{stable_branch} already at HEAD")
        )
    else:
        stable_is_ancestor = _git_ref_contains(repository, stable_branch, "HEAD")
        if stable_is_ancestor is True:
            if dry_run:
                stages.append(
                    RuntimeUpdateStage(
                        "stable branch", "skip", f"would fast-forward {stable_branch} to HEAD"
                    )
                )
            else:
                ok, err = _git_move_branch(stable_branch, repository)
                if not ok:
                    stages.append(RuntimeUpdateStage("stable branch", "fail", err))
                    return ReleasePromotionResult(display_target, tuple(stages), False, dry_run)
                stages.append(
                    RuntimeUpdateStage(
                        "stable branch", "pass", f"fast-forwarded {stable_branch} to HEAD"
                    )
                )
        else:
            stages.append(
                RuntimeUpdateStage(
                    "stable branch", "fail", f"{stable_branch} is not an ancestor of HEAD"
                )
            )
            recovery.append("Reconcile stable branch history manually before promotion.")
            return ReleasePromotionResult(
                display_target, tuple(stages), False, dry_run, tuple(recovery)
            )

    if push:
        if dry_run:
            stages.append(RuntimeUpdateStage("push tag", "skip", f"would push {display_target}"))
            stages.append(RuntimeUpdateStage("push stable", "skip", f"would push {stable_branch}"))
        else:
            ok, err = _git_push_ref(remote, display_target, repository)
            if not ok:
                stages.append(RuntimeUpdateStage("push tag", "fail", err))
                return ReleasePromotionResult(display_target, tuple(stages), False, dry_run)
            stages.append(RuntimeUpdateStage("push tag", "pass", display_target))
            ok, err = _git_push_ref(remote, stable_branch, repository)
            if not ok:
                stages.append(RuntimeUpdateStage("push stable", "fail", err))
                return ReleasePromotionResult(display_target, tuple(stages), False, dry_run)
            stages.append(RuntimeUpdateStage("push stable", "pass", stable_branch))
    else:
        stages.append(RuntimeUpdateStage("push", "skip", "use --push to publish tag and stable"))

    return ReleasePromotionResult(display_target, tuple(stages), True, dry_run)


def render_release_promotion_result(result: ReleasePromotionResult) -> str:
    lines = ["Mirror runtime release promotion", ""]
    lines.append(f"Target: {result.target}")
    lines.append(f"Mode: {'dry-run' if result.dry_run else 'execute'}")
    lines.append("")
    marks = {"pass": "✓", "warn": "!", "fail": "✗", "skip": "-"}
    for stage in result.stages:
        mark = marks.get(stage.state, "?")
        line = f"[{mark}] {stage.name}"
        if stage.detail:
            line = f"{line}: {stage.detail}"
        lines.append(line)
    lines.append("")
    lines.append(f"Release promotion result: {'success' if result.success else 'failed'}")
    if result.recovery:
        lines.append("")
        lines.append("Recovery:")
        for entry in result.recovery:
            lines.append(f"- {entry}")
    return "\n".join(lines) + "\n"


def render_runtime_update_result(result: RuntimeUpdateResult) -> str:
    lines: list[str] = ["Mirror runtime update", ""]
    marks = {"pass": "✓", "fail": "✗", "skip": "-"}
    for stage in result.stages:
        mark = marks.get(stage.state, "?")
        line = f"[{mark}] {stage.name}"
        if stage.detail:
            line = f"{line}: {stage.detail}"
        lines.append(line)
    lines.append("")
    if result.previous_commit and result.new_commit and result.previous_commit != result.new_commit:
        lines.append(f"Previous commit: {result.previous_commit}")
        lines.append(f"New commit: {result.new_commit}")
    if result.backup_path:
        lines.append(f"Backup: {result.backup_path}")
    if result.installed_release:
        lines.append("")
        lines.append(
            f"Installed release: {result.installed_release.version} — {result.installed_release.title}"
        )
        if result.installed_release.digest:
            lines.append(f"Summary: {result.installed_release.digest}")
    if result.installed_changes:
        lines.append("")
        lines.append("Installed changes:")
        for change in result.installed_changes:
            lines.append(f"- {change}")
    lines.append("")
    if result.success:
        lines.append("Update result: success")
        if result.next_steps:
            lines.append("")
            lines.append("Next:")
            for entry in result.next_steps:
                lines.append(f"- {entry}")
    else:
        lines.append("Update result: failed")
        if result.recovery:
            lines.append("")
            lines.append("Recovery:")
            for entry in result.recovery:
                lines.append(f"- {entry}")
    return "\n".join(lines) + "\n"


def cmd_runtime(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Inspect Mirror runtime state")
    subparsers = parser.add_subparsers(dest="command", required=True)
    status_parser = subparsers.add_parser("status", help="Inspect runtime status")
    status_parser.add_argument("--mirror-home", dest="mirror_home")
    status_parser.add_argument("--channel", choices=sorted(_KNOWN_UPDATE_CHANNELS))
    version_parser = subparsers.add_parser("version", help="Show runtime version")
    version_parser.add_argument("--start", dest="start")
    version_parser.add_argument("--channel", choices=sorted(_KNOWN_UPDATE_CHANNELS))
    diagnose_parser = subparsers.add_parser("diagnose", help="Diagnose runtime drift")
    diagnose_parser.add_argument("--mirror-home", dest="mirror_home")
    update_parser = subparsers.add_parser("update", help="Plan or execute a runtime update")
    update_parser.add_argument("--dry-run", action="store_true", dest="dry_run")
    update_parser.add_argument("--check", action="store_true", dest="check")
    update_parser.add_argument("--no-fetch", action="store_true", dest="no_fetch")
    update_parser.add_argument("--skip-migrations", action="store_true", dest="skip_migrations")
    update_parser.add_argument("--repair-updater", action="store_true", dest="repair_updater")
    update_parser.add_argument("--mirror-home", dest="mirror_home")
    update_parser.add_argument("--channel", choices=sorted(_KNOWN_UPDATE_CHANNELS))
    release_notes_parser = subparsers.add_parser(
        "release-notes", help="Show Mirror runtime release notes"
    )
    release_notes_parser.add_argument("version", nargs="?", default="latest")
    release_doctor_parser = subparsers.add_parser(
        "release-doctor", help="Inspect release promotion readiness"
    )
    release_doctor_parser.add_argument("--target", required=True)
    release_doctor_parser.add_argument("--stable", default="origin/stable")
    release_promote_parser = subparsers.add_parser(
        "release-promote", help="Promote a release to the stable channel"
    )
    release_promote_parser.add_argument("--target", required=True)
    release_promote_parser.add_argument("--stable", default="stable")
    release_promote_parser.add_argument("--remote", default="origin")
    release_promote_parser.add_argument("--dry-run", action="store_true")
    release_promote_parser.add_argument("--push", action="store_true")
    backup_parser = subparsers.add_parser("backup", help="Create or verify a runtime backup")
    backup_parser.add_argument("--mirror-home", dest="mirror_home")
    backup_parser.add_argument("--verify", dest="verify")
    args = parser.parse_args(argv)

    if args.command == "status":
        report = _build_status_for_channel(mirror_home_arg=args.mirror_home, channel=args.channel)
        sys.stdout.write(render_runtime_status(report))
        return 0 if report.status == "ready" else 1

    if args.command == "version":
        start = Path(args.start).expanduser() if args.start else None
        try:
            version_report = build_runtime_version_report(start=start, channel=args.channel)
        except TypeError:
            version_report = build_runtime_version_report(start=start)
        sys.stdout.write(render_runtime_version(version_report))
        return 0

    if args.command == "diagnose":
        report = build_runtime_status(mirror_home_arg=args.mirror_home)
        entries = inspect_git_worktree(report.git.repository)
        findings = diagnose_runtime(report, entries)
        sys.stdout.write(render_runtime_diagnosis(findings))
        return 0 if not findings else 1

    if args.command == "update":
        if args.check:
            try:
                availability = check_runtime_update_availability(channel=args.channel)
            except TypeError:
                availability = check_runtime_update_availability()
            sys.stdout.write(render_runtime_update_availability(availability))
            return 0 if availability.status in {"up_to_date", "update_available"} else 1
        if args.dry_run:
            try:
                dry_run = build_runtime_update_dry_run(
                    mirror_home_arg=args.mirror_home, channel=args.channel
                )
            except TypeError:
                dry_run = build_runtime_update_dry_run(mirror_home_arg=args.mirror_home)
            sys.stdout.write(render_runtime_update_dry_run(dry_run))
            return 0 if dry_run.ready else 1
        if args.repair_updater:
            try:
                result = run_runtime_update_repair(
                    mirror_home_arg=args.mirror_home,
                    fetch=not args.no_fetch,
                    channel=args.channel,
                )
            except TypeError:
                result = run_runtime_update_repair(
                    mirror_home_arg=args.mirror_home,
                    fetch=not args.no_fetch,
                )
            sys.stdout.write(render_runtime_update_result(result))
            return 0 if result.success else 1
        try:
            result = run_runtime_update(
                mirror_home_arg=args.mirror_home,
                fetch=not args.no_fetch,
                migrate=not args.skip_migrations,
                channel=args.channel,
            )
        except TypeError:
            result = run_runtime_update(
                mirror_home_arg=args.mirror_home,
                fetch=not args.no_fetch,
                migrate=not args.skip_migrations,
            )
        sys.stdout.write(render_runtime_update_result(result))
        return 0 if result.success else 1

    if args.command == "release-notes":
        sys.stdout.write(render_release_note(read_release_note(args.version)))
        return 0

    if args.command == "release-doctor":
        release_report = build_release_doctor_report(target=args.target, stable_ref=args.stable)
        sys.stdout.write(render_release_doctor(release_report))
        return 1 if release_report.has_failures else 0

    if args.command == "release-promote":
        promotion = run_release_promotion(
            target=args.target,
            dry_run=args.dry_run,
            push=args.push,
            stable_branch=args.stable,
            remote=args.remote,
        )
        sys.stdout.write(render_release_promotion_result(promotion))
        return 0 if promotion.success else 1

    if args.command == "backup":
        if args.verify:
            verification = verify_backup_archive(Path(args.verify).expanduser())
            sys.stdout.write(render_backup_verification(verification))
            return 0 if verification.valid else 1
        try:
            mirror_home = (
                Path(args.mirror_home).expanduser() if args.mirror_home else resolve_mirror_home()
            )
        except ValueError as exc:
            sys.stderr.write(f"{exc}\n")
            return 1
        backup_path = create_backup(silent=True, mirror_home=mirror_home)
        if backup_path is None:
            sys.stderr.write(f"Database not found: {default_db_path_for_home(mirror_home)}\n")
            return 1
        verification = verify_backup_archive(backup_path)
        sys.stdout.write(
            render_runtime_backup_created(
                backup_path=backup_path, mirror_home=mirror_home, verification=verification
            )
        )
        return 0 if verification.valid else 1

    parser.print_help()
    return 1


def main(argv: list[str] | None = None) -> None:
    raise SystemExit(cmd_runtime(sys.argv[1:] if argv is None else argv))
