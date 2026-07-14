"""Runtime status reports the Node runtime (CR025, RS004 devops audit)."""

from __future__ import annotations

from memory.cli.runtime import (
    CloneRole,
    CoreMigrationHealth,
    GitStatus,
    RuntimeStatusReport,
    detect_node_version,
    render_runtime_status,
)


def _report(node_version: str | None) -> RuntimeStatusReport:
    return RuntimeStatusReport(
        version="0.0.0",
        git=GitStatus(repository=None, branch=None, commit=None, dirty=False),
        mirror_home=None,
        mirror_home_error=None,
        db_path=None,
        db_exists=None,
        core_migrations=CoreMigrationHealth(ready=True, applied_count=0, known_count=0, missing=()),
        extensions=(),
        extension_health=(),
        clone_role=CloneRole("production", None),
        python_version="3.12.0",
        memory_env="test",
        node_version=node_version,
    )


def test_render_shows_detected_node_version() -> None:
    assert "Node: 24.3.0" in render_runtime_status(_report("24.3.0"))


def test_render_flags_missing_node_with_the_requirement() -> None:
    rendered = render_runtime_status(_report(None))
    assert "Node: not found" in rendered
    assert ">= 24" in rendered


def test_detect_node_version_returns_a_dotted_version_here() -> None:
    # Node is present in dev/CI; the detector must strip the leading "v".
    detected = detect_node_version()
    assert detected is not None
    assert detected[0].isdigit()
