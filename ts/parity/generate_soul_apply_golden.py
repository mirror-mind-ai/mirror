"""Generate the Soul identity-integration golden (CV22.DS7.US6 plateau 4).

`apply_identity_integration` (`src/memory/services/soul.py`) is the only write
in Soul Mode that touches identity. It does two things atomically from the
caller's point of view: inserts an audit row into `identity_integrations`, and
appends a dated bullet into the identity DOCUMENT under a layer-specific
section title.

The document surgery in `append_identity_integration_to_content` is the part
worth grading exhaustively. It is index arithmetic over Markdown with four
distinct branches -- empty document, heading absent, heading last, heading
followed by another section -- and three different strip rules in five lines:

    base   = current_content.strip()      # Python whitespace set
    before = base[:insert_at].rstrip()    # right side only
    after  = base[insert_at:].lstrip("\\n")  # NEWLINES ONLY, not whitespace

That last one is the trap: `lstrip("\\n")` removes newline characters, not
whitespace, so a section that begins with an indented line keeps its indent.
A port reaching for `trimStart()` gets a different document.

Volatile fields are frozen so the golden is byte-stable: `_uuid` and the clock
are patched, which also fixes the `[YYYY-MM-DD]` prefix the bullet carries.

Run:  uv run python ts/parity/generate_soul_apply_golden.py
"""

from __future__ import annotations

import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
OUT_PATH = HERE.parent / "test" / "goldens" / "soul-apply.golden.json"

FROZEN_NOW = datetime(2026, 9, 8, 14, 30, 15, 123456, tzinfo=timezone.utc)
FROZEN_NOW_ISO = FROZEN_NOW.isoformat().replace("+00:00", "Z")
FROZEN_UUID = "5ou1a99y"


class _FrozenDateTime(datetime):
    @classmethod
    def now(cls, tz=None):  # matches datetime.now(tz)
        return FROZEN_NOW


# Document shapes. The heading below is the `self` layer's title; cases that use
# another layer say so explicitly.
SELF_HEADING = "## New Incorporated Principles"

DOC_HEADING_LAST = (
    f"# Soul\n\nSome preamble.\n\n{SELF_HEADING}\n\n- [2026-01-01] an older principle"
)
DOC_HEADING_THEN_SECTION = (
    f"# Soul\n\n{SELF_HEADING}\n\n- [2026-01-01] an older principle\n\n"
    "## Another Section\n\nkept as is"
)
DOC_HEADING_THEN_INDENTED_SECTION = (
    f"# Soul\n\n{SELF_HEADING}\n\n- [2026-01-01] older\n\n"
    "## Another Section\n\n    indented body that lstrip('\\n') must keep"
)
DOC_NO_HEADING = "# Soul\n\nOnly a preamble and no matching section."
DOC_HEADING_WITH_TRAILING_BLANKS = f"# Soul\n\n{SELF_HEADING}\n\n- [2026-01-01] older\n\n\n\n"
DOC_ASTRAL_BEFORE_HEADING = (
    f"# Soul 🎯 沉默\n\nPreamble with astral text.\n\n{SELF_HEADING}\n\n- older"
)
DOC_HEADING_SUBSTRING = (
    f"# Soul\n\n{SELF_HEADING} And More\n\n- [2026-01-01] a longer heading that CONTAINS the title"
)


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        home = Path(tmp) / "soul-apply-fixture"
        home.mkdir()
        for key in ("MEMORY_DIR", "MEMORY_PROD_DIR", "MEMORY_ENV", "OPENROUTER_API_KEY"):
            os.environ.pop(key, None)
        os.environ["MIRROR_HOME"] = str(home)
        os.environ["MIRROR_USER"] = home.name
        os.environ["DB_PATH"] = str(home / "memory.db")

        import memory.models as models_mod
        import memory.storage.identity as identity_mod
        from memory.client import MemoryClient
        from memory.services.soul import (
            IDENTITY_INTEGRATION_SECTION_TITLES,
            apply_identity_integration,
        )

        models_mod.datetime = _FrozenDateTime
        identity_mod.datetime = _FrozenDateTime
        original_uuid = models_mod._uuid
        models_mod._uuid = lambda: FROZEN_UUID

        counter = {"n": 0}

        def client(seed: tuple[str, str, str] | None, *, seed_refs: bool = False):
            counter["n"] += 1
            mem = MemoryClient(db_path=home / f"case-{counter['n']:03d}.db")
            opened = Path(mem.conn.execute("PRAGMA database_list").fetchone()[2]).resolve()
            if not opened.is_relative_to(Path(tmp).resolve()):
                raise RuntimeError(f"refusing non-temporary fixture database: {opened}")
            if seed is not None:
                layer, key, content = seed
                mem.set_identity(layer, key, content)
            if seed_refs:
                # `identity_integrations` has real foreign keys to `conversations`
                # and `memories`; provenance ids must exist. (An id that does NOT
                # exist raises sqlite3.IntegrityError straight through the CLI,
                # which catches only ValueError -- recorded as a finding, not
                # graded here, because the error text is engine-specific.)
                mem.conn.execute(
                    "INSERT INTO conversations (id, started_at, interface) VALUES (?, ?, ?)",
                    ("conv-1", FROZEN_NOW_ISO, "pi"),
                )
                mem.conn.execute(
                    "INSERT INTO memories (id, memory_type, title, content, created_at)"
                    " VALUES (?, ?, ?, ?, ?)",
                    ("mem-1", "journal", "Harvest", "body", FROZEN_NOW_ISO),
                )
                mem.conn.commit()
            return mem

        scenarios: list[dict[str, Any]] = []

        def case(
            name: str,
            *,
            layer: str,
            key: str,
            content: str,
            seed: tuple[str, str, str] | None = None,
            origin: str | None = None,
            conversation_id: str | None = None,
            journal_id: str | None = None,
            metadata: dict | None = None,
            seed_refs: bool = False,
        ) -> None:
            mem = client(seed, seed_refs=seed_refs)
            record: dict[str, Any] = {
                "name": name,
                "layer": layer,
                "key": key,
                "content": content,
                "seed": list(seed) if seed else None,
                "origin": origin,
                "conversation_id": conversation_id,
                "journal_id": journal_id,
                "metadata": metadata,
            }
            try:
                apply_identity_integration(
                    mem.store,
                    layer=layer,
                    key=key,
                    content=content,
                    origin=origin,
                    conversation_id=conversation_id,
                    journal_id=journal_id,
                    metadata=metadata,
                )
            except ValueError as exc:
                record["expected_error"] = str(exc)
            conn = mem.conn
            row = conn.execute(
                "SELECT id, layer, key, content, source, origin, conversation_id, journal_id,"
                " created_at, status, metadata FROM identity_integrations ORDER BY rowid"
            ).fetchall()
            record["expected_integration_rows"] = [dict(r) for r in row]
            identity_row = conn.execute(
                "SELECT content, created_at, updated_at FROM identity WHERE layer = ? AND key = ?",
                (layer, key),
            ).fetchone()
            record["expected_identity"] = dict(identity_row) if identity_row else None
            mem.close()
            scenarios.append(record)

        # --- the four document branches ---
        case(
            "empty_document",
            layer="self",
            key="soul",
            content="a first incorporated principle",
        )
        case(
            "heading_absent",
            layer="self",
            key="soul",
            content="appended under a new heading",
            seed=("self", "soul", DOC_NO_HEADING),
        )
        case(
            "heading_is_last_section",
            layer="self",
            key="soul",
            content="a second principle",
            seed=("self", "soul", DOC_HEADING_LAST),
        )
        case(
            "heading_followed_by_section",
            layer="self",
            key="soul",
            content="inserted before the next section",
            seed=("self", "soul", DOC_HEADING_THEN_SECTION),
        )
        # --- the strip rules ---
        case(
            "next_section_keeps_indent",
            layer="self",
            key="soul",
            content="lstrip removes newlines only",
            seed=("self", "soul", DOC_HEADING_THEN_INDENTED_SECTION),
        )
        case(
            "trailing_blank_lines_collapse",
            layer="self",
            key="soul",
            content="rstrip before the bullet",
            seed=("self", "soul", DOC_HEADING_WITH_TRAILING_BLANKS),
        )
        case(
            "content_is_stripped",
            layer="self",
            key="soul",
            content="   padded content   ",
            seed=("self", "soul", DOC_HEADING_LAST),
        )
        case(
            "astral_text_before_heading",
            layer="self",
            key="soul",
            content="index arithmetic must survive astral characters",
            seed=("self", "soul", DOC_ASTRAL_BEFORE_HEADING),
        )
        case(
            "heading_matches_as_substring",
            layer="self",
            key="soul",
            content="Python matches the title inside a longer heading",
            seed=("self", "soul", DOC_HEADING_SUBSTRING),
        )
        # --- every layer's section title ---
        for layer, key in (("shadow", "profile"), ("ego", "behavior"), ("persona", "engineer")):
            case(
                f"layer_{layer}",
                layer=layer,
                key=key,
                content=f"material integrated into {layer}",
            )
        # --- the audit row's own fields ---
        case(
            "records_provenance",
            layer="self",
            key="soul",
            content="with provenance",
            origin="  a Soul Mode rite on 2026-09-08  ",
            conversation_id="  conv-1  ",
            journal_id="  mem-1  ",
            metadata={"z_last": 1, "a_first": 2},
            seed_refs=True,
        )
        case(
            "blank_provenance_becomes_null",
            layer="self",
            key="soul",
            content="with blank provenance",
            origin="   ",
            conversation_id="  ",
            journal_id="",
        )
        # --- refusals ---
        case("error_unsupported_layer", layer="voice", key="k", content="c")
        case("error_blank_content", layer="self", key="soul", content="   ")

        models_mod._uuid = original_uuid
        titles = dict(IDENTITY_INTEGRATION_SECTION_TITLES)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(
        json.dumps(
            {
                "frozen_now_iso": FROZEN_NOW_ISO,
                "frozen_uuid": FROZEN_UUID,
                "section_titles": titles,
                "scenarios": scenarios,
            },
            indent=2,
            sort_keys=True,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )
    refused = sum(1 for s in scenarios if "expected_error" in s)
    print(f"{len(scenarios)} scenarios ({refused} refused)")
    print(f"wrote {OUT_PATH.relative_to(HERE.parent.parent)}")


if __name__ == "__main__":
    main()
