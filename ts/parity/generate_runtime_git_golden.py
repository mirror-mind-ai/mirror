"""Generate the runtime git/version golden (CV22.DS7.TS3, plateau 1).

`welcome` and the read-only `runtime` subcommands both stand on git
inspection: which repository, which branch, which commit, is the worktree
dirty, which channel, and — the only networked read — is the channel's remote
branch ahead of HEAD. The port is graded against the Python oracle over a
FIXTURE repository with a `file://` bare remote, so the corpus is real git
output, deterministic, and offline: nothing here resolves a hostname.

Scenarios cover the branches the readers actually take: a clone level with its
remote, a clone one commit behind, one commit ahead, a dirty worktree with a
rename, a directory that is not a repository at all, and the marker files
(`.mirror-update-channel`, `.mirror-clone-role`) absent, valid, and holding an
unknown value.

`package_version` is graded against the `version =` line of the repository's
own pyproject.toml, which is what TypeScript reads. Python prefers installed
distribution metadata and only falls back to that walk — the two agree for an
editable install and would drift only if the installed metadata went stale
against the working tree; that difference is recorded here rather than hidden.

Run:  uv run python ts/parity/generate_runtime_git_golden.py
"""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
from dataclasses import asdict, is_dataclass
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT_PATH = HERE.parent / "test" / "goldens" / "runtime-git.golden.json"

for _key in ("MEMORY_DIR", "MEMORY_PROD_DIR", "MEMORY_ENV", "DB_PATH", "DB_BACKUP_PATH"):
    os.environ.pop(_key, None)

GIT_ENV = {
    **os.environ,
    "GIT_AUTHOR_NAME": "Mirror Fixture",
    "GIT_AUTHOR_EMAIL": "fixture@example.invalid",
    "GIT_COMMITTER_NAME": "Mirror Fixture",
    "GIT_COMMITTER_EMAIL": "fixture@example.invalid",
    "GIT_AUTHOR_DATE": "2026-09-01T12:00:00+00:00",
    "GIT_COMMITTER_DATE": "2026-09-01T12:00:00+00:00",
    # No credential prompts, no config from the developer's machine.
    "GIT_TERMINAL_PROMPT": "0",
    "GIT_CONFIG_GLOBAL": "/dev/null",
    "GIT_CONFIG_SYSTEM": "/dev/null",
}

FIXTURE_VERSION = "9.9.9"
PYPROJECT = f'[project]\nname = "mirror"\nversion = "{FIXTURE_VERSION}"\n'


def git(*args: str, cwd: Path) -> str:
    result = subprocess.run(
        ["git", *args], cwd=cwd, env=GIT_ENV, text=True, capture_output=True, check=True
    )
    return result.stdout.strip()


def _serialize(value: object) -> object:
    """Dataclasses to dicts, Paths to a placeholder-safe string."""
    if is_dataclass(value):
        return {key: _serialize(item) for key, item in asdict(value).items()}
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, (list, tuple)):
        return [_serialize(item) for item in value]
    if isinstance(value, dict):
        return {key: _serialize(item) for key, item in value.items()}
    return value


def build_repository(root: Path) -> tuple[Path, Path]:
    """A bare remote with two commits on `stable`, and a clone one commit behind."""
    remote = root / "remote.git"
    seed = root / "seed"
    seed.mkdir(parents=True)
    git("init", "--initial-branch=stable", cwd=seed)
    (seed / "pyproject.toml").write_text(PYPROJECT, encoding="utf-8")
    (seed / "README.md").write_text("fixture\n", encoding="utf-8")
    git("add", ".", cwd=seed)
    git("commit", "-m", "first", cwd=seed)
    git("clone", "--bare", str(seed), str(remote), cwd=root)

    clone = root / "clone"
    git("clone", str(remote), str(clone), cwd=root)
    git("checkout", "stable", cwd=clone)

    # One more commit on the remote, so the clone is behind by exactly one.
    (seed / "README.md").write_text("fixture, moved on\n", encoding="utf-8")
    git("commit", "-am", "second", cwd=seed)
    git("push", str(remote), "stable", cwd=seed)
    return clone, remote


def main() -> None:
    from memory.cli import runtime as rt

    # `check_runtime_update_availability` calls `package_version()`, which
    # prefers the INSTALLED distribution metadata -- an ambient value that would
    # bake this machine's Mirror version into the golden and change it at every
    # release. Pin it to the fixture's version so the corpus grades the reader,
    # not the environment. The preference itself is recorded in meta.
    original_package_version = rt.package_version
    rt.package_version = lambda: FIXTURE_VERSION  # type: ignore[assignment]

    scenarios: dict[str, object] = {}
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp).resolve()
        clone, remote = build_repository(root)
        seed_repo = root / "seed"

        def snapshot(label: str, start: Path, *, channel: str | None = None) -> None:
            git_status = rt.inspect_git(start)
            worktree = rt.inspect_git_worktree(git_status.repository)
            clone_role = rt.inspect_clone_role(start)
            update_channel = rt.inspect_update_channel(start, override=channel)
            version_report = rt.RuntimeVersionReport(
                version=FIXTURE_VERSION,
                git=git_status,
                clone_role=clone_role,
                update_channel=update_channel,
            )
            availability = rt.check_runtime_update_availability(start, channel=channel)
            scenarios[label] = {
                "channel_override": channel,
                "git": _serialize(git_status),
                "worktree": _serialize(worktree),
                "clone_role": _serialize(clone_role),
                "update_channel": _serialize(update_channel),
                "version_render": rt.render_runtime_version(version_report),
                "availability": _serialize(availability),
                "availability_render": rt.render_runtime_update_availability(availability),
            }

        snapshot("behind_by_one", clone)
        snapshot("channel_override_main", clone, channel="main")
        snapshot("channel_override_unknown", clone, channel="Nonsense")

        # Marker files: valid, then an unknown value.
        (clone / ".mirror-update-channel").write_text("main\n", encoding="utf-8")
        (clone / ".mirror-clone-role").write_text("dev\n", encoding="utf-8")
        snapshot("markers_valid", clone)
        (clone / ".mirror-update-channel").write_text("weekly\n", encoding="utf-8")
        (clone / ".mirror-clone-role").write_text("staging\n", encoding="utf-8")
        snapshot("markers_unknown_value", clone)
        (clone / ".mirror-update-channel").unlink()
        (clone / ".mirror-clone-role").unlink()

        # A dirty worktree, including a rename and an untracked file.
        (clone / "README.md").write_text("locally modified\n", encoding="utf-8")
        (clone / "untracked.txt").write_text("scratch\n", encoding="utf-8")
        git("mv", "pyproject.toml", "project.toml", cwd=clone)
        (clone / "project.toml").write_text(PYPROJECT, encoding="utf-8")
        snapshot("dirty_worktree", clone)
        git("mv", "project.toml", "pyproject.toml", cwd=clone)
        git("checkout", "--", "README.md", cwd=clone)
        (clone / "untracked.txt").unlink()

        # Caught up with the remote.
        git("pull", "--ff-only", cwd=clone)
        snapshot("up_to_date", clone)

        # Ahead of the remote by a local commit.
        (clone / "local.txt").write_text("local work\n", encoding="utf-8")
        git("add", "local.txt", cwd=clone)
        git("commit", "-m", "local ahead", cwd=clone)
        snapshot("local_ahead", clone)

        # Diverged: the remote moved too, so neither commit contains the other.
        (seed_repo / "README.md").write_text("remote moved again\n", encoding="utf-8")
        git("commit", "-am", "third", cwd=seed_repo)
        git("push", str(remote), "stable", cwd=seed_repo)
        # The clone must already HAVE the remote commit for `diverged` to be
        # distinguishable from `update_available`: the classifier asks the local
        # object database, so an unfetched divergence reads as "update available".
        git("fetch", "origin", cwd=clone)
        snapshot("diverged", clone)

        # Markers are lowercased before the allowlist check.
        (clone / ".mirror-update-channel").write_text("  MAIN \n", encoding="utf-8")
        (clone / ".mirror-clone-role").write_text("DeV\n", encoding="utf-8")
        snapshot("markers_uppercase", clone)
        (clone / ".mirror-update-channel").unlink()
        (clone / ".mirror-clone-role").unlink()

        # Not a repository at all.
        outside = root / "not-a-repo"
        outside.mkdir()
        snapshot("not_a_repository", outside)

        pyproject_version = rt._version_from_pyproject(clone)
        remote_url = git("config", "--get", "remote.origin.url", cwd=clone)
    rt.package_version = original_package_version  # type: ignore[assignment]

    golden = {
        "meta": {
            "note": (
                "Oracle: src/memory/cli/runtime.py over a fixture repository with a "
                "file:// bare remote, built by this generator and rebuilt identically by "
                "the TypeScript test. Only the temp root is a placeholder (<root>); commit "
                "ids are real, because fixed content and fixed author/committer dates make "
                "git object ids reproducible and path-independent."
            ),
            "fixture_version": FIXTURE_VERSION,
            "pyproject_version": pyproject_version,
            "package_version_note": (
                "Python prefers importlib metadata and falls back to this pyproject walk; "
                "TypeScript reads pyproject only. Equal for an editable install."
            ),
            "remote_url_shape": "file://" if remote_url.startswith("file://") else "path",
        },
        "scenarios": scenarios,
    }

    # Only the temp root is a placeholder. Commit ids are NOT rewritten: with
    # fixed content, author, committer, and dates, git object ids are
    # content-addressed and path-independent, so the TypeScript test rebuilding
    # this same recipe produces the same hashes -- which is a stronger property
    # than a positional placeholder, and one that fails loudly if the fixture
    # recipe drifts on either side.
    text = json.dumps(golden, indent=2, sort_keys=True, ensure_ascii=False).replace(str(root), "<root>")

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(text + "\n", encoding="utf-8")

    for label, scenario in scenarios.items():
        entry = scenario if isinstance(scenario, dict) else {}
        availability = entry.get("availability", {})
        status = availability.get("status") if isinstance(availability, dict) else "?"
        print(f"  {label:26} -> {status}")
    print(f"wrote {OUT_PATH.relative_to(HERE.parent.parent)}")


if __name__ == "__main__":
    main()
