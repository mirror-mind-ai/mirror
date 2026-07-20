#!/usr/bin/env python3
"""Fail CI when a ported Python oracle drifts from the recorded baseline (CR044).

Usage:
    python scripts/check_oracle_drift.py            # check (exit 1 on drift)
    python scripts/check_oracle_drift.py --update   # advance the baseline

Green means no ported Python oracle changed since the baseline -- it does NOT
prove the TypeScript port is in behavioral parity. See src/memory/oracle_drift.py
and docs/project/roadmap/technical-debt-ledger.md (TD-003 / RS007).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "src"))

from memory.oracle_drift import (  # noqa: E402
    BASELINE_RELPATH,
    GREEN_SEMANTICS,
    check,
    write_baseline,
)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--update",
        action="store_true",
        help="Regenerate the baseline manifest from current oracle contents.",
    )
    args = parser.parse_args(argv)

    if args.update:
        path = write_baseline(REPO_ROOT)
        print(f"oracle baseline updated: {path.relative_to(REPO_ROOT)}")
        return 0

    result = check(REPO_ROOT)
    if result.ok:
        print("oracle-drift check: clean -- all ported Python oracles match the recorded baseline.")
        print(f"note: {GREEN_SEMANTICS}")
        return 0

    print("oracle-drift check: DRIFT DETECTED\n")
    for path, baseline_sha, current_sha in result.drifted:
        print(f"  drifted: {path}")
        print(f"    baseline {baseline_sha}")
        print(f"    current  {current_sha}")
    for path in result.missing_files:
        print(f"  missing file (renamed/deleted?): {path}")
    for path in result.uninitialized:
        print(f"  not in baseline (new oracle?): {path}")
    for path in result.stale_entries:
        print(f"  stale baseline entry (no longer a tracked oracle?): {path}")

    print(
        "\nRemediation: a ported Python oracle changed. Reconcile the TypeScript port to match"
        "\n(or consciously defer via a Change Request under RS007), then advance the baseline:"
        "\n    uv run python scripts/check_oracle_drift.py --update"
        f"\nand commit the updated {BASELINE_RELPATH} in the SAME commit as the reconciliation."
    )
    print(f"\nReminder: {GREEN_SEMANTICS}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
