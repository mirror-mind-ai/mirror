"""Generate the operating-mode metadata BYTE golden (CV22.DS7.US6, scope amendment).

Every other artifact covering `runtime_sessions.metadata` compares the column's
parsed VALUE: `mirror-state.golden.json` stores it as an object, and
`writeParityFixture.ts` canonicalizes the cell before hashing (a deliberate
DS6.US1 decision). Both were right for what they grade, and between them they
let a serialization-dialect divergence live in the column from DS7.US4 until
DS7.US6 found it -- TypeScript writing `{"operating_mode":{...}}` where Python
writes `{"operating_mode": {...}}`.

This golden closes that blind spot the only way it can be closed: by recording
the exact string Python stores and asserting the TypeScript writer produces the
same one. It is deliberately narrow -- the bytes, nothing else.

The column is co-written by both cores until every command that touches it is
flipped, and Soul shares the same object, so byte agreement here is a
correctness property of the shared seam rather than a cosmetic preference.

Run:  uv run python ts/parity/generate_operating_mode_golden.py
"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
OUT_PATH = HERE.parent / "test" / "goldens" / "operating-mode-metadata.golden.json"

SESSION = "operating-mode-session"


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        home = Path(tmp) / "operating-mode-fixture"
        home.mkdir()
        for key in ("MEMORY_DIR", "MEMORY_PROD_DIR", "MEMORY_ENV", "OPENROUTER_API_KEY"):
            os.environ.pop(key, None)
        os.environ["MIRROR_HOME"] = str(home)
        os.environ["MIRROR_USER"] = home.name
        os.environ["DB_PATH"] = str(home / "memory.db")

        from memory.client import MemoryClient
        from memory.services.operating_mode import (
            MODE_STATE_SESSION_ID as GLOBAL_MODE_SESSION_ID,
        )
        from memory.services.operating_mode import activate_mode, deactivate_mode

        counter = {"n": 0}

        def store():
            counter["n"] += 1
            path = home / f"case-{counter['n']:03d}.db"
            mem = MemoryClient(db_path=path)
            opened = Path(mem.conn.execute("PRAGMA database_list").fetchone()[2]).resolve()
            if not opened.is_relative_to(Path(tmp).resolve()):
                raise RuntimeError(f"refusing non-temporary fixture database: {opened}")
            return mem.store, mem.conn

        def metadata(conn, session_id: str) -> str | None:
            row = conn.execute(
                "SELECT metadata FROM runtime_sessions WHERE session_id = ?", (session_id,)
            ).fetchone()
            return row[0] if row else None

        scenarios: list[dict[str, Any]] = []

        def case(name: str, *, seed: str | None, run, read_session: str) -> None:
            st, conn = store()
            if seed is not None:
                st.upsert_runtime_session(SESSION, interface="pi", metadata=seed)
            run(st)
            conn.commit()
            scenarios.append(
                {
                    "name": name,
                    "seed_metadata": seed,
                    "read_session": read_session,
                    "expected_metadata": metadata(conn, read_session),
                }
            )
            conn.close()

        soul_neighbour = json.dumps(
            {"soul": {"fruit_in_maturation": "a fruit already maturing"}}, ensure_ascii=False
        )

        case(
            "activate_session_no_prior_metadata",
            seed=None,
            run=lambda st: activate_mode(
                st, mode="Soul Mode", journey="mirror-ts-core", session_id=SESSION
            ),
            read_session=SESSION,
        )
        case(
            "activate_session_beside_soul_key",
            seed=soul_neighbour,
            run=lambda st: activate_mode(
                st, mode="Soul Mode", journey="mirror-ts-core", session_id=SESSION
            ),
            read_session=SESSION,
        )
        case(
            "activate_session_without_journey",
            seed=None,
            run=lambda st: activate_mode(st, mode="Soul Mode", journey=None, session_id=SESSION),
            read_session=SESSION,
        )
        case(
            "activate_session_unicode_journey",
            seed=None,
            run=lambda st: activate_mode(
                st, mode="Soul Mode", journey="jornada-café-沉默", session_id=SESSION
            ),
            read_session=SESSION,
        )
        case(
            "activate_global_without_session",
            seed=None,
            run=lambda st: activate_mode(
                st, mode="Builder Mode", journey="mirror-ts-core", session_id=None
            ),
            read_session=GLOBAL_MODE_SESSION_ID,
        )
        case(
            "deactivate_session_leaves_soul_key",
            seed=json.dumps(
                {
                    "soul": {"fruit_in_maturation": "a fruit already maturing"},
                    "operating_mode": {"active_mode": "Soul Mode", "active_journey": "j"},
                },
                ensure_ascii=False,
            ),
            run=lambda st: deactivate_mode(st, session_id=SESSION),
            read_session=SESSION,
        )
        case(
            "deactivate_session_leaves_nothing",
            seed=json.dumps(
                {"operating_mode": {"active_mode": "Soul Mode", "active_journey": "j"}},
                ensure_ascii=False,
            ),
            run=lambda st: deactivate_mode(st, session_id=SESSION),
            read_session=SESSION,
        )

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(
        json.dumps(
            {"global_session_id": GLOBAL_MODE_SESSION_ID, "scenarios": scenarios},
            indent=2,
            sort_keys=True,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"{len(scenarios)} scenarios")
    print(f"wrote {OUT_PATH.relative_to(HERE.parent.parent)}")


if __name__ == "__main__":
    main()
