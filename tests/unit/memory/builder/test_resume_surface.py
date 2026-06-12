from memory.builder.delivery_cursor import BuilderDeliveryCursor
from memory.builder.resume_state import BuilderResumeState
from memory.builder.resume_surface import render_builder_resume_surface
from memory.builder.roadmap_position import RoadmapPosition


def test_render_builder_resume_surface_shows_cursor_and_next_actions():
    state = BuilderResumeState(
        journey="sandbox-pet-store",
        adopted_method="ariad",
        cursor=BuilderDeliveryCursor(
            journey="sandbox-pet-store",
            method="ariad",
            last_delivery_event="template_preparation",
        ),
        resumable=True,
        reason=None,
        allowed_next_actions=("inspect_method", "pull_next_story"),
    )
    position = RoadmapPosition(
        code="CV20",
        title="Builder Mode Evolution",
        status="🟢 Active",
        path="docs/project/roadmap/cv20/index.md",
    )

    rendered = render_builder_resume_surface(state, roadmap_position=position)

    assert "BUILDER RESUME" in rendered
    assert "journey\nsandbox-pet-store" in rendered
    assert "adopted method\nariad" in rendered
    assert "resumable\nyes" in rendered
    assert "CV20 — Builder Mode Evolution" in rendered
    assert "active item\nnone" in rendered
    assert "last delivery event\ntemplate_preparation" in rendered
    assert "- pull_next_story" in rendered
    assert "no story lifecycle work was executed" in rendered


def test_render_builder_resume_surface_shows_non_resumable_reason():
    state = BuilderResumeState(
        journey="sandbox-pet-store",
        adopted_method=None,
        cursor=None,
        resumable=False,
        reason="adoption_required",
        allowed_next_actions=("adopt_method",),
    )

    rendered = render_builder_resume_surface(state)

    assert "resumable\nno" in rendered
    assert "reason\nadoption_required" in rendered
    assert "roadmap position\nnone" in rendered
