"""Generate the Soul session-state golden fixture (CV22.DS7.US6 plateau 2).

`src/memory/services/soul.py` keeps the ritual's provisional state inside
`runtime_sessions.metadata`, a JSON TEXT column BOTH cores read and write while
the strangler runs. The graded artifact is therefore the column's exact BYTES
after each operation, not a re-derivation of the state:

  * Python writes `json.dumps(metadata, ensure_ascii=False)` -- separators
    `", "` and `": "`. `JSON.stringify` writes neither, so a naive port stores
    a different string for identical state (`ts/src/util/pyGenerators.ts`
    exists for exactly this reason).
  * `_clear_soul_key` writes SQL NULL, not `"{}"`, when the metadata object
    empties out -- and writes NOTHING AT ALL when the session row is absent.
  * `_decode_metadata` swallows invalid JSON and non-object JSON into `{}`, so
    a corrupt column is overwritten rather than raising.
  * `harvest set` with no argument PROMOTES the maturation fruit and pops it in
    the same write; the two keys are never both present afterwards.

Session-id resolution is graded here too, because the CLI composes two
resolvers with different strip rules: `resolve_operating_session_id` returns an
explicit id VERBATIM (so `--session-id "  "` is a real session id), while
`resolve_soul_session_id` strips and falls back to `__global_soul_mode__`.

Run:  uv run python ts/parity/generate_soul_surface_state_golden.py
"""

from __future__ import annotations

import json
import os
import sqlite3
import tempfile
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
OUT_PATH = HERE.parent / "test" / "goldens" / "soul-state.golden.json"

SESSION = "soul-session"

PY_JSON = {"operating_mode": {"active_mode": "Soul Mode", "active_journey": "j"}}


def _seed(store: Any, metadata: str | None, *, create_row: bool = True) -> None:
    if not create_row:
        return
    store.upsert_runtime_session(SESSION, interface="pi", metadata=metadata)


def _column(conn: sqlite3.Connection) -> dict[str, Any]:
    row = conn.execute(
        "SELECT metadata, active FROM runtime_sessions WHERE session_id = ?", (SESSION,)
    ).fetchone()
    if row is None:
        return {"row_present": False, "metadata": None, "active": None}
    return {"row_present": True, "metadata": row[0], "active": row[1]}


def build_state_scenarios(make_store) -> list[dict[str, Any]]:
    from memory.services.soul import (
        clear_fruit_in_maturation,
        clear_harvested_fruit,
        get_fruit_in_maturation,
        get_harvested_fruit,
        harvest_fruit,
        set_fruit_in_maturation,
    )

    def operation(name: str, seed: str | None, call, *, create_row: bool = True):
        store, conn = make_store()
        _seed(store, seed, create_row=create_row)
        scenario: dict[str, Any] = {
            "name": name,
            "seed_metadata": seed,
            "seed_row": create_row,
        }
        try:
            result = call(store)
            scenario["result"] = result.fruit if hasattr(result, "fruit") else result
        except ValueError as exc:
            scenario["expected_error"] = str(exc)
        scenario["after"] = _column(conn)
        conn.close()
        return scenario

    def fruit_set(value: str):
        return lambda store: set_fruit_in_maturation(store, value, session_id=SESSION)

    def harvest_set(value: str | None):
        return lambda store: harvest_fruit(store, fruit=value, session_id=SESSION)

    fruit_get = lambda store: get_fruit_in_maturation(store, session_id=SESSION)  # noqa: E731
    harvest_get = lambda store: get_harvested_fruit(store, session_id=SESSION)  # noqa: E731
    fruit_clear = lambda store: clear_fruit_in_maturation(store, session_id=SESSION)  # noqa: E731
    harvest_clear = lambda store: clear_harvested_fruit(store, session_id=SESSION)  # noqa: E731

    soul = lambda payload: json.dumps({"soul": payload}, ensure_ascii=False)  # noqa: E731
    with_mode = lambda payload: json.dumps(  # noqa: E731
        {**PY_JSON, "soul": payload}, ensure_ascii=False
    )

    return [
        # --- fruit set: the write bytes ---
        operation("fruit_set_on_empty_metadata", None, fruit_set("a small true thing")),
        operation("fruit_set_strips_padding", None, fruit_set("  padded  ")),
        operation("fruit_set_unicode_kept_raw", None, fruit_set("café 🎯 沉默")),
        operation(
            "fruit_set_preserves_other_metadata_keys",
            json.dumps(PY_JSON, ensure_ascii=False),
            fruit_set("kept alongside operating mode"),
        ),
        operation(
            "fruit_set_overwrites_existing", soul({"fruit_in_maturation": "old"}), fruit_set("new")
        ),
        operation(
            "fruit_set_keeps_harvest_key",
            soul({"harvested_fruit": "already harvested"}),
            fruit_set("a second maturation"),
        ),
        operation("fruit_set_on_invalid_json", "{not json", fruit_set("recovered")),
        operation("fruit_set_on_non_object_json", "[1, 2]", fruit_set("recovered")),
        operation("fruit_set_on_non_dict_soul_key", '{"soul": "scalar"}', fruit_set("recovered")),
        operation("fruit_set_error_blank", None, fruit_set("   ")),
        operation(
            "fruit_set_creates_missing_row", None, fruit_set("row created"), create_row=False
        ),
        # --- fruit get ---
        operation("fruit_get_present", soul({"fruit_in_maturation": " padded "}), fruit_get),
        operation("fruit_get_absent", soul({"harvested_fruit": "h"}), fruit_get),
        operation("fruit_get_blank_value", soul({"fruit_in_maturation": "   "}), fruit_get),
        operation("fruit_get_non_string_value", soul({"fruit_in_maturation": 42}), fruit_get),
        operation("fruit_get_no_row", None, fruit_get, create_row=False),
        operation("fruit_get_invalid_json", "{not json", fruit_get),
        # --- fruit clear ---
        operation(
            "fruit_clear_last_key_writes_null", soul({"fruit_in_maturation": "f"}), fruit_clear
        ),
        operation(
            "fruit_clear_keeps_sibling_soul_key",
            soul({"fruit_in_maturation": "f", "harvested_fruit": "h"}),
            fruit_clear,
        ),
        operation(
            "fruit_clear_keeps_other_metadata",
            with_mode({"fruit_in_maturation": "f"}),
            fruit_clear,
        ),
        operation("fruit_clear_no_row_writes_nothing", None, fruit_clear, create_row=False),
        operation("fruit_clear_absent_key", soul({"harvested_fruit": "h"}), fruit_clear),
        # --- harvest set ---
        operation(
            "harvest_set_promotes_maturation",
            soul({"fruit_in_maturation": "matured"}),
            harvest_set(None),
        ),
        operation(
            "harvest_set_explicit_replaces_maturation",
            soul({"fruit_in_maturation": "matured"}),
            harvest_set("  explicit  "),
        ),
        operation("harvest_set_error_nothing_to_harvest", None, harvest_set(None)),
        operation(
            "harvest_set_blank_falls_back_to_maturation",
            soul({"fruit_in_maturation": "matured"}),
            harvest_set("   "),
        ),
        operation("harvest_set_error_blank_and_no_maturation", None, harvest_set("  ")),
        operation(
            "harvest_set_preserves_other_metadata",
            with_mode({"fruit_in_maturation": "matured"}),
            harvest_set(None),
        ),
        # --- harvest get / clear ---
        operation("harvest_get_present", soul({"harvested_fruit": "h"}), harvest_get),
        operation("harvest_get_absent", None, harvest_get),
        operation("harvest_clear_writes_null", soul({"harvested_fruit": "h"}), harvest_clear),
        operation(
            "harvest_clear_keeps_maturation",
            soul({"fruit_in_maturation": "f", "harvested_fruit": "h"}),
            harvest_clear,
        ),
        operation("harvest_clear_no_row_writes_nothing", None, harvest_clear, create_row=False),
    ]


def build_session_id_scenarios(make_store) -> list[dict[str, Any]]:
    from memory.cli.soul import _resolve_cli_soul_session_id
    from memory.services.soul import resolve_soul_session_id

    class _Mem:
        def __init__(self, store):
            self.store = store

    cases = [
        ("explicit_wins", "explicit-id", "", True),
        ("explicit_is_not_stripped", "  spaced  ", "", True),
        ("env_used_when_no_explicit", None, "env-id", True),
        ("env_is_stripped", None, "  env-id  ", True),
        ("active_row_when_no_explicit_or_env", None, "", True),
        ("global_constant_when_nothing", None, "", False),
    ]
    scenarios: list[dict[str, Any]] = []
    for name, explicit, env, seed_active_row in cases:
        store, conn = make_store()
        if seed_active_row:
            store.upsert_runtime_session("active-row-session", interface="pi", active=True)
        previous = os.environ.get("MIRROR_SESSION_ID")
        if env:
            os.environ["MIRROR_SESSION_ID"] = env
        else:
            os.environ.pop("MIRROR_SESSION_ID", None)
        try:
            resolved = _resolve_cli_soul_session_id(_Mem(store), explicit)
            soul_only = resolve_soul_session_id(explicit)
        finally:
            if previous is None:
                os.environ.pop("MIRROR_SESSION_ID", None)
            else:
                os.environ["MIRROR_SESSION_ID"] = previous
        conn.close()
        scenarios.append(
            {
                "name": name,
                "explicit": explicit,
                "env": env,
                "active_row": "active-row-session" if seed_active_row else None,
                "resolved": resolved,
                "resolved_soul_only": soul_only,
            }
        )
    return scenarios


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        home = Path(tmp) / "soul-fixture"
        home.mkdir()
        for key in ("MEMORY_DIR", "MEMORY_PROD_DIR", "MEMORY_ENV", "OPENROUTER_API_KEY"):
            os.environ.pop(key, None)
        fixture_db = home / "memory.db"
        os.environ["MIRROR_HOME"] = str(home)
        os.environ["MIRROR_USER"] = home.name
        os.environ["DB_PATH"] = str(fixture_db)

        from memory.client import MemoryClient

        counter = {"n": 0}

        def make_store():
            counter["n"] += 1
            path = home / f"case-{counter['n']:03d}.db"
            mem = MemoryClient(db_path=path)
            opened = Path(mem.conn.execute("PRAGMA database_list").fetchone()[2]).resolve()
            if not opened.is_relative_to(Path(tmp).resolve()):
                raise RuntimeError(f"refusing non-temporary fixture database: {opened}")
            return mem.store, mem.conn

        payload = {
            "session_constant": "__global_soul_mode__",
            "state": build_state_scenarios(make_store),
            "session_ids": build_session_id_scenarios(make_store),
        }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(
        json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    errors = sum(1 for s in payload["state"] if "expected_error" in s)
    print(
        f"{len(payload['state'])} state scenarios ({errors} refused), "
        f"{len(payload['session_ids'])} session-id scenarios"
    )
    print(f"wrote {OUT_PATH.relative_to(HERE.parent.parent)}")


if __name__ == "__main__":
    main()
