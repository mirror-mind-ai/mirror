"""Git subprocess timeouts: local inspections stay tight, network operations
get a network-appropriate timeout.

Regression for the v0.30.1 release incident: ``release-promote --push``
reported failure after 2 seconds while ``git push`` actually landed on the
remote, because one shared timeout served both near-instant local
inspections and real network operations.
"""

from unittest.mock import MagicMock

from memory.cli import runtime


def _completed(returncode: int = 0) -> MagicMock:
    return MagicMock(returncode=returncode, stdout="", stderr="")


def test_run_git_defaults_to_local_timeout(mocker, tmp_path):
    run = mocker.patch("memory.cli.runtime.subprocess.run", return_value=_completed())

    runtime._run_git(["status", "--porcelain"], cwd=tmp_path)

    assert run.call_args.kwargs["timeout"] == runtime._GIT_LOCAL_TIMEOUT_SECONDS


def test_run_git_accepts_explicit_timeout(mocker, tmp_path):
    run = mocker.patch("memory.cli.runtime.subprocess.run", return_value=_completed())

    runtime._run_git(["push", "origin", "v1.0.0"], cwd=tmp_path, timeout=60)

    assert run.call_args.kwargs["timeout"] == 60


def test_git_push_ref_uses_network_timeout(mocker, tmp_path):
    run_git = mocker.patch("memory.cli.runtime._run_git", return_value=(0, "", ""))

    ok, err = runtime._git_push_ref("origin", "v1.0.0", tmp_path)

    assert ok and err == ""
    assert run_git.call_args.kwargs["timeout"] == runtime._GIT_NETWORK_TIMEOUT_SECONDS


def test_git_fetch_uses_network_timeout(mocker, tmp_path):
    run_git = mocker.patch("memory.cli.runtime._run_git", return_value=(0, "", ""))

    ok, err = runtime._git_fetch("origin", "main", cwd=tmp_path)

    assert ok and err == ""
    assert run_git.call_args.kwargs["timeout"] == runtime._GIT_NETWORK_TIMEOUT_SECONDS


def test_release_notes_fetch_uses_network_timeout(mocker, tmp_path):
    run_git = mocker.patch("memory.cli.runtime._run_git", return_value=(0, "", ""))

    runtime._fetch_release_notes_ref("origin/stable", tmp_path)

    assert run_git.call_args.kwargs["timeout"] == runtime._GIT_NETWORK_TIMEOUT_SECONDS


def test_network_timeout_is_meaningfully_larger_than_local():
    assert runtime._GIT_NETWORK_TIMEOUT_SECONDS >= 30 * runtime._GIT_LOCAL_TIMEOUT_SECONDS
