"""MEMORY_LOG_LLM_CALLS three-mode resolution (AI-09 / CV9.E2.S13).

The mode is resolved at config import time, so each case runs in a subprocess
with a clean import to avoid module-cache bleed between env values.
"""

import os
import subprocess
import sys

import pytest

pytestmark = pytest.mark.unit

_SNIPPET = (
    "import memory.config as c; "
    "print(c.LOG_LLM_CALLS_MODE); print(c.LOG_LLM_CALLS); print(c.LOG_LLM_BODIES)"
)


def _resolve(raw: str | None) -> tuple[str, str, str]:
    """Return (mode, LOG_LLM_CALLS, LOG_LLM_BODIES) as printed by a fresh import."""
    env = {k: v for k, v in os.environ.items() if k != "MEMORY_LOG_LLM_CALLS"}
    if raw is not None:
        env["MEMORY_LOG_LLM_CALLS"] = raw
    result = subprocess.run(
        [sys.executable, "-c", _SNIPPET],
        env=env,
        capture_output=True,
        text=True,
        check=True,
    )
    mode, calls, bodies = result.stdout.strip().splitlines()
    return mode, calls, bodies


class TestLogModeResolution:
    def test_unset_defaults_to_metadata(self):
        mode, calls, bodies = _resolve(None)
        assert mode == "metadata"
        assert calls == "True"
        assert bodies == "False"

    def test_empty_string_defaults_to_metadata(self):
        assert _resolve("") == ("metadata", "True", "False")

    def test_explicit_metadata(self):
        assert _resolve("metadata") == ("metadata", "True", "False")

    def test_legacy_one_maps_to_full(self):
        # Back-compat: "1" kept its historical "log bodies" meaning.
        assert _resolve("1") == ("full", "True", "True")

    def test_full_enables_bodies(self):
        assert _resolve("full") == ("full", "True", "True")

    def test_zero_disables(self):
        assert _resolve("0") == ("off", "False", "False")

    def test_off_disables(self):
        assert _resolve("off") == ("off", "False", "False")

    def test_unrecognized_value_disables(self):
        assert _resolve("banana") == ("off", "False", "False")
