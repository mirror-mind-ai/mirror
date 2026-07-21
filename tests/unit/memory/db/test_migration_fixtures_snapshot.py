"""Migration-transition fixture drift guard (CV22.DS6.TS2, Track B).

The committed fixtures under ts/test/fixtures/migrations/ are the
cross-language oracle for legacy-transition parity: a `<name>-pre-state.sql`
seed plus a `<name>-expected.json` captured by running Python's REAL
`run_migrations` forward from that seed to completion. This test regenerates
each expected capture from the committed seed and asserts it still matches —
a Python migration change cannot silently drift from what the TS port was
built against, mirroring `test_schema_inventory_snapshot.py` and
`test_ts_schema_contract.py`.
"""

import importlib.util
import json
import sys
from pathlib import Path

import pytest

pytestmark = pytest.mark.unit

_REPO_ROOT = Path(__file__).resolve().parents[4]
_FIXTURES_DIR = _REPO_ROOT / "ts" / "test" / "fixtures" / "migrations"


def _load_generator():
    """Load generate_migration_fixtures.py by path — ts/parity/ is a script
    directory (matching sibling generators like generate_golden.py), not an
    importable Python package, so this avoids introducing a new `ts.*`
    package convention just for one test."""
    module_path = _REPO_ROOT / "ts" / "parity" / "generate_migration_fixtures.py"
    spec = importlib.util.spec_from_file_location("generate_migration_fixtures", module_path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


_generator = _load_generator()
CHECKPOINTS = _generator.CHECKPOINTS
_capture_expected = _generator._capture_expected

_STEMS = [migration_id.split("_", 1)[0] for migration_id in CHECKPOINTS] + ["chain-multi-hop"]

_REGENERATE_HINT = (
    "ts/test/fixtures/migrations/ has drifted from a live run of Python's real "
    "migrations. Regenerate in the same commit that changes "
    "src/memory/db/migrations.py:\n"
    "  uv run python ts/parity/generate_migration_fixtures.py\n"
    "then re-run this test."
)


@pytest.mark.parametrize("stem", _STEMS)
def test_committed_expected_matches_live_regeneration(stem: str) -> None:
    seed_path = _FIXTURES_DIR / f"migration-{stem}-pre-state.sql"
    expected_path = _FIXTURES_DIR / f"migration-{stem}-expected.json"
    seed_sql = seed_path.read_text(encoding="utf-8")
    committed = json.loads(expected_path.read_text(encoding="utf-8"))

    live = _capture_expected(seed_sql)

    for key in live:
        assert live[key] == committed.get(key), (
            f"migration-{stem}-expected.json[{key!r}] has drifted:\n"
            f"  live:      {live[key]}\n"
            f"  committed: {committed.get(key)}\n{_REGENERATE_HINT}"
        )
    assert live == committed, _REGENERATE_HINT


def test_all_committed_stems_are_generator_covered() -> None:
    on_disk = {
        path.stem.removeprefix("migration-").removesuffix("-pre-state")
        for path in _FIXTURES_DIR.glob("migration-*-pre-state.sql")
    }
    assert on_disk == set(_STEMS), (
        "Fixture files on disk do not match the generator's declared checkpoint "
        f"set. On disk: {sorted(on_disk)}; declared: {sorted(_STEMS)}."
    )
