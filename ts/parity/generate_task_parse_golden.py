"""Generate the committed task journey-path parser golden fixture (CV22.DS7.US2).

This is the Python side of the `parse_journey_path_tasks` / `parse_done_tasks`
parity contract (`src/memory/cli/tasks.py`). Both functions are pure over a
markdown string — no database involved — so the golden simply drives the real
oracle over a battery of synthetic journey-path fixtures and records both
parsers' outputs per fixture, covering every branch: `Etapa N:` prefix
stripping, plain (non-`Etapa`) stage headers, completed-stage skip (`✅` on the
`###` header), the legacy bold-cycle-header skip/no-op branches, bold-title
stripping, trailing-period stripping, indentation, no-stage/empty/no-checkbox
inputs, and the done-parser's case-insensitive `[x]`/`[X]` match plus its
"always append regardless of current stage" behavior.

Run:  uv run python ts/parity/generate_task_parse_golden.py
"""

from __future__ import annotations

import json
from pathlib import Path

from memory.cli.tasks import parse_done_tasks, parse_journey_path_tasks

HERE = Path(__file__).resolve().parent
OUT_PATH = HERE.parent / "test" / "goldens" / "task-parse.golden.json"

JOURNEY = "reflexo"

# (name, journey, journey_path) — each case is run through BOTH parsers, since
# real callers (`tasks sync`) run both over the same file content.
CASES: tuple[tuple[str, str, str], ...] = (
    (
        "basic_checkbox_extracted",
        JOURNEY,
        "\n### Etapa 1: Início\n- [ ] Task simples\n",
    ),
    (
        "stage_assigned_correctly",
        JOURNEY,
        "\n### Etapa 2: Desenvolvimento\n- [ ] Implementar feature\n",
    ),
    (
        "multiple_tasks_under_same_stage",
        JOURNEY,
        "\n### Etapa 1: Planejamento\n- [ ] Task A\n- [ ] Task B\n- [ ] Task C\n",
    ),
    (
        "tasks_under_different_stages",
        JOURNEY,
        "\n### Etapa 1: Início\n- [ ] Alpha\n\n### Etapa 2: Meio\n- [ ] Beta\n",
    ),
    (
        "done_checkbox_mixed_with_pending",
        JOURNEY,
        "\n### Etapa 1: Início\n- [x] Já feito\n- [ ] Pendente\n",
    ),
    (
        "completed_stage_skipped",
        JOURNEY,
        "\n### Etapa 1: Completa ✅\n- [ ] Não deve ser extraída\n\n"
        "### Etapa 2: Ativa\n- [ ] Deve ser extraída\n",
    ),
    (
        "markdown_bold_stripped_from_title",
        JOURNEY,
        "\n### Etapa 1: Início\n- [ ] **Título em negrito**\n",
    ),
    (
        "trailing_period_stripped",
        JOURNEY,
        "\n### Etapa 1: Início\n- [ ] Task com ponto final.\n",
    ),
    (
        "task_without_stage_not_extracted",
        JOURNEY,
        "- [ ] Task sem etapa\n",
    ),
    (
        "empty_journey_path",
        JOURNEY,
        "",
    ),
    (
        "no_tasks_in_journey_path",
        JOURNEY,
        "\n### Etapa 1: Planejamento\nApenas texto descritivo, sem checkboxes.\n",
    ),
    (
        "indented_checkbox_extracted",
        JOURNEY,
        "\n### Etapa 1: Início\n    - [ ] Task indentada\n",
    ),
    (
        "journey_set_on_all_tasks",
        "minha-journey",
        "\n### Etapa 1\n- [ ] Task A\n- [ ] Task B\n",
    ),
    (
        "done_basic_extracted",
        JOURNEY,
        "\n### Etapa 1: Concluída\n- [x] Task feita\n",
    ),
    (
        "done_uppercase_x_matches",
        JOURNEY,
        "\n### Etapa 1\n- [X] Feita com X maiúsculo\n",
    ),
    (
        "done_open_checkbox_ignored",
        JOURNEY,
        "\n### Etapa 1\n- [ ] Pendente\n- [x] Concluída\n",
    ),
    (
        "done_stage_assigned",
        JOURNEY,
        "\n### Etapa 3: Entrega\n- [x] Deploy feito\n",
    ),
    (
        "done_bold_stripped",
        JOURNEY,
        "\n### Etapa 1\n- [x] **Concluída em negrito**\n",
    ),
    (
        "done_trailing_period_stripped",
        JOURNEY,
        "\n### Etapa 1\n- [x] Feita com ponto.\n",
    ),
    (
        "done_ignores_completed_stage_marker",
        JOURNEY,
        # Unlike parse_journey_path_tasks, parse_done_tasks never resets
        # current_stage to None on a "✅" stage header — done tasks are always
        # appended regardless of stage completion.
        "\n### Etapa 1: Completa ✅\n- [x] Feita\n",
    ),
    (
        "both_parsers_together",
        JOURNEY,
        "\n### Etapa 1: Sprint\n- [x] Task concluída\n- [ ] Task pendente\n",
    ),
    (
        "cycle_header_with_checkmark_resets_stage",
        JOURNEY,
        # Legacy bold-cycle-header branch: a "**...✅**" line resets
        # current_stage to None, so the pending checkbox under it is dropped.
        "\n### Etapa 1: Sprint\n**Cycle 1 ✅**\n- [ ] Should be skipped\n",
    ),
    (
        "cycle_header_in_progress_is_noop",
        JOURNEY,
        # A bold header without "✅" while a stage is already active is a no-op
        # (neither branch of the cycle_match fires) — the task stays under the
        # existing stage.
        "\n### Etapa 1: Sprint\n**Cycle 2 in progress:**\n- [ ] Still under Sprint\n",
    ),
    (
        "plain_stage_header_without_etapa_prefix",
        JOURNEY,
        "\n### Plain Stage Name (no Etapa prefix)\n- [ ] Task under plain stage\n",
    ),
)


def main() -> None:
    cases = []
    for name, journey, journey_path in CASES:
        cases.append(
            {
                "name": name,
                "journey": journey,
                "journey_path": journey_path,
                "expected_pending": parse_journey_path_tasks(journey_path, journey),
                "expected_done": parse_done_tasks(journey_path, journey),
            }
        )

    golden = {"cases": cases}

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(golden, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    print(f"cases: {len(cases)}")
    print(f"wrote {OUT_PATH.relative_to(HERE.parent.parent)}")


if __name__ == "__main__":
    main()
