#!/usr/bin/env python3
"""Check the project's markdown docs for broken links and roadmap integrity.

Usage:
    python scripts/check_doc_links.py

Runs two independent, network-free, deterministic checks and exits 1 if
either finds a problem, 0 if both are clean:

1. Every relative file link and anchor in every markdown file resolves.
   Checks only repo-relative links, never external (http/https) ones. See
   the "Testing" section of docs/process/engineering-principles.md for the
   gate this enforces.
2. No two docs/project/roadmap/**/index.md files share a heading code (the
   CI guard for the "one code -> one package" invariant Ariad's Expand
   depends on; see handoff-ariad-fix.MD / plan-ariad-fix.md).

Used by the `docs` CI workflow.
"""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "src"))

from memory.docs_lint import check_repo, check_roadmap_duplicate_headings  # noqa: E402


def main() -> int:
    link_problems = check_repo(REPO_ROOT)
    duplicate_problems = check_roadmap_duplicate_headings(REPO_ROOT)

    if not link_problems and not duplicate_problems:
        print("docs link check: clean -- no broken relative links or anchors.")
        print("roadmap heading check: clean -- no duplicate heading codes.")
        return 0

    for problem in link_problems:
        print(f"{problem.source_file}:{problem.line}: {problem.reason} -> {problem.target}")
    if link_problems:
        print(f"\n{len(link_problems)} broken link(s)/anchor(s) found.")

    for problem in duplicate_problems:
        print(f"\nduplicate heading code {problem.code!r} claimed by:")
        for path in problem.paths:
            print(f"  - {path}")
    if duplicate_problems:
        print(f"\n{len(duplicate_problems)} duplicate roadmap heading code(s) found.")

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
