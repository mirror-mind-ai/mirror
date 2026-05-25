[< CV9.E3 Distribution & Tooling](../index.md)

# CV9.E3.S18 — Welcome and Status Bar Release Awareness

**Epic:** CV9.E3 Distribution & Tooling  
**Status:** ✅ Done
**User-visible outcome:** When a new stable release exists, the user sees a discreet operational signal when opening Mirror, can ask what changed, and can ask Mirror to update safely.

---

## Why

`v0.9.0` proved that the stable self-update path works, but dogfooding exposed a UX gap: opening the personal Mirror did not announce that `v0.9.0` was available. The runtime could discover the update with `runtime update --check`, but the normal opening surfaces stayed quiet because they only looked at local refs.

The desired product experience is not “users remember to run update checks.” It is: the Mirror opens, notices a release when possible, signals it discreetly, and lets the user continue naturally by asking what changed or asking Mirror to update.

## Scope

In scope:

- Define a network-tolerant release-awareness policy for opening surfaces.
- Add a lightweight remote stable check for welcome awareness.
- Keep the check fail-soft and non-mutating.
- Cache update availability so the welcome and status bar can render consistent state.
- Show a single health/status indicator in the Pi status bar.
- Keep active user visible in compact status form.
- Show detailed release/update guidance in welcome, not in the status bar.
- Preserve natural next prompts: “what changed?” and “update my Mirror”.

Out of scope:

- Running updates automatically.
- Fetching refs during welcome.
- Blocking Mirror opening on network availability.
- Full health dashboard.
- Multi-runtime status bar parity beyond Pi.

## Product Principles

- Mirror is local-first in state and network-tolerant in operation.
- The welcome does not depend on the network, but it may try the network.
- The status bar is a signal; the welcome is the explanation.
- If health is green, do not explain.
- If health is not green, show the next useful action.
- A colored/symbolic health state should summarize operational status, not list every subsystem.

## Proposed Status Bar Shape

```text
◇ alisson-vale · ✓ healthy
◇ alisson-vale · ⬆ v0.9.0
◇ alisson-vale · ⚠ attention
◇ alisson-vale · ✕ action required
◇ alisson-vale · ? unknown
```

If space is tight:

```text
◇ alisson-vale · ✓
◇ alisson-vale · ⬆ v0.9.0
```

## Proposed Welcome Shape

```text
◇ Mirror · alisson-vale
Version 0.8.0 · channel stable

Update available: v0.9.0 — Self-Update Done
Ask: “what changed?” or “update my Mirror”
```

If the remote check fails in the automatic welcome path, the Mirror still opens. A discreet message may be shown only when useful:

```text
Update check unavailable.
```

Explicit user checks should explain failures more clearly.

## Acceptance Criteria

- Welcome can discover a newer stable release through a lightweight remote check when cache is absent or older than 6 hours.
- The check uses a short timeout, does not fetch, does not mutate refs, can be disabled, and fails softly.
- Update availability is cached under the Mirror home.
- Welcome shows update version and title when a stable update is known.
- Pi status bar can show one compact health/update indicator plus active user, reading cache only.
- Green/healthy state stays quiet; non-green states include a useful next action.
- Existing `runtime update --check`, `runtime update --dry-run`, and `runtime update` remain compatible.

## Result

Welcome and Pi status bar release awareness are implemented.

What changed:

- `python -m memory welcome` now keeps an update-awareness cache at `<mirror-home>/runtime/update-check.json`.
- Welcome can refresh the cache through a lightweight `git ls-remote`-based stable check when the cache is missing or older than 6 hours.
- Remote welcome checks can be disabled with `MIRROR_WELCOME_REMOTE_UPDATE_CHECK=off`.
- Remote check failures are silent and never block welcome rendering.
- Matching remote tags can infer the release version; local release notes provide the title when available.
- `python -m memory welcome --status-line` renders a compact cache-only status bar signal such as `◇ alisson-vale · ✓` or `◇ alisson-vale · ⬆ v0.9.0`.
- Pi's `mirror-logger` extension now uses the status-line command for its status bar text.

Validation:

```bash
PYTHONPATH=src uv run pytest tests/unit/memory/cli/test_welcome.py tests/unit/memory/cli/test_runtime.py -q
uv run --extra dev ruff check src/ tests/
uv run --extra dev ruff format --check src/ tests/
uv run --extra dev mypy src/memory/cli/welcome.py src/memory/cli/runtime.py
git diff --check
```

Result: 121 targeted welcome/runtime tests passed; ruff, format, story-scoped mypy, and whitespace checks passed.

## See also

- [CV9.E3.S17 Fresh User Stable Update Smoke](../cv9-e3-s17-fresh-user-stable-update-smoke/index.md)
- [Runtime Self-Update Reference](../../../../../../REFERENCE.md#runtime-self-update)
- [Welcome Card Spec](../../../../../product/specs/welcome/index.md)
