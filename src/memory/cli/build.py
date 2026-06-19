"""Build skill: DB-only context loader for Builder Mode."""

from __future__ import annotations

import argparse
import re
import sys
from collections.abc import Callable
from pathlib import Path

from memory.builder.ariad_method import get_ariad_method
from memory.builder.delivery_cursor import (
    get_delivery_cursor,
    render_delivery_cursor_sync_report,
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
    plan_delivery_story_checkpoint,
    render_delivery_story_plan_report,
)
from memory.builder.flow_unit import (
    ALLOWED_FLOW_UNITS,
    inspect_navigator_flow_unit,
    render_navigator_flow_unit_report,
    set_navigator_flow_unit,
)
from memory.builder.home_surface import inspect_refinement_field, render_builder_home_surface
from memory.builder.lifecycle import (
    BuilderLifecycleItem,
    approve_plan_checkpoint,
    assert_implementation_allowed,
    coherence_lifecycle_item,
    done_lifecycle_item,
    expand_delivery_story,
    plan_lifecycle_item,
    prepare_lifecycle_item,
    pull_lifecycle_item,
    render_coherence_checkpoint,
    render_done_checkpoint,
    render_expand_report,
    render_implementation_guard_allowed,
    render_implementation_guard_blocked,
    render_plan_approval,
    render_plan_checkpoint,
    render_prepare_report,
    render_pull_report,
    render_review_checkpoint,
    render_validation_checkpoint,
    review_lifecycle_item,
    validate_lifecycle_item,
)
from memory.builder.method_adoption import get_adopted_method, set_adopted_method
from memory.builder.method_inspection import (
    AVAILABLE_METHODS,
    render_available_method,
    render_journey_method_state,
    render_method_adoption_report,
    render_no_active_journey,
)
from memory.builder.pull_candidates import (
    inspect_pull_candidates,
    inspect_roadmap_snapshot,
    render_pull_candidates_report,
    render_roadmap_snapshot_report,
)
from memory.builder.resume_state import read_builder_resume_state
from memory.builder.resume_surface import render_builder_resume_surface
from memory.builder.roadmap_position import resolve_roadmap_position
from memory.builder.template_generation import (
    prepare_method_templates,
    render_template_preparation_report,
)
from memory.builder.workbench import (
    RefinementFlowEvent,
    attach_change_request_to_story,
    capture_change_request,
    close_refinement_story,
    coherence_refinement_story,
    complete_change_request,
    confirm_change_request,
    create_refinement_story,
    get_refinement_story_overview,
    mark_change_request_implemented,
    plan_change_request,
    pull_refinement_story,
    review_refinement_story,
    select_change_request,
    validate_change_request,
)
from memory.builder.workbench_surfaces import (
    render_change_request_captured_surface,
    render_refinement_flow_event_surface,
    render_refinement_story_overview_surface,
    render_refinement_story_pulled_surface,
)
from memory.cli.conversation_logger import switch_conversation
from memory.cli.runtime import inspect_clone_role
from memory.client import MemoryClient
from memory.services.operating_mode import (
    activate_mode,
    get_active_mode,
    resolve_operating_session_id,
)
from memory.skills.mirror import _persist_global_sticky_defaults
from memory.surfaces.mode_transition import render_builder_mode_transition


def _print_builder_banner(slug: str, project_path: str | None = None) -> None:
    print(f"\033[38;5;117m⚙ Builder Mode active — journey: {slug}\033[0m", file=sys.stderr)
    if project_path:
        print(f"\033[38;5;117m  📁 {project_path}\033[0m", file=sys.stderr)


def _extract_query(journey_content: str, slug: str) -> str:
    lines = journey_content.splitlines()
    sections = ["description", "briefing", "context", "descrição", "contexto"]
    result = []
    capturing = False
    for line in lines:
        header = line.lstrip("#").strip().lower()
        if any(s in header for s in sections):
            capturing = True
            continue
        if capturing:
            if line.startswith("#"):
                break
            result.append(line)
    text = " ".join(result).strip()
    return text[:500] if text else slug


def _is_mirror_mind_checkout(start: Path | None = None) -> bool:
    """Return True when ``start`` is inside a Mirror Mind source checkout."""
    start_path = (start or Path.cwd()).expanduser().resolve()
    candidates = (start_path, *start_path.parents)
    for candidate in candidates:
        pyproject = candidate / "pyproject.toml"
        memory_package = candidate / "src" / "memory"
        if not pyproject.is_file() or not memory_package.is_dir():
            continue
        try:
            pyproject_text = pyproject.read_text(encoding="utf-8")
        except OSError:
            return False
        return 'name = "mirror"' in pyproject_text
    return False


def _check_clone_role_guard(
    *, ignore_production_role: bool, project_path: str | None = None
) -> None:
    role_start = Path(project_path) if project_path else None
    if not _is_mirror_mind_checkout(role_start):
        return
    role = inspect_clone_role(role_start)
    if not role.is_production:
        return
    if ignore_production_role:
        print(
            "\033[38;5;208m⚠️  Production clone override: --ignore-production-role passed.\033[0m",
            file=sys.stderr,
        )
        return
    source = role.source if role.source is not None else "<default: missing marker>"
    print(
        "Builder Mode refused: the journey project clone is marked 'production'.\n"
        f"  Project path: {project_path or '<current directory>'}\n"
        f"  Clone role source: {source}\n"
        "  Development should happen in a clone marked 'dev'.\n"
        "  To proceed here anyway, pass --ignore-production-role.",
        file=sys.stderr,
    )
    sys.exit(2)


def cmd_load(
    slug: str,
    *,
    ignore_production_role: bool = False,
    session_id: str | None = None,
) -> None:
    mem = MemoryClient()

    journey_content = mem.get_identity("journey", slug)
    if not journey_content:
        print(f"Error: journey '{slug}' not found.", file=sys.stderr)
        sys.exit(1)

    project_path = mem.journeys.get_project_path(slug)
    _check_clone_role_guard(
        ignore_production_role=ignore_production_role,
        project_path=project_path,
    )
    _print_builder_banner(slug, project_path)
    journey_text = journey_content if isinstance(journey_content, str) else slug
    print(
        render_builder_mode_transition(
            journey=slug,
            journey_content=journey_text,
            project_path=project_path,
        )
    )

    adopted_method = get_adopted_method(mem.store, slug)
    if adopted_method == "ariad":
        _print_builder_entry_surface(
            mem,
            slug=slug,
            adopted_method=adopted_method,
            project_path=project_path,
        )

    context = mem.load_mirror_context(persona="engineer", journey=slug)
    print(context)

    query_text = _extract_query(journey_text, slug)
    scoped = mem.search(query_text, limit=5, journey=slug)
    global_ = mem.search(query_text, limit=5)
    seen_ids: set[str] = set()
    merged: list = []
    for memory, score in scoped + global_:
        if memory.id not in seen_ids:
            seen_ids.add(memory.id)
            merged.append((memory, score))
    merged.sort(key=lambda x: x[1], reverse=True)
    relevant_memories = merged[:6]
    if relevant_memories:
        print("\n=== recent memories ===")
        for memory, _ in relevant_memories:
            print(f"\n[{memory.layer}] {memory.title}")
            print(memory.content)

    _persist_global_sticky_defaults(mem, persona="engineer", journey=slug)
    resolved_session_id = resolve_operating_session_id(mem.store, session_id)
    activate_mode(
        mem.store,
        mode="Builder Mode",
        journey=slug,
        session_id=resolved_session_id,
    )
    switch_conversation(session_id=resolved_session_id, persona="engineer", journey=slug)

    if project_path:
        print(f"\nproject_path={project_path}")
    else:
        print(
            f"\n[Journey '{slug}' has no project_path configured. "
            f"Run: python -m memory journey set-path {slug} /path/to/project]"
        )


def _print_builder_entry_surface(
    mem: MemoryClient,
    *,
    slug: str,
    adopted_method: str,
    project_path: str | None,
) -> None:
    resume_state = read_builder_resume_state(mem.store, slug)
    project_root = Path(project_path) if project_path else None
    if (
        resume_state.cursor
        and not resume_state.cursor.active_item
        and not resume_state.cursor.pending_confirmation
    ):
        candidates_report = inspect_pull_candidates(
            project_root,
            journey=slug,
            method=adopted_method,
        )
        print(
            render_builder_home_surface(
                journey=slug,
                method=adopted_method,
                candidates_report=candidates_report,
                refinement=inspect_refinement_field(project_root, store=mem.store, journey=slug),
            )
        )
        print(
            render_roadmap_snapshot_report(
                inspect_roadmap_snapshot(project_root, journey=slug, method=adopted_method),
                candidates=candidates_report.candidates,
            )
        )
        print(render_pull_candidates_report(candidates_report))
        return
    print(
        render_builder_resume_surface(
            resume_state,
            roadmap_position=resolve_roadmap_position(project_root) if project_root else None,
        )
    )


def cmd_inspect_method(
    method: str | None,
    *,
    journey: str | None = None,
    session_id: str | None = None,
) -> None:
    mem = MemoryClient() if journey or method is None else None
    if journey:
        if mem is None:
            mem = MemoryClient()
        journey_content = mem.get_identity("journey", journey)
        if not journey_content:
            print(f"Error: journey '{journey}' not found.", file=sys.stderr)
            sys.exit(1)
        print(render_journey_method_state(journey, get_adopted_method(mem.store, journey)))
        return

    if method is None:
        if mem:
            resolved_session_id = resolve_operating_session_id(mem.store, session_id)
            active_mode = get_active_mode(mem.store, session_id=resolved_session_id)
            if active_mode and active_mode.mode == "Builder Mode" and active_mode.journey:
                print(
                    render_journey_method_state(
                        active_mode.journey,
                        get_adopted_method(mem.store, active_mode.journey),
                    )
                )
                return
        print(render_no_active_journey())
        return

    if method != "ariad":
        requested = method or "<none>"
        print(
            f"Error: Builder method '{requested}' not found. "
            f"Available methods: {', '.join(AVAILABLE_METHODS)}",
            file=sys.stderr,
        )
        sys.exit(1)
    print(render_available_method(get_ariad_method()))


def _reject_unknown_method(method: str) -> None:
    if method != "ariad":
        print(
            f"Error: Builder method '{method}' not found. "
            f"Available methods: {', '.join(AVAILABLE_METHODS)}",
            file=sys.stderr,
        )
        sys.exit(1)


def _resolve_builder_journey(
    mem: MemoryClient,
    *,
    journey: str | None,
    session_id: str | None,
    action: str,
) -> str:
    resolved_journey = journey
    if not resolved_journey:
        resolved_session_id = resolve_operating_session_id(mem.store, session_id)
        active_mode = get_active_mode(mem.store, session_id=resolved_session_id)
        if active_mode and active_mode.mode == "Builder Mode" and active_mode.journey:
            resolved_journey = active_mode.journey
    if not resolved_journey:
        print(
            f"Error: Builder method {action} requires a journey. "
            "Activate Builder Mode for a journey or pass --journey.",
            file=sys.stderr,
        )
        sys.exit(1)
    return resolved_journey


def cmd_adopt_method(
    method: str,
    *,
    journey: str | None = None,
    session_id: str | None = None,
) -> None:
    mem = MemoryClient()
    _reject_unknown_method(method)
    resolved_journey = _resolve_builder_journey(
        mem,
        journey=journey,
        session_id=session_id,
        action="adoption",
    )

    journey_content = mem.get_identity("journey", resolved_journey)
    if not journey_content:
        print(f"Error: journey '{resolved_journey}' not found.", file=sys.stderr)
        sys.exit(1)

    already_adopted = get_adopted_method(mem.store, resolved_journey) == method
    adoption = set_adopted_method(mem.store, resolved_journey, method)
    print(
        render_method_adoption_report(
            adoption.journey,
            adoption.method,
            already_adopted=already_adopted,
        )
    )


def _require_adopted_method(mem: MemoryClient, journey: str, method: str) -> None:
    if get_adopted_method(mem.store, journey) == method:
        return
    print(
        f"Error: journey '{journey}' has not adopted Ariad yet. "
        "Run: uv run python -m memory build adopt --journey "
        f"{journey} --method ariad",
        file=sys.stderr,
    )
    sys.exit(1)


def cmd_prepare_templates(
    method: str,
    *,
    journey: str | None = None,
    session_id: str | None = None,
) -> None:
    mem = MemoryClient()
    _reject_unknown_method(method)
    resolved_journey = _resolve_builder_journey(
        mem,
        journey=journey,
        session_id=session_id,
        action="template preparation",
    )

    journey_content = mem.get_identity("journey", resolved_journey)
    if not journey_content:
        print(f"Error: journey '{resolved_journey}' not found.", file=sys.stderr)
        sys.exit(1)
    _require_adopted_method(mem, resolved_journey, method)

    project_path = mem.journeys.get_project_path(resolved_journey)
    if not project_path:
        print(
            f"Error: journey '{resolved_journey}' has no project_path configured. "
            "Set a project path before preparing Ariad templates.",
            file=sys.stderr,
        )
        sys.exit(1)

    report = prepare_method_templates(
        Path(project_path),
        journey=resolved_journey,
        method=get_ariad_method(),
    )
    print(render_template_preparation_report(report))


def _require_delivery_cursor(mem: MemoryClient, journey: str) -> None:
    if get_delivery_cursor(mem.store, journey) is not None:
        return
    print(
        f"Error: journey '{journey}' has no Builder delivery cursor. "
        "Run: uv run python -m memory build sync-cursor --journey "
        f"{journey} --method ariad",
        file=sys.stderr,
    )
    sys.exit(1)


def cmd_sync_cursor(
    method: str,
    *,
    journey: str | None = None,
    session_id: str | None = None,
) -> None:
    mem = MemoryClient()
    _reject_unknown_method(method)
    resolved_journey = _resolve_builder_journey(
        mem,
        journey=journey,
        session_id=session_id,
        action="cursor sync",
    )

    journey_content = mem.get_identity("journey", resolved_journey)
    if not journey_content:
        print(f"Error: journey '{resolved_journey}' not found.", file=sys.stderr)
        sys.exit(1)
    _require_adopted_method(mem, resolved_journey, method)

    cursor = set_delivery_cursor(
        mem.store,
        journey=resolved_journey,
        method=method,
        last_delivery_event="template_preparation",
        cadence_profile="stepwise",
    )
    print(render_delivery_cursor_sync_report(cursor))


def cmd_pull_candidates(
    method: str,
    *,
    journey: str | None = None,
    session_id: str | None = None,
) -> None:
    mem = MemoryClient()
    _reject_unknown_method(method)
    resolved_journey = _resolve_builder_journey(
        mem,
        journey=journey,
        session_id=session_id,
        action="pull candidates inspection",
    )
    journey_content = mem.get_identity("journey", resolved_journey)
    if not journey_content:
        print(f"Error: journey '{resolved_journey}' not found.", file=sys.stderr)
        sys.exit(1)
    _require_adopted_method(mem, resolved_journey, method)
    project_path = mem.journeys.get_project_path(resolved_journey)
    root = Path(project_path) if project_path else None
    method_definition = get_ariad_method()
    surfaces = _surfaces_for_trigger(method_definition, "show_roadmap")
    rendered: list[str] = []
    candidates_report = inspect_pull_candidates(root, journey=resolved_journey, method=method)
    if "roadmap_snapshot" in surfaces:
        rendered.append(
            render_roadmap_snapshot_report(
                inspect_roadmap_snapshot(root, journey=resolved_journey, method=method),
                candidates=candidates_report.candidates,
            )
        )
    if "pull_candidates" in surfaces:
        rendered.append(render_pull_candidates_report(candidates_report))
    print("\n".join(part.rstrip() for part in rendered) + "\n")


def _surfaces_for_trigger(method_definition: object, trigger: str) -> tuple[str, ...]:
    routes = getattr(method_definition, "surface_routes", ())
    for route in routes:
        if getattr(route, "trigger", None) == trigger:
            return tuple(getattr(route, "surfaces", ()))
    return ("pull_candidates",)


def cmd_pull_item(
    method: str,
    *,
    item_code: str,
    item_title: str,
    item_level: str,
    why_now: str,
    journey: str | None = None,
    session_id: str | None = None,
) -> None:
    mem = MemoryClient()
    _reject_unknown_method(method)
    resolved_journey = _resolve_builder_journey(
        mem,
        journey=journey,
        session_id=session_id,
        action="pull",
    )
    journey_content = mem.get_identity("journey", resolved_journey)
    if not journey_content:
        print(f"Error: journey '{resolved_journey}' not found.", file=sys.stderr)
        sys.exit(1)
    _require_adopted_method(mem, resolved_journey, method)
    _require_delivery_cursor(mem, resolved_journey)
    try:
        report = pull_lifecycle_item(
            mem.store,
            journey=resolved_journey,
            method=method,
            item=BuilderLifecycleItem(
                code=item_code,
                title=item_title,
                level=item_level,
                why_now=why_now,
            ),
        )
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)
    print(render_pull_report(report))
    project_path = mem.journeys.get_project_path(resolved_journey)
    prepare_report = prepare_lifecycle_item(
        mem.store,
        journey=resolved_journey,
        method=method,
        project_path=Path(project_path) if project_path else None,
    )
    print(render_prepare_report(prepare_report))
    if item_level == "delivery_story":
        if not project_path:
            print("Error: Delivery Story expansion requires project_path.", file=sys.stderr)
            sys.exit(1)
        expand_report = expand_delivery_story(
            mem.store,
            journey=resolved_journey,
            method=method,
            project_path=Path(project_path),
        )
        print(render_expand_report(expand_report))


_MIRROR_LOCAL_IMPLEMENTATION_RULES = (
    "Use uv run for Python commands and tests.",
    "Do not use git add .; commit only story-scoped files.",
    "Use descriptive English commit messages explaining why.",
)


def cmd_validate_delivery_story(
    method: str,
    *,
    summary: str,
    navigator_accepted: bool,
    journey: str | None = None,
    session_id: str | None = None,
) -> None:
    mem = MemoryClient()
    _reject_unknown_method(method)
    resolved_journey = _resolve_builder_journey(
        mem,
        journey=journey,
        session_id=session_id,
        action="Delivery Story validation",
    )
    _require_adopted_method(mem, resolved_journey, method)
    try:
        cursor = get_delivery_cursor(mem.store, resolved_journey)
        artifact_path = _checkpoint_artifact_path(
            mem.journeys.get_project_path(resolved_journey), cursor, "validation.md"
        )
        report = validate_delivery_story(
            mem.store,
            journey=resolved_journey,
            method=method,
            summary=summary,
            navigator_accepted=navigator_accepted,
            artifact_path=artifact_path,
        )
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)
    print(render_delivery_story_closure_report(report))


def cmd_review_delivery_story(
    method: str,
    *,
    decision: str,
    summary: str,
    journey: str | None = None,
    session_id: str | None = None,
) -> None:
    mem = MemoryClient()
    _reject_unknown_method(method)
    resolved_journey = _resolve_builder_journey(
        mem,
        journey=journey,
        session_id=session_id,
        action="Delivery Story debt review",
    )
    _require_adopted_method(mem, resolved_journey, method)
    try:
        cursor = get_delivery_cursor(mem.store, resolved_journey)
        artifact_path = _checkpoint_artifact_path(
            mem.journeys.get_project_path(resolved_journey), cursor, "review.md"
        )
        report = review_delivery_story(
            mem.store,
            journey=resolved_journey,
            method=method,
            decision=decision,
            summary=summary,
            artifact_path=artifact_path,
        )
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)
    print(render_delivery_story_closure_report(report))


def cmd_coherence_delivery_story(
    method: str,
    *,
    summary: str,
    journey: str | None = None,
    session_id: str | None = None,
) -> None:
    mem = MemoryClient()
    _reject_unknown_method(method)
    resolved_journey = _resolve_builder_journey(
        mem,
        journey=journey,
        session_id=session_id,
        action="Delivery Story coherence",
    )
    _require_adopted_method(mem, resolved_journey, method)
    try:
        cursor = get_delivery_cursor(mem.store, resolved_journey)
        artifact_path = _checkpoint_artifact_path(
            mem.journeys.get_project_path(resolved_journey), cursor, "coherence.md"
        )
        report = coherence_delivery_story(
            mem.store,
            journey=resolved_journey,
            method=method,
            summary=summary,
            artifact_path=artifact_path,
        )
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)
    print(render_delivery_story_closure_report(report))


def cmd_done_delivery_story(
    method: str,
    *,
    summary: str,
    journey: str | None = None,
    session_id: str | None = None,
) -> None:
    mem = MemoryClient()
    _reject_unknown_method(method)
    resolved_journey = _resolve_builder_journey(
        mem,
        journey=journey,
        session_id=session_id,
        action="Delivery Story Done",
    )
    _require_adopted_method(mem, resolved_journey, method)
    try:
        cursor = get_delivery_cursor(mem.store, resolved_journey)
        artifact_path = _checkpoint_artifact_path(
            mem.journeys.get_project_path(resolved_journey), cursor, "done.md"
        )
        report = done_delivery_story(
            mem.store,
            journey=resolved_journey,
            method=method,
            summary=summary,
            artifact_path=artifact_path,
        )
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)
    print(render_delivery_story_closure_report(report))


def cmd_plan_delivery_story(
    method: str,
    *,
    objective: str,
    child_work_items: tuple[str, ...] = (),
    journey: str | None = None,
    session_id: str | None = None,
) -> None:
    mem = MemoryClient()
    _reject_unknown_method(method)
    resolved_journey = _resolve_builder_journey(
        mem,
        journey=journey,
        session_id=session_id,
        action="Delivery Story Plan",
    )
    _require_adopted_method(mem, resolved_journey, method)
    try:
        cursor = get_delivery_cursor(mem.store, resolved_journey)
        plan_artifact_path = _checkpoint_artifact_path(
            mem.journeys.get_project_path(resolved_journey), cursor, "plan.md"
        )
        report = plan_delivery_story_checkpoint(
            mem.store,
            journey=resolved_journey,
            method=method,
            objective=objective,
            child_work_items=child_work_items,
            plan_artifact_path=plan_artifact_path,
        )
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)
    print(render_delivery_story_plan_report(report))


def cmd_approve_delivery_story_plan(
    method: str,
    *,
    journey: str | None = None,
    session_id: str | None = None,
) -> None:
    mem = MemoryClient()
    _reject_unknown_method(method)
    resolved_journey = _resolve_builder_journey(
        mem,
        journey=journey,
        session_id=session_id,
        action="Delivery Story Plan approval",
    )
    _require_adopted_method(mem, resolved_journey, method)
    try:
        cursor = get_delivery_cursor(mem.store, resolved_journey)
        plan_artifact_path = _checkpoint_artifact_path(
            mem.journeys.get_project_path(resolved_journey), cursor, "plan.md"
        )
        report = approve_delivery_story_plan(
            mem.store,
            journey=resolved_journey,
            method=method,
            plan_artifact_path=plan_artifact_path,
        )
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)
    print(render_delivery_story_plan_report(report))


def cmd_set_flow_unit(
    method: str,
    *,
    unit: str | None = None,
    journey: str | None = None,
    session_id: str | None = None,
) -> None:
    mem = MemoryClient()
    _reject_unknown_method(method)
    resolved_journey = _resolve_builder_journey(
        mem,
        journey=journey,
        session_id=session_id,
        action="navigator flow unit",
    )
    _require_adopted_method(mem, resolved_journey, method)
    try:
        if unit is None:
            report = inspect_navigator_flow_unit(
                mem.store,
                journey=resolved_journey,
                method=method,
            )
        else:
            report = set_navigator_flow_unit(
                mem.store,
                journey=resolved_journey,
                method=method,
                flow_unit=unit,
            )
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)
    print(render_navigator_flow_unit_report(report))


def cmd_set_cadence(
    method: str,
    *,
    profile: str,
    limits: tuple[str, ...] = (),
    journey: str | None = None,
    session_id: str | None = None,
) -> None:
    mem = MemoryClient()
    _reject_unknown_method(method)
    allowed_profiles = {"stepwise", "checkpoint", "accelerated", "autonomous"}
    if profile not in allowed_profiles:
        print(
            "Error: cadence profile must be one of stepwise, checkpoint, accelerated, autonomous",
            file=sys.stderr,
        )
        sys.exit(1)
    if profile == "autonomous" and not limits:
        print("Error: autonomous cadence requires at least one --limit", file=sys.stderr)
        sys.exit(1)
    resolved_journey = _resolve_builder_journey(
        mem,
        journey=journey,
        session_id=session_id,
        action="cadence profile update",
    )
    _require_adopted_method(mem, resolved_journey, method)
    cursor = get_delivery_cursor(mem.store, resolved_journey)
    if cursor is None:
        print(
            f"Error: journey '{resolved_journey}' has no Builder delivery cursor.", file=sys.stderr
        )
        sys.exit(1)
    updated = set_delivery_cursor(
        mem.store,
        journey=resolved_journey,
        method=method,
        active_item=cursor.active_item,
        active_item_title=cursor.active_item_title,
        active_item_level=cursor.active_item_level,
        active_checkpoint=cursor.active_checkpoint,
        pending_confirmation=cursor.pending_confirmation,
        last_delivery_event=cursor.last_delivery_event,
        cadence_profile=profile,
        cadence_limits=limits,
        granularity_decision=cursor.granularity_decision,
        navigator_flow_unit=cursor.navigator_flow_unit,
        child_work_items=cursor.child_work_items,
        aggregate_checkpoint_status=cursor.aggregate_checkpoint_status,
    )
    print(render_delivery_cursor_sync_report(updated))


def cmd_plan_item(
    method: str,
    *,
    journey: str | None = None,
    session_id: str | None = None,
    objective: str | None = None,
) -> None:
    mem = MemoryClient()
    _reject_unknown_method(method)
    resolved_journey = _resolve_builder_journey(
        mem,
        journey=journey,
        session_id=session_id,
        action="plan",
    )
    journey_content = mem.get_identity("journey", resolved_journey)
    if not journey_content:
        print(f"Error: journey '{resolved_journey}' not found.", file=sys.stderr)
        sys.exit(1)
    _require_adopted_method(mem, resolved_journey, method)
    _require_delivery_cursor(mem, resolved_journey)
    try:
        project_path = mem.journeys.get_project_path(resolved_journey)
        cursor = get_delivery_cursor(mem.store, resolved_journey)
        context = _roadmap_plan_context(project_path, cursor)
        report = plan_lifecycle_item(
            mem.store,
            journey=resolved_journey,
            method=get_ariad_method(),
            objective=objective or str(context["objective"]),
            scope=tuple(context["scope"]),
            non_goals=tuple(context["non_goals"]),
            acceptance_behavior=tuple(context["acceptance_behavior"]),
            validation_route=tuple(context["validation_route"]),
            e2e_decision=str(context["e2e_decision"]),
            local_rules=_MIRROR_LOCAL_IMPLEMENTATION_RULES,
            plan_artifact_path=_plan_artifact_path(project_path, cursor),
        )
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)
    print(render_plan_checkpoint(report))


def _roadmap_plan_context(
    project_path: str | None, cursor: object
) -> dict[str, tuple[str, ...] | str]:
    active_item = getattr(cursor, "active_item", None)
    title_parts: tuple[str, ...] = ()
    siblings: tuple[str, ...] = ()
    if project_path and active_item:
        project_root = Path(project_path)
        candidates = inspect_pull_candidates(project_root, journey="", method="ariad").candidates
        active = next(
            (candidate for candidate in candidates if candidate.code == active_item), None
        )
        if active:
            title_parts = tuple(part.strip() for part in active.title.split("/") if part.strip())
            prefix = str(active_item).split(".")[0]
            siblings = tuple(
                candidate.title.split("/")[-1].strip()
                for candidate in candidates
                if candidate.code != active_item and candidate.code.startswith(f"{prefix}.")
            )
    title = title_parts[-1] if title_parts else str(active_item or "the active item")
    sibling_non_goals = tuple(
        f"Do not implement sibling roadmap item: {sibling}." for sibling in siblings
    )
    return {
        "objective": f"Plan the smallest coherent, testable slice for {title}.",
        "scope": (
            f"Deliver {title} as an observable slice.",
            "Keep the implementation narrow enough to validate at the Plan-defined checkpoint.",
        ),
        "non_goals": sibling_non_goals or ("Do not silently absorb adjacent roadmap work.",),
        "acceptance_behavior": (
            f"Given the starting state needed for {title}",
            f"When the Navigator exercises {title}",
            "Then the planned observable behavior is visible",
            "And out-of-scope sibling roadmap items remain untouched",
        ),
        "validation_route": (
            "Run automated tests that cover the planned behavior.",
            "Provide a Navigator-visible route with expected observation, pass condition, and fail condition.",
        ),
        "e2e_decision": "required unless Navigator explicitly accepts a narrower fixture-level validation route",
    }


def _plan_artifact_path(
    project_path: str | None,
    cursor: object,
) -> Path | None:
    package_path = _canonical_package_path(project_path, cursor)
    if package_path is None:
        return None
    return package_path / "plan.md"


def _checkpoint_artifact_path(
    project_path: str | None,
    cursor: object,
    filename: str,
) -> Path | None:
    package_path = _canonical_package_path(project_path, cursor)
    if package_path is None:
        return None
    return package_path / filename


def _canonical_package_path(project_path: str | None, cursor: object) -> Path | None:
    active_item = getattr(cursor, "active_item", None)
    if not project_path or not active_item:
        return None
    project_root = Path(project_path)
    active_code = str(active_item)
    existing = _find_existing_package_path(project_root, active_code)
    if existing is not None:
        return existing
    title_parts = _roadmap_title_parts(project_root, active_code)
    code_parts = active_code.lower().replace("_", "-").split(".")
    if not code_parts:
        return None
    roadmap_path = project_root / "docs" / "project" / "roadmap"
    accumulated: list[str] = []
    for index, code_part in enumerate(code_parts):
        accumulated.append(code_part)
        code_prefix = "-".join(accumulated)
        title_slug = _slugify(title_parts[index]) if index < len(title_parts) else ""
        folder = f"{code_prefix}-{title_slug}" if title_slug else code_prefix
        roadmap_path = roadmap_path / folder
    return roadmap_path


def _find_existing_package_path(project_root: Path, active_code: str) -> Path | None:
    roadmap_root = project_root / "docs" / "project" / "roadmap"
    if not roadmap_root.is_dir():
        return None
    prefix = active_code.lower().replace("_", "-").replace(".", "-")
    matches = sorted(
        path
        for path in roadmap_root.rglob("index.md")
        if path.parent.name == prefix or path.parent.name.startswith(f"{prefix}-")
    )
    if not matches:
        return None
    return min((path.parent for path in matches), key=lambda path: len(path.parts))


def _roadmap_title_parts(project_root: Path, active_code: str) -> tuple[str, ...]:
    candidates = inspect_pull_candidates(project_root, journey="", method="ariad").candidates
    for candidate in candidates:
        if candidate.code == active_code:
            return tuple(part.strip() for part in candidate.title.split("/") if part.strip())
    return ()


def _slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return re.sub(r"-+", "-", slug)


def cmd_approve_plan(
    method: str,
    *,
    journey: str | None = None,
    session_id: str | None = None,
) -> None:
    mem = MemoryClient()
    _reject_unknown_method(method)
    resolved_journey = _resolve_builder_journey(
        mem,
        journey=journey,
        session_id=session_id,
        action="plan approval",
    )
    journey_content = mem.get_identity("journey", resolved_journey)
    if not journey_content:
        print(f"Error: journey '{resolved_journey}' not found.", file=sys.stderr)
        sys.exit(1)
    _require_adopted_method(mem, resolved_journey, method)
    try:
        cursor = approve_plan_checkpoint(mem.store, journey=resolved_journey, method=method)
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)
    print(render_plan_approval(cursor))


def cmd_check_implementation(
    method: str,
    *,
    journey: str | None = None,
    session_id: str | None = None,
) -> None:
    mem = MemoryClient()
    _reject_unknown_method(method)
    resolved_journey = _resolve_builder_journey(
        mem,
        journey=journey,
        session_id=session_id,
        action="implementation check",
    )
    journey_content = mem.get_identity("journey", resolved_journey)
    if not journey_content:
        print(f"Error: journey '{resolved_journey}' not found.", file=sys.stderr)
        sys.exit(1)
    _require_adopted_method(mem, resolved_journey, method)
    try:
        cursor = assert_implementation_allowed(mem.store, journey=resolved_journey)
    except PermissionError as exc:
        print(render_implementation_guard_blocked(str(exc)))
        sys.exit(1)
    print(render_implementation_guard_allowed(cursor))


def cmd_continue_lifecycle(
    method: str,
    *,
    journey: str | None = None,
    session_id: str | None = None,
    process_alignment: str | None = None,
    project_alignment: str | None = None,
    product_alignment: str | None = None,
    local_differences: tuple[str, ...] = (),
    history_action: str | None = None,
    roadmap_update: str | None = None,
    next_recommendation: str | None = None,
) -> None:
    mem = MemoryClient()
    _reject_unknown_method(method)
    resolved_journey = _resolve_builder_journey(
        mem,
        journey=journey,
        session_id=session_id,
        action="lifecycle continuation",
    )
    journey_content = mem.get_identity("journey", resolved_journey)
    if not journey_content:
        print(f"Error: journey '{resolved_journey}' not found.", file=sys.stderr)
        sys.exit(1)
    _require_adopted_method(mem, resolved_journey, method)
    _require_delivery_cursor(mem, resolved_journey)
    cursor = get_delivery_cursor(mem.store, resolved_journey)
    if cursor is None:
        print("Error: delivery cursor is required before continuation", file=sys.stderr)
        sys.exit(1)
    profile = cursor.cadence_profile or "stepwise"
    if profile == "stepwise":
        print(
            render_implementation_guard_blocked("Stepwise cadence does not continue automatically.")
        )
        sys.exit(1)
    if profile == "autonomous" and not cursor.cadence_limits:
        print(render_implementation_guard_blocked("Autonomous cadence requires explicit limits."))
        sys.exit(1)
    if cursor.pending_confirmation:
        print(
            render_implementation_guard_blocked(
                f"Continuation is blocked: pending confirmation {cursor.pending_confirmation}."
            )
        )
        sys.exit(1)
    project_path = mem.journeys.get_project_path(resolved_journey)
    plan_path = _plan_artifact_path(project_path, cursor)
    if cursor.last_delivery_event == "review_complete":
        coherence_report = coherence_lifecycle_item(
            mem.store,
            journey=resolved_journey,
            method=get_ariad_method(),
            process_alignment=process_alignment,
            project_alignment=project_alignment,
            product_alignment=product_alignment,
            local_differences=local_differences,
            coherence_artifact_path=(plan_path.parent / "coherence.md") if plan_path else None,
        )
        print(render_coherence_checkpoint(coherence_report))
        if not (history_action and roadmap_update and next_recommendation):
            return
    elif cursor.last_delivery_event != "coherence_complete":
        print(
            render_implementation_guard_blocked(
                f"No bypassable continuation is available after {cursor.last_delivery_event or 'none'}."
            )
        )
        sys.exit(1)
    if not (history_action and roadmap_update and next_recommendation):
        print(
            render_implementation_guard_blocked(
                "Done requires history, roadmap, and next-step evidence."
            )
        )
        sys.exit(1)
    done_report = done_lifecycle_item(
        mem.store,
        journey=resolved_journey,
        method=get_ariad_method(),
        history_action=history_action,
        roadmap_update=roadmap_update,
        next_recommendation=next_recommendation,
        done_artifact_path=(plan_path.parent / "done.md") if plan_path else None,
    )
    print(render_done_checkpoint(done_report))


def cmd_coherence_item(
    method: str,
    *,
    journey: str | None = None,
    session_id: str | None = None,
    process_alignment: str | None = None,
    project_alignment: str | None = None,
    product_alignment: str | None = None,
    local_differences: tuple[str, ...] = (),
) -> None:
    mem = MemoryClient()
    _reject_unknown_method(method)
    resolved_journey = _resolve_builder_journey(
        mem,
        journey=journey,
        session_id=session_id,
        action="coherence",
    )
    journey_content = mem.get_identity("journey", resolved_journey)
    if not journey_content:
        print(f"Error: journey '{resolved_journey}' not found.", file=sys.stderr)
        sys.exit(1)
    _require_adopted_method(mem, resolved_journey, method)
    _require_delivery_cursor(mem, resolved_journey)
    cursor = get_delivery_cursor(mem.store, resolved_journey)
    project_path = mem.journeys.get_project_path(resolved_journey)
    plan_path = _plan_artifact_path(project_path, cursor)
    try:
        report = coherence_lifecycle_item(
            mem.store,
            journey=resolved_journey,
            method=get_ariad_method(),
            process_alignment=process_alignment,
            project_alignment=project_alignment,
            product_alignment=product_alignment,
            local_differences=local_differences,
            coherence_artifact_path=(plan_path.parent / "coherence.md") if plan_path else None,
        )
    except ValueError as exc:
        print(render_implementation_guard_blocked(str(exc)))
        sys.exit(1)
    print(render_coherence_checkpoint(report))


def cmd_done_item(
    method: str,
    *,
    journey: str | None = None,
    session_id: str | None = None,
    history_action: str | None = None,
    roadmap_update: str | None = None,
    next_recommendation: str | None = None,
) -> None:
    mem = MemoryClient()
    _reject_unknown_method(method)
    resolved_journey = _resolve_builder_journey(
        mem,
        journey=journey,
        session_id=session_id,
        action="done",
    )
    journey_content = mem.get_identity("journey", resolved_journey)
    if not journey_content:
        print(f"Error: journey '{resolved_journey}' not found.", file=sys.stderr)
        sys.exit(1)
    _require_adopted_method(mem, resolved_journey, method)
    _require_delivery_cursor(mem, resolved_journey)
    cursor = get_delivery_cursor(mem.store, resolved_journey)
    project_path = mem.journeys.get_project_path(resolved_journey)
    plan_path = _plan_artifact_path(project_path, cursor)
    try:
        report = done_lifecycle_item(
            mem.store,
            journey=resolved_journey,
            method=get_ariad_method(),
            history_action=history_action,
            roadmap_update=roadmap_update,
            next_recommendation=next_recommendation,
            done_artifact_path=(plan_path.parent / "done.md") if plan_path else None,
        )
    except ValueError as exc:
        print(render_implementation_guard_blocked(str(exc)))
        sys.exit(1)
    print(render_done_checkpoint(report))


def cmd_review_item(
    method: str,
    *,
    journey: str | None = None,
    session_id: str | None = None,
    debt_findings: tuple[str, ...] = (),
    debt_decision: str = "pending",
    defer_reason: str | None = None,
    revisit_trigger: str | None = None,
) -> None:
    mem = MemoryClient()
    _reject_unknown_method(method)
    resolved_journey = _resolve_builder_journey(
        mem,
        journey=journey,
        session_id=session_id,
        action="debt review",
    )
    journey_content = mem.get_identity("journey", resolved_journey)
    if not journey_content:
        print(f"Error: journey '{resolved_journey}' not found.", file=sys.stderr)
        sys.exit(1)
    _require_adopted_method(mem, resolved_journey, method)
    _require_delivery_cursor(mem, resolved_journey)
    cursor = get_delivery_cursor(mem.store, resolved_journey)
    project_path = mem.journeys.get_project_path(resolved_journey)
    plan_path = _plan_artifact_path(project_path, cursor)
    try:
        report = review_lifecycle_item(
            mem.store,
            journey=resolved_journey,
            method=get_ariad_method(),
            debt_findings=debt_findings,
            debt_decision=debt_decision,
            defer_reason=defer_reason,
            revisit_trigger=revisit_trigger,
            review_artifact_path=(plan_path.parent / "review.md") if plan_path else None,
        )
    except ValueError as exc:
        print(render_implementation_guard_blocked(str(exc)))
        sys.exit(1)
    print(render_review_checkpoint(report))


def cmd_validate_item(
    method: str,
    *,
    journey: str | None = None,
    session_id: str | None = None,
    checks: tuple[str, ...] = (),
    checks_status: str = "not_run",
    e2e_decision: str = "not_required",
    e2e_evidence: str | None = None,
    navigator_route: str | None = None,
    navigator_accepted: bool = False,
    expected_observation: str | None = None,
    pass_condition: str | None = None,
    fail_condition: str | None = None,
    implementation_complete: bool = False,
) -> None:
    mem = MemoryClient()
    _reject_unknown_method(method)
    resolved_journey = _resolve_builder_journey(
        mem,
        journey=journey,
        session_id=session_id,
        action="validation",
    )
    journey_content = mem.get_identity("journey", resolved_journey)
    if not journey_content:
        print(f"Error: journey '{resolved_journey}' not found.", file=sys.stderr)
        sys.exit(1)
    _require_adopted_method(mem, resolved_journey, method)
    _require_delivery_cursor(mem, resolved_journey)
    cursor = get_delivery_cursor(mem.store, resolved_journey)
    project_path = mem.journeys.get_project_path(resolved_journey)
    plan_path = _plan_artifact_path(project_path, cursor)
    try:
        report = validate_lifecycle_item(
            mem.store,
            journey=resolved_journey,
            method=get_ariad_method(),
            automated_checks=checks,
            checks_status=checks_status,
            e2e_decision=e2e_decision,
            e2e_evidence=e2e_evidence,
            navigator_validation_route=navigator_route,
            navigator_accepted=navigator_accepted,
            expected_observation=expected_observation,
            pass_condition=pass_condition,
            fail_condition=fail_condition,
            implementation_complete=implementation_complete,
            validation_artifact_path=(plan_path.parent / "validation.md") if plan_path else None,
        )
    except ValueError as exc:
        print(render_implementation_guard_blocked(str(exc)))
        sys.exit(1)
    print(render_validation_checkpoint(report))


def _resolve_workbench_journey(
    mem: MemoryClient,
    *,
    journey: str | None,
    session_id: str | None,
    action: str,
) -> str:
    resolved_journey = _resolve_builder_journey(
        mem,
        journey=journey,
        session_id=session_id,
        action=action,
    )
    journey_content = mem.get_identity("journey", resolved_journey)
    if not journey_content:
        print(f"Error: journey '{resolved_journey}' not found.", file=sys.stderr)
        sys.exit(1)
    return resolved_journey


def cmd_refinement_story_create(
    *,
    journey: str | None = None,
    session_id: str | None = None,
    title: str,
    description: str | None = None,
    source: str = "manual",
    provenance: str | None = None,
) -> None:
    mem = MemoryClient()
    resolved_journey = _resolve_workbench_journey(
        mem, journey=journey, session_id=session_id, action="create refinement story"
    )
    story = create_refinement_story(
        mem.store,
        journey=resolved_journey,
        title=title,
        description=description,
        source=source,
        provenance=provenance,
    )
    overview = get_refinement_story_overview(
        mem.store,
        journey=resolved_journey,
        refinement_story_id=story.id,
    )
    print(render_refinement_story_overview_surface(journey=resolved_journey, overview=overview))
    print(f"refinement_story_id={story.id}")


def cmd_change_request_capture(
    *,
    journey: str | None = None,
    session_id: str | None = None,
    title: str,
    body: str,
    refinement_story_id: str | None = None,
    source: str = "manual",
    provenance: str | None = None,
) -> None:
    mem = MemoryClient()
    resolved_journey = _resolve_workbench_journey(
        mem, journey=journey, session_id=session_id, action="capture change request"
    )
    try:
        change_request = capture_change_request(
            mem.store,
            journey=resolved_journey,
            title=title,
            body=body,
            refinement_story_id=refinement_story_id,
            source=source,
            provenance=provenance,
        )
        story = (
            mem.store.get_refinement_story(change_request.refinement_story_id)
            if change_request.refinement_story_id
            else None
        )
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)
    print(
        render_change_request_captured_surface(
            journey=resolved_journey,
            change_request=change_request,
            refinement_story=story,
        )
    )
    print(f"change_request_id={change_request.id}")


def _print_refinement_event(action: Callable[[], RefinementFlowEvent]) -> None:
    try:
        event = action()
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)
    print(render_refinement_flow_event_surface(event))


def cmd_change_request_flow(
    action: str,
    *,
    journey: str | None = None,
    session_id: str | None = None,
    change_request_id: str,
    summary: str | None = None,
    evidence: str | None = None,
    notes: str | None = None,
) -> None:
    mem = MemoryClient()
    resolved_journey = _resolve_workbench_journey(
        mem, journey=journey, session_id=session_id, action=f"{action} change request"
    )
    if action == "select":
        _print_refinement_event(
            lambda: select_change_request(
                mem.store, journey=resolved_journey, change_request_id=change_request_id
            )
        )
    elif action == "confirm":
        _print_refinement_event(
            lambda: confirm_change_request(
                mem.store, journey=resolved_journey, change_request_id=change_request_id
            )
        )
    elif action == "plan":
        _print_refinement_event(
            lambda: plan_change_request(
                mem.store,
                journey=resolved_journey,
                change_request_id=change_request_id,
                summary=summary or "",
            )
        )
    elif action == "mark-implemented":
        _print_refinement_event(
            lambda: mark_change_request_implemented(
                mem.store,
                journey=resolved_journey,
                change_request_id=change_request_id,
                evidence=evidence or "",
            )
        )
    elif action == "validate":
        _print_refinement_event(
            lambda: validate_change_request(
                mem.store,
                journey=resolved_journey,
                change_request_id=change_request_id,
                evidence=evidence or "",
            )
        )
    elif action == "done":
        _print_refinement_event(
            lambda: complete_change_request(
                mem.store,
                journey=resolved_journey,
                change_request_id=change_request_id,
                notes=notes or "",
            )
        )


def cmd_refinement_story_flow(
    action: str,
    *,
    journey: str | None = None,
    session_id: str | None = None,
    refinement_story_id: str,
    summary: str,
) -> None:
    mem = MemoryClient()
    resolved_journey = _resolve_workbench_journey(
        mem, journey=journey, session_id=session_id, action=f"{action} refinement story"
    )
    if action == "review":
        _print_refinement_event(
            lambda: review_refinement_story(
                mem.store,
                journey=resolved_journey,
                refinement_story_id=refinement_story_id,
                summary=summary,
            )
        )
    elif action == "coherence":
        _print_refinement_event(
            lambda: coherence_refinement_story(
                mem.store,
                journey=resolved_journey,
                refinement_story_id=refinement_story_id,
                summary=summary,
            )
        )
    elif action == "close":
        _print_refinement_event(
            lambda: close_refinement_story(
                mem.store,
                journey=resolved_journey,
                refinement_story_id=refinement_story_id,
                summary=summary,
            )
        )


def cmd_change_request_attach(
    *,
    journey: str | None = None,
    session_id: str | None = None,
    change_request_id: str,
    refinement_story_id: str,
) -> None:
    mem = MemoryClient()
    resolved_journey = _resolve_workbench_journey(
        mem, journey=journey, session_id=session_id, action="attach change request"
    )
    try:
        existing = mem.store.get_change_request(change_request_id)
        if existing is None:
            raise ValueError("change_request_id does not exist")
        if existing.journey != resolved_journey:
            raise ValueError("change_request_id belongs to a different journey")
        attach_change_request_to_story(
            mem.store,
            change_request_id=change_request_id,
            refinement_story_id=refinement_story_id,
        )
        overview = get_refinement_story_overview(
            mem.store,
            journey=resolved_journey,
            refinement_story_id=refinement_story_id,
        )
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)
    print(render_refinement_story_overview_surface(journey=resolved_journey, overview=overview))


def cmd_refinement_story_pull(
    *,
    journey: str | None = None,
    session_id: str | None = None,
    refinement_story_id: str,
) -> None:
    mem = MemoryClient()
    resolved_journey = _resolve_workbench_journey(
        mem, journey=journey, session_id=session_id, action="pull refinement story"
    )
    try:
        overview = pull_refinement_story(
            mem.store,
            journey=resolved_journey,
            refinement_story_id=refinement_story_id,
        )
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)
    print(render_refinement_story_pulled_surface(journey=resolved_journey, overview=overview))


def cmd_refinement_story_overview(
    *,
    journey: str | None = None,
    session_id: str | None = None,
    refinement_story_id: str,
) -> None:
    mem = MemoryClient()
    resolved_journey = _resolve_workbench_journey(
        mem, journey=journey, session_id=session_id, action="show refinement story overview"
    )
    try:
        overview = get_refinement_story_overview(
            mem.store,
            journey=resolved_journey,
            refinement_story_id=refinement_story_id,
        )
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)
    print(render_refinement_story_overview_surface(journey=resolved_journey, overview=overview))


def cmd_prepare_item(
    method: str,
    *,
    journey: str | None = None,
    session_id: str | None = None,
) -> None:
    mem = MemoryClient()
    _reject_unknown_method(method)
    resolved_journey = _resolve_builder_journey(
        mem,
        journey=journey,
        session_id=session_id,
        action="prepare",
    )
    journey_content = mem.get_identity("journey", resolved_journey)
    if not journey_content:
        print(f"Error: journey '{resolved_journey}' not found.", file=sys.stderr)
        sys.exit(1)
    _require_adopted_method(mem, resolved_journey, method)
    _require_delivery_cursor(mem, resolved_journey)
    project_path = mem.journeys.get_project_path(resolved_journey)
    try:
        report = prepare_lifecycle_item(
            mem.store,
            journey=resolved_journey,
            method=method,
            project_path=Path(project_path) if project_path else None,
        )
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)
    print(render_prepare_report(report))


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Build skill — DB context loader")
    sub = parser.add_subparsers(dest="command", required=True)

    p_load = sub.add_parser("load", help="Load journey context from DB (emits project_path)")
    p_load.add_argument("slug", help="Journey ID")
    p_load.add_argument(
        "--ignore-production-role",
        action="store_true",
        dest="ignore_production_role",
        help="Override the production clone role guard for this invocation",
    )
    p_load.add_argument(
        "--session-id",
        default=None,
        help="Runtime session id for session-scoped operating mode state",
    )

    p_inspect = sub.add_parser(
        "inspect-method",
        help="Inspect a Builder method or the effective method state for a journey",
    )
    p_inspect.add_argument(
        "method",
        nargs="?",
        help="Builder method id to inspect, such as 'ariad'",
    )
    p_inspect.add_argument(
        "--journey",
        default=None,
        help="Journey slug whose effective Builder method state should be inspected",
    )
    p_inspect.add_argument(
        "--session-id",
        default=None,
        help="Runtime session id for resolving the active Builder journey",
    )

    p_adopt = sub.add_parser(
        "adopt",
        help="Adopt a Builder method for a journey",
    )
    p_adopt.add_argument(
        "--method",
        required=True,
        help="Builder method id to adopt, such as 'ariad'",
    )
    p_adopt.add_argument(
        "--journey",
        default=None,
        help="Journey slug that should adopt the Builder method",
    )
    p_adopt.add_argument(
        "--session-id",
        default=None,
        help="Runtime session id for resolving the active Builder journey",
    )

    p_templates = sub.add_parser(
        "prepare-templates",
        help="Prepare method templates for an adopted Builder journey",
    )
    p_templates.add_argument(
        "--method",
        required=True,
        help="Builder method id whose templates should be prepared, such as 'ariad'",
    )
    p_templates.add_argument(
        "--journey",
        default=None,
        help="Journey slug whose project should receive method templates",
    )
    p_templates.add_argument(
        "--session-id",
        default=None,
        help="Runtime session id for resolving the active Builder journey",
    )

    p_cursor = sub.add_parser(
        "sync-cursor",
        help="Sync the initial delivery cursor for an adopted Builder journey",
    )
    p_cursor.add_argument(
        "--method",
        required=True,
        help="Builder method id whose cursor should be synced, such as 'ariad'",
    )
    p_cursor.add_argument(
        "--journey",
        default=None,
        help="Journey slug whose delivery cursor should be synced",
    )
    p_cursor.add_argument(
        "--session-id",
        default=None,
        help="Runtime session id for resolving the active Builder journey",
    )

    p_candidates = sub.add_parser(
        "pull-candidates",
        help="Inspect Ariad roadmap items that can be pulled",
    )
    p_candidates.add_argument("--method", required=True, help="Builder method id, such as 'ariad'")
    p_candidates.add_argument("--journey", default=None, help="Journey slug for inspection")
    p_candidates.add_argument(
        "--session-id",
        default=None,
        help="Runtime session id for resolving the active Builder journey",
    )

    p_pull = sub.add_parser(
        "pull-item",
        help="Pull an Ariad lifecycle item into active Builder work",
    )
    p_pull.add_argument("--method", required=True, help="Builder method id, such as 'ariad'")
    p_pull.add_argument("--journey", default=None, help="Journey slug for the pull")
    p_pull.add_argument(
        "--session-id",
        default=None,
        help="Runtime session id for resolving the active Builder journey",
    )
    p_pull.add_argument("--item-code", required=True, help="Roadmap item code")
    p_pull.add_argument("--item-title", required=True, help="Roadmap item title")
    p_pull.add_argument(
        "--item-level",
        required=True,
        help="Roadmap item level: delivery_story, user_story, or technical_story",
    )
    p_pull.add_argument("--why-now", required=True, help="Why this item/level is pulled now")

    p_ds_validate = sub.add_parser(
        "validate-delivery-story", help="Validate aggregate Delivery Story result"
    )
    p_ds_validate.add_argument("--method", required=True)
    p_ds_validate.add_argument("--journey", default=None)
    p_ds_validate.add_argument("--session-id", default=None)
    p_ds_validate.add_argument("--summary", required=True)
    p_ds_validate.add_argument("--navigator-accepted", action="store_true")

    p_ds_review = sub.add_parser(
        "review-delivery-story", help="Review aggregate Delivery Story debt"
    )
    p_ds_review.add_argument("--method", required=True)
    p_ds_review.add_argument("--journey", default=None)
    p_ds_review.add_argument("--session-id", default=None)
    p_ds_review.add_argument("--decision", required=True, choices=("no_action", "defer", "pay_now"))
    p_ds_review.add_argument("--summary", required=True)

    p_ds_coherence = sub.add_parser(
        "coherence-delivery-story", help="Check aggregate Delivery Story coherence"
    )
    p_ds_coherence.add_argument("--method", required=True)
    p_ds_coherence.add_argument("--journey", default=None)
    p_ds_coherence.add_argument("--session-id", default=None)
    p_ds_coherence.add_argument("--summary", required=True)

    p_ds_done = sub.add_parser("done-delivery-story", help="Close aggregate Delivery Story")
    p_ds_done.add_argument("--method", required=True)
    p_ds_done.add_argument("--journey", default=None)
    p_ds_done.add_argument("--session-id", default=None)
    p_ds_done.add_argument("--summary", required=True)

    p_ds_plan = sub.add_parser(
        "plan-delivery-story",
        help="Create an aggregate Ariad Delivery Story Plan checkpoint",
    )
    p_ds_plan.add_argument("--method", required=True, help="Builder method id, such as 'ariad'")
    p_ds_plan.add_argument("--journey", default=None, help="Journey slug for DS Plan")
    p_ds_plan.add_argument(
        "--session-id",
        default=None,
        help="Runtime session id for resolving the active Builder journey",
    )
    p_ds_plan.add_argument(
        "--objective", required=True, help="Aggregate Delivery Story Plan objective"
    )
    p_ds_plan.add_argument(
        "--child",
        dest="children",
        action="append",
        default=[],
        help="Child work package id; may be repeated",
    )

    p_ds_approve = sub.add_parser(
        "approve-delivery-story-plan",
        help="Approve the active aggregate Ariad Delivery Story Plan checkpoint",
    )
    p_ds_approve.add_argument("--method", required=True, help="Builder method id, such as 'ariad'")
    p_ds_approve.add_argument("--journey", default=None, help="Journey slug for DS Plan approval")
    p_ds_approve.add_argument(
        "--session-id",
        default=None,
        help="Runtime session id for resolving the active Builder journey",
    )

    p_plan = sub.add_parser(
        "plan-item",
        help="Create the Ariad Plan checkpoint for the prepared lifecycle item",
    )
    p_plan.add_argument("--method", required=True, help="Builder method id, such as 'ariad'")
    p_plan.add_argument("--journey", default=None, help="Journey slug for Plan")
    p_plan.add_argument(
        "--session-id",
        default=None,
        help="Runtime session id for resolving the active Builder journey",
    )
    p_plan.add_argument(
        "--objective",
        default=None,
        help="Optional objective to show in the Plan checkpoint",
    )
    p_approve = sub.add_parser(
        "approve-plan",
        help="Approve the active Ariad Plan checkpoint",
    )
    p_approve.add_argument("--method", required=True, help="Builder method id, such as 'ariad'")
    p_approve.add_argument("--journey", default=None, help="Journey slug for Plan approval")
    p_approve.add_argument(
        "--session-id",
        default=None,
        help="Runtime session id for resolving the active Builder journey",
    )

    p_flow = sub.add_parser(
        "set-flow-unit",
        help="Inspect or set the Ariad Navigator flow unit",
    )
    p_flow.add_argument("--method", required=True, help="Builder method id, such as 'ariad'")
    p_flow.add_argument(
        "--unit",
        choices=ALLOWED_FLOW_UNITS,
        default=None,
        help="Navigator flow unit: story_by_story or delivery_story. Omit to inspect.",
    )
    p_flow.add_argument("--journey", default=None, help="Journey slug for flow-unit update")
    p_flow.add_argument(
        "--session-id",
        default=None,
        help="Runtime session id for resolving the active Builder journey",
    )

    p_cadence = sub.add_parser(
        "set-cadence",
        help="Set Ariad Builder cadence profile",
    )
    p_cadence.add_argument("--method", required=True, help="Builder method id, such as 'ariad'")
    p_cadence.add_argument(
        "--profile",
        required=True,
        help="Cadence profile: stepwise, checkpoint, accelerated, or autonomous",
    )
    p_cadence.add_argument(
        "--limit",
        dest="limits",
        action="append",
        default=[],
        help="Autonomous cadence limit; may be repeated",
    )
    p_cadence.add_argument("--journey", default=None, help="Journey slug for cadence update")
    p_cadence.add_argument(
        "--session-id",
        default=None,
        help="Runtime session id for resolving the active Builder journey",
    )

    p_check = sub.add_parser(
        "check-implementation",
        help="Check whether implementation is allowed by the Builder cursor gate",
    )
    p_check.add_argument("--method", required=True, help="Builder method id, such as 'ariad'")
    p_check.add_argument("--journey", default=None, help="Journey slug for the check")
    p_check.add_argument(
        "--session-id",
        default=None,
        help="Runtime session id for resolving the active Builder journey",
    )

    p_continue = sub.add_parser(
        "continue-lifecycle",
        help="Continue Ariad lifecycle through bypassable soft stops for the active cadence",
    )
    p_continue.add_argument("--method", required=True, help="Builder method id, such as 'ariad'")
    p_continue.add_argument("--journey", default=None, help="Journey slug for continuation")
    p_continue.add_argument(
        "--session-id",
        default=None,
        help="Runtime session id for resolving the active Builder journey",
    )
    p_continue.add_argument("--process", default=None, help="Process alignment evidence")
    p_continue.add_argument("--project", default=None, help="Project alignment evidence")
    p_continue.add_argument("--product", default=None, help="Product alignment evidence")
    p_continue.add_argument(
        "--local-difference",
        dest="local_differences",
        action="append",
        default=[],
        help="Local guide vs Ariad difference; may be repeated",
    )
    p_continue.add_argument(
        "--history-action", default=None, help="History action taken or proposed"
    )
    p_continue.add_argument("--roadmap-update", default=None, help="Roadmap/story package update")
    p_continue.add_argument("--next-recommendation", default=None, help="Next Ariad movement")

    p_coherence = sub.add_parser(
        "coherence-item",
        help="Render the Ariad Coherence checkpoint for the active item",
    )
    p_coherence.add_argument("--method", required=True, help="Builder method id, such as 'ariad'")
    p_coherence.add_argument("--journey", default=None, help="Journey slug for Coherence")
    p_coherence.add_argument(
        "--session-id",
        default=None,
        help="Runtime session id for resolving the active Builder journey",
    )
    p_coherence.add_argument("--process", default=None, help="Process alignment evidence")
    p_coherence.add_argument("--project", default=None, help="Project alignment evidence")
    p_coherence.add_argument("--product", default=None, help="Product alignment evidence")
    p_coherence.add_argument(
        "--local-difference",
        dest="local_differences",
        action="append",
        default=[],
        help="Local guide vs Ariad difference; may be repeated",
    )

    p_done = sub.add_parser(
        "done-item",
        help="Render the Ariad Done checkpoint for the active item",
    )
    p_done.add_argument("--method", required=True, help="Builder method id, such as 'ariad'")
    p_done.add_argument("--journey", default=None, help="Journey slug for Done")
    p_done.add_argument(
        "--session-id",
        default=None,
        help="Runtime session id for resolving the active Builder journey",
    )
    p_done.add_argument("--history-action", default=None, help="History action taken or proposed")
    p_done.add_argument("--roadmap-update", default=None, help="Roadmap/story package update")
    p_done.add_argument("--next-recommendation", default=None, help="Next Ariad movement")

    p_review = sub.add_parser(
        "review-item",
        help="Render the Ariad Debt Review checkpoint for the active item",
    )
    p_review.add_argument("--method", required=True, help="Builder method id, such as 'ariad'")
    p_review.add_argument("--journey", default=None, help="Journey slug for Debt Review")
    p_review.add_argument(
        "--session-id",
        default=None,
        help="Runtime session id for resolving the active Builder journey",
    )
    p_review.add_argument(
        "--debt",
        dest="debt_findings",
        action="append",
        default=[],
        help="Debt finding; may be repeated",
    )
    p_review.add_argument(
        "--decision",
        default="pending",
        choices=("pending", "no_action", "defer", "pay_now"),
        help="Navigator debt decision",
    )
    p_review.add_argument("--defer-reason", default=None, help="Reason for deferred debt")
    p_review.add_argument("--revisit-trigger", default=None, help="Trigger for revisiting debt")

    p_validate = sub.add_parser(
        "validate-item",
        help="Render the Ariad Validation checkpoint for the active item",
    )
    p_validate.add_argument("--method", required=True, help="Builder method id, such as 'ariad'")
    p_validate.add_argument("--journey", default=None, help="Journey slug for Validation")
    p_validate.add_argument(
        "--session-id",
        default=None,
        help="Runtime session id for resolving the active Builder journey",
    )
    p_validate.add_argument(
        "--check",
        dest="checks",
        action="append",
        default=[],
        help="Automated check command/evidence; may be repeated",
    )
    p_validate.add_argument(
        "--checks-status",
        default="not_run",
        choices=("passed", "failed", "not_run"),
        help="Automated checks result",
    )
    p_validate.add_argument(
        "--e2e-decision",
        default="not_required",
        choices=("required", "not_required", "waived", "skipped"),
        help="E2E validation decision",
    )
    p_validate.add_argument("--e2e-evidence", default=None, help="E2E evidence or waiver reason")
    p_validate.add_argument(
        "--navigator-route", default=None, help="Navigator-visible validation route"
    )
    p_validate.add_argument(
        "--navigator-accepted",
        action="store_true",
        help="Record explicit Navigator acceptance of the validation route/evidence",
    )
    p_validate.add_argument(
        "--expected-observation", default=None, help="Expected Navigator observation"
    )
    p_validate.add_argument("--pass-condition", default=None, help="Validation pass condition")
    p_validate.add_argument("--fail-condition", default=None, help="Validation fail condition")
    p_validate.add_argument(
        "--implementation-complete",
        action="store_true",
        help="Record that implementation work has completed before validation",
    )

    p_refinement_story = sub.add_parser(
        "refinement-story",
        help="Create or inspect Builder Workbench Refinement Stories",
    )
    refinement_story_sub = p_refinement_story.add_subparsers(
        dest="refinement_story_action", required=True
    )
    p_rs_create = refinement_story_sub.add_parser("create", help="Create a Refinement Story")
    p_rs_create.add_argument("--journey", default=None, help="Journey slug")
    p_rs_create.add_argument("--session-id", default=None, help="Runtime session id")
    p_rs_create.add_argument("--title", required=True, help="Refinement Story title")
    p_rs_create.add_argument("--description", default=None, help="Refinement Story description")
    p_rs_create.add_argument("--source", default="manual", help="Source label")
    p_rs_create.add_argument("--provenance", default=None, help="Provenance note")
    p_rs_overview = refinement_story_sub.add_parser(
        "overview", help="Render a Refinement Story overview"
    )
    p_rs_overview.add_argument("--journey", default=None, help="Journey slug")
    p_rs_overview.add_argument("--session-id", default=None, help="Runtime session id")
    p_rs_overview.add_argument("--refinement-story-id", required=True, help="Refinement Story id")
    p_rs_pull = refinement_story_sub.add_parser(
        "pull", help="Pull a Refinement Story into active Refinement Work"
    )
    p_rs_pull.add_argument("--journey", default=None, help="Journey slug")
    p_rs_pull.add_argument("--session-id", default=None, help="Runtime session id")
    p_rs_pull.add_argument("--refinement-story-id", required=True, help="Refinement Story id")

    p_change_request = sub.add_parser(
        "change-request",
        help="Capture or attach Builder Workbench Change Requests",
    )
    change_request_sub = p_change_request.add_subparsers(
        dest="change_request_action", required=True
    )
    p_cr_capture = change_request_sub.add_parser("capture", help="Capture a Change Request")
    p_cr_capture.add_argument("--journey", default=None, help="Journey slug")
    p_cr_capture.add_argument("--session-id", default=None, help="Runtime session id")
    p_cr_capture.add_argument("--title", required=True, help="Change Request title")
    p_cr_capture.add_argument("--body", required=True, help="Change Request body")
    p_cr_capture.add_argument(
        "--refinement-story-id", default=None, help="Optional Refinement Story id"
    )
    p_cr_capture.add_argument("--source", default="manual", help="Source label")
    p_cr_capture.add_argument("--provenance", default=None, help="Provenance note")
    p_cr_attach = change_request_sub.add_parser(
        "attach", help="Attach a Change Request to a Refinement Story"
    )
    p_cr_attach.add_argument("--journey", default=None, help="Journey slug")
    p_cr_attach.add_argument("--session-id", default=None, help="Runtime session id")
    p_cr_attach.add_argument("--change-request-id", required=True, help="Change Request id")
    p_cr_attach.add_argument("--refinement-story-id", required=True, help="Refinement Story id")
    for action_name in ("select", "confirm"):
        p_cr_flow = change_request_sub.add_parser(
            action_name, help=f"{action_name} a Change Request"
        )
        p_cr_flow.add_argument("--journey", default=None, help="Journey slug")
        p_cr_flow.add_argument("--session-id", default=None, help="Runtime session id")
        p_cr_flow.add_argument("--change-request-id", required=True, help="Change Request id")
    p_cr_plan = change_request_sub.add_parser("plan", help="Plan a Change Request")
    p_cr_plan.add_argument("--journey", default=None, help="Journey slug")
    p_cr_plan.add_argument("--session-id", default=None, help="Runtime session id")
    p_cr_plan.add_argument("--change-request-id", required=True, help="Change Request id")
    p_cr_plan.add_argument("--summary", required=True, help="Plan summary")
    p_cr_impl = change_request_sub.add_parser(
        "mark-implemented", help="Mark a Change Request implemented"
    )
    p_cr_impl.add_argument("--journey", default=None, help="Journey slug")
    p_cr_impl.add_argument("--session-id", default=None, help="Runtime session id")
    p_cr_impl.add_argument("--change-request-id", required=True, help="Change Request id")
    p_cr_impl.add_argument("--evidence", required=True, help="Implementation evidence")
    p_cr_validate = change_request_sub.add_parser("validate", help="Validate a Change Request")
    p_cr_validate.add_argument("--journey", default=None, help="Journey slug")
    p_cr_validate.add_argument("--session-id", default=None, help="Runtime session id")
    p_cr_validate.add_argument("--change-request-id", required=True, help="Change Request id")
    p_cr_validate.add_argument("--evidence", required=True, help="Validation evidence")
    p_cr_done = change_request_sub.add_parser("done", help="Record Change Request done note")
    p_cr_done.add_argument("--journey", default=None, help="Journey slug")
    p_cr_done.add_argument("--session-id", default=None, help="Runtime session id")
    p_cr_done.add_argument("--change-request-id", required=True, help="Change Request id")
    p_cr_done.add_argument("--notes", required=True, help="Done notes")

    for action_name in ("review", "coherence", "close"):
        p_rs_flow = refinement_story_sub.add_parser(
            action_name, help=f"{action_name} a Refinement Story"
        )
        p_rs_flow.add_argument("--journey", default=None, help="Journey slug")
        p_rs_flow.add_argument("--session-id", default=None, help="Runtime session id")
        p_rs_flow.add_argument("--refinement-story-id", required=True, help="Refinement Story id")
        p_rs_flow.add_argument("--summary", required=True, help="Summary")

    p_prepare = sub.add_parser(
        "prepare-item",
        help="Prepare the pulled Ariad lifecycle item",
    )
    p_prepare.add_argument("--method", required=True, help="Builder method id, such as 'ariad'")
    p_prepare.add_argument("--journey", default=None, help="Journey slug for Prepare")
    p_prepare.add_argument(
        "--session-id",
        default=None,
        help="Runtime session id for resolving the active Builder journey",
    )

    args = parser.parse_args(argv)

    if args.command == "load":
        cmd_load(
            args.slug,
            ignore_production_role=args.ignore_production_role,
            session_id=args.session_id,
        )
    elif args.command == "inspect-method":
        cmd_inspect_method(args.method, journey=args.journey, session_id=args.session_id)
    elif args.command == "adopt":
        cmd_adopt_method(args.method, journey=args.journey, session_id=args.session_id)
    elif args.command == "prepare-templates":
        cmd_prepare_templates(args.method, journey=args.journey, session_id=args.session_id)
    elif args.command == "sync-cursor":
        cmd_sync_cursor(args.method, journey=args.journey, session_id=args.session_id)
    elif args.command == "pull-candidates":
        cmd_pull_candidates(args.method, journey=args.journey, session_id=args.session_id)
    elif args.command == "validate-delivery-story":
        cmd_validate_delivery_story(
            args.method,
            journey=args.journey,
            session_id=args.session_id,
            summary=args.summary,
            navigator_accepted=args.navigator_accepted,
        )
    elif args.command == "review-delivery-story":
        cmd_review_delivery_story(
            args.method,
            journey=args.journey,
            session_id=args.session_id,
            decision=args.decision,
            summary=args.summary,
        )
    elif args.command == "coherence-delivery-story":
        cmd_coherence_delivery_story(
            args.method,
            journey=args.journey,
            session_id=args.session_id,
            summary=args.summary,
        )
    elif args.command == "done-delivery-story":
        cmd_done_delivery_story(
            args.method,
            journey=args.journey,
            session_id=args.session_id,
            summary=args.summary,
        )
    elif args.command == "plan-delivery-story":
        cmd_plan_delivery_story(
            args.method,
            journey=args.journey,
            session_id=args.session_id,
            objective=args.objective,
            child_work_items=tuple(args.children),
        )
    elif args.command == "approve-delivery-story-plan":
        cmd_approve_delivery_story_plan(
            args.method,
            journey=args.journey,
            session_id=args.session_id,
        )
    elif args.command == "plan-item":
        cmd_plan_item(
            args.method,
            journey=args.journey,
            session_id=args.session_id,
            objective=args.objective,
        )
    elif args.command == "approve-plan":
        cmd_approve_plan(args.method, journey=args.journey, session_id=args.session_id)
    elif args.command == "set-flow-unit":
        cmd_set_flow_unit(
            args.method,
            unit=args.unit,
            journey=args.journey,
            session_id=args.session_id,
        )
    elif args.command == "set-cadence":
        cmd_set_cadence(
            args.method,
            profile=args.profile,
            limits=tuple(args.limits),
            journey=args.journey,
            session_id=args.session_id,
        )
    elif args.command == "check-implementation":
        cmd_check_implementation(args.method, journey=args.journey, session_id=args.session_id)
    elif args.command == "pull-item":
        cmd_pull_item(
            args.method,
            journey=args.journey,
            session_id=args.session_id,
            item_code=args.item_code,
            item_title=args.item_title,
            item_level=args.item_level,
            why_now=args.why_now,
        )
    elif args.command == "continue-lifecycle":
        cmd_continue_lifecycle(
            args.method,
            journey=args.journey,
            session_id=args.session_id,
            process_alignment=args.process,
            project_alignment=args.project,
            product_alignment=args.product,
            local_differences=tuple(args.local_differences),
            history_action=args.history_action,
            roadmap_update=args.roadmap_update,
            next_recommendation=args.next_recommendation,
        )
    elif args.command == "coherence-item":
        cmd_coherence_item(
            args.method,
            journey=args.journey,
            session_id=args.session_id,
            process_alignment=args.process,
            project_alignment=args.project,
            product_alignment=args.product,
            local_differences=tuple(args.local_differences),
        )
    elif args.command == "done-item":
        cmd_done_item(
            args.method,
            journey=args.journey,
            session_id=args.session_id,
            history_action=args.history_action,
            roadmap_update=args.roadmap_update,
            next_recommendation=args.next_recommendation,
        )
    elif args.command == "review-item":
        cmd_review_item(
            args.method,
            journey=args.journey,
            session_id=args.session_id,
            debt_findings=tuple(args.debt_findings),
            debt_decision=args.decision,
            defer_reason=args.defer_reason,
            revisit_trigger=args.revisit_trigger,
        )
    elif args.command == "validate-item":
        cmd_validate_item(
            args.method,
            journey=args.journey,
            session_id=args.session_id,
            checks=tuple(args.checks),
            checks_status=args.checks_status,
            e2e_decision=args.e2e_decision,
            e2e_evidence=args.e2e_evidence,
            navigator_route=args.navigator_route,
            navigator_accepted=args.navigator_accepted,
            expected_observation=args.expected_observation,
            pass_condition=args.pass_condition,
            fail_condition=args.fail_condition,
            implementation_complete=args.implementation_complete,
        )
    elif args.command == "refinement-story":
        if args.refinement_story_action == "create":
            cmd_refinement_story_create(
                journey=args.journey,
                session_id=args.session_id,
                title=args.title,
                description=args.description,
                source=args.source,
                provenance=args.provenance,
            )
        elif args.refinement_story_action == "overview":
            cmd_refinement_story_overview(
                journey=args.journey,
                session_id=args.session_id,
                refinement_story_id=args.refinement_story_id,
            )
        elif args.refinement_story_action == "pull":
            cmd_refinement_story_pull(
                journey=args.journey,
                session_id=args.session_id,
                refinement_story_id=args.refinement_story_id,
            )
        elif args.refinement_story_action in {"review", "coherence", "close"}:
            cmd_refinement_story_flow(
                args.refinement_story_action,
                journey=args.journey,
                session_id=args.session_id,
                refinement_story_id=args.refinement_story_id,
                summary=args.summary,
            )
    elif args.command == "change-request":
        if args.change_request_action == "capture":
            cmd_change_request_capture(
                journey=args.journey,
                session_id=args.session_id,
                title=args.title,
                body=args.body,
                refinement_story_id=args.refinement_story_id,
                source=args.source,
                provenance=args.provenance,
            )
        elif args.change_request_action == "attach":
            cmd_change_request_attach(
                journey=args.journey,
                session_id=args.session_id,
                change_request_id=args.change_request_id,
                refinement_story_id=args.refinement_story_id,
            )
        elif args.change_request_action in {
            "select",
            "confirm",
            "plan",
            "mark-implemented",
            "validate",
            "done",
        }:
            cmd_change_request_flow(
                args.change_request_action,
                journey=args.journey,
                session_id=args.session_id,
                change_request_id=args.change_request_id,
                summary=getattr(args, "summary", None),
                evidence=getattr(args, "evidence", None),
                notes=getattr(args, "notes", None),
            )
    elif args.command == "prepare-item":
        cmd_prepare_item(args.method, journey=args.journey, session_id=args.session_id)
