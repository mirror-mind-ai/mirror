"""Generate the welcome golden (CV22.DS7.TS3, plateau 4).

`welcome` has two faces with very different budgets. The CARD renders once at
startup and may perform a bounded remote update check; the STATUS LINE renders
after every single turn and must touch nothing but the database and the update
cache. Both are graded here.

The cache is the sharpest contract in this corpus. Both cores read and write
`<mirror home>/runtime/update-check.json` during the transition, so its bytes
are a shared format, not an implementation detail: two cores that serialize the
same state differently rewrite the file on every alternating invocation and
thrash the 6h TTL. `_write_update_cache` is exercised directly with fixed
awareness values -- including a non-ASCII release title, because the oracle
leaves `ensure_ascii` at Python's default and an em dash must land as `\\u2014`.

The remote-facing scenarios run against a `file://` bare remote built here, so
the update line, the tag lookup, and the release title are graded on real git
output without leaving the machine.

Run:  uv run python ts/parity/generate_welcome_golden.py
"""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
from dataclasses import asdict, is_dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT_PATH = HERE.parent / "test" / "goldens" / "welcome.golden.json"

AMBIENT_KEYS = (
    "MEMORY_DIR",
    "MEMORY_PROD_DIR",
    "MEMORY_ENV",
    "DB_PATH",
    "DB_BACKUP_PATH",
    "MIRROR_HOME",
    "MIRROR_USER",
    "MIRROR_WELCOME",
    "MIRROR_WELCOME_REMOTE_UPDATE_CHECK",
    "MIRROR_SESSION_ID",
)


def clear_ambient_env() -> None:
    """Detach the corpus from this machine. Must be called twice.

    ``memory.config`` applies a repo ``.env`` with ``os.environ.setdefault`` AT
    IMPORT TIME, so anything cleared before the import is quietly restored.
    """
    for key in AMBIENT_KEYS:
        os.environ.pop(key, None)


clear_ambient_env()

FIXTURE_VERSION = "9.9.9"
FIXED_NOW = "2026-09-08T12:00:00+00:00"

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

RELEASE_VERSION = "v9.9.9"
RELEASE_TITLE = "Uma travessia — with an em dash"
RELEASE_NOTE = f"# {RELEASE_VERSION} — {RELEASE_TITLE}\n\nBody.\n"


def git(*args: str, cwd: Path) -> str:
    result = subprocess.run(
        ["git", *args], cwd=cwd, env=GIT_ENV, text=True, capture_output=True, check=True
    )
    return result.stdout.strip()


def build_repository(root: Path) -> tuple[Path, Path]:
    """A bare remote on `stable` with a tagged second commit, and a clone behind it."""
    remote = root / "remote.git"
    seed = root / "seed"
    seed.mkdir(parents=True)
    git("init", "--initial-branch=stable", cwd=seed)
    (seed / "pyproject.toml").write_text(
        f'[project]\nname = "mirror"\nversion = "{FIXTURE_VERSION}"\n', encoding="utf-8"
    )
    (seed / "README.md").write_text("fixture\n", encoding="utf-8")
    git("add", ".", cwd=seed)
    git("commit", "-m", "first", cwd=seed)
    git("clone", "--bare", str(seed), str(remote), cwd=root)

    clone = root / "clone"
    git("clone", str(remote), str(clone), cwd=root)
    git("checkout", "stable", cwd=clone)

    # The remote moves ahead by one TAGGED commit, so the clone is behind by
    # exactly one and the tag lookup has something to find.
    releases = seed / "docs" / "releases"
    releases.mkdir(parents=True)
    (releases / f"{RELEASE_VERSION}.md").write_text(RELEASE_NOTE, encoding="utf-8")
    git("add", ".", cwd=seed)
    git("commit", "-m", "second", cwd=seed)
    git("tag", RELEASE_VERSION, cwd=seed)
    git("push", str(remote), "stable", cwd=seed)
    git("push", str(remote), RELEASE_VERSION, cwd=seed)
    return clone, remote


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


def main() -> None:
    from memory.cli import runtime as rt
    from memory.cli import welcome as wc
    from memory.client import MemoryClient

    clear_ambient_env()  # the import above just re-applied `.env`

    original_package_version = rt.package_version
    rt.package_version = lambda: FIXTURE_VERSION  # type: ignore[assignment]
    wc_original = wc.package_version
    wc.package_version = lambda: FIXTURE_VERSION  # type: ignore[assignment]

    cache_writes: dict[str, object] = {}
    cache_reads: dict[str, object] = {}
    status_lines: dict[str, object] = {}
    cards: dict[str, object] = {}

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp).resolve()
        clone, _remote = build_repository(root)

        # ---------- cache bytes ------------------------------------------
        cache_home = root / "cache-home"
        cache_home.mkdir()
        awareness_cases = {
            "update_available_full": wc.UpdateAwareness(
                availability="update_available",
                checked_at=FIXED_NOW,
                channel="stable",
                current_commit="abc1234",
                remote_commit="def5678",
                version=RELEASE_VERSION,
                title=RELEASE_TITLE,
                note=None,
            ),
            "up_to_date_minimal": wc.UpdateAwareness(
                availability="up_to_date",
                checked_at=FIXED_NOW,
                channel="stable",
            ),
            "unknown_with_note": wc.UpdateAwareness(
                availability="unknown",
                checked_at=FIXED_NOW,
                channel="main",
                note="remote query failed",
            ),
        }
        for label, awareness in awareness_cases.items():
            wc._write_update_cache(cache_home, awareness)
            cache_writes[label] = {
                "awareness": _serialize(awareness),
                "bytes": (cache_home / wc.UPDATE_CHECK_CACHE).read_text(encoding="utf-8"),
            }

        # ---------- cache reads -------------------------------------------
        read_home = root / "read-home"
        (read_home / "runtime").mkdir(parents=True)
        cache_file = read_home / wc.UPDATE_CHECK_CACHE
        read_cases = {
            "valid": json.dumps(
                {
                    "availability": "update_available",
                    "checked_at": FIXED_NOW,
                    "channel": "stable",
                    "version": RELEASE_VERSION,
                    "title": RELEASE_TITLE,
                }
            ),
            "missing_availability": json.dumps({"checked_at": FIXED_NOW, "channel": "stable"}),
            "empty_channel": json.dumps(
                {"availability": "up_to_date", "checked_at": FIXED_NOW, "channel": ""}
            ),
            "wrong_types": json.dumps(
                {"availability": 1, "checked_at": FIXED_NOW, "channel": "stable"}
            ),
            "not_a_mapping": json.dumps(["a", "list"]),
            "malformed_json": "{not json at all",
            "optional_fields_wrong_type": json.dumps(
                {
                    "availability": "up_to_date",
                    "checked_at": FIXED_NOW,
                    "channel": "stable",
                    "version": 12,
                    "title": "",
                    "note": None,
                }
            ),
        }
        for label, body in read_cases.items():
            cache_file.write_text(body, encoding="utf-8")
            parsed = wc._read_update_cache(read_home)
            cache_reads[label] = {
                "file": body,
                "parsed": _serialize(parsed) if parsed is not None else None,
            }
        cache_file.unlink()
        cache_reads["absent"] = {"file": None, "parsed": None}

        # ---------- staleness / refresh rules ------------------------------
        # `_cache_is_stale` reads the wall clock INTERNALLY, so a timestamp
        # exactly at the TTL is not observable through the oracle: by the time
        # the check runs it is already microseconds past. The corpus therefore
        # brackets the boundary instead of sitting on it, and the strictness of
        # the comparison is asserted TypeScript-side where the clock is
        # injectable.
        stale_now = datetime.now(timezone.utc)
        staleness = {
            "fresh": (stale_now - timedelta(hours=1)).isoformat(),
            "just_inside_ttl": (stale_now - timedelta(hours=5, minutes=59)).isoformat(),
            "just_outside_ttl": (stale_now - timedelta(hours=6, minutes=1)).isoformat(),
            "beyond_ttl": (stale_now - timedelta(hours=7)).isoformat(),
            "naive_timestamp": (stale_now - timedelta(hours=1))
            .replace(tzinfo=None)
            .isoformat(),
            "unparseable": "not-a-timestamp",
        }
        staleness_results = {
            label: wc._cache_is_stale(
                wc.UpdateAwareness(availability="up_to_date", checked_at=value, channel="stable")
            )
            for label, value in staleness.items()
        }

        # ---------- status lines -------------------------------------------
        home = root / "status-home"
        home.mkdir()
        db_path = home / "memory.db"
        os.environ["MIRROR_HOME"] = str(home)
        os.environ["MIRROR_USER"] = home.name
        mem = MemoryClient(db_path=db_path)
        opened = Path(mem.conn.execute("PRAGMA database_list").fetchone()[2]).resolve()
        if not opened.is_relative_to(root):
            raise RuntimeError(f"refusing non-temporary fixture database: {opened}")
        mem.set_identity("persona", "engineer", "Engineer")
        mem.set_identity("persona", "therapist", "Therapist")
        mem.set_identity(
            "journey",
            "mirror-ts-core",
            "# Mirror TypeScript Core Port\n**Status:** active\n\n## Description\nPort.\n\n## End",
        )
        mem.set_identity(
            "journey",
            "no-heading",
            "plain first line\n**Status:** active\n\n## Description\nX.\n\n## End",
        )
        mem.set_identity("journey", "done-one", "# Done\n**Status:** archived\n\n## Description\nX.\n\n## End")
        mem.close()

        def status_snapshot(label: str, *, session_id: str | None = None) -> None:
            status_lines[label] = wc.compose_status_line(
                mirror_home=str(home), session_id=session_id
            )

        status_snapshot("no_mode_no_cache")

        from memory.services.operating_mode import activate_mode

        mem = MemoryClient(db_path=db_path)
        activate_mode(mem.store, mode="Builder Mode", journey="mirror-ts-core", session_id="s1")
        mem.close()
        status_snapshot("builder_mode_with_journey", session_id="s1")
        status_snapshot("other_session_sees_no_mode", session_id="s2")

        mem = MemoryClient(db_path=db_path)
        activate_mode(mem.store, mode="Soul Mode", journey=None, session_id="s3")
        mem.close()
        status_snapshot("soul_mode_no_journey", session_id="s3")

        mem = MemoryClient(db_path=db_path)
        activate_mode(mem.store, mode="Explorer Mode", journey="no-heading", session_id="s4")
        mem.close()
        status_snapshot("journey_without_heading", session_id="s4")

        mem = MemoryClient(db_path=db_path)
        activate_mode(mem.store, mode="Custom Lens", journey=None, session_id="s5")
        mem.close()
        status_snapshot("unknown_mode_has_no_icon", session_id="s5")

        # Update markers come from the CACHE only -- never a remote call.
        wc._write_update_cache(
            home,
            wc.UpdateAwareness(
                availability="update_available",
                checked_at=FIXED_NOW,
                channel="stable",
                version=RELEASE_VERSION,
            ),
        )
        status_snapshot("cached_update_available", session_id="s1")
        wc._write_update_cache(
            home,
            wc.UpdateAwareness(
                availability="update_available", checked_at=FIXED_NOW, channel="stable"
            ),
        )
        status_snapshot("cached_update_without_version", session_id="s1")
        wc._write_update_cache(
            home,
            wc.UpdateAwareness(
                availability="up_to_date", checked_at=FIXED_NOW, channel="stable"
            ),
        )
        status_snapshot("cached_up_to_date", session_id="s1")

        for env_value, label in (("development", "development_env"), ("test", "test_env")):
            os.environ["MEMORY_ENV"] = env_value
            import importlib

            import memory.config

            importlib.reload(memory.config)
            status_lines[label] = wc.compose_status_line(
                mirror_home=str(home), session_id="s1"
            )
            os.environ.pop("MEMORY_ENV", None)
            importlib.reload(memory.config)

        missing_db_home = root / "no-db-home"
        missing_db_home.mkdir()
        status_lines["no_database"] = wc.compose_status_line(mirror_home=str(missing_db_home))
        status_lines["unresolvable_home"] = wc.compose_status_line(mirror_home="")

        # ---------- cards ----------------------------------------------------
        cwd_before = Path.cwd()
        os.chdir(clone)
        try:
            os.environ["MIRROR_WELCOME_REMOTE_UPDATE_CHECK"] = "off"

            # Behind the remote, remote check disabled: the git PLAN supplies
            # the line. The clone has not fetched, so this also grades the
            # `blocked` branch when the channel ref is missing.
            (home / wc.UPDATE_CHECK_CACHE).unlink(missing_ok=True)
            cards["remote_check_disabled_unfetched"] = wc.compose_welcome(mirror_home=str(home))

            git("fetch", "origin", cwd=clone)
            cards["remote_check_disabled_behind"] = wc.compose_welcome(mirror_home=str(home))

            # A cached notice wins over the plan, with and without a title.
            wc._write_update_cache(
                home,
                wc.UpdateAwareness(
                    availability="update_available",
                    checked_at=datetime.now(timezone.utc).isoformat(),
                    channel="stable",
                    version=RELEASE_VERSION,
                    title=RELEASE_TITLE,
                ),
            )
            cards["cached_update_with_title"] = wc.compose_welcome(mirror_home=str(home))
            wc._write_update_cache(
                home,
                wc.UpdateAwareness(
                    availability="update_available",
                    checked_at=datetime.now(timezone.utc).isoformat(),
                    channel="stable",
                    version=RELEASE_VERSION,
                ),
            )
            cards["cached_update_without_title"] = wc.compose_welcome(mirror_home=str(home))
            wc._write_update_cache(
                home,
                wc.UpdateAwareness(
                    availability="update_available",
                    checked_at=datetime.now(timezone.utc).isoformat(),
                    channel="stable",
                ),
            )
            cards["cached_update_without_version"] = wc.compose_welcome(mirror_home=str(home))

            (home / wc.UPDATE_CHECK_CACHE).unlink(missing_ok=True)
            cards["empty_database"] = wc.compose_welcome(mirror_home=str(missing_db_home))
            cards["unresolvable_home"] = wc.compose_welcome(mirror_home="")

            # The tag lookup and release title, on the real fixture remote.
            availability = rt.check_runtime_update_availability(channel="stable")
            tag = wc._remote_tag_for_commit(
                availability.upstream or "", availability.remote_commit or ""
            )
            remote_tag = {
                "upstream": availability.upstream,
                "status": availability.status,
                "tag": tag,
                "title_from_clone": wc._local_release_title(tag),
            }
            git("pull", "--ff-only", cwd=clone)
            remote_tag["title_after_pull"] = wc._local_release_title(tag)
        finally:
            os.chdir(cwd_before)

        conversation_stats_home = root / "stats-home"
        conversation_stats_home.mkdir()
        mem = MemoryClient(db_path=conversation_stats_home / "memory.db")
        mem.conn.execute(
            "INSERT INTO conversations (id, started_at, interface) "
            "VALUES ('c1', '2025-03-14T10:00:00Z', 'pi')"
        )
        mem.conn.execute(
            "INSERT INTO conversations (id, started_at, interface) "
            "VALUES ('c2', '2026-01-02T10:00:00Z', 'pi')"
        )
        mem.conn.commit()
        mem.close()
        os.chdir(clone)
        try:
            cards["stats_since_earliest_conversation"] = wc.compose_welcome(
                mirror_home=str(conversation_stats_home)
            )
        finally:
            os.chdir(cwd_before)

    rt.package_version = original_package_version  # type: ignore[assignment]
    wc.package_version = wc_original  # type: ignore[assignment]

    golden = {
        "meta": {
            "note": (
                "Oracle: src/memory/cli/welcome.py over fixture mirror homes and a fixture git "
                "clone with a file:// bare remote, built by this generator and rebuilt "
                "identically by the TypeScript test."
            ),
            "fixture_version": FIXTURE_VERSION,
            "fixed_now": FIXED_NOW,
            "release_version": RELEASE_VERSION,
            "release_title": RELEASE_TITLE,
            "cache_bytes_contract": (
                "`_write_update_cache` uses json.dumps(indent=2, sort_keys=True) and leaves "
                "ensure_ascii at Python's DEFAULT (True), so the em dash in the release title "
                "must be written as \\u2014. Both cores read and write this file during the "
                "transition; differing bytes would rewrite it on every alternating invocation "
                "and thrash the 6h TTL."
            ),
            "staleness": staleness_results,
            "remote_tag": remote_tag,
        },
        "cache_writes": cache_writes,
        "cache_reads": cache_reads,
        "status_lines": status_lines,
        "cards": cards,
    }

    text = json.dumps(golden, indent=2, sort_keys=True, ensure_ascii=False)
    text = text.replace(str(root), "<root>")

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(text + "\n", encoding="utf-8")

    print(f"  cache writes : {len(cache_writes)}")
    print(f"  cache reads  : {len(cache_reads)}")
    print(f"  status lines : {len(status_lines)}")
    print(f"  cards        : {len(cards)}")
    print(f"wrote {OUT_PATH.relative_to(HERE.parent.parent)}")


if __name__ == "__main__":
    main()
