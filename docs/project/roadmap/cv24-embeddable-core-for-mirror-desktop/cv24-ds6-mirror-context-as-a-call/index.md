[< CV24](../index.md)

# CV24.DS6 — Mirror's Context as a Call

**Status:** 🟠 Implemented (2026-10-30) on branch `desktop/library-seam-1a`. Not merged, not released.
Planned by Mirror Desktop's CV-010.DS-005 (phase 3, slice 3d), whose decision 5 put the doorman in
this branch, at the Navigator's word.

## Outcome

A host gets Mirror's context for one turn with one call, and the call records the delivery as
`mirror doorman` does:

**`deliverMirrorContext(dbPath, { sessionId, prompt, journeyId }, { apiKey })`** returns
`{ kind, block, persona, journey }`. `kind` is `nothing`, `full` or `delta`; `block` is the text the
host gives the model as a hidden message (empty for `nothing`); `persona` and `journey` are the
session's after the delivery.

**`forgetMirrorContext(dbPath, { sessionId })`** says the host compacted the transcript: the next
turn delivers the full folder again.

Both refuse a home that is not `current` (`DatabaseNotCurrentError`) and a request they cannot read
(`MirrorContextRejectedError`, `invalid_request`).

## Measured Before Building

- **The doorman is a command only.** `mirror doorman --prompt … --session-id …` decides on a
  read-only handle and writes behind the front door's pre-write snapshot only for a turn that
  delivers (CV9.DS8.TS2). `mirror-mind/desktop` did not export it.
- **The key.** The live LLM and embedding providers read `OPENROUTER_API_KEY` from the `env` object
  they are given, else from `process.env`, which the bins fill from `~/.config/mirror/env`. Given an
  explicit object, they read nothing else.
- **A host has no skill.** The doorman answers `nothing` to an ordinary turn until the session is in
  Mirror Mode, and on the terminal the `mm-mirror` skill puts it there. A host that loads no skills
  would never get context.
- **One more environment read.** The extension context the full folder collects runs each provider
  with `options.environment ?? process.env`.

## What a Host Call Adds to the Doorman

1. **The key is an argument.** The providers get `{ OPENROUTER_API_KEY: apiKey }` and nothing else;
   the extension context runs with an empty environment. A test sets `OPENROUTER_API_KEY` in the
   process and proves it is not read.
2. **Mirror Mode from the Conversation's first turn** (`decideHostTurn`). A session not yet in
   Mirror Mode gets the full folder, routed from the prompt, with the Journey the host names; after
   that, the doorman decides as it always does. A command turn still gets nothing (CR160's rule).
   The Journey the host names wins over the one the session remembers.
3. **A delivering turn without a key is refused** (`no_key`) before anything is written. The host
   then says the turn went without Mirror's context, instead of sending half of it. A turn that
   delivers nothing needs no key and takes no snapshot.

The write is `mirror doorman`'s: `openLiveWriteDatabase`, behind the pre-write snapshot in the
home's own `backups/`.

## Validation

- `ts/test/mirror/deliverContext.test.ts` (10), on a home `createHome` made: the first turn is full
  with its Journey and enters Mirror Mode; the host's Journey wins; the next turn is a delta, and
  after `forgetMirrorContext` the one after is full; a command turn gets nothing and writes nothing;
  no key refuses and writes nothing, with a key in the environment; unreadable requests; a `pending`
  home is refused and left byte-identical; forgetting an unknown session writes nothing; nothing is
  written outside the home; the decision table.
- `ts/test/desktop/desktopEntry.test.ts`: the three names are exported, and from `node_modules`, with
  no environment, a command turn answers `nothing` and a delivering turn is refused with `no_key`.
- Mutations: 13, all caught. One equivalent condition was removed; one test proved nothing (the
  seeded home has one Journey) and was rewritten with a second Journey.

## Exclusions

- Memory extraction and the rest of the terminal extension's session lifecycle.
- Which persona a host shows, and the operating instructions (`AGENTS.md`): they name skills and
  commands a host does not have. The signature rule rides in the delivered line.
