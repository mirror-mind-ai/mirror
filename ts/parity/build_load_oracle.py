"""Run Python's real `cmd_load` in a subprocess under a deterministic seam.

CV22.DS7.US8 plateau 7. `build load` is the only leaf in this story that calls a
provider, so its oracle cannot be captured the way the other twenty-six were.

**Why a driver and not `python -m memory build load`.** The command golden runs the
real CLI per case precisely because `memory.config` resolves `DB_PATH` once at
import. That still holds here -- this IS a subprocess, so print semantics, the
stream split, and the exit code are graded as a shell sees them. What it adds is a
patched provider seam, which cannot be installed from the parent process. The
argparse layer is bypassed and that is recorded rather than hidden: argparse text
is CPython's, version-dependent, and belongs to plateau 8's structural refusal
matrix (the lesson `--decision maybe` and `--intent maybe` already taught).

**Why patch rather than replay.** Python has no replay transport; TypeScript does.
Parity therefore requires that both sides see the SAME vector, so the fixture file
is the contract: this driver returns the vector the fixture carries, and the
TypeScript side loads the identical file through its replay embedding provider.
One fixture, two engines, no network on either side.

Usage (invoked by `generate_builder_load_golden.py`):

    python build_load_oracle.py <slug> <fixture.json> [--session-id ID]
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import numpy as np


class _EmbeddingResponse:
    """What `send_to_model` returns for the close tail's model calls."""

    def __init__(self, content: str) -> None:
        self.content = content
        self.model = "fixture-model"
        self.prompt = ""
        self.prompt_tokens = 11
        self.completion_tokens = 7
        self.latency_ms = 3


def _install_seam(fixture: dict[str, Any]) -> None:
    """Replace every provider entry point with the fixture's fixed answers."""
    vector = np.array(fixture["embedding"], dtype=np.float32)

    def fake_generate_embedding(text: str, **kwargs: Any) -> np.ndarray:
        # The `on_llm_call` logger is deliberately NOT invoked: a replayed call
        # cost nothing, and pricing it would put fiction in `llm_calls`. The
        # TypeScript replay provider reports `promptTokens: null` for the same
        # reason, so the two ledgers agree on silence.
        return vector

    # Patched per MODULE, because each imported the name directly.
    import memory.services.conversation as conversation_module
    import memory.services.memory as memory_module

    memory_module.generate_embedding = fake_generate_embedding
    conversation_module.generate_embedding = fake_generate_embedding

    responses: dict[str, str] = fixture.get("llm", {})

    def fake_send_to_model(model: str, messages: list[dict[str, str]], **kwargs: Any):
        prompt = messages[0]["content"] if messages else ""
        for marker, reply in responses.items():
            if marker in prompt:
                return _EmbeddingResponse(reply)
        return _EmbeddingResponse(responses.get("default", "[]"))

    try:
        import memory.services.extraction as extraction_module

        extraction_module.send_to_model = fake_send_to_model
    except ImportError:  # pragma: no cover - the close tail is optional per case
        pass


def main() -> None:
    slug = sys.argv[1]
    fixture_path = Path(sys.argv[2])
    session_id: str | None = None
    if "--session-id" in sys.argv:
        session_id = sys.argv[sys.argv.index("--session-id") + 1]

    fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
    _install_seam(fixture)

    from memory.cli.build import cmd_load

    cmd_load(slug, session_id=session_id)


if __name__ == "__main__":
    main()
