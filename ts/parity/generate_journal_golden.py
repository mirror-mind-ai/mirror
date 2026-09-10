"""Generate the committed `journal` golden (CV22.DS7.US11 plateau 3).

Drives the REAL `memory.cli.journal.main` oracle with the LLM classification
and the embedding stubbed, recording what the TypeScript port must reproduce:
the printed receipt, the `memories` row, and the `llm_calls` rows.

Hermetic by construction (CR065): `OPENROUTER_API_KEY` is popped BEFORE
`memory` is imported, so any path this generator forgets to stub raises exactly
as it would in CI instead of silently succeeding against a live provider on a
developer machine. No real journal text appears here -- every entry is
synthetic (security review, US11 Plan).

Branches exercised:
  - a well-formed classification (title/layer/tags all supplied by the model);
  - a model layer OUTSIDE VALID_MEMORY_LAYERS -> AI-24 coercion to 'ego';
  - each valid layer, so the receipt's label map is covered;
  - a NON-JSON response -> the fallback {title: content[:60], layer: 'ego',
    tags: []}, with a non-BMP entry proving the 60 is code points;
  - tags returned as a non-list;
  - `--journey` present and absent (the receipt gains a line);
  - empty / whitespace-only content -> refused before any model call;
  - EMBEDDING FAILURE -> `add_memory` embeds BEFORE it inserts, so the memory
    row must NOT exist while the classification `llm_calls` row already does.
    A naive insert-then-embed port passes every other case and fails this one
    (database-architect, US11 Plan review).

Run:  uv run python ts/parity/generate_journal_golden.py
"""

from __future__ import annotations

import contextlib
import io
import json
import os
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT_PATH = HERE.parent / "test" / "goldens" / "journal.golden.json"

SYNTHETIC_ENTRIES = {
    "plain": "Decidi encerrar o experimento e escrever o que aprendi.",
    "non_bmp": "\U0001f30d primeiro dia fora \u2014 caf\u00e9 \u2615 e uma ideia comprida o bastante para passar do corte",
    "short": "Uma nota curta.",
}


class _StubResponse:
    """The shape `send_to_model` returns, minus anything the golden reads."""

    def __init__(self, content: str) -> None:
        self.content = content
        self.model = "stub/model"
        self.generation_id = None
        self.prompt_tokens = 11
        self.completion_tokens = 7
        self.latency_ms = 3
        self.cost_usd = None


def _run_case(
    tmp: Path,
    argv: list[str],
    llm_content: str | None,
    embedding_fails: bool,
) -> dict:
    from memory.client import MemoryClient
    from memory.config import EMBEDDING_DIMENSIONS
    from memory.intelligence import embeddings as embeddings_module
    from memory.intelligence import extraction as extraction_module

    home = tmp / "home"
    db_path = home / "memory.db"
    os.environ["DB_PATH"] = str(db_path)

    # Stub the classification model call. `classify_journal_entry` calls
    # `send_to_model` in the extraction module's namespace.
    def fake_send_to_model(model, messages, **kwargs):  # noqa: ANN001, ANN003
        if llm_content is None:
            raise AssertionError("model called for a case that must refuse before the call")
        return _StubResponse(llm_content)

    extraction_module.send_to_model = fake_send_to_model

    # Stub the embedding CLIENT, not `generate_embedding`, so the real
    # function runs: it is what invokes `_log_embedding_call`, which writes the
    # `embedding` row in `llm_calls`. Stubbing one level higher would have
    # produced a corpus recording ONE ledger row where Python writes two, and
    # the port would have been graded against that wrong number.
    embeddings_module.OPENROUTER_API_KEY = "stub-key-not-used"

    class _FakeEmbeddingData:
        def __init__(self) -> None:
            self.embedding = [0.0] * EMBEDDING_DIMENSIONS

    class _FakeUsage:
        prompt_tokens = 5

    class _FakeEmbeddingResponse:
        def __init__(self) -> None:
            self.data = [_FakeEmbeddingData()]
            self.usage = _FakeUsage()
            self.model = "stub/embedding"

    class _FakeEmbeddings:
        def create(self, input: str, model: str):  # noqa: A002, ANN201
            if embedding_fails:
                raise RuntimeError("embedding provider unavailable")
            return _FakeEmbeddingResponse()

    class _FakeClient:
        embeddings = _FakeEmbeddings()

    embeddings_module.get_embedding_client = lambda: _FakeClient()

    from memory.cli import journal as journal_cli

    out, err = io.StringIO(), io.StringIO()
    exit_code = 0
    raised: str | None = None
    try:
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            try:
                journal_cli.main(argv + ["--mirror-home", str(home)])
            except SystemExit as exc:
                exit_code = int(exc.code or 0)
    except Exception as exc:  # the embedding-failure case propagates
        raised = type(exc).__name__

    mem = MemoryClient(env="test", db_path=db_path)
    memories = [
        dict(row)
        for row in mem.store.conn.execute(
            "SELECT memory_type, layer, title, content, journey, tags, "
            "(embedding IS NOT NULL) AS has_embedding "
            "FROM memories ORDER BY created_at ASC"
        ).fetchall()
    ]
    llm_calls = [
        dict(row)
        for row in mem.store.conn.execute(
            "SELECT role, model, (prompt_tokens IS NULL) AS unpriced "
            "FROM llm_calls ORDER BY called_at ASC"
        ).fetchall()
    ]

    # The receipt prints the memory's 8-char id prefix; alias it in print order
    # so the corpus is reproducible, and record its shape separately so the
    # alias cannot hide a wrong id format (the plateau-1 lesson).
    stdout = out.getvalue()
    import re

    printed = re.findall(r"ID: ([0-9a-f]+)", stdout)
    id_shapes = [{"length": len(v), "hex": bool(re.fullmatch(r"[0-9a-f]+", v))} for v in printed]
    for index, raw in enumerate(printed, start=1):
        stdout = stdout.replace(f"ID: {raw}", f"ID: <memory-{index}>")

    return {
        "stdout": stdout,
        "stderr": err.getvalue(),
        "exit": exit_code,
        "raised": raised,
        "memories": memories,
        "llm_calls": llm_calls,
        "id_shapes": id_shapes,
    }


CASES: tuple[tuple[str, list[str], str | None, bool], ...] = (
    (
        "well-formed classification",
        [SYNTHETIC_ENTRIES["plain"]],
        json.dumps(
            {
                "title": "Encerramento do experimento",
                "layer": "ego",
                "tags": ["decision", "learning"],
            }
        ),
        False,
    ),
    (
        "layer self",
        [SYNTHETIC_ENTRIES["short"]],
        json.dumps({"title": "Nota", "layer": "self", "tags": ["identity"]}),
        False,
    ),
    (
        "layer shadow",
        [SYNTHETIC_ENTRIES["short"]],
        json.dumps({"title": "Tensao", "layer": "shadow", "tags": []}),
        False,
    ),
    (
        "AI-24: invalid layer coerced to ego",
        [SYNTHETIC_ENTRIES["short"]],
        json.dumps({"title": "Coercao", "layer": "superego", "tags": ["x"]}),
        False,
    ),
    (
        "non-JSON response falls back, title cut at 60 code points",
        [SYNTHETIC_ENTRIES["non_bmp"]],
        "I am not JSON at all.",
        False,
    ),
    (
        "tags returned as a non-list",
        [SYNTHETIC_ENTRIES["short"]],
        json.dumps({"title": "Tags estranhas", "layer": "ego", "tags": "not-a-list"}),
        False,
    ),
    (
        "with --journey",
        [SYNTHETIC_ENTRIES["plain"], "--journey", "mirror-ts-core"],
        json.dumps({"title": "Com jornada", "layer": "ego", "tags": ["port"]}),
        False,
    ),
    (
        "multi-word content is joined with single spaces",
        ["duas", "palavras", "aqui"],
        json.dumps({"title": "Juncao", "layer": "ego", "tags": []}),
        False,
    ),
    ("empty content refused before any model call", [""], None, False),
    ("whitespace-only content refused before any model call", ["   "], None, False),
    (
        "embedding failure: classified, but NOTHING is written",
        [SYNTHETIC_ENTRIES["plain"]],
        json.dumps({"title": "Nao deve persistir", "layer": "ego", "tags": []}),
        True,
    ),
)


def main() -> None:
    for key in ("MEMORY_DIR", "MEMORY_PROD_DIR", "MEMORY_ENV", "OPENROUTER_API_KEY"):
        os.environ.pop(key, None)
    os.environ["MEMORY_RECEPTION"] = "0"

    cases = []
    for label, argv, llm_content, embedding_fails in CASES:
        with tempfile.TemporaryDirectory() as tmp:
            result = _run_case(Path(tmp), list(argv), llm_content, embedding_fails)
        cases.append(
            {
                "label": label,
                "argv": argv,
                "llm_response": llm_content,
                "embedding_fails": embedding_fails,
                **result,
            }
        )

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(
        json.dumps({"cases": cases}, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    for case in cases:
        wrote = len(case["memories"])
        print(
            f"  {case['label'][:52]:<52} exit={case['exit']} memories={wrote} llm={len(case['llm_calls'])}"
        )
    print(f"cases: {len(cases)}")
    print(f"wrote {OUT_PATH.relative_to(HERE.parent.parent)}")


if __name__ == "__main__":
    sys.exit(main())
