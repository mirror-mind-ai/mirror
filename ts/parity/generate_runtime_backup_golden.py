"""Generate the `runtime backup` golden (CV22.DS10.US2, plateau 2).

`runtime backup` is NOT the `backup` command DS7.TS1 ported. That one creates
an archive and stops; this one is the UPDATER'S SAFETY STAGE, so it creates,
verifies, and renders a manual recovery route, and its exit code follows the
verification rather than the creation. Its three functions
(`verify_backup_archive`, `render_backup_verification`,
`render_runtime_backup_created`) had no TypeScript counterpart before this
story.

What is graded: the RENDER and the EXIT CODE for every refusal the oracle can
produce, against archives whose bytes are embedded here so both engines read
the identical input -- including the two unsafe-entry shapes (`../memory.db`
and `/tmp/memory.db`) that the story's own inventory missed.

Deliberately NOT graded, and the reason it matters:

  * `corrupt_db` -- an archive holding a well-named `memory.db` that is 4 KB of
    zeros. Python reports it VALID, because it verifies entry NAMES. The
    TypeScript port extracts and runs `PRAGMA quick_check`, so it reports it
    INVALID. That is the one deliberate deviation in this port, measured in the
    story's plateau-0 baseline and pinned by a TS-only test. A scenario the two
    engines are known to disagree on has no place in a parity golden, so it is
    recorded here as `documented_deviation` and asserted separately.

  * archive BYTES. Deflate output differs across zlib builds (CPython links
    one, Node bundles another), exactly as `generate_backup_golden.py` records.
    Parity is the verdict, not the container.

This generator is NOT in CI's determinism gate, and must not be added to it:
the fixtures hold a REAL SQLite database, whose header carries the writing
library's version, so regeneration is legitimately not byte-stable across the
3.10 and 3.12 legs. A real database is required rather than a byte pattern
precisely because the port opens it.

Run:  uv run python ts/parity/generate_runtime_backup_golden.py
"""

from __future__ import annotations

import base64
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


def _real_database(path: Path) -> bytes:
    """A real, openable, WAL-mode SQLite database.

    WAL is not incidental: every archive `create_backup` writes holds a
    WAL-mode database (header byte 18 == 2), and a WAL database opened
    read-only without its sidecars fails with SQLITE_CANTOPEN unless the reader
    asks for `immutable`. A rollback-journal fixture would hide that, and did:
    the port's first unit fixture used one and passed while the real archive
    failed.
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


def _zip(path: Path, members: list[tuple[str, bytes]]) -> Path:
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, payload in members:
            archive.writestr(name, payload)
    return path


def _scenario(path: Path) -> dict[str, object]:
    verification = verify_backup_archive(path)
    return {
        "archive_base64": base64.b64encode(path.read_bytes()).decode("ascii")
        if path.exists()
        else None,
        "entries": list(verification.entries),
        "valid": verification.valid,
        "note": verification.note,
        "verify_render": render_backup_verification(verification).replace(str(path), ARCHIVE_TOKEN),
        "verify_exit": 0 if verification.valid else 1,
    }


def main() -> None:
    with tempfile.TemporaryDirectory() as raw:
        tmp = Path(raw)
        db = _real_database(tmp / "memory.db")
        corrupt = b"SQLite format 3\x00" + b"\x00" * 4000

        scenarios: dict[str, object] = {}
        scenarios["valid"] = _scenario(_zip(tmp / "valid.zip", [("memory.db", db)]))
        scenarios["valid_with_sidecars"] = _scenario(
            _zip(
                tmp / "sidecars.zip",
                [("memory.db", db), ("memory.db-wal", b"wal"), ("memory.db-shm", b"shm")],
            )
        )
        scenarios["traversal_entry"] = _scenario(
            _zip(tmp / "traversal.zip", [("../memory.db", db)])
        )
        scenarios["absolute_entry"] = _scenario(
            _zip(tmp / "absolute.zip", [("/tmp/memory.db", db)])
        )
        scenarios["unexpected_entry"] = _scenario(
            _zip(tmp / "unexpected.zip", [("memory.db", db), ("notes.txt", b"hi")])
        )
        scenarios["missing_member"] = _scenario(_zip(tmp / "missing.zip", [("other.db", db)]))

        not_a_zip = tmp / "not-a-zip.zip"
        not_a_zip.write_bytes(b"this is not a zip file\n")
        scenarios["not_a_zip"] = _scenario(not_a_zip)

        absent = tmp / "absent.zip"
        scenarios["absent"] = _scenario(absent)

        # The created render, with the home and the dated archive normalized.
        home = tmp / "home"
        home.mkdir()
        archive = _zip(home / "memory_20260101_000000.zip", [("memory.db", db)])
        created_verification = verify_backup_archive(archive)
        created_render = render_runtime_backup_created(
            backup_path=archive, mirror_home=home, verification=created_verification
        )
        created = {
            "created_render": created_render.replace(str(archive), ARCHIVE_TOKEN).replace(
                str(home), "<HOME>"
            ),
            "created_exit": 0 if created_verification.valid else 1,
        }

        # Recorded, not graded: the engines are KNOWN to disagree here.
        deviation_archive = _zip(tmp / "corrupt.zip", [("memory.db", corrupt)])
        deviation_verification = verify_backup_archive(deviation_archive)
        deviation = {
            "why": (
                "Python verifies entry NAMES; this archive holds 4 KB of zeros named "
                "memory.db and the oracle calls it valid. The TypeScript port extracts "
                "and runs PRAGMA quick_check, so it refuses. Asserted by a TS-only test."
            ),
            "archive_base64": base64.b64encode(deviation_archive.read_bytes()).decode("ascii"),
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
        assert isinstance(scenario, dict)
        print(f"  {name:22s} -> {'valid' if scenario['valid'] else scenario['note']}")


if __name__ == "__main__":
    main()
