"""Template preparation helpers for Builder methods."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from memory.builder.method_definition import MethodDefinition, TemplateDefinition

PENDING_TEMPLATE_PREPARATION_ITEMS = (
    "runtime delivery cursor sync",
    "active roadmap item resolution",
    "story lifecycle execution",
    "project/journey override merge",
    "release and push policy enforcement",
)


@dataclass(frozen=True)
class TemplateWriteResult:
    id: str
    path: str
    action: str
    description: str | None = None


@dataclass(frozen=True)
class BuilderTemplatePreparation:
    journey: str
    method: str
    checked: tuple[str, ...]
    created: tuple[TemplateWriteResult, ...]
    preserved: tuple[TemplateWriteResult, ...]
    pending: tuple[str, ...] = PENDING_TEMPLATE_PREPARATION_ITEMS


def prepare_method_templates(
    project_path: Path,
    *,
    journey: str,
    method: MethodDefinition,
) -> BuilderTemplatePreparation:
    """Create missing method templates under a project path without overwriting files."""
    root = project_path.expanduser().resolve()
    created: list[TemplateWriteResult] = []
    preserved: list[TemplateWriteResult] = []
    checked: list[str] = []

    for template in method.templates:
        target = _target_path(root, template)
        checked.append(template.path)
        result = TemplateWriteResult(
            id=template.id,
            path=template.path,
            action="preserved" if target.exists() else "created",
            description=template.description,
        )
        if target.exists():
            preserved.append(result)
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(template.content, encoding="utf-8")
        created.append(result)

    return BuilderTemplatePreparation(
        journey=journey,
        method=method.id,
        checked=tuple(checked),
        created=tuple(created),
        preserved=tuple(preserved),
    )


def render_template_preparation_report(report: BuilderTemplatePreparation) -> str:
    """Render the Ariad template preparation report."""
    lines = [
        "■ Ariad Template Preparation",
        "",
        "journey",
        report.journey,
        "",
        "method",
        report.method,
        "",
        "checked",
        *_format_paths(report.checked),
        "",
        "created",
        *_format_results(report.created),
        "",
        "preserved",
        *_format_results(report.preserved),
        "",
        "pending",
        *report.pending,
        "",
        "boundary",
        "No story lifecycle work was executed.",
    ]
    return "\n".join(lines) + "\n"


def _target_path(root: Path, template: TemplateDefinition) -> Path:
    target = (root / template.path).resolve()
    if not target.is_relative_to(root):
        raise ValueError(f"template path escapes project root: {template.path}")
    return target


def _format_paths(paths: tuple[str, ...]) -> list[str]:
    return list(paths) if paths else ["none"]


def _format_results(results: tuple[TemplateWriteResult, ...]) -> list[str]:
    if not results:
        return ["none"]
    return [result.path for result in results]
