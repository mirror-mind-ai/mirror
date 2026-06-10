"""Rendering helpers for Builder method inspection."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from memory.builder.method_definition import MethodDefinition

AVAILABLE_METHODS = ("ariad",)


def render_available_method(method: MethodDefinition) -> str:
    """Render a built-in Builder method definition for inspection."""
    lines = [
        "■ Builder Method Available",
        "",
        "method",
        method.label,
        "",
        "id",
        method.id,
        "",
        "source",
        "built-in method definition",
        "",
        "resolution layers",
    ]
    lines.extend(f"- {layer}" for layer in method.resolution.layers)
    lines.extend(["", "lifecycle"])
    lines.extend(f"- {_event_label(event.id)} {event.meaning}" for event in method.lifecycle)
    lines.extend(["", "checkpoints"])
    lines.extend(_render_checkpoints(method))
    lines.extend(["", "policies"])
    lines.extend(_render_policies(method.policies or {}))
    lines.extend(["", "surfaces"])
    lines.extend(_render_surfaces(method))
    lines.extend(["", "open questions"])
    lines.extend(_render_open_questions(method.open_questions or {}))
    return "\n".join(lines).rstrip() + "\n"


def render_no_active_journey() -> str:
    """Render method inspection when no journey context is active or provided."""
    return (
        "\n".join(
            [
                "■ Builder Method",
                "",
                "active journey",
                "none",
                "",
                "adopted method",
                "none",
                "",
                "available methods",
                ", ".join(AVAILABLE_METHODS),
                "",
                "status",
                "No Builder journey is active yet.",
                "",
                "next action",
                "Activate Builder Mode for a journey or ask about a specific journey.",
                "",
                "example",
                "uv run python -m memory build load <journey>",
            ]
        )
        + "\n"
    )


def render_journey_method_state(journey: str, adopted_method: str | None) -> str:
    """Render method inspection for a journey."""
    if adopted_method:
        return (
            "\n".join(
                [
                    "■ Builder Method",
                    "",
                    "journey",
                    journey,
                    "",
                    "adopted method",
                    adopted_method,
                    "",
                    "available methods",
                    ", ".join(AVAILABLE_METHODS),
                    "",
                    "status",
                    "Ariad is adopted for this journey."
                    if adopted_method == "ariad"
                    else f"{adopted_method} is adopted for this journey.",
                ]
            )
            + "\n"
        )
    return render_journey_without_adopted_method(journey)


def render_journey_without_adopted_method(journey: str) -> str:
    """Render method inspection for a journey that has not adopted a method."""
    return (
        "\n".join(
            [
                "■ Builder Method",
                "",
                "journey",
                journey,
                "",
                "adopted method",
                "none",
                "",
                "available methods",
                ", ".join(AVAILABLE_METHODS),
                "",
                "status",
                "This journey has not adopted a Builder method yet.",
                "",
                "what can be inspected",
                "built-in method defaults",
                "",
                "what cannot be inspected yet",
                "effective journey configuration",
                "runtime delivery cursor",
                "active checkpoint",
                "pending confirmations",
                "",
                "next action",
                f"uv run python -m memory build adopt --journey {journey} --method ariad",
            ]
        )
        + "\n"
    )


def render_method_adoption_report(
    journey: str,
    method: str,
    *,
    already_adopted: bool = False,
) -> str:
    """Render the Builder method adoption report."""
    status = (
        "Ariad was already adopted for this journey."
        if already_adopted and method == "ariad"
        else "Ariad is now adopted for this journey."
        if method == "ariad"
        else f"{method} is now adopted for this journey."
    )
    return (
        "\n".join(
            [
                "■ Builder Method Adopted",
                "",
                "journey",
                journey,
                "",
                "adopted method",
                method,
                "",
                "status",
                status,
                "",
                "not performed yet",
                "roadmap template generation",
                "runtime delivery cursor sync",
                "story lifecycle execution",
            ]
        )
        + "\n"
    )


def _event_label(event_id: str) -> str:
    return event_id.replace("_", " ").title()


def _render_checkpoints(method: MethodDefinition) -> list[str]:
    if not method.checkpoints:
        return ["none"]
    lines: list[str] = []
    for checkpoint in method.checkpoints:
        lines.append(f"- {checkpoint.id}")
        if checkpoint.occurs_after:
            lines.append(f"  occurs after: {checkpoint.occurs_after}")
        if checkpoint.blocks:
            lines.append(f"  blocks: {', '.join(checkpoint.blocks)}")
        if checkpoint.required_artifacts:
            lines.append(f"  requires artifacts: {', '.join(checkpoint.required_artifacts)}")
        if checkpoint.required_confirmations:
            lines.append(
                f"  requires confirmations: {', '.join(checkpoint.required_confirmations)}"
            )
    return lines


def _render_policies(policies: Mapping[str, Any]) -> list[str]:
    if not policies:
        return ["none"]
    lines: list[str] = []
    history = _mapping_or_empty(policies.get("history"))
    commit = _mapping_or_empty(history.get("commit"))
    if commit:
        lines.append("- history.commit")
        _append_mapping_fields(lines, commit, indent="  ")
    push = _mapping_or_empty(policies.get("push"))
    if push:
        lines.append("- push")
        _append_mapping_fields(lines, push, indent="  ")
    release = _mapping_or_empty(policies.get("release"))
    if release:
        lines.append("- release")
        _append_mapping_fields(lines, release, indent="  ")
    return lines or ["none"]


def _render_surfaces(method: MethodDefinition) -> list[str]:
    if not method.surfaces:
        return ["none"]
    lines: list[str] = []
    for surface in method.surfaces:
        event = surface.event or "none"
        stops_for = f"; stops for: {surface.stops_for}" if surface.stops_for else ""
        lines.append(f"- {surface.id}: {event}{stops_for}")
    return lines


def _render_open_questions(open_questions: Mapping[str, Any]) -> list[str]:
    if not open_questions:
        return ["none"]
    lines: list[str] = []
    for key, value in open_questions.items():
        if isinstance(value, Mapping):
            status = value.get("status")
            note = value.get("note")
            suffix = f" [{status}]" if isinstance(status, str) else ""
            lines.append(f"- {key}{suffix}")
            if isinstance(note, str):
                lines.append(f"  {note}")
        else:
            lines.append(f"- {key}: {value}")
    return lines


def _append_mapping_fields(lines: list[str], data: Mapping[str, Any], *, indent: str) -> None:
    for key, value in data.items():
        if isinstance(value, list):
            rendered = ", ".join(str(item) for item in value)
        else:
            rendered = str(value)
        lines.append(f"{indent}{key}: {rendered}")


def _mapping_or_empty(value: object) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}
