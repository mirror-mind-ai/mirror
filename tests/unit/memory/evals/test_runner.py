"""Unit tests for evals.runner."""

import pytest
from evals.persistence import EvalRunRecord
from evals.runner import (
    discover_eval_names,
    main,
    print_all_summary,
    print_history,
    run_all,
    run_eval,
)
from evals.types import EvalProbe, EvalReport, EvalResult

pytestmark = pytest.mark.unit


@pytest.fixture(autouse=True)
def _mock_persistence(mocker):
    """Isolate runner tests from real eval-history I/O by default (CV9.E2.S19).

    Tests targeting persistence explicitly request this fixture's return value
    to inspect what run_eval attempted to persist.
    """
    return mocker.patch("evals.runner.append_run")


def _passing_probe(probe_id: str = "p") -> EvalProbe:
    return EvalProbe(id=probe_id, description="always passes", run=lambda: (True, "ok"))


def _failing_probe(probe_id: str = "p") -> EvalProbe:
    return EvalProbe(id=probe_id, description="always fails", run=lambda: (False, "nope"))


def _raising_probe(probe_id: str = "p") -> EvalProbe:
    def _run():
        raise RuntimeError("boom")

    return EvalProbe(id=probe_id, description="raises", run=_run)


class TestRunEval:
    def test_returns_eval_report(self, mocker):
        mocker.patch(
            "evals.runner.importlib.import_module",
            return_value=type("M", (), {"PROBES": [_passing_probe()], "THRESHOLD": 0.8})(),
        )
        report = run_eval("anything")
        assert isinstance(report, EvalReport)

    def test_report_name_matches_eval(self, mocker):
        mocker.patch(
            "evals.runner.importlib.import_module",
            return_value=type("M", (), {"PROBES": [], "THRESHOLD": 0.8})(),
        )
        report = run_eval("my-eval")
        assert report.eval_name == "my-eval"

    def test_all_passing_probes_report_passed(self, mocker):
        mocker.patch(
            "evals.runner.importlib.import_module",
            return_value=type(
                "M",
                (),
                {"PROBES": [_passing_probe("a"), _passing_probe("b")], "THRESHOLD": 0.8},
            )(),
        )
        report = run_eval("x")
        assert report.passed is True

    def test_below_threshold_report_not_passed(self, mocker):
        probes = [_passing_probe("a"), _failing_probe("b"), _failing_probe("c")]
        mocker.patch(
            "evals.runner.importlib.import_module",
            return_value=type("M", (), {"PROBES": probes, "THRESHOLD": 0.8})(),
        )
        report = run_eval("x")
        assert report.passed is False

    def test_results_length_equals_probes_length(self, mocker):
        probes = [_passing_probe("a"), _failing_probe("b"), _passing_probe("c")]
        mocker.patch(
            "evals.runner.importlib.import_module",
            return_value=type("M", (), {"PROBES": probes, "THRESHOLD": 0.5})(),
        )
        report = run_eval("x")
        assert len(report.results) == 3

    def test_each_probe_run_called_once(self, mocker):
        call_counts = {"a": 0, "b": 0}

        def _make(pid):
            def _run():
                call_counts[pid] += 1
                return True, "ok"

            return EvalProbe(id=pid, description="", run=_run)

        probes = [_make("a"), _make("b")]
        mocker.patch(
            "evals.runner.importlib.import_module",
            return_value=type("M", (), {"PROBES": probes, "THRESHOLD": 0.8})(),
        )
        run_eval("x")
        assert call_counts == {"a": 1, "b": 1}

    def test_raising_probe_recorded_as_failure(self, mocker):
        mocker.patch(
            "evals.runner.importlib.import_module",
            return_value=type("M", (), {"PROBES": [_raising_probe("r")], "THRESHOLD": 0.8})(),
        )
        report = run_eval("x")
        assert len(report.results) == 1
        assert report.results[0].passed is False
        assert "boom" in report.results[0].notes

    def test_unknown_eval_name_raises_value_error(self, mocker):
        mocker.patch(
            "evals.runner.importlib.import_module",
            side_effect=ModuleNotFoundError("no module"),
        )
        with pytest.raises(ValueError, match="unknown-eval"):
            run_eval("unknown-eval")

    def test_missing_probes_attribute_raises_value_error(self, mocker):
        mocker.patch(
            "evals.runner.importlib.import_module",
            return_value=type("M", (), {"THRESHOLD": 0.8})(),  # no PROBES
        )
        with pytest.raises(ValueError, match="PROBES"):
            run_eval("x")

    def test_threshold_from_module_used_in_report(self, mocker):
        mocker.patch(
            "evals.runner.importlib.import_module",
            return_value=type("M", (), {"PROBES": [_passing_probe()], "THRESHOLD": 0.6})(),
        )
        report = run_eval("x")
        assert report.threshold == pytest.approx(0.6)

    def test_result_probe_ids_match_probe_ids(self, mocker):
        probes = [_passing_probe("alpha"), _failing_probe("beta")]
        mocker.patch(
            "evals.runner.importlib.import_module",
            return_value=type("M", (), {"PROBES": probes, "THRESHOLD": 0.5})(),
        )
        report = run_eval("x")
        ids = [r.probe_id for r in report.results]
        assert ids == ["alpha", "beta"]


class TestRunEvalPersistence:
    """CV9.E2.S19 (AI-11) — every run builds and persists a durable record."""

    def test_persists_exactly_one_record(self, mocker, _mock_persistence):
        mocker.patch(
            "evals.runner.importlib.import_module",
            return_value=type("M", (), {"PROBES": [_passing_probe()], "THRESHOLD": 0.8})(),
        )
        run_eval("x")
        _mock_persistence.assert_called_once()

    def test_record_matches_report(self, mocker, _mock_persistence):
        probes = [_passing_probe("a"), _failing_probe("b")]
        mocker.patch(
            "evals.runner.importlib.import_module",
            return_value=type("M", (), {"PROBES": probes, "THRESHOLD": 0.8})(),
        )
        run_eval("my-eval")
        record = _mock_persistence.call_args[0][0]
        assert isinstance(record, EvalRunRecord)
        assert record.eval_name == "my-eval"
        assert record.score == pytest.approx(0.5)
        assert record.threshold == pytest.approx(0.8)
        assert record.passed is False
        assert [p["id"] for p in record.probes] == ["a", "b"]
        assert record.started_at <= record.ended_at

    def test_prompt_free_module_records_none_hash_and_model(self, mocker, _mock_persistence):
        mocker.patch(
            "evals.runner.importlib.import_module",
            return_value=type(
                "M",
                (),
                {
                    "PROBES": [_passing_probe()],
                    "THRESHOLD": 0.8,
                    "EVAL_MODEL": None,
                    "EVAL_PROMPTS": (),
                },
            )(),
        )
        run_eval("x")
        record = _mock_persistence.call_args[0][0]
        assert record.model is None
        assert record.prompt_hash is None

    def test_module_declaring_neither_constant_defaults_to_none(self, mocker, _mock_persistence):
        mocker.patch(
            "evals.runner.importlib.import_module",
            return_value=type("M", (), {"PROBES": [_passing_probe()], "THRESHOLD": 0.8})(),
        )
        run_eval("x")
        record = _mock_persistence.call_args[0][0]
        assert record.model is None
        assert record.prompt_hash is None

    def test_prompt_hash_stable_for_same_prompts(self, mocker, _mock_persistence):
        module = type(
            "M",
            (),
            {
                "PROBES": [_passing_probe()],
                "THRESHOLD": 0.8,
                "EVAL_MODEL": "m",
                "EVAL_PROMPTS": ("same prompt",),
            },
        )()
        mocker.patch("evals.runner.importlib.import_module", return_value=module)
        run_eval("x")
        hash_1 = _mock_persistence.call_args[0][0].prompt_hash
        run_eval("x")
        hash_2 = _mock_persistence.call_args[0][0].prompt_hash
        assert hash_1 == hash_2
        assert hash_1 is not None

    def test_prompt_hash_changes_when_prompt_changes(self, mocker, _mock_persistence):
        def _module(prompt):
            return type(
                "M",
                (),
                {
                    "PROBES": [_passing_probe()],
                    "THRESHOLD": 0.8,
                    "EVAL_MODEL": "m",
                    "EVAL_PROMPTS": (prompt,),
                },
            )()

        mocker.patch(
            "evals.runner.importlib.import_module",
            side_effect=[_module("prompt a"), _module("prompt b")],
        )
        run_eval("x")
        hash_a = _mock_persistence.call_args[0][0].prompt_hash
        run_eval("x")
        hash_b = _mock_persistence.call_args[0][0].prompt_hash

        assert hash_a != hash_b

    def test_persistence_failure_does_not_affect_report_or_exit_code(self, mocker):
        # append_run is itself fail-soft (test_persistence.py), but run_eval
        # defends in depth: even if that contract were ever violated, a
        # persistence error must never surface as an eval failure.
        mocker.patch("evals.runner.append_run", side_effect=RuntimeError("disk full"))
        mocker.patch(
            "evals.runner.importlib.import_module",
            return_value=type("M", (), {"PROBES": [_passing_probe()], "THRESHOLD": 0.8})(),
        )
        report = run_eval("x")  # must not raise
        assert report.passed is True


class TestPrintHistory:
    """CV9.E2.S19 — the --history reader surfaces trend and probe-level flips."""

    def test_empty_history_prints_clear_message(self, mocker, capsys):
        mocker.patch("evals.runner.read_history", return_value=[])
        print_history("x")
        out = capsys.readouterr().out
        assert "no" in out.lower() and "history" in out.lower()

    def test_renders_each_record(self, mocker, capsys):
        mocker.patch(
            "evals.runner.read_history",
            return_value=[
                EvalRunRecord(
                    eval_name="x",
                    started_at="2026-07-17T00:00:01+00:00",
                    ended_at="2026-07-17T00:00:02+00:00",
                    model="m",
                    prompt_hash="h1",
                    score=0.9,
                    threshold=0.8,
                    passed=True,
                    probes=[{"id": "p", "passed": True, "notes": "ok"}],
                ),
            ],
        )
        print_history("x")
        out = capsys.readouterr().out
        assert "0.9" in out

    def test_flags_a_probe_that_regressed(self, mocker, capsys):
        older = EvalRunRecord(
            eval_name="x",
            started_at="t0",
            ended_at="t0",
            model="m",
            prompt_hash="h",
            score=1.0,
            threshold=0.8,
            passed=True,
            probes=[{"id": "p", "passed": True, "notes": "ok"}],
        )
        newer = EvalRunRecord(
            eval_name="x",
            started_at="t1",
            ended_at="t1",
            model="m",
            prompt_hash="h2",
            score=1.0,
            threshold=0.8,
            passed=True,
            probes=[{"id": "p", "passed": False, "notes": "broke"}],
        )
        mocker.patch("evals.runner.read_history", return_value=[newer, older])
        print_history("x")
        out = capsys.readouterr().out
        assert "p" in out and ("regress" in out.lower() or "flip" in out.lower())


class TestMainHistoryFlag:
    def test_main_dispatches_to_history(self, mocker):
        ph = mocker.patch("evals.runner.print_history")
        mocker.patch("evals.runner.run_eval")  # must not be called
        code = main(["x", "--history"])
        ph.assert_called_once()
        assert code == 0

    def test_main_history_accepts_explicit_limit(self, mocker):
        ph = mocker.patch("evals.runner.print_history")
        code = main(["x", "--history", "3"])
        assert ph.call_args.kwargs.get("limit") == 3 or ph.call_args[0][1] == 3
        assert code == 0


def _report(name: str, passed: bool = True) -> EvalReport:
    """A minimal report with one probe of the given outcome."""
    report = EvalReport(eval_name=name, threshold=0.8)
    report.results.append(EvalResult(probe_id="p", passed=passed, notes=""))
    return report


class TestDiscoverEvalNames:
    """CV9.E2.S24 (AI-11 item 3) — the release gate runs every eval by
    capability (a module exposing PROBES), never a hand-maintained list, so a
    new eval module joins the gate automatically.
    """

    def test_discovers_every_probe_module(self):
        # An eval is any evals/*.py exposing PROBES. Adding a new eval module
        # must consciously join the release gate — this contract test is the
        # checkpoint that makes that a decision, not an accident (QA).
        assert set(discover_eval_names()) == {
            "consolidate",
            "extraction",
            "journal",
            "proportionality",
            "reception",
            "retrieval",
            "retrieval_relevance",
            "routing",
            "scene",
            "shadow",
            "title_tags",
        }

    def test_excludes_infrastructure_modules(self):
        names = discover_eval_names()
        for infra in ("runner", "persistence", "types", "_support", "__init__"):
            assert infra not in names

    def test_returns_sorted(self):
        names = discover_eval_names()
        assert names == sorted(names)


class TestRunAll:
    """CV9.E2.S24 — run each eval under one shared suite run id, aggregate the
    reports, keep the model call out of the aggregation seam (testable with an
    injected runner, no network).
    """

    def test_runs_each_name_via_injected_runner(self):
        calls = []

        def fake(name, suite_run_id=None):
            calls.append(name)
            return _report(name)

        run_all(["a", "b", "c"], runner=fake)
        assert calls == ["a", "b", "c"]

    def test_threads_one_suite_run_id_to_every_eval(self):
        seen = []

        def fake(name, suite_run_id=None):
            seen.append(suite_run_id)
            return _report(name)

        run_all(["a", "b"], runner=fake)
        assert seen[0] is not None
        assert len(set(seen)) == 1  # one id shared across the whole suite

    def test_returns_reports_in_order(self):
        reports = run_all(["x", "y"], runner=lambda name, suite_run_id=None: _report(name))
        assert [r.eval_name for r in reports] == ["x", "y"]

    def test_invokes_on_report_callback_per_eval(self):
        seen = []
        run_all(
            ["a", "b"],
            runner=lambda name, suite_run_id=None: _report(name),
            on_report=lambda r: seen.append(r.eval_name),
        )
        assert seen == ["a", "b"]

    def test_real_mechanism_over_hermetic_eval(self):
        # QA's highest-value add: exercise the real run_all → run_eval →
        # EvalReport path against a hermetic eval (retrieval: pure scoring
        # math, no network, no DB) so the aggregation plumbing is proven on
        # real reports, not only mocks. append_run is mocked by the autouse
        # fixture, so no history is written.
        reports = run_all(["retrieval"])
        assert len(reports) == 1
        assert reports[0].eval_name == "retrieval"
        assert len(reports[0].results) > 0  # real probes actually ran


class TestSuiteRunIdThreading:
    """CV9.E2.S24 (DB-architect) — run_eval stamps the suite id it is given;
    a standalone run leaves it None.
    """

    def test_run_eval_stamps_suite_run_id(self, mocker, _mock_persistence):
        mocker.patch(
            "evals.runner.importlib.import_module",
            return_value=type("M", (), {"PROBES": [_passing_probe()], "THRESHOLD": 0.8})(),
        )
        run_eval("x", suite_run_id="suite-123")
        assert _mock_persistence.call_args[0][0].suite_run_id == "suite-123"

    def test_standalone_run_leaves_suite_run_id_none(self, mocker, _mock_persistence):
        mocker.patch(
            "evals.runner.importlib.import_module",
            return_value=type("M", (), {"PROBES": [_passing_probe()], "THRESHOLD": 0.8})(),
        )
        run_eval("x")
        assert _mock_persistence.call_args[0][0].suite_run_id is None


class TestMainAllFlag:
    """CV9.E2.S24 — `eval --all` runs the whole suite; exit code is 0 iff every
    eval passes, and the summary names which evals failed (not just a count).
    """

    def test_all_runs_full_suite_returns_zero_when_all_pass(self, mocker):
        mocker.patch("evals.runner.discover_eval_names", return_value=["a", "b"])
        mocker.patch(
            "evals.runner.run_eval",
            side_effect=lambda n, suite_run_id=None: _report(n, passed=True),
        )
        assert main(["--all"]) == 0

    def test_all_returns_one_when_any_eval_fails(self, mocker):
        mocker.patch("evals.runner.discover_eval_names", return_value=["a", "b"])
        mocker.patch(
            "evals.runner.run_eval",
            side_effect=lambda n, suite_run_id=None: _report(n, passed=(n != "b")),
        )
        assert main(["--all"]) == 1

    def test_all_summary_names_failing_evals(self, mocker, capsys):
        mocker.patch("evals.runner.discover_eval_names", return_value=["good", "bad"])
        mocker.patch(
            "evals.runner.run_eval",
            side_effect=lambda n, suite_run_id=None: _report(n, passed=(n != "bad")),
        )
        main(["--all"])
        assert "bad" in capsys.readouterr().out

    def test_all_takes_precedence_over_history(self, mocker):
        mocker.patch("evals.runner.discover_eval_names", return_value=["a"])
        mocker.patch(
            "evals.runner.run_eval",
            side_effect=lambda n, suite_run_id=None: _report(n, passed=True),
        )
        ph = mocker.patch("evals.runner.print_history")
        code = main(["--all", "--history"])
        ph.assert_not_called()
        assert code == 0


class TestPrintAllSummary:
    def test_all_pass_reports_no_failures(self, capsys):
        print_all_summary([_report("a"), _report("b")])
        out = capsys.readouterr().out
        assert "2/2" in out

    def test_names_each_failing_eval(self, capsys):
        print_all_summary([_report("ok"), _report("broken", passed=False)])
        out = capsys.readouterr().out
        assert "broken" in out
