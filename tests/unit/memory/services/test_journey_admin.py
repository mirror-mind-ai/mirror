import json
from pathlib import Path

import pytest

from memory import MemoryClient
from memory.services.journey_admin import JourneyMutationError


def create(client: MemoryClient, slug: str, title: str, parent: str | None = None) -> None:
    client.journeys.create_journey(
        slug=slug,
        content=f"# {title}\n**Status:** active\n\n## Description\n\nA sufficiently detailed Journey description for contract testing.",
        parent_journey=parent,
    )


def test_create_is_versioned_ordered_and_idempotent(tmp_path: Path) -> None:
    client = MemoryClient(db_path=tmp_path / "memory.db")
    create(client, "root-one", "Root One")
    source = client.journey_admin.export_registry()
    request = {
        "schemaVersion": "mirror.journey-mutation@1.0",
        "requestId": "req-create-001",
        "expectedSourceVersion": source["sourceVersion"],
        "operation": "create_journey",
        "payload": {
            "slug": "child-one",
            "name": "Child One",
            "description": "A deliberate child Journey created through the desktop gateway.",
            "parentId": "root-one",
            "position": 0,
        },
    }

    first = client.journey_admin.mutate(request)
    retry = client.journey_admin.mutate(request)

    assert first["receipt"]["resultVersion"] == retry["receipt"]["resultVersion"]
    assert first["registry"]["sourceVersion"] == retry["registry"]["sourceVersion"]
    child = first["registry"]["roots"][0]["children"][0]
    assert child["id"] == "child-one"
    assert first["receipt"]["idempotent"] is False
    assert retry["receipt"]["idempotent"] is True
    assert client.store.get_recent_conversations_by_journey("child-one") == []


def test_create_appends_after_projected_orphan_roots(tmp_path: Path) -> None:
    client = MemoryClient(db_path=tmp_path / "memory.db")
    create(client, "root-one", "Root One")
    create(client, "missing-parent", "Missing Parent")
    create(client, "orphan-one", "Orphan One", "missing-parent")
    client.store.delete_identity("journey", "missing-parent")
    source = client.journey_admin.export_registry()

    result = client.journey_admin.mutate(
        {
            "schemaVersion": "mirror.journey-mutation@1.0",
            "requestId": "req-orphan-root-001",
            "expectedSourceVersion": source["sourceVersion"],
            "operation": "create_journey",
            "payload": {
                "slug": "root-two",
                "name": "Root Two",
                "description": "A deliberate root Journey appended after every projected root.",
                "parentId": None,
                "position": len(source["roots"]),
            },
        }
    )

    assert [root["id"] for root in result["registry"]["roots"]] == [
        *[root["id"] for root in source["roots"]],
        "root-two",
    ]


def test_stale_cycle_and_unauthorized_fields_fail_without_mutation(tmp_path: Path) -> None:
    client = MemoryClient(db_path=tmp_path / "memory.db")
    create(client, "root-one", "Root One")
    create(client, "child-one", "Child One", "root-one")
    source = client.journey_admin.export_registry()

    with pytest.raises(JourneyMutationError, match="stale_source"):
        client.journey_admin.mutate(
            {
                "schemaVersion": "mirror.journey-mutation@1.0",
                "requestId": "stale-001",
                "expectedSourceVersion": "wrong",
                "operation": "set_project_path",
                "payload": {"journeyId": "root-one", "projectPath": str(tmp_path)},
            }
        )
    with pytest.raises(JourneyMutationError, match="unauthorized_field"):
        client.journey_admin.mutate(
            {
                "schemaVersion": "mirror.journey-mutation@1.0",
                "requestId": "bad-0001",
                "expectedSourceVersion": source["sourceVersion"],
                "operation": "move_journey",
                "payload": {
                    "journeyId": "root-one",
                    "parentId": "child-one",
                    "position": 0,
                    "content": "no",
                },
            }
        )
    assert client.journey_admin.export_registry()["sourceVersion"] == source["sourceVersion"]


def test_delete_removes_only_an_empty_leaf_and_is_idempotent(tmp_path: Path) -> None:
    client = MemoryClient(db_path=tmp_path / "memory.db")
    create(client, "root-one", "Root One")
    create(client, "empty-leaf", "Empty Leaf")
    source = client.journey_admin.export_registry()
    request = {
        "schemaVersion": "mirror.journey-mutation@1.0",
        "requestId": "delete-request-001",
        "expectedSourceVersion": source["sourceVersion"],
        "operation": "delete_journey",
        "payload": {"journeyId": "empty-leaf"},
    }

    first = client.journey_admin.mutate(request)
    retry = client.journey_admin.mutate(request)

    assert client.store.get_identity("journey", "empty-leaf") is None
    assert client.store.get_identity("journey", "root-one") is not None
    assert first["receipt"]["resultVersion"] == retry["receipt"]["resultVersion"]
    assert retry["receipt"]["idempotent"] is True


def test_delete_rejects_children_and_protected_associations_without_cascade(tmp_path: Path) -> None:
    client = MemoryClient(db_path=tmp_path / "memory.db")
    create(client, "root-one", "Root One")
    create(client, "child-one", "Child One", "root-one")
    create(client, "populated-leaf", "Populated Leaf")
    conversation = client.start_conversation("pi", journey="populated-leaf")
    source = client.journey_admin.export_registry()

    with pytest.raises(JourneyMutationError, match="journey_not_empty:child_journeys"):
        client.journey_admin.mutate(
            {
                "schemaVersion": "mirror.journey-mutation@1.0",
                "requestId": "delete-parent-001",
                "expectedSourceVersion": source["sourceVersion"],
                "operation": "delete_journey",
                "payload": {"journeyId": "root-one"},
            }
        )
    with pytest.raises(JourneyMutationError, match="journey_not_empty:conversations"):
        client.journey_admin.mutate(
            {
                "schemaVersion": "mirror.journey-mutation@1.0",
                "requestId": "delete-used-0001",
                "expectedSourceVersion": source["sourceVersion"],
                "operation": "delete_journey",
                "payload": {"journeyId": "populated-leaf"},
            }
        )

    assert client.store.get_identity("journey", "root-one") is not None
    assert client.store.get_identity("journey", "populated-leaf") is not None
    assert client.store.get_conversation(conversation.id) is not None
    assert client.journey_admin.export_registry()["sourceVersion"] == source["sourceVersion"]


def test_move_and_project_path_preserve_identity_content(tmp_path: Path) -> None:
    project = tmp_path / "project"
    project.mkdir()
    client = MemoryClient(db_path=tmp_path / "memory.db")
    create(client, "root-one", "Root One")
    create(client, "root-two", "Root Two")
    original = client.store.get_identity("journey", "root-two")
    source = client.journey_admin.export_registry()

    path_result = client.journey_admin.mutate(
        {
            "schemaVersion": "mirror.journey-mutation@1.0",
            "requestId": "path-001",
            "expectedSourceVersion": source["sourceVersion"],
            "operation": "set_project_path",
            "payload": {"journeyId": "root-two", "projectPath": str(project)},
        }
    )
    moved = client.journey_admin.mutate(
        {
            "schemaVersion": "mirror.journey-mutation@1.0",
            "requestId": "move-001",
            "expectedSourceVersion": path_result["registry"]["sourceVersion"],
            "operation": "move_journey",
            "payload": {"journeyId": "root-two", "parentId": "root-one", "position": 0},
        }
    )

    assert moved["registry"]["roots"][0]["children"][0]["id"] == "root-two"
    current = client.store.get_identity("journey", "root-two")
    assert current.id == original.id
    assert current.content == original.content
    assert json.loads(current.metadata)["project_path"] == str(project.resolve())
