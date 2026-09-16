"""Generate the `identity edit` golden (CV22.DS7.TS4 plateau 6, Scope F).

`identity edit <layer> <key>` opens the stored content in `$EDITOR` and saves
what comes back. The editor is the whole difficulty: a corpus for this command
has to script one, and both engines must run the SAME one or they are not being
compared. So the editors here are plain POSIX `sh` scripts, written into the
disposable home and carried in the golden, and the replay runs the identical
files.

Each case records the streams, the exit code, and the identity ROW afterwards —
the row is the point, because "No changes detected." and a silent overwrite
print differently but both leave exit 0.

Two facts are NOT recorded here and are asserted in the TypeScript test
instead, because they are about the temp file rather than the command's output:
the file is created mode 0600, and it is removed on every path. Measured on the
real CLI: `mirror-identity-ego-behavior-nk5f8xjr.md`, mode `0o600`, holding the
current content.

Usage:
    uv run python ts/parity/generate_identity_edit_golden.py
"""

from __future__ import annotations

import json
import os
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
GOLDEN_PATH = REPO_ROOT / "ts" / "test" / "goldens" / "identity-edit.golden.json"

# name -> POSIX sh body. `$1` is the temp file the command opened.
EDITORS: dict[str, str] = {
    "append": "#!/bin/sh\nprintf 'edited line\\n' >> \"$1\"\n",
    "noop": "#!/bin/sh\nexit 0\n",
    "blank": "#!/bin/sh\nprintf '   \\n' > \"$1\"\n",
    "replace": "#!/bin/sh\nprintf 'a whole new behavior\\n' > \"$1\"\n",
    "fail": "#!/bin/sh\nexit 3\n",
    # Proves the editor receives the CURRENT content, not an empty buffer.
    "echo_back": '#!/bin/sh\nprintf \'seen:\' > "$1".seen\ncat "$1" >> "$1".seen\ncat "$1".seen > "$1"\n',
}

# (label, argv after `identity`, editor name or None, environment overrides)
CASES: list[tuple[str, list[str], str | None, dict[str, str]]] = [
    ("edit_with_no_change", ["edit", "ego", "behavior"], "noop", {}),
    ("edit_appends_a_line", ["edit", "ego", "behavior"], "append", {}),
    ("edit_sees_the_current_content", ["edit", "ego", "behavior"], "echo_back", {}),
    ("edit_replaces_the_content", ["edit", "ego", "behavior"], "replace", {}),
    ("edit_creates_a_missing_key", ["edit", "ego", "fresh"], "replace", {}),
    ("edit_refuses_blank_content", ["edit", "ego", "behavior"], "blank", {}),
    ("edit_refuses_a_failed_editor", ["edit", "ego", "behavior"], "fail", {}),
    # VISUAL is the documented fallback when EDITOR is unset.
    ("edit_falls_back_to_visual", ["edit", "ego", "behavior"], None, {"VISUAL": "<EDITOR:append>"}),
    ("edit_requires_both_arguments", ["edit", "ego"], "noop", {}),
]


def _environment(home: Path, editors: dict[str, Path], overrides: dict[str, str]) -> dict[str, str]:
    env = dict(os.environ)
    for key in list(env):
        if key.startswith("MIRROR_TS_") or key in {
            "MIRROR_HOME",
            "MIRROR_USER",
            "DB_PATH",
            "EDITOR",
            "VISUAL",
        }:
            del env[key]
    env["MIRROR_HOME"] = str(home)
    env["MEMORY_ENV"] = "test"
    env["OPENROUTER_API_KEY"] = ""
    env["PYTHONIOENCODING"] = "utf-8"
    for key, value in overrides.items():
        if value.startswith("<EDITOR:"):
            env[key] = str(editors[value[len("<EDITOR:") : -1]])
        else:
            env[key] = value
    return env


def _identity_rows(db_path: Path) -> list[dict[str, Any]]:
    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    try:
        return [
            {"layer": row["layer"], "key": row["key"], "content": row["content"]}
            for row in connection.execute(
                "SELECT layer, key, content FROM identity ORDER BY layer, key"
            )
        ]
    finally:
        connection.close()


def main() -> int:
    for key in ("MEMORY_DIR", "MEMORY_PROD_DIR", "OPENROUTER_API_KEY"):
        os.environ.pop(key, None)

    cases: list[dict[str, Any]] = []
    with tempfile.TemporaryDirectory(prefix="identity-edit-golden-") as raw_tmp:
        tmp = Path(raw_tmp)
        home = tmp / "mirror"
        home.mkdir(parents=True)
        db_path = home / "memory_test.db"
        os.environ["DB_PATH"] = str(db_path)

        from memory.client import MemoryClient

        mem = MemoryClient(env="test", db_path=db_path)
        mem.set_identity("ego", "behavior", "original content\n")
        mem.store.conn.commit()
        mem.store.conn.close()

        editors: dict[str, Path] = {}
        for name, body in EDITORS.items():
            path = tmp / f"editor-{name}"
            path.write_text(body, encoding="utf-8")
            path.chmod(0o755)
            editors[name] = path

        for label, argv, editor_name, overrides in CASES:
            environment = _environment(home, editors, overrides)
            if editor_name is not None:
                environment["EDITOR"] = str(editors[editor_name])
            completed = subprocess.run(
                [sys.executable, "-m", "memory", "identity", *argv, "--mirror-home", str(home)],
                cwd=REPO_ROOT,
                env=environment,
                capture_output=True,
                text=True,
            )
            cases.append(
                {
                    "label": label,
                    "argv": argv,
                    "editor": editor_name,
                    "environment": overrides,
                    "stdout": completed.stdout,
                    "stderr": completed.stderr,
                    "exit_code": completed.returncode,
                    "identity_after": _identity_rows(db_path),
                }
            )

    document = {
        "_generated_by": "ts/parity/generate_identity_edit_golden.py",
        "_semantics": (
            "Python's answer for `identity edit <layer> <key>` with a scripted editor: the "
            "streams, the exit code, and every identity row afterwards. The editors are POSIX "
            "sh scripts carried here so both engines run the identical file. The temp file's "
            "0600 mode and its removal are asserted in the TypeScript test, not here."
        ),
        "editors": EDITORS,
        "seed": {"layer": "ego", "key": "behavior", "content": "original content\n"},
        "cases": cases,
    }
    GOLDEN_PATH.write_text(
        json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"wrote {GOLDEN_PATH.relative_to(REPO_ROOT)} ({len(cases)} cases)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
