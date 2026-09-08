"""Generate the runtime diagnose golden (CV22.DS7.TS3, plateau 3b).

`runtime diagnose` is the read-only "what is wrong with this install?" pass:
filesystem posture, recent front-door errors, FTS index health, and everything
the status readers already found, flattened into ORDERED findings. Order is
part of the rendered output, so every scenario grades the whole render rather
than a set of codes.

Built over fixture mirror homes, like the status corpus. Three sources of
non-determinism are handled rather than avoided:

  * the 24h front-door window -- the fixture writes its log entries RELATIVE to
    generation time (one hour old, two hours old, thirty hours old), so the
    resulting COUNT is stable no matter when either core runs;
  * the homes root -- the oracle's CLI passes the ambient `~/.mirror-minds`,
    so this corpus calls `root_state_findings` with a fixture root instead;
  * the model catalog -- `probe_model_pins` makes a LIVE call when a key is
    present, so the key is cleared and the recorded scenario is the oracle's
    inconclusive answer, which is also TypeScript's answer until DS8.

D3 turned out to be much narrower than it first looked, and the corpus says so.
The `fts_corrupt` detail embeds the DRIVER's error text, and the two cores link
different SQLite builds -- but for every corruption BOTH cores can construct,
they emit the same string, so both FTS scenarios here are graded byte for byte.
The divergence survives only for a corruption node:sqlite refuses to create at
all (writing FTS5 shadow tables), which is a safety property rather than a gap.
That observation is recorded in meta with its evidence instead of being staged
as a scenario TypeScript cannot run.

Run:  uv run python ts/parity/generate_runtime_diagnose_golden.py
"""

from __future__ import annotations

import json
import os
import sqlite3
import subprocess
import tempfile
from dataclasses import asdict, is_dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT_PATH = HERE.parent / "test" / "goldens" / "runtime-diagnose.golden.json"

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
    # Cleared so `probe_model_pins` cannot make a live call from a dev machine.
    "OPENROUTER_API_KEY",
)


def clear_ambient_env() -> None:
    """Detach the corpus from this machine. Must be called twice.

    ``memory.config`` walks upward for a ``.env`` and applies it with
    ``os.environ.setdefault`` AT IMPORT TIME, so anything cleared before the
    import is quietly restored by it -- including a real OPENROUTER_API_KEY,
    which would turn `probe_model_pins` into a live network call.
    """
    for key in AMBIENT_KEYS:
        os.environ.pop(key, None)


clear_ambient_env()

FIXTURE_VERSION = "9.9.9"

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

MIGRATION_SQL = "CREATE TABLE IF NOT EXISTS ext_demo_widget_notes (id INTEGER PRIMARY KEY);\n"


def build_repository(root: Path) -> Path:
    repo = root / "repo"
    repo.mkdir(parents=True)
    subprocess.run(
        ["git", "init", "--initial-branch=stable"],
        cwd=repo,
        env=GIT_ENV,
        check=True,
        capture_output=True,
    )
    (repo / "README.md").write_text("fixture\n", encoding="utf-8")
    for args in (("add", "."), ("commit", "-m", "fixture")):
        subprocess.run(["git", *args], cwd=repo, env=GIT_ENV, check=True, capture_output=True)
    return repo


def create_database(path: Path, migration_ids: list[str]) -> None:
    conn = sqlite3.connect(path)
    try:
        conn.execute("CREATE TABLE _migrations (id TEXT PRIMARY KEY, applied_at TEXT)")
        for migration_id in migration_ids:
            conn.execute(
                "INSERT INTO _migrations (id, applied_at) VALUES (?, ?)",
                (migration_id, "2026-09-01T12:00:00+00:00"),
            )
        conn.commit()
    finally:
        conn.close()


# Enough rows that the index spans several pages, so zeroing everything after
# page 1 reliably destroys it.
FTS_ROW_COUNT = 200
PAGE_SIZE = 4096


def add_healthy_fts(path: Path) -> None:
    conn = sqlite3.connect(path)
    try:
        conn.execute("CREATE TABLE memories (id INTEGER PRIMARY KEY, content TEXT)")
        conn.executemany(
            "INSERT INTO memories VALUES (?, ?)",
            [(i, f"word{i} hello world mirror") for i in range(1, FTS_ROW_COUNT)],
        )
        conn.execute(
            "CREATE VIRTUAL TABLE memories_fts USING fts5("
            "content, content='memories', content_rowid='id')"
        )
        conn.execute("INSERT INTO memories_fts(memories_fts) VALUES('rebuild')")
        conn.commit()
    finally:
        conn.close()


def corrupt_fts(path: Path) -> None:
    """Zero every page after the first, leaving the schema readable and the
    index unusable.

    Deliberately plain file I/O rather than SQL. The obvious recipe -- deleting
    rows from the `memories_fts_data` shadow table -- is one node:sqlite
    REFUSES to run (`table memories_fts_data may not be modified`), so a
    TypeScript test could not rebuild this fixture and the scenario would grade
    nothing. Zeroing bytes is something both cores can do identically, which is
    what makes this a real parity scenario instead of a recorded assertion.

    Page 1 survives so `sqlite_master` still lists `memories_fts` and the probe
    reaches the MATCH it exists to test.
    """
    size = path.stat().st_size
    with path.open("r+b") as handle:
        handle.seek(PAGE_SIZE)
        handle.write(b"\x00" * (size - PAGE_SIZE))


def add_decoy_fts_table(path: Path) -> None:
    """A PLAIN table named `memories_fts`: MATCH fails identically in both."""
    conn = sqlite3.connect(path)
    try:
        conn.execute("CREATE TABLE memories_fts (rowid INTEGER, content TEXT)")
        conn.commit()
    finally:
        conn.close()


def write_front_door_log(path: Path, now: datetime) -> None:
    """Two ERRORs inside the 24h window, one outside, plus non-error noise.

    Timestamps are relative to generation time so the COUNT the finding reports
    is stable whenever either core runs.
    """
    def stamp(hours: float) -> str:
        return (now - timedelta(hours=hours)).isoformat().replace("+00:00", "Z")

    lines = [
        f"{stamp(1)}\tERROR\twelcome\tts\texit=1\tbackup_failed",
        f"{stamp(2)}\tERROR\tsearch\tpython\texit=2\tschema_guard",
        f"{stamp(30)}\tERROR\tsearch\tts\texit=1\told_and_outside_the_window",
        f"{stamp(0.5)}\tINFO\twelcome\tts\texit=0\t",
        "not a log line at all",
        f"garbage-timestamp\tERROR\tsearch\tts\texit=1\tunparseable",
    ]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


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


def build_command_skill(root: Path, extension_id: str) -> Path:
    directory = root / extension_id
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "skill.yaml").write_text(
        f"id: {extension_id}\nname: {extension_id}\ncategory: extension\n"
        "kind: command-skill\nsummary: a fixture extension\n"
        "entrypoint:\n  module: handler\n"
        f"runtimes:\n  pi:\n    command_name: ext-{extension_id}\n",
        encoding="utf-8",
    )
    (directory / "handler.py").write_text("# fixture\n", encoding="utf-8")
    return directory


def main() -> None:
    from memory.cli import runtime as rt
    from memory.extensions.migrations import _checksum

    clear_ambient_env()  # the import above just re-applied `.env`

    original_package_version = rt.package_version
    rt.package_version = lambda: FIXTURE_VERSION  # type: ignore[assignment]

    now = datetime.now(timezone.utc)
    scenarios: dict[str, object] = {}

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp).resolve()
        repo = build_repository(root)

        def snapshot(
            label: str,
            home: Path | None,
            *,
            entries: tuple[rt.GitWorktreeEntry, ...] = (),
            homes_root: Path | None = None,
        ) -> None:
            report = rt.build_runtime_status(start=repo, mirror_home_arg=home)
            findings = rt.diagnose_runtime(report, entries)
            if homes_root is not None:
                findings = findings + rt.root_state_findings(homes_root)
            findings = findings + rt.probe_model_pins()
            scenarios[label] = {
                "findings": _serialize(findings),
                "render": rt.render_runtime_diagnosis(findings),
                "exit_code": 0 if not findings else 1,
            }

        def home(name: str, *, migrations: list[str] | None = None) -> Path:
            path = root / name
            path.mkdir(parents=True, exist_ok=True)
            path.chmod(0o700)
            if migrations is not None:
                create_database(path / "memory.db", migrations)
                (path / "memory.db").chmod(0o600)
            return path

        # A wholly healthy install: the only scenario that renders `Findings: 0`.
        snapshot("clean", home("home-clean", migrations=PYTHON_MIGRATION_IDS))

        # Filesystem posture.
        loose = home("home-loose-perms", migrations=PYTHON_MIGRATION_IDS)
        loose.chmod(0o755)
        (loose / "memory.db").chmod(0o644)
        snapshot("loose_permissions", loose)

        # Recent front-door errors: two inside the window, one outside, plus a
        # non-error line, a non-log line, and an unparseable timestamp.
        errors = home("home-front-door-errors", migrations=PYTHON_MIGRATION_IDS)
        write_front_door_log(errors / "front-door.log", now)
        snapshot("front_door_errors", errors)

        # FTS: healthy, then the decoy where both drivers agree, then D3.
        healthy = home("home-fts-healthy", migrations=PYTHON_MIGRATION_IDS)
        add_healthy_fts(healthy / "memory.db")
        snapshot("fts_healthy", healthy)

        decoy = home("home-fts-decoy", migrations=PYTHON_MIGRATION_IDS)
        add_decoy_fts_table(decoy / "memory.db")
        snapshot("fts_decoy_table", decoy)

        # A badly broken database, end to end: the FTS probe fires, the
        # migration ledger becomes unreadable, and the whole finding ORDER is
        # graded in one scenario.
        corrupt = home("home-page-corruption", migrations=PYTHON_MIGRATION_IDS)
        add_healthy_fts(corrupt / "memory.db")
        corrupt_fts(corrupt / "memory.db")
        snapshot("database_page_corruption", corrupt)

        # Blockers.
        snapshot("database_missing", home("home-db-missing"))
        snapshot("mirror_home_missing", None)

        # A dirty worktree: the three recommendation branches, including the
        # generated session HTML that gets its own advice.
        snapshot(
            "git_dirty",
            home("home-git-dirty", migrations=PYTHON_MIGRATION_IDS),
            entries=(
                rt.GitWorktreeEntry(status=" M", path="src/memory/cli/runtime.py"),
                rt.GitWorktreeEntry(status="??", path="scratch.txt"),
                rt.GitWorktreeEntry(status="??", path="pi-session-2026-09-08.html"),
            ),
        )

        # Core migration state.
        snapshot(
            "core_migrations_pending",
            home("home-core-pending", migrations=PYTHON_MIGRATION_IDS[:14]),
        )
        snapshot(
            "core_migrations_unknown",
            home("home-core-unknown", migrations=[*PYTHON_MIGRATION_IDS, "999_from_the_future"]),
        )

        # Extension findings: an invalid manifest (the missing-field shape is
        # the only one the oracle escalates to a blocker), plus pending,
        # drifted, and unknown migrations on a healthy manifest.
        ext = home("home-ext", migrations=PYTHON_MIGRATION_IDS)
        broken = ext / "extensions" / "demo-broken"
        broken.mkdir(parents=True)
        (broken / "skill.yaml").write_text(
            "id: demo-broken\nname: demo\ncategory: extension\nkind: command-skill\n",
            encoding="utf-8",
        )
        widget = build_command_skill(ext / "extensions", "demo-widget")
        (widget / "migrations").mkdir()
        (widget / "migrations" / "001_init.sql").write_text(
            MIGRATION_SQL.replace("notes", "renamed"), encoding="utf-8"
        )
        (widget / "migrations" / "002_pending.sql").write_text(MIGRATION_SQL, encoding="utf-8")
        conn = sqlite3.connect(ext / "memory.db")
        conn.execute(
            "CREATE TABLE _ext_migrations ("
            "extension_id TEXT, filename TEXT, checksum TEXT, applied_at TEXT)"
        )
        for filename in ("001_init.sql", "003_vanished.sql"):
            conn.execute(
                "INSERT INTO _ext_migrations VALUES (?, ?, ?, ?)",
                ("demo-widget", filename, _checksum(MIGRATION_SQL), "2026-09-01T12:00:00+00:00"),
            )
        conn.commit()
        conn.close()
        snapshot("extension_findings", ext)

        # Legacy state directly in the homes root: a stray file and the known
        # `backups/` runtime directory. A user home and a dotfile are not
        # offenders and must not appear.
        homes_root = root / "homes-root"
        homes_root.mkdir()
        (homes_root / "stray-notes.md").write_text("legacy\n", encoding="utf-8")
        (homes_root / "backups").mkdir()
        (homes_root / "some-user").mkdir()
        (homes_root / ".DS_Store").write_text("noise\n", encoding="utf-8")
        snapshot(
            "root_state",
            home("home-root-state", migrations=PYTHON_MIGRATION_IDS),
            homes_root=homes_root,
        )

        model_pin_findings = len(rt.probe_model_pins())

    rt.package_version = original_package_version  # type: ignore[assignment]

    if model_pin_findings != 0:
        raise SystemExit(
            "refusing to write the golden: probe_model_pins returned findings, which means it "
            "reached the network. OPENROUTER_API_KEY leaked back in -- see clear_ambient_env()."
        )

    golden = {
        "meta": {
            "note": (
                "Oracle: src/memory/cli/runtime.py diagnose surface over fixture mirror homes "
                "built by this generator and rebuilt identically by the TypeScript test."
            ),
            "fixture_version": FIXTURE_VERSION,
            "python_migration_ids": PYTHON_MIGRATION_IDS,
            "front_door_window": (
                "Log entries are written relative to generation time (1h, 2h, and 30h old), so "
                "the reported COUNT is stable regardless of when either core runs."
            ),
            "model_pin_probe": (
                "OPENROUTER_API_KEY is cleared, so the oracle's catalog fetch fails and yields no "
                "findings -- inconclusive, not a confirmed-missing pin. TypeScript reaches the "
                "same answer with no provider at all until DS8 adds the live fetch."
            ),
            "divergence_d3_observed_not_graded": (
                "The `fts_corrupt` finding embeds the DRIVER's error text, and the two cores link "
                "different SQLite builds -- so this was expected to be a third recorded "
                "divergence. It is narrower than that. Both scenarios here are graded byte for "
                "byte: a plain table named memories_fts yields 'no such column: memories_fts' "
                "from both, and page-zeroed corruption yields 'vtable constructor failed: "
                "memories_fts' from both. The messages diverge only for corruption written into "
                "the FTS5 SHADOW TABLES (Python: 'database disk image is malformed'; node:sqlite: "
                "'fts5: corruption found reading blob N from table \"memories_fts\"'), and "
                "node:sqlite refuses to perform that write at all ('table memories_fts_data may "
                "not be modified'). It is therefore unreachable as a graded scenario, and the "
                "reason is a safety property of the TS driver rather than a hole in the port."
            ),
            "placeholders": "<root> is the temp directory.",
        },
        "scenarios": scenarios,
    }

    text = json.dumps(golden, indent=2, sort_keys=True, ensure_ascii=False)
    text = text.replace(str(root), "<root>")

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(text + "\n", encoding="utf-8")

    for label, scenario in scenarios.items():
        entry = scenario if isinstance(scenario, dict) else {}
        found = entry.get("findings")
        count = len(found) if isinstance(found, list) else 0
        print(f"  {label:26} -> {count} finding(s)")
    print(f"wrote {OUT_PATH.relative_to(HERE.parent.parent)}")


if __name__ == "__main__":
    main()
