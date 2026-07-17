"""Eval runner: loads a named eval module, runs its probes, prints a report.

Usage:
    uv run python -m memory eval <name>

Each eval module must expose:
    PROBES: list[EvalProbe]
    THRESHOLD: float
"""

from __future__ import annotations

import hashlib
import importlib
import sys
from datetime import datetime, timezone

from evals.persistence import EvalRunRecord, append_run, read_history
from evals.types import EvalProbe, EvalReport, EvalResult

_PASS = "\033[32m✓\033[0m"
_FAIL = "\033[31m✗\033[0m"
_BOLD = "\033[1m"
_RESET = "\033[0m"


def run_eval(eval_name: str) -> EvalReport:
    """Load and run a named eval. Raises ValueError for unknown names."""
    module_path = f"evals.{eval_name}"
    try:
        module = importlib.import_module(module_path)
    except ModuleNotFoundError as exc:
        raise ValueError(f"Unknown eval '{eval_name}'. No module found at {module_path}.") from exc

    probes: list[EvalProbe] = getattr(module, "PROBES", None)
    threshold: float = getattr(module, "THRESHOLD", 0.8)
    eval_model: str | None = getattr(module, "EVAL_MODEL", None)
    eval_prompts: tuple[str, ...] = getattr(module, "EVAL_PROMPTS", ())

    if probes is None:
        raise ValueError(f"Eval module '{module_path}' must expose a PROBES list.")

    started_at = datetime.now(timezone.utc).isoformat()
    report = EvalReport(eval_name=eval_name, threshold=threshold)

    for probe in probes:
        try:
            passed, notes = probe.run()
        except Exception as exc:
            passed = False
            notes = f"probe raised: {exc}"
        report.results.append(EvalResult(probe_id=probe.id, passed=passed, notes=notes))

    ended_at = datetime.now(timezone.utc).isoformat()
    _persist_run(eval_name, report, started_at, ended_at, eval_model, eval_prompts)

    return report


def _persist_run(
    eval_name: str,
    report: EvalReport,
    started_at: str,
    ended_at: str,
    eval_model: str | None,
    eval_prompts: tuple[str, ...],
) -> None:
    """Build and persist one EvalRunRecord. Defense in depth: never raises,
    even if ``append_run``'s own fail-soft contract were ever violated — a
    persistence error must never surface as an eval failure (CV9.E2.S19).
    """
    prompt_hash = (
        hashlib.sha256("".join(eval_prompts).encode()).hexdigest()[:12] if eval_prompts else None
    )
    record = EvalRunRecord(
        eval_name=eval_name,
        started_at=started_at,
        ended_at=ended_at,
        model=eval_model,
        prompt_hash=prompt_hash,
        score=report.score,
        threshold=report.threshold,
        passed=report.passed,
        probes=[{"id": r.probe_id, "passed": r.passed, "notes": r.notes} for r in report.results],
    )
    try:
        append_run(record)
    except Exception:
        pass


def print_report(report: EvalReport) -> None:
    """Print a human-readable eval report to stdout."""
    width = 60
    print(
        f"\n{_BOLD}── {report.eval_name} eval {'─' * (width - len(report.eval_name) - 8)}{_RESET}"
    )

    id_width = max((len(r.probe_id) for r in report.results), default=10) + 2
    for result in report.results:
        icon = _PASS if result.passed else _FAIL
        pad = id_width - len(result.probe_id)
        print(f"  {icon}  {result.probe_id}{' ' * pad}{result.notes}")

    passes = sum(1 for r in report.results if r.passed)
    total = len(report.results)
    outcome = f"{_BOLD}✓ PASS{_RESET}" if report.passed else f"{_BOLD}\033[31m✗ FAIL\033[0m{_RESET}"
    print(f"\n  {passes}/{total} passed  (threshold: {report.threshold:.2f})  {outcome}\n")


def print_history(eval_name: str, limit: int = 10) -> None:
    """Print recent persisted runs for one eval, newest first.

    Surfaces any probe whose pass/fail flipped relative to the run
    immediately before it — a regression can hide inside an aggregate score
    that still clears threshold (CV9.E2.S19).
    """
    records = read_history(eval_name, limit=limit)
    if not records:
        print(f"\n(no persisted history for '{eval_name}' yet)\n")
        return

    print(f"\n{_BOLD}── {eval_name} history (most recent {len(records)}) {'─' * 20}{_RESET}\n")
    for i, rec in enumerate(records):
        outcome = _PASS if rec.passed else _FAIL
        print(
            f"  {outcome}  {rec.started_at}  score={rec.score:.2f}/{rec.threshold:.2f}"
            f"  model={rec.model or '—'}  prompt_hash={rec.prompt_hash or '—'}"
        )
        older = records[i + 1] if i + 1 < len(records) else None
        if older is not None:
            older_status = {p["id"]: p["passed"] for p in older.probes}
            for p in rec.probes:
                prior = older_status.get(p["id"])
                if prior is not None and prior != p["passed"]:
                    direction = "regressed" if prior and not p["passed"] else "recovered"
                    print(f"      ⚠ probe '{p['id']}' {direction} vs previous run")
    print()


def main(args: list[str] | None = None) -> int:
    """Entry point for `python -m memory eval <name> [--history [N]]`."""
    argv = args if args is not None else sys.argv[1:]
    if not argv:
        print("Usage: python -m memory eval <name> [--history [N]]", file=sys.stderr)
        return 1

    eval_name = argv[0]

    if "--history" in argv:
        idx = argv.index("--history")
        limit = 10
        if idx + 1 < len(argv) and argv[idx + 1].isdigit():
            limit = int(argv[idx + 1])
        print_history(eval_name, limit=limit)
        return 0

    try:
        report = run_eval(eval_name)
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    print_report(report)
    return 0 if report.passed else 1
