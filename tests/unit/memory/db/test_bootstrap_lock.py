"""Cross-process guarantees of the database bootstrap lock.

The bootstrap phase (journal-mode switch, schema DDL, migrations) must be
serialized across processes. On POSIX this is done with ``fcntl.flock``; these
tests pin the same guarantee on every platform — before the Windows
implementation existed, the lock silently degraded to a no-op there.
"""

import subprocess
import sys
import time

from memory.db.connection import _bootstrap_lock

_CHILD_HOLDS_LOCK = """
import sys, time
from pathlib import Path
from memory.db.connection import _bootstrap_lock

with _bootstrap_lock(Path(sys.argv[1])):
    print("HOLDING", flush=True)
    time.sleep(1.5)
print("RELEASED", flush=True)
"""


def test_bootstrap_lock_serializes_across_processes(tmp_path):
    db_path = tmp_path / "memory.db"
    child = subprocess.Popen(
        [sys.executable, "-c", _CHILD_HOLDS_LOCK, str(db_path)],
        stdout=subprocess.PIPE,
        text=True,
    )
    try:
        assert child.stdout.readline().strip() == "HOLDING"
        started = time.monotonic()
        with _bootstrap_lock(db_path):
            waited = time.monotonic() - started
    finally:
        child.wait(timeout=15)
    assert waited >= 1.0, f"expected to block while the child held the lock; waited {waited:.2f}s"


def test_bootstrap_lock_is_reacquirable_in_sequence(tmp_path):
    db_path = tmp_path / "memory.db"
    for _ in range(3):
        with _bootstrap_lock(db_path):
            pass
