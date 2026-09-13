"""Generate the Builder story-lifecycle golden (CV22.DS7.US8 plateau 3).

Scope C -- Pull, Expand, Prepare, Plan, Approve -- is the first plateau where a
Builder command WRITES INTO THE NAVIGATOR'S PROJECT. Plateaus 1 and 2 graded
strings and one database cell; this one grades files. So the corpus has three
graded faces per step, and all three are behavior:

**1. The cursor after every step, as an ORDERED SEQUENCE.** `builder-cursor`
already proves the primitive's bytes. What it cannot prove is that the lifecycle
CHOOSES the same next state: Pull resets child work items only when the active
item actually changed, bumps `cursor_generation` even on a re-pull, and preserves
release intent only inside the same Delivery Story; Plan writes
`refresh_projection=False` and then requests the refresh itself; approval
invalidates a pending receipt instead of dropping it. Two engines can agree on the
final row and disagree at every step between, so each step records the serialized
metadata the way Python wrote it.

**2. The FILES, byte for byte, project-relative.** `_write_story_package` and
Expand's child materialization are guarded by `if not path.exists()` -- the
preservation rule that keeps a Driver-authored `plan.md` from being replaced by
scaffold. A port that writes unconditionally passes every surface golden and
destroys authored work on first use. The snapshot after each step is the only
assertion that sees it.

**3. The folder the files landed in.** Expand resolves an authored package by its
heading CODE, never by arithmetic on code and title, and the candidate-table CODE
cell is Navigator- or LLM-authored content that may carry `/` or `..`. Both
appear below (`expand_resolves_by_heading_content`,
`expand_sanitizes_path_bearing_code`) because both are real defects this project
already paid for: CR048 recurred at CV22.DS7, and D-012 closed the traversal
shape.

Every scenario here is taken from `tests/unit/memory/builder/test_lifecycle.py`
(33 tests) and `test_story_plan_preauthorization.py` (11 tests), per the plan's
rule that the corpus reuses the Python suite's scenarios rather than inventing
new ones -- those tests encode measured behavior, and DS10 deletes them.

Paths are NOT redacted after the fact, and that decision was measured --
`builder_surface_paths.py` owns the rule and explains why a token substitution
cannot repair a path that a card row truncated or wrapped.

Every scenario runs under a REPO-RELATIVE project root
(`tmp/parity/builder-lifecycle/<scenario>/project`, gitignored), so what the Plan
checkpoint prints is identical on every machine by construction and is graded byte
for byte. `_assert_no_paths` still refuses to write an absolute path, so a renderer
that absolutizes one fails the generator instead of the next machine's CI. Each
sequence records its `project_root` so the TypeScript test can stage the same
directory.

Run:  uv run python ts/parity/generate_builder_lifecycle_golden.py
"""

from __future__ import annotations

import json
import shutil
import sqlite3
from dataclasses import replace
from pathlib import Path
from typing import Any

from memory.builder.ariad_method import get_ariad_method
from memory.builder.artifact_surfaces import (
    MaterializedArtifact,
    existing_artifact,
    materialized_artifact,
    render_artifacts_materialized_surface,
)
from memory.builder.delivery_cursor import (
    get_delivery_cursor,
    set_delivery_cursor,
)
from memory.builder.lifecycle import (
    BuilderLifecycleItem,
    ExpandBlockedError,
    approve_plan_checkpoint,
    expand_delivery_story,
    plan_lifecycle_item,
    prepare_lifecycle_item,
    pull_lifecycle_item,
    render_delivery_story_ready_report,
    render_expand_blocked,
    render_expand_report,
    render_plan_approval,
    render_plan_checkpoint,
    render_prepare_report,
    render_pull_report,
)
from memory.builder.plan_preauthorization import PlanPreauthorizationMismatch
from memory.builder.story_paths import (
    StoryPackageAmbiguityError,
    create_story_directory,
    resolve_story_directory,
)
from memory.builder.story_plan_preauthorization import (
    approve_story_plan_with_preauthorization,
    cancel_story_plan_preauthorization,
    render_story_implementation_started,
    render_story_plan_preauthorization_mismatch,
    render_story_plan_preauthorization_recorded,
    render_story_preauthorization_already_consumed,
)
from memory.db.schema import SCHEMA
from memory.storage.store import Store

import builder_surface_paths as surface_paths

HERE = Path(__file__).resolve().parent
OUT_PATH = HERE.parent / "test" / "goldens" / "builder-lifecycle.golden.json"

FROZEN_NOW = "2026-01-01T00:00:00+00:00"
JOURNEY = "sandbox-pet-store"
# Relative on purpose: see the module docstring. Resolved against the repository
# root, which is the generator's cwd and the TypeScript test's cwd.
PARITY_ROOT = Path("tmp") / "parity" / "builder-lifecycle"

# The four-column candidate table from test_lifecycle.py, reused verbatim so the
# corpus and the Python suite describe the same Delivery Story.
FOUR_COL_DS_INDEX = """# DS-35 — Application & Admin Parity

**Status:** 🟡 Planned

## Candidate Stories

| Code | Story | Type | Status |
|------|-------|------|--------|
| DS-35.US-1 | Port the application step flow | User Story | 🟡 Planned |
| DS-35.US-2 | Port the review step | User Story | 🟡 Planned |
| DS-35.TS-1 | Admin authentication parity | Technical Story | 🟡 Planned |

## Done Condition

Done when children deliver a coherent outcome.
"""

FIVE_COL_DS_INDEX = """# DS-35 — Application & Admin Parity

**Status:** 🟡 Planned

## Candidate Stories

| Code | Story | Type | Outcome | Status |
|------|-------|------|---------|--------|
| DS-35.US-1 | Port the application step flow | User Story | Observable flow | 🟡 Planned |
| DS-35.TS-1 | Admin authentication parity | Technical Story | Admin can log in | 🟡 Planned |

## Done Condition

Done.
"""

DONE_FIRST_DS_INDEX = """# DS-35 — Application & Admin Parity

**Status:** 🟡 Planned

## Candidate Stories

| Code | Story | Type | Status |
|------|-------|------|--------|
| DS-35.US-1 | Port the application step flow | User Story | ✅ Done |
| DS-35.US-2 | Port the review step | User Story | 🟡 Planned |

## Done Condition

Done.
"""

# `| Family | Scope | Type | Risk |` -- the real non-canonical header that made
# Expand fabricate a generic story at CV22.DS7 instead of refusing.
NON_CANONICAL_DS_INDEX = """# CV22.DS7 — Command Burn-Down

**Status:** 🟡 Planned

## Candidate Stories

| Family | Scope | Type | Risk |
|--------|-------|------|------|
| Command surface | Burn down legacy commands | Technical Story | High |

## Done Condition

Done.
"""

TRAVERSAL_DS_INDEX = """# DS-35 — Application & Admin Parity

**Status:** 🟡 Planned

## Candidate Stories

| Code | Story | Type | Status |
|------|-------|------|--------|
| ../../../etc/DS-35.US-1 | Port the application step flow | User Story | 🟡 Planned |

## Done Condition

Done.
"""

LONG_CHILD_DS_INDEX = """# DS-35 — Application & Admin Parity

**Status:** 🟡 Planned

## Candidate Stories

| Code | Story | Type | Status |
|------|-------|------|--------|
| DS-35.TS-1 | Port the entire application and administration surface including every step of the multi page flow, the review queue, and the authentication parity work that the legacy system performs today | Technical Story | 🟡 Planned |

## Done Condition

Done.
"""

COMPLETE_PLAN = """# Plan — CV20.DS16.US1

## Objective

Deliver exact story authority.

## Scope

- Bind one active story structurally.

## Non-Goals

- No sibling scope.

## Acceptance Behavior

Given exact authority
When approval is consumed
Then implementation starts once.

## Validation Route

- Run focused tests and Navigator validation.

## Implementation Contract

- Use TDD and stop at Navigator Validation.
"""

AUTHORED_PLAN = "# Plan — authored by the Driver\n\nThis body must survive Plan.\n"


def _freeze_now() -> None:
    """Freeze `_now()` so nothing time-dependent can reach the golden."""
    from memory import models

    models._now = lambda: FROZEN_NOW


def _store() -> tuple[Store, list[str]]:
    connection = sqlite3.connect(":memory:")
    connection.row_factory = sqlite3.Row
    connection.executescript(SCHEMA)
    requested: list[str] = []
    store = Store(connection)
    store.configure_projection_refresh(requested.append)
    return store, requested


def _metadata(store: Store, journey: str) -> str | None:
    """The serialized cursor cell exactly as Python wrote it."""
    row = store.conn.execute(
        "SELECT metadata FROM runtime_sessions WHERE session_id = ?",
        (f"__builder_delivery_cursor__:{journey}",),
    ).fetchone()
    return None if row is None else row["metadata"]


def _cursor_dump(cursor: Any) -> dict[str, Any] | None:
    if cursor is None:
        return None
    receipt = cursor.plan_preauthorization
    return {
        "journey": cursor.journey,
        "method": cursor.method,
        "active_item": cursor.active_item,
        "active_item_title": cursor.active_item_title,
        "active_item_level": cursor.active_item_level,
        "active_checkpoint": cursor.active_checkpoint,
        "pending_confirmation": cursor.pending_confirmation,
        "last_delivery_event": cursor.last_delivery_event,
        "cadence_profile": cursor.cadence_profile,
        "cadence_limits": list(cursor.cadence_limits),
        "granularity_decision": cursor.granularity_decision,
        "navigator_flow_unit": cursor.navigator_flow_unit,
        "child_work_items": list(cursor.child_work_items),
        "aggregate_checkpoint_status": list(cursor.aggregate_checkpoint_status),
        "cursor_generation": cursor.cursor_generation,
        "plan_preauthorization": None
        if receipt is None
        else {
            "journey": receipt.journey,
            "method": receipt.method,
            "cursor_generation": receipt.cursor_generation,
            "active_item": receipt.active_item,
            "active_item_level": receipt.active_item_level,
            "flow_unit": receipt.flow_unit,
            "child_work_items": list(receipt.child_work_items),
            "plan_contract_version": receipt.plan_contract_version,
            "policy": receipt.policy,
            "stop_boundary": receipt.stop_boundary,
            "scope_fingerprint": receipt.scope_fingerprint,
            "status": receipt.status,
            "reason": receipt.reason,
        },
        "release_intent_delivery_story": cursor.release_intent_delivery_story,
        "release_intent": cursor.release_intent,
    }


class Scenario:
    """One lifecycle sequence over a fresh store and a fresh project directory."""

    def __init__(self, name: str, *, journey: str = JOURNEY) -> None:
        self.name = name
        self.journey = journey
        self.store, self.projection_requests = _store()
        self.root = PARITY_ROOT / name
        shutil.rmtree(self.root, ignore_errors=True)
        self.project = self.root / "project"
        self.project.mkdir(parents=True, exist_ok=True)
        self.steps: list[dict[str, Any]] = []
        self.pull_report: Any = None
        self.prepare_report: Any = None
        self.expand_report: Any = None
        self.plan_report: Any = None
        self.plan_path: Path | None = None

    # -- recording -----------------------------------------------------------

    def files(self) -> dict[str, str]:
        """Every file under the project, project-relative, with its bytes."""
        snapshot: dict[str, str] = {}
        for path in sorted(self.project.rglob("*")):
            if path.is_file():
                snapshot[path.relative_to(self.project).as_posix()] = path.read_text(
                    encoding="utf-8"
                )
        return snapshot

    def _artifacts(self, artifacts: tuple[MaterializedArtifact, ...]) -> list[dict[str, str]]:
        return [
            {
                "kind": artifact.kind,
                "path": self.project_relative(artifact.path),
                "status": artifact.status,
            }
            for artifact in artifacts
        ]

    def project_relative(self, path: Path) -> str:
        """Path content, graded exactly, in the only form that is machine-independent."""
        relative = surface_paths.project_relative(path, self.project)
        if relative == surface_paths.OUTSIDE_TOKEN:
            raise SystemExit(
                f"scenario produced {Path(path).resolve()}, outside its project root "
                f"{self.project.resolve()}; the confinement guard should have refused it."
            )
        return relative

    def scrub(self, message: str) -> str:
        """Rewrite absolute paths inside a message as project-relative ones.

        Refusal messages carry paths UNTRUNCATED (`ExpandBlockedError` embeds the
        resolved package directory; `StoryPackageAmbiguityError` lists every
        claimant), so unlike a wrapped card row they can be substituted exactly and
        the message shape stays fully graded.

        Idempotent on purpose. The first version was applied twice to the same
        message -- once at the call site, once inside `record` -- and the second
        pass re-matched the RELATIVE result (`docs/project/roadmap/…` contains
        `/project/roadmap/…`) and rewrote it to a token, producing
        `authored package at docs<OUTSIDE PROJECT>`. Only candidates under the
        repository root are touched now, so a second pass is a no-op and an
        unrelated `/`-prefixed fragment in product text is left alone.
        """
        return surface_paths.scrub_message(message, project_root=self.project)

    def record(
        self,
        op: str,
        *,
        input: dict[str, Any] | None = None,
        surfaces: list[tuple[str, str]] | None = None,
        artifacts: tuple[MaterializedArtifact, ...] = (),
        error: str | None = None,
        extra: dict[str, Any] | None = None,
    ) -> None:
        before = len(self.steps)
        step: dict[str, Any] = {
            "index": before,
            "op": op,
            "input": input or {},
            "cursor": _cursor_dump(get_delivery_cursor(self.store, self.journey)),
            "metadata": _metadata(self.store, self.journey),
            "projection_requests": list(self.projection_requests),
            "files": self.files(),
        }
        if surfaces:
            step["surfaces"] = [
                {"id": surface_id, "text": text} for surface_id, text in surfaces
            ]
        if artifacts:
            step["artifacts"] = self._artifacts(artifacts)
        if error is not None:
            step["error"] = self.scrub(error)
        if extra:
            step.update(extra)
        self.steps.append(step)

    def finish(self) -> dict[str, Any]:
        payload = {
            "name": self.name,
            "journey": self.journey,
            "project_root": self.project.as_posix(),
            "steps": self.steps,
        }
        shutil.rmtree(self.root, ignore_errors=True)
        return payload

    # -- seeding -------------------------------------------------------------

    def seed_cursor(self, **kwargs: Any) -> None:
        set_delivery_cursor(self.store, journey=self.journey, **kwargs)
        self.record("seed_cursor", input=_jsonable(kwargs))

    def seed_receipt(self, *, receipt_changes: dict[str, Any], **kwargs: Any) -> None:
        """Re-write the cursor carrying a mutated receipt (tamper scenarios)."""
        current = get_delivery_cursor(self.store, self.journey)
        assert current is not None and current.plan_preauthorization is not None
        set_delivery_cursor(
            self.store,
            journey=self.journey,
            plan_preauthorization=replace(current.plan_preauthorization, **receipt_changes),
            **kwargs,
        )
        self.record(
            "seed_receipt",
            input={"receipt_changes": _jsonable(receipt_changes), **_jsonable(kwargs)},
        )

    def write_file(self, relative: str, content: str) -> None:
        target = self.project / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        self.record("write_file", input={"path": relative})

    # -- lifecycle operations ------------------------------------------------

    def pull(self, *, code: str, title: str, level: str, why_now: str, method: str = "ariad") -> None:
        payload = {
            "code": code,
            "title": title,
            "level": level,
            "why_now": why_now,
            "method": method,
        }
        try:
            self.pull_report = pull_lifecycle_item(
                self.store,
                journey=self.journey,
                method=method,
                item=BuilderLifecycleItem(
                    code=code, title=title, level=level, why_now=why_now
                ),
            )
        except ValueError as exc:
            self.record("pull", input=payload, error=f"{type(exc).__name__}: {exc}")
            return
        self.record(
            "pull",
            input=payload,
            surfaces=[("delivery_story_identified", render_pull_report(self.pull_report))],
        )

    def prepare(self, *, method: str = "ariad", with_project: bool = True) -> None:
        payload = {"method": method, "with_project": with_project}
        try:
            self.prepare_report = prepare_lifecycle_item(
                self.store,
                journey=self.journey,
                method=method,
                project_path=self.project if with_project else None,
            )
        except ValueError as exc:
            self.record("prepare", input=payload, error=f"{type(exc).__name__}: {exc}")
            return
        self.record(
            "prepare",
            input=payload,
            surfaces=[("prepare_field_reading", render_prepare_report(self.prepare_report))],
        )

    def expand(self, *, method: str = "ariad") -> None:
        payload = {"method": method}
        active = get_delivery_cursor(self.store, self.journey)
        active_item = active.active_item if active else None
        try:
            self.expand_report = expand_delivery_story(
                self.store,
                journey=self.journey,
                method=method,
                project_path=self.project,
            )
        except (ExpandBlockedError, StoryPackageAmbiguityError) as exc:
            # The CLI's refusal path: EXPAND_BLOCKED carries the exception text,
            # which embeds the resolved absolute package directory.
            message = str(exc)
            self.record(
                "expand",
                input=payload,
                surfaces=[
                    (
                        "expand_blocked",
                        surface_paths.normalize_path_rows(
                            render_expand_blocked(active_item or "none", message),
                            surface_paths.absolute_paths_in(message),
                        ),
                    )
                ],
                error=f"{type(exc).__name__}: {message}",
            )
            return
        except ValueError as exc:
            self.record("expand", input=payload, error=f"{type(exc).__name__}: {exc}")
            return
        report = self.expand_report
        absolute = [str(path) for path in report.materialized_paths]
        surfaces = [
            (
                "expand_decision",
                surface_paths.normalize_path_rows(render_expand_report(report), absolute),
            )
        ]
        if self.pull_report is not None and self.prepare_report is not None:
            surfaces.append(
                (
                    "delivery_story_ready",
                    render_delivery_story_ready_report(
                        pull=self.pull_report,
                        prepare=self.prepare_report,
                        expand=report,
                    ),
                )
            )
        surfaces.append(
            (
                "artifacts_materialized",
                render_artifacts_materialized_surface(
                    context=f"Expand — {report.delivery_story}",
                    artifacts=report.materialized_artifacts,
                    project_path=self.project,
                    boundary=(
                        "Files were materialized only. No Plan or implementation was executed."
                    ),
                ),
            )
        )
        self.record(
            "expand",
            input=payload,
            surfaces=surfaces,
            artifacts=report.materialized_artifacts,
            extra={
                "recommended_story": report.recommended_story,
                "recommended_story_title": report.recommended_story_title,
                "materialized_paths": [
                    self.project_relative(path) for path in report.materialized_paths
                ],
            },
        )

    def plan(
        self,
        *,
        objective: str | None = None,
        scope: tuple[str, ...] = (),
        non_goals: tuple[str, ...] = (),
        acceptance_behavior: tuple[str, ...] = (),
        validation_route: tuple[str, ...] = (),
        e2e_decision: str | None = None,
        local_rules: tuple[str, ...] = (),
        preauthorize: bool = False,
        stop_boundary: str = "navigator_validation",
        artifact: bool = True,
        plan_relative: str | None = None,
    ) -> None:
        payload = {
            "objective": objective,
            "scope": list(scope),
            "non_goals": list(non_goals),
            "acceptance_behavior": list(acceptance_behavior),
            "validation_route": list(validation_route),
            "e2e_decision": e2e_decision,
            "local_rules": list(local_rules),
            "preauthorize": preauthorize,
            "stop_boundary": stop_boundary,
            "artifact": artifact,
            "plan_relative": plan_relative,
        }
        if plan_relative is not None:
            self.plan_path = self.project / plan_relative
        elif artifact:
            self.plan_path = self._canonical_plan_path()
        else:
            self.plan_path = None
        existed_before = self._package_existence(self.plan_path)
        try:
            self.plan_report = plan_lifecycle_item(
                self.store,
                journey=self.journey,
                method=get_ariad_method(),
                objective=objective,
                scope=scope,
                non_goals=non_goals,
                acceptance_behavior=acceptance_behavior,
                validation_route=validation_route,
                e2e_decision=e2e_decision,
                local_rules=local_rules,
                plan_artifact_path=self.plan_path,
                preauthorize=preauthorize,
                stop_boundary=stop_boundary,
            )
        except ValueError as exc:
            self.record("plan", input=payload, error=f"{type(exc).__name__}: {exc}")
            return
        report = self.plan_report
        surfaces = [("plan_checkpoint", render_plan_checkpoint(report))]
        if report.preauthorization_recorded:
            surfaces.append(
                (
                    "plan_preauthorization_recorded",
                    render_story_plan_preauthorization_recorded(report.cursor),
                )
            )
        artifacts = self._package_artifacts(self.plan_path, existed_before)
        if artifacts:
            surfaces.append(
                (
                    "artifacts_materialized",
                    render_artifacts_materialized_surface(
                        context=f"Plan — {report.active_item}",
                        artifacts=artifacts,
                        project_path=self.project,
                        boundary=(
                            "Plan artifacts were materialized. Implementation remains "
                            "blocked until approval."
                        ),
                    ),
                )
            )
        self.record("plan", input=payload, surfaces=surfaces, artifacts=artifacts)

    def approve(self, *, method: str = "ariad") -> None:
        payload = {"method": method}
        try:
            cursor = approve_plan_checkpoint(self.store, journey=self.journey, method=method)
        except ValueError as exc:
            self.record("approve", input=payload, error=f"{type(exc).__name__}: {exc}")
            return
        self.record(
            "approve",
            input=payload,
            surfaces=[("plan_approved", render_plan_approval(cursor))],
        )

    def approve_with_preauthorization(self, *, method: str = "ariad") -> None:
        payload = {"method": method}
        try:
            report = approve_story_plan_with_preauthorization(
                self.store,
                journey=self.journey,
                method=method,
                plan_artifact_path=self.plan_path,
            )
        except PlanPreauthorizationMismatch as exc:
            cursor = get_delivery_cursor(self.store, self.journey)
            self.record(
                "approve_with_preauthorization",
                input=payload,
                surfaces=[
                    (
                        "plan_preauthorization_mismatch",
                        render_story_plan_preauthorization_mismatch(
                            active_item=cursor.active_item if cursor else None,
                            reason=exc.reason,
                        ),
                    )
                ],
                error=f"PlanPreauthorizationMismatch: {exc.reason}",
            )
            return
        except ValueError as exc:
            self.record(
                "approve_with_preauthorization",
                input=payload,
                error=f"{type(exc).__name__}: {exc}",
            )
            return
        if report.status == "already_approved":
            surfaces = [
                (
                    "plan_preauthorization_already_consumed",
                    render_story_preauthorization_already_consumed(report.cursor),
                )
            ]
        else:
            surfaces = [
                ("plan_approved", render_plan_approval(report.cursor)),
                (
                    "implementation_started",
                    render_story_implementation_started(report.cursor),
                ),
            ]
        self.record(
            "approve_with_preauthorization",
            input=payload,
            surfaces=surfaces,
            extra={
                "status": report.status,
                "implementation_started": report.implementation_started,
                "unfilled_sections": list(report.unfilled_sections),
            },
        )

    def cancel_preauthorization(self, *, method: str = "ariad") -> None:
        payload = {"method": method}
        try:
            cursor = cancel_story_plan_preauthorization(
                self.store, journey=self.journey, method=method
            )
        except ValueError as exc:
            self.record(
                "cancel_preauthorization", input=payload, error=f"{type(exc).__name__}: {exc}"
            )
            return
        self.record(
            "cancel_preauthorization",
            input=payload,
            surfaces=[
                (
                    "plan_preauthorization_mismatch",
                    render_story_plan_preauthorization_mismatch(
                        active_item=cursor.active_item, reason="navigator_cancelled"
                    ),
                )
            ],
        )

    # -- CLI-equivalent path derivation --------------------------------------
    #
    # `cli/build.py` computes the Plan artifact path with `_canonical_package_path`
    # (resolve by heading code, else create) and the package artifact triple with
    # `_plan_package_artifacts`. Both are mirrored here so the corpus grades the
    # FOLDER DERIVATION, not just the bytes; the command golden grades the same
    # thing end to end through argv.

    def _canonical_plan_path(self) -> Path | None:
        """Derive the package directory exactly as the CLI does, then render it relative.

        `story_paths` resolves the roadmap root to an ABSOLUTE path deliberately:
        `create_story_directory`'s escape guard is `target.is_relative_to(roadmap_root)`,
        which is only sound on absolutes. The consequence is that
        `render_plan_checkpoint` prints an absolute machine path -- unlike every
        artifact surface, which relativizes through `_display_path`. That is real
        Python behavior and the port must reproduce it, but it cannot be graded
        byte for byte across machines, so the corpus derives the directory through
        the real resolver (proving resolution-by-heading and the escape guard) and
        then hands the renderer the repo-relative form. The absolute-vs-relative
        asymmetry in `plan_checkpoint` is recorded as a CR candidate in the story
        plan; reproducing it is parity, fixing it here would be a liberty.
        """
        cursor = get_delivery_cursor(self.store, self.journey)
        active_item = getattr(cursor, "active_item", None)
        if cursor is None or not active_item:
            return None
        resolved = resolve_story_directory(self.project, str(active_item))
        if resolved is None:
            resolved = create_story_directory(
                self.project, str(active_item), cursor.active_item_title or str(active_item)
            )
        return _repo_relative(resolved) / "plan.md"

    @staticmethod
    def _package_existence(plan_path: Path | None) -> dict[Path, bool]:
        if plan_path is None:
            return {}
        paths = (plan_path.parent / "index.md", plan_path, plan_path.parent / "test-guide.md")
        return {path: path.exists() for path in paths}

    @staticmethod
    def _package_artifacts(
        plan_path: Path | None, existed_before: dict[Path, bool]
    ) -> tuple[MaterializedArtifact, ...]:
        if plan_path is None:
            return ()
        triple = (
            ("story index", plan_path.parent / "index.md"),
            ("plan", plan_path),
            ("test guide", plan_path.parent / "test-guide.md"),
        )
        return tuple(
            existing_artifact(kind, path)
            if existed_before.get(path, False)
            else materialized_artifact(kind, path, existed_before=False)
            for kind, path in triple
        )


def _repo_relative(path: Path) -> Path:
    """Re-express an absolute path under the repository root as a relative one."""
    root = Path.cwd().resolve()
    resolved = path.resolve()
    if not resolved.is_relative_to(root):
        raise SystemExit(
            f"scenario path {resolved} escaped the repository root {root}; "
            "the corpus cannot record a machine-dependent path."
        )
    return resolved.relative_to(root)


def _jsonable(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(item) for item in value]
    if isinstance(value, Path):
        return str(value)
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


# ---------------------------------------------------------------------------
# Scenarios. Each name points at the Python test it was taken from.
# ---------------------------------------------------------------------------


def _story_lifecycle_happy_path() -> dict[str, Any]:
    """pull -> prepare -> plan -> approve for an implementable User Story.

    test_pull_lifecycle_item_updates_cursor_and_renders_report,
    test_prepare_lifecycle_item_updates_cursor_and_renders_report,
    test_plan_lifecycle_item_updates_cursor_and_renders_checkpoint.
    """
    scenario = Scenario("story_lifecycle_happy_path")
    scenario.write_file("README.md", "# Project\n")
    scenario.write_file("docs/project/roadmap/index.md", "# Roadmap\n")
    scenario.seed_cursor(method="ariad")
    scenario.pull(
        code="CHECKOUT-FLOW",
        title="Checkout Flow",
        level="user_story",
        why_now="next candidate capability",
    )
    scenario.prepare()
    scenario.plan()
    scenario.approve()
    return scenario.finish()


def _plan_preserves_authored_plan() -> dict[str, Any]:
    """The preservation rule: an authored plan.md survives Plan.

    test_plan_lifecycle_item_preserves_existing_driver_authored_plan.
    """
    scenario = Scenario("plan_preserves_authored_plan")
    scenario.seed_cursor(
        method="ariad",
        active_item="CV1.US1",
        active_item_title="Authored story",
        active_item_level="user_story",
        last_delivery_event="prepare",
    )
    # The authored files must sit exactly where the canonical derivation LANDS,
    # which for a dotted code is nested under its parent coordinate
    # (`roadmap/cv1/cv1-us1-…`), not at the roadmap root. The first version of this
    # scenario authored one level too high, so Plan created all three artifacts and
    # the corpus would have passed a port that overwrites authored work -- the exact
    # defect the preservation rule exists to prevent.
    package = "docs/project/roadmap/cv1/cv1-us1-authored-story"
    scenario.write_file(f"{package}/plan.md", AUTHORED_PLAN)
    # Two of three authored, one absent: the guard is per FILE, not per package.
    scenario.write_file(f"{package}/index.md", "# Authored index\n\nMust survive.\n")
    scenario.plan()
    return scenario.finish()


def _story_lifecycle_refusals() -> list[dict[str, Any]]:
    """Every Scope C refusal, each as its own one-step sequence.

    test_pull_lifecycle_item_requires_existing_cursor,
    test_pull_lifecycle_item_rejects_unknown_level,
    test_prepare_lifecycle_item_requires_active_item,
    test_plan_lifecycle_item_requires_prepare,
    test_plan_lifecycle_item_requires_active_item, and the Delivery Story
    granularity guard inside plan_lifecycle_item.
    """
    scenarios: list[dict[str, Any]] = []

    no_cursor = Scenario("pull_requires_existing_cursor")
    no_cursor.pull(
        code="CHECKOUT-FLOW", title="Checkout Flow", level="user_story", why_now="because"
    )
    scenarios.append(no_cursor.finish())

    bad_level = Scenario("pull_rejects_unknown_level")
    bad_level.seed_cursor(method="ariad")
    bad_level.pull(code="CHECKOUT-FLOW", title="Checkout Flow", level="epic", why_now="because")
    scenarios.append(bad_level.finish())

    empty_fields = Scenario("pull_rejects_blank_required_fields")
    empty_fields.seed_cursor(method="ariad")
    empty_fields.pull(code="   ", title="Checkout Flow", level="user_story", why_now="because")
    empty_fields.pull(code="CHECKOUT", title="  ", level="user_story", why_now="because")
    empty_fields.pull(code="CHECKOUT", title="Checkout", level="user_story", why_now="  ")
    scenarios.append(empty_fields.finish())

    prepare_no_item = Scenario("prepare_requires_active_item")
    prepare_no_item.seed_cursor(method="ariad")
    prepare_no_item.prepare()
    scenarios.append(prepare_no_item.finish())

    prepare_no_cursor = Scenario("prepare_requires_existing_cursor")
    prepare_no_cursor.prepare()
    scenarios.append(prepare_no_cursor.finish())

    plan_no_prepare = Scenario("plan_requires_prepare")
    plan_no_prepare.seed_cursor(
        method="ariad",
        active_item="CV1.US1",
        active_item_title="Story",
        active_item_level="user_story",
        last_delivery_event="pull",
    )
    plan_no_prepare.plan()
    scenarios.append(plan_no_prepare.finish())

    plan_no_item = Scenario("plan_requires_active_item")
    plan_no_item.seed_cursor(method="ariad")
    plan_no_item.plan()
    scenarios.append(plan_no_item.finish())

    plan_no_cursor = Scenario("plan_requires_existing_cursor")
    plan_no_cursor.plan()
    scenarios.append(plan_no_cursor.finish())

    plan_delivery_story = Scenario("plan_refuses_delivery_story")
    plan_delivery_story.seed_cursor(
        method="ariad",
        active_item="CV1.DS1",
        active_item_title="Delivery Story",
        active_item_level="delivery_story",
        last_delivery_event="prepare",
    )
    plan_delivery_story.plan()
    scenarios.append(plan_delivery_story.finish())

    approve_without_checkpoint = Scenario("approve_requires_pending_checkpoint")
    approve_without_checkpoint.seed_cursor(
        method="ariad",
        active_item="CV1.US1",
        active_item_level="user_story",
        last_delivery_event="prepare",
    )
    approve_without_checkpoint.approve()
    scenarios.append(approve_without_checkpoint.finish())

    approve_no_cursor = Scenario("approve_requires_existing_cursor")
    approve_no_cursor.approve()
    scenarios.append(approve_no_cursor.finish())

    expand_requires_ds = Scenario("expand_requires_delivery_story_level")
    expand_requires_ds.seed_cursor(
        method="ariad",
        active_item="CV1.US1",
        active_item_title="Story",
        active_item_level="user_story",
    )
    expand_requires_ds.expand()
    scenarios.append(expand_requires_ds.finish())

    expand_no_cursor = Scenario("expand_requires_existing_cursor")
    expand_no_cursor.expand()
    scenarios.append(expand_no_cursor.finish())

    return scenarios


def _prepare_terrain_variants() -> list[dict[str, Any]]:
    """`_context_summary`'s three shapes: no project, missing files, present files.

    test_prepare_lifecycle_item_updates_cursor_and_renders_report covers the
    project-path case; the no-project branch is the CLI's when a journey has no
    configured project.
    """
    scenarios: list[dict[str, Any]] = []

    without_project = Scenario("prepare_without_project_path")
    without_project.seed_cursor(
        method="ariad",
        active_item="CV1.US1",
        active_item_title="Story",
        active_item_level="user_story",
    )
    without_project.prepare(with_project=False)
    scenarios.append(without_project.finish())

    missing_files = Scenario("prepare_with_missing_terrain_files")
    missing_files.seed_cursor(
        method="ariad",
        active_item="CV1.DS1",
        active_item_title="Delivery Story",
        active_item_level="delivery_story",
    )
    missing_files.prepare()
    scenarios.append(missing_files.finish())

    present_files = Scenario("prepare_with_present_terrain_files")
    present_files.seed_cursor(
        method="ariad",
        active_item="CV1.US1",
        active_item_title="Story",
        active_item_level="user_story",
    )
    present_files.write_file("README.md", "# Project\n")
    present_files.write_file("docs/project/roadmap/index.md", "# Roadmap\n")
    present_files.write_file("docs/process/development-guide.md", "# Guide\n")
    present_files.prepare()
    scenarios.append(present_files.finish())

    unknown_level = Scenario("prepare_with_unknown_level")
    unknown_level.seed_cursor(
        method="ariad", active_item="CV1.X1", active_item_title="Mystery", active_item_level=None
    )
    unknown_level.prepare()
    scenarios.append(unknown_level.finish())

    return scenarios


def _pull_state_carry() -> list[dict[str, Any]]:
    """Pull's carry-forward rules, which are the ones a port gets wrong.

    test_pull_clears_stale_children_when_active_item_changes,
    test_pull_preserves_children_when_repulling_same_item,
    test_each_pull_advances_cursor_generation_even_for_same_item,
    test_lifecycle_updates_preserve_delivery_story_state.
    """
    scenarios: list[dict[str, Any]] = []

    changed = Scenario("pull_clears_stale_children_on_item_change")
    changed.seed_cursor(
        method="ariad",
        active_item="CV1.DS1",
        active_item_title="First",
        active_item_level="delivery_story",
        child_work_items=("CV1.DS1.US1", "CV1.DS1.US2"),
        aggregate_checkpoint_status=("plan:approved",),
        release_intent_delivery_story="CV1.DS1",
        release_intent="planned",
    )
    changed.pull(
        code="CV1.DS2", title="Second", level="delivery_story", why_now="next delivery story"
    )
    scenarios.append(changed.finish())

    repull = Scenario("pull_preserves_children_on_repull")
    repull.seed_cursor(
        method="ariad",
        active_item="CV1.DS1",
        active_item_title="First",
        active_item_level="delivery_story",
        child_work_items=("CV1.DS1.US1", "CV1.DS1.US2"),
        aggregate_checkpoint_status=("plan:approved",),
        release_intent_delivery_story="CV1.DS1",
        release_intent="planned",
        cursor_generation=3,
    )
    repull.pull(code="CV1.DS1", title="First", level="delivery_story", why_now="re-pull")
    repull.pull(code="CV1.DS1", title="First", level="delivery_story", why_now="re-pull again")
    scenarios.append(repull.finish())

    child_pull = Scenario("pull_child_story_keeps_release_intent_within_same_ds")
    child_pull.seed_cursor(
        method="ariad",
        active_item="CV1.DS1",
        active_item_title="First",
        active_item_level="delivery_story",
        release_intent_delivery_story="CV1.DS1",
        release_intent="planned",
    )
    child_pull.pull(
        code="CV1.DS1.US1",
        title="Child story",
        level="user_story",
        why_now="implementable child",
    )
    scenarios.append(child_pull.finish())

    return scenarios


def _expand_scenarios() -> list[dict[str, Any]]:
    """Expand: candidate-table grammar, resolution, refusals, sanitization."""
    scenarios: list[dict[str, Any]] = []
    ds_folder = "docs/project/roadmap/ds-35-application-admin-parity"

    def ds_scenario(name: str, index_body: str | None, **cursor: Any) -> Scenario:
        scenario = Scenario(name)
        if index_body is not None:
            scenario.write_file(f"{ds_folder}/index.md", index_body)
        scenario.seed_cursor(
            method="ariad",
            active_item=cursor.pop("active_item", "DS-35"),
            active_item_title=cursor.pop("active_item_title", "Application & Admin Parity"),
            active_item_level="delivery_story",
            **cursor,
        )
        return scenario

    four_col = ds_scenario("expand_reads_four_column_candidate_table", FOUR_COL_DS_INDEX)
    four_col.expand()
    scenarios.append(four_col.finish())

    five_col = ds_scenario("expand_parses_generated_five_column_table", FIVE_COL_DS_INDEX)
    five_col.expand()
    scenarios.append(five_col.finish())

    first_pending = ds_scenario("expand_recommends_first_pending_child", DONE_FIRST_DS_INDEX)
    first_pending.expand()
    scenarios.append(first_pending.finish())

    stale = ds_scenario(
        "expand_replaces_stale_children",
        FOUR_COL_DS_INDEX,
        child_work_items=("DS-34.US-1", "DS-34.US-2", "DS-34.TS-1"),
    )
    stale.expand()
    scenarios.append(stale.finish())

    # No DS index on disk: the synthetic fallback child, and the reset it forces.
    fallback = Scenario("expand_fallback_without_authored_package")
    fallback.seed_cursor(
        method="ariad",
        active_item="DS-99",
        active_item_title="Orphan Story",
        active_item_level="delivery_story",
        child_work_items=("DS-34.US-1", "DS-34.US-2"),
    )
    fallback.expand()
    scenarios.append(fallback.finish())

    # Re-expanding an authored package: every child index already exists, so the
    # artifact statuses must flip from `created` to `existing`.
    idempotent = ds_scenario("expand_twice_reports_existing_packages", FOUR_COL_DS_INDEX)
    idempotent.expand()
    idempotent.expand()
    scenarios.append(idempotent.finish())

    long_titles = ds_scenario("expand_handles_paragraph_length_child_titles", LONG_CHILD_DS_INDEX)
    long_titles.expand()
    scenarios.append(long_titles.finish())

    traversal = ds_scenario("expand_sanitizes_path_bearing_code_cell", TRAVERSAL_DS_INDEX)
    traversal.expand()
    scenarios.append(traversal.finish())

    # Resolution by heading code inside a real nested CV folder (CR048's shape).
    nested = Scenario("expand_resolves_authored_dotted_code_package")
    nested.write_file(
        "docs/project/roadmap/cv2-typescript-core-port/index.md",
        "# CV2 — TypeScript Core Port\n\n**Status:** In Progress\n",
    )
    nested.write_file(
        "docs/project/roadmap/cv2-typescript-core-port/cv2-ds1-command-burn-down/index.md",
        """# CV2.DS1 — Command Burn-Down

**Status:** 🟡 Planned

## Candidate Stories

| Code | Story | Type | Outcome | Status |
|------|-------|------|---------|--------|
| CV2.DS1.US1 | Port the command runner | User Story | Observable flow | 🟡 Planned |

## Done Condition

Done.
""",
    )
    nested.seed_cursor(
        method="ariad",
        active_item="CV2.DS1",
        active_item_title="Command Burn-Down",
        active_item_level="delivery_story",
    )
    nested.expand()
    scenarios.append(nested.finish())

    # Heading code wins over folder name: the folder says `legacy-name`.
    by_heading = Scenario("expand_resolves_by_heading_not_folder_name")
    by_heading.write_file(
        "docs/project/roadmap/totally-unrelated-folder-name/index.md",
        FOUR_COL_DS_INDEX,
    )
    by_heading.seed_cursor(
        method="ariad",
        active_item="DS-35",
        active_item_title="Application & Admin Parity",
        active_item_level="delivery_story",
    )
    by_heading.expand()
    scenarios.append(by_heading.finish())

    blocked = Scenario("expand_blocks_on_non_canonical_candidate_table")
    blocked.write_file(
        "docs/project/roadmap/cv22-typescript-core-port/index.md",
        "# CV22 — TypeScript Core Port\n\n**Status:** In Progress\n",
    )
    blocked.write_file(
        "docs/project/roadmap/cv22-typescript-core-port/cv22-ds7-command-burn-down/index.md",
        NON_CANONICAL_DS_INDEX,
    )
    blocked.seed_cursor(
        method="ariad",
        active_item="CV22.DS7",
        active_item_title="Command Burn-Down",
        active_item_level="delivery_story",
    )
    blocked.expand()
    scenarios.append(blocked.finish())

    ambiguous = Scenario("expand_blocks_on_duplicate_heading")
    for suffix in ("a", "b"):
        ambiguous.write_file(
            f"docs/project/roadmap/cv9-ds1-duplicate-{suffix}/index.md",
            "# CV9.DS1 — Duplicate Story\n\n**Status:** 🟡 Planned\n",
        )
    ambiguous.seed_cursor(
        method="ariad",
        active_item="CV9.DS1",
        active_item_title="Duplicate Story",
        active_item_level="delivery_story",
    )
    ambiguous.expand()
    scenarios.append(ambiguous.finish())

    # The full Delivery Story activation path the CLI runs: pull -> prepare ->
    # expand, which is the only way `delivery_story_ready` renders.
    ds_activation = Scenario("delivery_story_activation_through_pull")
    ds_activation.write_file(f"{ds_folder}/index.md", FOUR_COL_DS_INDEX)
    ds_activation.write_file("README.md", "# Project\n")
    ds_activation.seed_cursor(method="ariad")
    ds_activation.pull(
        code="DS-35",
        title="Delivery / Application & Admin Parity",
        level="delivery_story",
        why_now="the delivery story is next",
    )
    ds_activation.prepare()
    ds_activation.expand()
    scenarios.append(ds_activation.finish())

    single_child = Scenario("delivery_story_activation_with_single_child")
    single_child.write_file(
        f"{ds_folder}/index.md",
        """# DS-35 — Application & Admin Parity

**Status:** 🟡 Planned

## Candidate Stories

| Code | Story | Type | Status |
|------|-------|------|--------|
| DS-35.US-1 | Port the application step flow | User Story | 🟡 Planned |

## Done Condition

Done.
""",
    )
    single_child.seed_cursor(method="ariad")
    single_child.pull(
        code="DS-35",
        title="Application & Admin Parity",
        level="delivery_story",
        why_now="one child only",
    )
    single_child.prepare()
    single_child.expand()
    scenarios.append(single_child.finish())

    return scenarios


def _preauthorization_scenarios() -> list[dict[str, Any]]:
    """Story Plan authority: record, consume, refuse, cancel.

    From test_story_plan_preauthorization.py, whose `_planned_story` helper seeds
    `cursor_generation=7` and a complete authored plan.md at a fixed path.
    """
    scenarios: list[dict[str, Any]] = []
    plan_relative = "docs/project/roadmap/story/plan.md"

    def planned(name: str, *, level: str = "user_story", **cursor: Any) -> Scenario:
        scenario = Scenario(name)
        scenario.write_file(plan_relative, COMPLETE_PLAN)
        scenario.seed_cursor(
            method="ariad",
            active_item="CV20.DS16.US1" if level == "user_story" else "CV20.DS16.TS1",
            active_item_title="Conditional story orchestration",
            active_item_level=level,
            last_delivery_event="prepare",
            navigator_flow_unit="story_by_story",
            cursor_generation=7,
            **cursor,
        )
        scenario.plan(preauthorize=True, plan_relative=plan_relative)
        return scenario

    for level in ("user_story", "technical_story"):
        recorded = planned(f"story_authority_recorded_{level}", level=level)
        recorded.approve_with_preauthorization()
        recorded.approve_with_preauthorization()
        scenarios.append(recorded.finish())

    accelerated = Scenario("accelerated_cadence_records_authority_without_flag")
    accelerated.write_file(plan_relative, COMPLETE_PLAN)
    accelerated.seed_cursor(
        method="ariad",
        active_item="CV20.DS16.US1",
        active_item_title="Conditional story orchestration",
        active_item_level="user_story",
        last_delivery_event="prepare",
        navigator_flow_unit="story_by_story",
        cadence_profile="accelerated",
        cursor_generation=7,
    )
    accelerated.plan(plan_relative=plan_relative)
    accelerated.approve_with_preauthorization()
    scenarios.append(accelerated.finish())

    for cadence in ("stepwise", "checkpoint"):
        gated = Scenario(f"{cadence}_cadence_keeps_plan_gate")
        gated.write_file(plan_relative, COMPLETE_PLAN)
        gated.seed_cursor(
            method="ariad",
            active_item="CV20.DS16.US1",
            active_item_title="Conditional story orchestration",
            active_item_level="user_story",
            last_delivery_event="prepare",
            navigator_flow_unit="story_by_story",
            cadence_profile=cadence,
            cursor_generation=7,
        )
        gated.plan(plan_relative=plan_relative)
        gated.approve_with_preauthorization()
        scenarios.append(gated.finish())

    placeholder = planned("authority_accepts_placeholder_as_product_vocabulary")
    placeholder.write_file(
        plan_relative,
        COMPLETE_PLAN.replace(
            "- No sibling scope.",
            "- Do not implement the sibling Payment placeholder story.",
        ),
    )
    placeholder.approve_with_preauthorization()
    scenarios.append(placeholder.finish())

    for index, body in enumerate(("Pending — decide scope.", "Placeholder — define the real scope.")):
        incomplete = planned(f"authority_blocks_incomplete_plan_{index}")
        incomplete.write_file(plan_relative, f"# Plan\n\n## Scope\n\n{body}\n")
        incomplete.approve_with_preauthorization()
        scenarios.append(incomplete.finish())

    missing_plan = planned("authority_blocks_missing_plan_file")
    (missing_plan.project / plan_relative).unlink()
    missing_plan.approve_with_preauthorization()
    scenarios.append(missing_plan.finish())

    tampered = planned("authority_rejects_tampered_fingerprint")
    tampered.seed_receipt(
        receipt_changes={"active_item_level": "technical_story"},
        method="ariad",
        active_item="CV20.DS16.US1",
        active_item_title="Conditional story orchestration",
        active_item_level="technical_story",
        active_checkpoint="after_plan",
        pending_confirmation="navigator_approval",
        last_delivery_event="plan",
        navigator_flow_unit="story_by_story",
        cursor_generation=7,
    )
    tampered.approve_with_preauthorization()
    scenarios.append(tampered.finish())

    wrong_flow = Scenario("authority_requires_story_by_story_flow")
    wrong_flow.seed_cursor(
        method="ariad",
        active_item="CV20.DS16.US1",
        active_item_level="user_story",
        last_delivery_event="prepare",
        navigator_flow_unit="delivery_story",
    )
    wrong_flow.plan(preauthorize=True)
    scenarios.append(wrong_flow.finish())

    unsupported_stop = Scenario("authority_rejects_unsupported_stop_boundary")
    unsupported_stop.seed_cursor(
        method="ariad",
        active_item="CV20.DS16.US1",
        active_item_level="user_story",
        last_delivery_event="prepare",
        navigator_flow_unit="story_by_story",
    )
    unsupported_stop.plan(preauthorize=True, stop_boundary="done")
    scenarios.append(unsupported_stop.finish())

    ordinary = planned("ordinary_approval_invalidates_pending_authority")
    ordinary.approve()
    scenarios.append(ordinary.finish())

    cancelled = planned("navigator_cancels_pending_authority")
    cancelled.cancel_preauthorization()
    cancelled.cancel_preauthorization()
    cancelled.approve()
    scenarios.append(cancelled.finish())

    cancel_wrong_method = planned("cancel_rejects_method_mismatch")
    cancel_wrong_method.cancel_preauthorization(method="scrumban")
    scenarios.append(cancel_wrong_method.finish())

    return scenarios


def build_payload() -> dict[str, Any]:
    sequences: list[dict[str, Any]] = [
        _story_lifecycle_happy_path(),
        _plan_preserves_authored_plan(),
        *_story_lifecycle_refusals(),
        *_prepare_terrain_variants(),
        *_pull_state_carry(),
        *_expand_scenarios(),
        *_preauthorization_scenarios(),
    ]
    return {"sequences": sequences}


def _assert_no_paths(payload: str) -> None:
    """Refuse to write a golden that would differ between two checkouts."""
    leaks = [
        marker
        for marker in ("/Users/", "/home/runner", "/private/var", "/var/folders")
        if marker in payload
    ]
    if leaks:
        raise SystemExit(
            "refusing to write a machine-dependent golden: it contains "
            f"{leaks[0]!r}. A renderer absolutized a project-relative path; fix the "
            "call site rather than substituting the text, because _card_text "
            "truncates at 54 code points and a truncated prefix cannot be redacted."
        )


def main() -> None:
    _freeze_now()
    payload = build_payload()
    text = json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=False)
    _assert_no_paths(text)
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(text + "\n", encoding="utf-8")
    steps = sum(len(sequence["steps"]) for sequence in payload["sequences"])
    surfaces = sum(
        len(step.get("surfaces", ()))
        for sequence in payload["sequences"]
        for step in sequence["steps"]
    )
    refusals = sum(
        1 for sequence in payload["sequences"] for step in sequence["steps"] if "error" in step
    )
    print(
        f"{len(payload['sequences'])} sequences, {steps} graded steps, "
        f"{surfaces} surfaces, {refusals} refusals"
    )
    print(f"wrote {OUT_PATH.relative_to(HERE.parent.parent)}")


if __name__ == "__main__":
    main()
