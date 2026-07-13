"""CV9.E2.S6 — detection of legacy runtime state in the homes root.

The homes root (~/.mirror-minds) must contain only user-home directories.
Databases, logs, locks, and backups directly under the root are legacy
artifacts from the pre-containment resolution rule; `runtime diagnose`
reports them with a manual relocation route.
"""

from memory.cli.runtime import root_state_findings, scan_homes_root_state


def test_scan_reports_runtime_files_in_homes_root(tmp_path):
    root = tmp_path / ".mirror-minds"
    (root / "alice").mkdir(parents=True)
    (root / "memory_dev.db").write_bytes(b"")
    (root / "memory.db.bootstrap.lock").write_bytes(b"")
    (root / "mirror-logger.log").write_text("x")
    (root / "backups").mkdir()

    offenders = scan_homes_root_state(root)

    assert {path.name for path in offenders} == {
        "memory_dev.db",
        "memory.db.bootstrap.lock",
        "mirror-logger.log",
        "backups",
    }


def test_scan_ignores_user_home_directories_and_hidden_entries(tmp_path):
    root = tmp_path / ".mirror-minds"
    (root / "alice").mkdir(parents=True)
    (root / "bob").mkdir()
    (root / ".DS_Store").write_bytes(b"")

    assert scan_homes_root_state(root) == ()


def test_scan_handles_missing_root(tmp_path):
    assert scan_homes_root_state(tmp_path / "does-not-exist") == ()


def test_root_state_findings_report_attention_with_relocation_route(tmp_path):
    root = tmp_path / ".mirror-minds"
    root.mkdir()
    (root / "memory_dev.db").write_bytes(b"")
    (root / "mirror-logger.log").write_text("x")

    findings = root_state_findings(root)

    assert len(findings) == 2
    for finding in findings:
        assert finding.code == "legacy_root_runtime_state"
        assert finding.severity == "attention"
        assert str(root) in finding.subject or root.name in finding.subject
        assert "REFERENCE" in finding.recommendation or "reloc" in finding.recommendation.lower()


def test_root_state_findings_empty_when_root_is_clean(tmp_path):
    root = tmp_path / ".mirror-minds"
    (root / "alice").mkdir(parents=True)

    assert root_state_findings(root) == ()
