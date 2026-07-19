"""Shared parsing primitives for Builder roadmap grammars.

Both the legacy ``CV → Epic → Story`` grammar and the ``Delivery Story`` grammar
(hyphenated ``DS-NN`` codes, ``## Chapter N —`` sections, ``| Code | Delivery
Story | Status |`` tables) are parsed with these primitives. Keeping them in one
module prevents the heading/status regex drift that caused DS-grammar roadmaps to
be misread while the CV grammar still worked.
"""

from __future__ import annotations

import re
from pathlib import Path

# Heading codes may contain hyphens (``DS-35``), dots (``CV2.DS1``), and dotted
# hyphenated child codes (``DS-35.US-1``). Hyphens are safe for CV codes, which
# never contain one.
HEADING_RE = re.compile(r"^#\s+(?P<code>[A-Z0-9.\-]+)\s+[—-]\s+(?P<title>.+?)\s*$", re.MULTILINE)
STATUS_RE = re.compile(r"\*\*Status:\*\*\s*(?P<status>.+?)\s*$", re.MULTILINE)
_MARKDOWN_LINK_RE = re.compile(r"\[(?P<label>[^\]]+)\]\([^)]*\)")


def is_legacy_path(path: Path, roadmap_root: Path) -> bool:
    """Return True when a roadmap file lives under the retired ``legacy/`` archive."""
    try:
        relative = path.resolve().relative_to(roadmap_root)
    except ValueError:
        return False
    return "legacy" in relative.parts


def strip_markdown_link(value: str) -> str:
    """Return the label of a ``[label](target)`` markdown link, or the raw value."""
    stripped = value.strip()
    match = _MARKDOWN_LINK_RE.fullmatch(stripped)
    return match.group("label") if match else stripped
