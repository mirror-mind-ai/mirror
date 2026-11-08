[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR204 · Hand the host the persona's name with its id

## Problem

`deliverMirrorContext` tells its host which persona a turn speaks as only by id
(`persona: string | null`, `ts/src/mirror/deliverContext.ts`). A host that shows who is
speaking has nothing better to print than the id: Nautilus for Mirror now puts the persona
beside its words (its CR213) and can only make the id readable, so `ai-engineer` reads
"Ai Engineer".

The Core already keeps a name. A persona YAML may carry `name`, and the seed stores it in the
persona's metadata (`ts/src/seed/seedYaml.ts`); every persona template has one
(`templates/identity/personas/*.yaml`). No call hands it to a host. Personas written later
without a YAML `name` have none: on the maintainer's long-lived home, 10 of 28.

## Expected Behavior

- The delivery result gains `personaName: string | null`: the delivered persona's metadata
  `name` when it has one, and `null` when it has none or the turn has no persona. `persona`
  stays the id, so a host that reads only `persona` sees no change.
- The name is read with one keyed read of that persona's identity row, on the connection the
  delivery already holds, and only for a turn that has a persona; no model call.
- The name is display text only. It never replaces the id in the context block, the signing
  rule or anything the Core stores.

## Impact

Every host of `deliverMirrorContext`; additive. Nautilus for Mirror shows the name and keeps
the readable id as its fallback. Personas without a name stay unnamed until someone gives them
one; giving them one is content, not this change.

## Plan Or Decision

Captured 2026-11-07 by the Navigator ("abra a CR203 no Core"; renumbered CR204 when `main` took CR202 and the persona-routing CR moved to CR203), after Nautilus CR213 showed
the persona beside its words and the name was found kept in metadata but never handed over.

Open questions:

- Whether the Conversation summaries a host reads (`ts/src/conversation/hostReads.ts`, which
  carry `persona` as an id) should carry the name as well.
- Whether a host may later set a persona's name through a call, which belongs with persona
  management rather than here.

## Falsifier

A host that delivers context for a persona with a `name` receives that name in
`personaName`; for a persona without one, or a turn with none, it receives `null`; and a
host that reads only `persona` behaves exactly as before.

## Implementation

`ts/src/mirror/deliverContext.ts`: `DeliveredMirrorContext` gains `personaName`. After the doorman
writes, the session's persona is looked up in `identity` (`layer = 'persona'`) on the same live
connection, and its metadata `name` is returned trimmed; a row without metadata, unreadable JSON, a
missing or blank name, and a turn with no persona all give `null`. A turn that delivers nothing
returns `personaName: null` without opening the home for writing. `persona` is unchanged, and the
name goes nowhere else: not into the block, the signing rule or a stored row. The call's contract
in CV24.DS6 says so.

## Validation

`ts/test/mirror/deliverContext.test.ts`, in a home `createHome` made, with a reception that chooses
the template persona `writer`:

- the delivery returns `persona: "writer"` and `personaName: "Writer"`;
- with that persona's `name` removed from its metadata, `persona` stays `writer` and `personaName`
  is `null`;
- a turn that resolves no persona, and a command turn that delivers nothing, return `null`;
- `ts/test/desktop/desktopEntry.test.ts` reads the field through the published `mirror-mind/desktop`
  entry.

Five mutations, each caught: not handing the name, handing the id as the name, reading another
persona's row, falling back to the id, and leaving the field off the `nothing` result.

`npm test` under a clean environment and a throwaway `HOME`: 3,819 of 3,823 pass, 3 skipped; the one failure,
`the two cores describe a broken index with the same driver text` (`ts/test/runtime/diagnose.test.ts`),
fails the same way on `main` without this change, on the maintainer's machine. The production home's
`front-door.log` and `backups/` were unchanged afterwards. `tsc` and Biome are clean (Biome's one
warning is in an unrelated test).
