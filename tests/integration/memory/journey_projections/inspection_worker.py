from __future__ import annotations

import argparse
import json
from pathlib import Path

from memory.journey_projections.service import JourneyProjectionService


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--namespace", required=True)
    parser.add_argument("--result", required=True, type=Path)
    args = parser.parse_args()
    inspected = JourneyProjectionService(lambda _journey: args.root).inspect(
        "synthetic-journey", args.namespace, "tactical", domain="extension"
    )
    args.result.write_text(
        json.dumps(
            {"document": inspected.document, "manifest": inspected.manifest_entry},
            sort_keys=True,
        ),
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
