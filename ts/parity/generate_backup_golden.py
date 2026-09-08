"""Generate the backup golden (CV22.DS7.TS1, plateau 2).

`backup` is the dated-archive gate every mutating repair leans on, so the port
is graded on what a restore actually depends on: the archive name, the member
names and ORDER, each member's CRC-32 and uncompressed size, the staging file
being gone, the retention sweep, and the exact stdout/stderr -- against the
Python oracle (`src/memory/cli/backup.py`), on temporary fixtures only.

Deliberately NOT graded: compressed bytes. Deflate output differs across zlib
builds (CPython links one zlib, Node bundles another), so the `(<KB> KB)` token
in stdout is normalized and archive bytes are never compared. Parity is the
restore image, not the container bytes.

Fixture bytes are synthetic and deterministic: a real SQLite file written by
Python would carry the writing library's version number in its header and
differ between the 3.10 and 3.12 CI legs. Backup never opens the database, so
nothing is lost by using a fixed byte pattern. Member mtimes are pinned with
os.utime and the process runs in TZ=UTC because zipfile stores LOCAL time.

Run:  uv run python ts/parity/generate_backup_golden.py
"""

from __future__ import annotations

import base64
import io
import json
import os
import shutil
import sys
import tempfile
import time
import zipfile
import zlib
from contextlib import redirect_stderr, redirect_stdout
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT_PATH = HERE.parent / "test" / "goldens" / "backup.golden.json"

os.environ["TZ"] = "UTC"
time.tzset()
# Same hermeticity rule as the repair-encoding generator: CI exports
# MEMORY_ENV=test, which `memory.config` reads at import time; clear every
# database override before the first `memory` import so the oracle resolves
# the fixture as memory.db everywhere.
for _key in ("MEMORY_DIR", "MEMORY_PROD_DIR", "MEMORY_ENV", "DB_PATH", "DB_BACKUP_PATH", "BACKUP_DIR"):
    os.environ.pop(_key, None)

FROZEN_NOW = datetime(2026, 9, 7, 14, 3, 5)
FIXTURE_MTIME = int(datetime(2026, 9, 1, 12, 34, 56).timestamp())  # UTC, TZ pinned above


class _FrozenDateTime(datetime):
    """datetime whose now() is pinned, so archive names and cutoffs are deterministic."""

    @classmethod
    def now(cls, tz=None):  # noqa: D102
        return FROZEN_NOW


# name -> bytes. Byte pattern, not a real database: see module docstring.
FIXTURE_FILES: dict[str, bytes] = {
    "memory.db": b"SQLite format 3\x00" + bytes(range(256)) * 24 + b"mirror-fixture-tail",
    "memory.db-wal": b"WAL-SIDECAR-" + bytes(range(0, 256, 3)) * 5,
    "memory.db-shm": b"SHM-SIDECAR-" + b"\x00" * 200,
}

# Pre-existing backups directory. The cutoff is FROZEN_NOW - 30 days
# = 2026-08-08 14:03:05, and the oracle removes strictly-older archives only.
RETENTION_FILES: dict[str, bytes] = {
    "memory_20260808_140304.zip": b"one second older than the cutoff: removed",
    "memory_20260808_140305.zip": b"exactly at the cutoff: kept",
    "memory_20260906_120000.zip": b"recent: kept",
    "memory_notadate.zip": b"unparseable stamp: kept",
    "memory_20260101_000000.zip.partial": b"stranded staging file: swept",
    "other.zip": b"not ours: ignored",
}

# Exact-tie and non-tie sizes for the `.0f` KB token: Python rounds half to even.
KB_FORMAT_SIZES = (512, 1024, 1535, 1536, 2560, 3584, 4096, 1048576, 1049088)


def _write_fixture(home: Path, names: tuple[str, ...]) -> None:
    home.mkdir(parents=True, exist_ok=True)
    for name in names:
        path = home / name
        path.write_bytes(FIXTURE_FILES[name])
        os.utime(path, (FIXTURE_MTIME, FIXTURE_MTIME))


def _write_retention(backup_dir: Path) -> None:
    backup_dir.mkdir(parents=True, exist_ok=True)
    for name, content in RETENTION_FILES.items():
        (backup_dir / name).write_bytes(content)


def _members(archive: Path) -> list[dict[str, object]]:
    with zipfile.ZipFile(archive) as zf:
        assert zf.testzip() is None, "oracle archive must verify"
        return [
            {
                "name": info.filename,
                "crc32": info.CRC,
                "size": info.file_size,
                "compress_type": info.compress_type,
                "date_time": list(info.date_time),
            }
            for info in zf.infolist()
        ]


def _normalize(text: str, home: Path, extra: dict[str, str] | None = None) -> str:
    text = text.replace(str(home), "<home>")
    for needle, marker in (extra or {}).items():
        text = text.replace(needle, marker)
    # The compressed size differs across zlib builds; never grade it.
    import re

    return re.sub(r"\((\d+) KB\)", "(<KB> KB)", text)


def _run(argv: list[str], *, home: Path, env: dict[str, str] | None = None) -> dict[str, object]:
    """Run the oracle's CLI entry point with a frozen clock; capture everything."""
    import memory.cli.backup as backup_module

    saved_env = {k: os.environ.get(k) for k in ("BACKUP_DIR", "MIRROR_HOME", "MIRROR_USER", "DB_PATH", "MEMORY_ENV")}
    for key in saved_env:
        os.environ.pop(key, None)
    for key, value in (env or {}).items():
        os.environ[key] = value

    original_datetime = backup_module.datetime
    backup_module.datetime = _FrozenDateTime
    out, err = io.StringIO(), io.StringIO()
    saved_argv = sys.argv
    sys.argv = ["backup", *argv]
    try:
        with redirect_stdout(out), redirect_stderr(err):
            try:
                backup_module.main()
                code = 0
            except SystemExit as exc:
                code = int(exc.code or 0)
    finally:
        sys.argv = saved_argv
        backup_module.datetime = original_datetime
        for key, value in saved_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
    return {
        "argv": [a.replace(str(home), "<home>") for a in argv],
        "stdout": _normalize(out.getvalue(), home),
        "stderr": _normalize(err.getvalue(), home),
        "exit_code": code,
    }


def _listing(directory: Path) -> list[str]:
    return sorted(p.name for p in directory.iterdir()) if directory.exists() else []


def main() -> None:
    scenarios: dict[str, dict[str, object]] = {}

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)

        # 1. Full: db + sidecars, retention files present, mirror home passed.
        home = root / "full"
        _write_fixture(home, ("memory.db", "memory.db-wal", "memory.db-shm"))
        _write_retention(home / "backups")
        result = _run(["--mirror-home", str(home)], home=home)
        archive = home / "backups" / "memory_20260907_140305.zip"
        scenarios["full"] = {
            **result,
            "fixture_files": ["memory.db", "memory.db-wal", "memory.db-shm"],
            "retention_before": sorted(RETENTION_FILES),
            "archive_name": archive.name,
            "members": _members(archive),
            "backups_after": _listing(home / "backups"),
        }

        # 2. Database only: a single member.
        home = root / "db-only"
        _write_fixture(home, ("memory.db",))
        result = _run(["--mirror-home", str(home)], home=home)
        archive = home / "backups" / "memory_20260907_140305.zip"
        scenarios["db_only"] = {
            **result,
            "fixture_files": ["memory.db"],
            "members": _members(archive),
            "backups_after": _listing(home / "backups"),
        }

        # 3. Silent: no stdout, archive still created.
        home = root / "silent"
        _write_fixture(home, ("memory.db", "memory.db-wal"))
        result = _run(["--mirror-home", str(home), "--silent"], home=home)
        scenarios["silent"] = {
            **result,
            "fixture_files": ["memory.db", "memory.db-wal"],
            "backups_after": _listing(home / "backups"),
        }

        # 4. Explicit destination directory wins over <home>/backups.
        home = root / "explicit-dir"
        _write_fixture(home, ("memory.db",))
        dest = root / "elsewhere" / "archives"
        result = _run(["--mirror-home", str(home), "--backup-dir", str(dest)], home=home)
        result["stdout"] = str(result["stdout"]).replace(str(dest), "<dest>")
        result["argv"] = [a.replace(str(dest), "<dest>") for a in result["argv"]]
        scenarios["explicit_backup_dir"] = {
            **result,
            "fixture_files": ["memory.db"],
            "dest_after": _listing(dest),
            "home_backups_after": _listing(home / "backups"),
        }

        # 5. Missing database: reported, no archive, exit 1 -- but exit 0 with --silent.
        home = root / "missing"
        home.mkdir()
        scenarios["missing_db"] = {**_run(["--mirror-home", str(home)], home=home), "backups_after": _listing(home / "backups")}
        scenarios["missing_db_silent"] = {**_run(["--mirror-home", str(home), "--silent"], home=home), "backups_after": _listing(home / "backups")}

        # 6. Deprecated BACKUP_DIR: warned on stderr, ignored.
        home = root / "deprecated-env"
        _write_fixture(home, ("memory.db",))
        ignored = root / "ignored-by-design"
        result = _run(["--mirror-home", str(home)], home=home, env={"BACKUP_DIR": str(ignored)})
        scenarios["deprecated_backup_dir_env"] = {
            **result,
            "fixture_files": ["memory.db"],
            "backups_after": _listing(home / "backups"),
            "ignored_dir_exists": ignored.exists(),
        }

        # 7. Deprecated env is silent when --backup-dir is explicit.
        home = root / "deprecated-env-explicit"
        _write_fixture(home, ("memory.db",))
        dest = root / "explicit-wins"
        result = _run(["--mirror-home", str(home), "--backup-dir", str(dest)], home=home, env={"BACKUP_DIR": str(ignored)})
        result["stdout"] = str(result["stdout"]).replace(str(dest), "<dest>")
        result["argv"] = [a.replace(str(dest), "<dest>") for a in result["argv"]]
        scenarios["deprecated_env_with_explicit_dir"] = {**result, "fixture_files": ["memory.db"], "dest_after": _listing(dest)}

        shutil.rmtree(root / "elsewhere", ignore_errors=True)

    golden = {
        "meta": {
            "note": (
                "Oracle: src/memory/cli/backup.py with datetime.now() frozen at "
                f"{FROZEN_NOW.isoformat()} (TZ=UTC) and fixture mtimes pinned. Members are graded by "
                "name, order, CRC-32, size, and DOS date_time; compressed bytes and the KB token are "
                "not graded (zlib builds differ)."
            ),
            "frozen_now": FROZEN_NOW.isoformat(),
            "fixture_mtime_epoch": FIXTURE_MTIME,
            "retention_days": 30,
        },
        "fixture_files": {name: base64.b64encode(content).decode("ascii") for name, content in FIXTURE_FILES.items()},
        "fixture_crc32": {name: zlib.crc32(content) for name, content in FIXTURE_FILES.items()},
        "retention_files": {name: base64.b64encode(content).decode("ascii") for name, content in RETENTION_FILES.items()},
        "kb_format": {str(size): f"{size / 1024:.0f}" for size in KB_FORMAT_SIZES},
        "scenarios": scenarios,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(golden, indent=2, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8")

    for name, scenario in scenarios.items():
        print(f"  {name:32} exit={scenario['exit_code']} members={[m['name'] for m in scenario.get('members', [])]}")
    print(f"wrote {OUT_PATH.relative_to(HERE.parent.parent)}")


if __name__ == "__main__":
    main()
