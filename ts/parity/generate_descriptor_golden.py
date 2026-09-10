"""Generate the committed `descriptor generate` golden (CV22.DS7.US11 plateau 5).

Drives the REAL `memory.cli.descriptor` oracle with the model stubbed,
recording stdout, stderr, the exit code, the `descriptors` rows, and the
`llm_calls` rows.

The ledger assertion is the point of that last one: `_cmd_generate` calls
`generate_descriptor` WITHOUT an `on_llm_call`, so this is the only LLM role in
the product that writes NO ledger row. Parity preserves the gap -- the corpus
records zero rows so the port cannot "helpfully" start logging and diverge.
Closing it is a DS8 input, recorded in the plan.

Hermetic by construction (CR065): `OPENROUTER_API_KEY` is popped before
`memory` is imported.

Branches exercised:
  - `--layer --key` for a missing identity -> stderr + exit 1;
  - `--layer --key` for one that exists -> one target;
  - `--layer` alone -> every identity in that layer;
  - neither -> personas THEN journeys, in that order;
  - no identities at all -> "No entities found to describe." and exit 0;
  - an empty model response -> "skipped (empty response)", no row written,
    and the target still counts in the denominator;
  - a descriptor longer than 80 characters -> the preview is truncated with an
    ellipsis, and the 80 is CODE POINTS (a non-BMP case proves it);
  - a descriptor of exactly 80 -> no ellipsis (the boundary).

Run:  uv run python ts/parity/generate_descriptor_golden.py
"""

from __future__ import annotations

import contextlib
import io
import json
import os
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT_PATH = HERE.parent / "test" / "goldens" / "descriptor.golden.json"


class _StubResponse:
    def __init__(self, content: str) -> None:
        self.content = content
        self.model = "stub/model"
        self.generation_id = None
        self.prompt_tokens = 13
        self.completion_tokens = 5
        self.latency_ms = 2
        self.cost_usd = None


def _run_case(tmp: Path, argv: list[str], identities: list[dict], responses: list[str]) -> dict:
    from memory.client import MemoryClient
    from memory.intelligence import extraction as extraction_module

    home = tmp / "home"
    db_path = home / "memory.db"
    os.environ["DB_PATH"] = str(db_path)

    mem = MemoryClient(env="test", db_path=db_path)
    for identity in identities:
        mem.set_identity(identity["layer"], identity["key"], identity["content"])

    remaining = list(responses)

    def fake_send_to_model(model, messages, **kwargs):  # noqa: ANN001, ANN003
        return _StubResponse(remaining.pop(0) if remaining else "")

    extraction_module.send_to_model = fake_send_to_model

    from memory.cli import descriptor as descriptor_cli

    out, err = io.StringIO(), io.StringIO()
    exit_code = 0
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        try:
            # `--mirror-home` belongs to the PARENT parser, so it precedes the
            # subcommand; passing it last is an argparse error (exit 2).
            descriptor_cli.main(["--mirror-home", str(home), *argv])
        except SystemExit as exc:
            exit_code = int(exc.code or 0)

    descriptors = [
        dict(row)
        for row in mem.store.conn.execute(
            "SELECT layer, key, descriptor FROM identity_descriptors ORDER BY layer, key"
        ).fetchall()
    ]
    llm_calls = [
        dict(row)
        for row in mem.store.conn.execute(
            "SELECT role FROM llm_calls ORDER BY called_at"
        ).fetchall()
    ]
    return {
        "stdout": out.getvalue(),
        "stderr": err.getvalue(),
        "exit": exit_code,
        "descriptors": descriptors,
        "llm_calls": llm_calls,
    }


PERSONA = {"layer": "persona", "key": "engineer", "content": "I drive the code."}
JOURNEY = {"layer": "journey", "key": "mirror-ts-core", "content": "Port the core."}

LONG = "A" * 95
EXACTLY_80 = "B" * 80
NON_BMP_LONG = "\U0001f30d" + "C" * 100

CASES: tuple[tuple[str, list[str], list[dict], list[str]], ...] = (
    ("no identities at all", ["generate"], [], []),
    (
        "missing identity with --layer --key",
        ["generate", "--layer", "persona", "--key", "absent"],
        [PERSONA],
        [],
    ),
    (
        "one target via --layer --key",
        ["generate", "--layer", "persona", "--key", "engineer"],
        [PERSONA],
        ["Routes engineering questions."],
    ),
    (
        "--layer alone covers the layer",
        ["generate", "--layer", "journey"],
        [PERSONA, JOURNEY],
        ["Routes port questions."],
    ),
    (
        "no flags: personas THEN journeys",
        ["generate"],
        [PERSONA, JOURNEY],
        ["Persona descriptor.", "Journey descriptor."],
    ),
    (
        "empty response is skipped but still counted",
        ["generate", "--layer", "persona", "--key", "engineer"],
        [PERSONA],
        [""],
    ),
    (
        "long descriptor preview is truncated with an ellipsis",
        ["generate", "--layer", "persona", "--key", "engineer"],
        [PERSONA],
        [LONG],
    ),
    (
        "exactly 80 characters: no ellipsis",
        ["generate", "--layer", "persona", "--key", "engineer"],
        [PERSONA],
        [EXACTLY_80],
    ),
    (
        "non-BMP descriptor: the 80 is code points",
        ["generate", "--layer", "persona", "--key", "engineer"],
        [PERSONA],
        [NON_BMP_LONG],
    ),
)


def main() -> None:
    for key in ("MEMORY_DIR", "MEMORY_PROD_DIR", "MEMORY_ENV", "OPENROUTER_API_KEY"):
        os.environ.pop(key, None)
    os.environ["MEMORY_RECEPTION"] = "0"

    cases = []
    for label, argv, identities, responses in CASES:
        with tempfile.TemporaryDirectory() as tmp:
            result = _run_case(Path(tmp), list(argv), identities, responses)
        cases.append(
            {
                "label": label,
                "argv": argv,
                "identities": identities,
                "responses": responses,
                **result,
            }
        )

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(
        json.dumps({"cases": cases}, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    for case in cases:
        print(
            f"  {case['label'][:50]:<50} exit={case['exit']} "
            f"rows={len(case['descriptors'])} llm_rows={len(case['llm_calls'])}"
        )
    print(f"cases: {len(cases)}")
    print(f"wrote {OUT_PATH.relative_to(HERE.parent.parent)}")


if __name__ == "__main__":
    sys.exit(main())
