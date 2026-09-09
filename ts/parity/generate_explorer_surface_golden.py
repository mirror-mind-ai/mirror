"""Generate the committed Explorer surface golden fixture (CV22.DS7.US7 plateau 1).

`src/memory/surfaces/explorer_story.py` is a `transport=verbatim` surface: the
golden captures the RENDERED box drawing, so a re-wrap, a re-indent, or a
one-character padding change is a failure, not a formatting difference.

The renderers are pure functions of their arguments -- no clock, no database,
no environment -- so this generator needs none of the freezing machinery the
stateful generators carry. What it needs is a corpus that pins where Python and
JavaScript disagree about text, and one divergence that is specific to this
story:

  * `_line` does `text[:WIDTH]` then `.ljust(WIDTH)` -- Python counts CODE
    POINTS, JavaScript counts UTF-16 units.
  * `_wrap` measures with `len()` and splits with `str.split()`, whose
    separator set is Python's `str.isspace()`: it includes U+001C-U+001F and
    excludes U+FEFF, both the opposite of JavaScript's `\\s`.
  * **`_wrap` here CHUNKS a long word** through `_chunk_word`, while the
    otherwise identical `_wrap` in `surfaces/mode_transition.py` does NOT --
    it lets the word overflow and `_line` truncates it. Two `_wrap`s, one
    module apart, with different behavior on the same input. A port that
    factors them into one shared helper is wrong in one of the two places, so
    both are graded here: the story cards through `explorer_story`, the
    `△ EXPLORER MODE ACTIVE` card through `mode_transition`.
  * `_box` does NOT wrap blocks. Unlike Soul's cards there is no
    `_wrap_blocks`, so an embedded newline is just whitespace to `str.split()`
    and paragraphs COLLAPSE. Pinned, because "preserve the paragraphs" is the
    natural thing for a port to assume.

`_handoff_path_label` runs the value through `PurePath.name`, which strips
trailing separators and returns `""` for a bare root -- recorded here rather
than reasoned about.

Run:  uv run python ts/parity/generate_explorer_surface_golden.py
"""

from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

from memory.services.explorer_story import (
    ExplorerAttractor,
    ExplorerBuilderHandoff,
    ExplorerExperimentProposal,
    ExplorerSourceConversation,
    ExplorerStory,
)
from memory.surfaces.explorer_story import (
    render_attractors_emerging,
    render_builder_handoff_proposed,
    render_experiment_proposal,
    render_exploratory_story_opened,
    render_exploratory_story_resumed,
    render_explorer_story_archived,
    render_explorer_story_list,
    render_missing_exploratory_story,
    render_narrative_field_snapshot,
    render_no_builder_handoff,
    render_story_thickened,
)
from memory.surfaces.mode_transition import render_explorer_mode_transition

HERE = Path(__file__).resolve().parent
OUT_PATH = HERE.parent / "test" / "goldens" / "explorer-surface.golden.json"

# --- Unicode corpus -------------------------------------------------------
# Each string exists to break one specific naive implementation.

ASTRAL = "🎯 a target and 🌱 a seed carried through the whole card"
CJK = "沉默不是空白而是尚未成形的語言在等待被聽見的時刻到來未曾說出的話語仍在生長"
COMBINING = "a\u0301 e\u0301 i\u0301 combining acutes that must count as two code points each"
UNBROKEN = "x" * 200
NBSP_SEPARATED = "one\u00a0two\u00a0three separated by non-breaking spaces"
IDEOGRAPHIC_SPACE = "one\u3000two\u3000three separated by ideographic spaces"
UNIT_SEPARATOR = "one\u001ftwo three separated by a unit separator"
BOM_JOINED = "one\ufefftwo three joined by a byte-order mark"
MULTI_PARAGRAPH = "first paragraph\n\n\nsecond paragraph after blank lines\n\nthird"
FORM_FEED = "first block\u000csecond block after a form feed"
LEADING_BLANKS = "\n\n  padded on both ends  \n\n"
# 54 code points is exactly `_wrap`'s max_width; 55 is the first chunk.
AT_MAX_WIDTH = "y" * 54
OVER_MAX_WIDTH = "z" * 55


def _story_from_payload(payload: dict[str, Any]) -> ExplorerStory:
    """Rebuild an ExplorerStory from the same dict the golden records as input."""
    return ExplorerStory(
        journey=payload["journey"],
        current_exploratory_story=payload.get("current_exploratory_story"),
        narrative_field_summary=payload.get("narrative_field_summary"),
        last_story_card=payload.get("last_story_card"),
        attractors=tuple(
            ExplorerAttractor(
                label=item["label"],
                description=item.get("description"),
                status=item.get("status", "proposed"),
            )
            for item in payload.get("attractors", [])
        ),
        experiment_proposal=(
            ExplorerExperimentProposal(
                title=payload["experiment_proposal"]["title"],
                description=payload["experiment_proposal"].get("description"),
                status=payload["experiment_proposal"].get("status", "proposed"),
            )
            if payload.get("experiment_proposal")
            else None
        ),
        builder_handoff=(
            ExplorerBuilderHandoff(**payload["builder_handoff"])
            if payload.get("builder_handoff")
            else None
        ),
        source_conversations=tuple(
            ExplorerSourceConversation(
                conversation_id=item["conversation_id"],
                title=item.get("title"),
                role=item.get("role", "source evidence"),
            )
            for item in payload.get("source_conversations", [])
        ),
        id=payload.get("id"),
        title=payload.get("title"),
        status=payload.get("status", "active"),
        created_at=payload.get("created_at"),
        updated_at=payload.get("updated_at"),
        promoted_at=payload.get("promoted_at"),
        archived_at=payload.get("archived_at"),
    )


def _scenario(name: str, renderer: str, render: Callable[[], str], payload: dict[str, Any]):
    scenario: dict[str, Any] = {"name": name, "renderer": renderer, "input": payload}
    try:
        scenario["expected_stdout"] = render()
    except ValueError as exc:
        scenario["expected_error"] = str(exc)
    return scenario


def _story_scenario(
    name: str,
    renderer: str,
    fn: Callable[[ExplorerStory], str],
    payload: dict[str, Any],
):
    return _scenario(name, renderer, lambda: fn(_story_from_payload(payload)), {"story": payload})


# --- story fixtures -------------------------------------------------------

MINIMAL = {"journey": "mirror-ts-core"}

TEXT_ONLY = {
    "journey": "mirror-ts-core",
    "current_exploratory_story": "The port keeps meeting the same wall: parity is cheap to claim and expensive to prove.",
}

FULL = {
    "journey": "mirror-ts-core",
    "current_exploratory_story": "The port keeps meeting the same wall: parity is cheap to claim and expensive to prove.",
    "narrative_field_summary": "Two cores, one database, and a denominator nobody fully trusts yet.",
    "last_story_card": "The oracle moved again while we were reading it.",
    "attractors": [
        {
            "label": "grade the surface, not the intent",
            "description": "every verbatim card becomes a golden before it becomes an opinion",
            "status": "accepted",
        },
        {"label": "one gate per lived mode", "status": "proposed"},
    ],
    "experiment_proposal": {
        "title": "port one ritual command end to end",
        "description": "small enough to finish, whole enough to learn the shape",
        "status": "proposed",
    },
    "id": "01J0EXPLORERSTORYFIXTURE0001",
    "title": "Parity is a rendering problem",
    "status": "active",
    "created_at": "2026-09-01T10:00:00Z",
    "updated_at": "2026-09-08T14:32:11Z",
}

LIFECYCLE_THIN = {
    "journey": "mirror-ts-core",
    "id": "01J0EXPLORERSTORYFIXTURE0002",
    "status": "archived",
    "updated_at": "2026-09-08T14:32:11Z",
    "archived_at": "2026-09-08T14:32:11Z",
}

HANDOFF_FULL = {
    "journey": "mirror-ts-core",
    "current_exploratory_story": "Explorer needs a durable artifact, not a good conversation.",
    "attractors": [{"label": "durable over memorable", "status": "accepted"}],
    "experiment_proposal": {"title": "write the handoff before deciding", "status": "proposed"},
    "builder_handoff": {
        "title": "Explorer to Builder handoff for the parity surface",
        "summary": "Enough shape to plan, not enough to commit.",
        "readiness": "proposed",
        "artifact_dir": "/Users/nav/dev/project/docs/project/explorations/parity-surface",
        "index_path": "/Users/nav/dev/project/docs/project/explorations/parity-surface/index.md",
        "exploratory_story_path": "/Users/nav/dev/project/docs/project/explorations/parity-surface/exploratory-story.md",
        "handoff_info_path": "/Users/nav/dev/project/docs/project/explorations/parity-surface/handoff-info.md",
        "product_design_proposal_path": "/Users/nav/dev/project/docs/project/explorations/parity-surface/product-design-proposal.md",
        "full_conversation_path": "/Users/nav/dev/project/docs/project/explorations/parity-surface/full-conversation.md",
    },
    "source_conversations": [
        {"conversation_id": "01J0CONV0001", "title": "Where parity breaks", "role": "origin"},
        {"conversation_id": "01J0CONV0002", "title": None, "role": "source evidence"},
    ],
}


def build_scenarios() -> list[dict[str, Any]]:
    scenarios: list[dict[str, Any]] = []

    # --- opened / resumed / thickened / snapshot: the _story_rows matrix ---
    # The placeholder rule is `len(rows) == 1 or (include_lifecycle and
    # len(rows) <= 3)` -- four branches that a port simplifies by accident.
    for name, payload in (
        ("minimal_placeholder", MINIMAL),
        ("text_only", TEXT_ONLY),
        ("full", FULL),
    ):
        scenarios.append(
            _story_scenario(
                f"opened_{name}", "exploratory_story_opened", render_exploratory_story_opened, payload
            )
        )
        scenarios.append(
            _story_scenario(
                f"resumed_{name}",
                "exploratory_story_resumed",
                render_exploratory_story_resumed,
                payload,
            )
        )
        scenarios.append(
            _story_scenario(
                f"snapshot_{name}",
                "narrative_field_snapshot",
                render_narrative_field_snapshot,
                payload,
            )
        )
    # include_lifecycle with id+status and nothing else: rows == 3, so the
    # placeholder still fires even though the card is not empty.
    scenarios.append(
        _story_scenario(
            "resumed_lifecycle_placeholder_boundary",
            "exploratory_story_resumed",
            render_exploratory_story_resumed,
            LIFECYCLE_THIN,
        )
    )
    # ... and rows == 4 (id, status, current story, updated) must NOT fire it.
    scenarios.append(
        _story_scenario(
            "resumed_lifecycle_placeholder_not_fired",
            "exploratory_story_resumed",
            render_exploratory_story_resumed,
            {**LIFECYCLE_THIN, "current_exploratory_story": "one line of story"},
        )
    )
    # snapshot is the only renderer with include_direction: attractors and the
    # experiment reach the card through a different path than in `attractors`.
    scenarios.append(
        _story_scenario(
            "snapshot_direction_without_descriptions",
            "narrative_field_snapshot",
            render_narrative_field_snapshot,
            {
                "journey": "mirror-ts-core",
                "attractors": [{"label": "no description here", "status": "proposed"}],
                "experiment_proposal": {"title": "bare experiment", "status": "accepted"},
            },
        )
    )

    # --- thickened: the `changed` header and its blank/None handling ---
    for name, changed in (
        ("thickened_no_changed", None),
        ("thickened_blank_changed", "   "),
        ("thickened_with_changed", "  the wall turned out to be a rendering problem  "),
    ):
        scenarios.append(
            _scenario(
                name,
                "story_thickened",
                lambda payload=FULL, changed=changed: render_story_thickened(
                    _story_from_payload(payload), changed=changed
                ),
                {"story": FULL, "changed": changed},
            )
        )

    # --- archived: present and absent ---
    scenarios.append(
        _scenario(
            "archived_with_story",
            "explorer_story_archived",
            lambda: render_explorer_story_archived(
                _story_from_payload(LIFECYCLE_THIN), journey="mirror-ts-core"
            ),
            {"story": LIFECYCLE_THIN, "journey": "mirror-ts-core"},
        )
    )
    scenarios.append(
        _scenario(
            "archived_none",
            "explorer_story_archived",
            lambda: render_explorer_story_archived(None, journey="mirror-ts-core"),
            {"story": None, "journey": "mirror-ts-core"},
        )
    )

    # --- list: empty, one, many, and the title fallback chain ---
    def _list_scenario(name: str, journey: str, payloads: list[dict[str, Any]]):
        return _scenario(
            name,
            "explorer_story_list",
            lambda: render_explorer_story_list(
                journey, [_story_from_payload(item) for item in payloads]
            ),
            {"journey": journey, "stories": payloads},
        )

    scenarios.append(_list_scenario("list_empty", "mirror-ts-core", []))
    scenarios.append(_list_scenario("list_single", "mirror-ts-core", [FULL]))
    scenarios.append(
        _list_scenario(
            "list_title_fallback_chain",
            "mirror-ts-core",
            [
                {**FULL, "title": None},  # falls back to current story
                {
                    "journey": "mirror-ts-core",
                    "id": "01J0EXPLORERSTORYFIXTURE0003",
                    "status": "promoted",
                    "updated_at": "2026-09-07T09:00:00Z",
                },  # falls back to "Untitled exploration"
                {
                    "journey": "mirror-ts-core",
                    "title": "no id and no updated_at",
                    "status": "archived",
                },  # both optional rows omitted
            ],
        )
    )

    # --- attractors ---
    scenarios.append(
        _story_scenario(
            "attractors_empty", "attractors_emerging", render_attractors_emerging, MINIMAL
        )
    )
    scenarios.append(
        _story_scenario("attractors_full", "attractors_emerging", render_attractors_emerging, FULL)
    )
    # The label of the FIRST attractor is "possible attractor"; the rest are
    # numbered from 2. Three rows pin that the numbering starts where it does.
    scenarios.append(
        _story_scenario(
            "attractors_three_numbering",
            "attractors_emerging",
            render_attractors_emerging,
            {
                "journey": "mirror-ts-core",
                "attractors": [
                    {"label": "first", "status": "proposed"},
                    {"label": "second", "description": "with detail", "status": "accepted"},
                    {"label": "third", "status": "proposed"},
                ],
            },
        )
    )

    # --- experiment ---
    scenarios.append(
        _story_scenario(
            "experiment_absent", "experiment_proposal", render_experiment_proposal, MINIMAL
        )
    )
    scenarios.append(
        _story_scenario("experiment_full", "experiment_proposal", render_experiment_proposal, FULL)
    )
    scenarios.append(
        _story_scenario(
            "experiment_without_description",
            "experiment_proposal",
            render_experiment_proposal,
            {
                "journey": "mirror-ts-core",
                "experiment_proposal": {"title": "bare", "status": "accepted"},
            },
        )
    )

    # --- builder handoff ---
    scenarios.append(
        _story_scenario(
            "handoff_absent", "builder_handoff_proposed", render_builder_handoff_proposed, MINIMAL
        )
    )
    scenarios.append(
        _story_scenario(
            "handoff_full",
            "builder_handoff_proposed",
            render_builder_handoff_proposed,
            HANDOFF_FULL,
        )
    )
    scenarios.append(
        _story_scenario(
            "handoff_without_paths",
            "builder_handoff_proposed",
            render_builder_handoff_proposed,
            {
                "journey": "mirror-ts-core",
                "builder_handoff": {"title": "no project path, no artifacts", "readiness": "proposed"},
            },
        )
    )
    # `_handoff_path_label` is PurePath(...).name -- trailing separators are
    # stripped, a bare root yields "", and a backslash path is normalized first.
    scenarios.append(
        _story_scenario(
            "handoff_path_label_edge_cases",
            "builder_handoff_proposed",
            render_builder_handoff_proposed,
            {
                "journey": "mirror-ts-core",
                "builder_handoff": {
                    "title": "path label edges",
                    "readiness": "proposed",
                    "artifact_dir": "docs/project/explorations/trailing/",
                    "index_path": "/",
                    "exploratory_story_path": "bare-file.md",
                    "handoff_info_path": "C:\\Users\\nav\\docs\\handoff-info.md",
                    "product_design_proposal_path": "./relative/product-design-proposal.md",
                },
            },
        )
    )
    # Source evidence rows: with and without a title.
    scenarios.append(
        _story_scenario(
            "handoff_absent_with_source_conversations",
            "builder_handoff_proposed",
            render_builder_handoff_proposed,
            {
                "journey": "mirror-ts-core",
                "source_conversations": [
                    {"conversation_id": "01J0CONV0003", "title": "kept", "role": "origin"},
                    {"conversation_id": "01J0CONV0004", "role": "source evidence"},
                ],
            },
        )
    )

    # --- constant cards ---
    scenarios.append(
        _scenario(
            "no_builder_handoff",
            "no_builder_handoff",
            lambda: render_no_builder_handoff(journey="mirror-ts-core"),
            {"journey": "mirror-ts-core"},
        )
    )
    scenarios.append(
        _scenario(
            "missing_exploratory_story",
            "missing_exploratory_story",
            lambda: render_missing_exploratory_story(journey="mirror-ts-core"),
            {"journey": "mirror-ts-core"},
        )
    )
    # A journey slug long enough to wrap, and one long enough to be chunked.
    scenarios.append(
        _scenario(
            "missing_exploratory_story_long_journey",
            "missing_exploratory_story",
            lambda: render_missing_exploratory_story(journey=UNBROKEN),
            {"journey": UNBROKEN},
        )
    )

    # --- the Unicode / wrapping corpus, driven through one renderer ---
    # `_box` is shared by every card, so one renderer is enough to grade the
    # text primitives; the per-renderer scenarios above grade the row shapes.
    for name, text in (
        ("astral_emoji", ASTRAL),
        ("cjk", CJK),
        ("combining_marks", COMBINING),
        ("unbroken_token_chunked", UNBROKEN),
        ("nbsp_separators", NBSP_SEPARATED),
        ("ideographic_space", IDEOGRAPHIC_SPACE),
        ("unit_separator", UNIT_SEPARATOR),
        ("bom_joined", BOM_JOINED),
        ("multi_paragraph_collapses", MULTI_PARAGRAPH),
        ("form_feed_collapses", FORM_FEED),
        ("padded_ends", LEADING_BLANKS),
        ("word_at_max_width", AT_MAX_WIDTH),
        ("word_over_max_width", OVER_MAX_WIDTH),
    ):
        scenarios.append(
            _story_scenario(
                f"wrap_{name}",
                "exploratory_story_opened",
                render_exploratory_story_opened,
                {"journey": "mirror-ts-core", "current_exploratory_story": text},
            )
        )
    # An empty-after-split value: `_wrap` returns [""] and the row still emits
    # its (indented) blank content line.
    scenarios.append(
        _scenario(
            "wrap_whitespace_only_value",
            "explorer_story_archived",
            lambda: render_explorer_story_archived(None, journey="   "),
            {"story": None, "journey": "   "},
        )
    )

    # --- the △ EXPLORER MODE ACTIVE card (surfaces/mode_transition.py) ---
    # Same WIDTH, DIFFERENT _wrap: no _chunk_word, so a long journey slug
    # overflows and is truncated by _line instead of being chunked. Both cards
    # are graded in this artifact precisely so that difference cannot be
    # factored away.
    scenarios.append(
        _scenario(
            "mode_transition_plain",
            "explorer_mode_transition",
            lambda: render_explorer_mode_transition(journey="mirror-ts-core"),
            {"journey": "mirror-ts-core"},
        )
    )
    scenarios.append(
        _scenario(
            "mode_transition_long_journey_overflows_not_chunked",
            "explorer_mode_transition",
            lambda: render_explorer_mode_transition(journey=UNBROKEN),
            {"journey": UNBROKEN},
        )
    )
    scenarios.append(
        _scenario(
            "mode_transition_astral_journey",
            "explorer_mode_transition",
            lambda: render_explorer_mode_transition(journey=ASTRAL),
            {"journey": ASTRAL},
        )
    )
    scenarios.append(
        _scenario(
            "mode_transition_empty_journey",
            "explorer_mode_transition",
            lambda: render_explorer_mode_transition(journey=""),
            {"journey": ""},
        )
    )

    return scenarios


def main() -> None:
    scenarios = build_scenarios()
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(
        json.dumps({"scenarios": scenarios}, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    rendered = sum(1 for s in scenarios if "expected_stdout" in s)
    refused = sum(1 for s in scenarios if "expected_error" in s)
    print(f"{len(scenarios)} scenarios: {rendered} rendered, {refused} refused")
    print(f"wrote {OUT_PATH.relative_to(HERE.parent.parent)}")


if __name__ == "__main__":
    main()
