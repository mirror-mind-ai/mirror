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
from memory.builder.delivery_story_closure import (
    coherence_delivery_story,
    done_delivery_story,
    render_delivery_story_closure_report,
    review_delivery_story,
    validate_delivery_story,
)
from memory.builder.delivery_story_plan import (
    approve_delivery_story_plan,
    cancel_delivery_story_plan_preauthorization,
    plan_delivery_story_checkpoint,
    render_delivery_story_implementation_started,
    render_delivery_story_plan_report,
    render_plan_preauthorization_mismatch,
    render_plan_preauthorization_recorded,
)
from memory.builder.delivery_story_roadmap_closure import inspect_authored_closure
from memory.builder.flow_unit import (
    render_flow_unit_scope_confirmation_report,
    render_navigator_flow_unit_report,
    set_navigator_flow_unit,
)
from memory.builder.lifecycle import (
    BuilderLifecycleItem,
    ExpandBlockedError,
    approve_plan_checkpoint,
    coherence_lifecycle_item,
    done_lifecycle_item,
    expand_delivery_story,
    plan_lifecycle_item,
    prepare_lifecycle_item,
    pull_lifecycle_item,
    render_coherence_checkpoint,
    render_delivery_story_ready_report,
    render_done_checkpoint,
    render_expand_blocked,
    render_expand_report,
    render_plan_approval,
    render_plan_checkpoint,
    render_prepare_report,
    render_pull_report,
    render_review_checkpoint,
    render_validation_checkpoint,
    review_lifecycle_item,
    validate_lifecycle_item,
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

# A `/` in a candidate Story cell. The two sides of Expand treat it OPPOSITELY: a
# child's folder slugs its FULL title, while the Delivery Story's own title goes
# through `title_leaf` and keeps only the tail. Added at plateau 3 after mutation
# testing showed the asymmetry was unguarded -- replacing `child.title` with
# `title_leaf(child.title)` in the port survived the whole corpus.
SLASHED_CHILD_DS_INDEX = """# DS-35 — Application & Admin Parity

**Status:** \U0001f7e1 Planned

## Candidate Stories

| Code | Story | Type | Status |
|------|-------|------|--------|
| DS-35.US-1 | Application flow / Review step parity | User Story | \U0001f7e1 Planned |
| DS-35.TS-1 | Admin auth / Session parity | Technical Story | \U0001f7e1 Planned |

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

    def delete_file(self, relative: str) -> None:
        """Remove a file as a RECORDED step.

        The missing-Plan scenario originally deleted the file inline, without a step.
        The snapshot then showed it absent while nothing in the sequence said so, and
        a replay could not reproduce the state the refusal depends on -- caught by
        the TypeScript comparison, which refused nothing because the file was still
        there. Every mutation a scenario performs has to be a step.
        """
        (self.project / relative).unlink()
        self.record("delete_file", input={"path": relative})

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


    # -- Delivery Story operations (plateau 5) --------------------------------
    #
    # Scope E works on the AGGREGATE: one cursor carrying `child_work_items` and
    # `aggregate_checkpoint_status`, two ordered list cells that enter the byte
    # contract here. `_replace_status` removes every `<checkpoint>:*` entry and
    # APPENDS the new one, so replacing a status REORDERS the list -- two engines
    # can hold the same set and different bytes, and the compare-and-swap the
    # revert depends on matches bytes. `delivery_story_revalidation_reorders_status`
    # exists for exactly that, replacing an entry that is not last.

    def set_flow_unit(self, *, flow_unit: str, method: str = "ariad") -> None:
        payload = {"flow_unit": flow_unit, "method": method}
        try:
            report = set_navigator_flow_unit(
                self.store, journey=self.journey, method=method, flow_unit=flow_unit
            )
        except ValueError as exc:
            self.record("set_flow_unit", input=payload, error=f"{type(exc).__name__}: {exc}")
            return
        # The confirmation surface is CHOSEN by the unit, not fixed: selecting
        # `delivery_story` renders DELIVERY_STORY_SCOPE_CONFIRMATION over the child
        # work items, selecting `story_by_story` renders NEXT_STORY_CONFIRMATION
        # over the recommended story. Both branches are graded below.
        surface_id = (
            "delivery_story_scope_confirmation"
            if report.flow_unit == "delivery_story"
            else "next_story_confirmation"
        )
        self.record(
            "set_flow_unit",
            input=payload,
            surfaces=[(surface_id, render_flow_unit_scope_confirmation_report(report))],
            extra={"flow_unit": report.flow_unit, "source": report.source},
        )

    def inspect_flow_unit(self, *, method: str = "ariad") -> None:
        """The read face: `set-flow-unit` with no `--unit` renders a different card."""
        from memory.builder.flow_unit import inspect_navigator_flow_unit

        payload = {"method": method}
        try:
            report = inspect_navigator_flow_unit(
                self.store, journey=self.journey, method=method
            )
        except ValueError as exc:
            self.record("inspect_flow_unit", input=payload, error=f"{type(exc).__name__}: {exc}")
            return
        self.record(
            "inspect_flow_unit",
            input=payload,
            surfaces=[("navigator_flow_unit", render_navigator_flow_unit_report(report))],
            extra={"flow_unit": report.flow_unit, "source": report.source},
        )

    def plan_delivery_story(
        self,
        *,
        objective: str = "Deliver the aggregate outcome.",
        child_work_items: tuple[str, ...] = (),
        preauthorize: bool = False,
        stop_boundary: str = "navigator_validation",
        artifact: bool = True,
        method: str = "ariad",
    ) -> None:
        payload = {
            "objective": objective,
            "child_work_items": list(child_work_items),
            "preauthorize": preauthorize,
            "stop_boundary": stop_boundary,
            "artifact": artifact,
            "method": method,
        }
        self.plan_path = self._canonical_plan_path() if artifact else None
        try:
            report = plan_delivery_story_checkpoint(
                self.store,
                journey=self.journey,
                method=method,
                objective=objective,
                child_work_items=child_work_items,
                plan_artifact_path=self.plan_path,
                preauthorize=preauthorize,
                stop_boundary=stop_boundary,
            )
        except ValueError as exc:
            self.record(
                "plan_delivery_story", input=payload, error=f"{type(exc).__name__}: {exc}"
            )
            return
        self.plan_report = report
        surfaces = [
            ("delivery_story_plan_checkpoint", render_delivery_story_plan_report(report))
        ]
        if preauthorize:
            surfaces.append(
                (
                    "plan_preauthorization_recorded",
                    render_plan_preauthorization_recorded(report),
                )
            )
        surfaces.append(
            (
                "artifacts_materialized",
                render_artifacts_materialized_surface(
                    context=f"Delivery Story Plan — {report.cursor.active_item or 'active item'}",
                    artifacts=report.materialized_artifacts,
                    project_path=self.project,
                    boundary=(
                        "Plan artifacts were materialized. Implementation remains "
                        "blocked until approval."
                    ),
                ),
            )
        )
        self.record(
            "plan_delivery_story",
            input=payload,
            surfaces=surfaces,
            artifacts=report.materialized_artifacts,
            extra={"status": report.status},
        )

    def approve_delivery_story(
        self, *, use_preauthorization: bool = False, method: str = "ariad"
    ) -> None:
        payload = {"use_preauthorization": use_preauthorization, "method": method}
        plan_path = self._canonical_plan_path()
        try:
            report = approve_delivery_story_plan(
                self.store,
                journey=self.journey,
                method=method,
                plan_artifact_path=plan_path,
                use_preauthorization=use_preauthorization,
            )
        except PlanPreauthorizationMismatch as exc:
            cursor = get_delivery_cursor(self.store, self.journey)
            self.record(
                "approve_delivery_story",
                input=payload,
                surfaces=[
                    (
                        "plan_preauthorization_mismatch",
                        render_plan_preauthorization_mismatch(
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
                "approve_delivery_story", input=payload, error=f"{type(exc).__name__}: {exc}"
            )
            return
        surfaces = [
            ("delivery_story_plan_checkpoint", render_delivery_story_plan_report(report))
        ]
        # `already_approved` returns BEFORE the artifact surface and before
        # IMPLEMENTATION_STARTED: the CLI returns early, so a repeat consumption is
        # one card and nothing else.
        if report.status != "already_approved":
            surfaces.append(
                (
                    "artifacts_materialized",
                    render_artifacts_materialized_surface(
                        context=(
                            "Delivery Story Plan Approval — "
                            f"{report.cursor.active_item or 'active item'}"
                        ),
                        artifacts=report.materialized_artifacts,
                        project_path=self.project,
                        boundary=(
                            "Plan approval artifacts were materialized. Implementation "
                            "may proceed under the approved plan."
                        ),
                    ),
                )
            )
            if report.implementation_started:
                surfaces.append(
                    (
                        "implementation_started",
                        render_delivery_story_implementation_started(report),
                    )
                )
        self.record(
            "approve_delivery_story",
            input=payload,
            surfaces=surfaces,
            artifacts=report.materialized_artifacts
            if report.status != "already_approved"
            else (),
            extra={
                "status": report.status,
                "implementation_started": report.implementation_started,
                "unfilled_sections": list(report.unfilled_sections),
            },
        )

    def cancel_delivery_story_preauthorization(self, *, method: str = "ariad") -> None:
        payload = {"method": method}
        try:
            cursor = cancel_delivery_story_plan_preauthorization(
                self.store, journey=self.journey, method=method
            )
        except ValueError as exc:
            self.record(
                "cancel_delivery_story_preauthorization",
                input=payload,
                error=f"{type(exc).__name__}: {exc}",
            )
            return
        self.record(
            "cancel_delivery_story_preauthorization",
            input=payload,
            surfaces=[
                (
                    "plan_preauthorization_mismatch",
                    render_plan_preauthorization_mismatch(
                        active_item=cursor.active_item, reason="navigator_cancelled"
                    ),
                )
            ],
        )

    def _delivery_story_closure(
        self,
        op: str,
        call: Any,
        payload: dict[str, Any],
        *,
        artifact: str | None,
    ) -> None:
        path = self._closure_artifact_path(artifact)
        existed_before = path.exists() if path else False
        try:
            report = call(path)
        except ValueError as exc:
            self.record(op, input=payload, error=f"{type(exc).__name__}: {exc}")
            return
        kind = op.replace("_delivery_story", "")
        surfaces = [
            (
                "delivery_story_closure_checkpoint",
                render_delivery_story_closure_report(report),
            )
        ]
        artifacts: tuple[MaterializedArtifact, ...] = ()
        if path is not None:
            artifacts = (
                existing_artifact(kind, path)
                if existed_before
                else materialized_artifact(kind, path, existed_before=False),
            )
            surfaces.append(
                (
                    "artifacts_materialized",
                    render_artifacts_materialized_surface(
                        context=(
                            f"Delivery Story {kind.title()} — "
                            f"{report.cursor.active_item or 'active item'}"
                        ),
                        artifacts=artifacts,
                        project_path=self.project,
                        boundary=f"{kind.title()} artifact was materialized.",
                    ),
                )
            )
        self.record(
            op,
            input=payload,
            surfaces=surfaces,
            artifacts=artifacts,
            extra={"status": report.status, "checkpoint": report.checkpoint},
        )

    def validate_delivery_story(
        self,
        *,
        summary: str = "Aggregate validation evidence.",
        navigator_accepted: bool = False,
        artifact: str | None = "validation.md",
        method: str = "ariad",
    ) -> None:
        self._delivery_story_closure(
            "validate_delivery_story",
            lambda path: validate_delivery_story(
                self.store,
                journey=self.journey,
                method=method,
                summary=summary,
                navigator_accepted=navigator_accepted,
                artifact_path=path,
            ),
            {
                "summary": summary,
                "navigator_accepted": navigator_accepted,
                "artifact": artifact,
                "method": method,
            },
            artifact=artifact,
        )

    def review_delivery_story(
        self,
        *,
        decision: str = "no_action",
        summary: str = "No debt found.",
        artifact: str | None = "review.md",
        method: str = "ariad",
    ) -> None:
        self._delivery_story_closure(
            "review_delivery_story",
            lambda path: review_delivery_story(
                self.store,
                journey=self.journey,
                method=method,
                decision=decision,
                summary=summary,
                artifact_path=path,
            ),
            {
                "decision": decision,
                "summary": summary,
                "artifact": artifact,
                "method": method,
            },
            artifact=artifact,
        )

    def coherence_delivery_story(
        self,
        *,
        summary: str = "Process, project, and product align.",
        artifact: str | None = "coherence.md",
        method: str = "ariad",
    ) -> None:
        self._delivery_story_closure(
            "coherence_delivery_story",
            lambda path: coherence_delivery_story(
                self.store,
                journey=self.journey,
                method=method,
                summary=summary,
                artifact_path=path,
            ),
            {"summary": summary, "artifact": artifact, "method": method},
            artifact=artifact,
        )

    def done_delivery_story(
        self,
        *,
        summary: str = "Aggregate closure recorded.",
        artifact: str | None = "done.md",
        method: str = "ariad",
    ) -> None:
        self._delivery_story_closure(
            "done_delivery_story",
            lambda path: done_delivery_story(
                self.store,
                journey=self.journey,
                method=method,
                summary=summary,
                artifact_path=path,
            ),
            {"summary": summary, "artifact": artifact, "method": method},
            artifact=artifact,
        )

    def authored_closure(self) -> None:
        """The read-only DS Done preflight, graded as its own step.

        `inspect_authored_closure` lives in the CLI's Done path, not in the closure
        module, so the aggregate corpus grades it directly: it is a pure read over
        the Navigator's authored roadmap, and its refusals are the safety property
        the whole plateau turns on. The command corpus grades the composition --
        the `; ` join, the exit code, and where the guard sits relative to the
        cursor guards.

        Its issue strings are already project-relative (`_relative`), so they are
        recorded as-is; `scrub` still runs over the ambiguity case, which embeds
        absolute claimant paths.
        """
        cursor = get_delivery_cursor(self.store, self.journey)
        payload = {
            "delivery_story": cursor.active_item if cursor else None,
            "child_work_items": list(cursor.child_work_items) if cursor else [],
        }
        try:
            report = inspect_authored_closure(
                self.project,
                delivery_story=(cursor.active_item if cursor else "") or "",
                child_work_items=cursor.child_work_items if cursor else (),
            )
        except (StoryPackageAmbiguityError, ValueError) as exc:
            self.record(
                "authored_closure", input=payload, error=f"{type(exc).__name__}: {exc}"
            )
            return
        self.record(
            "authored_closure",
            input=payload,
            extra={
                "authored_ready": report.ready,
                "authored_issues": [self.scrub(issue) for issue in report.issues],
            },
        )

    # -- closure operations (plateau 4) --------------------------------------
    #
    # All four write their artifact UNCONDITIONALLY -- no `if not path.exists()`,
    # unlike Plan's story package. That is CR079: `validate-item` has already
    # replaced a 235-line authored `validation.md` with a 33-line scaffold twice in
    # this project's history. The corpus REPRODUCES it, deliberately, because
    # reproducing current behavior is the port's job and changing it is the CR's.
    # `closure_overwrites_authored_artifacts` exists so a future session cannot
    # "fix" it inside the port and diverge silently.

    def validate(
        self,
        *,
        automated_checks: tuple[str, ...] = (),
        checks_status: str = "not_run",
        e2e_decision: str = "not_required",
        e2e_evidence: str | None = None,
        navigator_validation_route: str | None = None,
        navigator_accepted: bool = False,
        expected_observation: str | None = None,
        pass_condition: str | None = None,
        fail_condition: str | None = None,
        implementation_complete: bool = False,
        artifact: str | None = "validation.md",
    ) -> None:
        payload = {
            "automated_checks": list(automated_checks),
            "checks_status": checks_status,
            "e2e_decision": e2e_decision,
            "e2e_evidence": e2e_evidence,
            "navigator_validation_route": navigator_validation_route,
            "navigator_accepted": navigator_accepted,
            "expected_observation": expected_observation,
            "pass_condition": pass_condition,
            "fail_condition": fail_condition,
            "implementation_complete": implementation_complete,
            "artifact": artifact,
        }
        path = self._closure_artifact_path(artifact)
        try:
            report = validate_lifecycle_item(
                self.store,
                journey=self.journey,
                method=get_ariad_method(),
                automated_checks=automated_checks,
                checks_status=checks_status,
                e2e_decision=e2e_decision,
                e2e_evidence=e2e_evidence,
                navigator_validation_route=navigator_validation_route,
                navigator_accepted=navigator_accepted,
                expected_observation=expected_observation,
                pass_condition=pass_condition,
                fail_condition=fail_condition,
                implementation_complete=implementation_complete,
                validation_artifact_path=path,
            )
        except ValueError as exc:
            self.record("validate", input=payload, error=f"{type(exc).__name__}: {exc}")
            return
        self.record(
            "validate",
            input=payload,
            surfaces=[("validation_checkpoint", render_validation_checkpoint(report))],
            extra={"missing_evidence": list(report.missing_evidence)},
        )

    def review(
        self,
        *,
        debt_findings: tuple[str, ...] = (),
        debt_decision: str = "pending",
        defer_reason: str | None = None,
        revisit_trigger: str | None = None,
        artifact: str | None = "review.md",
    ) -> None:
        payload = {
            "debt_findings": list(debt_findings),
            "debt_decision": debt_decision,
            "defer_reason": defer_reason,
            "revisit_trigger": revisit_trigger,
            "artifact": artifact,
        }
        path = self._closure_artifact_path(artifact)
        try:
            report = review_lifecycle_item(
                self.store,
                journey=self.journey,
                method=get_ariad_method(),
                debt_findings=debt_findings,
                debt_decision=debt_decision,
                defer_reason=defer_reason,
                revisit_trigger=revisit_trigger,
                review_artifact_path=path,
            )
        except ValueError as exc:
            self.record("review", input=payload, error=f"{type(exc).__name__}: {exc}")
            return
        self.record(
            "review",
            input=payload,
            surfaces=[("debt_review_checkpoint", render_review_checkpoint(report))],
            extra={"missing_decision": list(report.missing_decision)},
        )

    def coherence(
        self,
        *,
        process_alignment: str | None = None,
        project_alignment: str | None = None,
        product_alignment: str | None = None,
        local_differences: tuple[str, ...] = (),
        artifact: str | None = "coherence.md",
    ) -> None:
        payload = {
            "process_alignment": process_alignment,
            "project_alignment": project_alignment,
            "product_alignment": product_alignment,
            "local_differences": list(local_differences),
            "artifact": artifact,
        }
        path = self._closure_artifact_path(artifact)
        try:
            report = coherence_lifecycle_item(
                self.store,
                journey=self.journey,
                method=get_ariad_method(),
                process_alignment=process_alignment,
                project_alignment=project_alignment,
                product_alignment=product_alignment,
                local_differences=local_differences,
                coherence_artifact_path=path,
            )
        except ValueError as exc:
            self.record("coherence", input=payload, error=f"{type(exc).__name__}: {exc}")
            return
        self.record(
            "coherence",
            input=payload,
            surfaces=[("coherence_checkpoint", render_coherence_checkpoint(report))],
            extra={"missing_coherence": list(report.missing_coherence)},
        )

    def done(
        self,
        *,
        history_action: str | None = None,
        roadmap_update: str | None = None,
        next_recommendation: str | None = None,
        artifact: str | None = "done.md",
    ) -> None:
        payload = {
            "history_action": history_action,
            "roadmap_update": roadmap_update,
            "next_recommendation": next_recommendation,
            "artifact": artifact,
        }
        path = self._closure_artifact_path(artifact)
        try:
            report = done_lifecycle_item(
                self.store,
                journey=self.journey,
                method=get_ariad_method(),
                history_action=history_action,
                roadmap_update=roadmap_update,
                next_recommendation=next_recommendation,
                done_artifact_path=path,
            )
        except ValueError as exc:
            self.record("done", input=payload, error=f"{type(exc).__name__}: {exc}")
            return
        self.record(
            "done",
            input=payload,
            surfaces=[("done_checkpoint", render_done_checkpoint(report))],
            extra={"missing_done": list(report.missing_done)},
        )

    def _closure_artifact_path(self, filename: str | None):
        """The CLI's `_checkpoint_artifact_path`, rendered relative like Plan's.

        Same reason as `_canonical_plan_path`: the closure surfaces print the path
        they were handed, so a repo-relative one keeps the golden machine-independent.
        """
        if filename is None:
            return None
        cursor = get_delivery_cursor(self.store, self.journey)
        active_item = getattr(cursor, "active_item", None)
        if cursor is None or not active_item:
            return None
        resolved = resolve_story_directory(self.project, str(active_item))
        if resolved is None:
            resolved = create_story_directory(
                self.project, str(active_item), cursor.active_item_title or str(active_item)
            )
        return _repo_relative(resolved) / filename

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

    slashed_children = ds_scenario("expand_slugs_the_full_child_title", SLASHED_CHILD_DS_INDEX)
    slashed_children.expand()
    scenarios.append(slashed_children.finish())

    # The other half of the asymmetry: with no authored package, the DS's own title
    # is routed through `title_leaf`, so only the tail reaches the synthetic child's
    # folder and its rendered heading.
    slashed_delivery_story = Scenario("expand_fallback_uses_the_delivery_story_title_leaf")
    slashed_delivery_story.seed_cursor(
        method="ariad",
        active_item="DS-77",
        active_item_title="Delivery / Application & Admin Parity",
        active_item_level="delivery_story",
    )
    slashed_delivery_story.expand()
    scenarios.append(slashed_delivery_story.finish())

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
    missing_plan.delete_file(plan_relative)
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


def _repo_docs_fingerprint() -> frozenset[str]:
    """Every path under the REPOSITORY's own roadmap, so pollution is detectable.

    The command generator grew this guard after a scenario there seeded an empty
    project path, `Path("")` resolved to the process cwd, and `pull-item`
    materialized a fabricated package inside this repository's real roadmap. This
    generator resolves story directories under its own temp project and so has no
    known route to the same defect -- which is exactly what was believed about the
    other generator. CR065's record is that this class has appeared five times
    across four stories and was caught by hand or by CI every time, so the guard is
    cheap insurance rather than a response to a specific bug.
    """
    roadmap = Path.cwd() / "docs" / "project" / "roadmap"
    if not roadmap.is_dir():
        return frozenset()
    return frozenset(str(path.relative_to(roadmap)) for path in roadmap.rglob("*"))



def _closure_scenarios() -> list[dict[str, Any]]:
    """Scope D: Validate, Debt Review, Coherence, Done.

    Taken from the eighteen closure tests in `tests/unit/memory/cli/test_build.py`
    plus `test_validation_accepts_approved_delivery_story_plan_with_implementation_evidence`.

    The shape that dominates this scope is the PENDING/COMPLETE fork: each verb
    computes its own missing-evidence tuple, and that tuple decides three cursor
    fields at once (`active_checkpoint`, `pending_confirmation`,
    `last_delivery_event`). Two of the verbs then allow EXACT-STATE RE-ENTRY to
    answer their own pending confirmation, and one does not -- Done refuses any
    pending confirmation, including the ones its predecessors left behind.
    """
    scenarios: list[dict[str, Any]] = []

    def approved(name: str, **cursor: Any) -> Scenario:
        """A story sitting at `plan_approved`, the state closure starts from."""
        scenario = Scenario(name)
        scenario.seed_cursor(
            method="ariad",
            active_item=cursor.pop("active_item", "CV1.DS1.US1"),
            active_item_title="Closure story",
            active_item_level="user_story",
            last_delivery_event=cursor.pop("last_delivery_event", "plan_approved"),
            navigator_flow_unit="story_by_story",
            **cursor,
        )
        return scenario

    def full_validation(scenario: Scenario) -> None:
        scenario.validate(
            automated_checks=("uv run pytest -q", "npm test"),
            checks_status="passed",
            e2e_decision="not_required",
            navigator_validation_route="Run the command and read the surface.",
            navigator_accepted=True,
            expected_observation="The surface renders.",
            pass_condition="Bytes match the oracle.",
            fail_condition="Any byte differs.",
            implementation_complete=True,
        )

    # The whole closure chain, artifacts and all.
    happy = approved("closure_happy_path")
    full_validation(happy)
    happy.review(debt_findings=("No debt found.",), debt_decision="no_action")
    happy.coherence(
        process_alignment="Ariad lifecycle followed.",
        project_alignment="Docs and roadmap updated.",
        product_alignment="Behavior matches the accepted evidence.",
    )
    happy.done(
        history_action="One commit, scoped to the story.",
        roadmap_update="Story package marked done.",
        next_recommendation="Pull the next story.",
    )
    scenarios.append(happy.finish())

    # Done accepts `review_complete` DIRECTLY: Coherence is not a precondition, only
    # an option. A port that requires `coherence_complete` blocks a legal closure.
    skip_coherence = approved("done_directly_after_review_complete")
    full_validation(skip_coherence)
    skip_coherence.review(debt_decision="no_action")
    skip_coherence.done(
        history_action="Committed.",
        roadmap_update="Roadmap updated.",
        next_recommendation="Next pull.",
    )
    scenarios.append(skip_coherence.finish())

    # Validation's pending fork, then the acceptance that resolves it.
    pending = approved("validate_pending_then_accepted")
    pending.validate(implementation_complete=True)
    pending.validate(
        automated_checks=("uv run pytest -q",),
        checks_status="passed",
        navigator_validation_route="Navigator ran it.",
        navigator_accepted=True,
        implementation_complete=True,
    )
    scenarios.append(pending.finish())

    # Every missing-evidence branch of `_validation_missing_evidence`, one per case.
    for name, kwargs in (
        ("validate_missing_checks", {"implementation_complete": True}),
        (
            "validate_checks_failed",
            {"automated_checks": ("pytest",), "checks_status": "failed", "implementation_complete": True},
        ),
        (
            "validate_e2e_required_without_evidence",
            {
                "automated_checks": ("pytest",),
                "checks_status": "passed",
                "e2e_decision": "required",
                "navigator_accepted": True,
                "implementation_complete": True,
            },
        ),
        (
            "validate_e2e_skipped_without_reason",
            {
                "automated_checks": ("pytest",),
                "checks_status": "passed",
                "e2e_decision": "skipped",
                "navigator_accepted": True,
                "implementation_complete": True,
            },
        ),
        (
            "validate_route_present_but_not_accepted",
            {
                "automated_checks": ("pytest",),
                "checks_status": "passed",
                "navigator_validation_route": "Navigator runs the command.",
                "implementation_complete": True,
            },
        ),
    ):
        scenario = approved(name)
        scenario.validate(**kwargs)
        scenarios.append(scenario.finish())

    # A BLANK route reports only the route, never the acceptance alongside it: the
    # two live in one `if/elif`, and the default route is non-empty, so the first
    # branch is unreachable unless a caller passes whitespace. Added after mutation
    # testing showed the `elif` was unguarded -- turning it into a second `if`
    # survived the whole corpus.
    blank_route = approved("validate_blank_route_reports_only_the_route")
    blank_route.validate(
        automated_checks=("pytest",),
        checks_status="passed",
        navigator_validation_route="   ",
        navigator_accepted=False,
        implementation_complete=True,
    )
    scenarios.append(blank_route.finish())

    # Class B refusals: the choice vocabularies, and the guard chain.
    for name, kwargs in (
        ("validate_rejects_unknown_checks_status", {"checks_status": "green"}),
        ("validate_rejects_unknown_e2e_decision", {"e2e_decision": "maybe"}),
    ):
        scenario = approved(name)
        scenario.validate(implementation_complete=True, **kwargs)
        scenarios.append(scenario.finish())

    no_implementation = approved("validate_blocks_without_implementation_completion")
    no_implementation.validate(
        automated_checks=("pytest",), checks_status="passed", navigator_accepted=True
    )
    scenarios.append(no_implementation.finish())

    wrong_event = approved("validate_requires_approved_plan", last_delivery_event="prepare")
    wrong_event.validate(implementation_complete=True)
    scenarios.append(wrong_event.finish())

    foreign_pending = approved("validate_blocked_by_foreign_pending_confirmation")
    foreign_pending.seed_cursor(
        method="ariad",
        active_item="CV1.DS1.US1",
        active_item_title="Closure story",
        active_item_level="user_story",
        active_checkpoint="after_plan",
        pending_confirmation="navigator_approval",
        last_delivery_event="plan_approved",
    )
    foreign_pending.validate(implementation_complete=True)
    scenarios.append(foreign_pending.finish())

    validate_no_cursor = Scenario("validate_requires_existing_cursor")
    validate_no_cursor.validate(implementation_complete=True)
    scenarios.append(validate_no_cursor.finish())

    validate_no_item = Scenario("validate_requires_active_item")
    validate_no_item.seed_cursor(method="ariad", last_delivery_event="plan_approved")
    validate_no_item.validate(implementation_complete=True)
    scenarios.append(validate_no_item.finish())

    # A Delivery Story's approved aggregate Plan also satisfies Validation.
    ds_plan = Scenario("validate_accepts_approved_delivery_story_plan")
    ds_plan.seed_cursor(
        method="ariad",
        active_item="CV1.DS1",
        active_item_title="Aggregate delivery story",
        active_item_level="delivery_story",
        last_delivery_event="delivery_story_plan_approved",
        navigator_flow_unit="delivery_story",
        aggregate_checkpoint_status=("plan:approved",),
    )
    ds_plan.validate(
        automated_checks=("pytest",),
        checks_status="passed",
        navigator_validation_route="Navigator validated the DS.",
        navigator_accepted=True,
        implementation_complete=True,
    )
    scenarios.append(ds_plan.finish())

    # Debt Review: the pending decision, its re-entry, and the two decisions that
    # cannot complete.
    review_pending = approved("review_pending_then_answered")
    full_validation(review_pending)
    review_pending.review(debt_findings=("One deferred item.",))
    review_pending.review(debt_findings=("One deferred item.",), debt_decision="no_action")
    scenarios.append(review_pending.finish())

    review_reentry_pending = approved("review_reentry_with_pending_stays_pending")
    full_validation(review_reentry_pending)
    review_reentry_pending.review()
    review_reentry_pending.review()
    scenarios.append(review_reentry_pending.finish())

    review_defer = approved("review_defer_without_reason_or_trigger")
    full_validation(review_defer)
    review_defer.review(debt_decision="defer")
    scenarios.append(review_defer.finish())

    review_defer_complete = approved("review_defer_with_reason_and_trigger")
    full_validation(review_defer_complete)
    review_defer_complete.review(
        debt_findings=("Allowlist staleness.",),
        debt_decision="defer",
        defer_reason="Out of this story's scope.",
        revisit_trigger="When the last gated leaf lands.",
    )
    scenarios.append(review_defer_complete.finish())

    review_pay_now = approved("review_pay_now_routes_through_refactor")
    full_validation(review_pay_now)
    review_pay_now.review(debt_decision="pay_now")
    scenarios.append(review_pay_now.finish())

    review_foreign = approved("review_blocked_by_foreign_pending_confirmation")
    review_foreign.validate(implementation_complete=True)
    review_foreign.review(debt_decision="no_action")
    scenarios.append(review_foreign.finish())

    review_early = approved("review_requires_validation_passed")
    review_early.review(debt_decision="no_action")
    scenarios.append(review_early.finish())

    # Coherence: complete, re-entry after correcting evidence, and its refusals.
    coherence_pending = approved("coherence_pending_then_corrected")
    full_validation(coherence_pending)
    coherence_pending.review(debt_decision="no_action")
    coherence_pending.coherence(process_alignment="   ", project_alignment="Docs updated.")
    coherence_pending.coherence(
        process_alignment="Lifecycle followed.",
        project_alignment="Docs updated.",
        product_alignment="Behavior matches.",
    )
    scenarios.append(coherence_pending.finish())

    coherence_differences = approved("coherence_records_local_differences")
    full_validation(coherence_differences)
    coherence_differences.review(debt_decision="no_action")
    coherence_differences.coherence(
        process_alignment="Followed.",
        project_alignment="Updated.",
        product_alignment="Matches.",
        local_differences=("Python still owns the publisher.", "  ", "Gate defaults off."),
    )
    scenarios.append(coherence_differences.finish())

    coherence_early = approved("coherence_requires_review_complete")
    coherence_early.coherence(
        process_alignment="Followed.", project_alignment="Updated.", product_alignment="Matches."
    )
    scenarios.append(coherence_early.finish())

    coherence_foreign = approved("coherence_blocked_by_unrelated_pending")
    coherence_foreign.validate(implementation_complete=True)
    coherence_foreign.coherence(
        process_alignment="Followed.", project_alignment="Updated.", product_alignment="Matches."
    )
    scenarios.append(coherence_foreign.finish())

    # Done: its pending fork, and the pending confirmations it refuses.
    done_pending = approved("done_pending_then_completed")
    full_validation(done_pending)
    done_pending.review(debt_decision="no_action")
    done_pending.coherence(
        process_alignment="Followed.", project_alignment="Updated.", product_alignment="Matches."
    )
    done_pending.done(history_action="  ")
    scenarios.append(done_pending.finish())

    done_blocked = approved("done_blocks_pending_coherence_confirmation")
    full_validation(done_blocked)
    done_blocked.review(debt_decision="no_action")
    done_blocked.coherence(process_alignment="   ")
    done_blocked.done(
        history_action="Committed.", roadmap_update="Updated.", next_recommendation="Next."
    )
    scenarios.append(done_blocked.finish())

    done_early = approved("done_requires_review_complete")
    done_early.done(
        history_action="Committed.", roadmap_update="Updated.", next_recommendation="Next."
    )
    scenarios.append(done_early.finish())

    # CR079, pinned. Every closure verb replaces an authored artifact, and the files
    # in this sequence are the evidence. Reproduced on purpose: the overwrite is
    # current Python behavior, the CR owns changing it, and a port that "fixes" it
    # here would diverge silently.
    authored = approved("closure_overwrites_authored_artifacts")
    package = "docs/project/roadmap/cv1/cv1-ds1/cv1-ds1-us1-closure-story"
    for filename in ("validation.md", "review.md", "coherence.md", "done.md"):
        authored.write_file(
            f"{package}/{filename}",
            f"# Authored {filename}\n\nHand-written evidence that Python replaces.\n",
        )
    full_validation(authored)
    authored.review(debt_decision="no_action")
    authored.coherence(
        process_alignment="Followed.", project_alignment="Updated.", product_alignment="Matches."
    )
    authored.done(
        history_action="Committed.", roadmap_update="Updated.", next_recommendation="Next."
    )
    scenarios.append(authored.finish())

    # No artifact path at all: the surfaces must render their "not written" shapes
    # rather than failing.
    no_artifacts = approved("closure_without_artifact_paths")
    no_artifacts.validate(
        automated_checks=("pytest",),
        checks_status="passed",
        navigator_validation_route="Navigator ran it.",
        navigator_accepted=True,
        implementation_complete=True,
        artifact=None,
    )
    no_artifacts.review(debt_decision="no_action", artifact=None)
    no_artifacts.coherence(
        process_alignment="Followed.",
        project_alignment="Updated.",
        product_alignment="Matches.",
        artifact=None,
    )
    no_artifacts.done(
        history_action="Committed.",
        roadmap_update="Updated.",
        next_recommendation="Next.",
        artifact=None,
    )
    scenarios.append(no_artifacts.finish())

    return scenarios


# ---------------------------------------------------------------------------
# Delivery Story scenarios (plateau 5, Scope E)
# ---------------------------------------------------------------------------

# A Delivery Story package whose authored statuses are all Done, plus the two
# child packages the preflight insists on. Written by the scenarios that need the
# preflight to PASS; every other preflight scenario mutates one line of it, so the
# difference between ready and refused is one authored word.
DS_PACKAGE_INDEX = """# CV1.DS1 — Aggregate delivery

**Status:** ✅ Done
**Type:** Delivery Story

## Candidate Stories

| Code | Story | Type | Status |
|------|-------|------|--------|
| CV1.DS1.US1 | First child | User Story | ✅ Done |
| CV1.DS1.TS1 | Second child | Technical Story | ✅ Done |

## Done Condition

Done when the children deliver a coherent outcome.
"""

DS_CHILD_INDEX = """# {code} — {title}

**Status:** {status}
**Type:** {kind}
"""

DS_CHILDREN = ("CV1.DS1.US1", "CV1.DS1.TS1")


def _delivery_story_project(scenario: Scenario, *, ds_status: str = "✅ Done",
                           child_statuses: tuple[str, str] = ("✅ Done", "✅ Done"),
                           table_statuses: tuple[str, str] | None = None) -> None:
    """Author a Delivery Story package with its two children, statuses as given."""
    index = DS_PACKAGE_INDEX.replace("**Status:** ✅ Done", f"**Status:** {ds_status}", 1)
    if table_statuses is not None:
        index = index.replace(
            "| CV1.DS1.US1 | First child | User Story | ✅ Done |",
            f"| CV1.DS1.US1 | First child | User Story | {table_statuses[0]} |",
        ).replace(
            "| CV1.DS1.TS1 | Second child | Technical Story | ✅ Done |",
            f"| CV1.DS1.TS1 | Second child | Technical Story | {table_statuses[1]} |",
        )
    scenario.write_file("docs/project/roadmap/index.md", "# Roadmap\n")
    scenario.write_file("docs/project/roadmap/cv1-first/index.md", "# CV1 — First value\n")
    scenario.write_file("docs/project/roadmap/cv1-first/cv1-ds1-aggregate/index.md", index)
    for (code, title, kind), status in zip(
        (
            ("CV1.DS1.US1", "First child", "User Story"),
            ("CV1.DS1.TS1", "Second child", "Technical Story"),
        ),
        child_statuses,
        strict=True,
    ):
        slug = code.lower().replace(".", "-")
        scenario.write_file(
            f"docs/project/roadmap/cv1-first/cv1-ds1-aggregate/{slug}-child/index.md",
            DS_CHILD_INDEX.format(code=code, title=title, status=status, kind=kind),
        )


def _delivery_story_ready(name: str, *, preauthorize: bool = False) -> Scenario:
    """A journey sitting at an approved Delivery Story Plan, authored roadmap Done."""
    scenario = Scenario(name)
    _delivery_story_project(scenario)
    scenario.seed_cursor(
        method="ariad",
        active_item="CV1.DS1",
        active_item_title="Aggregate delivery",
        active_item_level="delivery_story",
        last_delivery_event="prepare",
        navigator_flow_unit="delivery_story",
        child_work_items=DS_CHILDREN,
    )
    scenario.plan_delivery_story(
        objective="Deliver both children as one coherent outcome.",
        child_work_items=DS_CHILDREN,
        preauthorize=preauthorize,
    )
    if not preauthorize:
        scenario.approve_delivery_story()
    return scenario


def _delivery_story_scenarios() -> list[dict[str, Any]]:
    scenarios: list[dict[str, Any]] = []

    # The whole aggregate journey, from choosing the flow unit to Done.
    happy = Scenario("delivery_story_flow_happy_path")
    _delivery_story_project(happy)
    happy.seed_cursor(
        method="ariad",
        active_item="CV1.DS1",
        active_item_title="Aggregate delivery",
        active_item_level="delivery_story",
        last_delivery_event="prepare",
        child_work_items=DS_CHILDREN,
    )
    happy.inspect_flow_unit()
    happy.set_flow_unit(flow_unit="delivery_story")
    happy.plan_delivery_story(
        objective="Deliver both children as one coherent outcome.",
        child_work_items=DS_CHILDREN,
    )
    happy.approve_delivery_story()
    happy.validate_delivery_story(navigator_accepted=True)
    happy.review_delivery_story(decision="no_action")
    happy.coherence_delivery_story()
    happy.authored_closure()
    happy.done_delivery_story()
    scenarios.append(happy.finish())

    # The flow unit's own faces: the default read, both set branches, and the
    # refusals. `story_by_story` renders a different surface over a different scope
    # list, so selecting it is not "the same card with another word".
    flow = Scenario("navigator_flow_unit_faces")
    _delivery_story_project(flow)
    flow.set_flow_unit(flow_unit="delivery_story")
    flow.seed_cursor(
        method="ariad",
        active_item="CV1.DS1",
        active_item_title="Aggregate delivery",
        active_item_level="delivery_story",
        last_delivery_event="prepare",
        child_work_items=DS_CHILDREN,
    )
    flow.inspect_flow_unit()
    flow.set_flow_unit(flow_unit="delivery_story")
    flow.inspect_flow_unit()
    flow.set_flow_unit(flow_unit="story_by_story")
    flow.set_flow_unit(flow_unit="epic")
    scenarios.append(flow.finish())

    # Validation that the Navigator has NOT accepted leaves a pending confirmation,
    # and a second call replaces the status rather than appending a duplicate.
    pending = _delivery_story_ready("delivery_story_validation_pending_then_accepted")
    pending.validate_delivery_story(navigator_accepted=False)
    pending.validate_delivery_story(navigator_accepted=True)
    scenarios.append(pending.finish())

    # The order case the panel asked for: re-validating AFTER the debt review moves
    # `validation:passed` to the END of `aggregate_checkpoint_status`. The set is
    # unchanged and the bytes are not, and the cursor's compare-and-swap matches on
    # bytes -- so an in-place replace passes every set-wise assertion and breaks the
    # revert.
    reorder = _delivery_story_ready("delivery_story_revalidation_reorders_status")
    reorder.validate_delivery_story(navigator_accepted=True)
    reorder.review_delivery_story(decision="no_action")
    reorder.validate_delivery_story(navigator_accepted=True)
    scenarios.append(reorder.finish())

    # Aggregate closure refusals, each seeded at the state whose guard it tests.
    unapproved = Scenario("delivery_story_closure_refuses_without_plan_approved")
    _delivery_story_project(unapproved)
    unapproved.seed_cursor(
        method="ariad",
        active_item="CV1.DS1",
        active_item_title="Aggregate delivery",
        active_item_level="delivery_story",
        last_delivery_event="prepare",
        navigator_flow_unit="delivery_story",
        child_work_items=DS_CHILDREN,
    )
    unapproved.validate_delivery_story(navigator_accepted=True)
    unapproved.review_delivery_story()
    unapproved.coherence_delivery_story()
    unapproved.done_delivery_story()
    scenarios.append(unapproved.finish())

    # Done accepts a `review:*` status DIRECTLY -- Coherence is an option at DS
    # level too, exactly as at story level.
    skip_coherence = _delivery_story_ready("delivery_story_done_accepts_review_directly")
    skip_coherence.validate_delivery_story(navigator_accepted=True)
    skip_coherence.review_delivery_story(decision="defer")
    skip_coherence.done_delivery_story()
    scenarios.append(skip_coherence.finish())

    # Every DS verb refuses under story_by_story, which is the default when the
    # Navigator never chose. The flow unit is the gate, not the item level.
    story_flow = Scenario("delivery_story_verbs_refuse_under_story_by_story")
    _delivery_story_project(story_flow)
    story_flow.seed_cursor(
        method="ariad",
        active_item="CV1.DS1",
        active_item_title="Aggregate delivery",
        active_item_level="delivery_story",
        last_delivery_event="prepare",
        navigator_flow_unit="story_by_story",
        child_work_items=DS_CHILDREN,
    )
    story_flow.plan_delivery_story(child_work_items=DS_CHILDREN)
    story_flow.validate_delivery_story(navigator_accepted=True)
    story_flow.review_delivery_story()
    story_flow.coherence_delivery_story()
    story_flow.done_delivery_story()
    scenarios.append(story_flow.finish())

    # Wrong level, no children, empty objective: the three Plan guards in order.
    plan_guards = Scenario("delivery_story_plan_guards")
    _delivery_story_project(plan_guards)
    plan_guards.seed_cursor(
        method="ariad",
        active_item="CV1.DS1.US1",
        active_item_title="First child",
        active_item_level="user_story",
        last_delivery_event="prepare",
        navigator_flow_unit="delivery_story",
    )
    plan_guards.plan_delivery_story(child_work_items=DS_CHILDREN)
    plan_guards.seed_cursor(
        method="ariad",
        active_item="CV1.DS1",
        active_item_title="Aggregate delivery",
        active_item_level="delivery_story",
        last_delivery_event="prepare",
        navigator_flow_unit="delivery_story",
    )
    plan_guards.plan_delivery_story(child_work_items=())
    plan_guards.plan_delivery_story(objective="   ", child_work_items=DS_CHILDREN)
    scenarios.append(plan_guards.finish())

    # The preservation rule at DS level. `_write_delivery_story_package`'s docstring
    # says `plan.md` is "upserted on every call"; the CODE preserves it in both
    # branches. The corpus pins the code -- an authored plan survives Plan AND
    # approval -- so a port that believes the docstring fails here.
    authored = Scenario("delivery_story_plan_preserves_authored_plan")
    _delivery_story_project(authored)
    authored.write_file(
        "docs/project/roadmap/cv1-first/cv1-ds1-aggregate/plan.md",
        AUTHORED_PLAN,
    )
    authored.seed_cursor(
        method="ariad",
        active_item="CV1.DS1",
        active_item_title="Aggregate delivery",
        active_item_level="delivery_story",
        last_delivery_event="prepare",
        navigator_flow_unit="delivery_story",
        child_work_items=DS_CHILDREN,
    )
    authored.plan_delivery_story(child_work_items=DS_CHILDREN)
    authored.approve_delivery_story()
    scenarios.append(authored.finish())

    # DS-level conditional authority: recorded, then consumed under CAS, then a
    # repeat that must report `already_approved` and materialize nothing.
    consumed = _delivery_story_ready(
        "delivery_story_preauthorization_consumed", preauthorize=True
    )
    consumed.write_file(
        "docs/project/roadmap/cv1-first/cv1-ds1-aggregate/plan.md", COMPLETE_PLAN
    )
    consumed.approve_delivery_story(use_preauthorization=True)
    consumed.approve_delivery_story(use_preauthorization=True)
    scenarios.append(consumed.finish())

    # An unfilled Plan is a mismatch, not an approval: the receipt is invalidated
    # and the ordinary gate survives.
    unfilled = _delivery_story_ready(
        "delivery_story_preauthorization_refuses_unfilled_plan", preauthorize=True
    )
    unfilled.approve_delivery_story(use_preauthorization=True)
    scenarios.append(unfilled.finish())

    # Navigator withdrawal: cancel leaves the ordinary gate in place, and a second
    # cancel has nothing to cancel.
    cancelled = _delivery_story_ready(
        "delivery_story_preauthorization_cancelled", preauthorize=True
    )
    cancelled.cancel_delivery_story_preauthorization()
    cancelled.cancel_delivery_story_preauthorization()
    cancelled.approve_delivery_story()
    scenarios.append(cancelled.finish())

    # Ordinary approval over a pending receipt invalidates it with its own reason,
    # rather than leaving authority alive after the gate it was meant to bypass.
    ordinary = _delivery_story_ready(
        "delivery_story_ordinary_approval_invalidates_receipt", preauthorize=True
    )
    ordinary.approve_delivery_story()
    scenarios.append(ordinary.finish())

    scenarios.extend(_authored_closure_scenarios())
    return scenarios


def _authored_closure_scenarios() -> list[dict[str, Any]]:
    """The DS Done preflight: the first Builder guard that reads authored content.

    Each scenario changes ONE authored word from the ready case, so the corpus says
    precisely which evidence blocks a close.
    """
    scenarios: list[dict[str, Any]] = []

    def preflight(name: str, **project: Any) -> Scenario:
        scenario = Scenario(name)
        _delivery_story_project(scenario, **project)
        scenario.seed_cursor(
            method="ariad",
            active_item="CV1.DS1",
            active_item_title="Aggregate delivery",
            active_item_level="delivery_story",
            last_delivery_event="delivery_story_review_complete",
            navigator_flow_unit="delivery_story",
            child_work_items=DS_CHILDREN,
            aggregate_checkpoint_status=(
                "plan:approved",
                "validation:passed",
                "debt_review:review:no_action",
            ),
        )
        scenario.authored_closure()
        return scenario

    scenarios.append(preflight("authored_closure_ready").finish())
    # The runtime's own DS scaffold writes `🟡 Planned`, so a Delivery Story planned
    # by Ariad refuses its own Done until a human edits the status. That is the
    # intended asymmetry: Python verifies explicit evidence and never invents
    # project meaning.
    scenarios.append(
        preflight("authored_closure_refuses_planned_delivery_story", ds_status="🟡 Planned")
        .finish()
    )
    scenarios.append(
        preflight(
            "authored_closure_refuses_unfinished_child",
            child_statuses=("✅ Done", "🟡 Planned"),
        ).finish()
    )
    scenarios.append(
        preflight(
            "authored_closure_refuses_table_row",
            table_statuses=("✅ Done", "🔵 In Progress"),
        ).finish()
    )

    # `_is_done` is `casefold().endswith("done")`, so a plain `Done`, a glyph-led
    # `✅ Done`, and a dated `✅ Done (2026-09-14)` are NOT the same answer: the
    # last one does not end with "done" and blocks.
    scenarios.append(
        preflight(
            "authored_closure_status_suffix_rule",
            ds_status="Done",
            child_statuses=("✅ DONE", "✅ Done (2026-09-14)"),
        ).finish()
    )

    # The `legacy/` case (panel, engineer). `roadmapScan` is "sorted rglob MINUS
    # legacy/"; the preflight has no such exclusion, so an ARCHIVED table row for a
    # known code blocks Done. A port that reuses the scanner passes every other
    # scenario here and fails this one -- which is the whole point of it existing.
    legacy = preflight("authored_closure_reads_legacy_rows")
    legacy.write_file(
        "docs/project/roadmap/legacy/index.md",
        "# Archived roadmap\n\n"
        "| Code | Story | Status |\n"
        "|------|-------|--------|\n"
        "| CV1.DS1.US1 | First child | 🟡 Planned |\n",
    )
    legacy.authored_closure()
    scenarios.append(legacy.finish())

    # A child the cursor names and the roadmap does not have.
    missing = Scenario("authored_closure_refuses_missing_package")
    _delivery_story_project(missing)
    missing.seed_cursor(
        method="ariad",
        active_item="CV1.DS1",
        active_item_title="Aggregate delivery",
        active_item_level="delivery_story",
        last_delivery_event="delivery_story_review_complete",
        navigator_flow_unit="delivery_story",
        child_work_items=(*DS_CHILDREN, "CV1.DS1.US9"),
        aggregate_checkpoint_status=("plan:approved", "validation:passed", "debt_review:review:no_action"),
    )
    missing.authored_closure()
    scenarios.append(missing.finish())

    return scenarios


def build_payload() -> dict[str, Any]:
    repo_docs_before = _repo_docs_fingerprint()
    sequences: list[dict[str, Any]] = [
        _story_lifecycle_happy_path(),
        _plan_preserves_authored_plan(),
        *_story_lifecycle_refusals(),
        *_prepare_terrain_variants(),
        *_pull_state_carry(),
        *_expand_scenarios(),
        *_preauthorization_scenarios(),
        *_closure_scenarios(),
        *_delivery_story_scenarios(),
    ]
    created = _repo_docs_fingerprint() - repo_docs_before
    if created:
        raise SystemExit(
            "a scenario wrote into the REPOSITORY's own roadmap: "
            f"{sorted(created)[:5]}. Scenarios must only write under "
            f"{PARITY_ROOT.as_posix()}/<scenario>/project."
        )
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
