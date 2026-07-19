"""CV9.E2.S12 (AI-06) — model-pin reachability probe and env overrides.

A pinned model that no longer resolves on OpenRouter must surface in
`runtime diagnose` (not fail silently), and the pins must be env-overridable so a
deployed 1.0 can be repointed without a release.
"""

import os
import subprocess
import sys

from memory.config import EXTRACTION_MODEL


class TestProbeModelPins:
    def test_absent_extraction_pin_warns_with_override_remedy(self, mocker):
        mocker.patch("memory.cli.runtime.list_available_models", return_value={"some/chat-model"})
        from memory.cli.runtime import probe_model_pins

        findings = probe_model_pins()

        assert len(findings) == 1
        assert findings[0].code == "model_pin_unresolved"
        assert findings[0].severity == "attention"
        assert "MEMORY_EXTRACTION_MODEL" in findings[0].recommendation

    def test_resolved_extraction_pin_yields_no_findings(self, mocker):
        mocker.patch(
            "memory.cli.runtime.list_available_models",
            return_value={EXTRACTION_MODEL, "extra/model"},
        )
        from memory.cli.runtime import probe_model_pins

        assert probe_model_pins() == ()

    def test_embedding_pin_absent_from_catalog_does_not_warn(self, mocker):
        # OpenRouter /models lists completion models only; the embedding pin is
        # legitimately absent and must not be flagged (regression: S12 validation).
        mocker.patch(
            "memory.cli.runtime.list_available_models",
            return_value={EXTRACTION_MODEL},
        )
        from memory.cli.runtime import probe_model_pins

        assert probe_model_pins() == ()

    def test_fetch_failure_is_inconclusive(self, mocker):
        mocker.patch(
            "memory.cli.runtime.list_available_models",
            side_effect=RuntimeError("offline / no key"),
        )
        from memory.cli.runtime import probe_model_pins

        assert probe_model_pins() == ()


def test_model_pins_are_env_overridable():
    """Config reads the pins from env, verified in a subprocess for a clean import."""
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            "import memory.config as c; print(c.EXTRACTION_MODEL); print(c.EMBEDDING_MODEL)",
        ],
        env={
            **os.environ,
            "MEMORY_EXTRACTION_MODEL": "vendor/custom-extract",
            "MEMORY_EMBEDDING_MODEL": "vendor/custom-embed",
        },
        capture_output=True,
        text=True,
        check=True,
    )

    assert "vendor/custom-extract" in result.stdout
    assert "vendor/custom-embed" in result.stdout
