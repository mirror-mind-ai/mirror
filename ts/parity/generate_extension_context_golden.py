"""Generate the Python extension-context oracle for CV22.DS7.TS2.

Uses only a verified temporary database and the repository's synthetic hello extension.
Run: uv run python ts/parity/generate_extension_context_golden.py
"""

from __future__ import annotations

import json
import os
import shutil
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
OUT_PATH = HERE.parent / "test" / "goldens" / "extension-context.golden.json"
HELLO_FIXTURE = ROOT / "tests" / "unit" / "memory" / "extensions" / "fixtures" / "ext-hello"


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        temporary_root = Path(tmp).resolve()
        home = temporary_root / "mirror-fixture"
        extension_root = home / "extensions" / "hello"
        extension_root.parent.mkdir(parents=True)
        shutil.copytree(HELLO_FIXTURE, extension_root)
        for key in (
            "DB_PATH",
            "MEMORY_DIR",
            "MEMORY_PROD_DIR",
            "MEMORY_ENV",
            "MIRROR_USER",
        ):
            os.environ.pop(key, None)
        database_path = home / "memory.db"
        os.environ["MIRROR_HOME"] = str(home)
        os.environ["DB_PATH"] = str(database_path)

        from memory.db.connection import get_connection
        from memory.extensions.context import collect_extension_context, render_sections
        from memory.extensions.migrations import run_migrations

        conn = get_connection(database_path)
        opened_path = Path(conn.execute("PRAGMA database_list").fetchone()[2]).resolve()
        if opened_path != database_path.resolve() or not opened_path.is_relative_to(temporary_root):
            raise RuntimeError(f"refusing non-temporary fixture database: {opened_path}")
        run_migrations(conn, extension_id="hello", migrations_dir=extension_root / "migrations")
        conn.execute(
            "INSERT INTO ext_hello_pings (message, created_at) VALUES (?, ?)",
            ("oracle ping", "2026-01-01T00:00:00+00:00"),
        )
        for kind, target in (("persona", "engineer"), ("journey", "mirror-ts-core")):
            conn.execute(
                "INSERT INTO _ext_bindings VALUES (?, ?, ?, ?, ?)",
                ("hello", "greeting", kind, target, "2026-01-01T00:00:00+00:00"),
            )
        conn.commit()

        cases = []
        for name, persona, journey in (
            ("persona", "engineer", None),
            ("journey", None, "mirror-ts-core"),
            ("both", "engineer", "mirror-ts-core"),
            ("mismatch", "other", "other"),
        ):
            sections = collect_extension_context(
                conn,
                mirror_home=home,
                persona_id=persona,
                journey_id=journey,
                user="fixture-user",
                query="fixture-query",
            )
            cases.append(
                {
                    "name": name,
                    "persona_id": persona,
                    "journey_id": journey,
                    "sections": [
                        {
                            "extensionId": section.extension_id,
                            "capabilityId": section.capability_id,
                            "bindingKind": section.binding_kind,
                            "bindingTarget": section.binding_target,
                            "text": section.text,
                        }
                        for section in sections
                    ],
                    "rendered": render_sections(sections),
                }
            )
        conn.close()

    OUT_PATH.write_text(json.dumps({"cases": cases}, ensure_ascii=False, indent=2) + "\n")
    print(f"wrote {OUT_PATH}")


if __name__ == "__main__":
    main()
