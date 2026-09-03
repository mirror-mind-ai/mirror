"""Tests for the oracle-drift tripwire (CR044).

The tripwire fails CI when a ported Python oracle changes relative to the
recorded baseline without a conscious advance. These tests split the pure
drift logic (``evaluate``) from the IO shell (``compute_blob_shas``/``check``)
so the branch behavior is verified without touching the real manifest, plus a
few tests that run against the real repo/entrypoint to prove the wired path.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from memory.oracle_drift import (
    BASELINE_RELPATH,
    ORACLE_PATHS,
    build_baseline_document,
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


def test_baseline_document_is_written_in_sorted_key_order() -> None:
    # The manifest is a generated snapshot whose key order carries no meaning
    # (``evaluate`` looks entries up by key), but an unstable order makes every
    # ``--update`` produce a churn diff that can hide a real SHA change in the
    # very tripwire meant to expose one. Sorting keeps the review signal.
    oracles = build_baseline_document(REPO_ROOT)["oracles"]
    assert list(oracles) == sorted(oracles)


def test_committed_baseline_matches_the_writer_byte_for_byte() -> None:
    # Guards the same hazard from the other side: the committed file must be
    # exactly what the writer produces, so a regenerate is always a no-op diff.
    document = build_baseline_document(REPO_ROOT)
    expected = json.dumps(document, indent=2, ensure_ascii=False) + "\n"
    assert (REPO_ROOT / BASELINE_RELPATH).read_text(encoding="utf-8") == expected


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
