"""Tests for the canonical cross-language schema inventory (CV22.DS6.TS1)."""

import json

import pytest

from memory.db.connection import get_connection
from memory.db.schema_inventory import build_schema_inventory, normalize_sql

pytestmark = pytest.mark.unit


class TestNormalizeSql:
    def test_strips_line_comments(self):
        assert normalize_sql("SELECT 1 -- a comment\n, 2") == "SELECT 1, 2"

    def test_strips_block_comments(self):
        assert (
            normalize_sql("CREATE TABLE t (\n  /* comment */ id TEXT\n)")
            == "CREATE TABLE t ( id TEXT)"
        )

    def test_collapses_whitespace(self):
        assert normalize_sql("CREATE   TABLE\n\nt (id TEXT)") == "CREATE TABLE t (id TEXT)"

    def test_preserves_dashes_inside_string_literals(self):
        assert normalize_sql("INSERT INTO t VALUES ('a--b')") == "INSERT INTO t VALUES ('a--b')"

    def test_preserves_escaped_quotes_inside_string_literals(self):
        assert normalize_sql("INSERT INTO t VALUES ('it''s -- not a comment')") == (
            "INSERT INTO t VALUES ('it''s -- not a comment')"
        )

    def test_unterminated_block_comment_consumes_to_end(self):
        assert normalize_sql("SELECT 1 /* oops") == "SELECT 1"

    def test_strips_whitespace_before_comma_and_close_paren(self):
        # SQLite's ALTER TABLE ADD COLUMN textually splices the new column
        # definition right before the stored CREATE TABLE text's closing
        # paren, producing uneven spacing (e.g. "metadata TEXT , newcol TEXT)")
        # that no hand-written DDL naturally produces. This must normalize
        # identically to a cleanly formatted equivalent.
        assert (
            normalize_sql("CREATE TABLE t (a TEXT , b TEXT )")
            == "CREATE TABLE t (a TEXT, b TEXT)"
        )

    def test_none_passthrough(self):
        assert normalize_sql(None) is None


class TestBuildSchemaInventory:
    @pytest.fixture
    def fresh_conn(self, tmp_path):
        conn = get_connection(db_path=tmp_path / "fresh.db")
        yield conn
        conn.close()

    def test_excludes_migrations_bookkeeping_table(self, fresh_conn):
        inventory = build_schema_inventory(fresh_conn)
        assert "_migrations" not in inventory["tables"]

    def test_excludes_sqlite_sequence(self, fresh_conn):
        inventory = build_schema_inventory(fresh_conn)
        assert "sqlite_sequence" not in inventory["tables"]

    def test_excludes_indexes_belonging_to_excluded_tables(self, fresh_conn):
        # `_migrations.id` is a non-INTEGER (TEXT) PRIMARY KEY, so SQLite gives
        # it its own autoindex. Excluding the table must also exclude that
        # autoindex — an index cannot dangle without its (excluded) table.
        inventory = build_schema_inventory(fresh_conn)
        assert all(idx["table"] != "_migrations" for idx in inventory["indexes"].values())

    def test_includes_expected_tables(self, fresh_conn):
        inventory = build_schema_inventory(fresh_conn)
        expected = {"conversations", "messages", "memories", "identity", "memories_fts"}
        assert expected.issubset(inventory["tables"])

    def test_excludes_fts_shadow_tables(self, fresh_conn):
        inventory = build_schema_inventory(fresh_conn)
        for suffix in ("_data", "_idx", "_docsize", "_config", "_content"):
            assert f"memories_fts{suffix}" not in inventory["tables"]

    def test_captures_check_constraint_in_table_sql(self, fresh_conn):
        inventory = build_schema_inventory(fresh_conn)
        assert "CHECK(status IN" in inventory["tables"]["builder_refinement_stories"]["sql"]

    def test_captures_partial_index_predicate(self, fresh_conn):
        inventory = build_schema_inventory(fresh_conn)
        idx = inventory["indexes"]["idx_exploratory_stories_one_active_per_journey"]
        assert "WHERE status = 'active'" in idx["sql"]

    def test_captures_identity_unique_layer_key_autoindex(self, fresh_conn):
        # identity.id is a non-INTEGER (TEXT) PRIMARY KEY, so SQLite creates an
        # autoindex for it too — filter by (table, columns), not by name
        # prefix, since `identity_descriptors` also starts with "identity_".
        inventory = build_schema_inventory(fresh_conn)
        matches = [
            idx
            for name, idx in inventory["indexes"].items()
            if name.startswith("sqlite_autoindex_")
            and idx["table"] == "identity"
            and idx["columns"] == ["layer", "key"]
        ]
        assert len(matches) == 1
        assert matches[0]["unique"] == 1
        assert matches[0]["sql"] is None

    def test_captures_memories_fts_declaration(self, fresh_conn):
        inventory = build_schema_inventory(fresh_conn)
        fts_sql = inventory["tables"]["memories_fts"]["sql"].lower().replace(" ", "")
        assert "fts5" in fts_sql
        assert "content=memories" in fts_sql
        assert "content_rowid=rowid" in fts_sql

    def test_captures_fts_triggers(self, fresh_conn):
        inventory = build_schema_inventory(fresh_conn)
        assert {"memories_fts_ai", "memories_fts_ad", "memories_fts_au"}.issubset(
            inventory["triggers"]
        )

    def test_foreign_keys_captured_and_sorted(self, fresh_conn):
        inventory = build_schema_inventory(fresh_conn)
        fks = inventory["tables"]["messages"]["foreign_keys"]
        assert {"table": "conversations", "from": "conversation_id", "to": "id"}.items() <= (
            fks[0].items()
        )

    def test_is_json_serializable(self, fresh_conn):
        json.dumps(build_schema_inventory(fresh_conn))
