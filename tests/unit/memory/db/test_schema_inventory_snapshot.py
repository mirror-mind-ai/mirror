"""TS/Python schema-inventory contract lock (CV22.DS6.TS1).

The TS core's `createSchema()` is graded against a committed snapshot
(`ts/src/db/schemaInventorySnapshot.ts`) generated from a real fresh Python
database. This test holds the other side of that contract: a Python schema
change cannot land without regenerating and updating the TS snapshot in the
same commit — mirroring `tests/unit/test_ts_schema_contract.py`'s guard over
`KNOWN_MIGRATION_IDS`.
"""

import json
import re
from pathlib import Path

import pytest

from memory.db.connection import get_connection
from memory.db.schema_inventory import build_schema_inventory

pytestmark = pytest.mark.unit

_TS_SNAPSHOT = (
    Path(__file__).resolve().parents[4] / "ts" / "src" / "db" / "schemaInventorySnapshot.ts"
)

_REGENERATE_HINT = (
    "ts/src/db/schemaInventorySnapshot.ts has drifted from a fresh Python "
    "database's schema. Regenerate it in the same commit that changes "
    "src/memory/db/schema.py (or a migration that affects fresh-DB shape):\n"
    "  uv run python -m memory.db.schema_inventory > /tmp/snap.json\n"
    "then rebuild the committed TS file from that JSON (see the header comment "
    "in schemaInventorySnapshot.ts) and re-run this test."
)


def _committed_snapshot() -> dict:
    source = _TS_SNAPSHOT.read_text(encoding="utf-8")
    match = re.search(
        r"SCHEMA_INVENTORY_SNAPSHOT:\s*SchemaInventory\s*=\s*(?P<json>\{.*\});\s*$",
        source,
        flags=re.DOTALL,
    )
    assert match, "SCHEMA_INVENTORY_SNAPSHOT literal not found in schemaInventorySnapshot.ts"
    return json.loads(match.group("json"))


def _live_inventory(tmp_path: Path) -> dict:
    conn = get_connection(db_path=tmp_path / "fresh.db")
    try:
        return build_schema_inventory(conn)
    finally:
        conn.close()


class TestSchemaInventorySnapshot:
    def test_table_names_match(self, tmp_path):
        live = _live_inventory(tmp_path)
        committed = _committed_snapshot()
        assert set(live["tables"]) == set(committed["tables"]), _REGENERATE_HINT

    def test_index_names_match(self, tmp_path):
        live = _live_inventory(tmp_path)
        committed = _committed_snapshot()
        assert set(live["indexes"]) == set(committed["indexes"]), _REGENERATE_HINT

    def test_trigger_names_match(self, tmp_path):
        live = _live_inventory(tmp_path)
        committed = _committed_snapshot()
        assert set(live["triggers"]) == set(committed["triggers"]), _REGENERATE_HINT

    @pytest.mark.parametrize(
        "kind",
        ["tables", "indexes", "triggers"],
    )
    def test_each_object_matches_exactly(self, tmp_path, kind):
        live = _live_inventory(tmp_path)
        committed = _committed_snapshot()
        # Table/index/trigger name-set equality is asserted above; here every
        # object's full structural definition (columns, foreign keys, CHECK
        # constraints and partial predicates via normalized sql, etc.) must
        # match exactly, pinpointed to the one that diverges.
        for name, live_object in live[kind].items():
            committed_object = committed[kind].get(name)
            assert committed_object == live_object, (
                f"{kind}[{name!r}] has drifted:\n"
                f"  live:      {live_object}\n"
                f"  committed: {committed_object}\n{_REGENERATE_HINT}"
            )

    def test_full_inventory_equality(self, tmp_path):
        # Belt-and-suspenders symmetric check across the whole structure.
        live = _live_inventory(tmp_path)
        committed = _committed_snapshot()
        assert live == committed, _REGENERATE_HINT
