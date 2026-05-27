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
    assert recent[0].id == run.id


def test_operation_run_service_records_failed_runs(tmp_path):
    with MemoryClient(db_path=tmp_path / "memory.db") as mem:
        run = mem.operation_runs.start("database-backup", {"verify": True})
        failed = mem.operation_runs.fail(run.id, error="Database not found")

    assert failed.status == "failed"
    assert failed.error == "Database not found"
    assert failed.parameters == {"verify": True}
    assert failed.completed_at is not None


def test_operation_run_service_records_queued_and_running_states(tmp_path):
    with MemoryClient(db_path=tmp_path / "memory.db") as mem:
        queued = mem.operation_runs.queue("runtime-health", {})
        running = mem.operation_runs.mark_running(queued.id)

    assert queued.status == "queued"
    assert running.status == "running"
    assert running.id == queued.id
