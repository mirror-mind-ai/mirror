"""CLI: render the state-aware welcome card.

See docs/product/specs/welcome/index.md for the contract. The welcome is
designed to be cheap (SQLite reads only, no network) so a runtime can call
it at every session_start without latency cost.
"""

from __future__ import annotations

import argparse
import json
import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

from memory import MemoryClient
from memory.cli.common import db_path_from_mirror_home
from memory.cli.runtime import (
    UpdateChannel,
    _run_git,
    check_runtime_update_availability,
    inspect_git,
    inspect_git_update_plan,
    inspect_update_channel,
    package_version,
)
from memory.config import resolve_mirror_home

INVITATION = "→ Where shall we begin?"
SEPARATOR = " · "
UPDATE_CHECK_CACHE = "runtime/update-check.json"
UPDATE_CHECK_TTL = timedelta(hours=6)

_MONTH_ABBR = (
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
)


@dataclass(frozen=True)
class UpdateAwareness:
    availability: str
    checked_at: str
    channel: str
    current_commit: str | None = None
    remote_commit: str | None = None
    version: str | None = None
    title: str | None = None
    note: str | None = None


# --------- public entry point --------------------------------------------


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        description="Render the state-aware welcome card",
    )
    parser.add_argument(
        "--mirror-home",
        default=None,
        help="Explicit user home whose database should be read for the welcome",
    )
    parser.add_argument(
        "--status-line",
        action="store_true",
        help="Render a compact Mirror status line for runtime status bars",
    )
    args = parser.parse_args(argv)

    if _welcome_disabled():
        return

    if args.status_line:
        status = compose_status_line(mirror_home=args.mirror_home)
        if status:
            print(status)
        return

    welcome = compose_welcome(mirror_home=args.mirror_home)
    if welcome:
        print(welcome)


# --------- composition ---------------------------------------------------


def compose_welcome(mirror_home: str | Path | None = None) -> str:
    """Compose the welcome string. Returns "" when no header can be rendered.

    The only path to empty output is an unresolvable Mirror home. A fresh
    database with zero memories, zero journeys, etc. still renders the full
    welcome with zeroes.
    """
    home_path = _resolve_home(mirror_home)
    if home_path is None:
        return ""

    db_path = db_path_from_mirror_home(home_path)
    stats_line = _stats_line(db_path)
    channel = inspect_update_channel(Path.cwd())
    version_line = _version_line(channel.value)
    awareness = _update_awareness(home_path, channel)
    update_line = _update_line(channel, awareness)
    return _render(user=home_path.name, stats=stats_line, version=version_line, update=update_line)


def compose_status_line(mirror_home: str | Path | None = None) -> str:
    home_path = _resolve_home(mirror_home)
    if home_path is None:
        return ""
    awareness = _read_update_cache(home_path)
    if awareness and awareness.availability == "update_available":
        version = f" {awareness.version}" if awareness.version else ""
        return f"◇ {home_path.name} · ⬆{version}"
    return f"◇ {home_path.name} · ✓"


# --------- renderers -----------------------------------------------------


def _render(user: str, stats: str, version: str, update: str | None = None) -> str:
    lines = [
        f"◇ Mirror · {user}",
        f"Version {version}",
        stats,
    ]
    if update:
        lines.append(update)
    lines.extend(["", INVITATION])
    return "\n".join(lines)


def _stats_line(db_path: Path | None) -> str:
    if db_path is None or not db_path.exists():
        return _format_stats(journeys=0, personas=0, memories=0, conversations=0, since=None)

    with MemoryClient(db_path=db_path) as mem:
        journeys = len(mem.list_active_journeys())
        personas = _count_identity_rows(mem, layer="persona")
        memories = _scalar(mem, "SELECT COUNT(*) FROM memories")
        conversations = _scalar(mem, "SELECT COUNT(*) FROM conversations")
        first_started = _scalar_text(mem, "SELECT MIN(started_at) FROM conversations")

    return _format_stats(
        journeys=journeys,
        personas=personas,
        memories=memories,
        conversations=conversations,
        since=first_started,
    )


def _format_stats(
    *,
    journeys: int,
    personas: int,
    memories: int,
    conversations: int,
    since: str | None,
) -> str:
    parts = [
        f"{_fmt_count(journeys)} journeys",
        f"{_fmt_count(personas)} personas",
        f"{_fmt_count(memories)} memories",
        f"{_fmt_count(conversations)} conversations",
        _since_label(since),
    ]
    return SEPARATOR.join(parts)


def _version_line(channel: str) -> str:
    return f"{package_version()} · channel {channel}"


def _update_line(channel: UpdateChannel, awareness: UpdateAwareness | None = None) -> str | None:
    if awareness and awareness.availability == "update_available":
        label = "Update available"
        if awareness.version and awareness.title:
            label = f"{label}: {awareness.version} — {awareness.title}"
        elif awareness.version:
            label = f"{label}: {awareness.version}"
        else:
            label = f"{label} on {awareness.channel}"
        return f'{label}\nAsk: "what changed?" or "update my Mirror"'

    git = inspect_git(Path.cwd())
    if git.repository is None:
        return None
    try:
        plan = inspect_git_update_plan(git, channel)
    except TypeError:
        plan = inspect_git_update_plan(git)
    if plan.ready and plan.action == "pull" and plan.behind:
        plural = "s" if plan.behind != 1 else ""
        upstream = plan.upstream or "upstream"
        return (
            f"Update available: {plan.behind} commit{plural} behind {upstream} · "
            "run runtime update\n"
            'Ask Mirror: "What\'s new in the latest Mirror Mind release?"'
        )
    return None


# --------- update awareness --------------------------------------------


def _update_awareness(home_path: Path, channel: UpdateChannel) -> UpdateAwareness | None:
    cached = _read_update_cache(home_path)
    if cached and not _cache_is_stale(cached):
        return cached
    if _remote_update_check_disabled() or channel.value != "stable":
        return cached
    refreshed = _refresh_update_cache(home_path, channel)
    return refreshed or cached


def _cache_path(home_path: Path) -> Path:
    return home_path / UPDATE_CHECK_CACHE


def _read_update_cache(home_path: Path) -> UpdateAwareness | None:
    path = _cache_path(home_path)
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(raw, dict):
        return None
    availability_value = raw.get("availability")
    checked_at_value = raw.get("checked_at")
    channel_value = raw.get("channel")
    if not (
        isinstance(availability_value, str)
        and availability_value
        and isinstance(checked_at_value, str)
        and checked_at_value
        and isinstance(channel_value, str)
        and channel_value
    ):
        return None
    return UpdateAwareness(
        availability=availability_value,
        checked_at=checked_at_value,
        channel=channel_value,
        current_commit=_optional_str(raw.get("current_commit")),
        remote_commit=_optional_str(raw.get("remote_commit")),
        version=_optional_str(raw.get("version")),
        title=_optional_str(raw.get("title")),
        note=_optional_str(raw.get("note")),
    )


def _write_update_cache(home_path: Path, awareness: UpdateAwareness) -> None:
    path = _cache_path(home_path)
    payload = {
        "checked_at": awareness.checked_at,
        "channel": awareness.channel,
        "availability": awareness.availability,
        "current_commit": awareness.current_commit,
        "remote_commit": awareness.remote_commit,
        "version": awareness.version,
        "title": awareness.title,
        "note": awareness.note,
    }
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    except OSError:
        return


def _cache_is_stale(awareness: UpdateAwareness) -> bool:
    checked_at = _parse_iso(awareness.checked_at)
    if checked_at is None:
        return True
    if checked_at.tzinfo is None:
        checked_at = checked_at.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - checked_at > UPDATE_CHECK_TTL


def _refresh_update_cache(home_path: Path, channel: UpdateChannel) -> UpdateAwareness | None:
    try:
        report = check_runtime_update_availability(channel=channel.value)
    except Exception:
        return None
    version = None
    title = None
    if report.status == "update_available" and report.remote_commit and report.upstream:
        version = _remote_tag_for_commit(report.upstream, report.remote_commit)
        title = _local_release_title(version)
    awareness = UpdateAwareness(
        availability=report.status,
        checked_at=_iso_now(),
        channel=channel.value,
        current_commit=report.local_commit,
        remote_commit=report.remote_commit,
        version=version,
        title=title,
        note=report.note,
    )
    if report.status in {"up_to_date", "update_available"}:
        _write_update_cache(home_path, awareness)
    return awareness


def _remote_tag_for_commit(upstream: str, remote_commit: str) -> str | None:
    if "/" not in upstream:
        return None
    remote = upstream.split("/", 1)[0]
    git = inspect_git(Path.cwd())
    if git.repository is None:
        return None
    code, stdout, _stderr = _run_git(
        ["ls-remote", "--tags", remote, "refs/tags/v*"], cwd=git.repository
    )
    if code != 0 or not stdout:
        return None
    matches: list[str] = []
    for line in stdout.splitlines():
        parts = line.split()
        if len(parts) < 2:
            continue
        commit, ref = parts[0], parts[1]
        if commit != remote_commit or ref.endswith("^{}"):
            continue
        tag = ref.rsplit("/", 1)[-1]
        if tag.startswith("v"):
            matches.append(tag)
    if not matches:
        return None
    return sorted(matches, key=_semver_key, reverse=True)[0]


def _local_release_title(version: str | None) -> str | None:
    if not version:
        return None
    release_path = Path.cwd() / "docs" / "releases" / f"{version}.md"
    try:
        text = release_path.read_text(encoding="utf-8")
    except OSError:
        return None
    prefix = f"# {version} — "
    for line in text.splitlines():
        if line.startswith(prefix):
            return line.removeprefix(prefix).strip()
    return None


def _semver_key(version: str) -> tuple[int, int, int]:
    raw = version[1:] if version.startswith("v") else version
    parts = raw.split(".")
    try:
        major, minor, patch = (int(part) for part in parts[:3])
    except ValueError:
        return (-1, -1, -1)
    return major, minor, patch


def _remote_update_check_disabled() -> bool:
    value = os.environ.get("MIRROR_WELCOME_REMOTE_UPDATE_CHECK", "").strip().lower()
    return value in {"off", "0", "false", "no"}


def _optional_str(value: object) -> str | None:
    return value if isinstance(value, str) and value else None


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


# --------- helpers -------------------------------------------------------


def _count_identity_rows(mem: MemoryClient, *, layer: str) -> int:
    return _scalar(
        mem,
        "SELECT COUNT(*) FROM identity WHERE layer = ?",
        (layer,),
    )


def _scalar(mem: MemoryClient, sql: str, params: tuple = ()) -> int:
    row = mem.store.conn.execute(sql, params).fetchone()
    if row is None:
        return 0
    value = row[0]
    if value is None:
        return 0
    if isinstance(value, int):
        return value
    return int(value)


def _scalar_text(mem: MemoryClient, sql: str, params: tuple = ()) -> str | None:
    row = mem.store.conn.execute(sql, params).fetchone()
    if row is None:
        return None
    value = row[0]
    if value is None:
        return None
    return str(value)


def _fmt_count(value: int) -> str:
    if value >= 1000:
        return f"{value:,}"
    return str(value)


def _since_label(first_started: str | None) -> str:
    if not first_started:
        return "since today"
    dt = _parse_iso(first_started)
    if dt is None:
        return "since today"
    month = _MONTH_ABBR[dt.month - 1]
    return f"since {month} {dt.year}"


def _resolve_home(mirror_home: str | Path | None) -> Path | None:
    try:
        return resolve_mirror_home(mirror_home=mirror_home)
    except ValueError:
        return None


def _welcome_disabled() -> bool:
    value = os.environ.get("MIRROR_WELCOME", "").strip().lower()
    return value in {"off", "0", "false", "no"}


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


# The timezone import is kept available for callers that mock _iso_now in
# future. Currently the welcome reads stored ISO timestamps and does not
# compute relative time itself.
_ = timezone


if __name__ == "__main__":
    main()
