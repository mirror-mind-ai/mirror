from __future__ import annotations

from memory.web.operations import OPERATION_CATALOG, operation_catalog


def test_operation_catalog_exposes_stable_allowlisted_operations() -> None:
    payload = operation_catalog()

    assert [operation["id"] for operation in payload] == [
        "runtime-health",
        "database-backup",
        "conversation-journey-repair",
        "conversation-logger-health",
        "batch-conversation-retitle",
    ]
    assert all(operation["execution"] == "future" for operation in payload)


def test_operation_catalog_declares_risk_and_dry_run_boundaries() -> None:
    operations = {operation["id"]: operation for operation in operation_catalog()}

    assert operations["runtime-health"]["riskLevel"] == "read_only"
    assert operations["runtime-health"]["dryRun"] == "unsupported"
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
            "name": "limit",
            "label": "Maximum conversations",
            "kind": "integer",
            "description": "Maximum number of conversations to inspect or repair in one run.",
            "required": False,
            "default": 50,
            "minimum": 1,
            "maximum": 500,
        }
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
