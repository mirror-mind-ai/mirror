from __future__ import annotations

from memory import MemoryClient


def test_operation_run_service_records_completed_runs(tmp_path):
    with MemoryClient(db_path=tmp_path / "memory.db") as mem:
        run = mem.operation_runs.start("runtime-health", {})
        completed = mem.operation_runs.complete(
            run.id,
            outcome="ready",
            summary=["Runtime status: ready"],
            result={"status": "ready"},
        )
        recent = mem.operation_runs.recent()

    assert completed.status == "completed"
    assert completed.outcome == "ready"
    assert completed.summary == ["Runtime status: ready"]
    assert completed.result == {"status": "ready"}
    assert completed.completed_at is not None
    assert [event.kind for event in completed.events] == ["running", "completed"]
    assert completed.events[-1].details["outcome"] == "ready"
    assert recent[0].id == run.id


def test_operation_run_service_records_failed_runs(tmp_path):
    with MemoryClient(db_path=tmp_path / "memory.db") as mem:
        run = mem.operation_runs.start("database-backup", {"verify": True})
        failed = mem.operation_runs.fail(run.id, error="Database not found")

    assert failed.status == "failed"
    assert failed.error == "Database not found"
    assert failed.parameters == {"verify": True}
    assert failed.completed_at is not None
    assert [event.kind for event in failed.events] == ["running", "failed"]
    assert failed.events[-1].details["error"] == "Database not found"


def test_operation_run_service_records_queued_and_running_states(tmp_path):
    with MemoryClient(db_path=tmp_path / "memory.db") as mem:
        queued = mem.operation_runs.queue("runtime-health", {})
        running = mem.operation_runs.mark_running(queued.id)

    assert queued.status == "queued"
    assert queued.events[0].kind == "queued"
    assert running.status == "running"
    assert running.id == queued.id
    assert [event.kind for event in running.events] == ["queued", "running"]


def test_operation_run_service_records_cancellation_request_and_cancelled(tmp_path):
    with MemoryClient(db_path=tmp_path / "memory.db") as mem:
        queued = mem.operation_runs.queue("runtime-health", {})
        requested = mem.operation_runs.request_cancel(queued.id)
        cancelled = mem.operation_runs.cancel(queued.id)

    assert requested.status == "cancellation_requested"
    assert cancelled.status == "cancelled"
    assert cancelled.outcome == "cancelled"
    assert [event.kind for event in cancelled.events] == [
        "queued",
        "cancellation_requested",
        "cancelled",
    ]
