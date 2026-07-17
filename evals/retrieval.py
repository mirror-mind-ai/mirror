"""Retrieval eval: reinforcement scoring behavioral contract (CV7.E4.S2).

Tests that honest reinforcement scoring behaves as designed. All probes are
deterministic — no LLM calls, no embedding API. They test the scoring math
directly and document the behavioral contract.

Run with:
    uv run python -m memory eval retrieval

Free to run — no API calls.
"""

from __future__ import annotations

from evals.types import EvalProbe
from memory.config import (
    REINFORCEMENT_DECAY_DAYS,
    REINFORCEMENT_RETRIEVAL_WEIGHT,
    REINFORCEMENT_USE_WEIGHT,
)
from memory.intelligence.search import hybrid_score, reinforcement_score

THRESHOLD = 1.0  # all probes must pass — these are deterministic math contracts
# CV9.E2.S19 (AI-11): pure scoring math, no LLM call (see module docstring) —
# genuinely prompt-free, not an omission.
EVAL_MODEL: str | None = None
EVAL_PROMPTS: tuple[str, ...] = ()


# ---------------------------------------------------------------------------
# Probe helpers
# ---------------------------------------------------------------------------


def _days_ago_iso(days: float) -> str:
    """Return an ISO timestamp for `days` ago in UTC."""
    from datetime import datetime, timedelta, timezone

    dt = datetime.now(timezone.utc) - timedelta(days=days)
    return dt.isoformat().replace("+00:00", "Z")


# ---------------------------------------------------------------------------
# Probes
# ---------------------------------------------------------------------------


def _probe_no_access_baseline() -> tuple[bool, str]:
    """Memory never retrieved or used has zero reinforcement."""
    score = reinforcement_score(access_count=0, use_count=0, last_accessed_at=None)
    passed = score == 0.0
    return passed, f"score={score:.4f} (expected 0.0)"


def _probe_recent_beats_stale() -> tuple[bool, str]:
    """Recently retrieved memory scores higher retrieval signal than a stale one."""
    recent = reinforcement_score(
        access_count=3,
        use_count=0,
        last_accessed_at=_days_ago_iso(1),
    )
    stale = reinforcement_score(
        access_count=3,
        use_count=0,
        last_accessed_at=_days_ago_iso(REINFORCEMENT_DECAY_DAYS * 5),
    )
    passed = recent > stale
    return passed, f"recent={recent:.4f} > stale={stale:.4f}"


def _probe_decay_halves_at_half_life() -> tuple[bool, str]:
    """Retrieval signal at half-life is ~50% of same memory accessed today."""
    fresh = reinforcement_score(
        access_count=5,
        use_count=0,
        last_accessed_at=_days_ago_iso(0),
    )
    half_life = reinforcement_score(
        access_count=5,
        use_count=0,
        last_accessed_at=_days_ago_iso(REINFORCEMENT_DECAY_DAYS),
    )
    ratio = half_life / fresh if fresh > 0 else 0.0
    # Expect ~0.5 ± 0.05 (small tolerance for floating point and "today" drift)
    passed = 0.45 <= ratio <= 0.55
    return passed, f"half-life ratio={ratio:.4f} (expected ~0.50)"


def _probe_use_beats_retrieval_only() -> tuple[bool, str]:
    """High use_count beats many retrievals with zero use, same access recency."""
    last = _days_ago_iso(10)
    high_use = reinforcement_score(access_count=1, use_count=10, last_accessed_at=last)
    many_retrievals = reinforcement_score(access_count=50, use_count=0, last_accessed_at=last)
    passed = high_use > many_retrievals
    return passed, f"high_use={high_use:.4f} > many_retrievals={many_retrievals:.4f}"


def _probe_use_weight_is_dominant() -> tuple[bool, str]:
    """Use signal contributes REINFORCEMENT_USE_WEIGHT fraction of max reinforcement."""
    max_use = reinforcement_score(access_count=0, use_count=100, last_accessed_at=None)
    # With access_count=0, retrieval_signal=0, so score = USE_WEIGHT * 1.0 = USE_WEIGHT
    expected = REINFORCEMENT_USE_WEIGHT * 1.0
    passed = abs(max_use - expected) < 1e-9
    return passed, f"max_use_score={max_use:.6f} expected={expected:.6f}"


def _probe_retrieval_weight_caps_at_retrieval_weight() -> tuple[bool, str]:
    """Pure retrieval signal at ceiling = REINFORCEMENT_RETRIEVAL_WEIGHT."""
    # Very high access count → retrieval_raw → 1.0; accessed today → decay ≈ 1.0
    max_retrieval = reinforcement_score(
        access_count=10_000,
        use_count=0,
        last_accessed_at=_days_ago_iso(0),
    )
    # Should be close to RETRIEVAL_WEIGHT * 1.0 (decay ≈ 1 for 0 days)
    passed = abs(max_retrieval - REINFORCEMENT_RETRIEVAL_WEIGHT) < 0.01
    return (
        passed,
        f"max_retrieval_score={max_retrieval:.6f} expected≈{REINFORCEMENT_RETRIEVAL_WEIGHT:.6f}",
    )


def _probe_hybrid_score_incorporates_reinforcement() -> tuple[bool, str]:
    """hybrid_score with higher reinforcement produces higher total score."""
    base = hybrid_score(semantic=0.6, recency=0.5, reinforcement=0.0, relevance=1.0)
    with_reinf = hybrid_score(semantic=0.6, recency=0.5, reinforcement=0.5, relevance=1.0)
    passed = with_reinf > base
    return passed, f"with_reinf={with_reinf:.4f} > base={base:.4f}"


def _probe_no_last_accessed_no_decay() -> tuple[bool, str]:
    """Memory with access_count=0 and no last_accessed_at has zero retrieval signal."""
    score = reinforcement_score(access_count=0, use_count=0, last_accessed_at=None)
    # retrieval_raw = log1p(0)/3 = 0, so no decay needed and result is 0
    passed = score == 0.0
    return passed, f"score={score:.4f} (expected 0.0)"


def _probe_readiness_default() -> tuple[bool, str]:
    """New Memory instances default to 'observed' readiness state."""
    from memory.models import Memory

    mem = Memory(
        memory_type="insight",
        layer="ego",
        title="t",
        content="c",
        created_at="2026-01-01T00:00:00Z",
    )
    passed = mem.readiness_state == "observed"
    return passed, f"readiness_state='{mem.readiness_state}' (expected 'observed')"


def _probe_use_count_default_zero() -> tuple[bool, str]:
    """New Memory instances default use_count to 0."""
    from memory.models import Memory

    mem = Memory(
        memory_type="insight",
        layer="ego",
        title="t",
        content="c",
        created_at="2026-01-01T00:00:00Z",
    )
    passed = mem.use_count == 0
    return passed, f"use_count={mem.use_count} (expected 0)"


# ---------------------------------------------------------------------------
# PROBES registry
# ---------------------------------------------------------------------------

PROBES: list[EvalProbe] = [
    EvalProbe(
        id="no-access-baseline",
        description="Memory never retrieved or used has zero reinforcement",
        run=_probe_no_access_baseline,
    ),
    EvalProbe(
        id="recent-beats-stale",
        description="Recently retrieved memory scores higher than stale with same access count",
        run=_probe_recent_beats_stale,
    ),
    EvalProbe(
        id="decay-halves-at-half-life",
        description="Retrieval signal is ~50% of fresh at REINFORCEMENT_DECAY_DAYS ago",
        run=_probe_decay_halves_at_half_life,
    ),
    EvalProbe(
        id="use-beats-retrieval-only",
        description="High use_count beats many retrievals with zero use at same recency",
        run=_probe_use_beats_retrieval_only,
    ),
    EvalProbe(
        id="use-weight-is-dominant",
        description="Use signal contributes REINFORCEMENT_USE_WEIGHT fraction of max score",
        run=_probe_use_weight_is_dominant,
    ),
    EvalProbe(
        id="retrieval-weight-caps",
        description="Pure retrieval signal ceiling equals REINFORCEMENT_RETRIEVAL_WEIGHT",
        run=_probe_retrieval_weight_caps_at_retrieval_weight,
    ),
    EvalProbe(
        id="hybrid-score-incorporates-reinforcement",
        description="hybrid_score correctly incorporates the reinforcement signal",
        run=_probe_hybrid_score_incorporates_reinforcement,
    ),
    EvalProbe(
        id="no-last-accessed-no-decay",
        description="Zero access_count with no last_accessed_at yields zero retrieval signal",
        run=_probe_no_last_accessed_no_decay,
    ),
    EvalProbe(
        id="readiness-default",
        description="New Memory defaults to 'observed' readiness_state",
        run=_probe_readiness_default,
    ),
    EvalProbe(
        id="use-count-default-zero",
        description="New Memory defaults use_count to 0",
        run=_probe_use_count_default_zero,
    ),
]
