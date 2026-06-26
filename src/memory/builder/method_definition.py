"""Typed model for Builder delivery method definitions."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, replace
from typing import Any


class MethodDefinitionError(ValueError):
    """Raised when a Builder method definition is structurally invalid."""


@dataclass(frozen=True)
class DslResolution:
    layers: tuple[str, ...] = ("method_default",)
    conflict_policy: str = "explicit_override"
    audit: bool = True


@dataclass(frozen=True)
class TaxonomyLevel:
    id: str
    label: str
    contains: tuple[str, ...] = ()
    allowed_states: tuple[str, ...] = ()
    state_semantics: Mapping[str, str] | None = None

    def replace(self, **changes: Any) -> TaxonomyLevel:
        return replace(self, **changes)


@dataclass(frozen=True)
class Taxonomy:
    state_vocabulary: tuple[str, ...] = ()
    levels: tuple[TaxonomyLevel, ...] = ()

    @property
    def level_ids(self) -> set[str]:
        return {level.id for level in self.levels}

    def replace(self, **changes: Any) -> Taxonomy:
        return replace(self, **changes)


@dataclass(frozen=True)
class LifecycleEvent:
    id: str
    meaning: str

    def replace(self, **changes: Any) -> LifecycleEvent:
        return replace(self, **changes)


@dataclass(frozen=True)
class WorkItemLevelDefinition:
    id: str
    label: str
    implementable_by_default: bool = False
    expands_to: tuple[str, ...] = ()

    def replace(self, **changes: Any) -> WorkItemLevelDefinition:
        return replace(self, **changes)


@dataclass(frozen=True)
class CadenceProfileDefinition:
    id: str
    label: str
    stop_policy: str
    active: bool = True

    def replace(self, **changes: Any) -> CadenceProfileDefinition:
        return replace(self, **changes)


@dataclass(frozen=True)
class CheckpointDefinition:
    id: str
    occurs_after: str | None = None
    blocks: tuple[str, ...] = ()
    required_artifacts: tuple[str, ...] = ()
    required_confirmations: tuple[str, ...] = ()

    def replace(self, **changes: Any) -> CheckpointDefinition:
        return replace(self, **changes)


@dataclass(frozen=True)
class SurfaceDefinition:
    id: str
    event: str | None = None
    stops_for: str | None = None
    transport: str = "verbatim"
    marker_protocol: str = "ariad_compact"
    interpretation_policy: str = "after_block_only"

    def replace(self, **changes: Any) -> SurfaceDefinition:
        return replace(self, **changes)


@dataclass(frozen=True)
class ContractDefinition:
    id: str
    applies_at: str
    rules: tuple[str, ...] = ()
    stop_conditions: tuple[str, ...] = ()
    required_outputs: tuple[str, ...] = ()

    def replace(self, **changes: Any) -> ContractDefinition:
        return replace(self, **changes)


@dataclass(frozen=True)
class SurfaceRoute:
    trigger: str
    surfaces: tuple[str, ...]
    intents: tuple[str, ...] = ()

    def replace(self, **changes: Any) -> SurfaceRoute:
        return replace(self, **changes)


@dataclass(frozen=True)
class TemplateDefinition:
    id: str
    path: str
    content: str
    description: str | None = None

    def replace(self, **changes: Any) -> TemplateDefinition:
        return replace(self, **changes)


@dataclass(frozen=True)
class MethodDefinition:
    id: str
    label: str
    resolution: DslResolution = DslResolution()
    taxonomy: Taxonomy = Taxonomy()
    lifecycle: tuple[LifecycleEvent, ...] = ()
    work_item_levels: tuple[WorkItemLevelDefinition, ...] = ()
    cadence_profiles: tuple[CadenceProfileDefinition, ...] = ()
    checkpoints: tuple[CheckpointDefinition, ...] = ()
    contracts: tuple[ContractDefinition, ...] = ()
    policies: Mapping[str, Any] | None = None
    surfaces: tuple[SurfaceDefinition, ...] = ()
    surface_routes: tuple[SurfaceRoute, ...] = ()
    templates: tuple[TemplateDefinition, ...] = ()
    open_questions: Mapping[str, Any] | None = None

    @property
    def lifecycle_ids(self) -> set[str]:
        return {event.id for event in self.lifecycle}

    def replace(self, **changes: Any) -> MethodDefinition:
        return replace(self, **changes)


def validate_method_definition(definition: MethodDefinition) -> None:
    """Validate structural invariants for a Builder method definition."""
    _require_non_empty(definition.id, "method id")
    _require_non_empty(definition.label, "method label")
    _validate_resolution(definition.resolution)
    _validate_taxonomy(definition.taxonomy)
    _validate_lifecycle(definition.lifecycle)
    _validate_work_item_levels(definition.work_item_levels)
    _validate_cadence_profiles(definition.cadence_profiles)
    _validate_checkpoints(definition.checkpoints, lifecycle_ids=definition.lifecycle_ids)
    _validate_contracts(definition.contracts, lifecycle_ids=definition.lifecycle_ids)
    _validate_surfaces(definition.surfaces, lifecycle_ids=definition.lifecycle_ids)
    _validate_surface_routes(definition.surface_routes, surfaces=definition.surfaces)
    _validate_templates(definition.templates)


def _validate_resolution(resolution: DslResolution) -> None:
    if not resolution.layers:
        raise MethodDefinitionError("dsl resolution must declare at least one layer")
    _require_unique(resolution.layers, "dsl resolution layer")
    for layer in resolution.layers:
        _require_non_empty(layer, "dsl resolution layer")
    _require_non_empty(resolution.conflict_policy, "dsl conflict policy")


def _validate_taxonomy(taxonomy: Taxonomy) -> None:
    _require_unique(taxonomy.state_vocabulary, "taxonomy state")
    level_ids = [level.id for level in taxonomy.levels]
    _require_unique(level_ids, "taxonomy level")

    known_levels = set(level_ids)
    known_states = set(taxonomy.state_vocabulary)
    for level in taxonomy.levels:
        _require_non_empty(level.id, "taxonomy level id")
        _require_non_empty(level.label, f"taxonomy level {level.id} label")
        _require_unique(level.contains, f"taxonomy level {level.id} child")
        _require_unique(level.allowed_states, f"taxonomy level {level.id} state")
        for child_id in level.contains:
            if child_id not in known_levels:
                raise MethodDefinitionError(
                    f"taxonomy level {level.id} references unknown taxonomy level {child_id}"
                )
        for state in level.allowed_states:
            if known_states and state not in known_states:
                raise MethodDefinitionError(
                    f"taxonomy level {level.id} allows unknown taxonomy state {state}"
                )
        state_semantics = dict(level.state_semantics or {})
        for state in state_semantics:
            if state not in level.allowed_states:
                raise MethodDefinitionError(
                    f"taxonomy level {level.id} declares state semantics for disallowed state {state}"
                )


def _validate_lifecycle(events: tuple[LifecycleEvent, ...]) -> None:
    event_ids = [event.id for event in events]
    _require_unique(event_ids, "lifecycle event")
    for event in events:
        _require_non_empty(event.id, "lifecycle event id")
        _require_non_empty(event.meaning, f"lifecycle event {event.id} meaning")


def _validate_work_item_levels(levels: tuple[WorkItemLevelDefinition, ...]) -> None:
    level_ids = [level.id for level in levels]
    _require_unique(level_ids, "work item level")
    known = set(level_ids)
    for level in levels:
        _require_non_empty(level.id, "work item level id")
        _require_non_empty(level.label, f"work item level {level.id} label")
        _require_unique(level.expands_to, f"work item level {level.id} expansion target")
        for target in level.expands_to:
            if target not in known:
                raise MethodDefinitionError(
                    f"work item level {level.id} expands to unknown level {target}"
                )


def _validate_cadence_profiles(profiles: tuple[CadenceProfileDefinition, ...]) -> None:
    profile_ids = [profile.id for profile in profiles]
    _require_unique(profile_ids, "cadence profile")
    for profile in profiles:
        _require_non_empty(profile.id, "cadence profile id")
        _require_non_empty(profile.label, f"cadence profile {profile.id} label")
        _require_non_empty(profile.stop_policy, f"cadence profile {profile.id} stop policy")


def _validate_checkpoints(
    checkpoints: tuple[CheckpointDefinition, ...],
    *,
    lifecycle_ids: set[str],
) -> None:
    checkpoint_ids = [checkpoint.id for checkpoint in checkpoints]
    _require_unique(checkpoint_ids, "checkpoint")
    for checkpoint in checkpoints:
        _require_non_empty(checkpoint.id, "checkpoint id")
        if checkpoint.occurs_after is not None:
            _require_known_event(
                checkpoint.occurs_after,
                lifecycle_ids=lifecycle_ids,
                owner=f"checkpoint {checkpoint.id}",
            )
        for event_id in checkpoint.blocks:
            _require_known_event(
                event_id,
                lifecycle_ids=lifecycle_ids,
                owner=f"checkpoint {checkpoint.id}",
            )


def _validate_contracts(
    contracts: tuple[ContractDefinition, ...],
    *,
    lifecycle_ids: set[str],
) -> None:
    contract_ids = [contract.id for contract in contracts]
    _require_unique(contract_ids, "contract")
    for contract in contracts:
        _require_non_empty(contract.id, "contract id")
        _require_known_event(
            contract.applies_at,
            lifecycle_ids=lifecycle_ids,
            owner=f"contract {contract.id}",
        )
        _require_unique(contract.rules, f"contract {contract.id} rule")
        _require_unique(contract.stop_conditions, f"contract {contract.id} stop condition")
        _require_unique(contract.required_outputs, f"contract {contract.id} required output")


def _validate_surfaces(
    surfaces: tuple[SurfaceDefinition, ...],
    *,
    lifecycle_ids: set[str],
) -> None:
    surface_ids = [surface.id for surface in surfaces]
    _require_unique(surface_ids, "surface")
    for surface in surfaces:
        _require_non_empty(surface.id, "surface id")
        _require_known_choice(
            surface.transport,
            allowed={"verbatim"},
            field_name=f"surface {surface.id} transport",
        )
        _require_known_choice(
            surface.marker_protocol,
            allowed={"ariad_compact"},
            field_name=f"surface {surface.id} marker_protocol",
        )
        _require_known_choice(
            surface.interpretation_policy,
            allowed={"after_block_only"},
            field_name=f"surface {surface.id} interpretation_policy",
        )
        if surface.event is not None and surface.event in {
            "adoption",
            "on_builder_load",
            "roadmap_inspection",
        }:
            continue
        if surface.event is not None:
            _require_known_event(
                surface.event,
                lifecycle_ids=lifecycle_ids,
                owner=f"surface {surface.id}",
            )


def _validate_surface_routes(
    routes: tuple[SurfaceRoute, ...],
    *,
    surfaces: tuple[SurfaceDefinition, ...],
) -> None:
    route_triggers = [route.trigger for route in routes]
    _require_unique(route_triggers, "surface route")
    surface_ids = {surface.id for surface in surfaces}
    for route in routes:
        _require_non_empty(route.trigger, "surface route trigger")
        if not route.surfaces:
            raise MethodDefinitionError(
                f"surface route {route.trigger} must declare at least one surface"
            )
        _require_unique(route.surfaces, f"surface route {route.trigger} surface")
        _require_unique(route.intents, f"surface route {route.trigger} intent")
        for surface_id in route.surfaces:
            if surface_id not in surface_ids:
                raise MethodDefinitionError(
                    f"surface route {route.trigger} references unknown surface {surface_id}"
                )


def _validate_templates(templates: tuple[TemplateDefinition, ...]) -> None:
    template_ids = [template.id for template in templates]
    template_paths = [template.path for template in templates]
    _require_unique(template_ids, "template")
    _require_unique(template_paths, "template path")
    for template in templates:
        _require_non_empty(template.id, "template id")
        _require_non_empty(template.path, f"template {template.id} path")
        _require_non_empty(template.content, f"template {template.id} content")
        if template.path.startswith("/") or ".." in template.path.split("/"):
            raise MethodDefinitionError(
                f"template {template.id} path must be relative and stay inside project root"
            )
        if template.description is not None:
            _require_non_empty(template.description, f"template {template.id} description")


def _require_known_event(event_id: str, *, lifecycle_ids: set[str], owner: str) -> None:
    if event_id not in lifecycle_ids:
        raise MethodDefinitionError(f"{owner} references unknown lifecycle event {event_id}")


def _require_known_choice(value: str, *, allowed: set[str], field_name: str) -> None:
    _require_non_empty(value, field_name)
    if value not in allowed:
        allowed_values = ", ".join(sorted(allowed))
        raise MethodDefinitionError(f"{field_name} must be one of {allowed_values}")


def _require_non_empty(value: str, field_name: str) -> None:
    if not isinstance(value, str) or not value.strip():
        raise MethodDefinitionError(f"{field_name} must not be empty")


def _require_unique(values: tuple[str, ...] | list[str], label: str) -> None:
    seen: set[str] = set()
    for value in values:
        _require_non_empty(value, label)
        if value in seen:
            raise MethodDefinitionError(f"duplicate {label}: {value}")
        seen.add(value)
