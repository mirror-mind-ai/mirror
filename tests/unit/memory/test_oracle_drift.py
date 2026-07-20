"""Tests for the oracle-drift tripwire (CR044).

The tripwire fails CI when a ported Python oracle changes relative to the
recorded baseline without a conscious advance. These tests split the pure
drift logic (``evaluate``) from the IO shell (``compute_blob_shas``/``check``)
so the branch behavior is verified without touching the real manifest, plus a
few tests that run against the real repo/entrypoint to prove the wired path.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from memory.oracle_drift import (
    ORACLE_PATHS,
    check,
    compute_blob_shas,
    evaluate,
)

REPO_ROOT = Path(__file__).resolve().parents[3]


# --- pure logic: evaluate() branches -----------------------------------------


def test_evaluate_clean_when_baseline_matches_current() -> None:
    result = evaluate({"a": "111", "b": "222"}, {"a": "111", "b": "222"}, oracle_paths=("a", "b"))
    assert result.ok
    assert result.drifted == ()


def test_evaluate_detects_drift_and_names_the_oracle() -> None:
    result = evaluate({"a": "111"}, {"a": "999"}, oracle_paths=("a",))
    assert not result.ok
    assert result.drifted == (("a", "111", "999"),)


def test_evaluate_detects_missing_file_loudly() -> None:
    # File in ORACLE_PATHS but absent on disk (renamed/deleted) -> not silent.
    result = evaluate({"a": "111"}, {}, oracle_paths=("a",))
    assert not result.ok
    assert result.missing_files == ("a",)


def test_evaluate_detects_uninitialized_oracle() -> None:
    # New oracle added to code but not yet recorded in the baseline.
    result = evaluate({}, {"a": "111"}, oracle_paths=("a",))
    assert not result.ok
    assert result.uninitialized == ("a",)


def test_evaluate_detects_stale_baseline_entry() -> None:
    # Baseline records a path that is no longer a tracked oracle.
    result = evaluate({"a": "111", "old": "333"}, {"a": "111"}, oracle_paths=("a",))
    assert not result.ok
    assert result.stale_entries == ("old",)


# --- IO shell against the real repo ------------------------------------------


def test_compute_blob_shas_matches_git_head_blob() -> None:
    # Determinism: git hash-object of the working tree equals the committed
    # blob sha (git applies .gitattributes eol=lf normalization on both sides).
    path = "src/memory/models.py"
    shas = compute_blob_shas([path], REPO_ROOT)
    head = subprocess.run(
        ["git", "rev-parse", f"HEAD:{path}"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()
    assert shas[path] == head


def test_all_declared_oracles_exist_on_disk() -> None:
    for path in ORACLE_PATHS:
        assert (REPO_ROOT / path).is_file(), path


def test_committed_baseline_has_no_drift() -> None:
    # The manifest committed in the repo must match current oracle contents;
    # this is the CI gate expressed as a unit test.
    assert check(REPO_ROOT).ok


def test_script_entrypoint_exits_zero_when_clean() -> None:
    # Run exactly what CI runs, end to end.
    result = subprocess.run(
        [sys.executable, "scripts/check_oracle_drift.py"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr
