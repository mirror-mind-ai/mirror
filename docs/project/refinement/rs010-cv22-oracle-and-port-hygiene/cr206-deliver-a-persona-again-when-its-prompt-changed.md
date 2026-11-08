[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR206 · Deliver a persona again when its prompt changed

## Problem

A delta turn puts a persona's prompt into the conversation once. The session remembers the
ids it has delivered (`doorman_personas` in the runtime session's metadata,
`ts/src/mirror/doorman.ts`), and a later turn routed to the same persona finds the id there and
leaves the prompt out, trusting the copy already in the transcript.

The list knows *that* a persona was delivered, not *which text*. Once CR205 lets a host edit a
persona's prompt, an edit made while a conversation is open never reaches it: every later turn
with that persona answers from the old text still in the transcript, until a compaction forces
a full load. A persona screen that edits a prompt would offer an edit with no effect in the
conversations where the Navigator is most likely to try it.

## Expected Behavior

- The session remembers, per delivered persona, a fingerprint of the prompt it delivered: a
  short SHA-256 of the identity row's `content`, not `updated_at`, so a change to the name or
  the description alone does not deliver the prompt again.
- A delta routed to a persona already delivered compares the fingerprint with the current
  content. Equal: nothing is delivered, as today. Different: the prompt is delivered again and
  the new fingerprint remembered.
- A prompt delivered again says it replaces the earlier one, because the old text stays in the
  transcript and two equal headers give the model no order between them. The section header
  carries it, for example
  `=== persona/<id> (revised: replaces the earlier persona/<id> in this conversation) ===`.
  The exact wording goes through the prompt-engineering review the Core gives injected text.
- A session holding the old list of ids reads each id as delivered with an unknown
  fingerprint, and does not deliver it again on that account. Releasing this Core does not
  re-deliver every persona to every open conversation; only an edit made afterwards does.
- A compaction keeps working as it does: `forgetDoormanDelivery` empties the map, the next
  turn is full, and the persona it routes to is a first delivery under the ordinary header.
  "Revised" is used only for a persona delivered since the last compaction whose text changed
  after that delivery.
- The full load (`runFull`) records the fingerprint of the persona it delivered.

## Impact

`ts/src/mirror/doorman.ts` (`deliveredList` for personas, `rememberPersonas`,
`rememberDelivered`, `forgetDoormanDelivery`, `runDelta`, `runFull`) and its tests. The
delivered line and `personaName` (CR204) are unchanged. No schema change: the map lives in the
session's metadata JSON, where the list lives today. The descriptor generated from a prompt is
not refreshed by an edit, as `mirror identity set` does not refresh it; that is outside this CR.

## Plan Or Decision

Captured 2026-11-08, on the Navigator's word, as the counterpart of CR205: the persona screen
of Nautilus for Mirror (its CR217) edits the prompt, and the edit must take effect in the open
conversation. Considered and refused:

- forcing a full load after an edit, as a compaction does: it reloads identity, Journey and
  memories to replace one section, which costs more and changes more than the edit asked;
- warning in the host that the edit reaches only new conversations: the Core decides what
  enters the context, and a host cannot fix it from outside.

Field falsifier, run on a throwaway home through a real Pi session:

1. A conversation where a persona has spoken; edit its prompt with a visible instruction (for
   example, a fixed signature); the next turn routed to it delivers the revised section and
   follows the instruction.
2. An edit to the name or the description only: the next turn delivers nothing new.
3. An edit, then a compaction right after the persona spoke (its old prompt may survive in the
   recent tail the compaction keeps literal), then a turn: the full load delivers the current
   text, and the turn follows it. This residual risk exists today for every identity layer; the
   case measures it rather than assumes it.
4. A session written by the previous Core: no persona is delivered again until one is edited.
