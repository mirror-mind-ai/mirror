"""TS/Python schema-contract lock (CR018, RS003 database audit).

The TS front door refuses databases whose `_migrations` state does not match
the migration set it was built against (`ts/src/db/schemaState.ts`). This test
holds the other side of that contract: a new Python migration cannot land
without updating the TS snapshot in the same commit.
"""

import re
from pathlib import Path

from memory.db.migrations import MIGRATIONS

_TS_SNAPSHOT = Path(__file__).resolve().parents[2] / "ts" / "src" / "db" / "schemaState.ts"


def _ts_known_migration_ids() -> list[str]:
    source = _TS_SNAPSHOT.read_text(encoding="utf-8")
    block = re.search(r"KNOWN_MIGRATION_IDS[^=]*=\s*\[(?P<ids>.*?)\]", source, flags=re.DOTALL)
    assert block, "KNOWN_MIGRATION_IDS array not found in schemaState.ts"
    return re.findall(r'"([^"]+)"', block.group("ids"))


def test_ts_known_migrations_match_python_migrations() -> None:
    python_ids = [migration_id for migration_id, _ in MIGRATIONS]
    ts_ids = _ts_known_migration_ids()
    assert ts_ids == python_ids, (
        "ts/src/db/schemaState.ts KNOWN_MIGRATION_IDS has drifted from "
        "memory.db.migrations MIGRATIONS. Update the TS snapshot in the same "
        "commit that adds or renames a Python migration — the TS front door "
        "refuses databases whose migration state it does not recognize."
    )
