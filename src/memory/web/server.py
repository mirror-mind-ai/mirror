"""Local read-only web server for the Mirror web console."""

from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from memory import MemoryClient
from memory.cli.common import db_path_from_mirror_home
from memory.config import resolve_mirror_home
from memory.intelligence.scene import generate_scene_synthesis
from memory.web.configuration import build_configuration_overview
from memory.web.docs import DocsBrowser
from memory.web.mirrors import MirrorRegistry
from memory.web.operations import operation_catalog, run_operation, validate_operation_request
from memory.web.preferences import DEFAULT_AVATAR_SYMBOL, VALID_PERSPECTIVES, WebPreferenceStore

STATIC_DIR = Path(__file__).parent / "static"


def _web_path(path: Path | None) -> str | None:
    return path.as_posix() if path is not None else None


class MirrorWebHandler(BaseHTTPRequestHandler):
    browser: DocsBrowser
    mirror_home: Path | None
    db_path: Path | None

    def do_GET(self) -> None:
        parsed = urlparse(self.path)

        if parsed.path == "/api/shell":
            self._send_json(self._shell_payload())
            return

        if parsed.path == "/api/mirrors":
            self._send_json([mirror.to_dict() for mirror in self._mirrors().list_mirrors()])
            return

        if parsed.path == "/api/configuration/overview":
            self._send_json(build_configuration_overview(self.__class__.mirror_home).to_dict())
            return

        if parsed.path == "/api/operations/catalog":
            self._send_json(operation_catalog())
            return

        if parsed.path == "/api/operations/runs":
            query = parse_qs(parsed.query)
            raw_limit = query.get("limit", ["20"])[0]
            try:
                limit = int(raw_limit)
            except ValueError:
                self._send_json({"error": "limit must be an integer"}, status=400)
                return
            with MemoryClient(db_path=self._db_path()) as mem:
                self._send_json([run.to_dict() for run in mem.operation_runs.recent(limit)])
            return

        if parsed.path.startswith("/api/operations/runs/"):
            run_id = parsed.path.removeprefix("/api/operations/runs/")
            if not run_id:
                self._send_json({"error": "Operation run id is required"}, status=400)
                return
            try:
                with MemoryClient(db_path=self._db_path()) as mem:
                    self._send_json(mem.operation_runs.get(run_id).to_dict())
            except ValueError as exc:
                self._send_json({"error": str(exc)}, status=404)
            return

        if parsed.path == "/api/conversations/detail":
            query = parse_qs(parsed.query)
            conversation_id = query.get("id", [""])[0]
            with MemoryClient(db_path=self._db_path()) as mem:
                detail = self._conversation_detail_payload(mem, conversation_id)
            if detail is None:
                self._send_json({"error": "Conversation not found"}, status=404)
                return
            self._send_json(detail)
            return

        if parsed.path == "/api/conversations":
            query = parse_qs(parsed.query)
            try:
                limit = int(query.get("limit", ["200"])[0])
            except ValueError:
                self._send_json({"error": "limit must be an integer"}, status=400)
                return
            with MemoryClient(db_path=self._db_path()) as mem:
                self._send_json(self._conversations_payload(mem, limit=limit))
            return

        if parsed.path == "/api/conversations/unassigned":
            query = parse_qs(parsed.query)
            try:
                limit = int(query.get("limit", ["100"])[0])
            except ValueError:
                self._send_json({"error": "limit must be an integer"}, status=400)
                return
            with MemoryClient(db_path=self._db_path()) as mem:
                self._send_json(self._unassigned_conversations_payload(mem, limit=limit))
            return

        if parsed.path == "/api/surface/atlas":
            with MemoryClient(db_path=self._db_path()) as mem:
                self._send_json(mem.surfaces.atlas_home().to_dict())
            return

        if parsed.path == "/api/surface/workspace":
            query = parse_qs(parsed.query)
            journey_id = query.get("journey", [None])[0]
            with MemoryClient(db_path=self._db_path()) as mem:
                payload = mem.surfaces.workspace_home(journey_id=journey_id).to_dict()
                self._attach_scene_orientation(mem, payload)
                self._send_json(payload)
            return

        if parsed.path == "/api/surface/object":
            query = parse_qs(parsed.query)
            kind = query.get("kind", [""])[0]
            object_id = query.get("id", [""])[0]
            with MemoryClient(db_path=self._db_path()) as mem:
                detail = mem.surfaces.object_detail(kind, object_id)
            if detail is None:
                self._send_json({"error": "Object not found"}, status=404)
                return
            self._send_json(detail.to_dict())
            return

        if parsed.path == "/api/surface/memories":
            query = parse_qs(parsed.query)
            category = query.get("category", [""])[0]
            with MemoryClient(db_path=self._db_path()) as mem:
                self._send_json(mem.surfaces.memory_category(category).to_dict())
            return

        if parsed.path == "/api/surface/search":
            query = parse_qs(parsed.query)
            search_query = query.get("q", [""])[0]
            perspective = query.get("perspective", [None])[0]
            with MemoryClient(db_path=self._db_path()) as mem:
                self._send_json(mem.surfaces.search(search_query, perspective).to_dict())
            return

        if parsed.path == "/api/docs/tree":
            self._send_json([node.to_dict() for node in self.browser.tree()])
            return

        if parsed.path == "/api/docs/file":
            query = parse_qs(parsed.query)
            doc_path = query.get("path", [""])[0]
            try:
                self._send_json(
                    {
                        "path": doc_path,
                        "markdown": self.browser.read_markdown(doc_path),
                        "html": self.browser.render_html(doc_path),
                    }
                )
            except (FileNotFoundError, ValueError) as exc:
                self._send_json({"error": str(exc)}, status=404)
            return

        self._send_static(parsed.path)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/mirrors/select":
            self._select_mirror()
            return
        if parsed.path == "/api/preferences/default-perspective":
            self._write_default_perspective()
            return
        if parsed.path == "/api/preferences/profile":
            self._write_profile()
            return
        if parsed.path == "/api/preferences/theme":
            self._write_theme()
            return
        if parsed.path == "/api/journeys/metadata":
            self._write_journey_metadata()
            return
        if parsed.path == "/api/journeys/draft":
            self._draft_journey()
            return
        if parsed.path == "/api/journeys":
            self._create_journey()
            return
        if parsed.path == "/api/surface/workspace/scene-synthesis":
            self._generate_scene_synthesis()
            return
        if parsed.path == "/api/conversations/title":
            self._write_conversation_title()
            return
        if parsed.path == "/api/conversations/title-suggestion":
            self._suggest_conversation_title()
            return
        if parsed.path == "/api/conversations/summary":
            self._write_conversation_summary()
            return
        if parsed.path == "/api/conversations/tags":
            self._write_conversation_tags()
            return
        if parsed.path == "/api/conversations/journey":
            self._write_conversation_journey()
            return
        if parsed.path == "/api/conversations/journey-bulk":
            self._write_conversation_journey_bulk()
            return
        if parsed.path == "/api/conversations/delete":
            self._delete_conversations()
            return
        if parsed.path == "/api/conversations/delete-turn":
            self._delete_conversation_turn()
            return
        if parsed.path == "/api/conversations/summary-suggestion":
            self._suggest_conversation_summary()
            return
        if parsed.path == "/api/conversations/metadata-lifecycle-preview":
            self._preview_conversation_metadata_lifecycle()
            return
        if parsed.path == "/api/conversations/metadata-lifecycle-apply":
            self._apply_conversation_metadata_lifecycle()
            return
        if parsed.path == "/api/operations/run":
            self._run_operation()
            return
        if parsed.path.startswith("/api/operations/runs/") and parsed.path.endswith("/cancel"):
            run_id = parsed.path.removeprefix("/api/operations/runs/").removesuffix("/cancel")
            self._cancel_operation_run(run_id)
            return
        if parsed.path.startswith("/api/operations/runs/") and parsed.path.endswith("/approve"):
            run_id = parsed.path.removeprefix("/api/operations/runs/").removesuffix("/approve")
            self._approve_operation_run(run_id)
            return
        self._send_json({"error": "Not found"}, status=404)

    def log_message(self, format: str, *args: object) -> None:
        return

    def _mirrors(self) -> MirrorRegistry:
        return MirrorRegistry(self.__class__.mirror_home)

    def _run_operation(self) -> None:
        try:
            payload = self._read_json_body()
            allowed_keys = {"operationId", "parameters"}
            extra_keys = set(payload) - allowed_keys
            if extra_keys:
                raise ValueError(
                    f"Unsupported operation request fields: {', '.join(sorted(extra_keys))}"
                )
            operation_id = payload.get("operationId")
            if not isinstance(operation_id, str) or not operation_id:
                raise ValueError("operationId is required")
            parameters = payload.get("parameters", {})
            if not isinstance(parameters, dict):
                raise ValueError("parameters must be an object")
            parsed_parameters = validate_operation_request(operation_id, parameters)
            with MemoryClient(db_path=self._db_path()) as mem:
                run = mem.operation_runs.queue(operation_id, parsed_parameters)
                if _operation_requires_approval(operation_id, parsed_parameters):
                    run = mem.operation_runs.require_approval(
                        run.id,
                        reason="Approval required before persistent changes.",
                    )
                else:
                    self._start_operation_worker(run.id, operation_id, parsed_parameters)
        except (json.JSONDecodeError, ValueError, TypeError) as exc:
            self._send_json({"error": str(exc)}, status=400)
            return

        self._send_json(
            {
                "runId": run.id,
                "operationId": operation_id,
                "status": run.status,
                "outcome": run.outcome,
                "summary": ["Operation queued for asynchronous execution."],
                "result": None,
            },
            status=202,
        )

    def _approve_operation_run(self, run_id: str) -> None:
        try:
            if not run_id:
                raise ValueError("Operation run id is required")
            with MemoryClient(db_path=self._db_path()) as mem:
                run = mem.operation_runs.approve(run_id)
            self._start_operation_worker(run.id, run.operation_id, run.parameters)
        except ValueError as exc:
            self._send_json({"error": str(exc)}, status=400)
            return
        self._send_json(run.to_dict())

    def _cancel_operation_run(self, run_id: str) -> None:
        try:
            if not run_id:
                raise ValueError("Operation run id is required")
            with MemoryClient(db_path=self._db_path()) as mem:
                run = mem.operation_runs.request_cancel(run_id)
        except ValueError as exc:
            self._send_json({"error": str(exc)}, status=400)
            return
        self._send_json(run.to_dict())

    def _start_operation_worker(
        self, run_id: str, operation_id: str, parameters: dict[str, object]
    ) -> None:
        db_path = self._db_path()
        mirror_home = self.__class__.mirror_home
        root = self.browser.root
        thread = threading.Thread(
            target=_execute_operation_run,
            kwargs={
                "run_id": run_id,
                "operation_id": operation_id,
                "parameters": parameters,
                "db_path": db_path,
                "mirror_home": mirror_home,
                "root": root,
            },
            daemon=True,
        )
        thread.start()

    def _preferences(self) -> WebPreferenceStore:
        return WebPreferenceStore(self.__class__.mirror_home)

    def _db_path(self) -> Path | None:
        mirror_home = self.__class__.mirror_home
        if mirror_home is None:
            return self.__class__.db_path
        return db_path_from_mirror_home(mirror_home)

    def _shell_payload(self) -> dict[str, object]:
        mirrors = self._mirrors()
        preference = self._preferences().read()
        return {
            "mirror": {
                "name": mirrors.current_name(),
                "path": _web_path(mirrors.mirror_home),
            },
            "profile": preference.profile.to_dict(),
            "theme": preference.theme,
            "preferencesPath": _web_path(self._preferences().path),
            "mirrors": [mirror.to_dict() for mirror in mirrors.list_mirrors()],
            "defaultPerspective": preference.default_perspective,
            "validPerspectives": list(VALID_PERSPECTIVES),
            "docsAvailable": True,
            "warning": preference.warning,
        }

    def _select_mirror(self) -> None:
        try:
            payload = self._read_json_body()
            name = payload.get("name")
            if not isinstance(name, str):
                raise ValueError("Mirror name is required.")
            mirror_home = self._mirrors().selectable_home(name)
            if mirror_home is None:
                raise ValueError("Mirror must be one of the discovered local Mirrors.")
        except (json.JSONDecodeError, ValueError, TypeError) as exc:
            self._send_json({"error": str(exc)}, status=400)
            return

        self.__class__.mirror_home = mirror_home
        self._send_json(self._shell_payload())

    def _write_default_perspective(self) -> None:
        try:
            payload = self._read_json_body()
            perspective = payload.get("defaultPerspective")
            preference = self._preferences().write_default_perspective(perspective)
        except (json.JSONDecodeError, ValueError, TypeError) as exc:
            self._send_json({"error": str(exc)}, status=400)
            return
        except OSError as exc:
            self._send_json(
                {"error": f"Default perspective preference could not be written: {exc}"}, status=500
            )
            return

        self._send_json(
            {
                "defaultPerspective": preference.default_perspective,
                "profile": preference.profile.to_dict(),
                "warning": preference.warning,
            }
        )

    def _generate_scene_synthesis(self) -> None:
        try:
            payload = self._read_json_body()
            journey_id = payload.get("journeyId")
            if journey_id is not None and not isinstance(journey_id, str):
                raise ValueError("journeyId must be a string or null")
            with MemoryClient(db_path=self._db_path()) as mem:
                scene = mem.surfaces.workspace_home(journey_id=journey_id or None).scene or {}
                bounded_scene = dict(scene)
                bounded_scene.pop("synthesis", None)
                source_hash = _scene_source_hash(bounded_scene)
                orientation = generate_scene_synthesis(bounded_scene)
                saved = self._save_scene_orientation(
                    mem,
                    scope=_scene_orientation_scope(journey_id),
                    source_hash=source_hash,
                    orientation=orientation,
                )
        except (json.JSONDecodeError, ValueError, TypeError) as exc:
            self._send_json({"error": str(exc)}, status=400)
            return

        self._send_json(
            {
                "journeyId": journey_id,
                "synthesis": saved,
            }
        )

    def _attach_scene_orientation(self, mem: MemoryClient, payload: dict[str, object]) -> None:
        scene = payload.get("scene")
        if not isinstance(scene, dict):
            return
        selected_id = scene.get("selectedJourneyId")
        journey_id = selected_id if isinstance(selected_id, str) and selected_id else None
        bounded_scene = dict(scene)
        bounded_scene.pop("synthesis", None)
        source_hash = _scene_source_hash(bounded_scene)
        stored = _load_scene_orientation(mem, _scene_orientation_scope(journey_id))
        if stored:
            stored_hash = stored.get("sourceHash")
            stored["state"] = "generated" if stored_hash == source_hash else "stale"
            stored["outdated"] = stored_hash != source_hash
            scene["synthesis"] = stored
            return
        scene["synthesis"] = {
            "state": "missing",
            "outdated": False,
            "text": "No orientation has been generated for this scene yet.",
            "orientation": {
                "title": "No orientation yet",
                "summary": "Generate an orientation when you want Mirror to read the current scene.",
                "signals": [],
                "next": "Generate orientation.",
            },
        }

    def _save_scene_orientation(
        self,
        mem: MemoryClient,
        *,
        scope: str,
        source_hash: str,
        orientation: dict[str, object],
    ) -> dict[str, object]:
        normalized = _normalize_scene_orientation(orientation)
        now = _utc_now()
        payload = {
            "state": "generated" if normalized else "unavailable",
            "outdated": False,
            "sourceHash": source_hash,
            "createdAt": now,
            "updatedAt": now,
            "orientation": normalized,
            "text": normalized.get("summary") or "Scene orientation is unavailable right now.",
        }
        mem.identity.set_identity(
            "scene_orientation",
            scope,
            json.dumps(payload, ensure_ascii=False),
            metadata=json.dumps({"source_hash": source_hash, "scope": scope}, ensure_ascii=False),
        )
        return payload

    def _write_journey_metadata(self) -> None:
        try:
            payload = self._read_json_body()
            journey_id = payload.get("journeyId")
            if not isinstance(journey_id, str) or not journey_id:
                raise ValueError("journeyId is required")
            title = payload.get("title")
            status = payload.get("status")
            fields = {
                "project_path": payload.get("projectPath", ""),
                "sync_file": payload.get("syncFile", ""),
                "icon": payload.get("icon", ""),
                "color": payload.get("color", ""),
                "parent_journey": payload.get("parentJourney", ""),
            }
            if title is not None and not isinstance(title, str):
                raise ValueError("title must be a string")
            if status is not None and not isinstance(status, str):
                raise ValueError("status must be a string")
            if not all(isinstance(value, str) for value in fields.values()):
                raise ValueError("Journey metadata fields must be strings")
            with MemoryClient(db_path=self._db_path()) as mem:
                mem.journeys.update_identity_fields(
                    journey_id,
                    title=title,
                    status=status,
                )
                metadata = mem.journeys.update_metadata_fields(journey_id, fields)
        except (json.JSONDecodeError, ValueError, TypeError) as exc:
            self._send_json({"error": str(exc)}, status=400)
            return

        self._send_json({"journeyId": journey_id, "metadata": metadata})

    def _draft_journey(self) -> None:
        try:
            payload = self._read_json_body()
            description = payload.get("description")
            name = payload.get("name")
            slug = payload.get("slug")
            status = payload.get("status", "active")
            stage = payload.get("stage")
            current_focus = payload.get("currentFocus")
            if not isinstance(description, str):
                raise ValueError("description is required")
            for field_name, value in {
                "name": name,
                "slug": slug,
                "status": status,
                "stage": stage,
                "currentFocus": current_focus,
            }.items():
                if value is not None and not isinstance(value, str):
                    raise ValueError(f"{field_name} must be a string")
            with MemoryClient(db_path=self._db_path()) as mem:
                draft = mem.journeys.draft_journey(
                    description=description,
                    name=name,
                    slug=slug,
                    status=status,
                    stage=stage,
                    current_focus=current_focus,
                )
        except (json.JSONDecodeError, ValueError, TypeError) as exc:
            self._send_json({"error": str(exc)}, status=400)
            return

        self._send_json(draft)

    def _create_journey(self) -> None:
        try:
            payload = self._read_json_body()
            slug = payload.get("slug")
            content = payload.get("content")
            if not isinstance(slug, str):
                raise ValueError("slug is required")
            if not isinstance(content, str):
                raise ValueError("content is required")
            fields = {
                "project_path": payload.get("projectPath", ""),
                "sync_file": payload.get("syncFile", ""),
                "icon": payload.get("icon", ""),
                "color": payload.get("color", ""),
                "parent_journey": payload.get("parentJourney", ""),
            }
            if not all(isinstance(value, str) for value in fields.values()):
                raise ValueError("Journey metadata fields must be strings")
            with MemoryClient(db_path=self._db_path()) as mem:
                journey = mem.journeys.create_journey(slug=slug, content=content, **fields)
        except (json.JSONDecodeError, ValueError, TypeError) as exc:
            self._send_json({"error": str(exc)}, status=400)
            return

        self._send_json({"journeyId": journey.key, "content": journey.content})

    def _suggest_conversation_title(self) -> None:
        try:
            payload = self._read_json_body()
            conversation_id = payload.get("conversationId")
            if not isinstance(conversation_id, str):
                raise ValueError("conversationId is required")
            with MemoryClient(db_path=self._db_path()) as mem:
                suggestion = mem.conversations.suggest_title(conversation_id)
        except (json.JSONDecodeError, ValueError, TypeError) as exc:
            self._send_json({"error": str(exc)}, status=400)
            return

        self._send_json({"conversationId": conversation_id, "suggestedTitle": suggestion})

    def _write_conversation_title(self) -> None:
        try:
            payload = self._read_json_body()
            conversation_id = payload.get("conversationId")
            title = payload.get("title")
            if not isinstance(conversation_id, str):
                raise ValueError("conversationId is required")
            if not isinstance(title, str):
                raise ValueError("title must be a string")
            with MemoryClient(db_path=self._db_path()) as mem:
                conversation = mem.conversations.update_title(conversation_id, title)
                detail = self._conversation_detail_payload(mem, conversation.id)
        except (json.JSONDecodeError, ValueError, TypeError) as exc:
            self._send_json({"error": str(exc)}, status=400)
            return

        self._send_json(detail)

    def _suggest_conversation_summary(self) -> None:
        try:
            payload = self._read_json_body()
            conversation_id = payload.get("conversationId")
            if not isinstance(conversation_id, str):
                raise ValueError("conversationId is required")
            with MemoryClient(db_path=self._db_path()) as mem:
                suggestion = mem.conversations.suggest_summary(conversation_id)
        except (json.JSONDecodeError, ValueError, TypeError) as exc:
            self._send_json({"error": str(exc)}, status=400)
            return

        self._send_json({"conversationId": conversation_id, "suggestedSummary": suggestion})

    def _write_conversation_summary(self) -> None:
        try:
            payload = self._read_json_body()
            conversation_id = payload.get("conversationId")
            summary = payload.get("summary")
            if not isinstance(conversation_id, str):
                raise ValueError("conversationId is required")
            if not isinstance(summary, str):
                raise ValueError("summary must be a string")
            with MemoryClient(db_path=self._db_path()) as mem:
                conversation = mem.conversations.update_summary(conversation_id, summary)
                detail = self._conversation_detail_payload(mem, conversation.id)
        except (json.JSONDecodeError, ValueError, TypeError) as exc:
            self._send_json({"error": str(exc)}, status=400)
            return

        self._send_json(detail)

    def _write_conversation_tags(self) -> None:
        try:
            payload = self._read_json_body()
            conversation_id = payload.get("conversationId")
            tags = payload.get("tags")
            if not isinstance(conversation_id, str):
                raise ValueError("conversationId is required")
            if not isinstance(tags, str):
                raise ValueError("tags must be a string")
            with MemoryClient(db_path=self._db_path()) as mem:
                conversation = mem.conversations.update_tags(conversation_id, tags)
                detail = self._conversation_detail_payload(mem, conversation.id)
        except (json.JSONDecodeError, ValueError, TypeError) as exc:
            self._send_json({"error": str(exc)}, status=400)
            return

        self._send_json(detail)

    def _write_conversation_journey(self) -> None:
        try:
            payload = self._read_json_body()
            conversation_id = payload.get("conversationId")
            journey = payload.get("journey")
            if not isinstance(conversation_id, str):
                raise ValueError("conversationId is required")
            if journey is not None and not isinstance(journey, str):
                raise ValueError("journey must be a string or null")
            normalized_journey = journey.strip() if isinstance(journey, str) else None
            if normalized_journey == "":
                normalized_journey = None
            with MemoryClient(db_path=self._db_path()) as mem:
                conversation = mem.conversations.find_by_id_prefix(conversation_id)
                if conversation is None:
                    raise ValueError(f"Conversation '{conversation_id}' not found")
                if normalized_journey is not None:
                    known_journeys = {item["id"] for item in _journey_options(mem)}
                    if normalized_journey not in known_journeys:
                        raise ValueError(f"Journey '{normalized_journey}' not found")
                mem.store.update_conversation(conversation.id, journey=normalized_journey)
                detail = self._conversation_detail_payload(mem, conversation.id)
        except (json.JSONDecodeError, ValueError, TypeError) as exc:
            self._send_json({"error": str(exc)}, status=400)
            return

        self._send_json(detail)

    def _write_conversation_journey_bulk(self) -> None:
        try:
            payload = self._read_json_body()
            conversation_ids = payload.get("conversationIds")
            journey = payload.get("journey")
            if not isinstance(conversation_ids, list) or not conversation_ids:
                raise ValueError("conversationIds must be a non-empty list")
            if not all(isinstance(item, str) and item for item in conversation_ids):
                raise ValueError("conversationIds must contain conversation ids")
            if not isinstance(journey, str) or not journey.strip():
                raise ValueError("journey is required")
            normalized_journey = journey.strip()
            with MemoryClient(db_path=self._db_path()) as mem:
                known_journeys = {item["id"] for item in _journey_options(mem)}
                if normalized_journey not in known_journeys:
                    raise ValueError(f"Journey '{normalized_journey}' not found")
                updated: list[str] = []
                for conversation_id in conversation_ids:
                    conversation = mem.conversations.find_by_id_prefix(conversation_id)
                    if conversation is None:
                        raise ValueError(f"Conversation '{conversation_id}' not found")
                    mem.store.update_conversation(conversation.id, journey=normalized_journey)
                    updated.append(conversation.id)
        except (json.JSONDecodeError, ValueError, TypeError) as exc:
            self._send_json({"error": str(exc)}, status=400)
            return

        self._send_json(
            {
                "journey": normalized_journey,
                "updatedCount": len(updated),
                "conversationIds": updated,
            }
        )

    def _delete_conversations(self) -> None:
        try:
            payload = self._read_json_body()
            conversation_ids = payload.get("conversationIds")
            if not isinstance(conversation_ids, list) or not conversation_ids:
                raise ValueError("conversationIds must be a non-empty list")
            if not all(isinstance(item, str) and item for item in conversation_ids):
                raise ValueError("conversationIds must contain conversation ids")
            with MemoryClient(db_path=self._db_path()) as mem:
                deleted = mem.conversations.delete_conversations(conversation_ids)
        except (json.JSONDecodeError, ValueError, TypeError) as exc:
            self._send_json({"error": str(exc)}, status=400)
            return

        self._send_json({"deletedCount": len(deleted), "conversationIds": deleted})

    def _delete_conversation_turn(self) -> None:
        try:
            payload = self._read_json_body()
            conversation_id = payload.get("conversationId")
            user_message_id = payload.get("userMessageId")
            if not isinstance(conversation_id, str) or not conversation_id:
                raise ValueError("conversationId is required")
            if not isinstance(user_message_id, str) or not user_message_id:
                raise ValueError("userMessageId is required")
            with MemoryClient(db_path=self._db_path()) as mem:
                deleted = mem.conversations.delete_turn(conversation_id, user_message_id)
                detail = self._conversation_detail_payload(mem, conversation_id)
        except (json.JSONDecodeError, ValueError, TypeError) as exc:
            self._send_json({"error": str(exc)}, status=400)
            return

        self._send_json(
            {"deletedCount": len(deleted), "messageIds": deleted, "conversation": detail}
        )

    def _preview_conversation_metadata_lifecycle(self) -> None:
        try:
            payload = self._read_json_body()
            conversation_id = payload.get("conversationId")
            if not isinstance(conversation_id, str):
                raise ValueError("conversationId is required")
            with MemoryClient(db_path=self._db_path()) as mem:
                report = mem.conversations.dry_run_metadata_lifecycle(conversation_id)
        except (json.JSONDecodeError, ValueError, TypeError) as exc:
            self._send_json({"error": str(exc)}, status=400)
            return

        self._send_json(report)

    def _apply_conversation_metadata_lifecycle(self) -> None:
        try:
            payload = self._read_json_body()
            conversation_id = payload.get("conversationId")
            if not isinstance(conversation_id, str):
                raise ValueError("conversationId is required")
            with MemoryClient(db_path=self._db_path()) as mem:
                report = mem.conversations.apply_generated_metadata_lifecycle(
                    conversation_id,
                    source="web_metadata_maintenance",
                )
                detail = self._conversation_detail_payload(mem, report["conversation_id"])
        except (json.JSONDecodeError, ValueError, TypeError) as exc:
            self._send_json({"error": str(exc)}, status=400)
            return

        self._send_json({"report": report, "conversation": detail})

    def _conversation_detail_payload(
        self, mem: MemoryClient, conversation_id: str
    ) -> dict[str, object] | None:
        if not conversation_id:
            return None
        conversation = mem.store.get_conversation(conversation_id)
        if conversation is None:
            conversation = mem.conversations.find_by_id_prefix(conversation_id)
        if conversation is None:
            return None
        messages = mem.store.get_messages(conversation.id)
        turn_ids = _conversation_turn_ids(messages)
        return {
            "id": conversation.id,
            "title": conversation.title or conversation.id[:8],
            "rawTitle": conversation.title,
            "description": conversation.summary or f"{len(messages)} stored messages",
            "startedAt": conversation.started_at,
            "endedAt": conversation.ended_at,
            "status": "ended" if conversation.ended_at else "open",
            "interface": conversation.interface,
            "persona": conversation.persona,
            "journey": conversation.journey,
            "summary": conversation.summary,
            "tags": _conversation_tags(conversation.tags),
            "messageCount": len(messages),
            "journeys": _journey_options(mem),
            "messages": [
                {
                    "id": message.id,
                    "role": message.role,
                    "content": message.content,
                    "createdAt": message.created_at,
                    "tokenCount": message.token_count,
                    "turnId": turn_ids.get(message.id),
                    "turnDeletable": message.role == "user"
                    and turn_ids.get(message.id) is not None,
                }
                for message in messages
            ],
        }

    def _conversations_payload(self, mem: MemoryClient, *, limit: int = 200) -> dict[str, object]:
        bounded_limit = max(1, min(limit, 500))
        summaries = mem.conversations.list_recent(limit=bounded_limit)
        journey_options = _journey_options(mem)
        journey_names = {journey["id"]: journey["name"] for journey in journey_options}
        return {
            "title": "Conversations",
            "description": "Recent conversations across all journeys.",
            "count": len(summaries),
            "limit": bounded_limit,
            "journeys": journey_options,
            "cards": [
                {
                    "id": summary.id,
                    "kind": "conversation",
                    "title": summary.title or summary.id[:8],
                    "description": f"{summary.message_count} stored messages",
                    "status": summary.journey or "unassigned",
                    "metadata": {
                        "started_at": summary.started_at,
                        "message_count": summary.message_count,
                        "journey": summary.journey,
                        "journey_name": journey_names.get(summary.journey or "", "Unassigned"),
                        "persona": summary.persona,
                    },
                }
                for summary in summaries
            ],
        }

    def _unassigned_conversations_payload(
        self, mem: MemoryClient, *, limit: int = 100
    ) -> dict[str, object]:
        bounded_limit = max(1, min(limit, 500))
        rows = mem.store.conn.execute(
            """
            SELECT c.id, c.title, c.summary, c.started_at, c.ended_at,
                   c.interface, c.persona, c.journey,
                   COUNT(m.id) AS message_count
              FROM conversations c
              LEFT JOIN messages m ON m.conversation_id = c.id
             WHERE c.journey IS NULL OR c.journey = ''
             GROUP BY c.id
             ORDER BY c.started_at DESC
             LIMIT ?
            """,
            (bounded_limit,),
        ).fetchall()
        return {
            "title": "Unassigned conversations",
            "description": "Conversations without a journey association.",
            "count": len(rows),
            "limit": bounded_limit,
            "journeys": _journey_options(mem),
            "cards": [
                {
                    "id": row["id"],
                    "kind": "conversation",
                    "title": row["title"] or row["id"][:8],
                    "description": row["summary"] or f"{row['message_count']} stored messages",
                    "status": "ended" if row["ended_at"] else "open",
                    "metadata": {
                        "started_at": row["started_at"],
                        "message_count": row["message_count"],
                        "interface": row["interface"],
                        "persona": row["persona"],
                        "journey": row["journey"],
                    },
                }
                for row in rows
            ],
        }

    def _write_theme(self) -> None:
        try:
            payload = self._read_json_body()
            theme = payload.get("theme")
            if not isinstance(theme, str):
                raise ValueError("theme must be a string")
            preference = self._preferences().write_theme(theme)
        except (json.JSONDecodeError, ValueError, TypeError) as exc:
            self._send_json({"error": str(exc)}, status=400)
            return
        except OSError as exc:
            self._send_json({"error": f"Theme preference could not be written: {exc}"}, status=500)
            return

        self._send_json(
            {
                "theme": preference.theme,
                "warning": preference.warning,
            }
        )

    def _write_profile(self) -> None:
        try:
            payload = self._read_json_body()
            display_name = payload.get("displayName")
            avatar_symbol = payload.get("avatarSymbol", DEFAULT_AVATAR_SYMBOL)
            if not isinstance(display_name, str) or not isinstance(avatar_symbol, str):
                raise ValueError("displayName and avatarSymbol must be strings")
            preference = self._preferences().write_profile(display_name, avatar_symbol)
        except (json.JSONDecodeError, ValueError, TypeError) as exc:
            self._send_json({"error": str(exc)}, status=400)
            return
        except OSError as exc:
            self._send_json(
                {"error": f"Profile preferences could not be written: {exc}"}, status=500
            )
            return

        self._send_json(
            {
                "profile": preference.profile.to_dict(),
                "warning": preference.warning,
            }
        )

    def _read_json_body(self) -> dict[str, object]:
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length).decode("utf-8") if length else "{}"
        payload = json.loads(body)
        if not isinstance(payload, dict):
            raise TypeError("JSON body must be an object")
        return payload

    def _send_json(self, payload: object, status: int = 200) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_static(self, request_path: str) -> None:
        relative = "index.html" if request_path in {"", "/"} else request_path.lstrip("/")
        candidate = (STATIC_DIR / relative).resolve()
        if not candidate.is_file() or not candidate.is_relative_to(STATIC_DIR.resolve()):
            self.send_error(404)
            return

        body = candidate.read_bytes()
        content_type = mimetypes.guess_type(candidate.name)[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def _journey_options(mem: MemoryClient) -> list[dict[str, str]]:
    return mem.journeys.list_journey_options()


def _scene_orientation_scope(journey_id: str | None) -> str:
    return f"journey:{journey_id}" if journey_id else "global"


def _load_scene_orientation(mem: MemoryClient, scope: str) -> dict[str, object] | None:
    content = mem.identity.get_identity("scene_orientation", scope)
    if not content:
        return None
    try:
        payload = json.loads(content)
    except json.JSONDecodeError:
        return None
    return payload if isinstance(payload, dict) else None


def _scene_source_hash(scene: dict[str, object]) -> str:
    encoded = json.dumps(scene, ensure_ascii=False, sort_keys=True, default=str).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _normalize_scene_orientation(orientation: dict[str, object]) -> dict[str, object]:
    if not orientation:
        return {}
    if set(orientation) == {"summary"}:
        reparsed = _parse_embedded_orientation(str(orientation.get("summary") or ""))
        if reparsed:
            orientation = reparsed
    title = _humanize_orientation_title(
        str(orientation.get("title") or "Current orientation").strip()
    )
    summary = str(orientation.get("summary") or orientation.get("text") or "").strip()
    raw_signals = orientation.get("signals") or []
    signals = [str(signal).strip() for signal in raw_signals if str(signal).strip()]
    next_move = str(orientation.get("next") or "").strip()
    if not summary:
        return {}
    return {
        "title": title,
        "summary": summary,
        "signals": signals[:5],
        "next": next_move,
    }


def _humanize_orientation_title(title: str) -> str:
    cold_titles = {
        "global scene orientation": "Your current scene",
        "focused scene orientation": "This journey's current scene",
        "scene orientation": "Your current scene",
    }
    return cold_titles.get(title.lower(), title)


def _parse_embedded_orientation(content: str) -> dict[str, object] | None:
    cleaned = content.strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()
        if cleaned.startswith("json"):
            cleaned = cleaned[4:].strip()
    first = cleaned.find("{")
    last = cleaned.rfind("}")
    if first == -1 or last == -1 or first >= last:
        return None
    try:
        payload = json.loads(cleaned[first : last + 1])
    except json.JSONDecodeError:
        return None
    return payload if isinstance(payload, dict) else None


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _conversation_turn_ids(messages: list) -> dict[str, str]:
    turn_ids: dict[str, str] = {}
    for index, message in enumerate(messages[:-1]):
        if message.role == "user" and messages[index + 1].role == "assistant":
            turn_ids[message.id] = message.id
            turn_ids[messages[index + 1].id] = message.id
    return turn_ids


def _conversation_tags(raw_tags: str | None) -> list[str]:
    if not raw_tags:
        return []
    try:
        payload = json.loads(raw_tags)
    except (json.JSONDecodeError, TypeError):
        return [tag.strip() for tag in raw_tags.split(",") if tag.strip()]
    if isinstance(payload, list):
        return [str(tag) for tag in payload if str(tag).strip()]
    return []


def _operation_requires_approval(operation_id: str, parameters: dict[str, object]) -> bool:
    if operation_id == "conversation-journey-repair" and parameters.get("dryRun") is False:
        return True
    if operation_id == "conversation-journey-backfill" and parameters.get("dryRun") is False:
        return True
    if operation_id == "historical-metadata-backfill" and parameters.get("dryRun") is False:
        return True
    if operation_id == "orphan-conversation-cleanup" and parameters.get("dryRun") is False:
        return True
    return False


def _record_operation_event(
    run_id: str,
    kind: str,
    message: str,
    details: dict[str, object] | None,
    *,
    db_path: Path | None,
) -> None:
    with MemoryClient(db_path=db_path) as mem:
        current = mem.operation_runs.get(run_id)
        if current.status == "cancellation_requested":
            raise ValueError("Operation cancelled by user")
        mem.operation_runs.record_event(run_id, kind=kind, message=message, details=details)


def _execute_operation_run(
    *,
    run_id: str,
    operation_id: str,
    parameters: dict[str, object],
    db_path: Path | None,
    mirror_home: Path | None,
    root: Path,
) -> None:
    with MemoryClient(db_path=db_path) as mem:
        current = mem.operation_runs.get(run_id)
        if current.status == "cancellation_requested":
            mem.operation_runs.cancel(run_id, reason="Operation cancelled before execution.")
            return
        mem.operation_runs.mark_running(run_id)
    try:
        result = run_operation(
            operation_id,
            mirror_home=mirror_home,
            start=root,
            parameters=parameters,
            emit_event=lambda kind, message, details=None: _record_operation_event(
                run_id, kind, message, details, db_path=db_path
            ),
        )
    except Exception as exc:
        with MemoryClient(db_path=db_path) as mem:
            mem.operation_runs.fail(run_id, error=str(exc))
        return

    with MemoryClient(db_path=db_path) as mem:
        current = mem.operation_runs.get(run_id)
        if current.status == "cancellation_requested":
            mem.operation_runs.cancel(
                run_id, reason="Operation cancelled after execution completed."
            )
            return
        mem.operation_runs.complete(
            run_id,
            outcome=str(result.get("outcome", "completed")),
            summary=list(result.get("summary", [])),
            result=dict(result.get("result", {})),
        )


def create_handler(
    *,
    root: Path | None = None,
    mirror_home: Path | None = None,
    db_path: Path | None = None,
) -> type[MirrorWebHandler]:
    browser = DocsBrowser(root=root)
    resolved_mirror_home = Path(mirror_home).expanduser().resolve() if mirror_home else None

    class Handler(MirrorWebHandler):
        pass

    Handler.browser = browser
    Handler.mirror_home = resolved_mirror_home
    Handler.db_path = db_path
    return Handler


def serve(
    host: str = "127.0.0.1",
    port: int = 8765,
    root: Path | None = None,
    mirror_home: Path | None = None,
) -> None:
    if mirror_home is None:
        try:
            mirror_home = resolve_mirror_home()
        except ValueError:
            mirror_home = None
    db_path = db_path_from_mirror_home(mirror_home)
    server = ThreadingHTTPServer(
        (host, port), create_handler(root=root, mirror_home=mirror_home, db_path=db_path)
    )
    print(f"Mirror Web Console running at http://{host}:{port}")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        server.server_close()


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Run the local Mirror Web Console")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--root", type=Path, default=None)
    parser.add_argument("--mirror-home", type=Path, default=None)
    args = parser.parse_args(argv)
    serve(host=args.host, port=args.port, root=args.root, mirror_home=args.mirror_home)


if __name__ == "__main__":
    main()
