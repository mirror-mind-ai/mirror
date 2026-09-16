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


# --- `extensions install` as a FILE probe (plateau 5) ------------------------

SOURCE_FIXTURES = REPO_ROOT / "ts" / "test" / "fixtures" / "ext-catalog-writes"
INSTALL_EXTENSION_ID = "notes"


def _install_files(home: Path, source_root: Path) -> list[dict[str, Any]]:
    """Every file under the home as a state row, the `builder_artifacts` shape.

    Two normalisations, both because the bytes are not a portable contract and
    neither is product state: a `__pycache__` collapses to one marker row (the
    post-install import writes it, and its name carries the interpreter
    version), and the database and its journal sidecars are skipped -- this
    probe grades the FILES; the rows are graded beside it.
    """
    rows: list[dict[str, Any]] = []
    caches: set[str] = set()
    for path in sorted(home.rglob("*")):
        if not path.is_file():
            continue
        relative = path.relative_to(home)
        if "__pycache__" in relative.parts:
            index = relative.parts.index("__pycache__")
            caches.add("/".join([*relative.parts[:index], "__pycache__"]))
            continue
        if path.suffix == ".db" or path.name.endswith(("-wal", "-shm")):
            continue
        # The two halves install into SEPARATE homes on purpose -- one shared
        # home would make the second engine install over the first's tree -- so
        # the home and the source root are tokenised out of the catalog paths
        # they are embedded in. Everything else is compared byte for byte.
        content = (
            path.read_text(encoding="utf-8")
            .replace(str(home), "<HOME>")
            .replace(str(source_root), "<SRC>")
        )
        rows.append({"id": f"file:{relative.as_posix()}", "cells": {"content": content}})
    rows.extend(
        {"id": f"cache:{cache}", "cells": {"content": "<bytecode>"}} for cache in sorted(caches)
    )
    return sorted(rows, key=lambda row: row["id"])


def extension_install_probe(python_copy, frozen_datetime, now_iso: str) -> dict[str, Any]:
    """Install a command-skill for real, against a copy of a REAL database.

    The golden grades these writes on a home this repository built from
    nothing. This probe grades them where the migration half meets a real
    schema: the copy IS the installed home's database, so `install` applies its
    migration to a live corpus and the two engines' file trees and
    `_ext_migrations` rows are compared afterwards.
    """
    import shutil

    from memory.cli import extensions as extensions_mod
    from memory.config import db_path_for_home
    from memory.extensions import migrations as migrations_mod

    # TWO clocks, in two modules: the catalog's `generated_at` and the
    # migration ledger's `applied_at`. Freezing only the first left the probe
    # producing a different hash on every run -- a probe that cannot repeat
    # itself cannot grade anything.
    extensions_mod.datetime = frozen_datetime
    migrations_mod.datetime = frozen_datetime

    # Resolved, because the catalog EMBEDS these paths: the harness may hand
    # over a relative work dir, and a relative home would write a catalog the
    # other half (which resolves) can never match.
    copy_path = Path(python_copy).resolve()
    home = copy_path.parent / "extension-install-python"
    source_root = home.parent / "extension-install-source"
    if home.exists():
        shutil.rmtree(home)
    if not source_root.exists():
        shutil.copytree(SOURCE_FIXTURES, source_root)
    home.mkdir(parents=True)
    # `install` resolves its database from the home and MEMORY_ENV, so the copy
    # has to land on exactly that name. Copying it beside that name instead --
    # the first version of this probe -- made install create an EMPTY database
    # and apply its migration there, so the probe claimed a real corpus while
    # grading a fresh one.
    database_path = db_path_for_home(home)
    shutil.copyfile(copy_path, database_path)

    extensions_mod.install_extension(
        INSTALL_EXTENSION_ID,
        source_root=source_root,
        mirror_home=home,
        runtime=None,
    )

    conn = sqlite3.connect(database_path)
    conn.row_factory = sqlite3.Row
    try:
        migrations = [
            f"{row['extension_id']}/{row['filename']}:{row['checksum']}@{row['applied_at']}"
            for row in conn.execute(
                "SELECT extension_id, filename, checksum, applied_at FROM _ext_migrations "
                "WHERE extension_id = ? ORDER BY filename",
                (INSTALL_EXTENSION_ID,),
            )
        ]
        tables = [
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'ext_notes_%' "
                "ORDER BY name"
            )
        ]
    finally:
        conn.close()

    return {
        "label": "extension_install",
        "probe_type": "extension_install",
        "now_iso": now_iso,
        "extension_install": {
            "extension_id": INSTALL_EXTENSION_ID,
            "source_root": str(source_root),
            "database_name": database_path.name,
        },
        "python_state": [
            *_install_files(home, source_root),
            {
                "id": "rows",
                "cells": {"migrations": "|".join(migrations), "tables": ",".join(tables)},
            },
        ],
    }


PROBES = {"ext_bindings": ext_bindings_probe, "extension_install": extension_install_probe}
