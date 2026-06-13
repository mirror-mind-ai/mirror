import pytest

from memory.builder.method_definition import (
    CheckpointDefinition,
    ContractDefinition,
    DslResolution,
    LifecycleEvent,
    MethodDefinition,
    MethodDefinitionError,
    SurfaceDefinition,
    SurfaceRoute,
    Taxonomy,
    TaxonomyLevel,
    TemplateDefinition,
    validate_method_definition,
)


def _valid_definition() -> MethodDefinition:
    return MethodDefinition(
        id="ariad",
        label="Ariad",
        resolution=DslResolution(
            layers=("method_default", "project_config", "journey_config"),
            conflict_policy="explicit_override",
            audit=True,
        ),
        taxonomy=Taxonomy(
            state_vocabulary=("Planned", "Active", "Done"),
            levels=(
                TaxonomyLevel(
                    id="delivery_story",
                    label="Delivery Story",
                    contains=("user_story",),
                    allowed_states=("Planned", "Active", "Done"),
                    state_semantics={"Done": "delivery arc closed"},
                ),
                TaxonomyLevel(
                    id="user_story",
                    label="User Story",
                    contains=(),
                    allowed_states=("Planned", "Active", "Done"),
                    state_semantics={"Done": "observable behavior closed"},
                ),
            ),
        ),
        lifecycle=(
            LifecycleEvent(id="pull", meaning="escolhe o foco"),
            LifecycleEvent(id="plan", meaning="firma o contrato"),
            LifecycleEvent(id="implement", meaning="muda o sistema"),
        ),
        checkpoints=(
            CheckpointDefinition(
                id="after_plan",
                occurs_after="plan",
                blocks=("implement",),
                required_artifacts=("plan",),
                required_confirmations=("navigator_approval",),
            ),
        ),
        contracts=(
            ContractDefinition(
                id="plan_contract",
                applies_at="plan",
                rules=("define acceptance behavior",),
                stop_conditions=("navigator_approval_required",),
                required_outputs=("validation_route",),
            ),
        ),
        policies={"history": {"commit": {"mode": "propose_and_wait"}}},
        surfaces=(
            SurfaceDefinition(id="plan_checkpoint", event="plan", stops_for="navigator_approval"),
        ),
        surface_routes=(
            SurfaceRoute(
                trigger="show_roadmap",
                surfaces=("plan_checkpoint",),
                intents=("show roadmap",),
            ),
        ),
        templates=(
            TemplateDefinition(
                id="plan",
                path="docs/project/roadmap/templates/plan.md",
                content="# Plan\n",
                description="Plan template",
            ),
        ),
        open_questions={"maintenance": "model later"},
    )


def test_accepts_minimal_valid_method_definition() -> None:
    definition = _valid_definition()

    validate_method_definition(definition)

    assert definition.id == "ariad"
    assert definition.lifecycle_ids == {"pull", "plan", "implement"}
    assert definition.surfaces[0].transport == "verbatim"
    assert definition.surfaces[0].marker_protocol == "ariad_compact"
    assert definition.surfaces[0].interpretation_policy == "after_block_only"
    assert definition.taxonomy.level_ids == {"delivery_story", "user_story"}


def test_rejects_empty_method_id() -> None:
    definition = _valid_definition().replace(id=" ")

    with pytest.raises(MethodDefinitionError, match="method id"):
        validate_method_definition(definition)


def test_rejects_duplicate_taxonomy_level_ids() -> None:
    definition = _valid_definition().replace(
        taxonomy=Taxonomy(
            state_vocabulary=("Planned", "Active", "Done"),
            levels=(
                TaxonomyLevel(id="user_story", label="User Story"),
                TaxonomyLevel(id="user_story", label="Duplicate User Story"),
            ),
        )
    )

    with pytest.raises(MethodDefinitionError, match="duplicate taxonomy level"):
        validate_method_definition(definition)


def test_rejects_duplicate_lifecycle_event_ids() -> None:
    definition = _valid_definition().replace(
        lifecycle=(
            LifecycleEvent(id="pull", meaning="escolhe o foco"),
            LifecycleEvent(id="pull", meaning="duplicate"),
        )
    )

    with pytest.raises(MethodDefinitionError, match="duplicate lifecycle event"):
        validate_method_definition(definition)


def test_rejects_lifecycle_event_without_meaning() -> None:
    definition = _valid_definition().replace(lifecycle=(LifecycleEvent(id="pull", meaning=" "),))

    with pytest.raises(MethodDefinitionError, match="meaning"):
        validate_method_definition(definition)


def test_rejects_checkpoint_references_to_unknown_events() -> None:
    definition = _valid_definition().replace(
        checkpoints=(
            CheckpointDefinition(id="after_plan", occurs_after="plan", blocks=("deploy",)),
        )
    )

    with pytest.raises(MethodDefinitionError, match="unknown lifecycle event"):
        validate_method_definition(definition)


def test_rejects_taxonomy_child_references_to_unknown_levels() -> None:
    definition = _valid_definition().replace(
        taxonomy=Taxonomy(
            state_vocabulary=("Planned", "Done"),
            levels=(
                TaxonomyLevel(
                    id="delivery_story",
                    label="Delivery Story",
                    contains=("unknown_story",),
                    allowed_states=("Planned", "Done"),
                ),
            ),
        )
    )

    with pytest.raises(MethodDefinitionError, match="unknown taxonomy level"):
        validate_method_definition(definition)


def test_rejects_state_semantics_for_disallowed_states() -> None:
    definition = _valid_definition().replace(
        taxonomy=Taxonomy(
            state_vocabulary=("Planned", "Done"),
            levels=(
                TaxonomyLevel(
                    id="user_story",
                    label="User Story",
                    allowed_states=("Planned",),
                    state_semantics={"Done": "closed"},
                ),
            ),
        )
    )

    with pytest.raises(MethodDefinitionError, match="state semantics"):
        validate_method_definition(definition)


def test_rejects_contract_references_unknown_lifecycle_event() -> None:
    definition = _valid_definition().replace(
        contracts=(ContractDefinition(id="plan_contract", applies_at="unknown", rules=("rule",)),)
    )

    with pytest.raises(MethodDefinitionError, match="unknown lifecycle event"):
        validate_method_definition(definition)


def test_rejects_duplicate_contract_rules() -> None:
    definition = _valid_definition().replace(
        contracts=(
            ContractDefinition(
                id="plan_contract",
                applies_at="plan",
                rules=("define scope", "define scope"),
            ),
        )
    )

    with pytest.raises(MethodDefinitionError, match="duplicate contract"):
        validate_method_definition(definition)


def test_rejects_unknown_surface_transport_policy() -> None:
    definition = _valid_definition().replace(
        surfaces=(SurfaceDefinition(id="plan_checkpoint", event="plan", transport="summary"),)
    )

    with pytest.raises(MethodDefinitionError, match="transport"):
        validate_method_definition(definition)


def test_rejects_surface_route_references_unknown_surface() -> None:
    definition = _valid_definition().replace(
        surface_routes=(SurfaceRoute(trigger="show_roadmap", surfaces=("missing",)),)
    )

    with pytest.raises(MethodDefinitionError, match="unknown surface"):
        validate_method_definition(definition)


def test_rejects_surface_route_without_surfaces() -> None:
    definition = _valid_definition().replace(
        surface_routes=(SurfaceRoute(trigger="show_roadmap", surfaces=()),)
    )

    with pytest.raises(MethodDefinitionError, match="at least one surface"):
        validate_method_definition(definition)


def test_rejects_duplicate_template_paths() -> None:
    definition = _valid_definition().replace(
        templates=(
            TemplateDefinition(id="plan", path="docs/templates/plan.md", content="# Plan\n"),
            TemplateDefinition(id="plan-copy", path="docs/templates/plan.md", content="# Plan\n"),
        )
    )

    with pytest.raises(MethodDefinitionError, match="duplicate template path"):
        validate_method_definition(definition)


def test_rejects_template_path_that_escapes_project_root() -> None:
    definition = _valid_definition().replace(
        templates=(TemplateDefinition(id="plan", path="../plan.md", content="# Plan\n"),)
    )

    with pytest.raises(MethodDefinitionError, match="inside project root"):
        validate_method_definition(definition)


def test_rejects_template_without_content() -> None:
    definition = _valid_definition().replace(
        templates=(TemplateDefinition(id="plan", path="docs/templates/plan.md", content=" "),)
    )

    with pytest.raises(MethodDefinitionError, match="content"):
        validate_method_definition(definition)


def test_preserves_generic_policy_payloads_without_ariad_specific_code() -> None:
    definition = _valid_definition().replace(
        policies={
            "custom_method_policy": {
                "nested": {"values": ["kept", "as", "data"]},
            }
        }
    )

    validate_method_definition(definition)

    assert definition.policies["custom_method_policy"]["nested"]["values"] == [
        "kept",
        "as",
        "data",
    ]
