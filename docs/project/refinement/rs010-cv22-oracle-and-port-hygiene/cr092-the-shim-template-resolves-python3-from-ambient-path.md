[< Refinement Workbench](../index.md) · [RS010](index.md)

# CR092 — The extension shim template resolves `python3` from ambient PATH

**Refinement Story:** RS010 — CV22 Oracle And Port Hygiene
**Status:** rejected
**Driver:** —
**Delivery:** —

## Problem

CV22.DS10.TS2 deletes `memory.extensions.compat_host` and migrates the three
daily-use extensions (`google-workspace`, `session-export`, `persona-export`) to
a stdlib shim declared as:

```yaml
runtime:
  protocol: mirror-cli-v1
  command: [python3, cli.py, <name>]
```

The bridge it replaces ran `uv run python -m memory.extensions.compat_host` — a
project-pinned interpreter with a locked dependency set. The replacement resolves
`python3` from whatever `PATH` the spawning process happens to carry, in an
environment the Mirror core no longer controls.

Raised as finding **O-1** by the devops-engineer lens in the TS2 Plan review
(2026-09-21) and decided the same day: the Navigator chose ambient `python3` for
his own tooling, with the template labelled personal tooling rather than the
recommended third-party pattern. This CR carries the part that was deliberately
*not* decided.

## Expected Behavior

Before `docs/product/extensions/template/cli.py.template` is presented to anyone
who is not the Navigator, the interpreter question has an answer that survives a
machine the Mirror core did not configure. Today it does not, and the failure is
misattributed: a missing or shifted interpreter surfaces as

```text
Mirror TS front door: extension/session-export declares a command for 'export'
that could not be started: spawn python3 ENOENT
```

which points at the extension rather than at the environment.

Options, none free:

1. **Leave it ambient and document the constraint.** Correct for personal tooling;
   wrong the moment the template is copied by a third party.
2. **Pin the interpreter inside the extension** (a venv under the extension root).
   Robust, but `commandStaysInside` rejects absolute paths outside the root, so
   this needs a venv *in* the extension — real work per extension, and a larger
   install story.
3. **Relax `commandStaysInside` to allow an absolute interpreter.** Cheapest to
   write and the worst of the three: it is a security-boundary change to the rule
   that stops a manifest from launching something the installer never placed.
   Named here only so it is on the record as considered and refused.
4. **Node shim** (`[node, cli.mjs, …]`). Removes the Python dependency outright
   and matches where DS10 is going, at the cost of rewriting working handlers.

## Impact

None today. The three migrated extensions are the Navigator's own, on machines he
controls, and option 1 was chosen knowingly.

It becomes real at **CV22.DS10.US3** (npm distribution), where the audience stops
being one person. Two distinct failures arrive together: an installing user with
no `python3`, and a template in `docs/product/extensions/` that recommends a
pattern the core cannot support for someone else's machine. The second is worse
than the first — a broken command is visible, a bad documented pattern
propagates.

Secondary: a Homebrew or system Python upgrade can shift the interpreter under a
working extension without any Mirror change, and hook- or GUI-launched runtimes
may not carry the interactive shell's `PATH`.

## Plan Or Decision

Not planned. Captured at TS2 Plan review time so the decision that *was* taken
(ambient `python3`, personal tooling) does not silently become the answer for the
third-party case by default.

Natural owner is **CV22.DS10.US3**, which owns npm distribution and is where the
third-party audience first exists. Revisit trigger: the first time the shim
template is presented as a supported extension-authoring pattern rather than a
reference for the Navigator's own extensions.

## Evidence

```text
# What the retired bridge resolved
src/memory/extensions/compat_host.py  ← launched via `uv run python -m …`
ts/src/extensions/dispatch.ts:50      DEFAULT_HOST_COMMAND = ["uv","run","python",…]

# What replaces it (TS2 plan, Scope D)
command: [python3, cli.py, <name>]    ← ambient PATH

# The rule that blocks an absolute pinned interpreter
ts/src/extensions/dispatch.ts  commandStaysInside(): `if (isAbsolute(argument)) return false;`
```

## Outcome

**Rejected 2026-09-25**, by the Navigator in [CV22.DS10.TS5's Debt Review](../../roadmap/cv22-typescript-core-port/cv22-ds10-python-retirement-npm-distribution/cv22-ds10-ts5-python-core-deletion/review.md): the subject is gone. The shim template this CR concerned was deleted by TS5's decision D7, at plateau 3, with the Python extension API it served. The extension template now teaches the declared `mirror-cli-v1` and `mirror-context-v1` runtimes, with no entry file (D10).
