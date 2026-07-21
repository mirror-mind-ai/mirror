"""Partial-failure resumability for the migration engine (CV22.DS6.TS2).

`migrations.py`'s own module docstring documents the contract: "migrations do
NOT silently swallow errors... Both layers must tolerate [partial
application] without masking real bugs." Each migration commits
individually; if migration N fails, migrations 1..N-1 stay applied and
recorded, N is not recorded, and a subsequent run resumes from exactly that
point. This was previously untested even in Python — resolved as in-scope for
CV22.DS6.TS2 per the security-engineer Plan-review condition (a half-migrated
database is an integrity concern, not merely a functional gap).
"""

import sqlite3

import pytest

import memory.db.migrations as migrations_module
from memory.db.migrations import MIGRATIONS, run_migrations

pytestmark = pytest.mark.unit

MIGRATION_IDS = [migration_id for migration_id, _apply in MIGRATIONS]


def _fresh_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


class TestPartialFailureResumability:
    def test_resumes_from_a_partial_ledger_without_reapplying_earlier_migrations(self):
        conn = _fresh_conn()
        run_migrations(conn)  # fully migrate a fresh DB first

        prefix = MIGRATION_IDS[:8]
        placeholders = ",".join("?" for _ in prefix)
        conn.execute(f"DELETE FROM _migrations WHERE id NOT IN ({placeholders})", prefix)
        conn.commit()
        assert {row[0] for row in conn.execute("SELECT id FROM _migrations")} == set(prefix)

        run_migrations(conn)  # must resume and complete without error

        applied_after = {row[0] for row in conn.execute("SELECT id FROM _migrations")}
        assert applied_after == set(MIGRATION_IDS)

    def test_a_failing_migration_is_not_recorded_and_prior_state_stays_committed(self):
        """A migration that raises must not be recorded, and migrations
        before it must remain committed — proven against run_migrations' real
        per-migration commit discipline (module-level MIGRATIONS is monkey-
        patched for this one test; production code is untouched)."""
        conn = _fresh_conn()

        def _boom(_conn: sqlite3.Connection) -> None:
            raise RuntimeError("simulated migration failure")

        failing_index = 3  # fail "004_tasks_temporal_fields" specifically
        patched = list(MIGRATIONS)
        patched[failing_index] = (patched[failing_index][0], _boom)

        original = migrations_module.MIGRATIONS
        migrations_module.MIGRATIONS = patched
        try:
            with pytest.raises(RuntimeError, match="simulated migration failure"):
                run_migrations(conn)
        finally:
            migrations_module.MIGRATIONS = original

        applied = {row[0] for row in conn.execute("SELECT id FROM _migrations")}
        assert applied == set(MIGRATION_IDS[:failing_index])
        assert MIGRATION_IDS[failing_index] not in applied

        # Retry with the real (unpatched) migrations: must resume from exactly
        # the failed one onward and complete successfully.
        run_migrations(conn)
        applied_after_retry = {row[0] for row in conn.execute("SELECT id FROM _migrations")}
        assert applied_after_retry == set(MIGRATION_IDS)
