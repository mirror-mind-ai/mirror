"""Windows path-safety guards for skill directories.

Windows forbids the ':' character (and a handful of others) in file and
directory names. Mirror's Claude skill command names intentionally use the
``ext:<name>`` / ``mm:<name>`` namespace, but the on-disk directory must be a
sanitized ``ext-<name>`` form. These tests lock that guarantee so a regression
cannot reintroduce a colon into a committed skill directory or into the
sanitizer output.
"""

from pathlib import Path

import pytest

from memory.cli.extensions import _filesystem_skill_dir_name

PROJECT_ROOT = Path(__file__).resolve().parents[4]

# Characters that are illegal in Windows path components.
_ILLEGAL_WINDOWS_CHARS = set('<>:"/\\|?*')


@pytest.mark.parametrize(
    "command_name, expected",
    [
        ("ext:review-copy", "ext-review-copy"),
        ("ext-review-copy", "ext-review-copy"),
        ("mm:build", "mm-build"),
        ("mm:journeys", "mm-journeys"),
    ],
)
def test_sanitizer_removes_colon(command_name, expected):
    assert _filesystem_skill_dir_name(command_name) == expected


@pytest.mark.parametrize(
    "command_name",
    ["ext:review-copy", "weird<name>", "a|b", "c*d", "e?f", 'g"h', "mm:mirror"],
)
def test_sanitizer_output_is_windows_safe(command_name):
    result = _filesystem_skill_dir_name(command_name)
    assert not (_ILLEGAL_WINDOWS_CHARS & set(result)), (
        f"sanitized dir name {result!r} still contains a Windows-illegal char"
    )


@pytest.mark.parametrize(
    "skills_root",
    [
        PROJECT_ROOT / ".claude" / "skills",
        PROJECT_ROOT / ".pi" / "skills",
        PROJECT_ROOT / "templates",
    ],
)
def test_no_committed_skill_dir_contains_illegal_char(skills_root):
    """No committed directory under these roots may contain a Windows-illegal
    character in any path component. Such a path cannot be checked out on
    Windows at all, so it must never enter the tree."""
    if not skills_root.exists():
        pytest.skip(f"{skills_root} not present")
    offenders = [
        str(p)
        for p in skills_root.rglob("*")
        if p.is_dir() and (_ILLEGAL_WINDOWS_CHARS & set(p.name))
    ]
    assert not offenders, f"Windows-illegal directory names found: {offenders}"
