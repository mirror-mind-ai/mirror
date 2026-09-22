"""Capture what each Python probe feeds the pipeline (CV22.DS10.TS3 plateau 3).

The live eval modules carry their transcripts as Python literals inside probe
function bodies. Moving them to engine-neutral JSON by hand would be a
transcription exercise with a silent failure mode: a transcript that drifts by
one character changes what the model is asked, and no test would notice.

So the fixtures are not transcribed -- they are **captured**. Every callable a
module imported from ``memory.*`` is replaced by a recorder that returns a
type-plausible canned value, each probe is executed, and the arguments it
passed are written out. What the fixture holds is, by construction, what
Python fed the pipeline.

No network: the recorders stand in for every model-calling function, so this
runs free and offline. ``reception`` still reads the production database for
persona/journey metadata, exactly as its probes do; that metadata is
deliberately NOT captured (see ``_redact``).

This is the generator. ``evals/_check_fixture_equality.py`` is the check that
re-runs the capture and asserts the committed fixtures still match.

Run (as a module, from the repo root):
    uv run python -m evals._capture_probe_inputs
"""

from __future__ import annotations

import dataclasses
import importlib
import json
from pathlib import Path
from typing import Any

LIVE_MODULES = (
    "conversation_summary",
    "journal",
    "proportionality",
    "consolidate",
    "shadow",
    "title_tags",
    "extraction",
    "reception",
)

OUT_DIR = Path(__file__).resolve().parents[1] / "ts" / "evals" / "fixtures" / "captured"

def _canned_consolidation() -> Any:
    """A real Consolidation, so a consolidate/shadow probe runs to completion.

    Type-plausible returns are not cosmetic here: a probe that raises on the
    stand-in stops executing, and a SECOND pipeline call after that point
    would be silently missing from the capture. Letting every probe finish is
    what proves the captured call list is complete.
    """
    from memory.models import Consolidation

    # Field names and types come from the real model: `source_memory_ids` is a
    # string, and there is no `reasoning` field. A stand-in that fails its own
    # model's validation teaches nothing.
    return Consolidation(action="no_action", proposal="", source_memory_ids="")


def _canned_reception() -> Any:
    from memory.models import ReceptionResult

    return ReceptionResult(personas=[], journey=None, touches_identity=False, touches_shadow=False)


# Type-plausible stand-ins, so a probe gets as far through its own
# post-processing as possible and any second pipeline call is captured too.
CANNED: dict[str, Any] = {
    "generate_conversation_summary": "",
    "generate_conversation_title": "",
    "generate_conversation_tags": [],
    "generate_descriptor": "",
    "classify_journal_entry": {"title": "", "layer": "ego", "tags": []},
    "extract_memories": [],
    "curate_against_existing": [],
}

# Built lazily because they import memory.models at call time.
CANNED_FACTORIES: dict[str, Any] = {
    "propose_consolidation": _canned_consolidation,
    "propose_shadow_observations": lambda: [_canned_consolidation()],
    "reception": _canned_reception,
}


NONDETERMINISTIC = "<varies-per-run>"


def _jsonable(value: Any) -> Any:
    """Convert a captured argument into plain JSON data.

    Pydantic models are dumped structurally rather than repr'd. The first
    version of this fell through to ``repr()`` for ``Message``, which produced
    a single opaque string per message AND embedded a freshly generated uuid --
    a fixture that differed on every run, which would have made the equality
    check fail forever for a reason unrelated to drift.
    """
    if hasattr(value, "model_dump"):
        return {k: _jsonable(v) for k, v in value.model_dump().items()}
    if dataclasses.is_dataclass(value) and not isinstance(value, type):
        return {k: _jsonable(v) for k, v in dataclasses.asdict(value).items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(v) for v in value]
    if isinstance(value, dict):
        return {str(k): _jsonable(v) for k, v in value.items()}
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, bytes):
        return f"<bytes len={len(value)}>"
    return repr(value)


def _redact(module_name: str, call: dict) -> dict:
    """Drop arguments that are environment rather than fixture.

    ``reception`` passes the live persona and journey catalogue read from the
    production database. That is not a transcript and must not be committed:
    it is the Navigator's own data, and it drifts with the catalogue. The
    query is the fixture; the catalogue stays a runtime read in both engines.
    """
    if module_name == "reception" and call["function"] == "reception":
        args = call["args"]
        call = dict(call)
        call["args"] = args[:1]
        call["redacted"] = ["personas", "journeys"]
    return call


def _install_recorders(module: Any, sink: list[dict]) -> dict[str, Any]:
    """Replace every memory.* callable on the module with a recorder."""
    originals: dict[str, Any] = {}
    for name, value in list(vars(module).items()):
        if not callable(value):
            continue
        if not getattr(value, "__module__", "").startswith("memory."):
            continue
        if isinstance(value, type):
            continue  # Message/Memory/Identity/... are constructed by probes
        originals[name] = value

        def recorder(*args, __name=name, **kwargs):
            sink.append(
                {
                    "function": __name,
                    "args": [_jsonable(a) for a in args],
                    "kwargs": {k: _jsonable(v) for k, v in kwargs.items()},
                }
            )
            factory = CANNED_FACTORIES.get(__name)
            return factory() if factory else CANNED.get(__name)

        setattr(module, name, recorder)
    return originals


def capture_module(module_name: str, *, reload: bool = False) -> dict:
    module = importlib.import_module(f"evals.{module_name}")
    if reload:
        # Some modules build their fixtures at MODULE level (shadow constructs
        # an Identity whose id and timestamps come from default factories).
        # Two captures inside one process would share that instance and look
        # stable, while a fresh process produced different values -- so the
        # second capture re-executes the module body to expose exactly that.
        module = importlib.reload(module)
    probes = []

    for probe in module.PROBES:
        sink: list[dict] = []
        originals = _install_recorders(module, sink)
        try:
            probe.run()
        except Exception as exc:  # noqa: BLE001 -- the verdict is irrelevant here
            note = f"{type(exc).__name__}: {exc}"
        else:
            note = None
        finally:
            for name, original in originals.items():
                setattr(module, name, original)

        probes.append(
            {
                "id": probe.id,
                "description": probe.description,
                "blocking": "inject" in probe.id,
                "calls": [_redact(module_name, c) for c in sink],
                **({"probe_raised_after_capture": note} if note else {}),
            }
        )

    return {
        "provenance": {
            "source": f"evals/{module_name}.py",
            "story": "CV22.DS10.TS3",
            "method": "captured by executing each probe against recording stand-ins",
        },
        "threshold": module.THRESHOLD,
        "eval_model_pinned": getattr(module, "EVAL_MODEL", None) is not None,
        "prompt_count": len(getattr(module, "EVAL_PROMPTS", ())),
        "probes": probes,
    }


def _normalize_nondeterminism(first: Any, second: Any) -> Any:
    """Blank out any leaf that differs between two captures of the same probe.

    ``Memory.id``/``Message.id``/``created_at`` carry default factories, so a
    probe that does not set them explicitly produces a new uuid or timestamp
    each run. Rather than guess which fields are auto-generated -- shadow's
    probes set real ids their assertions depend on, and those must survive --
    this captures twice and normalizes exactly what moved. What is explicit in
    the source stays; what the factory invented becomes a marker.
    """
    if isinstance(first, dict) and isinstance(second, dict) and first.keys() == second.keys():
        return {k: _normalize_nondeterminism(first[k], second[k]) for k in first}
    if isinstance(first, list) and isinstance(second, list) and len(first) == len(second):
        return [_normalize_nondeterminism(a, b) for a, b in zip(first, second)]
    return first if first == second else NONDETERMINISTIC


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for module_name in LIVE_MODULES:
        captured = _normalize_nondeterminism(
            capture_module(module_name), capture_module(module_name, reload=True)
        )
        path = OUT_DIR / f"{module_name}.json"
        path.write_text(json.dumps(captured, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        calls = sum(len(p["calls"]) for p in captured["probes"])
        raised = sum(1 for p in captured["probes"] if "probe_raised_after_capture" in p)
        varies = json.dumps(captured).count(NONDETERMINISTIC)
        print(
            f"{module_name:22s} probes={len(captured['probes']):2d} "
            f"calls={calls:2d} post_capture_raises={raised} normalized_fields={varies}"
        )


if __name__ == "__main__":
    main()
