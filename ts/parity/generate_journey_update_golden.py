"""Generate the committed `journey update` golden (CR073).

Drives the REAL `memory.cli.journey.main(["update", ...])` oracle over the
CR073 accept/refuse matrix on a fresh temporary mirror home per case, and
records what the front door must reproduce byte for byte: the exit code, the
stderr text, and the journey path that remains in the database afterwards.

Why this exists: the stdin sentinel is exactly `-`, and the usage string used
to read `<content|-stdin>`. A caller who follows that literally stores the six
characters `-stdin` as the path, discards the piped document, and is told it
succeeded (it happened on 2026-09-09). The guard refuses FLAG-SHAPED content
(`^--?[A-Za-z]`) and nothing else -- four of six real journey paths carry
markdown lists, so `- item` must remain valid. The corpus pins both halves:
every refusal AND every accept.

Also pins the usage path (no content argument), which exits 1 on the oracle.

Run:  uv run python ts/parity/generate_journey_update_golden.py
"""

from __future__ import annotations

import contextlib
import io
import json
import sys
import tempfile
from pathlib import Path

from memory import MemoryClient
from memory.cli.journey import main as journey_main
from memory.config import default_db_path_for_home

HERE = Path(__file__).resolve().parent
OUT_PATH = HERE.parent / "test" / "goldens" / "journey-update.golden.json"

SLUG = "probe"
BEFORE = "# Before\n"

# (label, content argument or None for the usage path, stdin text or None)
CASES: tuple[tuple[str, str | None, str | None], ...] = (
    ("incident: -stdin", "-stdin", "# piped document\n"),
    ("flag-shaped: --stdin", "--stdin", None),
    ("flag-shaped: -s", "-s", None),
    ("flag-shaped: --content", "--content", None),
    ("empty", "", None),
    ("whitespace", "   ", None),
    ("newline only", "\n", None),
    ("sentinel with stdin", "-", "# From stdin\n"),
    ("markdown list from line one", "- phase 1\n- phase 2", None),
    ("em-dash lead", "\u2014 em-dash lead", None),
    ("ordinary text", "DS7 \u2014 Command Burn-Down (11/15)", None),
    ("hyphen inside text", "phase-1 and phase-2", None),
    ("usage: no content", None, None),
)


def run_case(content: str | None, stdin_text: str | None) -> dict:
    with tempfile.TemporaryDirectory() as tmp:
        home = Path(tmp) / "home"
        db_path = default_db_path_for_home(home)
        mem = MemoryClient(env="test", db_path=db_path)
        mem.set_identity("journey", SLUG, "# Probe\n**Status:** active\n")
        mem.set_journey_path(SLUG, BEFORE)

        argv = ["update", SLUG]
        if content is not None:
            argv.append(content)
        argv += ["--mirror-home", str(home)]

        err = io.StringIO()
        exit_code = 0
        stdin_backup = sys.stdin
        try:
            if stdin_text is not None:
                sys.stdin = io.StringIO(stdin_text)
            with contextlib.redirect_stderr(err):
                try:
                    journey_main(argv)
                except SystemExit as exc:  # the oracle exits on refusal
                    exit_code = int(exc.code or 0)
        finally:
            sys.stdin = stdin_backup

        after = MemoryClient(env="test", db_path=db_path).get_journey_status(SLUG)[SLUG][
            "journey_path"
        ]
        return {"exit": exit_code, "stderr": err.getvalue(), "journey_path_after": after}


def main() -> None:
    cases = []
    for label, content, stdin_text in CASES:
        result = run_case(content, stdin_text)
        cases.append({"label": label, "content": content, "stdin": stdin_text, **result})
    golden = {"before": BEFORE, "slug": SLUG, "cases": cases}
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(
        json.dumps(golden, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    refused = sum(1 for c in cases if c["exit"] != 0)
    print(f"cases: {len(cases)} (refused {refused}, accepted {len(cases) - refused})")
    print(f"wrote {OUT_PATH.relative_to(HERE.parent.parent)}")


if __name__ == "__main__":
    main()
