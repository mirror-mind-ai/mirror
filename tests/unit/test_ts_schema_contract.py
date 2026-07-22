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
    # CV22.DS6.US2 renegotiated this seam from "TS == Python" to "TS ⊇ Python":
    # TS now owns schema custody and may author forward migrations Python lacks
    # (the first is 017_journey_parent_column). The invariant is that the Python
    # migration list remains an exact PREFIX of the TS snapshot — Python may not
    # drift or reorder, and every Python migration must still be recognized by
    # the TS front door, but TS may extend beyond Python.
    python_ids = [migration_id for migration_id, _ in MIGRATIONS]
    ts_ids = _ts_known_migration_ids()
    assert ts_ids[: len(python_ids)] == python_ids, (
        "ts/src/db/schemaState.ts KNOWN_MIGRATION_IDS no longer starts with the "
        "memory.db.migrations MIGRATIONS list. Python migrations must remain an "
        "exact prefix of the TS snapshot: update the TS snapshot in the same "
        "commit that adds or renames a Python migration. TS-only forward "
        "migrations (TS ⊇ Python) are appended after the shared prefix."
    )
    assert len(ts_ids) >= len(python_ids), (
        "TS KNOWN_MIGRATION_IDS dropped below the Python MIGRATIONS set."
    )
