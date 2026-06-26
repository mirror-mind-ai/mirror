"""Unit tests for the Windows/UTF-8 mojibake repair helper."""

import sqlite3

from memory.cli.repair_encoding import apply_repairs, repair_text, scan_database


def test_repair_text_fixes_latin1_style_portuguese_mojibake():
    assert repair_text("BioVault Ã© saÃºde clÃ­nica") == "BioVault é saúde clínica"


def test_repair_text_fixes_cp1252_style_uppercase_mojibake():
    assert repair_text("RELATÃ“RIO E ESTRATÃ‰GIA") == "RELATÓRIO E ESTRATÉGIA"


def test_repair_text_keeps_legitimate_portuguese_unchanged():
    assert repair_text("Âncora, proteção, sucessão e saúde") == "Âncora, proteção, sucessão e saúde"


def test_scan_and_apply_repairs_known_text_tables(tmp_path):
    db_path = tmp_path / "memory.db"
    conn = sqlite3.connect(db_path)
    conn.execute("CREATE TABLE identity (id TEXT PRIMARY KEY, content TEXT)")
    conn.execute("CREATE TABLE memory_access_log (id INTEGER PRIMARY KEY, access_context TEXT)")
    conn.execute("INSERT INTO identity (id, content) VALUES ('a', 'EstratÃ©gia Luvia')")
    conn.execute(
        "INSERT INTO memory_access_log (id, access_context) VALUES (1, 'saÃºde e proteÃ§Ã£o')"
    )
    conn.commit()
    conn.close()

    hits = scan_database(db_path)
    assert [(h.table, h.column) for h in hits] == [
        ("identity", "content"),
        ("memory_access_log", "access_context"),
    ]

    assert apply_repairs(db_path, hits) == 2
    conn = sqlite3.connect(db_path)
    assert (
        conn.execute("SELECT content FROM identity WHERE id='a'").fetchone()[0]
        == "Estratégia Luvia"
    )
    assert (
        conn.execute("SELECT access_context FROM memory_access_log WHERE id=1").fetchone()[0]
        == "saúde e proteção"
    )
    conn.close()
