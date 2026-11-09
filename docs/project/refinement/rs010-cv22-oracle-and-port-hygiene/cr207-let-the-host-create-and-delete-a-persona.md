[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR207 · Let the host create and delete a persona

## Problem

CR205 gave the Desktop API `listPersonas`, `readPersona` and `updatePersona`, and left creating
and deleting out on purpose. Nautilus for Mirror now lists every persona in its sidebar
(Nautilus CR221, v0.4.0-alpha.10) and has captured the two acts that remain: a ＋ that creates a
persona (Nautilus CR222) and a Delete that shows what goes before anything goes (Nautilus
CR223). Today a host could do either only by writing the `identity` table itself, which no host
may do, and the terminal has no single command for either.

A persona is more than its `identity` row. Its id is read, as text and without a foreign key, in
`conversations.persona`, `memories.persona`, `runtime_sessions.persona`, `identity_descriptors`
(`layer = 'persona'`), `identity_integrations` (`layer = 'persona'`), `_ext_bindings`
(`target_kind = 'persona'`), another persona's `inherits_from`, and a Journey's
`default_persona` metadata, which the router reads (`personaRouter.ts`). A deletion that removes
the row and leaves the rest would leave a router default that names nothing, an heir that
inherits from nothing, and bindings that wake for a persona a new one could reuse by id, as
CR202 found for Journeys.

## Expected Behavior

Three calls in the Desktop API, shaped like CR205's persona calls and CR200's Journey deletion.

**`createPersona(dbPath, { persona, name, prompt, description?, routingKeywords? })`**

- Writes one `identity` row with `layer = 'persona'`, `key = persona`, the prompt as content and
  the metadata fields given; answers the persona as `readPersona` reads it.
- The id is a slug (the reading `readPersona` already accepts), not taken by any persona. Name,
  description, prompt and keywords are bounded as `updatePersona` bounds them. A refusal is a
  `PersonaCallRejectedError` that writes nothing and names the field (`persona_exists`,
  `persona_invalid`, and the field reasons CR205 already has).
- `default_model` and `inherits_from` are not offered, as in CR205; the Core's defaults apply.
- Eligible for routing from the next turn. Today the router offers a persona by its descriptor,
  else by the first 200 characters of its prompt (`defaultResolution.ts`), not by the metadata
  `description` a host writes. Whether creation generates a descriptor at once, or the router
  should read the description when there is no descriptor, is a build decision to state in the
  delivery.

**`previewPersonaDeletion(dbPath, { persona })`**

- Read-only. Answers what the deletion would change, by rule, with a digest of that reading:
  the counts of Conversations, memories and runtime sessions that name the persona; its
  descriptor and integrations; its extension bindings; the personas that inherit from it, by id;
  and the Journeys whose `default_persona` it is, by id.

**`deletePersona(dbPath, { persona, expectedDigest })`**

- Re-reads the preview and refuses with `persona_changed` when the digest differs, as CR200's
  deletion does; takes a named backup (`backups/pre-persona-deletion-<id>-<UTC stamp>-<random>.db`)
  and verifies that it reads as the same preview; only then deletes, in one transaction.
- Answers a receipt with the backup's path and what changed.

## Decisions This CR Proposes

These are the capture's leanings, to be confirmed or changed by the build with reasons:

- **History stays.** Conversations, messages, memories and runtime sessions keep the persona's id
  as text: they record who spoke, not a live link. Nautilus shows a deleted persona's id with no
  link (Nautilus CR223).
- **Machinery goes.** The persona's descriptor, integrations and extension bindings are deleted
  with it, so a new persona that reuses the id starts clean (the CR202 lesson).
- **A Journey's default is cleared.** `default_persona` is removed from the Journey's metadata, and
  the router falls back as it does for a Journey with none.
- **An heir blocks the deletion.** A persona that others inherit from is refused with
  `persona_has_heirs`, naming them, rather than silently cutting the inheritance. Changing an
  heir's `inherits_from` stays out of scope, as in CR205. Open question: whether to offer instead
  to detach the heirs in the same act.
- **Sticky state.** The build checks whether any runtime session or sticky default carries the
  persona as a live choice (not as history) and states what it does with it.

## Impact

Additive for every host; `DESKTOP_API_VERSION` stays 1. Nautilus for Mirror builds CR222 and CR223
on these calls, after a release and a new pin. The CLI and the terminal flow are untouched; a
`mirror persona create` or `delete` command is a separate decision.

## Out of Scope

- Duplicating a persona as a template.
- Editing `default_model` or `inherits_from`.
- Undo. The named backup is the way back, as for a Journey.
- A persona's image, which is the host's.

## Falsifiers

- A created persona is listed by `listPersonas`, read whole by `readPersona`, and can be routed to
  on the next turn whose subject fits its description.
- A taken id, a malformed id, a blank prompt or an out-of-bounds field is refused, naming the
  field, and nothing is written.
- The preview's counts match a direct count of every table above, on a home where the persona
  appears in each of them.
- A persona edited, routed or bound between preview and deletion is refused with
  `persona_changed`, and nothing is deleted.
- After a deletion: the row, its descriptor, integrations and bindings are gone; its
  Conversations, messages, memories and runtime sessions are intact; no Journey names it as
  default; the backup exists and reads as the preview.
- A persona with heirs is refused with `persona_has_heirs`, naming them, and nothing changes.

## Plan Or Decision

Captured 2026-11-08 on the Navigator's word ("capture a CR207 do Core"), for Nautilus CR222 and
CR223, after Nautilus v0.4.0-alpha.10 shipped the persona list.
