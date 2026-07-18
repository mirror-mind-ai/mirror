#!/usr/bin/env python3
"""Check every relative file link and anchor in the project's markdown docs.

Usage:
    python scripts/check_doc_links.py

Exits 1 and prints every broken link/anchor if any are found, 0 if clean.
Network-free and deterministic -- checks only repo-relative links, never
external (http/https) ones. Used by the `docs` CI workflow; see the
"Testing" section of docs/process/engineering-principles.md for the gate
this enforces.
"""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "src"))

from memory.docs_lint import check_repo  # noqa: E402


def main() -> int:
    problems = check_repo(REPO_ROOT)
    if not problems:
        print("docs link check: clean -- no broken relative links or anchors.")
        return 0

    for problem in problems:
        print(f"{problem.source_file}:{problem.line}: {problem.reason} -> {problem.target}")
    print(f"\n{len(problems)} broken link(s)/anchor(s) found.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
