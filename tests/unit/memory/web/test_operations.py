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
        "agent-run-prototype",
        "conversation-logger-health",
        "batch-conversation-retitle",
    ]
    operations = {operation["id"]: operation for operation in payload}
    assert operations["runtime-health"]["execution"] == "runnable"
    assert operations["runtime-diagnose"]["execution"] == "runnable"
    assert operations["database-backup"]["execution"] == "runnable"
    assert operations["conversation-journey-repair"]["execution"] == "runnable"
    assert operations["agent-run-prototype"]["execution"] == "runnable"
    assert all(
        operation["execution"] == "future"
        for operation in payload
        if operation["id"]
        not in {
            "runtime-health",
            "runtime-diagnose",
            "database-backup",
            "conversation-journey-repair",
            "agent-run-prototype",
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

    retitle_parameters = operations["batch-conversation-retitle"]["parameters"]
    assert {parameter["name"] for parameter in retitle_parameters} == {"limit", "journey"}
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


def test_run_operation_rejects_future_operation(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="not runnable yet"):
        run_operation("conversation-logger-health", mirror_home=tmp_path / "mirror-home")


def _mirror_with_journeyless_conversation(tmp_path: Path) -> tuple[Path, str]:
    mirror_home = tmp_path / "mirror-home"
    with MemoryClient(db_path=mirror_home / "memory.db") as mem:
        mem.identity.set_identity("journey", "mirror-mind", "# Mirror Mind\n**Status:** active")
        conversation = mem.conversations.start_conversation(interface="pi", title="Builder")
        mem.conversations.add_message(conversation.id, "user", "$mm-build mirror-mind")
    return mirror_home, conversation.id
