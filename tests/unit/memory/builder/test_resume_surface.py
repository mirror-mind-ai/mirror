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
        allowed_next_actions=("inspect_roadmap", "pull_candidate_if_known", "inspect_method"),
    )
    position = RoadmapPosition(
        code="CV20",
        title="Builder Mode Evolution",
        status="🟢 Active",
        path="docs/project/roadmap/cv20/index.md",
    )

    rendered = render_builder_resume_surface(state, roadmap_position=position)

    assert "<<<ARIAD:BUILDER_RESUME>>>" in rendered
    assert "<<<END:BUILDER_RESUME>>>" in rendered
    assert "│        ■  BUILDER RESUME                               │" in rendered
    assert "╭────────────────────────────────────────────────────────╮" in rendered
    assert "│ journey                                                │" in rendered
    assert "│ sandbox-pet-store                                      │" in rendered
    assert "│ adopted method                                         │" in rendered
    assert "│ ariad                                                  │" in rendered
    assert "│ resumable                                              │" in rendered
    assert "│ yes                                                    │" in rendered
    assert "CV20 — Builder Mode Evolution" in rendered
    assert "│ active item                                            │" in rendered
    assert "│ none                                                   │" in rendered
    assert "│ last delivery event                                    │" in rendered
    assert "│ template_preparation                                   │" in rendered
    assert "│ - inspect_roadmap                                      │" in rendered
    assert "│ - pull_candidate_if_known                              │" in rendered
    assert "no story lifecycle work" in rendered


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

    assert "│ resumable                                              │" in rendered
    assert "│ no                                                     │" in rendered
    assert "│ reason                                                 │" in rendered
    assert "│ adoption_required                                      │" in rendered
    assert "│ roadmap position                                       │" in rendered
    assert "│ none                                                   │" in rendered
