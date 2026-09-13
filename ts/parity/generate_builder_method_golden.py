"""Generate the Builder method DSL and inspection golden (CV22.DS7.US8 plateau 1).

Three things are graded here, and the first is the reason this file exists.

**1. The DSL itself, field by field.** `ariad_method.py` is 663 lines of pure
DATA: nine lifecycle events, nine contracts carrying 60-odd rule strings, eleven
surfaces, four cadence profiles, and nine templates whose CONTENT is written into
the user's own repository by `prepare-templates`. Porting data has no logic to
reason about and no behavior to characterize -- it has transcription risk, and a
single wrong character in a template body means a wrong file committed to
somebody's project. So the golden carries a complete structural dump and the
TypeScript test asserts deep equality against it. A typo cannot survive that.

**2. The validator, which has no runtime caller.** `validate_method_definition`
is invoked only from Python's tests: no `build` leaf calls it. It is graded
anyway, because it is the invariant check that has to OUTLIVE Python. Today the
deep-equality test above proves the TypeScript DSL matches a definition Python
already validated; on the day DS10 deletes Python, that proof disappears and the
ported validator becomes the only structural guard on a DSL that Builder work
will then be editing by hand. The mutation matrix below records one refusal
message per validator branch.

**3. The inspection surfaces**, byte for byte: the long `render_available_method`
dump with its nine sections, plus the four short states (no active journey,
journey with an adopted method, journey without one, adoption report) including
their `already_adopted` and non-ariad variants.

Note what `render_available_method` does NOT show: a contract's rules are
rendered as `rules: {len(...)}`, a count, so the rule STRINGS are invisible in
the surface and only the structural dump can catch a typo in one. That asymmetry
is the whole argument for grading the data and not only the rendering.

Run:  uv run python ts/parity/generate_builder_method_golden.py
"""

from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path
from typing import Any

from memory.builder.ariad_method import get_ariad_method
from memory.builder.method_definition import (
    CadenceProfileDefinition,
    CheckpointDefinition,
    ContractDefinition,
    DslResolution,
    LifecycleEvent,
    MethodDefinition,
    SurfaceDefinition,
    SurfaceRoute,
    Taxonomy,
    TaxonomyLevel,
    TemplateDefinition,
    WorkItemLevelDefinition,
    validate_method_definition,
)
from memory.builder.method_inspection import (
    AVAILABLE_METHODS,
    render_available_method,
    render_journey_method_state,
    render_journey_without_adopted_method,
    render_method_adoption_report,
    render_no_active_journey,
)

HERE = Path(__file__).resolve().parent
OUT_PATH = HERE.parent / "test" / "goldens" / "builder-method.golden.json"


def _plain(value: Any) -> Any:
    """Dataclasses to plain JSON, preserving tuple order as arrays."""
    if isinstance(value, (list, tuple)):
        return [_plain(item) for item in value]
    if isinstance(value, dict):
        return {key: _plain(item) for key, item in value.items()}
    return value


def _definition_dump(method: MethodDefinition) -> dict[str, Any]:
    return _plain(asdict(method))


# --- Validator mutation matrix --------------------------------------------
# One entry per validator branch. Each takes the real Ariad definition and
# breaks exactly one invariant, so the recorded message is the one a future
# TypeScript-authored DSL would hit.


def _mutations(base: MethodDefinition) -> list[tuple[str, MethodDefinition]]:
    first_event = base.lifecycle[0]
    first_level = base.work_item_levels[0]
    first_profile = base.cadence_profiles[0]
    first_checkpoint = base.checkpoints[0]
    first_contract = base.contracts[0]
    first_surface = base.surfaces[0]
    first_route = base.surface_routes[0]
    first_template = base.templates[0]
    first_taxonomy_level = base.taxonomy.levels[0]

    return [
        ("valid", base),
        ("empty_id", base.replace(id="")),
        ("blank_id", base.replace(id="   ")),
        ("empty_label", base.replace(label="")),
        # resolution
        ("no_resolution_layers", base.replace(resolution=DslResolution(layers=()))),
        (
            "duplicate_resolution_layer",
            base.replace(resolution=DslResolution(layers=("a", "a"))),
        ),
        (
            "empty_conflict_policy",
            base.replace(resolution=DslResolution(conflict_policy="")),
        ),
        # taxonomy
        (
            "duplicate_taxonomy_state",
            base.replace(taxonomy=base.taxonomy.replace(state_vocabulary=("s", "s"))),
        ),
        (
            "duplicate_taxonomy_level",
            base.replace(
                taxonomy=base.taxonomy.replace(levels=(first_taxonomy_level, first_taxonomy_level))
            ),
        ),
        (
            "taxonomy_unknown_child",
            base.replace(
                taxonomy=base.taxonomy.replace(
                    levels=(first_taxonomy_level.replace(contains=("nope",)),)
                )
            ),
        ),
        (
            "taxonomy_unknown_state",
            base.replace(
                taxonomy=base.taxonomy.replace(
                    levels=(first_taxonomy_level.replace(allowed_states=("nope",)),)
                )
            ),
        ),
        (
            # Keep every level so the `contains` check still passes; break only
            # the semantics/allowed-states relation on the first one. An earlier
            # version of this mutation dropped the other levels and tripped the
            # unknown-child branch instead, recording a message for a rule it was
            # not testing.
            "taxonomy_semantics_for_disallowed_state",
            base.replace(
                taxonomy=base.taxonomy.replace(
                    levels=(
                        first_taxonomy_level.replace(
                            allowed_states=(), state_semantics={"nope": "meaning"}
                        ),
                        *base.taxonomy.levels[1:],
                    )
                )
            ),
        ),
        (
            "taxonomy_empty_level_label",
            base.replace(
                taxonomy=Taxonomy(levels=(TaxonomyLevel(id="lvl", label=""),)),
            ),
        ),
        # lifecycle
        ("duplicate_lifecycle_event", base.replace(lifecycle=(first_event, first_event))),
        (
            "empty_lifecycle_meaning",
            base.replace(lifecycle=(LifecycleEvent(id="e", meaning=""),)),
        ),
        # work item levels
        ("duplicate_work_item_level", base.replace(work_item_levels=(first_level, first_level))),
        (
            "work_item_unknown_expansion",
            base.replace(
                work_item_levels=(WorkItemLevelDefinition(id="a", label="A", expands_to=("nope",)),)
            ),
        ),
        # cadence
        (
            "duplicate_cadence_profile",
            base.replace(cadence_profiles=(first_profile, first_profile)),
        ),
        (
            "empty_stop_policy",
            base.replace(
                cadence_profiles=(CadenceProfileDefinition(id="c", label="C", stop_policy=""),)
            ),
        ),
        (
            "unknown_plan_approval_policy",
            base.replace(
                cadence_profiles=(
                    CadenceProfileDefinition(
                        id="c", label="C", stop_policy="stop", plan_approval_policy="nope"
                    ),
                )
            ),
        ),
        # checkpoints
        ("duplicate_checkpoint", base.replace(checkpoints=(first_checkpoint, first_checkpoint))),
        (
            "checkpoint_unknown_occurs_after",
            base.replace(checkpoints=(CheckpointDefinition(id="c", occurs_after="nope"),)),
        ),
        (
            "checkpoint_unknown_blocks",
            base.replace(checkpoints=(CheckpointDefinition(id="c", blocks=("nope",)),)),
        ),
        # contracts
        ("duplicate_contract", base.replace(contracts=(first_contract, first_contract))),
        (
            "contract_unknown_applies_at",
            base.replace(contracts=(ContractDefinition(id="c", applies_at="nope"),)),
        ),
        (
            "contract_duplicate_rule",
            base.replace(
                contracts=(
                    ContractDefinition(id="c", applies_at=first_event.id, rules=("same", "same")),
                )
            ),
        ),
        # surfaces
        ("duplicate_surface", base.replace(surfaces=(first_surface, first_surface))),
        (
            "surface_unknown_transport",
            base.replace(surfaces=(SurfaceDefinition(id="s", transport="raw"),)),
        ),
        (
            "surface_unknown_marker_protocol",
            base.replace(surfaces=(SurfaceDefinition(id="s", marker_protocol="nope"),)),
        ),
        (
            "surface_unknown_interpretation_policy",
            base.replace(surfaces=(SurfaceDefinition(id="s", interpretation_policy="nope"),)),
        ),
        (
            "surface_unknown_event",
            base.replace(surfaces=(SurfaceDefinition(id="s", event="nope"),)),
        ),
        # The three pseudo-events that bypass the lifecycle check.
        (
            "surface_adoption_pseudo_event",
            base.replace(
                surfaces=(SurfaceDefinition(id="s", event="adoption"),),
                surface_routes=(),
            ),
        ),
        (
            "surface_on_builder_load_pseudo_event",
            base.replace(
                surfaces=(SurfaceDefinition(id="s", event="on_builder_load"),),
                surface_routes=(),
            ),
        ),
        (
            "surface_roadmap_inspection_pseudo_event",
            base.replace(
                surfaces=(SurfaceDefinition(id="s", event="roadmap_inspection"),),
                surface_routes=(),
            ),
        ),
        # surface routes
        (
            "duplicate_surface_route",
            base.replace(surface_routes=(first_route, first_route)),
        ),
        (
            "route_without_surfaces",
            base.replace(surface_routes=(SurfaceRoute(trigger="t", surfaces=()),)),
        ),
        (
            "route_unknown_surface",
            base.replace(surface_routes=(SurfaceRoute(trigger="t", surfaces=("nope",)),)),
        ),
        # templates
        ("duplicate_template", base.replace(templates=(first_template, first_template))),
        (
            "duplicate_template_path",
            base.replace(
                templates=(
                    first_template,
                    first_template.replace(id="other"),
                )
            ),
        ),
        (
            "template_absolute_path",
            base.replace(templates=(TemplateDefinition(id="t", path="/etc/passwd", content="x"),)),
        ),
        (
            "template_traversal_path",
            base.replace(templates=(TemplateDefinition(id="t", path="../escape.md", content="x"),)),
        ),
        (
            "template_nested_traversal_path",
            base.replace(
                templates=(TemplateDefinition(id="t", path="docs/../../escape.md", content="x"),)
            ),
        ),
        (
            "template_dotdot_substring_is_allowed",
            base.replace(templates=(TemplateDefinition(id="t", path="docs/a..b.md", content="x"),)),
        ),
        (
            "template_empty_content",
            base.replace(templates=(TemplateDefinition(id="t", path="a.md", content=""),)),
        ),
        (
            "template_blank_description",
            base.replace(
                templates=(TemplateDefinition(id="t", path="a.md", content="x", description="   "),)
            ),
        ),
    ]


def build_scenarios() -> dict[str, Any]:
    method = get_ariad_method()
    validate_method_definition(method)

    validations: list[dict[str, Any]] = []
    for name, mutated in _mutations(method):
        entry: dict[str, Any] = {"name": name}
        try:
            validate_method_definition(mutated)
            entry["expected"] = "ok"
        except Exception as exc:
            entry["expected_error"] = f"{type(exc).__name__}: {exc}"
        validations.append(entry)

    surfaces = [
        {
            "name": "available_method",
            "expected": render_available_method(method),
        },
        {"name": "no_active_journey", "expected": render_no_active_journey()},
        {
            "name": "journey_with_ariad",
            "input": {"journey": "mirror-ts-core", "adopted_method": "ariad"},
            "expected": render_journey_method_state("mirror-ts-core", "ariad"),
        },
        {
            "name": "journey_with_other_method",
            "input": {"journey": "mirror-ts-core", "adopted_method": "scrumban"},
            "expected": render_journey_method_state("mirror-ts-core", "scrumban"),
        },
        {
            "name": "journey_with_none",
            "input": {"journey": "mirror-ts-core", "adopted_method": None},
            "expected": render_journey_method_state("mirror-ts-core", None),
        },
        {
            "name": "journey_without_adopted_method",
            "input": {"journey": "mirror-ts-core"},
            "expected": render_journey_without_adopted_method("mirror-ts-core"),
        },
        {
            "name": "adoption_new_ariad",
            "input": {"journey": "j", "method": "ariad", "already_adopted": False},
            "expected": render_method_adoption_report("j", "ariad"),
        },
        {
            "name": "adoption_already_ariad",
            "input": {"journey": "j", "method": "ariad", "already_adopted": True},
            "expected": render_method_adoption_report("j", "ariad", already_adopted=True),
        },
        {
            "name": "adoption_new_other",
            "input": {"journey": "j", "method": "scrumban", "already_adopted": False},
            "expected": render_method_adoption_report("j", "scrumban"),
        },
        {
            "name": "adoption_already_other",
            "input": {"journey": "j", "method": "scrumban", "already_adopted": True},
            "expected": render_method_adoption_report("j", "scrumban", already_adopted=True),
        },
        # Unicode in the journey name reaches these surfaces unwrapped -- they are
        # plain text, not cards, so nothing truncates or pads.
        {
            "name": "journey_unicode",
            "input": {"journey": "jornada-ação-🟦", "adopted_method": "ariad"},
            "expected": render_journey_method_state("jornada-ação-🟦", "ariad"),
        },
        {
            "name": "journey_empty",
            "input": {"journey": "", "adopted_method": None},
            "expected": render_journey_method_state("", None),
        },
    ]

    # An empty definition renders every section's `none` branch.
    empty = MethodDefinition(id="empty", label="Empty method")
    surfaces.append(
        {
            "name": "available_method_empty_sections",
            "expected": render_available_method(empty),
        }
    )

    return {
        "available_methods": list(AVAILABLE_METHODS),
        "definition": _definition_dump(method),
        "empty_definition": _definition_dump(empty),
        "validations": validations,
        "surfaces": surfaces,
    }


def main() -> None:
    payload = build_scenarios()
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(
        json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    ok = sum(1 for entry in payload["validations"] if "expected" in entry)
    refused = sum(1 for entry in payload["validations"] if "expected_error" in entry)
    print(f"definition: {len(json.dumps(payload['definition'], ensure_ascii=False))} chars")
    print(f"validations: {len(payload['validations'])} ({ok} ok, {refused} refused)")
    print(f"surfaces: {len(payload['surfaces'])}")
    print(f"wrote {OUT_PATH.relative_to(HERE.parent.parent)}")


if __name__ == "__main__":
    main()
