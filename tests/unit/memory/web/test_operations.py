from __future__ import annotations

from pathlib import Path

import pytest

from memory import MemoryClient
from memory.web.operations import OPERATION_CATALOG, operation_catalog, run_operation


def test_operation_catalog_exposes_stable_allowlisted_operations() -> None:
    payload = operation_catalog()

    assert [operation["id"] for operation in payload] == [
        "runtime-health",
        "runtime-diagnose",
        "database-backup",
        "conversation-journey-repair",
        "run-console-demo",
        "agent-run-prototype",
        "historical-metadata-backfill",
        "orphan-conversation-cleanup",
        "batch-conversation-retitle",
    ]
    operations = {operation["id"]: operation for operation in payload}
    assert operations["runtime-health"]["execution"] == "runnable"
    assert operations["runtime-diagnose"]["execution"] == "runnable"
    assert operations["database-backup"]["execution"] == "runnable"
    assert operations["conversation-journey-repair"]["execution"] == "runnable"
    assert operations["run-console-demo"]["execution"] == "runnable"
    assert operations["agent-run-prototype"]["execution"] == "runnable"
    assert operations["historical-metadata-backfill"]["execution"] == "runnable"
    assert operations["orphan-conversation-cleanup"]["execution"] == "runnable"
    assert operations["batch-conversation-retitle"]["execution"] == "runnable"
    assert all(
        operation["execution"] == "future"
        for operation in payload
        if operation["id"]
        not in {
            "runtime-health",
            "runtime-diagnose",
            "database-backup",
            "conversation-journey-repair",
            "run-console-demo",
            "agent-run-prototype",
            "historical-metadata-backfill",
            "orphan-conversation-cleanup",
            "batch-conversation-retitle",
        }
    )


def test_operation_catalog_declares_risk_and_dry_run_boundaries() -> None:
    operations = {operation["id"]: operation for operation in operation_catalog()}

    assert operations["runtime-health"]["riskLevel"] == "read_only"
    assert operations["runtime-health"]["dryRun"] == "unsupported"
    assert operations["runtime-diagnose"]["riskLevel"] == "read_only"
    assert operations["database-backup"]["riskLevel"] == "writes_backup"
    assert operations["conversation-journey-repair"]["riskLevel"] == "writes_database"
    assert operations["conversation-journey-repair"]["dryRun"] == "required"
    assert operations["historical-metadata-backfill"]["riskLevel"] == "external_llm"
    assert operations["historical-metadata-backfill"]["dryRun"] == "required"
    assert operations["orphan-conversation-cleanup"]["riskLevel"] == "writes_database"
    assert operations["orphan-conversation-cleanup"]["dryRun"] == "required"
    assert operations["batch-conversation-retitle"]["riskLevel"] == "external_llm"
    assert operations["batch-conversation-retitle"]["dryRun"] == "required"


def test_operation_catalog_parameters_are_declarative_and_bounded() -> None:
    operations = {operation["id"]: operation for operation in operation_catalog()}

    repair_parameters = operations["conversation-journey-repair"]["parameters"]
    assert repair_parameters == [
        {
            "name": "dryRun",
            "label": "Dry run",
            "kind": "boolean",
            "description": "Preview repair candidates without changing conversations.",
            "required": False,
            "default": True,
        },
        {
            "name": "limit",
            "label": "Maximum conversations",
            "kind": "integer",
            "description": "Maximum number of conversations to inspect or repair in one run.",
            "required": False,
            "default": 50,
            "minimum": 1,
            "maximum": 500,
        },
    ]

    backfill_parameters = operations["historical-metadata-backfill"]["parameters"]
    assert {parameter["name"] for parameter in backfill_parameters} == {
        "dryRun",
        "mode",
        "scope",
        "allConversations",
        "limit",
        "journey",
    }
    assert next(parameter for parameter in backfill_parameters if parameter["name"] == "mode")[
        "choices"
    ] == ["safe", "force"]

    retitle_parameters = operations["batch-conversation-retitle"]["parameters"]
    assert {parameter["name"] for parameter in retitle_parameters} == {
        "dryRun",
        "limit",
        "journey",
    }
    assert (
        next(parameter for parameter in retitle_parameters if parameter["name"] == "dryRun")[
            "default"
        ]
        is True
    )
    assert (
        next(parameter for parameter in retitle_parameters if parameter["name"] == "limit")[
            "maximum"
        ]
        == 100
    )


def test_operation_catalog_does_not_expose_command_like_parameters() -> None:
    forbidden_names = {"command", "shell", "script", "sql", "executable", "path", "env"}

    for operation in operation_catalog():
        parameter_names = {parameter["name"] for parameter in operation["parameters"]}
        assert forbidden_names.isdisjoint(parameter_names)


def test_operation_catalog_is_server_owned_not_request_mutable() -> None:
    first = operation_catalog()
    first.append({"id": "unsafe-shell", "parameters": [{"name": "command"}]})

    assert len(operation_catalog()) == len(OPERATION_CATALOG)
    assert "unsafe-shell" not in {operation["id"] for operation in operation_catalog()}


def test_run_operation_executes_runtime_health_read_only(tmp_path: Path) -> None:
    mirror_home = tmp_path / "mirror-home"
    mirror_home.mkdir()

    result = run_operation("runtime-health", mirror_home=mirror_home, start=tmp_path)

    assert result["operationId"] == "runtime-health"
    assert result["status"] == "completed"
    assert result["outcome"] == "attention needed"
    assert result["result"]["mirrorHome"] == str(mirror_home)
    assert result["result"]["database"]["exists"] is False
    assert "Runtime status: attention needed" in result["summary"]


def test_run_operation_rejects_unknown_operation(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="Unknown operation"):
        run_operation("unsafe-shell", mirror_home=tmp_path / "mirror-home", start=tmp_path)


def test_run_operation_creates_and_verifies_database_backup(tmp_path: Path) -> None:
    mirror_home = tmp_path / "mirror-home"
    mirror_home.mkdir()
    (mirror_home / "memory.db").write_text("database", encoding="utf-8")

    result = run_operation("database-backup", mirror_home=mirror_home, parameters={"verify": True})

    backup_path = Path(result["result"]["backupPath"])
    assert result["operationId"] == "database-backup"
    assert result["status"] == "completed"
    assert result["outcome"] == "backup_created"
    assert backup_path.exists()
    assert backup_path.parent == mirror_home / "backups"
    assert result["result"]["verification"] == {
        "valid": True,
        "entries": ["memory.db"],
        "note": None,
    }
    assert "Stop active runtime sessions" in result["result"]["recoveryRoute"][0]


def test_run_operation_rejects_database_backup_when_database_is_missing(
    tmp_path: Path,
) -> None:
    mirror_home = tmp_path / "mirror-home"
    mirror_home.mkdir()

    with pytest.raises(ValueError, match="Database not found"):
        run_operation("database-backup", mirror_home=mirror_home)


def test_run_operation_rejects_unsupported_parameters(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="Unsupported parameters"):
        run_operation(
            "database-backup",
            mirror_home=tmp_path / "mirror-home",
            parameters={"path": "/tmp/unsafe"},
        )


def test_run_operation_dry_runs_conversation_journey_repair(tmp_path: Path) -> None:
    mirror_home, conversation_id = _mirror_with_journeyless_conversation(tmp_path)

    result = run_operation(
        "conversation-journey-repair",
        mirror_home=mirror_home,
        parameters={"dryRun": True, "limit": 10},
    )

    assert result["operationId"] == "conversation-journey-repair"
    assert result["status"] == "completed"
    assert result["outcome"] == "dry_run"
    assert result["result"]["candidateCount"] == 1
    assert result["result"]["appliedCount"] == 0
    assert result["result"]["backupPath"] is None
    assert result["result"]["candidates"][0]["conversationId"] == conversation_id
    with MemoryClient(db_path=mirror_home / "memory.db") as mem:
        assert mem.store.get_conversation(conversation_id).journey is None


def test_run_operation_applies_conversation_journey_repair_with_backup(
    tmp_path: Path,
) -> None:
    mirror_home, conversation_id = _mirror_with_journeyless_conversation(tmp_path)

    result = run_operation(
        "conversation-journey-repair",
        mirror_home=mirror_home,
        parameters={"dryRun": False, "limit": 10},
    )

    backup_path = Path(result["result"]["backupPath"])
    assert result["outcome"] == "repaired"
    assert result["result"]["candidateCount"] == 1
    assert result["result"]["appliedCount"] == 1
    assert backup_path.exists()
    with MemoryClient(db_path=mirror_home / "memory.db") as mem:
        assert mem.store.get_conversation(conversation_id).journey == "mirror-mind"


def test_run_operation_dry_runs_batch_conversation_retitle_without_llm(
    tmp_path: Path, mocker
) -> None:
    mirror_home, conversation_id = _mirror_with_poorly_titled_conversation(tmp_path)
    title_mock = mocker.patch("memory.services.conversation.generate_conversation_title")

    result = run_operation(
        "batch-conversation-retitle",
        mirror_home=mirror_home,
        parameters={"dryRun": True, "limit": 10},
    )

    assert result["operationId"] == "batch-conversation-retitle"
    assert result["outcome"] == "dry_run"
    assert result["result"]["candidateCount"] == 1
    assert result["result"]["totalCandidateCount"] == 1
    assert result["result"]["remainingAfterBatch"] == 0
    assert result["result"]["appliedCount"] == 0
    assert result["result"]["backupPath"] is None
    candidate = result["result"]["candidates"][0]
    assert candidate["conversationId"] == conversation_id
    assert "truncated_title" in candidate["reasons"]
    assert result["result"]["estimate"]["estimatedCostUsd"] > 0
    title_mock.assert_not_called()
    with MemoryClient(db_path=mirror_home / "memory.db") as mem:
        assert mem.store.get_conversation(conversation_id).title.endswith("...")


def test_run_operation_previews_historical_metadata_backfill(tmp_path: Path) -> None:
    mirror_home, conversation_id = _mirror_with_poorly_titled_conversation(tmp_path)

    result = run_operation(
        "historical-metadata-backfill",
        mirror_home=mirror_home,
        parameters={"dryRun": True, "mode": "safe", "limit": 10},
    )

    assert result["operationId"] == "historical-metadata-backfill"
    assert result["outcome"] == "dry_run"
    assert result["result"]["preview"]["mutated"] is False
    assert result["result"]["preview"]["candidate_count"] == 1
    assert result["result"]["backupPath"] is None
    with MemoryClient(db_path=mirror_home / "memory.db") as mem:
        assert mem.store.get_conversation(conversation_id).title.endswith("...")


def test_run_operation_applies_historical_metadata_backfill_with_backup(
    tmp_path: Path, mocker
) -> None:
    mirror_home, conversation_id = _mirror_with_poorly_titled_conversation(tmp_path)
    mocker.patch(
        "memory.services.conversation.generate_conversation_title",
        return_value="Conversation metadata backfill",
    )
    events: list[tuple[str, str, dict[str, object] | None]] = []

    result = run_operation(
        "historical-metadata-backfill",
        mirror_home=mirror_home,
        parameters={"dryRun": False, "mode": "safe", "allConversations": False, "limit": 10},
        emit_event=lambda kind, message, details=None: events.append((kind, message, details)),
    )

    backup_path = Path(result["result"]["backupPath"])
    assert result["outcome"] == "applied"
    assert result["result"]["apply"]["changed_count"] == 1
    assert backup_path.exists()
    assert any("Backup created" in message for _, message, _ in events)
    assert any("Backfilled 1/1" in message for _, message, _ in events)
    with MemoryClient(db_path=mirror_home / "memory.db") as mem:
        assert mem.store.get_conversation(conversation_id).title == "Conversation metadata backfill"


def test_run_operation_previews_orphan_conversation_cleanup(tmp_path: Path) -> None:
    mirror_home = tmp_path / "mirror-home"
    with MemoryClient(db_path=mirror_home / "memory.db") as mem:
        orphan = mem.conversations.start_conversation(interface="pi", title="orphan")
        mem.conversations.add_message(orphan.id, "user", "orphan message")
        journey = mem.conversations.start_conversation(
            interface="pi", journey="mirror-mind", title="journey"
        )
        mem.conversations.add_message(journey.id, "user", "journey message")

    result = run_operation(
        "orphan-conversation-cleanup",
        mirror_home=mirror_home,
        parameters={
            "dryRun": True,
            "source": "all_orphans",
            "allConversations": True,
            "maximumMessages": 3,
        },
    )

    assert result["operationId"] == "orphan-conversation-cleanup"
    assert result["outcome"] == "dry_run"
    assert result["result"]["candidateCount"] == 1
    assert result["result"]["candidates"][0]["conversationId"] == orphan.id


def test_run_operation_previews_empty_conversation_cleanup(tmp_path: Path) -> None:
    mirror_home = tmp_path / "mirror-home"
    with MemoryClient(db_path=mirror_home / "memory.db") as mem:
        empty = mem.conversations.start_conversation(
            interface="pi", journey="mirror-mind", title=None
        )
        non_empty = mem.conversations.start_conversation(
            interface="pi", journey="mirror-mind", title="non-empty"
        )
        mem.conversations.add_message(non_empty.id, "user", "keep me")

    result = run_operation(
        "orphan-conversation-cleanup",
        mirror_home=mirror_home,
        parameters={
            "dryRun": True,
            "source": "empty_conversations",
            "allConversations": True,
            "maximumMessages": 3,
        },
    )

    assert result["outcome"] == "dry_run"
    assert result["result"]["candidateCount"] == 1
    candidate = result["result"]["candidates"][0]
    assert candidate["conversationId"] == empty.id
    assert candidate["journey"] == "mirror-mind"
    assert candidate["cleanupReason"] == "empty"


def test_run_operation_no_change_cleanup_includes_empty_journey_conversations(
    tmp_path: Path,
) -> None:
    mirror_home = tmp_path / "mirror-home"
    with MemoryClient(db_path=mirror_home / "memory.db") as mem:
        empty = mem.conversations.start_conversation(
            interface="pi", journey="mirror-mind", title=None
        )
        run = mem.operation_runs.start(
            "historical-metadata-backfill", {"dryRun": False}, status="running"
        )
        mem.operation_runs.complete(
            run.id,
            outcome="applied",
            summary=[],
            result={
                "apply": {
                    "results": [{"conversation_id": empty.id, "mutated": False, "changed": {}}]
                }
            },
        )

    result = run_operation(
        "orphan-conversation-cleanup",
        mirror_home=mirror_home,
        parameters={
            "dryRun": True,
            "source": "no_change_latest_backfill",
            "allConversations": True,
            "maximumMessages": 3,
        },
    )

    assert result["outcome"] == "dry_run"
    assert result["result"]["candidateCount"] == 1
    assert result["result"]["candidates"][0]["conversationId"] == empty.id


def test_run_operation_deletes_orphan_conversations_with_backup(tmp_path: Path) -> None:
    mirror_home = tmp_path / "mirror-home"
    with MemoryClient(db_path=mirror_home / "memory.db") as mem:
        orphan = mem.conversations.start_conversation(interface="pi", title="orphan")
        mem.conversations.add_message(orphan.id, "user", "orphan message")

    events: list[tuple[str, str, dict[str, object] | None]] = []
    result = run_operation(
        "orphan-conversation-cleanup",
        mirror_home=mirror_home,
        parameters={
            "dryRun": False,
            "source": "all_orphans",
            "allConversations": True,
            "maximumMessages": 3,
        },
        emit_event=lambda kind, message, details=None: events.append((kind, message, details)),
    )

    assert result["outcome"] == "deleted"
    assert result["result"]["deletedCount"] == 1
    assert Path(result["result"]["backupPath"]).exists()
    assert any("Backup created" in message for _, message, _ in events)
    assert any("Deleted 1/1" in message for _, message, _ in events)
    with MemoryClient(db_path=mirror_home / "memory.db") as mem:
        assert mem.store.get_conversation(orphan.id) is None
        assert mem.store.get_messages(orphan.id) == []


def test_run_operation_deletes_orphan_conversation_with_runtime_reference(tmp_path: Path) -> None:
    mirror_home = tmp_path / "mirror-home"
    with MemoryClient(db_path=mirror_home / "memory.db") as mem:
        orphan = mem.conversations.start_conversation(interface="pi", title="orphan")
        mem.conversations.add_message(orphan.id, "user", "orphan message")
        mem.store.conn.execute(
            """
            INSERT INTO runtime_sessions (
                session_id, conversation_id, interface, mirror_active, active,
                started_at, updated_at
            ) VALUES (?, ?, ?, 1, 1, ?, ?)
            """,
            ("session-1", orphan.id, "pi", orphan.started_at, orphan.started_at),
        )
        mem.store.conn.commit()

    result = run_operation(
        "orphan-conversation-cleanup",
        mirror_home=mirror_home,
        parameters={
            "dryRun": False,
            "source": "all_orphans",
            "allConversations": True,
            "maximumMessages": 3,
        },
    )

    assert result["outcome"] == "deleted"
    with MemoryClient(db_path=mirror_home / "memory.db") as mem:
        assert mem.store.get_conversation(orphan.id) is None
        session_row = mem.store.conn.execute(
            "SELECT conversation_id FROM runtime_sessions WHERE session_id = 'session-1'"
        ).fetchone()
        assert session_row["conversation_id"] is None


def test_run_operation_applies_batch_conversation_retitle_with_backup(
    tmp_path: Path, mocker
) -> None:
    mirror_home, conversation_id = _mirror_with_poorly_titled_conversation(tmp_path)
    mocker.patch(
        "memory.services.conversation.generate_conversation_title",
        return_value="Conversation Title Repair",
    )
    events: list[tuple[str, str, dict[str, object] | None]] = []

    result = run_operation(
        "batch-conversation-retitle",
        mirror_home=mirror_home,
        parameters={"dryRun": False, "limit": 10},
        emit_event=lambda kind, message, details=None: events.append((kind, message, details)),
    )

    backup_path = Path(result["result"]["backupPath"])
    assert result["outcome"] == "retitled"
    assert result["result"]["candidateCount"] == 1
    assert result["result"]["totalCandidateCount"] == 1
    assert result["result"]["remainingAfterBatch"] == 0
    assert result["result"]["appliedCount"] == 1
    assert backup_path.exists()
    assert any("Backup created" in message for _, message, _ in events)
    generated_events = [event for event in events if "Generated title" in event[1]]
    assert generated_events[0][2]["newTitle"] == "Conversation Title Repair"
    assert generated_events[0][2]["conversationId"] == conversation_id
    with MemoryClient(db_path=mirror_home / "memory.db") as mem:
        conversation = mem.store.get_conversation(conversation_id)
        assert conversation.title == "Conversation Title Repair"
        assert '"title_source": "batch_retitle"' in conversation.metadata


def test_run_operation_batch_conversation_retitle_preserves_manual_titles(
    tmp_path: Path, mocker
) -> None:
    mirror_home = tmp_path / "mirror-home"
    with MemoryClient(db_path=mirror_home / "memory.db") as mem:
        conversation = mem.conversations.start_conversation(
            interface="pi",
            title="This manual title is intentionally long enough to look suspicious",
        )
        mem.conversations.add_message(conversation.id, "user", "Please help with titles")
        mem.conversations.add_message(conversation.id, "assistant", "Yes, let's repair them")
        mem.conversations.update_title(conversation.id, conversation.title or "Manual title")
    title_mock = mocker.patch("memory.services.conversation.generate_conversation_title")

    result = run_operation(
        "batch-conversation-retitle",
        mirror_home=mirror_home,
        parameters={"dryRun": True, "limit": 10},
    )

    assert result["result"]["candidateCount"] == 0
    assert result["result"]["totalCandidateCount"] == 0
    title_mock.assert_not_called()


def _mirror_with_journeyless_conversation(tmp_path: Path) -> tuple[Path, str]:
    mirror_home = tmp_path / "mirror-home"
    with MemoryClient(db_path=mirror_home / "memory.db") as mem:
        mem.identity.set_identity("journey", "mirror-mind", "# Mirror Mind\n**Status:** active")
        conversation = mem.conversations.start_conversation(interface="pi", title="Builder")
        mem.conversations.add_message(conversation.id, "user", "$mm-build mirror-mind")
    return mirror_home, conversation.id


def _mirror_with_poorly_titled_conversation(tmp_path: Path) -> tuple[Path, str]:
    mirror_home = tmp_path / "mirror-home"
    with MemoryClient(db_path=mirror_home / "memory.db") as mem:
        conversation = mem.conversations.start_conversation(
            interface="pi",
            title="vamos trabalhar na jornada mirror mind. Eu quero trabalhar...",
        )
        mem.conversations.add_message(conversation.id, "user", "Quero corrigir títulos")
        mem.conversations.add_message(
            conversation.id, "assistant", "Vamos criar uma operação segura"
        )
    return mirror_home, conversation.id
