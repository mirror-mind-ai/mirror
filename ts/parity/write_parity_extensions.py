"""Extension binding + migration write probe (CV22.DS7.TS4 plateau 3).

The golden grades these writes on a database this repository built. This probe
grades them on a copy of a REAL one: the same binding sequence and the same
migration files, applied by Python here and by TypeScript in
`ts/src/parity/extensionProbes.ts`, with every intermediate `_ext_bindings` and
`_ext_migrations` row compared as an ordered sequence.

Both engines read the SAME committed migration scripts
(`ts/test/fixtures/ext-bindings/happy/`), so the SQL cannot drift between the
halves, and each applies them to its own copy of the database.

Safety: the probe writes only into the copy it was handed. It creates no files
in the user's home and touches no extension directory -- `run_migrations` is
called with the fixture path directly, which is why the fixture extension needs
no installed tree.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
MIGRATIONS_DIR = REPO_ROOT / "ts" / "test" / "fixtures" / "ext-bindings" / "happy"
EXTENSION_ID = "beta"

# (label, action, capability, target_kind, target_id). The order is the point:
# a global bind is NOT idempotent (a NULL `target_id` never conflicts in the
# primary key) while a persona bind is, and one unbind clears every duplicate.
SEQUENCE: list[tuple[str, str, str, str, str | None]] = [
    ("bind_persona", "bind", "context", "persona", "engineer"),
    ("bind_persona_again", "bind", "context", "persona", "engineer"),
    ("bind_journey", "bind", "context", "journey", "mirror-ts-core"),
    ("bind_global", "bind", "briefing", "global", None),
    ("bind_global_again", "bind", "briefing", "global", None),
    ("unbind_persona", "unbind", "context", "persona", "engineer"),
    ("unbind_missing", "unbind", "context", "persona", "engineer"),
    ("unbind_global", "unbind", "briefing", "global", None),
]


def _rows(conn: sqlite3.Connection) -> dict[str, Any]:
    bindings = [
        dict(row)
        for row in conn.execute(
            "SELECT extension_id, capability_id, target_kind, target_id, created_at "
            "FROM _ext_bindings ORDER BY capability_id, target_kind, "
            "COALESCE(target_id, ''), created_at"
        )
    ]
    migrations = [
        dict(row)
        for row in conn.execute(
            "SELECT extension_id, filename, checksum, applied_at "
            "FROM _ext_migrations ORDER BY filename"
        )
    ]
    tables = [
        row[0]
        for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'ext_beta_%' "
            "ORDER BY name"
        )
    ]
    return {
        "bindings": "|".join(
            f"{b['capability_id']}/{b['target_kind']}/{b['target_id'] or ''}@{b['created_at']}"
            for b in bindings
        ),
        "binding_count": len(bindings),
        "migrations": "|".join(
            f"{m['filename']}:{m['checksum']}@{m['applied_at']}" for m in migrations
        ),
        "tables": ",".join(tables),
    }


def ext_bindings_probe(python_copy, frozen_datetime, now_iso: str) -> dict[str, Any]:
    """Run the binding sequence and one migration, recording every step."""
    from write_parity_builder import get_connection_for

    from memory.extensions import migrations as migrations_mod

    # The bookkeeping and binding timestamps come from `datetime.now(timezone.utc)`
    # inside two modules; freezing both is what makes the recorded bytes comparable
    # at all. Without it the halves differ on `created_at` alone.
    migrations_mod.datetime = frozen_datetime

    # Production writes both timestamps with `datetime.now(timezone.utc).isoformat()`,
    # which spells the offset `+00:00`; the harness's frozen clock is handed over in
    # the `Z` form every other probe uses. Converting here keeps the probe grading
    # the spelling production writes, rather than the harness's.
    frozen_isoformat = now_iso.replace("Z", "+00:00")

    def stamp_for(index: int) -> str:
        """A DISTINCT timestamp per step, derived identically in both halves.

        One frozen instant for every step made a real difference invisible: with
        identical values, `INSERT OR REPLACE` and `INSERT OR IGNORE` leave the
        same row, so a mutant swapping them survived. A per-step stamp makes the
        rewrite observable -- OR REPLACE would overwrite the original bind time.
        """
        return frozen_isoformat.replace("12:00:00", f"12:00:{index:02d}")

    conn = get_connection_for(python_copy)
    conn.row_factory = sqlite3.Row
    try:
        states: list[dict[str, Any]] = []
        for index, (label, action, capability, kind, target) in enumerate(SEQUENCE):
            if action == "bind":
                conn.execute(
                    "INSERT OR IGNORE INTO _ext_bindings "
                    "(extension_id, capability_id, target_kind, target_id, created_at) "
                    "VALUES (?, ?, ?, ?, ?)",
                    (EXTENSION_ID, capability, kind, target, stamp_for(index)),
                )
            else:
                conn.execute(
                    "DELETE FROM _ext_bindings WHERE extension_id = ? AND capability_id = ? "
                    "AND target_kind = ? AND (target_id IS ? OR target_id = ?)",
                    (EXTENSION_ID, capability, kind, target, target),
                )
            conn.commit()
            states.append({"label": label, "cells": _rows(conn)})

        applied = migrations_mod.run_migrations(
            conn, extension_id=EXTENSION_ID, migrations_dir=MIGRATIONS_DIR
        )
        states.append({"label": f"migrate_applied_{applied}", "cells": _rows(conn)})
        # Idempotence on the real copy, not only on the synthetic corpus.
        applied_again = migrations_mod.run_migrations(
            conn, extension_id=EXTENSION_ID, migrations_dir=MIGRATIONS_DIR
        )
        states.append({"label": f"migrate_again_applied_{applied_again}", "cells": _rows(conn)})
        final = _rows(conn)
    finally:
        conn.close()

    return {
        "label": "ext_bindings",
        "probe_type": "ext_bindings",
        "now_iso": now_iso,
        "ext_bindings": {
            "extension_id": EXTENSION_ID,
            "migrations_dir": str(MIGRATIONS_DIR),
            "sequence": [
                {
                    "label": label,
                    "action": action,
                    "capability_id": capability,
                    "target_kind": kind,
                    "target_id": target,
                }
                for label, action, capability, kind, target in SEQUENCE
            ],
        },
        "python_state": [
            *(
                {"id": f"{index:02d}:{state['label']}", "cells": state["cells"]}
                for index, state in enumerate(states)
            ),
            {"id": "final", "cells": final},
        ],
    }


PROBES = {"ext_bindings": ext_bindings_probe}
