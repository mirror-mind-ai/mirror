"""Oracle-drift tripwire for the CV22 TypeScript port (CR044).

The TypeScript core ports specific Python "oracle" modules (search ranking,
extraction, embeddings, consult/cost, model routing, identity/memory writes,
and the DB schema-custody surface). When those Python oracles change on ``main``
without a matching TypeScript reconciliation, parity silently rots -- CI does
not otherwise catch it, because the golden gate only re-derives read-only
goldens and the DS5 replay fixtures are static.

This module records a committed baseline of each oracle's git blob SHA and
fails loudly when the working tree no longer matches it. Advancing the baseline
is the *conscious* act: it is regenerated (``--update``) and committed in the
same change that reconciles the port or consciously defers it via a Change
Request.

``git hash-object`` is used deliberately (not a raw byte hash): it applies the
repo's ``.gitattributes`` ``eol=lf`` normalization, so the SHA is deterministic
across ubuntu/macOS/Windows checkouts and equals the committed blob.

Green here means *no ported Python oracle changed since the baseline*. It does
**not** prove the TypeScript port is in behavioral parity -- that is what the
DS5->DS6 reconciliation (RS007) and its evals are for.
"""

from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from pathlib import Path

# Ported Python oracles whose behavior the TypeScript core mirrors. The list is
# the reviewable source of truth for *what* is guarded (mirrors the
# ``KNOWN_MIGRATION_IDS`` snapshot idiom); the manifest is the generated
# snapshot of *what content* each had at the baseline.
ORACLE_PATHS: tuple[str, ...] = (
    # DS5 external-API / AI-in-the-loop surfaces
    "src/memory/intelligence/search.py",
    "src/memory/intelligence/extraction.py",
    "src/memory/intelligence/embeddings.py",
    "src/memory/intelligence/cost.py",
    "src/memory/intelligence/llm_router.py",
    "src/memory/intelligence/prompts.py",
    "src/memory/cli/consult.py",
    # DS4 deterministic-write surfaces
    "src/memory/services/identity.py",
    "src/memory/storage/memories.py",
    "src/memory/models.py",
    # DS7.US1 carried rider: kebab_slug/strip_accents (ts/src/util/slug.ts)
    "src/memory/utils.py",
    # DS6 schema-custody surface (closes the migration-body hole the
    # KNOWN_MIGRATION_IDS id-list contract cannot see)
    "src/memory/db/connection.py",
    "src/memory/db/migrations.py",
    "src/memory/storage/store.py",
    # DS7.US2 content & planning writes: the tasks tree (add/list/done/doing/
    # block/delete ported; import/sync/sync-config pending in slice 3c) and the
    # shared journey-path markdown parser. journal/week plan/save are NOT
    # ported (LLM/embedding-gated, reassigned to US5) despite living in
    # services/tasks.py and cli/tasks_cmd.py -- tracked at file granularity like
    # every other entry here.
    "src/memory/cli/tasks.py",
    "src/memory/cli/tasks_cmd.py",
    "src/memory/storage/tasks.py",
    "src/memory/services/tasks.py",
    # DS7.US2 slice 3b: week view (cmd_view's non-printing logic + rendering).
    # `cmd_plan`/`cmd_save` in the same file are LLM-gated and reassigned to
    # US5, tracked here anyway at file granularity like every other entry.
    "src/memory/cli/week.py",
    # DS7.US2 slice 3c: get_sync_file/set_sync_file/get_journey_path (tasks
    # import/sync's journey-metadata subsystem). This file has much broader
    # journey-service surface not yet ported; tracked at file granularity like
    # every other entry, so drift anywhere in it is at least visible.
    "src/memory/services/journey.py",
    # DS7.US3 memory cultivation: consolidation persistence, cluster_memories,
    # and the deterministic apply/reject/list/show CLI surface. propose_*
    # (LLM orchestration, Slice B) is tracked here too at file granularity even
    # though scan/merge are not yet ported behind the replay gate.
    "src/memory/storage/consolidations.py",
    "src/memory/intelligence/consolidate.py",
    "src/memory/intelligence/shadow.py",
    "src/memory/cli/consolidate_cmd.py",
    "src/memory/cli/shadow_cmd.py",
)

BASELINE_RELPATH = "ts/parity/oracle-baseline.json"

GREEN_SEMANTICS = (
    "Green means no ported Python oracle changed since this baseline. It does "
    "NOT prove the TypeScript port is in behavioral parity -- reconcile the port "
    "(RS007) and prove parity separately."
)


@dataclass(frozen=True)
class DriftResult:
    """Outcome of comparing the recorded baseline to current oracle contents."""

    missing_files: tuple[str, ...] = ()
    uninitialized: tuple[str, ...] = ()
    stale_entries: tuple[str, ...] = ()
    drifted: tuple[tuple[str, str, str], ...] = ()  # (path, baseline_sha, current_sha)

    @property
    def ok(self) -> bool:
        return not (self.missing_files or self.uninitialized or self.stale_entries or self.drifted)


def compute_blob_shas(paths: tuple[str, ...] | list[str], repo_root: Path) -> dict[str, str]:
    """Return ``{path: git-blob-sha}`` for every path that exists on disk.

    Missing paths are intentionally omitted so the caller can report them as
    renamed/deleted rather than crash on ``git hash-object``.
    """
    existing = [p for p in paths if (repo_root / p).is_file()]
    if not existing:
        return {}
    completed = subprocess.run(
        ["git", "hash-object", *existing],
        cwd=repo_root,
        capture_output=True,
        text=True,
        check=True,
    )
    shas = completed.stdout.split()
    return dict(zip(existing, shas, strict=True))


def evaluate(
    baseline: dict[str, str],
    current: dict[str, str],
    oracle_paths: tuple[str, ...] | list[str] = ORACLE_PATHS,
) -> DriftResult:
    """Pure comparison of a recorded baseline against current oracle SHAs."""
    missing_files: list[str] = []
    uninitialized: list[str] = []
    drifted: list[tuple[str, str, str]] = []
    for path in oracle_paths:
        if path not in current:
            missing_files.append(path)
        elif path not in baseline:
            uninitialized.append(path)
        elif baseline[path] != current[path]:
            drifted.append((path, baseline[path], current[path]))
    known = set(oracle_paths)
    stale_entries = [path for path in baseline if path not in known]
    return DriftResult(
        missing_files=tuple(missing_files),
        uninitialized=tuple(uninitialized),
        stale_entries=tuple(stale_entries),
        drifted=tuple(drifted),
    )


def load_baseline(repo_root: Path) -> dict[str, str]:
    document = json.loads((repo_root / BASELINE_RELPATH).read_text(encoding="utf-8"))
    return dict(document["oracles"])


def build_baseline_document(
    repo_root: Path, oracle_paths: tuple[str, ...] = ORACLE_PATHS
) -> dict[str, object]:
    shas = compute_blob_shas(oracle_paths, repo_root)
    oracles = {path: shas[path] for path in oracle_paths if path in shas}
    return {"_semantics": GREEN_SEMANTICS, "oracles": oracles}


def write_baseline(repo_root: Path, oracle_paths: tuple[str, ...] = ORACLE_PATHS) -> Path:
    document = build_baseline_document(repo_root, oracle_paths)
    path = repo_root / BASELINE_RELPATH
    path.write_text(json.dumps(document, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return path


def check(repo_root: Path, oracle_paths: tuple[str, ...] = ORACLE_PATHS) -> DriftResult:
    baseline = load_baseline(repo_root)
    current = compute_blob_shas(oracle_paths, repo_root)
    return evaluate(baseline, current, oracle_paths)
