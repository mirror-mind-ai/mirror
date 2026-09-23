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


def test_render_builder_resume_surface_shows_one_file_first_state_without_an_index(store):
    """CV22.DS10.TS4: no canonical index means no Refinement authority YET.

    Before this story the field read active RS/CR out of the SQLite Workbench
    here. The Workbench is retired, so the honest answer is a single state
    naming the file to create -- not a second kind of store to consult.
    """
    set_adopted_method(store, "sandbox-pet-store", "ariad")
    set_delivery_cursor(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV20.DS6",
        last_delivery_event="delivery_story_done_complete",
    )
    state = read_builder_resume_state(store, "sandbox-pet-store")

    rendered = render_builder_resume_surface(state)

    assert "🧰 Refinement field" in rendered
    assert "authority: project files (not started)" in rendered
    assert "create: docs/project/refinement/index.md" in rendered
    assert "active RS:" not in rendered
    assert "last refinement event:" not in rendered
    assert "no story lifecycle work" in rendered


def test_render_builder_resume_surface_orients_to_the_canonical_project_index(
    store,
):
    set_adopted_method(store, "sandbox-pet-store", "ariad")
    set_delivery_cursor(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV20.DS12.US2",
    )
    state = read_builder_resume_state(store, "sandbox-pet-store")

    rendered = render_builder_resume_surface(
        state,
        canonical_refinement_index="docs/project/refinement/index.md",
    )

    assert "authority: project files" in rendered
    assert "(not started)" not in rendered
    assert "docs/project/refinement/index.md" in rendered
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
