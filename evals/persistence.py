"""Durable eval run history (CV9.E2.S19 / AI-11).

Each ``eval <name>`` run is appended as one JSONL record under
``<mirror_home>/eval-history/<eval_name>.jsonl`` (or a gitignored repo-local
fallback when no mirror home is configured) so runs can be trended instead of
vanishing after stdout. Persistence is deliberately fail-soft: an eval's report
and exit code must never depend on whether the history write succeeded.
"""

from __future__ import annotations

import json
import logging
from dataclasses import asdict, dataclass, field
from pathlib import Path

from memory.config import resolve_mirror_home

logger = logging.getLogger(__name__)

# Repo-local fallback for a bare checkout with no configured mirror home.
# Eval history is non-deterministic run noise and must never be committed —
# see .gitignore.
_FALLBACK_DIR = Path(__file__).resolve().parent / ".history"


@dataclass
class EvalRunRecord:
    """One persisted eval run.

    ``model``/``prompt_hash`` are ``None`` for a genuinely prompt-free eval
    (e.g. keyword-based routing, pure scoring math) — a distinguishable state
    from "hash unchanged", not a fake/blank hash.
    """

    eval_name: str
    started_at: str
    ended_at: str
    model: str | None
    prompt_hash: str | None
    score: float
    threshold: float
    passed: bool
    probes: list[dict] = field(default_factory=list)
    schema_version: int = 1


def history_path(eval_name: str) -> Path:
    """Resolve the JSONL history file for one eval.

    Prefers ``<mirror_home>/eval-history/``; falls back to the gitignored
    repo-local ``evals/.history/`` when no mirror home is configured.
    """
    try:
        base = resolve_mirror_home() / "eval-history"
    except ValueError:
        base = _FALLBACK_DIR
    return base / f"{eval_name}.jsonl"


def append_run(record: EvalRunRecord) -> None:
    """Append one run to its eval's history file. Never raises.

    A persistence failure (unwritable path, disk issue) must never affect the
    eval's own report or exit code — the probe result is the point.
    """
    try:
        path = history_path(record.eval_name)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(asdict(record)) + "\n")
    except Exception:
        logger.warning("eval history append failed for %s", record.eval_name, exc_info=True)


def read_history(eval_name: str, limit: int = 10) -> list[EvalRunRecord]:
    """Return up to ``limit`` most-recent records, newest first.

    Tolerates a malformed trailing line (e.g. a crash mid-write) by skipping
    it rather than failing the whole read.
    """
    path = history_path(eval_name)
    if not path.exists():
        return []
    records: list[EvalRunRecord] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            records.append(EvalRunRecord(**json.loads(line)))
        except (json.JSONDecodeError, TypeError):
            continue
    return list(reversed(records))[:limit]
