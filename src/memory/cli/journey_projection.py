"""CLI transport for Journey Projection Contract operations."""

from __future__ import annotations

import json
import os
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import TYPE_CHECKING, Any, Literal

from memory.config import db_path_for_home
from memory.journey_projections.constants import (
    CONTRACT_ID,
    CONTRACT_VERSION,
    EXTENSION_API_VERSION,
    IMPLEMENTED_OPERATIONS,
)
from memory.journey_projections.errors import ProjectionError, ProjectionErrorCode
from memory.journey_projections.extension_api import ExtensionJourneyProjections
from memory.journey_projections.operational import (
    AriadOperationalProjectionService,
    OperationalCompiler,
)
from memory.journey_projections.probe import (
    load_probe_control,
    prepare_probe,
    require_probe_extension,
)
from memory.journey_projections.refresh import (
    active_work_from_cursor,
    exploratory_stories_from_store,
)
from memory.journey_projections.service import JourneyProjectionService
from memory.journey_projections.test_guard import (
    configured_production_home,
    require_isolated_test_home,
)


def _emit(payload: Mapping[str, object]) -> None:
    print(json.dumps(payload, ensure_ascii=False, sort_keys=True))


def _parse(args: Sequence[str]) -> tuple[str, dict[str, str]]:
    if not args or args[0].startswith("--"):
        raise _unsupported()
    operation = args[0]
    options: dict[str, str] = {}
    index = 1
    while index < len(args):
        key = args[index]
        if not key.startswith("--") or index + 1 >= len(args) or args[index + 1].startswith("--"):
            raise _unsupported()
        if key in options:
            raise _unsupported()
        options[key] = args[index + 1]
        index += 2
    if options.pop("--format", "json") != "json":
        raise _unsupported()
    return operation, options


def _unsupported() -> ProjectionError:
    return ProjectionError(
        ProjectionErrorCode.UNSUPPORTED_CONTRACT,
        "Journey projection operation is unavailable for this contract version.",
    )


def _required(options: dict[str, str], key: str) -> str:
    value = options.pop(key, "").strip()
    if not value:
        raise _unsupported()
    return value


def _home(options: dict[str, str]) -> Path:
    return Path(_required(options, "--mirror-home")).expanduser().resolve()


if TYPE_CHECKING:
    from memory.client import MemoryClient


def _client(home: Path) -> MemoryClient:
    from memory.client import MemoryClient

    environment = os.getenv("MEMORY_ENV") or "production"
    return MemoryClient(env=environment, db_path=db_path_for_home(home, environment))


def _service(client: MemoryClient) -> JourneyProjectionService:
    return JourneyProjectionService(client.journeys.get_project_path)


def _read_json_object(path_value: str) -> Mapping[str, Any]:
    try:
        value = json.loads(Path(path_value).expanduser().read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise ProjectionError(
            ProjectionErrorCode.SCHEMA_VALIDATION_FAILED,
            "Projection JSON input is unavailable or invalid.",
        ) from exc
    if not isinstance(value, dict):
        raise ProjectionError(
            ProjectionErrorCode.SCHEMA_VALIDATION_FAILED,
            "Projection JSON input must be an object.",
        )
    return value


def _operational_service(
    client: MemoryClient, home: Path, journey: str
) -> AriadOperationalProjectionService:
    control = load_probe_control(home, journey)
    if control is None:
        compiler = OperationalCompiler()
    else:
        compiler = OperationalCompiler(
            _generated_at_factory=lambda: control["generatedAt"],
            _snapshot_id_factory=lambda: control["snapshotId"],
            _source_revision_override=control["sourceRevision"],
        )
    return AriadOperationalProjectionService(_service(client), compiler=compiler)


def _capabilities(options: dict[str, str]) -> Mapping[str, object]:
    options.pop("--mirror-home", None)
    if options:
        raise _unsupported()
    return {
        "contractId": CONTRACT_ID,
        "contractVersion": CONTRACT_VERSION,
        "extensionApiVersion": EXTENSION_API_VERSION,
        "operations": list(IMPLEMENTED_OPERATIONS),
    }


def _probe_prepare(options: dict[str, str]) -> Mapping[str, object]:
    home = _home(options)
    fixture = _required(options, "--fixture-root")
    active = _required(options, "--active-state")
    if options:
        raise _unsupported()
    return prepare_probe(home, fixture, active)


def _rebuild(options: dict[str, str]) -> Mapping[str, object]:
    home = _home(options)
    journey = _required(options, "--journey")
    if options:
        raise _unsupported()
    with _client(home) as client:
        projection_service = _service(client)
        operational = _operational_service(client, home, journey)
        explorer = exploratory_stories_from_store(
            client.store,
            journey,
            projection_service.registered_root(journey),
        )
        document = operational.compile(
            journey,
            active_work=active_work_from_cursor(client.store, journey),
            exploratory_stories=explorer or None,
        )
        publication = operational.publish_compiled(document)
        return {
            "status": publication.status,
            "journeyId": publication.journey_id,
            "namespace": publication.namespace,
            "projection": publication.projection,
            "snapshotId": publication.snapshot_id,
            "sourceRevision": publication.source_revision,
            "document": document,
        }


def _inspect(options: dict[str, str]) -> Mapping[str, object]:
    home = _home(options)
    journey = _required(options, "--journey")
    namespace = _required(options, "--namespace")
    projection = _required(options, "--projection")
    if options:
        raise _unsupported()
    domain: Literal["operational", "extension"] = (
        "operational" if namespace == "ariad" and projection == "operational" else "extension"
    )
    with _client(home) as client:
        result = _service(client).inspect(journey, namespace, projection, domain=domain)
        return {
            "status": result.status,
            "document": result.document,
            "manifest": result.manifest_entry,
        }


def _probe_publish(options: dict[str, str]) -> Mapping[str, object]:
    home = _home(options)
    require_isolated_test_home(
        home,
        production_home=configured_production_home(),
    )
    journey = _required(options, "--journey")
    actor = options.pop("--actor-namespace", None)
    target = options.pop("--target-namespace", None)
    extension_id = require_probe_extension(actor, target)
    projection = _required(options, "--projection")
    document_path = _required(options, "--document")
    schema_path = _required(options, "--schema")
    if options or journey != "projection-probe-journey":
        raise _unsupported()
    document = _read_json_object(document_path)
    schema = _read_json_object(schema_path)
    with _client(home) as client:
        result = ExtensionJourneyProjections(extension_id, _service(client)).publish(
            journey,
            projection,
            document,
            schema,
        )
        return {
            "status": result.status,
            "journeyId": result.journey_id,
            "namespace": result.namespace,
            "projection": result.projection,
            "snapshotId": result.snapshot_id,
            "sourceRevision": result.source_revision,
        }


def cmd_journey_projection(args: Sequence[str]) -> int:
    try:
        operation, options = _parse(args)
        handlers = {
            "capabilities": _capabilities,
            "probe-prepare": _probe_prepare,
            "rebuild-operational": _rebuild,
            "inspect": _inspect,
            "probe-publish": _probe_publish,
        }
        handler = handlers.get(operation)
        if handler is None:
            raise _unsupported()
        _emit(handler(options))
        return 0
    except ProjectionError as exc:
        _emit(exc.to_dict())
        return 2
    except Exception:  # CLI trust boundary: never expose internal paths or payloads.
        error = ProjectionError(
            ProjectionErrorCode.PUBLICATION_FAILED,
            "Journey projection operation failed at a bounded runtime boundary.",
        )
        _emit(error.to_dict())
        return 2
