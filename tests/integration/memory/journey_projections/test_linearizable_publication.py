from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path

from memory.journey_projections.errors import ProjectionError, ProjectionErrorCode
from memory.journey_projections.service import JourneyProjectionService

WORKER = Path(__file__).with_name("publication_worker.py")
INSPECTOR = Path(__file__).with_name("inspection_worker.py")


def projection_document(namespace: str, snapshot: str) -> dict:
    return {
        "contractVersion": "1.0",
        "schemaVersion": "1",
        "journeyId": "synthetic-journey",
        "altitude": "tactical",
        "namespace": namespace,
        "projection": "tactical",
        "snapshotId": snapshot,
        "generatedAt": "2030-01-01T00:00:00Z",
        "producer": {"kind": "extension", "id": namespace, "version": "1.0"},
        "sourceRevision": f"sha256:{snapshot}",
        "sourceSnapshots": [
            {"namespace": "ariad", "projection": "operational", "snapshotId": "op-0001"}
        ],
        "content": {"value": snapshot},
    }


def worker_command(
    root: Path,
    namespace: str,
    *,
    value: str | None = None,
    suffix: str | None = None,
    entered: Path | None = None,
    release: Path | None = None,
    pause_checkpoint: str = "lock_acquired",
) -> list[str]:
    command = [
        sys.executable,
        str(WORKER),
        "--root",
        str(root),
        "--namespace",
        namespace,
        "--projection",
        "tactical",
        "--snapshot",
        f"snap-{value or namespace}",
        "--value",
        value or namespace,
        "--result",
        str(root / f"result-{suffix or namespace}.json"),
    ]
    if entered is not None and release is not None:
        command.extend(
            [
                "--entered",
                str(entered),
                "--release",
                str(release),
                "--pause-checkpoint",
                pause_checkpoint,
            ]
        )
    return command


def wait_for(path: Path, timeout: float = 5) -> None:
    deadline = time.monotonic() + timeout
    while not path.exists():
        if time.monotonic() >= deadline:
            raise AssertionError(f"timed out waiting for {path.name}")
        time.sleep(0.01)


def test_same_journey_processes_serialize_and_preserve_both_manifest_entries(
    tmp_path: Path,
) -> None:
    entered = tmp_path / "entered"
    release = tmp_path / "release"
    first = subprocess.Popen(
        worker_command(tmp_path, "extension-one", entered=entered, release=release),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    wait_for(entered)
    second = subprocess.Popen(
        worker_command(tmp_path, "extension-two"),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    time.sleep(0.2)
    assert second.poll() is None

    release.write_text("release", encoding="utf-8")
    first_stdout, first_stderr = first.communicate(timeout=10)
    second_stdout, second_stderr = second.communicate(timeout=10)
    assert first.returncode == 0, first_stdout + first_stderr
    assert second.returncode == 0, second_stdout + second_stderr

    manifest = json.loads((tmp_path / ".mirror/projections/current.json").read_text())
    assert set(manifest["projections"]) == {
        "extension-one:tactical",
        "extension-two:tactical",
    }
    service = JourneyProjectionService(lambda _journey: tmp_path)
    for namespace in ("extension-one", "extension-two"):
        inspected = service.inspect("synthetic-journey", namespace, "tactical", domain="extension")
        assert inspected.document["content"]["value"] == namespace


def test_same_projection_has_one_total_order(tmp_path: Path) -> None:
    entered = tmp_path / "entered"
    release = tmp_path / "release"
    first = subprocess.Popen(
        worker_command(
            tmp_path,
            "same-extension",
            value="first",
            suffix="first",
            entered=entered,
            release=release,
        ),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    wait_for(entered)
    second = subprocess.Popen(
        worker_command(tmp_path, "same-extension", value="second", suffix="second"),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    release.write_text("release", encoding="utf-8")
    assert first.communicate(timeout=10)[1] == ""
    assert second.communicate(timeout=10)[1] == ""
    assert first.returncode == second.returncode == 0

    inspected = JourneyProjectionService(lambda _journey: tmp_path).inspect(
        "synthetic-journey", "same-extension", "tactical", domain="extension"
    )
    assert inspected.document["content"]["value"] == "second"
    assert inspected.manifest_entry["snapshotId"] == "snap-second"


def test_different_journeys_do_not_share_global_lock(tmp_path: Path) -> None:
    first_root = tmp_path / "first"
    second_root = tmp_path / "second"
    first_root.mkdir()
    second_root.mkdir()
    first_entered = tmp_path / "first-entered"
    second_entered = tmp_path / "second-entered"
    release = tmp_path / "release"
    first = subprocess.Popen(
        worker_command(first_root, "extension-one", entered=first_entered, release=release),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    second = subprocess.Popen(
        worker_command(second_root, "extension-two", entered=second_entered, release=release),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    wait_for(first_entered)
    wait_for(second_entered)
    release.write_text("release", encoding="utf-8")
    first.communicate(timeout=10)
    second.communicate(timeout=10)
    assert first.returncode == second.returncode == 0


def test_lock_timeout_mutates_no_candidate_state(tmp_path: Path) -> None:
    entered = tmp_path / "entered"
    release = tmp_path / "release"
    holder = subprocess.Popen(
        worker_command(tmp_path, "holder", entered=entered, release=release),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    wait_for(entered)
    contender = JourneyProjectionService(lambda _journey: tmp_path, lock_timeout=0.05)
    try:
        contender.publish(projection_document("contender", "snap-contender"), domain="extension")
    except ProjectionError as exc:
        assert exc.code is ProjectionErrorCode.PUBLICATION_FAILED
    else:  # pragma: no cover - the holder must exclude the contender
        raise AssertionError("contender unexpectedly acquired the Journey lock")
    finally:
        release.write_text("release", encoding="utf-8")
        holder.communicate(timeout=10)
    assert not list((tmp_path / ".mirror/projections/.receipts").rglob("snap-contender.json"))


def test_inspection_waits_for_publication_linearization(tmp_path: Path) -> None:
    JourneyProjectionService(lambda _journey: tmp_path).publish(
        projection_document("observed", "snap-stable"), domain="extension"
    )
    entered = tmp_path / "entered-after-replace"
    release = tmp_path / "release"
    writer = subprocess.Popen(
        worker_command(
            tmp_path,
            "observed",
            value="new",
            suffix="new",
            entered=entered,
            release=release,
            pause_checkpoint="projection_replaced",
        ),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    wait_for(entered)
    result_path = tmp_path / "inspection.json"
    inspector = subprocess.Popen(
        [
            sys.executable,
            str(INSPECTOR),
            "--root",
            str(tmp_path),
            "--namespace",
            "observed",
            "--result",
            str(result_path),
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    time.sleep(0.2)
    assert inspector.poll() is None
    release.write_text("release", encoding="utf-8")
    writer.communicate(timeout=10)
    _, inspect_stderr = inspector.communicate(timeout=10)
    assert writer.returncode == 0
    assert inspector.returncode == 0, inspect_stderr.decode()
    inspected = json.loads(result_path.read_text())
    assert inspected["document"]["snapshotId"] == "snap-new"
    assert inspected["manifest"]["snapshotId"] == "snap-new"


def test_process_death_after_projection_replace_leaves_explicit_divergence(
    tmp_path: Path,
) -> None:
    entered = tmp_path / "entered-after-replace"
    release = tmp_path / "never-release"
    writer = subprocess.Popen(
        worker_command(
            tmp_path,
            "crashed",
            entered=entered,
            release=release,
            pause_checkpoint="projection_replaced",
        ),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    wait_for(entered)
    writer.kill()
    writer.communicate(timeout=5)

    try:
        JourneyProjectionService(lambda _journey: tmp_path).inspect(
            "synthetic-journey", "crashed", "tactical", domain="extension"
        )
    except ProjectionError as exc:
        assert exc.code is ProjectionErrorCode.PROJECTION_DIVERGENCE
    else:  # pragma: no cover
        raise AssertionError("inspection silently accepted an interrupted publication")


def test_process_death_releases_journey_lock(tmp_path: Path) -> None:
    entered = tmp_path / "entered"
    release = tmp_path / "never-release"
    holder = subprocess.Popen(
        worker_command(tmp_path, "terminated", entered=entered, release=release),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    wait_for(entered)
    holder.kill()
    holder.communicate(timeout=5)

    successor = subprocess.run(
        worker_command(tmp_path, "successor"),
        text=True,
        capture_output=True,
        check=False,
        timeout=10,
    )
    assert successor.returncode == 0, successor.stdout + successor.stderr
