"""Read-only documentation browser support for the Mirror web console."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

import markdown

DOC_FILE_NAMES: set[str] = set()
EXCLUDED_DOC_FILE_NAMES = {"AGENTS.md", "CLAUDE.md", "README.md", "REFERENCE.md"}


@dataclass(frozen=True)
class DocEntry:
    path: str
    title: str


@dataclass(frozen=True)
class DocNode:
    name: str
    title: str
    type: str
    path: str | None = None
    children: tuple[DocNode, ...] = ()

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "title": self.title,
            "type": self.type,
            "path": self.path,
            "children": [child.to_dict() for child in self.children],
        }


def repo_root(start: Path | None = None) -> Path:
    """Return the repository root by walking up to pyproject.toml."""
    current = (start or Path.cwd()).resolve()
    for candidate in [current, *current.parents]:
        if (candidate / "pyproject.toml").exists() and (candidate / "src" / "memory").exists():
            return candidate
    raise RuntimeError("Could not locate Mirror repository root")


class DocsBrowser:
    """Read and render documentation files from safe repository doc roots."""

    def __init__(self, root: Path | None = None) -> None:
        self.root = (root or repo_root()).resolve()

    def entries(self) -> list[DocEntry]:
        entries: list[DocEntry] = []
        docs_dir = self.root / "docs"
        if docs_dir.exists():
            for file_path in sorted(docs_dir.rglob("*.md")):
                entries.append(self._entry_for(file_path))

        for name in sorted(DOC_FILE_NAMES):
            file_path = self.root / name
            if file_path.exists():
                entries.append(self._entry_for(file_path))

        return entries

    def tree(self) -> list[DocNode]:
        docs_entries = [entry for entry in self.entries() if entry.path.startswith("docs/")]
        root_entries = [entry for entry in self.entries() if not entry.path.startswith("docs/")]

        nodes = self._nodes_from_entries(docs_entries, strip_prefix="docs/")
        if root_entries:
            nodes.append(
                DocNode(
                    name="root",
                    title="Repository",
                    type="directory",
                    children=tuple(self._file_node(entry) for entry in root_entries),
                )
            )
        return nodes

    def read_markdown(self, relative_path: str) -> str:
        file_path = self._safe_path(relative_path)
        return file_path.read_text(encoding="utf-8")

    def render_html(self, relative_path: str) -> str:
        text = self.read_markdown(relative_path)
        return markdown.markdown(
            text,
            extensions=["fenced_code", "tables", "toc"],
            output_format="html5",
        )

    def _entry_for(self, file_path: Path) -> DocEntry:
        relative = file_path.relative_to(self.root).as_posix()
        return DocEntry(path=relative, title=self._title_for(file_path))

    def _nodes_from_entries(self, entries: list[DocEntry], strip_prefix: str = "") -> list[DocNode]:
        tree: dict[str, object] = {}
        entry_by_path = {entry.path: entry for entry in entries}

        for entry in entries:
            display_path = entry.path.removeprefix(strip_prefix)
            parts = display_path.split("/")
            cursor = tree
            for part in parts:
                cursor = cursor.setdefault(part, {})  # type: ignore[assignment]

        return self._dict_to_nodes(
            tree, prefix=strip_prefix.rstrip("/"), entry_by_path=entry_by_path
        )

    def _dict_to_nodes(
        self,
        tree: dict[str, object],
        prefix: str,
        entry_by_path: dict[str, DocEntry],
    ) -> list[DocNode]:
        nodes: list[DocNode] = []
        for name, value in sorted(
            tree.items(), key=lambda item: self._tree_sort_key(prefix, item[0], item[1])
        ):
            if name == "index.md" and prefix != "docs":
                continue
            path_parts = [part for part in [prefix, name] if part]
            current_path = "/".join(path_parts)
            if isinstance(value, dict) and current_path in entry_by_path:
                nodes.append(self._file_node(entry_by_path[current_path]))
            elif isinstance(value, dict):
                index_path = f"{current_path}/index.md"
                children = tuple(
                    self._dict_to_nodes(value, prefix=current_path, entry_by_path=entry_by_path)
                )
                if index_path in entry_by_path and not children and "/specs/" in current_path:
                    nodes.append(self._file_node(entry_by_path[index_path], name=name))
                else:
                    nodes.append(
                        DocNode(
                            name=name,
                            title=self._directory_title(name),
                            type="directory",
                            path=index_path if index_path in entry_by_path else None,
                            children=children,
                        )
                    )
        return nodes

    def _file_node(self, entry: DocEntry, name: str | None = None) -> DocNode:
        title = "Home" if entry.path == "docs/index.md" else entry.title
        return DocNode(
            name=name or Path(entry.path).name, title=title, type="file", path=entry.path
        )

    def _directory_title(self, name: str) -> str:
        return name.replace("-", " ").replace("_", " ").title()

    def _tree_sort_key(
        self, prefix: str, name: str, value: object
    ) -> tuple[int, int, list[int | str]]:
        if prefix == "docs" and name == "index.md":
            return (0, 0, self._natural_sort_key(name))
        if prefix == "docs/product" and name == "principles.md":
            return (0, 0, self._natural_sort_key(name))
        return (1, 0 if isinstance(value, dict) else 1, self._natural_sort_key(name))

    def _natural_sort_key(self, value: str) -> list[int | str]:
        return [int(part) if part.isdigit() else part.lower() for part in re.split(r"(\d+)", value)]

    def _title_for(self, file_path: Path) -> str:
        try:
            for line in file_path.read_text(encoding="utf-8").splitlines():
                if line.startswith("# "):
                    return line.removeprefix("# ").strip()
        except UnicodeDecodeError:
            pass
        return file_path.name

    def _safe_path(self, relative_path: str) -> Path:
        if not relative_path or relative_path.startswith("/"):
            raise ValueError("Document path must be relative")

        candidate = (self.root / relative_path).resolve()
        if not self._is_allowed(candidate):
            raise ValueError("Document path is outside allowed documentation roots")
        if not candidate.is_file():
            raise FileNotFoundError(relative_path)
        if candidate.suffix != ".md":
            raise ValueError("Only markdown documents can be read")
        return candidate

    def _is_allowed(self, candidate: Path) -> bool:
        docs_dir = (self.root / "docs").resolve()
        if candidate.is_relative_to(docs_dir):
            return True
        return candidate.parent == self.root and candidate.name in DOC_FILE_NAMES
