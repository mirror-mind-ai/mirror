[< Story](index.md)

# Plan — CV9.E2.S19 Eval Run Persistence & Trend

## The gap

`evals/runner.py`: `run_eval()` builds an `EvalReport`; `print_report()` renders
it to stdout; `main()` returns an exit code. Nothing is written anywhere. Five
eval modules, ~31 probes, zero history.

## Design

### Per-eval declarations (new, minimal — parallels the existing `THRESHOLD`)

```python
# evals/extraction.py
from memory.config import EXTRACTION_MODEL
from memory.intelligence.prompts import EXTRACTION_PROMPT, TASK_EXTRACTION_PROMPT, CURATION_PROMPT

EVAL_MODEL = EXTRACTION_MODEL
EVAL_PROMPTS = (EXTRACTION_PROMPT, TASK_EXTRACTION_PROMPT, CURATION_PROMPT)
```

Grounded per module:

| Eval | `EVAL_MODEL` | `EVAL_PROMPTS` |
|------|-------------|----------------|
| `extraction.py` | `EXTRACTION_MODEL` | `EXTRACTION_PROMPT`, `TASK_EXTRACTION_PROMPT`, `CURATION_PROMPT` (the `two-pass-dedup` probe exercises curation) |
| `proportionality.py` | `EXTRACTION_MODEL` | `EXTRACTION_PROMPT` |
| `reception.py` | `EXTRACTION_MODEL` (reception pins the same model, shorter timeout) | `RECEPTION_PROMPT` |
| `routing.py` | `None` | `()` — docstring already says "no LLM calls" |
| `retrieval.py` | `None` | `()` — pure `hybrid_score`/`reinforcement_score` math |

The runner reads these via `getattr(module, "EVAL_MODEL", None)` /
`getattr(module, "EVAL_PROMPTS", ())` — a module that declares neither still
runs (backward compatible), just with `model=None, prompt_hash=None` recorded.

### Record shape

```python
@dataclass
class EvalRunRecord:
    schema_version: int = 1
    eval_name: str
    started_at: str   # ISO
    ended_at: str     # ISO — the S18-recoverable cost window
    model: str | None
    prompt_hash: str | None   # sha256(b"".join(EVAL_PROMPTS.encode()))[:12], or None
    score: float
    threshold: float
    passed: bool
    probes: list[dict]  # [{"id":..., "passed":..., "notes":...}, ...]
```

`prompt_hash` is `None` (not a hash of empty bytes) when `EVAL_PROMPTS == ()` —
"no prompt dependency" must be a distinguishable state from "hash unchanged."

### Persistence (`evals/persistence.py`, new)

- `history_path(eval_name) -> Path`: resolve `resolve_mirror_home()`; if it
  returns a home, `<home>/eval-history/<eval_name>.jsonl` (mkdir as needed); if
  `None`, fall back to `evals/.history/<eval_name>.jsonl` (add `.history/` to
  `.gitignore`).
- `append_run(record) -> None`: one `json.dumps(asdict(record)) + "\n"`,
  file opened in append mode — atomic at the OS level for a single `write()`.
  Wrapped in `try/except`, logs a warning on failure, **never raises** (fail-soft
  — QA's bar).
- `read_history(eval_name, limit=10) -> list[EvalRunRecord]`: read lines
  most-recent-first; `json.loads` per line in a `try/except` that **skips**
  malformed lines rather than aborting the read.

### Runner integration

`run_eval()` gains `started_at`/`ended_at` around the probe loop, reads
`EVAL_MODEL`/`EVAL_PROMPTS`, computes `prompt_hash`, builds the `EvalRunRecord`,
and calls `append_run()` — after building the `EvalReport` so persistence
failure can never affect the report/exit code returned to `main()`.

### `--history` reader

`main()` gains `--history [N]` (default 10). Renders each run's timestamp,
score/threshold, pass/fail — and **diffs consecutive per-probe results**: any
probe whose `passed` differs from the prior run is flagged explicitly (ai-eng's
"don't hide a flipped probe inside a stable aggregate").

## Guardrails

- Never let a persistence failure change the eval's report or exit code.
- Never assert two runs produce the same score (probes are live-LLM
  non-deterministic by design) — only ever assert *what was recorded*.
- Empty `EVAL_PROMPTS` → `prompt_hash=None`, rendered distinctly from "unchanged
  hash" in `--history`.
- No `memory.db` change; no retention/pruning logic (out of scope, per D1).

## Sequence

1. `evals/persistence.py` + tests (path resolution + fallback, atomic append,
   malformed-line-tolerant read, fail-soft on write error) — all mocked/tmp_path,
   no live LLM.
2. `EVAL_MODEL`/`EVAL_PROMPTS` on all five eval modules.
3. Wire `run_eval()` to build + persist the record (extend `test_runner.py`'s
   existing mocked-probe pattern).
4. `--history` flag + per-probe-flip rendering + tests.
5. Full verification; docs; status.
