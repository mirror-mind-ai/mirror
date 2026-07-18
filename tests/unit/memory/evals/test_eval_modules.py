"""Structural tests: verify eval modules expose the contract the runner requires.

These tests import the eval modules and inspect their structure without running
any probes — no real LLM calls, no database access, no API keys required.
"""

import importlib

import pytest
from evals.types import EvalProbe

pytestmark = pytest.mark.unit

EVAL_MODULES = [
    "evals.extraction",
    "evals.routing",
    "evals.proportionality",
    "evals.reception",
    "evals.retrieval",
    "evals.scene",
    "evals.shadow",
]

# CV9.E2.S19 (AI-11): evals that genuinely make no LLM call must declare an
# empty EVAL_PROMPTS/None EVAL_MODEL, not a fake hash — grounded from each
# module's own docstring ("no LLM calls" / "deterministic math").
_PROMPT_FREE_MODULES = {"evals.routing", "evals.retrieval"}


@pytest.fixture(params=EVAL_MODULES)
def eval_module(request):
    return importlib.import_module(request.param)


class TestEvalModuleContract:
    def test_exposes_probes_list(self, eval_module):
        assert hasattr(eval_module, "PROBES"), "module must expose PROBES"
        assert isinstance(eval_module.PROBES, list)

    def test_probes_list_is_non_empty(self, eval_module):
        assert len(eval_module.PROBES) > 0

    def test_all_probes_are_eval_probe_instances(self, eval_module):
        for probe in eval_module.PROBES:
            assert isinstance(probe, EvalProbe), f"{probe!r} is not an EvalProbe"

    def test_exposes_threshold_float(self, eval_module):
        assert hasattr(eval_module, "THRESHOLD"), "module must expose THRESHOLD"
        assert isinstance(eval_module.THRESHOLD, float)

    def test_threshold_between_zero_and_one(self, eval_module):
        assert 0.0 <= eval_module.THRESHOLD <= 1.0

    def test_all_probe_ids_non_empty(self, eval_module):
        for probe in eval_module.PROBES:
            assert probe.id, f"probe has empty id: {probe!r}"

    def test_all_probe_descriptions_non_empty(self, eval_module):
        for probe in eval_module.PROBES:
            assert probe.description, f"probe {probe.id!r} has empty description"

    def test_probe_ids_unique_within_module(self, eval_module):
        ids = [probe.id for probe in eval_module.PROBES]
        assert len(ids) == len(set(ids)), f"duplicate probe ids: {ids}"

    def test_all_probes_have_callable_run(self, eval_module):
        for probe in eval_module.PROBES:
            assert callable(probe.run), f"probe {probe.id!r} run is not callable"

    def test_exposes_eval_model(self, eval_module):
        assert hasattr(eval_module, "EVAL_MODEL"), "module must expose EVAL_MODEL"

    def test_exposes_eval_prompts_tuple(self, eval_module):
        assert hasattr(eval_module, "EVAL_PROMPTS"), "module must expose EVAL_PROMPTS"
        assert isinstance(eval_module.EVAL_PROMPTS, tuple)

    def test_prompt_free_evals_declare_empty_prompts_and_no_model(self, eval_module):
        if eval_module.__name__ in _PROMPT_FREE_MODULES:
            assert eval_module.EVAL_PROMPTS == ()
            assert eval_module.EVAL_MODEL is None

    def test_llm_evals_declare_nonempty_prompts_and_a_model(self, eval_module):
        if eval_module.__name__ not in _PROMPT_FREE_MODULES:
            assert len(eval_module.EVAL_PROMPTS) > 0
            assert eval_module.EVAL_MODEL is not None
