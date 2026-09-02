from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

from memory.cli.journey_projection import cmd_journey_projection

_FIXTURE_ROOT = Path(__file__).resolve().parents[3] / "fixtures/journey_projections/operational"


def _probe_fixture(home: Path) -> Path:
    target = home / ".journey-projection-probe/fixtures/journey"
    target.parent.mkdir(parents=True)
    shutil.copytree(_FIXTURE_ROOT / "journey", target)
    return target


def _prepare_args(home: Path, fixture: Path) -> list[str]:
    return [
        "probe-prepare",
        "--fixture-root",
        str(fixture),
        "--active-state",
        str(fixture / "ariad-active-work.json"),
        "--mirror-home",
        str(home),
        "--format",
        "json",
    ]


def test_capabilities_returns_only_implemented_operations(capsys) -> None:
    assert (
        cmd_journey_projection(["capabilities", "--mirror-home", "/unused", "--format", "json"])
        == 0
    )
    payload = json.loads(capsys.readouterr().out)
    assert payload == {
        "contractId": "mirror.journey-projections",
        "contractVersion": "1.0",
        "extensionApiVersion": "1.1",
        "operations": [
            "capabilities",
            "probe-prepare",
            "rebuild-operational",
            "inspect",
            "probe-publish",
        ],
    }


def test_unknown_operation_and_format_are_bounded_json(capsys) -> None:
    assert cmd_journey_projection(["not-real", "--format", "json"]) != 0
    unknown = json.loads(capsys.readouterr().out)
    assert unknown["code"] == "unsupported_contract"
    assert "not-real" not in unknown["message"]

    assert cmd_journey_projection(["capabilities", "--format", "yaml"]) != 0
    unsupported = json.loads(capsys.readouterr().out)
    assert unsupported["code"] == "unsupported_contract"
    assert "yaml" not in unsupported["message"]


def test_probe_prepare_and_rebuild_match_normative_fixture(
    tmp_path: Path, monkeypatch, capsys
) -> None:
    home = tmp_path / "isolated"
    fixture = _probe_fixture(home)
    monkeypatch.setenv("MEMORY_ENV", "test")
    monkeypatch.delenv("MIRROR_PRODUCTION_HOME", raising=False)
    monkeypatch.delenv("MIRROR_USER", raising=False)

    assert cmd_journey_projection(_prepare_args(home, fixture)) == 0
    prepared = json.loads(capsys.readouterr().out)
    assert prepared == {
        "status": "prepared",
        "journeyId": "projection-probe-journey",
    }
    assert sorted(path.name for path in home.glob("*.db")) == ["memory_test.db"]

    assert (
        cmd_journey_projection(
            [
                "rebuild-operational",
                "--journey",
                "projection-probe-journey",
                "--mirror-home",
                str(home),
                "--format",
                "json",
            ]
        )
        == 0
    )
    rebuilt = json.loads(capsys.readouterr().out)
    expected = json.loads((_FIXTURE_ROOT / "expected/operational.json").read_text(encoding="utf-8"))
    assert rebuilt["document"] == expected

    assert (
        cmd_journey_projection(
            [
                "inspect",
                "--journey",
                "projection-probe-journey",
                "--namespace",
                "ariad",
                "--projection",
                "operational",
                "--mirror-home",
                str(home),
                "--format",
                "json",
            ]
        )
        == 0
    )
    inspected = json.loads(capsys.readouterr().out)
    assert inspected["document"] == expected
    assert inspected["manifest"]["snapshotId"] == "op-probe-0001"


def test_public_rebuild_accepts_confined_parent_link_topology(
    tmp_path: Path, monkeypatch, capsys
) -> None:
    home = tmp_path / "isolated"
    fixture = _probe_fixture(home)
    roadmap = fixture / "docs/project/roadmap"
    shutil.rmtree(roadmap)
    capability = roadmap / "cv1"
    delivery = roadmap / "ds1"
    capability.mkdir(parents=True)
    delivery.mkdir()
    (roadmap / "index.md").write_text(
        "# Roadmap\n\n| Code | Capability Value | Status |\n|---|---|---|\n"
        "| [CV1](cv1/index.md) | One | Active |\n",
        encoding="utf-8",
    )
    (capability / "index.md").write_text(
        "# CV1 — One\n\n**Status:** Active\n\n## Outcome\n\nOne.\n\n"
        "| Code | Delivery Story | Status |\n|---|---|---|\n"
        "| [CV1.DS1](../ds1/index.md) | Root delivery | Planned |\n",
        encoding="utf-8",
    )
    (delivery / "index.md").write_text(
        "# CV1.DS1 — Root delivery\n\n**Status:** Planned\n\n"
        "## Outcome\n\nConfined parent traversal.\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("MEMORY_ENV", "test")
    monkeypatch.delenv("MIRROR_PRODUCTION_HOME", raising=False)
    monkeypatch.delenv("MIRROR_USER", raising=False)

    assert cmd_journey_projection(_prepare_args(home, fixture)) == 0
    capsys.readouterr()
    assert (
        cmd_journey_projection(
            [
                "rebuild-operational",
                "--journey",
                "projection-probe-journey",
                "--mirror-home",
                str(home),
                "--format",
                "json",
            ]
        )
        == 0
    )
    rebuilt = json.loads(capsys.readouterr().out)

    child = rebuilt["document"]["content"]["roadmap"]["roots"][0]["children"][0]
    assert child["id"] == "CV1.DS1"
    assert child["path"] == "docs/project/roadmap/ds1/index.md"


def test_probe_prepare_refuses_production_unconfined_and_symlink_inputs(
    tmp_path: Path, monkeypatch, capsys
) -> None:
    home = tmp_path / "isolated"
    fixture = _probe_fixture(home)
    monkeypatch.setenv("MEMORY_ENV", "production")
    assert cmd_journey_projection(_prepare_args(home, fixture)) != 0
    assert not list(home.glob("*.db"))
    capsys.readouterr()

    monkeypatch.setenv("MEMORY_ENV", "test")
    monkeypatch.setenv("MIRROR_PRODUCTION_HOME", str(home))
    assert cmd_journey_projection(_prepare_args(home, fixture)) != 0
    assert not list(home.glob("*.db"))
    capsys.readouterr()

    monkeypatch.setenv("MIRROR_PRODUCTION_HOME", str(tmp_path / "production"))
    outside = tmp_path / "outside"
    shutil.copytree(_FIXTURE_ROOT / "journey", outside)
    assert cmd_journey_projection(_prepare_args(home, outside)) != 0
    assert not list(home.glob("*.db"))
    capsys.readouterr()

    linked = home / ".journey-projection-probe/fixtures/linked"
    linked.symlink_to(outside, target_is_directory=True)
    assert cmd_journey_projection(_prepare_args(home, linked)) != 0
    assert not list(home.glob("*.db"))


def test_probe_publish_actor_mismatch_is_payload_free_and_preserves_files(
    tmp_path: Path, monkeypatch, capsys
) -> None:
    home = tmp_path / "isolated"
    fixture = _probe_fixture(home)
    monkeypatch.setenv("MEMORY_ENV", "test")
    monkeypatch.delenv("MIRROR_PRODUCTION_HOME", raising=False)
    monkeypatch.delenv("MIRROR_USER", raising=False)
    assert cmd_journey_projection(_prepare_args(home, fixture)) == 0
    capsys.readouterr()
    before = sorted(
        (path.relative_to(home).as_posix(), path.read_bytes())
        for path in home.rglob("*")
        if path.is_file()
    )
    secret = "PRIVATE-DOCUMENT-PAYLOAD"
    document = tmp_path / "candidate.json"
    schema = tmp_path / "schema.json"
    document.write_text(json.dumps({"secret": secret}), encoding="utf-8")
    schema.write_text(json.dumps({"type": "object"}), encoding="utf-8")

    result = cmd_journey_projection(
        [
            "probe-publish",
            "--journey",
            "projection-probe-journey",
            "--actor-namespace",
            "foreign",
            "--target-namespace",
            "projection-probe",
            "--projection",
            "tactical",
            "--document",
            str(document),
            "--schema",
            str(schema),
            "--mirror-home",
            str(home),
            "--format",
            "json",
        ]
    )

    assert result != 0
    output = capsys.readouterr().out
    assert "namespace_violation" in output
    assert secret not in output
    after = sorted(
        (path.relative_to(home).as_posix(), path.read_bytes())
        for path in home.rglob("*")
        if path.is_file()
    )
    assert after == before


def test_front_door_capabilities_uses_no_database_and_emits_one_json_document(
    tmp_path: Path,
) -> None:
    home = tmp_path / "mirror"
    env = os.environ.copy()
    env.update({"HOME": str(tmp_path), "MIRROR_HOME": str(home), "MEMORY_ENV": "test"})
    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "memory",
            "journey-projection",
            "capabilities",
            "--mirror-home",
            str(home),
            "--format",
            "json",
        ],
        text=True,
        capture_output=True,
        check=False,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["contractVersion"] == "1.0"
    assert not home.exists()
    assert result.stderr == ""
