"""One-shot check: the committed fixtures still equal Python's own inputs.

CV22.DS10.TS3 gate item 2 asks that both harnesses read the same transcripts
while Python still exists. The Plan took a deliberate deviation from the
literal wording: Python is NOT rewired to load the JSON, because plateau 6
deletes ``evals/`` inside this same story and a Python fixture loader would be
throwaway code. This check stands in its place.

It re-runs the capture and asserts that what the Python probes feed the
pipeline today is byte-identical to what the committed fixtures hold. If a
transcript is edited on either side, this fails and names the probe.

Scope, stated honestly: this proves the **inputs** match. It cannot prove the
expectations match, because those live in each probe's assertion rather than
in the data. Those are covered by the plateau-5 per-probe verdict diff: a
misread expectation makes the TS probe disagree with the Python record on the
same input, which the diff protocol catches by construction.

Dies with ``evals/`` at plateau 6, like the capture script and the support
golden generator -- the fixture and its oracle die together.

Run (as a module, from the repo root):
    uv run python -m evals._check_fixture_equality
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from evals._capture_probe_inputs import (
    LIVE_MODULES,
    OUT_DIR,
    capture_module,
    _normalize_nondeterminism,
)


def main() -> int:
    failures: list[str] = []
    checked = 0

    for module_name in LIVE_MODULES:
        path = OUT_DIR / f"{module_name}.json"
        if not path.exists():
            failures.append(f"{module_name}: no committed fixture at {path}")
            continue

        committed = json.loads(path.read_text(encoding="utf-8"))
        live = _normalize_nondeterminism(
            capture_module(module_name), capture_module(module_name, reload=True)
        )

        committed_probes = {p["id"]: p for p in committed["probes"]}
        live_probes = {p["id"]: p for p in live["probes"]}

        if committed_probes.keys() != live_probes.keys():
            missing = live_probes.keys() - committed_probes.keys()
            extra = committed_probes.keys() - live_probes.keys()
            failures.append(f"{module_name}: probe set differs (missing={missing} extra={extra})")
            continue

        if committed["threshold"] != live["threshold"]:
            failures.append(
                f"{module_name}: THRESHOLD moved "
                f"({committed['threshold']} -> {live['threshold']})"
            )

        for probe_id, live_probe in live_probes.items():
            checked += 1
            if committed_probes[probe_id]["calls"] != live_probe["calls"]:
                failures.append(f"{module_name}/{probe_id}: pipeline inputs differ")

    total_probes = sum(
        len(json.loads((OUT_DIR / f"{m}.json").read_text())["probes"])
        for m in LIVE_MODULES
        if (OUT_DIR / f"{m}.json").exists()
    )
    print(f"fixture equality: {checked}/{total_probes} probes compared against live Python inputs")
    for failure in failures:
        print(f"  ✗ {failure}")
    if failures:
        print(f"fixture equality: FAILED ({len(failures)} finding(s))")
        return 1
    print(f"fixture equality: clean -- {len(LIVE_MODULES)} modules, every probe's inputs identical")
    return 0


if __name__ == "__main__":
    sys.exit(main())
