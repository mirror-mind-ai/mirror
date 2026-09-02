"""Deterministic compiler for Ariad's public Operational Journey projection."""

from __future__ import annotations

import hashlib
import re
import uuid
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal, NoReturn

from memory.builder.roadmap_grammar import HEADING_RE, STATUS_RE, parse_markdown_link
from memory.builder.story_paths import StoryPackageAmbiguityError, resolve_story_directory
from memory.journey_projections.errors import ProjectionError, ProjectionErrorCode
from memory.journey_projections.models import (
    ProjectionInspection,
    ProjectionPublication,
    validate_identifier,
)
from memory.journey_projections.schemas import validate_projection_document
from memory.journey_projections.serialization import canonical_json_bytes
from memory.journey_projections.service import JourneyProjectionService

_SECTION_RE_TEMPLATE = r"^##\s+{title}\s*$"
_EXPLORATION_TITLE_RE = re.compile(
    r"^#\s+(?:Exploration Handoff|Exploratory Story):\s*(?P<title>.+?)\s*$",
    re.MULTILINE,
)
_STORY_ID_RE = re.compile(r"^-\s*Story id:\s*`(?P<value>[^`]+)`\s*$", re.MULTILINE)
_JOURNEY_RE = re.compile(r"^-\s*Journey:\s*`(?P<value>[^`]+)`\s*$", re.MULTILINE)
_EXPLORATION_STATUS_RE = re.compile(r"^-\s*Status:\s*`(?P<value>[^`]+)`\s*$", re.MULTILINE)
_ATTRACTOR_RE = re.compile(r"^-\s+\*\*(?P<title>.+?)\*\*\s+\(`(?P<status>[^`]+)`\)\s*$")
_EXPERIMENT_RE = re.compile(r"^\*\*(?P<title>.+?)\*\*\s+\(`(?P<status>[^`]+)`\)\s*$")
_ARTIFACTS = (
    ("plan", "plan.md"),
    ("test_guide", "test-guide.md"),
    ("validation", "validation.md"),
    ("review", "review.md"),
    ("coherence", "coherence.md"),
    ("done", "done.md"),
    ("handoff", "handoff.md"),
)

RoadmapStatus = Literal["planned", "in_progress", "blocked", "in_validation", "done"]


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _snapshot_id() -> str:
    return f"op-{uuid.uuid4().hex}"


def normalize_roadmap_status(value: str) -> RoadmapStatus:
    """Map authored status prose into the closed Operational v1 vocabulary."""
    normalized = " ".join(value.lower().replace("_", " ").replace("-", " ").split())
    if any(word in normalized for word in ("done", "closed", "complete", "released")):
        return "done"
    if "validation" in normalized:
        return "in_validation"
    if any(word in normalized for word in ("blocked", "paused")):
        return "blocked"
    if any(word in normalized for word in ("active", "progress", "delivery")):
        return "in_progress"
    return "planned"


@dataclass(frozen=True)
class OperationalRebuild:
    status: Literal["published"]
    publication: ProjectionPublication
    document: Mapping[str, Any]


@dataclass(frozen=True)
class _LinkedTableRecord:
    code: str
    target: str
    values: Mapping[str, str]


class OperationalCompiler:
    """Compile public Ariad documents without inference or side effects."""

    def __init__(
        self,
        *,
        _generated_at_factory: Callable[[], str] = _utc_now,
        _snapshot_id_factory: Callable[[], str] = _snapshot_id,
        _source_revision_override: str | None = None,
    ) -> None:
        # Underscored constructor seams are internal deterministic-test inputs.
        # Production rebuild construction never forwards them.
        self._generated_at_factory = _generated_at_factory
        self._snapshot_id_factory = _snapshot_id_factory
        self._source_revision_override = _source_revision_override

    def compile(
        self,
        project_root: Path,
        journey_id: str,
        *,
        active_work: Mapping[str, Any] | None = None,
        exploratory_stories: list[Mapping[str, Any]] | None = None,
    ) -> dict[str, Any]:
        validate_identifier(journey_id)
        root = self._root(project_root)
        content = {
            "roadmap": {"roots": self._compile_roadmap(root)},
            "activeWork": self._compile_active_work(active_work),
            "exploratoryStories": (
                [dict(story) for story in exploratory_stories]
                if exploratory_stories is not None
                else self._compile_explorations(root, journey_id)
            ),
            "refinementStories": self._compile_refinements(root),
        }
        digest = hashlib.sha256(canonical_json_bytes(content)).hexdigest()
        source_revision = self._source_revision_override or f"sha256:{digest}"
        document = {
            "contractVersion": "1.0",
            "schemaVersion": "1",
            "journeyId": journey_id,
            "altitude": "operational",
            "namespace": "ariad",
            "projection": "operational",
            "snapshotId": self._snapshot_id_factory(),
            "generatedAt": self._generated_at_factory(),
            "producer": {
                "kind": "ariad",
                "id": "ariad-operational-compiler",
                "version": "1.0",
            },
            "sourceRevision": source_revision,
            "sourceSnapshots": [],
            "content": content,
        }
        validate_projection_document(document, domain="operational")
        return document

    def _root(self, project_root: Path) -> Path:
        try:
            root = project_root.expanduser().resolve(strict=True)
        except OSError as exc:
            raise ProjectionError(
                ProjectionErrorCode.UNKNOWN_JOURNEY,
                "Registered Journey root is unavailable.",
            ) from exc
        if not root.is_dir():
            raise ProjectionError(
                ProjectionErrorCode.UNKNOWN_JOURNEY,
                "Registered Journey root is unavailable.",
            )
        return root

    def _compile_roadmap(self, root: Path) -> list[dict[str, Any]]:
        index = root / "docs/project/roadmap/index.md"
        if not index.is_file():
            return []
        text = self._read(index, root)
        rows = [row for row in self._roadmap_table_rows(root, text) if self._node_type(row[0])]
        roots = [row for row in rows if self._node_type(row[0]) == "capability_value"]
        self._require_unique_rows(roots)
        return [self._compile_roadmap_node(root, index, code, target, ()) for code, target in roots]

    def _compile_roadmap_node(
        self,
        root: Path,
        parent_index: Path,
        expected_code: str,
        target: str,
        ancestors: tuple[Path, ...],
    ) -> dict[str, Any]:
        index = self._resolve_roadmap_package(root, parent_index, expected_code, target)
        resolved = index.resolve(strict=True)
        if resolved in ancestors:
            self._source_error()
        text = self._read(index, root)
        heading = HEADING_RE.search(text)
        status = STATUS_RE.search(text)
        if heading is None or status is None or heading.group("code").strip() != expected_code:
            self._source_error()
        node_type = self._node_type(expected_code)
        if node_type is None:
            self._source_error()
        child_rows = [
            row
            for row in self._roadmap_table_rows(root, text)
            if self._node_type(row[0]) is not None
        ]
        self._require_unique_rows(child_rows)
        children = [
            self._compile_roadmap_node(
                root,
                index,
                child_code,
                child_target,
                (*ancestors, resolved),
            )
            for child_code, child_target in child_rows
        ]
        return {
            "id": expected_code,
            "type": node_type,
            "title": heading.group("title").strip(),
            "status": normalize_roadmap_status(status.group("status")),
            "outcome": self._section_text(text, "Outcome"),
            "path": self._relative(index, root),
            "artifacts": self._artifacts(index.parent, root),
            "children": children,
        }

    def _compile_active_work(self, active_work: Mapping[str, Any] | None) -> dict[str, Any] | None:
        if active_work is None:
            return None
        if not isinstance(active_work, Mapping):
            self._source_error()
        required = ("activeItem", "checkpoint", "pendingConfirmation", "status")
        if any(key not in active_work for key in required):
            self._source_error()
        return {key: active_work[key] for key in required}

    def _compile_explorations(self, root: Path, journey_id: str) -> list[dict[str, Any]]:
        exploration_root = root / "docs/project/explorations"
        if not exploration_root.is_dir():
            return []
        stories = [
            story
            for path in sorted(exploration_root.glob("*/index.md"))
            if (story := self._compile_exploration(root, path, journey_id)) is not None
        ]
        ids = [story["id"] for story in stories]
        if len(ids) != len(set(ids)):
            self._source_error()
        return sorted(stories, key=lambda story: story["id"])

    def _compile_exploration(
        self, root: Path, index: Path, journey_id: str
    ) -> dict[str, Any] | None:
        text = self._read(index, root)
        title = _EXPLORATION_TITLE_RE.search(text)
        story_id = _STORY_ID_RE.search(text)
        status = _EXPLORATION_STATUS_RE.search(text)
        journey = _JOURNEY_RE.search(text)
        # Legacy exploration folders without durable story identity are not
        # represented sources. Handoffs owned by another Journey are also
        # outside this exact Journey's projection.
        if story_id is None:
            return None
        if journey is not None and journey.group("value") != journey_id:
            return None
        if title is None or status is None:
            self._source_error()
        story_path = index.parent / "exploratory-story.md"
        summary = ""
        if story_path.is_file():
            summary = self._section_text(self._read(story_path, root), "Narrative Summary")
        handoff_path = index.parent / "handoff-info.md"
        handoff = (
            {"status": "completed", "path": self._relative(handoff_path, root)}
            if handoff_path.is_file()
            else None
        )
        return {
            "id": story_id.group("value"),
            "title": title.group("title").strip(),
            "status": status.group("value"),
            "summary": summary,
            "path": self._relative(index, root),
            "attractors": self._attractors(text),
            "experiments": self._experiments(text),
            "handoff": handoff,
        }

    def _compile_refinements(self, root: Path) -> list[dict[str, Any]]:
        index = root / "docs/project/refinement/index.md"
        if not index.is_file():
            return []
        text = self._read(index, root)
        records = self._linked_table_records(text)
        stories = [record for record in records if record.code.upper().startswith("RS")]
        global_changes = [record for record in records if record.code.upper().startswith("CR")]
        self._require_unique_records(stories)
        self._require_unique_records(global_changes)
        return [self._compile_refinement(root, index, record, global_changes) for record in stories]

    def _compile_refinement(
        self,
        root: Path,
        parent: Path,
        record: _LinkedTableRecord,
        global_changes: list[_LinkedTableRecord],
    ) -> dict[str, Any]:
        index = self._resolve_link(root, parent, record.target)
        text = self._read(index, root)
        heading = HEADING_RE.search(text)
        if heading is None or heading.group("code").strip() != record.code:
            self._source_error()
        status = self._record_value(record, "status")
        if not status:
            self._source_error()
        global_story_changes = [
            change
            for change in global_changes
            if self._record_value(change, "rs", "refinement story") == record.code
        ]
        if global_story_changes:
            changes = [(change, parent) for change in global_story_changes]
        else:
            local_changes = [
                child
                for child in self._linked_table_records(text)
                if child.code.upper().startswith("CR")
            ]
            self._require_unique_records(local_changes)
            changes = [(change, index) for change in local_changes]
        return {
            "id": record.code,
            "title": heading.group("title").strip(),
            "status": self._public_status(status),
            "path": self._relative(index, root),
            "changeRequests": [
                self._compile_change_request(root, change_parent, child)
                for child, change_parent in changes
            ],
        }

    def _compile_change_request(
        self, root: Path, parent: Path, record: _LinkedTableRecord
    ) -> dict[str, Any]:
        index = self._resolve_link(root, parent, record.target)
        text = self._read(index, root)
        heading = HEADING_RE.search(text)
        if heading is None or heading.group("code").strip() != record.code:
            self._source_error()
        status = self._record_value(record, "status")
        if not status:
            self._source_error()
        return {
            "id": record.code,
            "title": heading.group("title").strip(),
            "status": self._public_status(status),
            "path": self._relative(index, root),
        }

    def _read(self, path: Path, root: Path) -> str:
        self._assert_confined(path, root, require_file=True)
        try:
            return path.read_text(encoding="utf-8")
        except (OSError, UnicodeError) as exc:
            raise ProjectionError(
                ProjectionErrorCode.SCHEMA_VALIDATION_FAILED,
                "Durable Ariad source could not be compiled.",
            ) from exc

    def _resolve_roadmap_package(self, root: Path, parent: Path, code: str, target: str) -> Path:
        if target:
            return self._resolve_link(root, parent, target)
        try:
            directory = resolve_story_directory(root, code)
        except StoryPackageAmbiguityError:
            self._source_error()
        if directory is None:
            self._source_error()
        index = directory / "index.md"
        self._assert_confined(index, root, require_file=True)
        return index

    def _resolve_link(self, root: Path, parent: Path, target: str) -> Path:
        raw = target.strip().split("#", 1)[0]
        candidate_target = Path(raw)
        if not raw or candidate_target.is_absolute() or "\\" in raw or ":" in raw:
            raise ProjectionError(
                ProjectionErrorCode.UNSAFE_PROJECTION_PATH,
                "Durable Ariad source reference is outside the registered Journey.",
            )
        candidate = self._confined_candidate(parent.parent / candidate_target, root)
        if candidate.is_dir():
            candidate = candidate / "index.md"
        self._assert_confined(candidate, root, require_file=True)
        return candidate

    def _confined_candidate(self, path: Path, root: Path) -> Path:
        """Canonicalize a source link before deciding whether traversal is safe."""
        try:
            resolved = path.resolve(strict=False)
        except (OSError, RuntimeError) as exc:
            raise ProjectionError(
                ProjectionErrorCode.SCHEMA_VALIDATION_FAILED,
                "Durable Ariad source could not be compiled.",
            ) from exc
        if not resolved.is_relative_to(root):
            raise ProjectionError(
                ProjectionErrorCode.UNSAFE_PROJECTION_PATH,
                "Durable Ariad source reference is outside the registered Journey.",
            )
        return resolved

    def _assert_confined(self, path: Path, root: Path, *, require_file: bool) -> None:
        try:
            resolved = path.resolve(strict=True)
        except (OSError, RuntimeError) as exc:
            raise ProjectionError(
                ProjectionErrorCode.SCHEMA_VALIDATION_FAILED,
                "Durable Ariad source could not be compiled.",
            ) from exc
        if not resolved.is_relative_to(root):
            raise ProjectionError(
                ProjectionErrorCode.UNSAFE_PROJECTION_PATH,
                "Durable Ariad source reference is outside the registered Journey.",
            )
        if require_file and not resolved.is_file():
            self._source_error()

    def _roadmap_table_rows(self, root: Path, text: str) -> list[tuple[str, str]]:
        rows: list[tuple[str, str]] = []
        for record in self._table_records(text, include_unlinked_codes=True):
            if record.target:
                rows.append((record.code, record.target))
                continue
            try:
                directory = resolve_story_directory(root, record.code)
            except StoryPackageAmbiguityError:
                self._source_error()
            if directory is not None:
                rows.append((record.code, ""))
        return rows

    @staticmethod
    def _linked_table_records(text: str) -> list[_LinkedTableRecord]:
        return OperationalCompiler._table_records(text, include_unlinked_codes=False)

    @staticmethod
    def _table_records(text: str, *, include_unlinked_codes: bool) -> list[_LinkedTableRecord]:
        lines = text.splitlines()
        records: list[_LinkedTableRecord] = []
        index = 0
        while index + 1 < len(lines):
            header_line = lines[index].strip()
            separator_line = lines[index + 1].strip()
            if not header_line.startswith("|") or not separator_line.startswith("|"):
                index += 1
                continue
            headers = [cell.strip().lower() for cell in header_line.strip("|").split("|")]
            separators = [cell.strip() for cell in separator_line.strip("|").split("|")]
            if len(headers) != len(separators) or not all(
                re.fullmatch(r":?-{3,}:?", cell) for cell in separators
            ):
                index += 1
                continue
            index += 2
            while index < len(lines) and lines[index].strip().startswith("|"):
                cells = [cell.strip() for cell in lines[index].strip().strip("|").split("|")]
                cells.extend([""] * (len(headers) - len(cells)))
                link = None
                for cell in cells:
                    parsed = parse_markdown_link(cell)
                    if parsed is not None:
                        link = parsed
                        break
                values = {
                    header: OperationalCompiler._strip_link(cells[position])
                    for position, header in enumerate(headers)
                }
                if link is not None:
                    code, target = link[0].strip(), link[1].strip()
                elif include_unlinked_codes and values.get("code"):
                    code, target = values["code"], ""
                else:
                    index += 1
                    continue
                records.append(
                    _LinkedTableRecord(
                        code=code,
                        target=target,
                        values=values,
                    )
                )
                index += 1
        return records

    @staticmethod
    def _strip_link(value: str) -> str:
        parsed = parse_markdown_link(value)
        return parsed[0].strip() if parsed else value.strip()

    @staticmethod
    def _record_value(record: _LinkedTableRecord, *names: str) -> str:
        for name in names:
            value = record.values.get(name)
            if value:
                return value
        return ""

    @staticmethod
    def _require_unique_records(records: list[_LinkedTableRecord]) -> None:
        OperationalCompiler._require_unique_rows(
            [(record.code, record.target) for record in records]
        )

    @staticmethod
    def _require_unique_rows(rows: list[tuple[str, str]]) -> None:
        codes = [code for code, _ in rows]
        targets = [target for _, target in rows if target]
        if len(codes) != len(set(codes)) or len(targets) != len(set(targets)):
            OperationalCompiler._source_error()

    @staticmethod
    def _node_type(code: str) -> str | None:
        upper = code.upper()
        leaf = upper.rsplit(".", 1)[-1]
        if leaf.startswith("TS"):
            return "technical_story"
        if leaf.startswith("US"):
            return "user_story"
        if leaf.startswith("DS") or leaf.startswith("E"):
            return "delivery_story"
        if leaf.startswith("S") and "." in upper:
            return "user_story"
        if upper.startswith("CV") and "." not in upper:
            return "capability_value"
        return None

    @staticmethod
    def _section_text(text: str, title: str) -> str:
        heading = re.compile(_SECTION_RE_TEMPLATE.format(title=re.escape(title)), re.MULTILINE)
        match = heading.search(text)
        if match is None:
            return ""
        start = match.end()
        next_heading = re.search(r"^##\s+", text[start:], re.MULTILINE)
        end = start + next_heading.start() if next_heading else len(text)
        lines = [line.strip() for line in text[start:end].splitlines() if line.strip()]
        return " ".join(lines)

    def _artifacts(self, directory: Path, root: Path) -> dict[str, str]:
        artifacts: dict[str, str] = {}
        for key, filename in _ARTIFACTS:
            candidate = directory / filename
            if candidate.exists():
                self._assert_confined(candidate, root, require_file=True)
                artifacts[key] = self._relative(candidate, root)
        return artifacts

    @staticmethod
    def _relative(path: Path, root: Path) -> str:
        try:
            return path.resolve(strict=True).relative_to(root).as_posix()
        except (OSError, ValueError) as exc:
            raise ProjectionError(
                ProjectionErrorCode.UNSAFE_PROJECTION_PATH,
                "Durable Ariad source reference is outside the registered Journey.",
            ) from exc

    @staticmethod
    def _public_status(value: str) -> str:
        """Preserve canonical exploration/refinement vocabulary without emoji."""
        without_marker = re.sub(r"^[^A-Za-z0-9]+", "", value).strip().lower()
        return "_".join(without_marker.replace("-", " ").split()) or "unknown"

    @staticmethod
    def _attractors(text: str) -> list[dict[str, str]]:
        section = OperationalCompiler._section_raw(text, "Current Attractors")
        lines = section.splitlines()
        result: list[dict[str, str]] = []
        for index, line in enumerate(lines):
            match = _ATTRACTOR_RE.match(line.strip())
            if match is None:
                continue
            description = ""
            if index + 1 < len(lines):
                description = re.sub(r"^-\s*", "", lines[index + 1].strip())
            result.append(
                {
                    "title": match.group("title").strip(),
                    "status": match.group("status").strip(),
                    "description": description,
                }
            )
        return result

    @staticmethod
    def _experiments(text: str) -> list[dict[str, str]]:
        section = OperationalCompiler._section_raw(text, "Current Experiment Proposal")
        lines = section.splitlines()
        for index, line in enumerate(lines):
            match = _EXPERIMENT_RE.match(line.strip())
            if match is None:
                continue
            description_lines = [value.strip() for value in lines[index + 1 :] if value.strip()]
            return [
                {
                    "title": match.group("title").strip(),
                    "status": match.group("status").strip(),
                    "description": " ".join(description_lines),
                }
            ]
        return []

    @staticmethod
    def _section_raw(text: str, title: str) -> str:
        heading = re.compile(_SECTION_RE_TEMPLATE.format(title=re.escape(title)), re.MULTILINE)
        match = heading.search(text)
        if match is None:
            return ""
        start = match.end()
        next_heading = re.search(r"^##\s+", text[start:], re.MULTILINE)
        end = start + next_heading.start() if next_heading else len(text)
        return text[start:end].strip()

    @staticmethod
    def _source_error() -> NoReturn:
        raise ProjectionError(
            ProjectionErrorCode.SCHEMA_VALIDATION_FAILED,
            "Durable Ariad source could not be compiled.",
        )


class AriadOperationalProjectionService:
    """Registered-Journey rebuild façade over compiler and DS2 publication."""

    def __init__(
        self,
        projection_service: JourneyProjectionService,
        *,
        compiler: OperationalCompiler | None = None,
    ) -> None:
        self._projection_service = projection_service
        self._compiler = compiler or OperationalCompiler()

    def compile(
        self,
        journey_id: str,
        *,
        active_work: Mapping[str, Any] | None = None,
        exploratory_stories: list[Mapping[str, Any]] | None = None,
    ) -> dict[str, Any]:
        root = self._projection_service.registered_root(journey_id)
        return self._compiler.compile(
            root,
            journey_id,
            active_work=active_work,
            exploratory_stories=exploratory_stories,
        )

    def inspect(self, journey_id: str) -> ProjectionInspection:
        return self._projection_service.inspect(
            journey_id,
            "ariad",
            "operational",
            domain="operational",
        )

    def publish_compiled(self, document: Mapping[str, Any]) -> ProjectionPublication:
        return self._projection_service.publish(document, domain="operational")

    def rebuild(
        self,
        journey_id: str,
        *,
        active_work: Mapping[str, Any] | None = None,
        exploratory_stories: list[Mapping[str, Any]] | None = None,
    ) -> OperationalRebuild:
        document = self.compile(
            journey_id,
            active_work=active_work,
            exploratory_stories=exploratory_stories,
        )
        publication = self.publish_compiled(document)
        return OperationalRebuild(
            status="published",
            publication=publication,
            document=document,
        )
