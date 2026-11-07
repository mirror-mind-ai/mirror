[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR203 · Hand the host the persona's name with its id

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
- The name is read from the same identity read the delivery already makes; it adds no query
  per turn beyond that read and no model call.
- The name is display text only. It never replaces the id in the context block, the signing
  rule or anything the Core stores.

## Impact

Every host of `deliverMirrorContext`; additive. Nautilus for Mirror shows the name and keeps
the readable id as its fallback. Personas without a name stay unnamed until someone gives them
one; giving them one is content, not this change.

## Plan Or Decision

Captured 2026-11-07 by the Navigator ("abra a CR203 no Core"), after Nautilus CR213 showed
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
