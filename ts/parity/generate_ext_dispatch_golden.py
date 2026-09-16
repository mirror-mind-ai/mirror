"""Generate the `ext <id> <subcommand>` dispatch golden (CV22.DS7.TS4 plateau 4).

This corpus grades the ONE leaf in DS7 whose behavior is decided by code Mirror
does not own. What is recorded per case:

  * the streams and exit code of `python -m memory ext <id> [<subcommand> ...]`,
    recorded from the real CLI in a subprocess; and
  * the rows in `ext_tools_notes` afterwards, because a dispatch that prints the
    right line while the handler's write lands in a DIFFERENT database is
    exactly the defect the compat host's `cli` mode could introduce.

Two recorded divergence classes, marked per case rather than graded byte for
byte (`divergence` field):

  * `python_traceback` -- an unhandled exception escapes as a CPython
    traceback. TypeScript cannot reproduce those bytes; the graded contract is
    the input, the stream, and the exit code. TWO different failures land here,
    and the reason is worth keeping: `memory.cli.extensions` defines its OWN
    `ExtensionValidationError(ValueError)`, unrelated to the `ExtensionError`
    hierarchy in `memory.extensions.errors` that `_dispatch_subcommand`
    catches. A failing `register` is therefore a printed line at exit 1, while
    a bad or missing MANIFEST escapes as a traceback at the same exit code.
  * `python_path_display` -- the "not installed" line interpolates the path
    Python built with `/` and NEVER normalized, so a traversal id prints
    `.../extensions/../../etc`. The TS port must not normalize it away.

Usage:
    uv run python ts/parity/generate_ext_dispatch_golden.py
"""

from __future__ import annotations

import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
FIXTURES = REPO_ROOT / "ts" / "test" / "fixtures" / "ext-dispatch"
GOLDEN_PATH = REPO_ROOT / "ts" / "test" / "fixtures" / "ext-dispatch.golden.json"
EXTENSIONS = ("tools", "silent", "broken", "malformed")

# (label, argv after `ext`, divergence-class or None). Ordered: later cases see
# the writes earlier ones made.
CASES: list[tuple[str, list[str], str | None]] = [
    # --- the subcommand listing -------------------------------------------
    ("listing_bare_id", ["tools"], None),
    ("listing_long_help_flag", ["tools", "--help"], None),
    ("listing_short_help_flag", ["tools", "-h"], None),
    ("listing_help_word", ["tools", "help"], None),
    ("listing_empty_registry", ["silent"], None),
    # --- argv reaches the handler -----------------------------------------
    ("echo_argv_verbatim", ["tools", "echo", "alpha", "beta gamma"], None),
    ("echo_no_argv", ["tools", "echo"], None),
    ("echo_keeps_flags_and_double_dash", ["tools", "echo", "--flag", "-x", "--", "a b"], None),
    ("echo_keeps_unicode_and_quotes", ["tools", "echo", "café 'quoted'", "—em"], None),
    # The dispatcher strips `--mirror-home <value>` from ANYWHERE in argv,
    # including the extension's own tail. The handler never sees it.
    ("echo_loses_the_mirror_home_pair", ["tools", "echo", "--mirror-home", "/tmp/x", "tail"], None),
    # A trailing `--mirror-home` with NO value is not a pair, so it survives
    # into the handler's argv. Recorded with the harness flag moved to the
    # front, which also pins that the splitter consumes the flag from any
    # position, not just the tail.
    ("echo_keeps_a_valueless_mirror_home", ["tools", "echo", "tail", "--mirror-home"], None),
    # --- exit codes and failures ------------------------------------------
    ("exit_code_is_preserved", ["tools", "fail"], None),
    ("string_exit_code_is_coerced", ["tools", "stringy"], None),
    ("extension_error_is_a_printed_line", ["tools", "boom"], None),
    ("unhandled_exception_escapes", ["tools", "crash"], "python_traceback"),
    ("none_return_escapes", ["tools", "nothing"], "python_traceback"),
    ("both_streams_reach_the_caller", ["tools", "streams"], None),
    # --- the write seam ----------------------------------------------------
    ("write_reaches_the_dispatcher_database", ["tools", "write", "first note"], None),
    ("write_again", ["tools", "write", "second note"], None),
    # --- refusals ----------------------------------------------------------
    ("unknown_subcommand_lists_what_exists", ["tools", "nope"], None),
    ("unknown_subcommand_on_empty_registry", ["silent", "anything"], None),
    ("load_failure_on_dispatch", ["broken", "anything"], None),
    ("load_failure_on_listing", ["broken"], None),
    ("extension_not_installed", ["ghost", "ping"], None),
    ("extension_not_installed_listing", ["ghost"], None),
    ("traversal_id_is_printed_unnormalized", ["../../etc", "ping"], "python_path_display"),
    # `Path(root) / "/etc"` DISCARDS the root: an absolute id escapes the
    # extensions directory entirely. A TS port that concatenates strings would
    # answer `not installed` where Python reads a real directory.
    ("absolute_id_discards_the_extensions_root", ["/etc", "ping"], "python_traceback"),
    ("dot_id_is_the_extensions_root", [".", "ping"], "python_traceback"),
    ("trailing_slash_id_loses_the_slash", ["ghost/", "ping"], "python_path_display"),
    # The three manifest-validation escapes. Same exit code as a load failure,
    # a different stream, because a different exception family raises them.
    ("empty_id_reads_the_extensions_dir_itself", ["", "ping"], "python_traceback"),
    ("malformed_manifest_escapes", ["malformed", "ping"], "python_traceback"),
    ("malformed_manifest_escapes_on_listing", ["malformed"], "python_traceback"),
]

# Cases whose recorded argv must END the command line, so the harness passes
# `--mirror-home <home>` as a PREFIX instead of appending it.
HOME_FLAG_FIRST = {"echo_keeps_a_valueless_mirror_home"}


def _environment(home: Path) -> dict[str, str]:
    env = dict(os.environ)
    for key in list(env):
        if key.startswith("MIRROR_TS_") or key in {"MIRROR_HOME", "MIRROR_USER", "DB_PATH"}:
            del env[key]
    env["MIRROR_HOME"] = str(home)
    env["MEMORY_ENV"] = "test"
    env["OPENROUTER_API_KEY"] = ""
    env["PYTHONIOENCODING"] = "utf-8"
    # Keep the recorded traceback free of colour codes and source excerpts that
    # differ between CPython builds.
    env["NO_COLOR"] = "1"
    return env


def _make_home(tmp: Path) -> Path:
    from memory.db.schema import SCHEMA

    home = tmp / "mirror"
    (home / "extensions").mkdir(parents=True)
    for extension_id in EXTENSIONS:
        shutil.copytree(FIXTURES / extension_id, home / "extensions" / extension_id)
    connection = sqlite3.connect(home / "memory_test.db")
    try:
        connection.executescript(SCHEMA)
        connection.commit()
    finally:
        connection.close()
    return home


def _notes(home: Path) -> list[str]:
    connection = sqlite3.connect(home / "memory_test.db")
    try:
        exists = connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'ext_tools_notes'"
        ).fetchone()
        if exists is None:
            return []
        return [
            row[0] for row in connection.execute("SELECT note FROM ext_tools_notes ORDER BY id")
        ]
    finally:
        connection.close()


def _redact(text: str, home: Path) -> str:
    return text.replace(str(home), "<HOME>").replace(str(REPO_ROOT), "<REPO>")


def _run(home: Path, argv: list[str], *, home_flag_first: bool = False) -> dict[str, object]:
    flag = ["--mirror-home", str(home)]
    line = [*flag, *argv] if home_flag_first else [*argv, *flag]
    completed = subprocess.run(
        [sys.executable, "-m", "memory", "ext", *line],
        cwd=REPO_ROOT,
        env=_environment(home),
        capture_output=True,
        text=True,
    )
    return {
        "argv": argv,
        "stdout": _redact(completed.stdout, home),
        "stderr": _redact(completed.stderr, home),
        "exit_code": completed.returncode,
    }


def main() -> int:
    cases: list[dict[str, object]] = []
    with tempfile.TemporaryDirectory(prefix="ext-dispatch-golden-") as raw_tmp:
        home = _make_home(Path(raw_tmp))
        # The dispatcher never creates extension tables; `migrate` does, and
        # `ext-tools`' write handler needs its table to exist.
        _run(home, ["tools", "migrate"])
        for label, argv, divergence in CASES:
            home_flag_first = label in HOME_FLAG_FIRST
            answer = _run(home, argv, home_flag_first=home_flag_first)
            case: dict[str, object] = {
                "label": label,
                **answer,
                # Where the harness put `--mirror-home <home>`. Load-bearing:
                # the dispatcher consumes that pair from ANY position, so a
                # replay that moves it changes what the handler receives.
                "home_flag": "prefix" if home_flag_first else "suffix",
                "notes": _notes(home),
            }
            if divergence is not None:
                case["divergence"] = divergence
            cases.append(case)

    document = {
        "_generated_by": "ts/parity/generate_ext_dispatch_golden.py",
        "_semantics": (
            "Python's answer for `ext <id>` and `ext <id> <subcommand> [args...]`: streams, "
            "exit code, and the ext_tools_notes rows that exist afterwards. Cases carrying a "
            "`divergence` field are graded by class (input, stream, exit code), not by bytes: "
            "TypeScript cannot reproduce a CPython traceback."
        ),
        "extensions": list(EXTENSIONS),
        "cases": cases,
    }
    GOLDEN_PATH.write_text(
        json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"wrote {GOLDEN_PATH.relative_to(REPO_ROOT)} ({len(cases)} cases)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
