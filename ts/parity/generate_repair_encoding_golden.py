"""Generate the repair-encoding golden (CV22.DS7.TS1, plateau 1).

`repair-encoding` rewrites user-owned text -- identity documents, memories,
messages -- so a divergence is not a rendering nit: a wrong "repair" corrupts
the same data the command exists to protect. Every branch of the two-pass
repair is therefore graded case by case against the Python oracle, the scan
is graded as an ordered hit list over a fixture database that exercises the
missing-table / missing-column tolerance, the dry-run report is graded as
exact stdout, and `--apply` is graded as before/after row state on a
temporary fixture -- never against a real database.

The text corpus deliberately includes the divergence classes CV22.DS7.US10
found the hard way: astral code points after a lead byte (`.` must match one
CODE POINT, not one UTF-16 unit), Python's `str.split()` whitespace set
(which is not JavaScript's `\\s`), and code-point-based preview capping.

Run:  uv run python ts/parity/generate_repair_encoding_golden.py
"""

from __future__ import annotations

import io
import json
import os
import sqlite3
import tempfile
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT_PATH = HERE.parent / "test" / "goldens" / "repair-encoding.golden.json"

# label -> input text. Expected outputs come from the oracle, never by hand.
TEXT_CASES: tuple[tuple[str, str], ...] = (
    ("plain_ascii", "nothing to repair here"),
    ("empty", ""),
    ("latin1_e_acute", "caf\u00c3\u00a9"),
    ("latin1_c_cedilla_a_tilde", "a\u00c3\u00a7\u00c3\u00a3o"),
    ("latin1_ordinal", "1\u00c2\u00ba lugar"),
    ("cp1252_o_acute_via_left_quote", "\u00c3\u201c"),
    ("cp1252_e_acute_upper_via_permille", "\u00c3\u2030"),
    ("cp1252_a_grave_via_euro", "\u00c3\u20ac"),
    ("cp1252_e_circ_via_s_caron", "\u00c3\u0160"),
    ("cp1252_thorn_via_z_caron", "\u00c3\u017e"),
    ("cp1252_sharp_s_via_y_diaeresis", "\u00c3\u0178"),
    ("cp1252_c2_euro_becomes_c1_control", "\u00c2\u20ac"),
    ("legitimate_ancora_unchanged", "\u00c2ncora"),
    ("legitimate_a_tilde_before_space", "\u00c3 casa"),
    ("lead_at_end_unchanged", "fim \u00c3"),
    ("lead_before_newline_unchanged", "\u00c3\nlinha"),
    ("lead_before_ascii_unchanged", "\u00c3x"),
    ("lead_before_non_cp1252_unchanged", "\u00c3\u0100"),
    ("lead_before_astral_unchanged", "\u00c3\U0001f600"),
    ("astral_then_repairable_pair", "\u00c3\U0001f600\u00c3\u00a9"),
    ("overlapping_leads", "\u00c3\u00c3\u0081"),
    ("double_encoded_stays_single_pass", "\u00c3\u0083\u00c2\u00a9"),
    ("mixed_sentence", "Jo\u00c3\u00a3o comprou \u00c3\u201cculos \u00c2\u00ab caros \u00c2\u00bb"),
    ("cp1252_after_latin1_pass_result", "\u00c3\u00c2\u00a9"),
)

# label -> (input, limit). Preview collapses whitespace with str.split().
PREVIEW_CASES: tuple[tuple[str, str, int], ...] = (
    ("collapses_runs", "  a \t b\n\nc  ", 80),
    ("nbsp_is_whitespace", "a\u00a0b", 80),
    ("nel_is_whitespace", "a\u0085b", 80),
    ("file_separator_is_whitespace", "a\u001cb\u001d\u001e\u001fc", 80),
    ("ideographic_space_is_whitespace", "a\u3000b", 80),
    ("line_separator_is_whitespace", "a\u2028b\u2029c", 80),
    ("bom_is_not_whitespace", "a\ufeffb", 80),
    ("zero_width_space_is_not_whitespace", "a\u200bb", 80),
    ("exactly_at_limit_untouched", "x" * 80, 80),
    ("one_over_limit_capped", "x" * 81, 80),
    ("astral_capped_by_code_point", "\U0001f600" * 85, 80),
    ("combining_marks_count_as_code_points", "e\u0301" * 45, 80),
    ("small_limit", "hello world", 5),
    ("limit_one", "hello", 1),
    ("empty", "", 80),
)

# Fixture schema: every target table except memory_access_log (missing table
# must be ignored), and `tasks` without its `notes` column (missing column
# must be ignored). Column types are deliberately loose so a non-string value
# can sit in a text column: Python skips it via isinstance(value, str).
FIXTURE_DDL: tuple[str, ...] = (
    "CREATE TABLE identity (id TEXT PRIMARY KEY, layer TEXT, key TEXT, content TEXT, metadata TEXT)",
    "CREATE TABLE attachments (id INTEGER PRIMARY KEY, journey_id TEXT, name TEXT, content TEXT)",
    "CREATE TABLE memories (id TEXT PRIMARY KEY, content TEXT, summary, source TEXT, journey TEXT, layer TEXT)",
    "CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT, role TEXT, content TEXT)",
    "CREATE TABLE conversations (id TEXT PRIMARY KEY, title TEXT, summary TEXT, journey TEXT, persona TEXT)",
    "CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, description TEXT, journey TEXT, status TEXT)",
    "CREATE TABLE unrelated_extension_table (id INTEGER PRIMARY KEY, content TEXT)",
)

# (table, {column: value}) in insertion order. rowid order is insertion order
# for these tables, which is the scan order Python relies on.
FIXTURE_ROWS: tuple[tuple[str, dict[str, object]], ...] = (
    ("identity", {"id": "i1", "layer": "self", "key": "soul", "content": "Eu sou a reflex\u00c3\u00a3o", "metadata": None}),
    ("identity", {"id": "i2", "layer": "ego", "key": "behavior", "content": "Sem mojibake: \u00c2ncora e a\u00e7\u00e3o", "metadata": None}),
    ("identity", {"id": "i3", "layer": "user", "key": "identity", "content": None, "metadata": "{\"x\": \"\u00c3\u00a9\"}"}),
    ("attachments", {"id": 7, "journey_id": "j", "name": "notes.md", "content": "Anexo com \u00c3\u201cculos"}),
    ("attachments", {"id": 9, "journey_id": "j", "name": "clean.md", "content": "clean"}),
    ("memories", {"id": "m1", "content": "Mem\u00c3\u00b3ria antiga", "summary": 42, "source": "s\u00c3\u00a9rie", "journey": "jornada-\u00c3\u00a9pica", "layer": "ego"}),
    ("memories", {"id": "m2", "content": "second row \u00c3\U0001f600 stays", "summary": "resumo \u00c3\u00a7", "source": None, "journey": None, "layer": "ego"}),
    ("messages", {"id": "msg1", "conversation_id": "c1", "role": "user", "content": "  muitos   espa\u00c3\u00a7os \t aqui  "}),
    ("messages", {"id": "msg2", "conversation_id": "c1", "role": "assistant", "content": "x" * 70 + "\u00c3\u00a9" * 10}),
    ("conversations", {"id": "c1", "title": "T\u00c3\u00adtulo", "summary": None, "journey": "ok", "persona": "\u00c3\u2030tica"}),
    ("tasks", {"id": "t1", "title": "Tarefa \u00c3\u00ba", "description": "desc", "journey": None, "status": "pendente"}),
    ("unrelated_extension_table", {"id": 1, "content": "n\u00c3\u00a3o toque"}),
)


def _normalize_db_path(text: str, db_path: Path) -> str:
    return text.replace(str(db_path), "<db>")


def _capture_main(argv: list[str], db_path: Path) -> tuple[str, str, int]:
    """Run the oracle's CLI entry point; return (stdout, stderr, exit code)."""
    from memory.cli import repair_encoding

    out, err = io.StringIO(), io.StringIO()
    with redirect_stdout(out), redirect_stderr(err):
        code = repair_encoding.main(argv)
    return _normalize_db_path(out.getvalue(), db_path), _normalize_db_path(err.getvalue(), db_path), code


def _state(conn: sqlite3.Connection) -> dict[str, list[dict[str, object]]]:
    state: dict[str, list[dict[str, object]]] = {}
    for ddl in FIXTURE_DDL:
        table = ddl.split()[2]
        rows = conn.execute(f'SELECT _rowid_ AS __rowid__, * FROM "{table}" ORDER BY _rowid_').fetchall()
        state[table] = [dict(row) for row in rows]
    return state


# The golden must not depend on the generating environment: CI's Python job
# exports MEMORY_ENV=test, which `memory.config` reads at import time and
# would rename the fixture database. Clear it -- and every other database
# override -- before the first `memory` import, not after.
_ENV_OVERRIDES = ("MEMORY_DIR", "MEMORY_PROD_DIR", "MEMORY_ENV", "DB_PATH", "DB_BACKUP_PATH", "BACKUP_DIR")


def _clear_database_environment() -> None:
    for key in _ENV_OVERRIDES:
        os.environ.pop(key, None)


def main() -> None:
    _clear_database_environment()
    from memory.cli import repair_encoding

    text_cases = [
        {
            "label": label,
            "input": text,
            "repaired": repair_encoding.repair_text(text),
            "has_mojibake": repair_encoding.has_repairable_mojibake(text),
        }
        for label, text in TEXT_CASES
    ]
    preview_cases = [
        {"label": label, "input": text, "limit": limit, "preview": repair_encoding._preview(text, limit)}
        for label, text, limit in PREVIEW_CASES
    ]

    with tempfile.TemporaryDirectory() as tmp:
        home = Path(tmp) / "repair-encoding-fixture"
        home.mkdir()
        db_path = home / "memory.db"

        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        for ddl in FIXTURE_DDL:
            conn.execute(ddl)
        for table, values in FIXTURE_ROWS:
            columns = ", ".join(f'"{col}"' for col in values)
            marks = ", ".join("?" for _ in values)
            conn.execute(f'INSERT INTO "{table}" ({columns}) VALUES ({marks})', tuple(values.values()))
        conn.commit()

        hits = repair_encoding.scan_database(db_path)
        scan_hits = [
            {"table": h.table, "column": h.column, "row_id": h.row_id, "before": h.before, "after": h.after}
            for h in hits
        ]
        state_before = _state(conn)

        dry_run = {}
        for label, argv in (
            ("default_limit", ["--mirror-home", str(home)]),
            ("limit_2", ["--mirror-home", str(home), "--limit", "2"]),
            ("limit_0", ["--mirror-home", str(home), "--limit", "0"]),
            ("limit_negative", ["--mirror-home", str(home), "--limit", "-3"]),
        ):
            stdout, stderr, code = _capture_main(argv, db_path)
            assert stderr == "", f"{label}: unexpected stderr {stderr!r}"
            dry_run[label] = {"argv": [a.replace(str(home), "<home>") for a in argv], "stdout": stdout, "exit_code": code}
        assert _state(conn) == state_before, "dry run must not change rows"

        apply_stdout, apply_stderr, apply_code = _capture_main(
            ["--mirror-home", str(home), "--apply", "--no-backup"], db_path
        )
        assert apply_stderr == ""
        state_after = _state(conn)
        # A second apply finds nothing: the "No changes needed." branch.
        noop_stdout, noop_stderr, noop_code = _capture_main(
            ["--mirror-home", str(home), "--apply", "--no-backup"], db_path
        )
        assert noop_stderr == ""
        assert _state(conn) == state_after, "no-op apply must not change rows"

        missing_home = Path(tmp) / "nowhere"
        missing_stdout, missing_stderr, missing_code = _capture_main(
            ["--mirror-home", str(missing_home)], db_path
        )
        conn.close()

    golden = {
        "meta": {
            "note": (
                "Oracle: src/memory/cli/repair_encoding.py. Text and preview cases are "
                "graded exactly; the scan is an ORDERED hit list; dry-run stdout has the "
                "database path replaced by <db>; apply is graded as row state after one "
                "transaction. `--no-backup` keeps the backup port (plateau 2) out of this golden."
            )
        },
        "text_cases": text_cases,
        "preview_cases": preview_cases,
        "fixture": {
            "ddl": list(FIXTURE_DDL),
            "rows": [{"table": table, "values": values} for table, values in FIXTURE_ROWS],
        },
        "scan_hits": scan_hits,
        "state_before": state_before,
        "dry_run": dry_run,
        "apply": {
            "argv": ["--mirror-home", "<home>", "--apply", "--no-backup"],
            "stdout": apply_stdout,
            "exit_code": apply_code,
            "state_after": state_after,
            "noop_stdout": noop_stdout,
            "noop_exit_code": noop_code,
        },
        "missing_database": {
            "stdout": missing_stdout.replace(str(missing_home), "<missing-home>"),
            "stderr": missing_stderr.replace(str(missing_home), "<missing-home>"),
            "exit_code": missing_code,
        },
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(golden, indent=2, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8")

    for case in text_cases:
        print(f"  {case['label']:40} {case['input']!r} -> {case['repaired']!r}")
    print(f"scan hits: {len(scan_hits)}; applied exit={apply_code}")
    print(f"wrote {OUT_PATH.relative_to(HERE.parent.parent)}")


if __name__ == "__main__":
    main()
