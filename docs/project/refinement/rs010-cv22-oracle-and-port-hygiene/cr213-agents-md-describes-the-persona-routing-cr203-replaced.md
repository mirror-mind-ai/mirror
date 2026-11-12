[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR213 · `AGENTS.md` describes the keyword persona routing CR203 replaced, and points the model at a command that still runs it

## Problem

The "Routing protocol" paragraph in `AGENTS.md` says:

- each persona carries `routing_keywords`;
- `detectPersona` (`ts/src/persona/detectPersona.ts`) scores the query against them at
  runtime;
- `mirror detect-persona "<query>"` inspects the active routing.

Since CR203 (v0.41.0), a turn's persona comes from the Decisions router
(`ts/src/mirror/personaRouter.ts`). If the router does not choose, the turn takes the
Journey's `default_persona`; if there is none, the turn has no persona.

`mirror detect-persona` (`ts/src/frontDoor/render/detectPersona.ts`) and the MCP tool
`detect_persona` (`ts/src/mcp/tools/deterministic.ts`) still run the keyword scorer. So
the instructions send the model to a command that answers a different question from the
one the runtime asks.

## Expected Behavior

- `AGENTS.md` describes routing as it runs, or it says that the delivered line names
  the persona and leaves the mechanism to the reference.
- `detect-persona` and `detect_persona` either say they are the keyword scorer or answer
  from the router.
- The generated plugin copy follows.

## Impact

Small. The model gets a wrong picture of routing, and runs an extra command when it
wants to check routing.

## Plan Or Decision

Captured, unassigned, 2026-11-09, at the Navigator's direction, while reading the shipped
operating instructions for CR211. It edits the same file, so the two can travel
together.

Planned on 2026-11-09 at the Navigator's direction. It travels with CR211: one change to
`AGENTS.md`, one review. Reviewed through five lenses with CR211, and approved by the
Navigator the same day. Two of the review's amendments are folded here (see Decisions
Taken At Approval); the full list is in
[CR211](cr211-the-operating-instructions-bound-nothing-about-a-tasks-size.md#decisions-taken-at-approval).

### The text

`AGENTS.md`'s "Automatic routing" paragraph tells the model to choose a persona itself,
which CR203's router now does. Its "Routing protocol" paragraph describes keyword
scoring. Both paragraphs are replaced by one:

```text
**Persona routing:** Mirror chooses each turn's persona; you do not. The
context Mirror delivers for a turn, or a Mirror load command prints, names
the persona to sign or says the turn has none; do not carry an earlier
persona into such a turn. When the user asks for a persona by name, load
with `--persona <id>`.
```

"A Mirror load command" covers `mirror mirror load` and `mirror build load`; the latter
names the persona Builder signs. How the router chooses stays in `REFERENCE.md`: the
model needs the behavior, not the mechanism.

In the signature rules, the example headed "When switching personas" is headed "When the
user asks for more than one persona's view". Otherwise it would still teach the model to
route by itself. The other signature rules are unchanged.

### Scope

1. **`AGENTS.md`.** The routing paragraph is replaced, the signature example is
   re-headed, and the plugin copy is regenerated.
2. **`mirror detect-persona` and the MCP `detect_persona` tool.** Their behavior does not
   change: they stay the keyword scorer, deterministic and free. Their one-line
   descriptions say so. Draft: "Show which personas' routing keywords a query matches
   (not the turn's router)". The places that change:
   - `ts/src/frontDoor/usage.ts`;
   - `ts/src/mcp/registry.ts`;
   - `ts/test/goldens/mcp-protocol.golden.json`, which advances in the same commit as
     `registry.ts`.
3. **`REFERENCE.md`.** Step 2 of "The doorman" still says a turn "is scored with
   `detect-persona`" and the persona "becomes the session's". It is rewritten to match the
   paragraph CR203 already corrected below it.
4. **Getting Started §9.** It is rewritten so `detect-persona` is a check of the seeded
   keywords, not of routing.
5. **`ts/test/scripts/operatingInstructions.test.ts`.** It asserts that `AGENTS.md` no
   longer names `detectPersona`, `routing_keywords` or `mirror detect-persona`. Written
   first, it fails on `4402e289`.

### Affected files

- `AGENTS.md` and `plugins/mirror-mind/rules/AGENTS.md` (generated)
- `ts/src/frontDoor/usage.ts`, `ts/src/mcp/registry.ts`
- `ts/test/goldens/mcp-protocol.golden.json`, `ts/test/scripts/operatingInstructions.test.ts`
- `REFERENCE.md`, `docs/getting-started.md`

### Acceptance

1. **`AGENTS.md`.** It names no `detectPersona`, `routing_keywords` or
   `mirror detect-persona`. It says the delivered context, or a Mirror load command,
   names the persona, and that a persona asked for by name is loaded with `--persona`.
   No signature example is headed "When switching personas". The plugin copy is
   byte-equal to it.
2. **The two descriptions.** `mirror --help` and the MCP `tools/list` describe
   `detect-persona` as the keyword scorer. Its output, and the `detect-persona` render
   golden, do not change.
3. **The docs.** `REFERENCE.md`'s doorman steps and Getting Started §9 describe routing as
   it runs.
4. **Checks.** Typecheck, lint, the full suite, `checkDocLinks`,
   `buildClaudePlugin.ts --check` and CI are clean.

### Validation

Automated: the `AGENTS.md` assertion and the advanced MCP golden. By the Navigator: read
the new `AGENTS.md` section, then run `mirror --help` and `mirror detect-persona "debug
this"` on this checkout. The descriptions are the only change.

### Exclusions

- **Routing `detect-persona` through the router.** It would cost a model call and break a
  deterministic tool. Capture it as its own CR if wanted.
- **Historical mentions.** `docs/product/extensions/binding-model.md`'s design diagram, and
  the mentions in the engineering principles and the development guide, are left as they
  are.
- **`routing_keywords` themselves.** They are still seeded, listed and editable. Whether
  they are still needed is a separate question.

### Delivery

One commit, after CR211's (one concern per commit). Nothing is committed, pushed or
released without the Navigator's word.

### Decisions Taken At Approval

Folded from the five-lens review on 2026-11-09 (CR211's items 2, 3 and 10):

1. **The routing paragraph** covers every load command, drops the router's mechanics,
   and keeps "do not carry an earlier persona".
2. **The signature example** "When switching personas" is re-headed "When the user asks
   for more than one persona's view".
3. **One commit for this CR.** The MCP golden advances in it, with the change to
   `registry.ts`.

## Evidence

- `AGENTS.md` lines 109–114 and `plugins/mirror-mind/rules/AGENTS.md` (the same text).
- `ts/src/mirror/doorman.ts` `runDelta` and `ts/src/mirror/defaultResolution.ts` call
  `routeTurnPersona`. Neither calls `detectPersona`.
- The only remaining importers of `detectPersona` are
  `ts/src/frontDoor/render/detectPersona.ts` and `ts/src/mcp/tools/deterministic.ts`.

## Outcome

Pending: planned, not started.
