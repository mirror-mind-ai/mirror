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

**Why a failure is a MODE of this driver.** `load` is where a provider outage
meets a session start, and Python's answer is not "stop": the search degrades to
FTS-only and the lifecycle continues, writing the mode row and switching the
conversation exactly as a healthy run does. Reproducing that needs the seam to
fail the way `generate_embedding` fails -- log the unpriced ledger row, then
raise `EmbeddingError` -- because a fake that merely returns nothing would grade
a path neither engine has.

Usage (invoked by `generate_builder_load_golden.py`):

    python build_load_oracle.py <slug> <fixture.json> [--session-id ID]
                                [--fail-embedding] [--fail-embedding-calls 1,2]
                                [--now ISO] [--ignore-clone-role]

`--now` overrides the fixture's frozen clock, so the write-parity harness can run
this driver under ITS frozen now and compare rows with the TypeScript side.
`--ignore-clone-role` skips the production-clone guard, whose real inputs are a
git root and a marker file on the machine — properties of the environment rather
than of the command, graded separately in the corpus.

`--fail-embedding-calls` names WHICH round-trips fail, one-based. `load` embeds
twice and both engines catch per search, so `2` is the rate limit that arrives
mid-command and `1` is the transient failure that recovers -- two different
surfaces, and the only shapes that prove degradation is reported per command
rather than per first search.
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


def _freeze_generators(fixture: dict[str, Any]) -> None:
    """Freeze the clock and the id source, in the SUBPROCESS where they are read.

    The other generators freeze `models._now` in their own process; this one
    cannot, because the command under test runs in a child. Both are frozen here so
    the recorded `runtime_sessions` and `llm_calls` rows are graded as values rather
    than normalized away -- `_uuid` is 8 hex characters and appears in conversation
    ids, which the corpus then compares exactly.
    """
    from memory import models

    models._now = lambda: fixture["now"]
    counter = iter(range(1, 1000))
    models._uuid = lambda: f"{next(counter):08x}"


def _forbid_network() -> None:
    """Make a live call IMPOSSIBLE, not merely unlikely.

    The first version of this driver patched two modules and missed the one that
    matters: `intelligence/search.py` imports `generate_embedding` by name, so the
    searches went to the real provider. A repository `.env` supplies a key, so the
    generator quietly made live embedding calls and wrote their token counts into
    the corpus -- a golden that depended on the network and on someone's balance.

    Patching more call sites fixes today's defect; this fixes the CLASS. Any socket
    the oracle opens raises, so a future import site added upstream fails the
    generator instead of spending money on it.
    """
    import socket

    class _RefusedSocket(socket.socket):
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            raise RuntimeError(
                "the load oracle attempted a network call: a provider entry point "
                "is unpatched. Patch it in `_install_seam` rather than relaxing "
                "this guard -- the corpus must never depend on a live model."
            )

    socket.socket = _RefusedSocket  # type: ignore[misc]


def _install_seam(
    fixture: dict[str, Any], *, failing_calls: frozenset[int] | None = None
) -> None:
    """Replace every provider entry point with the fixture's fixed answers."""
    from memory.intelligence.embeddings import EmbeddingError
    from memory.intelligence.llm_router import LLMResponse

    vector = np.array(fixture["embedding"], dtype=np.float32)
    embedding_model = fixture["embedding_model"]
    calls = {"count": 0}

    def fake_generate_embedding(
        text: str, on_llm_call: Any = None, **kwargs: Any
    ) -> np.ndarray:
        calls["count"] += 1
        # The ledger row IS behavior: `build load` writes two of them, and the
        # panel asked for that count to be graded. So the logger is invoked, with
        # the token count the TypeScript replay provider reports -- `null` -- so
        # the two ledgers agree rather than one inventing a price.
        if on_llm_call is not None:
            on_llm_call(
                LLMResponse(
                    model=embedding_model,
                    content="",
                    prompt=text,
                    prompt_tokens=None,
                    completion_tokens=None,
                    latency_ms=None,
                )
            )
        if failing_calls is not None and (
            not failing_calls or calls["count"] in failing_calls
        ):
            # `generate_embedding`'s provider-exception path, reproduced rather
            # than approximated: the round-trip IS logged (unpriced, because a
            # failed call has no usage) and THEN the error is raised. A seam that
            # raised without logging would record an empty ledger, and the port
            # would look correct while under-counting real, billable spend --
            # which is the one thing the ledger exists to prevent.
            raise EmbeddingError("Embedding provider call failed: parity outage")
        return vector

    # Patched per MODULE, because each imported the name directly. `search` is the
    # one `load` actually reaches; the others are here so no path can escape.
    import memory.intelligence.search as search_module
    import memory.services.attachment as attachment_module
    import memory.services.conversation as conversation_module
    import memory.services.memory as memory_module

    search_module.generate_embedding = fake_generate_embedding
    memory_module.generate_embedding = fake_generate_embedding
    conversation_module.generate_embedding = fake_generate_embedding
    attachment_module.generate_embedding = fake_generate_embedding

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
    if "--now" in sys.argv:
        fixture["now"] = sys.argv[sys.argv.index("--now") + 1]
    _freeze_generators(fixture)
    # `None` is a healthy seam; an EMPTY set fails every call. The distinction is
    # deliberate -- "no failing calls named" and "no failures" are different
    # instructions, and collapsing them is how a degraded case silently runs
    # healthy.
    failing_calls: frozenset[int] | None = None
    if "--fail-embedding-calls" in sys.argv:
        named = sys.argv[sys.argv.index("--fail-embedding-calls") + 1]
        failing_calls = frozenset(int(part) for part in named.split(",") if part)
    elif "--fail-embedding" in sys.argv:
        failing_calls = frozenset()
    _install_seam(fixture, failing_calls=failing_calls)
    _forbid_network()

    from memory.cli.build import cmd_load

    cmd_load(
        slug,
        session_id=session_id,
        ignore_production_role="--ignore-clone-role" in sys.argv,
    )


if __name__ == "__main__":
    main()
