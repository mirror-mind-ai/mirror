#!/usr/bin/env python3
"""Generate the canonical Mirror Mind Claude plugin (manifest + skills).

Usage:
    python scripts/build_claude_plugin.py          # write the generated files
    python scripts/build_claude_plugin.py --check   # report drift, exit 1 if any

The plugin skills are generated from ``.claude/skills/`` (the Claude-tuned
source). Hooks under ``plugins/mirror-mind/hooks/`` are hand-authored plugin
source and are not managed by this script.
"""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "src"))

from memory.plugins import claude  # noqa: E402


def main(argv: list[str]) -> int:
    check = "--check" in argv
    problems = claude.materialize(REPO_ROOT, write=not check)
    if check:
        if problems:
            print("Claude plugin is out of sync with .claude/skills/:")
            for problem in problems:
                print(f"  - {problem}")
            print("\nRegenerate with: python scripts/build_claude_plugin.py")
            return 1
        print("Claude plugin is in sync.")
        return 0
    print(f"Generated Claude plugin under {claude.PLUGIN_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
