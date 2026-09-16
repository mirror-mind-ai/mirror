"""Generate the extension catalog WRITES golden (CV22.DS7.TS4 plateau 5).

`extensions sync|install|uninstall|expose-claude|clean-claude` are graded the
way `builder_artifacts` is: not by what they print but by what they leave on
disk. Every case records

  * the streams and exit code of the real CLI in a subprocess;
  * the complete FILE TREE of the mirror home, the runtime target root, and the
    Claude project root, each file by sha256, with the two catalog documents
    also carried verbatim because their bytes are the contract; and
  * the `_ext_migrations` / `_ext_bindings` rows and the extension tables,
    because install runs migrations and a full uninstall deletes bindings while
    deliberately PRESERVING the extension's data tables (decision D4).

Every case runs in a disposable home AND a disposable target root under the
system temp directory. The plan-stage panel named this explicitly: a corpus for
these commands must never be able to reach the developer's own `.pi`.

Timestamps: the catalog carries `generated_at`, so its value is tokenised here
and injected through a clock seam in TypeScript. The SHAPE is asserted; the
bytes around it are graded exactly.

Usage:
    uv run python ts/parity/generate_ext_catalog_writes_golden.py
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
FIXTURES = REPO_ROOT / "ts" / "test" / "fixtures" / "ext-catalog-writes"
GOLDEN_PATH = REPO_ROOT / "ts" / "test" / "fixtures" / "ext-catalog-writes.golden.json"
TIMESTAMP_TOKEN = "<TIMESTAMP>"
ISO_UTC_RE = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?\+00:00")
CATALOG_FILES = ("extensions.json", "extensions.external.json")

# (label, argv after `extensions`, divergence-class or None). Ordered: a case
# sees what the ones before it wrote, which is how install-then-uninstall and
# expose-then-clean are graded as sequences rather than as isolated calls.
CASES: list[tuple[str, list[str], str | None]] = [
    # --- sync: no install, just the runtime skill surface -------------------
    ("sync_requires_a_runtime", ["sync", "--extensions-root", "<SRC>"], None),
    (
        "sync_requires_a_target_root",
        ["sync", "--extensions-root", "<SRC>", "--runtime", "pi"],
        None,
    ),
    (
        "sync_pi_from_the_source_root",
        ["sync", "--extensions-root", "<SRC>", "--runtime", "pi", "--target-root", "<TARGET>"],
        None,
    ),
    (
        "sync_pi_again_is_stable",
        ["sync", "--extensions-root", "<SRC>", "--runtime", "pi", "--target-root", "<TARGET>"],
        None,
    ),
    (
        "sync_claude_maps_the_colon_command_to_a_safe_dir",
        ["sync", "--extensions-root", "<SRC>", "--runtime", "claude", "--target-root", "<TARGET>"],
        None,
    ),
    # --- install -----------------------------------------------------------
    ("install_requires_an_extensions_root", ["install", "notes"], None),
    ("install_requires_exactly_one_id", ["install", "notes", "extra"], None),
    (
        "install_a_command_skill",
        ["install", "notes", "--extensions-root", "<SRC>"],
        None,
    ),
    (
        "install_again_is_idempotent",
        ["install", "notes", "--extensions-root", "<SRC>"],
        None,
    ),
    (
        "install_a_prompt_skill_skips_python",
        ["install", "guide", "--extensions-root", "<SRC>"],
        None,
    ),
    (
        "install_refuses_to_copy_caches_and_vcs",
        ["install", "noisy", "--extensions-root", "<SRC>"],
        None,
    ),
    (
        "install_one_runtime_only",
        ["install", "notes", "--extensions-root", "<SRC>", "--runtime", "pi"],
        None,
    ),
    (
        "install_identifies_by_directory_name_not_manifest_id",
        ["install", "ext-mismatch", "--extensions-root", "<SRC>"],
        "python_traceback",
    ),
    (
        "install_a_missing_source",
        ["install", "ghost", "--extensions-root", "<SRC>"],
        "python_traceback",
    ),
    # --- expose-claude / clean-claude --------------------------------------
    ("expose_claude_requires_a_target_root", ["expose-claude"], None),
    ("expose_claude_writes_the_overlay", ["expose-claude", "--target-root", "<PROJECT>"], None),
    ("expose_claude_again_reuses_the_overlay", ["expose-claude", "--target-root", "<PROJECT>"], None),
    ("clean_claude_keeps_a_directory_that_is_not_only_ours", ["clean-claude", "--target-root", "<PROJECT>"], None),
    ("expose_claude_after_the_kept_directory", ["expose-claude", "--target-root", "<PROJECT>"], None),
    (
        "clean_claude_keeps_a_directory_that_is_not_only_ours",
        ["clean-claude", "--target-root", "<PROJECT>"],
        None,
    ),
    ("expose_claude_after_the_kept_directory", ["expose-claude", "--target-root", "<PROJECT>"], None),
    ("clean_claude_removes_what_it_exposed", ["clean-claude", "--target-root", "<PROJECT>"], None),
    ("clean_claude_on_a_clean_project", ["clean-claude", "--target-root", "<PROJECT>"], None),
    # --- uninstall ---------------------------------------------------------
    ("uninstall_one_runtime_keeps_the_source", ["uninstall", "notes", "--runtime", "pi"], None),
    ("uninstall_removes_the_source_and_bindings", ["uninstall", "notes"], None),
    ("uninstall_a_missing_extension", ["uninstall", "ghost"], None),
]


# Files written BEFORE a case runs, recorded so the replay reproduces the same
# world. The single entry is the whole point of its case: `clean-claude` removes
# only an EMPTY parent, so a directory holding a file a human put there must
# survive with that file intact. Without it, a mutant that deletes the parent
# unconditionally passes the entire corpus.
PREPARATIONS: dict[str, list[tuple[str, str]]] = {
    "clean_claude_keeps_a_directory_that_is_not_only_ours": [
        ("<PROJECT>/.claude/skills/ext-notes/NOTES.md", "a human wrote this\n"),
    ],
}


def _environment(home: Path) -> dict[str, str]:
    env = dict(os.environ)
    for key in list(env):
        if key.startswith("MIRROR_TS_") or key in {"MIRROR_HOME", "MIRROR_USER", "DB_PATH"}:
            del env[key]
    env["MIRROR_HOME"] = str(home)
    env["MEMORY_ENV"] = "test"
    env["OPENROUTER_API_KEY"] = ""
    env["PYTHONIOENCODING"] = "utf-8"
    env["NO_COLOR"] = "1"
    return env


def _digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:16]


def _tree(root: Path, home: Path, target: Path, project: Path, source: Path) -> dict[str, object]:
    """Every file under `root`, by relative path, with the catalogs verbatim.

    Two kinds of file are recorded as a MARKER rather than a digest, because
    their bytes are not a portable contract and recording them would fail the
    determinism gate on any machine but the recording one:

      * a `__pycache__` directory -- collapsed to one entry. It is not copied by
        install (`__pycache__` is in the ignore patterns); it appears because
        the post-install step IMPORTS the extension to validate `register`, and
        both its bytes and its `cpython-3XY` filename depend on the
        interpreter. That a cache appeared at all is the fact worth keeping.
      * the database file -- graded by its ROWS below, never by its pages. Its
        `-wal` / `-shm` sidecars are skipped outright: they exist only while a
        connection is open, so Python's subprocess leaves none and a TypeScript
        replay holding the database open leaves two. Journal state is not
        product state.
    """
    if not root.exists():
        return {}
    files: dict[str, object] = {}
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        relative = path.relative_to(root)
        if "__pycache__" in relative.parts:
            index = relative.parts.index("__pycache__")
            files["/".join([*relative.parts[:index], "__pycache__"])] = "<python bytecode cache>"
            continue
        key = str(relative)
        if path.name in CATALOG_FILES:
            files[key] = {
                "text": _redact(path.read_text(encoding="utf-8"), home, target, project, source)
            }
            continue
        if path.name.endswith(("-wal", "-shm")):
            continue
        if path.suffix == ".db":
            files[key] = "<database, graded by its rows>"
            continue
        files[key] = _digest(path)
    return dict(sorted(files.items()))


def _redact(text: str, home: Path, target: Path, project: Path, source: Path) -> str:
    replaced = text
    # Longest first: the target root lives inside the home in the install cases.
    for token, path in (
        ("<TARGET>", target),
        ("<PROJECT>", project),
        ("<SRC>", source),
        ("<HOME>", home),
    ):
        replaced = replaced.replace(str(path), token)
    return ISO_UTC_RE.sub(TIMESTAMP_TOKEN, replaced)


def _database(home: Path) -> dict[str, object]:
    db_path = home / "memory_test.db"
    if not db_path.is_file():
        return {"migrations": [], "bindings": [], "tables": []}
    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    try:
        migrations = [
            {**dict(row), "applied_at": TIMESTAMP_TOKEN}
            for row in connection.execute(
                "SELECT extension_id, filename, applied_at FROM _ext_migrations ORDER BY filename"
            )
        ]
        bindings = [
            {**dict(row), "created_at": TIMESTAMP_TOKEN}
            for row in connection.execute(
                "SELECT extension_id, capability_id, target_kind, target_id, created_at "
                "FROM _ext_bindings ORDER BY extension_id, capability_id"
            )
        ]
        tables = [
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'ext_%' "
                "ORDER BY name"
            )
        ]
    finally:
        connection.close()
    return {"migrations": migrations, "bindings": bindings, "tables": tables}


def _run(world: dict[str, Path], argv: list[str]) -> dict[str, object]:
    resolved = [
        token.replace("<SRC>", str(world["source"]))
        .replace("<TARGET>", str(world["target"]))
        .replace("<PROJECT>", str(world["project"]))
        for token in argv
    ]
    completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "memory",
            "extensions",
            *resolved,
            "--mirror-home",
            str(world["home"]),
        ],
        cwd=REPO_ROOT,
        env=_environment(world["home"]),
        capture_output=True,
        text=True,
    )
    redact = lambda text: _redact(  # noqa: E731
        text, world["home"], world["target"], world["project"], world["source"]
    )
    return {
        "argv": argv,
        "stdout": redact(completed.stdout),
        "stderr": redact(completed.stderr),
        "exit_code": completed.returncode,
    }


def _state(world: dict[str, Path]) -> dict[str, object]:
    args = (world["home"], world["target"], world["project"], world["source"])
    return {
        "home": _tree(world["home"], *args),
        "target": _tree(world["target"], *args),
        "project": _tree(world["project"], *args),
        "database": _database(world["home"]),
    }


def _make_world(tmp: Path) -> dict[str, Path]:
    from memory.db.schema import SCHEMA

    world = {
        "home": tmp / "mirror",
        "target": tmp / "runtime-target",
        "project": tmp / "project",
        "source": tmp / "source",
    }
    shutil.copytree(FIXTURES, world["source"])
    world["home"].mkdir(parents=True)
    world["project"].mkdir(parents=True)
    connection = sqlite3.connect(world["home"] / "memory_test.db")
    try:
        connection.executescript(SCHEMA)
        # A binding a FULL uninstall must delete, next to one it must not touch.
        connection.executemany(
            "INSERT INTO _ext_bindings "
            "(extension_id, capability_id, target_kind, target_id, created_at) "
            "VALUES (?, ?, ?, ?, '2026-01-01T00:00:00+00:00')",
            [("notes", "recent", "persona", "engineer"), ("other", "keep", "global", None)],
        )
        connection.commit()
    finally:
        connection.close()
    return world


def main() -> int:
    cases: list[dict[str, object]] = []
    with tempfile.TemporaryDirectory(prefix="ext-catalog-writes-golden-") as raw_tmp:
        world = _make_world(Path(raw_tmp))
        for label, argv, divergence in CASES:
            prepared: list[dict[str, str]] = []
            for raw_path, content in PREPARATIONS.get(label, []):
                path = Path(raw_path.replace("<PROJECT>", str(world["project"])))
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(content, encoding="utf-8")
                prepared.append({"path": raw_path, "content": content})
            answer = _run(world, argv)
            if divergence == "python_traceback":
                answer["stderr_final_line"] = str(answer["stderr"]).rstrip("\n").rsplit("\n", 1)[-1]
                answer["stderr"] = None
            case: dict[str, object] = {"label": label, "prepare": prepared, **answer, **_state(world)}
            if divergence is not None:
                case["divergence"] = divergence
            cases.append(case)

    document = {
        "_generated_by": "ts/parity/generate_ext_catalog_writes_golden.py",
        "_semantics": (
            "Python's answer for `extensions sync|install|uninstall|expose-claude|clean-claude`: "
            "streams and exit code, plus the complete file tree of the mirror home, the runtime "
            "target root, and the Claude project root after each step, plus the extension rows "
            "and tables. Files are sha256-prefixed; the catalog documents carry their text, "
            "because their bytes are the contract. Cases carrying a `divergence` field record "
            "`stderr` as null and keep `stderr_final_line`: a CPython traceback is not portable."
        ),
        "timestamp_token": TIMESTAMP_TOKEN,
        "cases": cases,
    }
    GOLDEN_PATH.write_text(
        json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"wrote {GOLDEN_PATH.relative_to(REPO_ROOT)} ({len(cases)} cases)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
