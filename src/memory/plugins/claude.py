"""Generate the canonical Mirror Mind Claude plugin from standalone surfaces.

CV21 packages Mirror Mind once as a Claude-format plugin
(``plugins/mirror-mind/``) that the other runtimes import. This module is the
build tool that materializes the plugin's generated parts:

- ``.claude-plugin/plugin.json`` — the manifest, version kept in sync with
  ``pyproject.toml`` (no ``$schema`` key; the 2.1.114 validator rejects it).
- ``skills/<filesystem-safe-name>/SKILL.md`` — the Claude-tuned skills, copied
  byte-faithfully from ``.claude/skills/`` (the runtime-correct source for a
  *Claude* plugin) and normalized to the ``SKILL.md`` filename. Directory names
  are Windows-safe; the skill command name remains in the markdown frontmatter.

The plugin's hooks are hand-authored plugin source, not generated here, because
they differ structurally from the standalone hooks (plugin-relative paths, no
repo-cwd assumption).

``materialize(write=True)`` writes the generated files; ``materialize(write=False)``
returns drift descriptions and is used as a CI drift guard so an edit to a
``.claude/skills/`` body that is not regenerated fails the test suite.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

PLUGIN_NAME = "mirror-mind"
PLUGIN_DESCRIPTION = "Mirror Mind — local-first memory and identity for agentic runtimes."
PLUGIN_AUTHOR = "Mirror Mind"

SKILLS_SOURCE_DIR = Path(".claude/skills")
PLUGIN_DIR = Path("plugins/mirror-mind")
SKILL_FILENAME = "SKILL.md"


@dataclass(frozen=True)
class GeneratedFile:
    """A file the generator owns, addressed relative to the repo root."""

    relative_path: Path
    content: str


def read_version(repo_root: Path) -> str:
    """Read the project version from ``pyproject.toml``.

    Deliberately reads the repo's pyproject directly (rather than installed
    package metadata) so the build is deterministic from source.
    """
    pyproject = repo_root / "pyproject.toml"
    for line in pyproject.read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("version ="):
            return line.partition("=")[2].strip().strip('"')
    raise ValueError(f"version not found in {pyproject}")


def build_manifest(version: str) -> dict[str, object]:
    """Build the Claude plugin manifest dict (minimal; no unsupported keys).

    Declares the Mirror MCP server so the canonical package carries it. The
    command follows the installed-``memory`` contract (D5), like the hooks.
    """
    return {
        "name": PLUGIN_NAME,
        "version": version,
        "description": PLUGIN_DESCRIPTION,
        "author": {"name": PLUGIN_AUTHOR},
        "mcpServers": {
            PLUGIN_NAME: {"command": "python3", "args": ["-m", "memory", "mcp"]},
        },
    }


def manifest_json(version: str) -> str:
    """Render the manifest as deterministic JSON text."""
    return json.dumps(build_manifest(version), indent=2, ensure_ascii=False) + "\n"


def _find_skill_markdown(skill_dir: Path) -> Path | None:
    """Return the skill markdown file, matching ``skill.md`` case-insensitively.

    Matching case-insensitively makes the generator robust on both
    case-sensitive and case-insensitive filesystems, including older checkouts
    that may still contain lowercase ``skill.md`` files.
    """
    for entry in sorted(skill_dir.iterdir()):
        if entry.is_file() and entry.name.lower() == SKILL_FILENAME.lower():
            return entry
    return None


def discover_skill_sources(repo_root: Path) -> list[tuple[str, Path]]:
    """Return ``(skill_dir_name, source_markdown_path)`` for each Claude skill."""
    base = repo_root / SKILLS_SOURCE_DIR
    sources: list[tuple[str, Path]] = []
    for child in sorted(base.iterdir()):
        if not child.is_dir():
            continue
        markdown = _find_skill_markdown(child)
        if markdown is None:
            continue
        sources.append((child.name, markdown))
    return sources


def plan_generated_files(repo_root: Path) -> list[GeneratedFile]:
    """Compute every file the generator owns, without touching the filesystem."""
    version = read_version(repo_root)
    files: list[GeneratedFile] = [
        GeneratedFile(PLUGIN_DIR / ".claude-plugin" / "plugin.json", manifest_json(version))
    ]
    for name, markdown in discover_skill_sources(repo_root):
        files.append(
            GeneratedFile(
                PLUGIN_DIR / "skills" / name / SKILL_FILENAME,
                markdown.read_text(encoding="utf-8"),
            )
        )
    return files


def _generated_skill_files(repo_root: Path) -> list[Path]:
    skills_root = repo_root / PLUGIN_DIR / "skills"
    if not skills_root.exists():
        return []
    return sorted(skills_root.glob(f"*/{SKILL_FILENAME}"))


def materialize(repo_root: Path, *, write: bool) -> list[str]:
    """Write the generated plugin files, or report drift when ``write=False``.

    Returns a list of human-readable drift descriptions. In check mode the list
    is the assertion target (empty == in sync). In write mode the list is empty
    and the files are written; stale generated skills are removed.
    """
    desired = plan_generated_files(repo_root)
    desired_paths = {gf.relative_path for gf in desired}
    problems: list[str] = []

    for generated in desired:
        target = repo_root / generated.relative_path
        if write:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(generated.content, encoding="utf-8")
        elif not target.exists():
            problems.append(f"missing: {generated.relative_path}")
        elif target.read_text(encoding="utf-8") != generated.content:
            problems.append(f"out of date: {generated.relative_path}")

    for existing in _generated_skill_files(repo_root):
        relative = existing.relative_to(repo_root)
        if relative in desired_paths:
            continue
        if write:
            for leftover in sorted(existing.parent.iterdir()):
                leftover.unlink()
            existing.parent.rmdir()
        else:
            problems.append(f"stale: {relative}")

    return problems
