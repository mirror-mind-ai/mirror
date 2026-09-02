from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

from memory.journey_projections.service import JourneyProjectionService


def document(namespace: str, projection: str, snapshot: str, value: str) -> dict:
    return {
        "contractVersion": "1.0",
        "schemaVersion": "1",
        "journeyId": "synthetic-journey",
        "altitude": "tactical",
        "namespace": namespace,
        "projection": projection,
        "snapshotId": snapshot,
        "generatedAt": "2030-01-01T00:00:00Z",
        "producer": {"kind": "extension", "id": namespace, "version": "1.0"},
        "sourceRevision": f"sha256:{value}",
        "sourceSnapshots": [
            {"namespace": "ariad", "projection": "operational", "snapshotId": "op-0001"}
        ],
        "content": {"value": value},
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--namespace", required=True)
    parser.add_argument("--projection", required=True)
    parser.add_argument("--snapshot", required=True)
    parser.add_argument("--value", required=True)
    parser.add_argument("--entered", type=Path)
    parser.add_argument("--release", type=Path)
    parser.add_argument("--pause-checkpoint", default="lock_acquired")
    parser.add_argument("--result", required=True, type=Path)
    args = parser.parse_args()

    def checkpoint(name: str) -> None:
        if name == args.pause_checkpoint and args.entered is not None:
            args.entered.write_text("entered", encoding="utf-8")
            assert args.release is not None
            deadline = time.monotonic() + 10
            while not args.release.exists():
                if time.monotonic() >= deadline:
                    raise TimeoutError("barrier timeout")
                time.sleep(0.01)

    service = JourneyProjectionService(
        lambda journey_id: args.root if journey_id == "synthetic-journey" else None,
        failure_injector=checkpoint,
    )
    publication = service.publish(
        document(args.namespace, args.projection, args.snapshot, args.value),
        domain="extension",
    )
    args.result.write_text(json.dumps(publication.__dict__, sort_keys=True), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
