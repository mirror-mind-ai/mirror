[< Story](index.md)

# Test Guide — CV9.E6.S6 Personal Mirror Validation

## Automated validation

Run the focused web visibility gate before manual review:

```bash
uv run pytest tests/unit/memory/surfaces tests/unit/memory/web tests/unit/memory/test_public_api.py
uv run ruff check src/memory/surfaces src/memory/web tests/unit/memory/surfaces tests/unit/memory/web
uv run ruff format --check src/memory/surfaces src/memory/web tests/unit/memory/surfaces tests/unit/memory/web
node --check src/memory/web/static/app.js
git diff --check
```

Expected result:

- all targeted tests pass;
- lint and format checks pass;
- browser JavaScript parses cleanly;
- no trailing whitespace or diff hygiene issue exists.

## Manual validation setup

Restart the local web server after any web change:

```bash
~/restart-mirror-web.sh
```

Open the local web app in the browser. Use the personal Mirror home, not a
fixture or temporary database.

## Manual validation route

### Shell and perspective behavior

Verify:

- the app opens locally without CLI inspection;
- the shell shows Identity, Workspace, and Docs as coherent modes;
- switching between Identity and Workspace does not feel like entering a
  different product;
- the default perspective persists after reload when changed;
- Docs remains available without its sidebar leaking into Identity or Workspace.

### Identity map

Verify:

- the Identity page shows Self, Ego, Shadow, Personas, and Memories;
- Self uses the personal identity content and is not generic placeholder text;
- Ego reflects expression/behavior/constraints clearly;
- Personas are visible as active lenses, not separate agents;
- Memories show partial aggregate visibility without pretending to be a full
  evidence graph;
- Shadow is honest when explicit structural shadow content is absent or partial.

### Object detail and Source Context

Open representative details:

- Self;
- Ego;
- at least one persona, preferably `engineer` or another frequently used lens;
- Shadow if visible.

Verify:

- detail pages share a stable grammar;
- content is readable and rendered safely;
- Source Context names the source path or explains missing provenance;
- related links work where supported;
- unsupported provenance is explicit rather than implied.

### Workspace

Verify:

- active journeys appear in the left journey list;
- the default selected journey is plausible for recent activity;
- selecting another journey updates the central workspace;
- the selected journey profile shows status, description, and useful counts;
- Briefing renders real journey content;
- Conversations, Tasks, Memories, and Decisions tabs show real data or honest
  empty states;
- Decisions are clearly derived/partial when only decision memories exist;
- the whole surface remains read-only.

### Existing-user readiness

Answer:

```text
Would I ask an existing Mirror Mind user to update for this visibility surface?
If yes, why?
If no, what exact blocker remains?
```

## Finding log template

Use this structure when recording validation results in the story docs or
worklog:

```text
Validated behavior
- ...

Friction
- ...

Release blockers
- none / ...

Follow-up
- ...

Readiness judgment
- strong enough to ship / blocked by ...
```

## Acceptance note

This story is valid when manual validation evidence exists and every friction is
classified as pass, follow-up, release blocker, or out of scope. CV9.E6 can close
only if no release blocker remains for the 1.0 read-only web visibility promise.
