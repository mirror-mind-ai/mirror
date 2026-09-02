from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from memory import MemoryClient
from memory.builder.ariad_method import get_ariad_method
from memory.builder.delivery_cursor import get_delivery_cursor, set_delivery_cursor
from memory.builder.delivery_story_plan import plan_delivery_story_checkpoint
from memory.builder.lifecycle import plan_lifecycle_item

WORKER = Path(__file__).with_name("plan_preauthorization_worker.py")


def test_two_processes_consume_plan_preauthorization_once(tmp_path: Path) -> None:
    db_path = tmp_path / "memory.db"
    client = MemoryClient(env="test", db_path=db_path)
    client.store.configure_projection_refresh(None)
    plan_path = tmp_path / "project" / "cv20-ds15" / "plan.md"
    set_delivery_cursor(
        client.store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV20.DS15",
        active_item_level="delivery_story",
        navigator_flow_unit="delivery_story",
        cursor_generation=4,
    )
    plan_delivery_story_checkpoint(
        client.store,
        journey="sandbox-pet-store",
        method="ariad",
        objective="Consume one exact-scope receipt.",
        child_work_items=("CV20.DS15.TS1",),
        plan_artifact_path=plan_path,
        preauthorize=True,
    )
    plan_path.write_text(
        plan_path.read_text(encoding="utf-8").replace("Pending — ", "Decided: "),
        encoding="utf-8",
    )

    processes: list[subprocess.Popen[str]] = []
    results = [tmp_path / "result-one.json", tmp_path / "result-two.json"]
    for result in results:
        processes.append(
            subprocess.Popen(
                [
                    sys.executable,
                    str(WORKER),
                    "--db",
                    str(db_path),
                    "--plan",
                    str(plan_path),
                    "--result",
                    str(result),
                ],
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
        )

    for process in processes:
        stdout, stderr = process.communicate(timeout=30)
        assert process.returncode == 0, stdout + stderr

    outcomes = [json.loads(path.read_text(encoding="utf-8")) for path in results]
    assert sorted(item["status"] for item in outcomes) == ["already_approved", "approved"]
    assert sum(item["implementationStarted"] for item in outcomes) == 1
    cursor = get_delivery_cursor(client.store, "sandbox-pet-store")
    assert cursor is not None
    assert cursor.plan_preauthorization is not None
    assert cursor.plan_preauthorization.status == "consumed"
    assert cursor.aggregate_checkpoint_status == ("plan:approved",)


def test_two_processes_consume_story_plan_preauthorization_once(tmp_path: Path) -> None:
    db_path = tmp_path / "memory.db"
    client = MemoryClient(env="test", db_path=db_path)
    client.store.configure_projection_refresh(None)
    plan_path = tmp_path / "project" / "cv20-ds16-us1" / "plan.md"
    plan_path.parent.mkdir(parents=True)
    plan_path.write_text(
        """# Plan — CV20.DS16.US1

## Scope

- Exact story scope.

## Non-Goals

- No sibling work.

## Acceptance Behavior

Given authority\nWhen consumed\nThen implementation starts once.

## Validation Route

- Run focused checks.

## Implementation Contract

- Stop at Navigator Validation.
""",
        encoding="utf-8",
    )
    set_delivery_cursor(
        client.store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV20.DS16.US1",
        active_item_level="user_story",
        last_delivery_event="prepare",
        navigator_flow_unit="story_by_story",
        cursor_generation=5,
    )
    plan_lifecycle_item(
        client.store,
        journey="sandbox-pet-store",
        method=get_ariad_method(),
        plan_artifact_path=plan_path,
        preauthorize=True,
    )

    processes: list[subprocess.Popen[str]] = []
    results = [tmp_path / "story-result-one.json", tmp_path / "story-result-two.json"]
    for result in results:
        processes.append(
            subprocess.Popen(
                [
                    sys.executable,
                    str(WORKER),
                    "--db",
                    str(db_path),
                    "--plan",
                    str(plan_path),
                    "--result",
                    str(result),
                    "--flow",
                    "story",
                ],
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
        )

    for process in processes:
        stdout, stderr = process.communicate(timeout=30)
        assert process.returncode == 0, stdout + stderr

    outcomes = [json.loads(path.read_text(encoding="utf-8")) for path in results]
    assert sorted(item["status"] for item in outcomes) == ["already_approved", "approved"]
    assert sum(item["implementationStarted"] for item in outcomes) == 1
    cursor = get_delivery_cursor(client.store, "sandbox-pet-store")
    assert cursor is not None
    assert cursor.plan_preauthorization is not None
    assert cursor.plan_preauthorization.status == "consumed"
    assert cursor.last_delivery_event == "plan_approved"
