from memory.builder.ariad_method import ARIAD_METHOD, get_ariad_method
from memory.builder.method_definition import validate_method_definition


def test_ariad_method_fixture_is_valid() -> None:
    validate_method_definition(ARIAD_METHOD)
    validate_method_definition(get_ariad_method())


def test_ariad_method_identity_and_resolution_layers() -> None:
    method = get_ariad_method()

    assert method.id == "ariad"
    assert method.label == "Ariad"
    assert method.resolution.layers == (
        "method_default",
        "project_config",
        "journey_config",
        "navigator_override",
    )
    assert method.resolution.conflict_policy == "explicit_override"
    assert method.resolution.audit is True


def test_ariad_taxonomy_contains_expected_levels_and_state_semantics() -> None:
    method = get_ariad_method()
    levels = {level.id: level for level in method.taxonomy.levels}

    assert set(levels) == {"cv", "delivery_story", "user_story", "technical_story", "task"}
    assert levels["cv"].contains == ("delivery_story",)
    assert levels["delivery_story"].contains == ("user_story", "technical_story")
    assert levels["user_story"].contains == ("task",)
    assert levels["technical_story"].contains == ("task",)
    assert levels["user_story"].state_semantics
    assert "observable behavior" in levels["user_story"].state_semantics["Validated"]
    assert levels["technical_story"].state_semantics
    assert "internal capability" in levels["technical_story"].state_semantics["Validated"]


def test_ariad_cadence_profiles_include_conservative_higher_autonomy() -> None:
    method = get_ariad_method()
    profiles = {profile.id: profile for profile in method.cadence_profiles}

    assert profiles["accelerated"].active is True
    assert profiles["accelerated"].stop_policy == "continue_through_soft_stops_stop_at_hard_gates"
    assert profiles["autonomous"].active is True
    assert (
        profiles["autonomous"].stop_policy == "continue_until_hard_constraint_with_explicit_limits"
    )


def test_ariad_lifecycle_matches_exploration_spine() -> None:
    method = get_ariad_method()

    assert [(event.id, event.meaning) for event in method.lifecycle] == [
        ("pull", "escolhe o foco"),
        ("prepare", "lê o terreno"),
        ("expand", "desdobra granularidade"),
        ("plan", "firma o contrato"),
        ("implement", "muda o sistema"),
        ("validation", "prova comportamento"),
        ("review", "encara a dívida"),
        ("coherence", "integra os rastros"),
        ("done", "registra e fecha"),
    ]


def test_after_plan_checkpoint_blocks_implement_until_approval() -> None:
    method = get_ariad_method()
    checkpoints = {checkpoint.id: checkpoint for checkpoint in method.checkpoints}

    after_plan = checkpoints["after_plan"]
    assert after_plan.occurs_after == "plan"
    assert after_plan.blocks == ("implement",)
    assert after_plan.required_artifacts == ("plan",)
    assert after_plan.required_confirmations == ("navigator_approval",)


def test_ariad_contracts_cover_lifecycle_rules() -> None:
    method = get_ariad_method()
    contracts = {contract.id: contract for contract in method.contracts}

    assert set(contracts) == {
        "pull_contract",
        "prepare_contract",
        "expand_contract",
        "plan_contract",
        "implement_contract",
        "validation_contract",
        "debt_review_contract",
        "coherence_contract",
        "done_contract",
    }
    assert contracts["pull_contract"].applies_at == "pull"
    assert contracts["debt_review_contract"].applies_at == "review"
    assert contracts["expand_contract"].applies_at == "expand"
    assert "Given/When/Then/And" in " ".join(contracts["plan_contract"].rules)
    assert "E2E validation" in " ".join(contracts["plan_contract"].rules)
    assert "TDD" in " ".join(contracts["implement_contract"].rules)
    assert "scoped to the active story" in " ".join(contracts["implement_contract"].rules)
    assert "E2E tests" in " ".join(contracts["validation_contract"].rules)
    assert "local development guide" in " ".join(contracts["coherence_contract"].rules)


def test_ariad_policies_capture_history_push_and_release() -> None:
    method = get_ariad_method()
    policies = method.policies or {}

    assert policies["history"]["commit"]["mode"] == "propose_and_wait"
    assert policies["history"]["commit"]["granularity"] == "coherent_story"
    assert policies["push"]["mode"] == "ask_before_push"
    assert "release_publish" in policies["push"]["allowed_after"]
    assert policies["release"]["modes"] == ["planned_release", "emergent_release"]


def test_ariad_declares_adoption_templates_as_method_data() -> None:
    method = get_ariad_method()
    templates = {template.id: template for template in method.templates}

    assert set(templates) == {
        "ariad_adoption",
        "technical_debt_ledger",
        "delivery_story_index",
        "user_story_index",
        "technical_story_index",
        "plan",
        "test_guide",
        "review",
        "coherence",
    }
    assert templates["plan"].path == "docs/project/roadmap/templates/plan.md"
    assert "Implementation must not start" in templates["plan"].content
    assert templates["technical_debt_ledger"].path == (
        "docs/project/roadmap/technical-debt-ledger.md"
    )
    assert "Navigator Decision" in templates["technical_debt_ledger"].content


def test_ariad_surfaces_bind_to_lifecycle_and_entrypoint_events() -> None:
    method = get_ariad_method()
    surfaces = {surface.id: surface for surface in method.surfaces}

    assert surfaces["adoption_report"].event == "adoption"
    assert surfaces["builder_resume"].event == "on_builder_load"
    assert surfaces["roadmap_snapshot"].event == "roadmap_inspection"
    assert surfaces["pull_candidates"].event == "roadmap_inspection"
    assert surfaces["plan_checkpoint"].event == "plan"
    assert surfaces["plan_checkpoint"].stops_for == "navigator_approval"
    assert surfaces["validation_checkpoint"].event == "validation"
    assert surfaces["debt_review_checkpoint"].event == "review"
    assert surfaces["coherence_checkpoint"].event == "coherence"
    assert surfaces["done_checkpoint"].event == "done"
    assert all(surface.transport == "verbatim" for surface in method.surfaces)
    assert all(surface.marker_protocol == "ariad_compact" for surface in method.surfaces)
    assert all(surface.interpretation_policy == "after_block_only" for surface in method.surfaces)


def test_ariad_surface_routes_configure_roadmap_inspection() -> None:
    method = get_ariad_method()
    routes = {route.trigger: route for route in method.surface_routes}

    show_roadmap = routes["show_roadmap"]
    assert show_roadmap.surfaces == ("roadmap_snapshot", "pull_candidates")
    assert "show roadmap" in show_roadmap.intents


def test_ariad_open_questions_preserve_deferred_design_areas() -> None:
    method = get_ariad_method()
    open_questions = method.open_questions or {}

    assert open_questions["maintenance_and_operational_updates"]["status"] == "open"
    assert open_questions["final_surface_content"]["status"] == "open"
    assert open_questions["final_dsl_file_format"]["status"] == "open"
