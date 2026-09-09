#!/usr/bin/env python3
"""Fail CI when the runtime skill copies disagree about a command's ENTRY POINT (CR071).

Each skill exists three times -- `.pi/skills/`, `.claude/skills/`, and
`plugins/mirror-mind/skills/` -- and every strangler flip has to rewrite the
invocations in all three. Nothing enforced that, and by 2026-09-09 eleven skills
reached the front door on Pi while still calling `uv run python -m memory`
directly on Claude Code and the published plugin. `.claude/skills/mm-journeys`
was still invoking Python for `journeys`, a command flipped in DS3.

Nothing was broken -- Python answered correctly -- but the burn-down's "answers
from TS" was true for one runtime and not the others, TS-only fixes never
reached those users, and DS10 deletes the module those copies invoke.

What is checked, and what deliberately is not:

  * CHECKED -- `.claude` and `plugins/mirror-mind` are byte-identical. They are
    today, for all 25 skills, and it is the cheapest strong invariant available.
  * CHECKED -- for every command a skill documents, all three copies reach it
    through the same entry point (front door or Python).
  * NOT CHECKED -- argument spellings. `.pi` documents `memories [args]` where
    `.claude` documents `memories [--type TYPE] [--layer LAYER] ...`. Forcing
    those identical would flatten documentation for no correctness gain.
  * NOT CHECKED -- the frontmatter name, the per-runtime Usage sections, or the
    natural-language examples, which are Portuguese in `.pi` and English in the
    others. Those differences are deliberate.

Usage:
    python scripts/check_skill_command_parity.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

PI_ROOT = REPO_ROOT / ".pi" / "skills"
CLAUDE_ROOT = REPO_ROOT / ".claude" / "skills"
PLUGIN_ROOT = REPO_ROOT / "plugins" / "mirror-mind" / "skills"

FRONT_DOOR = "front-door"
PYTHON = "python"

# The two invocation forms a skill may document. The captured group is the
# command surface that follows -- `journeys`, `soul load [slug]`, and so on.
FRONT_DOOR_RE = re.compile(r"ts/src/frontDoor/cli\.ts\s+(?P<rest>.+)$")
PYTHON_RE = re.compile(r"uv run python -m memory\s+(?P<rest>.+)$")


def command_name(rest: str) -> str:
    """The command a documented invocation reaches, ignoring its arguments.

    `soul load [slug]` and `soul load <slug> --session-id X` are the same
    command for this check's purpose: what matters is which engine answers
    `soul`, not how the copy spells its arguments.
    """
    for token in rest.split():
        if token.startswith(("-", "<", "[", "$", '"')):
            break
        return token
    return rest.strip()


def entry_points(path: Path) -> dict[str, set[str]]:
    """Map each documented command to the set of entry points it is reached by."""
    found: dict[str, set[str]] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        for pattern, entry in ((FRONT_DOOR_RE, FRONT_DOOR), (PYTHON_RE, PYTHON)):
            match = pattern.search(line)
            if match:
                found.setdefault(command_name(match.group("rest")), set()).add(entry)
                break
    return found


def check_byte_identity(skill: str, problems: list[str]) -> None:
    claude = CLAUDE_ROOT / skill / "SKILL.md"
    plugin = PLUGIN_ROOT / skill / "SKILL.md"
    if not claude.exists() or not plugin.exists():
        problems.append(f"{skill}: missing a .claude or plugins/mirror-mind copy")
        return
    if claude.read_bytes() != plugin.read_bytes():
        problems.append(
            f"{skill}: .claude and plugins/mirror-mind copies are not byte-identical"
        )


def check_entry_points(skill: str, problems: list[str]) -> None:
    copies = {
        ".pi": PI_ROOT / skill / "SKILL.md",
        ".claude": CLAUDE_ROOT / skill / "SKILL.md",
        "plugins/mirror-mind": PLUGIN_ROOT / skill / "SKILL.md",
    }
    present = {label: path for label, path in copies.items() if path.exists()}
    if len(present) < 2:
        return

    maps = {label: entry_points(path) for label, path in present.items()}
    commands = sorted({command for mapping in maps.values() for command in mapping})

    for command in commands:
        by_label = {label: mapping.get(command) for label, mapping in maps.items()}
        documented = {label: entries for label, entries in by_label.items() if entries}
        if len(documented) < 2:
            # A command only one copy documents is a prose difference, not a
            # flip that missed a copy. Out of scope by design.
            continue
        distinct = {frozenset(entries) for entries in documented.values()}
        if len(distinct) > 1:
            detail = ", ".join(
                f"{label}={'+'.join(sorted(entries))}" for label, entries in documented.items()
            )
            problems.append(f"{skill}: `{command}` disagrees on entry point -> {detail}")


def main() -> int:
    if not PI_ROOT.is_dir():
        print(f"skill parity check: {PI_ROOT} not found", file=sys.stderr)
        return 1

    problems: list[str] = []
    skills = sorted(path.name for path in PI_ROOT.iterdir() if path.is_dir())
    for skill in skills:
        check_byte_identity(skill, problems)
        check_entry_points(skill, problems)

    if problems:
        print("skill command parity: DRIFT DETECTED\n")
        for problem in problems:
            print(f"  {problem}")
        print(
            "\nRemediation: a flip must update the invocation in ALL THREE skill copies.\n"
            "Switch the lagging copies to the same entry point `.pi` uses; leave argument\n"
            "spellings and the Portuguese/English examples alone (CR071)."
        )
        return 1

    print(f"skill command parity: clean -- {len(skills)} skills agree on every entry point.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
