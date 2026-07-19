[< CV9.E2 Stabilization & Robustness](../index.md)

# CV9.E2.S2 — External Extension Runtime Surface Parity

**Status:** Planned  
**Epic:** CV9.E2 Stabilization & Robustness  
**Task:** `92c028c7` — Add external extension skill projection for Gemini CLI and Codex

---

## User-Visible Outcome

An installed external extension should be discoverable as a normal skill in every
supported runtime whose skill system can support it. Pi and Claude Code already
have first-class external-skill visibility; Gemini CLI and Codex should not be
second-class citizens that require the user to remember raw `python -m memory
ext ...` commands.

For Gemini CLI and Codex, the likely user-visible result is an explicit
projection command that writes installed external skills into the shared
project-local `.agents/skills/` surface, analogous to Claude's
`expose-claude --target-root <project>` flow.

---

## Problem

The extension core is runtime-neutral: installed `command-skill` extensions can
be invoked through:

```bash
uv run python -m memory ext <extension-id> <subcommand> ...
```

That works from any shell-capable runtime. Mirror Mode context providers are
also core-side and can be collected during prompt assembly independently of the
frontend.

The gap is **runtime skill discovery**.

Current state:

| Runtime | External extension skill visibility | Status |
|---|---:|---|
| Pi | Reads `~/.mirror-minds/<user>/runtime/skills/pi/extensions.json` and contributes installed `SKILL.md` paths | First-class |
| Claude Code | Uses explicit `expose-claude --target-root <project>` projection into `.claude/skills/` | First-class, manual projection |
| Gemini CLI | Uses the shared `.agents/skills/` surface for core skills | Missing external projection |
| Codex | Uses the shared `.agents/skills/` surface for core skills | Missing external projection |

So extension **commands** work everywhere, but extension **skill UX** does not.
That creates an inconsistent runtime contract: a user can install
`google-workspace`, see it naturally in Pi, expose it explicitly to Claude, but
not get an equivalent first-class skill surface in Gemini CLI or Codex.

---

## Proposed Direction

Add a shared `agents` external-skill runtime surface because Gemini CLI and Codex
already share `.agents/skills/` for core Mirror skills.

Likely installed/runtime shape:

```text
~/.mirror-minds/<user>/runtime/skills/agents/ext-google-workspace/SKILL.md
~/.mirror-minds/<user>/runtime/skills/agents/extensions.json
```

Likely project projection command:

```bash
uv run python -m memory extensions expose-agents \
  --mirror-home ~/.mirror-minds/<user> \
  --target-root /path/to/project
```

and cleanup:

```bash
uv run python -m memory extensions clean-agents \
  --target-root /path/to/project
```

The projection should follow the safety rule learned from Claude: explicit
`--target-root` required, no current-working-directory default.

---

## Command Naming Decision To Validate

The likely command naming model is Pi-style names in `.agents/skills/`:

```text
.agents/skills/ext-google-workspace/SKILL.md
```

Then each runtime applies its own invocation syntax:

```text
Gemini CLI: /ext-google-workspace
Codex:      $ext-google-workspace
```

This mirrors the existing core skill pattern:

```text
.agents/skills/mm-build/SKILL.md
Gemini CLI: /mm-build
Codex:      $mm-build
```

Before implementation is finalized, validate this against both runtimes. The
shared directory name should not hide the fact that invocation syntax is still
runtime-specific.

---

## Manifest Strategy Options

### Option A — Add explicit `agents` runtime entries

Extension manifests would declare the shared agents runtime directly:

```yaml
runtimes:
  agents:
    command_name: ext-google-workspace
    skill_file: SKILL.md
```

Pros:
- explicit contract
- consistent with the existing runtime model
- no hidden coupling between Pi and agents surfaces

Cons:
- existing installed extensions need manifest updates or reinstall/resync work

### Option B — Derive `agents` from `pi`

If a manifest has no `agents` runtime, derive it from the Pi runtime:

```text
agents.command_name = pi.command_name
agents.skill_file = pi.skill_file
```

Pros:
- no immediate manifest migration for existing extensions
- reasonable because `.agents/skills/` currently mirrors Pi-style core skill names

Cons:
- implicit coupling between Pi and the shared agents runtime
- future divergence would require untangling fallback behavior

Recommended direction: **support explicit `agents`, with a temporary fallback
from `pi` if `agents` is missing.** That gives a clean future contract without
breaking current extensions such as `google-workspace`.

---

## Design Notes

- Prefer one shared `agents` runtime over separate `gemini` and `codex` runtimes
  unless their external-skill formats diverge. The discovery mechanism is shared,
  so the projection should be shared.
- Keep extension source under `~/.mirror-minds/<user>/extensions/<id>/` and runtime
  materialization under `~/.mirror-minds/<user>/runtime/skills/<runtime>/`.
- Project-local `.agents/skills/ext-*/` entries should be treated as generated
  overlays, not framework source.
- The projection must not disturb existing core `.agents/skills/mm-*` symlinks.
- The command names need an explicit decision. Since Gemini CLI invokes skills
  with `/...` and Codex with `$...`, but both read `.agents/skills/`, the skill
  directory and manifest naming should be tested in both runtimes before the
  contract is finalized.
- Cleanup must be catalog-driven. `clean-agents` should remove only paths listed
  in `.agents/skills/extensions.external.json`; it must not touch core
  `.agents/skills/mm-*` symlinks.
- Git ignore rules should protect generated external overlays without hiding the
  intentional core skill symlink surface. A likely pattern is:

```gitignore
.agents/skills/ext-*/
.agents/skills/extensions.external.json
```

---

## Implementation Sequence

1. Validate the `.agents/skills/ext-*` naming and invocation behavior in both
   Gemini CLI and Codex, or document any runtime-specific limitation found.
2. Add or derive a shared `agents` runtime surface for installed extensions:
   `~/.mirror-minds/<user>/runtime/skills/agents/` plus `extensions.json`.
3. Add `extensions expose-agents --mirror-home ... --target-root ...` to copy
   installed agents runtime skills into `<project>/.agents/skills/`.
4. Add `extensions clean-agents --target-root ...` to remove only catalog-listed
   generated external overlays.
5. Require explicit `--target-root` for both commands; do not default to
   `Path.cwd()`.
6. Add gitignore protection for generated agents overlays while preserving core
   `.agents/skills/mm-*` symlinks.
7. Update runtime docs and onboarding docs so users know the difference between
   core extension execution and runtime skill discovery.

---

## Scope

In scope:

- Add extension runtime materialization for a shared `agents` target if the
  manifest supports it, or derive it safely from existing runtime metadata if
  that proves cleaner.
- Add explicit project projection and cleanup commands for `.agents/skills/`.
- Add regression tests proving projection requires `--target-root`.
- Add tests proving existing core `.agents/skills/mm-*` entries are not pruned or
  overwritten.
- Add tests for missing runtime catalog behavior and explicit error messages.
- Add a narrow smoke test or fixture flow using a temp mirror home and temp
  project root: install/sync a reference extension, expose agents, assert the
  generated `.agents/skills/ext-*` skill exists, then clean it without touching
  core `mm-*` entries.
- Update README, Getting Started, REFERENCE, and runtime-interface docs.

Out of scope:

- Changing the extension loading API.
- Marketplace/remote extension installation.
- Runtime hook lifecycle changes for Gemini CLI or Codex.
- Automatic per-turn extension discovery beyond existing Mirror Mode context
  provider behavior.

---

## Test Guide

Expected coverage:

- `expose-agents` requires `--target-root`.
- `clean-agents` requires `--target-root`.
- `expose-agents` copies installed agents runtime skills into
  `<project>/.agents/skills/<command>/SKILL.md`.
- `expose-agents` writes `<project>/.agents/skills/extensions.external.json`
  with enough provenance to clean only generated extension overlays later.
- `clean-agents` removes only catalog-listed external skill files/directories.
- `clean-agents` preserves existing core `.agents/skills/mm-*` symlinks.
- Existing Pi and Claude extension tests remain green.
- If `agents` manifest fallback from `pi` is implemented, tests cover both
  explicit `agents` entries and the fallback path.

Suggested verification commands:

```bash
uv run pytest tests/unit/memory/cli/test_extensions.py
uv run pytest
uv run ruff check src/ tests/
uv run ruff format --check src/ tests/
git diff --check
```

If real runtime validation is practical, verify that the projected skill is
visible/invocable in both Gemini CLI and Codex using their respective syntax:

```text
Gemini CLI: /ext-<id>
Codex:      $ext-<id>
```

---

## Done Condition

- Installed external extensions can be surfaced as project-local skills for both
  Gemini CLI and Codex through the shared `.agents/skills/` surface.
- The projection and cleanup commands require explicit `--target-root`.
- Generated `.agents/skills/` external overlays are documented and gitignored as
  needed without hiding core `mm-*` symlinks.
- Existing Pi and Claude external-skill behavior continues to pass regression
  tests.
- Documentation clearly explains the difference between extension core command
  support and runtime skill discovery.

---

## See also

- [CV9.E2 Stabilization & Robustness](../index.md)
- [Runtime Interface Contract](../../../../../product/specs/runtime-interface/index.md)
- [Extension Architecture](../../../../../product/extensions/architecture.md)
