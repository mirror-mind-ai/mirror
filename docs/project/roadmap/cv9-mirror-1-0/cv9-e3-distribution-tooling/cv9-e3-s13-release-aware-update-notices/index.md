[< CV9.E3 Distribution & Tooling](../index.md)

# CV9.E3.S13 — Release-Aware Update Notices

**Epic:** CV9.E3 Distribution & Tooling  
**Status:** ✅ Done  
**User-visible outcome:** Stable-channel update notices speak in release terms when release metadata is available, while main-channel dogfooding can continue to speak in commit terms.

---

## Why

The first stable release proved that Mirror Mind can update production safely, but the update surfaces still mostly describe commits. That is acceptable for `main` dogfooding, but not for the user-facing `stable` channel. A stable update should answer the user's real question: what release is waiting, why it matters, and what command previews or installs it.

## Scope

In scope:

- Teach runtime update rendering to prefer release-note metadata for `stable` updates when the target ref is locally available.
- Keep `runtime update --check` non-mutating and honest when it can only see a remote commit through `git ls-remote`.
- Keep `runtime update --dry-run` no-network and able to show release metadata from fetched local refs.
- Make successful stable updates summarize the installed release when release notes exist.
- Preserve commit summaries as fallback, especially for `main`.
- Update command reference, roadmap, and validation notes.

Out of scope:

- Fetching release notes from GitHub or another network API.
- Automating release promotion.
- Creating the next release itself.
- Full skill parity for natural-language release notes. That belongs to CV9.E3.S14.

## Acceptance Criteria

- Stable `runtime update --dry-run` shows the target release title, digest, and preview/update commands when the fetched upstream ref contains release notes newer than the installed version.
- Stable `runtime update --check` remains non-mutating and clearly says when release details require fetched local refs.
- Successful stable `runtime update` includes an `Installed release` block when release notes are available after fast-forward.
- Main-channel update notices keep commit-oriented wording unless release metadata is explicitly available.
- Existing self-update safety gates, backup behavior, and fast-forward-only execution remain unchanged.

## Result

Release-aware update notices are implemented for the stable channel without changing the updater safety pipeline.

What changed:

- runtime update availability, dry-run, and update result can carry optional release metadata;
- release notes can be read from local git refs such as `origin/stable` without checkout;
- stable dry-run prefers release wording when a newer release note is available locally;
- stable update check stays non-mutating and says when release details are not fetched;
- successful stable updates render an `Installed release` block when release notes exist in the new checkout;
- commit summaries remain the fallback, especially for `main` dogfooding.

Validation:

```bash
PYTHONPATH=src uv run pytest tests/unit/memory/cli/test_runtime.py tests/unit/memory/cli/test_welcome.py
uv run --extra dev ruff check src/ tests/
uv run --extra dev ruff format --check src/ tests/
uv run --extra dev mypy src/memory/cli/runtime.py src/memory/cli/welcome.py
git diff --check
```

Result: 99 tests passed; ruff, format, story-scoped mypy, and whitespace checks passed.

Manual smoke in the dev clone confirmed the expected safety boundary: `--channel stable` reports `local_ahead`, and dry-run is blocked by the intentionally dirty development tree. End-to-end stable update validation remains for CV9.E3.S17.

## See also

- [CV9.E3.S12 First Stable Release Publication](../cv9-e3-s12-first-stable-release-publication/index.md)
- [Runtime Self-Update Reference](../../../../../../REFERENCE.md#runtime-self-update)
- [Release Notes](../../../../../process/release-notes.md)
