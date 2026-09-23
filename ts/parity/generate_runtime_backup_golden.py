"""Generate the `runtime backup` golden (CV22.DS10.US2, plateau 2).

`runtime backup` is NOT the `backup` command DS7.TS1 ported. That one creates
an archive and stops; this one is the UPDATER'S SAFETY STAGE, so it creates,
verifies, and renders a manual recovery route, and its exit code follows the
verification rather than the creation. Its three functions
(`verify_backup_archive`, `render_backup_verification`,
`render_runtime_backup_created`) had no TypeScript counterpart before this
story.

What is graded: the RENDER and the VERDICT for every refusal the oracle can
produce -- including the two unsafe-entry shapes (`../memory.db` and
`/tmp/memory.db`) that the story's own inventory missed. A backup path is user
input the moment `--verify PATH` accepts one.

This golden records RECIPES, not archive bytes, and that is what lets it sit in
CI's determinism gate beside the others. The first version embedded base64
archives holding a real SQLite database -- whose header carries the writing
library's version -- so regeneration was not byte-stable and the gate failed on
the 3.12 leg. Every verdict here depends on entry NAMES and on whether the
member opens, never on the container's bytes, so each engine builds the fixture
with its own SQLite and what gets graded is the decision rule.

Deliberately NOT graded: `corrupt_db`, an archive holding a well-named
`memory.db` that is 4 KB of zeros. Python reports it VALID, because it verifies
entry NAMES. The TypeScript port extracts it and runs `PRAGMA quick_check`, so
it reports INVALID. That is the one deliberate deviation in this port, measured
in the story's plateau-0 baseline. A scenario the engines are known to disagree
on has no place in a parity golden, so it is recorded as `documented_deviation`
and asserted separately, in both directions, so that if the oracle ever starts
refusing it the deviation is retired rather than forgotten.

Run:  uv run python ts/parity/generate_runtime_backup_golden.py
"""

from __future__ import annotations

import json
import sqlite3
import tempfile
import zipfile
from pathlib import Path

from memory.cli.runtime import (
    render_backup_verification,
    render_runtime_backup_created,
    verify_backup_archive,
)

HERE = Path(__file__).resolve().parent
OUT_PATH = HERE.parent / "test" / "goldens" / "runtime-backup.golden.json"

ARCHIVE_TOKEN = "<ARCHIVE>"
HOME_TOKEN = "<HOME>"

# Payload kinds a recipe can name. The other engine supplies its own bytes.
DATABASE = "database"
CORRUPT_DATABASE = "corrupt-database"


def _real_database(path: Path) -> bytes:
    """A real, openable, WAL-mode SQLite database.

    WAL is not incidental: every archive `create_backup` writes holds a
    WAL-mode database (header byte 18 == 2), and a WAL database opened
    read-only without its sidecars fails with SQLITE_CANTOPEN. A
    rollback-journal fixture would hide that, and did -- the port's first unit
    fixture used one and passed while a real archive verified as invalid.
    """
    conn = sqlite3.connect(path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("CREATE TABLE t(a)")
    conn.execute("INSERT INTO t VALUES (1)")
    conn.commit()
    conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    conn.close()
    data = path.read_bytes()
    assert data[18] == 2, "fixture must be WAL-mode, like every real backup"
    return data


def _payload(kind: str, database: bytes) -> bytes:
    if kind == DATABASE:
        return database
    if kind == CORRUPT_DATABASE:
        return b"SQLite format 3\x00" + b"\x00" * 4000
    return kind.encode("utf-8")


def _build(path: Path, members: list[dict[str, str]], database: bytes) -> Path:
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
        for member in members:
            archive.writestr(member["name"], _payload(member["payload"], database))
    return path


def _scenario(
    tmp: Path,
    name: str,
    database: bytes,
    *,
    members: list[dict[str, str]] | None = None,
    raw_text: str | None = None,
    absent: bool = False,
) -> dict[str, object]:
    path = tmp / f"{name}.zip"
    if absent:
        pass
    elif raw_text is not None:
        path.write_text(raw_text, encoding="utf-8")
    else:
        assert members is not None
        _build(path, members, database)

    verification = verify_backup_archive(path)
    return {
        # The RECIPE. The other engine builds an equivalent archive with its
        # own SQLite rather than reading bytes this one happened to produce.
        "members": members,
        "raw_text": raw_text,
        "absent": absent,
        "entries": list(verification.entries),
        "valid": verification.valid,
        "note": verification.note,
        "verify_render": render_backup_verification(verification).replace(str(path), ARCHIVE_TOKEN),
        "verify_exit": 0 if verification.valid else 1,
    }


def main() -> None:
    with tempfile.TemporaryDirectory() as raw:
        tmp = Path(raw)
        database = _real_database(tmp / "seed.db")

        scenarios = {
            "valid": _scenario(
                tmp, "valid", database, members=[{"name": "memory.db", "payload": DATABASE}]
            ),
            "valid_with_sidecars": _scenario(
                tmp,
                "sidecars",
                database,
                members=[
                    {"name": "memory.db", "payload": DATABASE},
                    {"name": "memory.db-wal", "payload": "wal"},
                    {"name": "memory.db-shm", "payload": "shm"},
                ],
            ),
            "traversal_entry": _scenario(
                tmp,
                "traversal",
                database,
                members=[{"name": "../memory.db", "payload": DATABASE}],
            ),
            "absolute_entry": _scenario(
                tmp,
                "absolute",
                database,
                members=[{"name": "/tmp/memory.db", "payload": DATABASE}],
            ),
            "unexpected_entry": _scenario(
                tmp,
                "unexpected",
                database,
                members=[
                    {"name": "memory.db", "payload": DATABASE},
                    {"name": "notes.txt", "payload": "hi"},
                ],
            ),
            "missing_member": _scenario(
                tmp, "missing", database, members=[{"name": "other.db", "payload": DATABASE}]
            ),
            "not_a_zip": _scenario(tmp, "not-a-zip", database, raw_text="this is not a zip file\n"),
            "absent": _scenario(tmp, "absent", database, absent=True),
        }

        # The created render, with the home and the dated archive normalized.
        home = tmp / "home"
        home.mkdir()
        archive = _build(
            home / "memory_20260101_000000.zip",
            [{"name": "memory.db", "payload": DATABASE}],
            database,
        )
        created_verification = verify_backup_archive(archive)
        created = {
            "created_render": render_runtime_backup_created(
                backup_path=archive, mirror_home=home, verification=created_verification
            )
            .replace(str(archive), ARCHIVE_TOKEN)
            .replace(str(home), HOME_TOKEN),
            "created_exit": 0 if created_verification.valid else 1,
        }

        # Recorded, not graded: the engines are KNOWN to disagree here.
        deviation_path = _build(
            tmp / "corrupt.zip",
            [{"name": "memory.db", "payload": CORRUPT_DATABASE}],
            database,
        )
        deviation_verification = verify_backup_archive(deviation_path)
        deviation = {
            "why": (
                "Python verifies entry NAMES; this archive holds 4 KB of zeros named "
                "memory.db and the oracle calls it valid. The TypeScript port extracts "
                "and runs PRAGMA quick_check, so it refuses. Asserted by a TS-only test."
            ),
            "members": [{"name": "memory.db", "payload": CORRUPT_DATABASE}],
            "python_valid": deviation_verification.valid,
            "typescript_valid": False,
        }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(
        json.dumps(
            {
                "meta": {
                    "story": "CV22.DS10.US2",
                    "oracle": "src/memory/cli/runtime.py",
                    "archive_token": ARCHIVE_TOKEN,
                    "home_token": HOME_TOKEN,
                    "payload_kinds": {
                        DATABASE: "a real WAL-mode SQLite database, built by the reading engine",
                        CORRUPT_DATABASE: 'b"SQLite format 3\\x00" + 4000 zero bytes',
                        "<anything else>": "the literal string, UTF-8 encoded",
                    },
                },
                "scenarios": scenarios,
                "created": created,
                "documented_deviation": deviation,
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"wrote {OUT_PATH.relative_to(HERE.parent.parent)}")
    for name, scenario in scenarios.items():
        print(f"  {name:22s} -> {'valid' if scenario['valid'] else scenario['note']}")


if __name__ == "__main__":
    main()
