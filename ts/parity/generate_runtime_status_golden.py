"""Generate the runtime status golden (CV22.DS7.TS3, plateau 3a).

`runtime status` answers "is this install healthy?" from four independent
readers: the core migration ledger, the installed extension set, each
extension's own migration bookkeeping, and the ambient runtime facts. This
corpus grades all four over FIXTURE mirror homes built here and rebuilt
identically by the TypeScript test -- no repository, no network, no real home.

Git inspection is deliberately out of this corpus: plateau 1's
`runtime-git.golden.json` already grades it against a fixture repository with a
`file://` remote. Every scenario here runs from the same CLEAN fixture
repository, which holds the git block constant and -- more to the point --
keeps `git.error` and `git.dirty` out of the verdict, so `Status:` reports what
the status readers found rather than a constant "attention needed" from a
start directory that was never a repository.

THE POINT OF THE STORY is the `ts_migrated` scenario. Python grades the ledger
against its own 16 migrations, so the TypeScript-authored
`017_journey_parent_column` reads as `unknown` and every install that has run
the TS engine is told it needs attention. Both renders are recorded here side
by side; the TypeScript test asserts its own, and the divergence is a scenario
rather than a skipped assertion.

Three values are ambient and would otherwise change the corpus per machine or
per CI Python: the package version (pinned to a fixture), and the Python and
Node versions (replaced with placeholders that the TypeScript test substitutes
the same way). Everything else is real oracle output.

Run:  uv run python ts/parity/generate_runtime_status_golden.py
"""

from __future__ import annotations

import json
import os
import sqlite3
import subprocess
import tempfile
from dataclasses import asdict, is_dataclass
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT_PATH = HERE.parent / "test" / "goldens" / "runtime-status.golden.json"

AMBIENT_KEYS = (
    "MEMORY_DIR",
    "MEMORY_PROD_DIR",
    "MEMORY_ENV",
    "DB_PATH",
    "DB_BACKUP_PATH",
    "MIRROR_HOME",
    "MIRROR_USER",
    "MEMORY_EXTRACTION_MODEL",
    "MEMORY_EMBEDDING_MODEL",
    "MEMORY_LLM_TIMEOUT_RECEPTION",
    "MEMORY_LLM_TIMEOUT_EMBEDDING",
    "MEMORY_LLM_TIMEOUT_EXTRACTION",
    "MEMORY_LLM_MAX_RETRIES",
)


def clear_ambient_env() -> None:
    """Detach the corpus from this machine.

    Must be called TWICE, and the second call is the one that matters:
    ``memory.config`` walks upward for a ``.env`` and applies it with
    ``os.environ.setdefault`` AT IMPORT TIME, so anything cleared before the
    import is quietly restored by it. Without the second call this generator
    resolves the developer's real mirror home and bakes their private paths,
    extension list, and database state into a committed golden.
    """
    for key in AMBIENT_KEYS:
        os.environ.pop(key, None)


# The status report reads MEMORY_ENV and the model/timeout pins straight from
# config; clearing them pins the corpus to the documented defaults.
clear_ambient_env()

FIXTURE_VERSION = "9.9.9"

# Same recipe as the plateau 1 generator: fixed content and fixed author and
# committer dates make the commit id content-addressed and path-independent, so
# the TypeScript test rebuilds the repository and gets the same short hash.
GIT_ENV = {
    **os.environ,
    "GIT_AUTHOR_NAME": "Mirror Fixture",
    "GIT_AUTHOR_EMAIL": "fixture@example.invalid",
    "GIT_COMMITTER_NAME": "Mirror Fixture",
    "GIT_COMMITTER_EMAIL": "fixture@example.invalid",
    "GIT_AUTHOR_DATE": "2026-09-01T12:00:00+00:00",
    "GIT_COMMITTER_DATE": "2026-09-01T12:00:00+00:00",
    "GIT_TERMINAL_PROMPT": "0",
    "GIT_CONFIG_GLOBAL": "/dev/null",
    "GIT_CONFIG_SYSTEM": "/dev/null",
}


def build_repository(root: Path) -> Path:
    """A clean single-commit repository on `stable`, with no remote."""
    repo = root / "repo"
    repo.mkdir(parents=True)
    for args in (
        ("init", "--initial-branch=stable"),
        ("add", "."),
        ("commit", "-m", "fixture"),
    ):
        if args[0] == "add":
            (repo / "README.md").write_text("fixture\n", encoding="utf-8")
        subprocess.run(
            ["git", *args], cwd=repo, env=GIT_ENV, check=True, capture_output=True, text=True
        )
    return repo

# Python's own migration list, as of this story. The TS manifest is this plus
# `017_journey_parent_column` (CV22.DS6.US2, the first TS-authored migration).
PYTHON_MIGRATION_IDS = [
    "001_project_to_travessia",
    "002_create_attachments",
    "003_create_tasks",
    "004_tasks_temporal_fields",
    "005_travessia_to_journey",
    "006_create_llm_calls",
    "007_create_identity_descriptors",
    "008_create_memories_fts",
    "009_memories_reinforcement_columns",
    "010_create_consolidations",
    "011_create_operation_runs",
    "012_create_operation_run_events",
    "013_create_exploratory_stories",
    "014_create_identity_integrations",
    "015_create_builder_workbench",
    "016_builder_workbench_display_codes",
]
TS_AUTHORED_MIGRATION_ID = "017_journey_parent_column"

MIGRATION_SQL = "CREATE TABLE IF NOT EXISTS ext_demo_widget_notes (id INTEGER PRIMARY KEY);\n"
# Same statement, reformatted and commented: the checksum must not move.
MIGRATION_SQL_REFORMATTED = (
    "-- a comment the checksum ignores\nCREATE TABLE IF NOT EXISTS ext_demo_widget_notes\n"
    "  (\n    id INTEGER PRIMARY KEY\n  ) ;\n"
)
# A BOM is not whitespace to Python and IS whitespace to a naive JavaScript
# `\\s`. Both cores must keep it, or one of them silently rewrites the hash.
MIGRATION_SQL_BOM = "\ufeff" + MIGRATION_SQL


def _serialize(value: object) -> object:
    if is_dataclass(value):
        return {key: _serialize(item) for key, item in asdict(value).items()}
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, (list, tuple)):
        return [_serialize(item) for item in value]
    if isinstance(value, dict):
        return {key: _serialize(item) for key, item in value.items()}
    return value


def write_manifest(directory: Path, body: str) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "skill.yaml").write_text(body, encoding="utf-8")


def command_skill_manifest(extension_id: str) -> str:
    return (
        f"id: {extension_id}\n"
        f"name: {extension_id}\n"
        "category: extension\n"
        "kind: command-skill\n"
        "summary: a fixture extension\n"
        "entrypoint:\n"
        "  module: handler\n"
        "runtimes:\n"
        "  pi:\n"
        f"    command_name: ext-{extension_id}\n"
    )


def prompt_skill_manifest(extension_id: str) -> str:
    return (
        f"id: {extension_id}\n"
        f"name: {extension_id}\n"
        "category: extension\n"
        "kind: prompt-skill\n"
        "summary: a fixture extension\n"
        "runtimes:\n"
        "  pi:\n"
        f"    command_name: ext-{extension_id}\n"
        "    skill_file: SKILL.md\n"
    )


def build_command_skill(root: Path, extension_id: str) -> Path:
    directory = root / extension_id
    write_manifest(directory, command_skill_manifest(extension_id))
    (directory / "handler.py").write_text("# fixture\n", encoding="utf-8")
    return directory


def create_database(path: Path, migration_ids: list[str], *, ledger: bool = True) -> None:
    conn = sqlite3.connect(path)
    try:
        if ledger:
            conn.execute("CREATE TABLE _migrations (id TEXT PRIMARY KEY, applied_at TEXT)")
            for migration_id in migration_ids:
                conn.execute(
                    "INSERT INTO _migrations (id, applied_at) VALUES (?, ?)",
                    (migration_id, "2026-09-01T12:00:00+00:00"),
                )
        else:
            conn.execute("CREATE TABLE placeholder (id INTEGER PRIMARY KEY)")
        conn.commit()
    finally:
        conn.close()


def add_ext_ledger(path: Path, rows: list[tuple[str, str, str]]) -> None:
    conn = sqlite3.connect(path)
    try:
        conn.execute(
            "CREATE TABLE _ext_migrations ("
            "extension_id TEXT, filename TEXT, checksum TEXT, applied_at TEXT)"
        )
        for extension_id, filename, checksum in rows:
            conn.execute(
                "INSERT INTO _ext_migrations "
                "(extension_id, filename, checksum, applied_at) VALUES (?, ?, ?, ?)",
                (extension_id, filename, checksum, "2026-09-01T12:00:00+00:00"),
            )
        conn.commit()
    finally:
        conn.close()


def main() -> None:
    from memory.cli import runtime as rt
    from memory.extensions.migrations import _checksum

    # The import above just re-applied `.env`. See `clear_ambient_env`.
    clear_ambient_env()

    # `package_version()` prefers INSTALLED distribution metadata -- this
    # machine's Mirror version, which would change the corpus at every release.
    original_package_version = rt.package_version
    rt.package_version = lambda: FIXTURE_VERSION  # type: ignore[assignment]

    scenarios: dict[str, object] = {}
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp).resolve()
        repo = build_repository(root)

        def snapshot(label: str, home: Path | None) -> None:
            report = rt.build_runtime_status(start=repo, mirror_home_arg=home)
            scenarios[label] = {
                "report": _serialize(report),
                "status": report.status,
                "render": rt.render_runtime_status(report),
            }

        # --- core migration ledger -------------------------------------
        home = root / "home-db-missing"
        home.mkdir()
        snapshot("db_missing", home)

        home = root / "home-ledger-missing"
        home.mkdir()
        create_database(home / "memory.db", [], ledger=False)
        snapshot("ledger_missing", home)

        home = root / "home-python-current"
        home.mkdir()
        create_database(home / "memory.db", PYTHON_MIGRATION_IDS)
        snapshot("python_current", home)

        # THE STORY'S REASON. Python: unknown 017 -> attention needed.
        # TypeScript: current (17/17). Both renders recorded.
        home = root / "home-ts-migrated"
        home.mkdir()
        create_database(home / "memory.db", [*PYTHON_MIGRATION_IDS, TS_AUTHORED_MIGRATION_ID])
        snapshot("ts_migrated", home)

        home = root / "home-migrations-missing"
        home.mkdir()
        create_database(home / "memory.db", PYTHON_MIGRATION_IDS[:10])
        snapshot("migrations_missing", home)

        home = root / "home-unknown-migration"
        home.mkdir()
        create_database(home / "memory.db", [*PYTHON_MIGRATION_IDS, "999_from_the_future"])
        snapshot("unknown_migration", home)

        # --- extension health -------------------------------------------
        home = root / "home-ext-clean"
        home.mkdir()
        create_database(home / "memory.db", PYTHON_MIGRATION_IDS)
        extensions = home / "extensions"
        applied = build_command_skill(extensions, "demo-widget")
        (applied / "migrations").mkdir()
        (applied / "migrations" / "001_init.sql").write_text(MIGRATION_SQL, encoding="utf-8")
        # A reformatted+commented file whose recorded checksum still matches.
        reformatted = build_command_skill(extensions, "demo-reformat")
        (reformatted / "migrations").mkdir()
        (reformatted / "migrations" / "001_init.sql").write_text(
            MIGRATION_SQL_REFORMATTED, encoding="utf-8"
        )
        # A BOM'd file, recorded under the checksum Python computes for it.
        bom = build_command_skill(extensions, "demo-bom")
        (bom / "migrations").mkdir()
        (bom / "migrations" / "001_init.sql").write_text(MIGRATION_SQL_BOM, encoding="utf-8")
        write_manifest(extensions / "demo-prompt", prompt_skill_manifest("demo-prompt"))
        (extensions / "demo-prompt" / "SKILL.md").write_text("# fixture\n", encoding="utf-8")
        add_ext_ledger(
            home / "memory.db",
            [
                ("demo-widget", "001_init.sql", _checksum(MIGRATION_SQL)),
                ("demo-reformat", "001_init.sql", _checksum(MIGRATION_SQL)),
                ("demo-bom", "001_init.sql", _checksum(MIGRATION_SQL_BOM)),
            ],
        )
        snapshot("ext_clean", home)

        home = root / "home-ext-pending"
        home.mkdir()
        create_database(home / "memory.db", PYTHON_MIGRATION_IDS)
        pending = build_command_skill(home / "extensions", "demo-widget")
        (pending / "migrations").mkdir()
        (pending / "migrations" / "001_init.sql").write_text(MIGRATION_SQL, encoding="utf-8")
        (pending / "migrations" / "002_more.sql").write_text(MIGRATION_SQL, encoding="utf-8")
        add_ext_ledger(
            home / "memory.db", [("demo-widget", "001_init.sql", _checksum(MIGRATION_SQL))]
        )
        snapshot("ext_pending", home)

        home = root / "home-ext-drift"
        home.mkdir()
        create_database(home / "memory.db", PYTHON_MIGRATION_IDS)
        drift = build_command_skill(home / "extensions", "demo-widget")
        (drift / "migrations").mkdir()
        (drift / "migrations" / "001_init.sql").write_text(
            MIGRATION_SQL.replace("notes", "renamed"), encoding="utf-8"
        )
        add_ext_ledger(
            home / "memory.db", [("demo-widget", "001_init.sql", _checksum(MIGRATION_SQL))]
        )
        snapshot("ext_drift", home)

        home = root / "home-ext-unknown-applied"
        home.mkdir()
        create_database(home / "memory.db", PYTHON_MIGRATION_IDS)
        unknown_applied = build_command_skill(home / "extensions", "demo-widget")
        (unknown_applied / "migrations").mkdir()
        (unknown_applied / "migrations" / "001_init.sql").write_text(
            MIGRATION_SQL, encoding="utf-8"
        )
        add_ext_ledger(
            home / "memory.db",
            [
                ("demo-widget", "001_init.sql", _checksum(MIGRATION_SQL)),
                ("demo-widget", "002_vanished.sql", _checksum(MIGRATION_SQL)),
            ],
        )
        snapshot("ext_unknown_applied", home)

        home = root / "home-ext-ledger-missing"
        home.mkdir()
        create_database(home / "memory.db", PYTHON_MIGRATION_IDS)
        no_ledger = build_command_skill(home / "extensions", "demo-widget")
        (no_ledger / "migrations").mkdir()
        (no_ledger / "migrations" / "001_init.sql").write_text(MIGRATION_SQL, encoding="utf-8")
        snapshot("ext_ledger_missing", home)

        home = root / "home-ext-no-migrations"
        home.mkdir()
        create_database(home / "memory.db", PYTHON_MIGRATION_IDS)
        build_command_skill(home / "extensions", "demo-widget")
        snapshot("ext_no_migrations", home)

        home = root / "home-ext-bad-filename"
        home.mkdir()
        create_database(home / "memory.db", PYTHON_MIGRATION_IDS)
        bad_name = build_command_skill(home / "extensions", "demo-widget")
        (bad_name / "migrations").mkdir()
        (bad_name / "migrations" / "1_init.sql").write_text(MIGRATION_SQL, encoding="utf-8")
        add_ext_ledger(home / "memory.db", [])
        snapshot("ext_bad_filename", home)

        home = root / "home-ext-db-missing"
        home.mkdir()
        build_command_skill(home / "extensions", "demo-widget")
        snapshot("ext_database_unavailable", home)

        # --- manifest validation branches --------------------------------
        invalid_manifests = {
            "missing_field": "id: demo\nname: demo\ncategory: extension\nkind: command-skill\n",
            "empty_runtimes": (
                "id: demo\nname: demo\ncategory: extension\nkind: command-skill\n"
                "summary: s\nruntimes: {}\n"
            ),
            "bad_skill_id": (
                "id: Demo_Widget\nname: demo\ncategory: extension\nkind: command-skill\n"
                "summary: s\nruntimes:\n  pi:\n    command_name: ext-demo\n"
            ),
            "bad_category": (
                "id: demo\nname: demo\ncategory: core\nkind: command-skill\n"
                "summary: s\nruntimes:\n  pi:\n    command_name: ext-demo\n"
            ),
            "bad_kind": (
                "id: demo\nname: demo\ncategory: extension\nkind: wizard\n"
                "summary: s\nruntimes:\n  pi:\n    command_name: ext-demo\n"
            ),
            "missing_entrypoint": (
                "id: demo\nname: demo\ncategory: extension\nkind: command-skill\n"
                "summary: s\nruntimes:\n  pi:\n    command_name: ext-demo\n"
            ),
            "bad_command_prefix": (
                "id: demo\nname: demo\ncategory: extension\nkind: prompt-skill\n"
                "summary: s\nruntimes:\n  pi:\n    command_name: demo\n"
                "    skill_file: SKILL.md\n"
            ),
            "not_a_mapping": "- just\n- a\n- list\n",
        }
        for label, body in invalid_manifests.items():
            home = root / f"home-manifest-{label.replace('_', '-')}"
            home.mkdir()
            create_database(home / "memory.db", PYTHON_MIGRATION_IDS)
            write_manifest(home / "extensions" / "demo-widget", body)
            snapshot(f"manifest_{label}", home)

        # Branches whose message embeds an absolute path, which is the
        # strongest parity pressure the validator has: the note must name the
        # same file, spelled the same way, from both cores.
        home = root / "home-manifest-prefix-mismatch"
        home.mkdir()
        create_database(home / "memory.db", PYTHON_MIGRATION_IDS)
        mismatch = build_command_skill(home / "extensions", "demo-widget")
        write_manifest(
            mismatch,
            command_skill_manifest("demo-widget") + "table_prefix: ext_wrong_\n",
        )
        snapshot("manifest_table_prefix_mismatch", home)

        home = root / "home-manifest-module-missing"
        home.mkdir()
        create_database(home / "memory.db", PYTHON_MIGRATION_IDS)
        write_manifest(
            home / "extensions" / "demo-widget", command_skill_manifest("demo-widget")
        )
        snapshot("manifest_entrypoint_module_missing", home)

        home = root / "home-manifest-skill-file-missing"
        home.mkdir()
        create_database(home / "memory.db", PYTHON_MIGRATION_IDS)
        write_manifest(
            home / "extensions" / "demo-widget", prompt_skill_manifest("demo-widget")
        )
        snapshot("manifest_skill_file_missing", home)

        # D1: PyYAML's parser text is recorded but cannot be reproduced.
        home = root / "home-manifest-bad-yaml"
        home.mkdir()
        create_database(home / "memory.db", PYTHON_MIGRATION_IDS)
        write_manifest(home / "extensions" / "demo-widget", "id: demo\n  bad: [unclosed\n")
        snapshot("manifest_bad_yaml", home)

        # --- mirror home not configured -----------------------------------
        clear_ambient_env()
        snapshot("home_not_configured", None)
        unconfigured = scenarios["home_not_configured"]
        assert isinstance(unconfigured, dict)
        recorded = unconfigured["report"]
        assert isinstance(recorded, dict)
        if not recorded.get("mirror_home_error"):
            raise SystemExit(
                "refusing to write the golden: the unconfigured-home scenario resolved a REAL "
                f"mirror home ({recorded.get('mirror_home')!r}). The ambient environment leaked "
                "back in -- see clear_ambient_env()."
            )

        checksums = {
            "canonical": _checksum(MIGRATION_SQL),
            "reformatted": _checksum(MIGRATION_SQL_REFORMATTED),
            "bom": _checksum(MIGRATION_SQL_BOM),
        }

    rt.package_version = original_package_version  # type: ignore[assignment]

    golden = {
        "meta": {
            "note": (
                "Oracle: src/memory/cli/runtime.py over fixture mirror homes built by this "
                "generator and rebuilt identically by the TypeScript test. Git inspection is "
                "graded by runtime-git.golden.json; every scenario here starts outside a "
                "repository so the git block is constant."
            ),
            "fixture_version": FIXTURE_VERSION,
            "python_migration_ids": PYTHON_MIGRATION_IDS,
            "ts_authored_migration_id": TS_AUTHORED_MIGRATION_ID,
            "checksums": checksums,
            "intended_divergence": (
                "Scenario `ts_migrated`: Python grades the ledger against its own 16 "
                "migrations, so the TS-authored 017_journey_parent_column reads as `unknown` "
                "and the install is told it needs attention. TypeScript grades against the TS "
                "manifest (the schema authority since DS6) and reports `current (17/17)`. The "
                "Python render recorded here is the FALSE ALARM this story removes."
            ),
            "divergence_d1": (
                "Scenario `manifest_bad_yaml`: the note embeds PyYAML's own error text, which "
                "the `yaml` package cannot reproduce. The TypeScript test asserts the stable "
                "prefix `invalid YAML in <path>: ` byte-for-byte and records both tails."
            ),
            "placeholders": (
                "<root> is the temp directory; <python-version> and <node-version> replace the "
                "ambient runtime versions, which differ per machine and per CI Python."
            ),
        },
        "scenarios": scenarios,
    }

    text = json.dumps(golden, indent=2, sort_keys=True, ensure_ascii=False)
    text = text.replace(str(root), "<root>")

    import sys

    text = text.replace(sys.version.split()[0], "<python-version>")
    node_version = rt.detect_node_version()
    if node_version:
        text = text.replace(node_version, "<node-version>")

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(text + "\n", encoding="utf-8")

    for label, scenario in scenarios.items():
        entry = scenario if isinstance(scenario, dict) else {}
        print(f"  {label:30} -> {entry.get('status')}")
    print(f"wrote {OUT_PATH.relative_to(HERE.parent.parent)}")


if __name__ == "__main__":
    main()
