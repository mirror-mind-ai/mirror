"""Generate the release-notes golden (CV22.DS7.TS3, plateau 2).

`runtime release-notes` reads Mirror's own release notes two ways: from the
working tree (`docs/releases/v*.md`) and from a git ref (`git ls-tree` plus
`git show`), the second being how a clone learns what a channel it has not
merged yet contains. Both paths parse the same document shape — a `# vX.Y.Z —
Title` heading, an optional frontmatter `digest: >` block, and an optional
`## Highlights` list whose items may wrap across lines — and both order by
semantic version, not lexically.

The corpus is built on the same fixture repository the git golden uses (fixed
content, fixed dates, a `file://` bare remote), extended with release notes on
both sides so the ref-reading path has something a working tree does not.
Deliberately included: a version that sorts differently lexically than
semantically (v0.9.0 vs v0.10.0), a note with no digest and no highlights, a
malformed heading, a wrapped highlight, and a ref that does not exist.

Run:  uv run python ts/parity/generate_release_notes_golden.py
"""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
from dataclasses import asdict, is_dataclass
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT_PATH = HERE.parent / "test" / "goldens" / "release-notes.golden.json"

for _key in ("MEMORY_DIR", "MEMORY_PROD_DIR", "MEMORY_ENV", "DB_PATH", "DB_BACKUP_PATH"):
    os.environ.pop(_key, None)

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

CURRENT_VERSION = "0.9.0"
PYPROJECT = f'[project]\nname = "mirror"\nversion = "{CURRENT_VERSION}"\n'

# name -> file body. Present in the working tree AND on the remote ref.
LOCAL_NOTES: dict[str, str] = {
    "v0.9.0.md": (
        "---\n"
        "digest: >\n"
        "  The ninth release consolidates the reader\n"
        "  and its tests.\n"
        "---\n\n"
        "# v0.9.0 — Consolidated Reader\n\n"
        "## Highlights\n\n"
        "- One reader for both paths\n"
        "- A wrapped highlight that continues\n"
        "  on a second line and a third\n\n"
        "## Notes\n\n"
        "- This bullet is after the highlights section and must not be collected.\n"
    ),
    # Sorts BEFORE v0.9.0 lexically and AFTER it semantically.
    "v0.10.0.md": (
        "# v0.10.0 — Tenth\n\n"
        "## Highlights\n\n"
        "- Ordering is semantic, not lexical\n"
    ),
    # Neither frontmatter nor highlights.
    "v0.8.0.md": "# v0.8.0 — Bare\n\nJust prose, no sections.\n",
    # A heading the title regex does not match: the reader falls back to the stem.
    "v0.7.0.md": "# Release seven\n\nNo canonical heading here.\n",
    # Heading and filename disagree. The reader reports the HEADING's version
    # while ordering by the FILENAME's — worth pinning, because the two rules
    # are easy to conflate and only a mismatched note can tell them apart.
    "v0.6.0.md": "# v0.6.1 — Mismatched Heading\n\nThe stem says 0.6.0.\n",
}

# Only on the remote ref: what a clone has not merged yet.
REMOTE_ONLY_NOTES: dict[str, str] = {
    "v0.11.0.md": (
        "---\n"
        "digest: >\n"
        "  Pending work the clone has not merged.\n"
        "---\n\n"
        "# v0.11.0 — Pending One\n\n"
        "## Highlights\n\n"
        "- Visible only through the ref\n"
    ),
    "v0.12.0.md": "# v0.12.0 — Pending Two\n\nNo highlights here.\n",
}


def git(*args: str, cwd: Path) -> str:
    return subprocess.run(
        ["git", *args], cwd=cwd, env=GIT_ENV, text=True, capture_output=True, check=True
    ).stdout.strip()


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


def build_repository(root: Path) -> Path:
    seed = root / "seed"
    remote = root / "remote.git"
    clone = root / "clone"
    (seed / "docs" / "releases").mkdir(parents=True)
    (seed / "pyproject.toml").write_text(PYPROJECT, encoding="utf-8")
    for name, body in LOCAL_NOTES.items():
        (seed / "docs" / "releases" / name).write_text(body, encoding="utf-8")
    git("init", "--initial-branch=stable", cwd=seed)
    git("add", ".", cwd=seed)
    git("commit", "-m", "notes", cwd=seed)
    git("clone", "--bare", str(seed), str(remote), cwd=root)
    git("clone", str(remote), str(clone), cwd=root)
    git("checkout", "stable", cwd=clone)

    for name, body in REMOTE_ONLY_NOTES.items():
        (seed / "docs" / "releases" / name).write_text(body, encoding="utf-8")
    git("add", ".", cwd=seed)
    git("commit", "-m", "pending releases", cwd=seed)
    git("push", str(remote), "stable", cwd=seed)
    # The clone knows the remote ref only after fetching, which is what
    # `release-notes pending` does for itself unless --no-fetch is passed.
    return clone


def main() -> None:
    from memory.cli import runtime as rt

    result: dict[str, object] = {}
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp).resolve()
        clone = build_repository(root)

        # --- working-tree reads -------------------------------------------
        notes = rt.read_release_notes(clone)
        result["working_tree"] = {
            "notes": _serialize(notes),
            "latest_render": rt.render_release_note(rt.read_release_note("latest", clone)),
            "by_version_render": rt.render_release_note(rt.read_release_note("0.8.0", clone)),
            "by_v_prefixed_render": rt.render_release_note(rt.read_release_note("v0.10.0", clone)),
            "missing_render": rt.render_release_note(rt.read_release_note("9.9.9", clone)),
            "malformed_heading": _serialize(rt.read_release_note("0.7.0", clone)),
            # Looked up by the heading's version, not the file's.
            "heading_filename_mismatch": _serialize(rt.read_release_note("0.6.1", clone)),
            "mismatch_by_filename": _serialize(rt.read_release_note("0.6.0", clone)),
            "order": [note.version for note in notes],
        }

        # --- ref reads, before the clone has fetched ----------------------
        result["ref_before_fetch"] = {
            "notes": _serialize(rt.read_release_notes_from_ref("origin/stable", start=clone)),
            "pending_render": rt.render_release_notes_bundle(
                rt.build_pending_release_notes(
                    current_version=CURRENT_VERSION, ref="origin/stable", start=clone, fetch=False
                )
            ),
        }

        # --- ref reads, after fetching ------------------------------------
        git("fetch", "origin", cwd=clone)
        result["ref_after_fetch"] = {
            "notes": _serialize(rt.read_release_notes_from_ref("origin/stable", start=clone)),
            "latest_from_ref": _serialize(
                rt.read_release_note_from_ref("origin/stable", "latest", start=clone)
            ),
            "explicit_from_ref": _serialize(
                rt.read_release_note_from_ref("origin/stable", "0.11.0", start=clone)
            ),
            "missing_from_ref": _serialize(
                rt.read_release_note_from_ref("origin/stable", "9.9.9", start=clone)
            ),
            "pending_render": rt.render_release_notes_bundle(
                rt.build_pending_release_notes(
                    current_version=CURRENT_VERSION, ref="origin/stable", start=clone, fetch=False
                )
            ),
            "pending_render_current_is_newest": rt.render_release_notes_bundle(
                rt.build_pending_release_notes(
                    current_version="0.12.0", ref="origin/stable", start=clone, fetch=False
                )
            ),
        }

        result["unknown_ref"] = {
            "notes": _serialize(rt.read_release_notes_from_ref("origin/nope", start=clone)),
            "pending_render": rt.render_release_notes_bundle(
                rt.build_pending_release_notes(
                    current_version=CURRENT_VERSION, ref="origin/nope", start=clone, fetch=False
                )
            ),
        }

        result["semver_keys"] = {
            value: list(rt._parse_semver(value))
            for value in ("v0.9.0", "0.10.0", " v1.2.3 ", "v1.2", "nonsense", "v10.0.1")
        }

    golden = {
        "meta": {
            "note": (
                "Oracle: src/memory/cli/runtime.py over the fixture repository built by "
                "this generator (same recipe shape as the git golden). Only the temp root "
                "is a placeholder; commit ids do not appear in these surfaces."
            ),
            "current_version": CURRENT_VERSION,
        },
        "local_notes": LOCAL_NOTES,
        "remote_only_notes": REMOTE_ONLY_NOTES,
        **result,
    }
    text = json.dumps(golden, indent=2, sort_keys=True, ensure_ascii=False).replace(
        str(root), "<root>"
    )
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(text + "\n", encoding="utf-8")

    working = result["working_tree"]
    ref_after = result["ref_after_fetch"]
    if isinstance(working, dict) and isinstance(ref_after, dict):
        print(f"  working tree notes: {len(working['notes'])}")  # type: ignore[arg-type]
        print(f"  ref notes after fetch: {len(ref_after['notes'])}")  # type: ignore[arg-type]
    print(f"wrote {OUT_PATH.relative_to(HERE.parent.parent)}")


if __name__ == "__main__":
    main()
