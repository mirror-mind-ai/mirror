"""Versioned, model-free canonical Journey administration."""

from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from memory.models import Identity
from memory.storage.store import Store

SCHEMA = "mirror.journey-mutation@1.0"
REGISTRY_SCHEMA = "0.2.0"


class JourneyMutationError(ValueError):
    pass


def _metadata(raw: str | None) -> dict[str, Any]:
    try:
        value = json.loads(raw or "{}")
        return value if isinstance(value, dict) else {}
    except (TypeError, json.JSONDecodeError):
        return {}


def _fail(code: str) -> None:
    raise JourneyMutationError(code)


class JourneyAdminService:
    def __init__(self, store: Store) -> None:
        self.store = store

    def export_registry(self) -> dict[str, Any]:
        rows = self.store.journey_rows()
        nodes: dict[str, dict[str, Any]] = {}
        metadata_by_id: dict[str, dict[str, Any]] = {}
        for row in rows:
            meta = _metadata(row["metadata"])
            metadata_by_id[row["key"]] = meta
            content = row["content"] or ""
            title = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
            status = re.search(r"^\*\*Status:\*\*\s*(.+)$", content, re.MULTILINE)
            stage = re.search(r"^\*\*Stage:\*\*\s*(.+)$", content, re.MULTILINE)
            description = re.search(
                r"^## (?:Description|Descrição)\s+(.+?)(?:\n## |\Z)",
                content,
                re.MULTILINE | re.DOTALL,
            )
            node: dict[str, Any] = {
                "id": row["key"],
                "nativeId": row["id"],
                "name": meta.get("display_name")
                or (title.group(1).strip() if title else row["key"]),
                "updatedAt": row["updated_at"],
                "children": [],
            }
            optional = {
                "description": " ".join(description.group(1).split()) if description else "",
                "status": status.group(1).strip() if status else "",
                "stage": stage.group(1).strip() if stage else "",
                "parentId": meta.get("parent_journey"),
                "projectPath": meta.get("project_path"),
                "siblingPosition": meta.get("sibling_position"),
            }
            node.update({key: value for key, value in optional.items() if value not in (None, "")})
            nodes[row["key"]] = node

        children: dict[str, list[str]] = {}
        roots: list[str] = []
        for key in sorted(nodes):
            parent = metadata_by_id[key].get("parent_journey")
            if isinstance(parent, str) and parent in nodes:
                children.setdefault(parent, []).append(key)
            else:
                roots.append(key)

        def order(ids: list[str]) -> list[str]:
            explicit = [
                metadata_by_id[key].get("sibling_position")
                for key in ids
                if "sibling_position" in metadata_by_id[key]
            ]
            if any(
                not isinstance(value, int) or isinstance(value, bool) or value < 0
                for value in explicit
            ) or len(explicit) != len(set(explicit)):
                _fail("malformed_order")
            return sorted(
                ids,
                key=lambda key: (
                    metadata_by_id[key].get("sibling_position")
                    if isinstance(metadata_by_id[key].get("sibling_position"), int)
                    else 2**31,
                    key,
                ),
            )

        visited: set[str] = set()

        def attach(key: str, lineage: tuple[str, ...] = ()) -> dict[str, Any]:
            if key in lineage or len(lineage) > 16:
                _fail("malformed_hierarchy")
            visited.add(key)
            node = dict(nodes[key])
            node["children"] = [
                attach(child, (*lineage, key)) for child in order(children.get(key, []))
            ]
            if not node["children"]:
                node.pop("children")
            return node

        projected_roots = [attach(key) for key in order(roots)]
        if visited != set(nodes):
            _fail("malformed_hierarchy")
        return {
            "schemaVersion": REGISTRY_SCHEMA,
            "source": "mirror",
            "sourceVersion": self.store.journey_source_version(),
            "syncedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "roots": projected_roots,
        }

    def mutate(self, request: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(request, dict) or request.get("schemaVersion") != SCHEMA:
            _fail("unsupported_schema")
        allowed = {"schemaVersion", "requestId", "expectedSourceVersion", "operation", "payload"}
        if set(request) - allowed:
            _fail("unauthorized_field")
        request_id = request.get("requestId")
        expected = request.get("expectedSourceVersion")
        operation = request.get("operation")
        payload = request.get("payload")
        if not isinstance(request_id, str) or not re.fullmatch(
            r"[A-Za-z0-9._:-]{8,120}", request_id
        ):
            _fail("invalid_request_id")
        if not isinstance(expected, str) or len(expected) != 64:
            _fail("stale_source")
        if operation not in {
            "create_journey",
            "set_project_path",
            "clear_project_path",
            "move_journey",
            "delete_journey",
        } or not isinstance(payload, dict):
            _fail("unsupported_operation")
        canonical_request = json.dumps(
            request, ensure_ascii=False, sort_keys=True, separators=(",", ":")
        )
        digest = hashlib.sha256(canonical_request.encode()).hexdigest()
        prior = self.store.get_journey_mutation_receipt(request_id)
        if prior:
            if prior["request_digest"] != digest:
                _fail("idempotency_conflict")
            return {
                "schemaVersion": SCHEMA,
                "receipt": {
                    "requestId": request_id,
                    "operation": prior["operation"],
                    "journeyId": prior["journey_id"],
                    "sourceVersion": prior["source_version"],
                    "resultVersion": prior["result_version"],
                    "idempotent": True,
                },
                "registry": self.export_registry(),
            }

        rows = self.store.journey_rows()
        by_id = {row["key"]: row for row in rows}
        metas = {key: _metadata(row["metadata"]) for key, row in by_id.items()}
        original = {
            key: json.dumps(meta, ensure_ascii=False, sort_keys=True) for key, meta in metas.items()
        }
        create: Identity | None = None
        delete = False
        journey_id = ""

        def exact(fields: set[str]) -> None:
            if set(payload) - fields:
                _fail("unauthorized_field")

        def effective_parent(key: str) -> str | None:
            parent = metas.get(key, {}).get("parent_journey")
            return parent if isinstance(parent, str) and parent in metas else None

        def ordered(parent: str | None, include: str | None = None) -> list[str]:
            ids = [key for key in metas if effective_parent(key) == parent]
            if include and include not in ids:
                ids.append(include)
            return sorted(
                ids,
                key=lambda key: (
                    metas.get(key, {}).get("sibling_position")
                    if isinstance(metas.get(key, {}).get("sibling_position"), int)
                    else 2**31,
                    key,
                ),
            )

        def position_group(parent: str | None, moving: str, position: int) -> None:
            ids = [key for key in ordered(parent, moving) if key != moving]
            if (
                not isinstance(position, int)
                or isinstance(position, bool)
                or position < 0
                or position > len(ids)
            ):
                _fail("invalid_position")
            ids.insert(position, moving)
            for index, key in enumerate(ids):
                metas.setdefault(key, {})["sibling_position"] = index

        if operation == "create_journey":
            exact({"slug", "name", "description", "parentId", "position", "projectPath"})
            slug, name, description = (
                payload.get("slug"),
                payload.get("name"),
                payload.get("description"),
            )
            if (
                not isinstance(slug, str)
                or not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,78}[a-z0-9]", slug)
                or slug in by_id
            ):
                _fail("invalid_or_duplicate_slug")
            if not isinstance(name, str) or not name.strip() or len(name.strip()) > 160:
                _fail("invalid_name")
            if (
                not isinstance(description, str)
                or len(description.strip()) < 20
                or len(description.strip()) > 4000
            ):
                _fail("invalid_description")
            parent = payload.get("parentId") or None
            if parent is not None and (not isinstance(parent, str) or parent not in by_id):
                _fail("unknown_parent")
            journey_id = slug
            metas[slug] = {"display_name": name.strip()}
            if parent:
                metas[slug]["parent_journey"] = parent
            if payload.get("projectPath"):
                metas[slug]["project_path"] = self._canonical_directory(payload["projectPath"])
            position_group(parent, slug, payload.get("position", len(ordered(parent))))
            content = f"# {name.strip()}\n**Status:** active\n**Stage:** Starting\n\n## Description\n\n{description.strip()}\n\n## Current focus\n\nClarify the next concrete movement."
            create = Identity(
                layer="journey",
                key=slug,
                content=content,
                metadata=json.dumps(metas[slug], ensure_ascii=False, sort_keys=True),
            )
        elif operation in {"set_project_path", "clear_project_path"}:
            exact(
                {"journeyId", "projectPath"} if operation == "set_project_path" else {"journeyId"}
            )
            journey_id = payload.get("journeyId")
            if not isinstance(journey_id, str) or journey_id not in by_id:
                _fail("unknown_journey")
            if operation == "set_project_path":
                metas[journey_id]["project_path"] = self._canonical_directory(
                    payload.get("projectPath")
                )
            else:
                metas[journey_id].pop("project_path", None)
        elif operation == "delete_journey":
            exact({"journeyId"})
            journey_id = payload.get("journeyId")
            if not isinstance(journey_id, str) or journey_id not in by_id:
                _fail("unknown_journey")
            delete = True
        else:
            exact({"journeyId", "parentId", "position"})
            journey_id = payload.get("journeyId")
            parent = payload.get("parentId") or None
            if not isinstance(journey_id, str) or journey_id not in by_id:
                _fail("unknown_journey")
            if parent is not None and (not isinstance(parent, str) or parent not in by_id):
                _fail("unknown_parent")
            current = parent
            lineage: set[str] = set()
            while current:
                if current == journey_id or current in lineage:
                    _fail("cycle")
                lineage.add(current)
                current = metas[current].get("parent_journey") or None
            old_parent = effective_parent(journey_id)
            if parent:
                metas[journey_id]["parent_journey"] = parent
            else:
                metas[journey_id].pop("parent_journey", None)
            if old_parent != parent:
                remaining = ordered(old_parent)
                for index, key in enumerate(remaining):
                    metas[key]["sibling_position"] = index
            position_group(parent, journey_id, payload.get("position"))

        updates = {
            key: json.dumps(meta, ensure_ascii=False, sort_keys=True)
            for key, meta in metas.items()
            if key != journey_id or create is None
            if key in original
            and json.dumps(meta, ensure_ascii=False, sort_keys=True) != original[key]
        }
        try:
            result_version, idempotent = self.store.apply_journey_mutation(
                expected_source_version=expected,
                request_id=request_id,
                request_digest=digest,
                operation=operation,
                journey_id=journey_id,
                create=create,
                metadata_updates=updates,
                delete=delete,
            )
        except ValueError as error:
            raise JourneyMutationError(str(error)) from error
        registry = self.export_registry()
        if not idempotent and registry["sourceVersion"] != result_version:
            _fail("read_back_contradiction")
        return {
            "schemaVersion": SCHEMA,
            "receipt": {
                "requestId": request_id,
                "operation": operation,
                "journeyId": journey_id,
                "sourceVersion": expected,
                "resultVersion": result_version,
                "idempotent": idempotent,
            },
            "registry": registry,
        }

    @staticmethod
    def _canonical_directory(value: Any) -> str:
        if not isinstance(value, str) or not value.strip():
            _fail("invalid_path")
        path = Path(value).expanduser()
        if path.is_symlink() or not path.exists() or not path.is_dir():
            _fail("invalid_path")
        return str(path.resolve())
