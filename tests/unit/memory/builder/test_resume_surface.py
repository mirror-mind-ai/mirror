from memory.builder.delivery_cursor import BuilderDeliveryCursor, set_delivery_cursor
from memory.builder.method_adoption import set_adopted_method
from memory.builder.resume_state import BuilderResumeState, read_builder_resume_state
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


def test_render_builder_resume_surface_shows_non_authorizing_release_intent():
    state = BuilderResumeState(
        journey="sandbox-pet-store",
        adopted_method="ariad",
        cursor=BuilderDeliveryCursor(
            journey="sandbox-pet-store",
            method="ariad",
            active_item="CV20.DS7.US1",
            release_intent_delivery_story="CV20.DS7",
            release_intent="planned",
        ),
        resumable=True,
        reason=None,
        allowed_next_actions=("prepare_active_item",),
    )

    rendered = render_builder_resume_surface(state)

    assert "release intent" in rendered
    assert "CV20.DS7: planned" in rendered
    assert "intent is not release authorization" in rendered


def test_render_builder_resume_surface_shows_active_refinement_field(store):
    set_adopted_method(store, "sandbox-pet-store", "ariad")
    set_delivery_cursor(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV20.DS6",
        last_delivery_event="delivery_story_done_complete",
    )
    story = store.create_refinement_story(
        journey="sandbox-pet-store",
        title="Refinement Surfaces Improvements",
    )
    cr = store.create_change_request(
        journey="sandbox-pet-store",
        refinement_story_id=story.id,
        title="Show Active Refinement Work In Builder Resume",
        body="Show active Refinement Work in Builder Resume.",
    )
    store.update_refinement_story_status(story.id, "active")
    store.update_change_request_status(cr.id, "planned")
    store.set_refinement_cursor(
        journey="sandbox-pet-store",
        active_refinement_story_id=story.id,
        active_change_request_id=cr.id,
        last_refinement_event="change_request_planned",
    )
    state = read_builder_resume_state(store, "sandbox-pet-store")

    rendered = render_builder_resume_surface(state)

    assert "🧰 Refinement field" in rendered
    assert "active RS: RS001: Refinement Surfaces Improvements" in rendered
    assert "active CR: CR001: Show Active Refinement Work In" in rendered
    assert "last refinement event: change_request_planned" in rendered
    assert "next refinement move: continue active Change Request" in rendered
    assert story.id not in rendered
    assert cr.id not in rendered
    assert "no story lifecycle work" in rendered


def test_render_builder_resume_surface_prefers_canonical_project_index_to_legacy_state(
    store,
):
    set_adopted_method(store, "sandbox-pet-store", "ariad")
    set_delivery_cursor(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV20.DS12.US2",
    )
    story = store.create_refinement_story(
        journey="sandbox-pet-store",
        title="Stale Local Refinement",
    )
    store.update_refinement_story_status(story.id, "active")
    store.set_refinement_cursor(
        journey="sandbox-pet-store",
        active_refinement_story_id=story.id,
        last_refinement_event="refinement_story_pulled",
    )
    state = read_builder_resume_state(store, "sandbox-pet-store")

    rendered = render_builder_resume_surface(
        state,
        canonical_refinement_index="docs/project/refinement/index.md",
    )

    assert "authority: project files" in rendered
    assert "docs/project/refinement/index.md" in rendered
    assert "Stale Local Refinement" not in rendered
    assert "last refinement event:" not in rendered


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
