"""Generate the Soul voice-prompt golden fixture (CV22.DS7.US6 plateau 3).

`services/soul_prompt.py` composes three prompts: Wisdom and Beauty are the
packaged templates verbatim, and Self injects the user's `self/soul` identity
into a `{user_self_identity}` placeholder.

The interesting case is the injection, and it is a security case rather than a
formatting one. Python's `str.replace(old, new)` is a literal replacement.
JavaScript's is not, twice over: `String.prototype.replace` with a string
pattern replaces only the FIRST occurrence, and -- in both `replace` and
`replaceAll` -- `$&`, "$`", `$'`, `$1`, and `$$` inside the REPLACEMENT are
interpreted as substitution patterns. The replacement here is the user's own
identity document, so a naive port lets identity text rewrite the prompt
template around it.

The corpus therefore carries identity content built from those exact sequences.
Python renders them literally; any port that does not is broken in a way no
ordinary prompt test would notice.

Run:  uv run python ts/parity/generate_soul_prompt_golden.py
"""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
OUT_PATH = HERE.parent / "test" / "goldens" / "soul-prompt.golden.json"

# Every JavaScript replacement-pattern sequence, inside the injected value.
DOLLAR_HAZARD = (
    "Identity carrying $& and $` and $' and $1 and $$ must survive injection exactly as written."
)


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        home = Path(tmp) / "soul-prompt-fixture"
        home.mkdir()
        for key in ("MEMORY_DIR", "MEMORY_PROD_DIR", "MEMORY_ENV", "OPENROUTER_API_KEY"):
            os.environ.pop(key, None)
        os.environ["MIRROR_HOME"] = str(home)
        os.environ["MIRROR_USER"] = home.name
        os.environ["DB_PATH"] = str(home / "memory.db")

        from memory.client import MemoryClient
        from memory.services.soul_prompt import (
            SELF_IDENTITY_PLACEHOLDER,
            SELF_IDENTITY_UNAVAILABLE,
            compose_soul_beauty_voice_prompt,
            compose_soul_self_voice_prompt,
            compose_soul_wisdom_voice_prompt,
            load_soul_beauty_voice_template,
            load_soul_self_voice_template,
            load_soul_wisdom_voice_template,
        )

        counter = {"n": 0}

        def client(identity: str | None):
            counter["n"] += 1
            mem = MemoryClient(db_path=home / f"case-{counter['n']:03d}.db")
            opened = Path(mem.conn.execute("PRAGMA database_list").fetchone()[2]).resolve()
            if not opened.is_relative_to(Path(tmp).resolve()):
                raise RuntimeError(f"refusing non-temporary fixture database: {opened}")
            if identity is not None:
                mem.set_identity("self", "soul", identity)
            return mem

        self_cases: list[dict[str, Any]] = []
        for name, identity in (
            ("no_identity_row", None),
            ("blank_identity", "   \n\n  "),
            ("simple_identity", "I am the one who keeps returning to the same question."),
            ("padded_identity", "\n\n   padded on both ends   \n\n"),
            # The two characters where Python's strip() and JavaScript's trim()
            # disagree, in both directions. Without these, a `trim()` port
            # passes the whole corpus.
            ("unit_separator_padded_identity", "\u001fstripped by Python, kept by trim()\u001f"),
            ("bom_padded_identity", "\ufeffkept by Python, stripped by trim()\ufeff"),
            ("multiline_identity", "First principle.\n\nSecond principle.\n- a bullet"),
            ("unicode_identity", "Silêncio, 沉默, and 🎯 kept raw"),
            ("dollar_pattern_identity", DOLLAR_HAZARD),
            ("identity_containing_the_placeholder", f"before {SELF_IDENTITY_PLACEHOLDER} after"),
        ):
            mem = client(identity)
            try:
                composed = compose_soul_self_voice_prompt(mem)
            finally:
                mem.close()
            self_cases.append(
                {
                    "name": name,
                    "identity": identity,
                    "expected_prompt_sha256": hashlib.sha256(composed.encode("utf-8")).hexdigest(),
                    # Observed, not re-derived: the value Python actually placed
                    # at the placeholder, recovered by subtracting the template's
                    # own prefix and suffix from the composed prompt. A failure
                    # then shows readable text instead of only a hash mismatch.
                    "expected_injected_value": _injected_value(
                        composed, load_soul_self_voice_template(), SELF_IDENTITY_PLACEHOLDER
                    ),
                    "expected_length": len(composed),
                }
            )

        templates = {
            "self": load_soul_self_voice_template(),
            "wisdom": load_soul_wisdom_voice_template(),
            "beauty": load_soul_beauty_voice_template(),
        }
        payload = {
            "placeholder": SELF_IDENTITY_PLACEHOLDER,
            "unavailable": SELF_IDENTITY_UNAVAILABLE,
            "template_sha256": {
                name: hashlib.sha256(text.encode("utf-8")).hexdigest()
                for name, text in templates.items()
            },
            "wisdom_prompt_sha256": hashlib.sha256(
                compose_soul_wisdom_voice_prompt().encode("utf-8")
            ).hexdigest(),
            "beauty_prompt_sha256": hashlib.sha256(
                compose_soul_beauty_voice_prompt().encode("utf-8")
            ).hexdigest(),
            "self_cases": self_cases,
        }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(
        json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"{len(self_cases)} self-voice cases, 3 templates")
    print(f"wrote {OUT_PATH.relative_to(HERE.parent.parent)}")


def _injected_value(composed: str, template: str, placeholder: str) -> str:
    """What Python put at the placeholder, read back out of its own output."""
    prefix, _, suffix = template.partition(placeholder)
    if not composed.startswith(prefix) or not composed.endswith(suffix):
        raise RuntimeError("composed prompt does not wrap the template as expected")
    return composed[len(prefix) : len(composed) - len(suffix)]


if __name__ == "__main__":
    main()
