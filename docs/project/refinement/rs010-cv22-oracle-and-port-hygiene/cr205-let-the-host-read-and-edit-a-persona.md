[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR205 · Let the host read and edit a persona

## Problem

The Desktop API (`lib/desktop.js`) has no persona call. A host can learn a persona's id and
name from a delivery (`deliverMirrorContext`, CR204), but it cannot list the personas a home
keeps, read one whole, or change one. Nautilus for Mirror is building a persona screen: click
the name beside an answer, see the persona, edit it. Today it would have to write the
`identity` table itself, which no host may do.

The Core owns everything the screen shows except the image. A persona is one `identity` row
(`layer = 'persona'`): `content` is its prompt, and its metadata carries `name`,
`description`, `routing_keywords`, `default_model`, `inherits_from` and sometimes `briefing`
or a legacy `persona_id`. The CLI's `identity set` writes only content; no surface edits the
metadata fields one by one.

## Expected Behavior

Three calls in the Desktop API, shaped like the Journey calls (`ts/src/journey/journeyCalls.ts`):

- `listPersonas(dbPath)`: every persona's `id`, `name` (metadata `name`, `null` when absent)
  and `description`, ordered by id. Read-only, `current` homes only.
- `readPersona(dbPath, { persona })`: the row whole — `prompt` (content), `name`,
  `description`, `routingKeywords`, `defaultModel`, `inheritsFrom`, `briefing` — each `null`
  when absent. Unknown metadata keys are not returned but are never lost.
- `updatePersona(dbPath, { persona, ... })`: writes only the fields it is given — `name`
  (trimmed, 1 to 80 characters, no control character, as CR204 reads it; `null` removes it),
  `prompt` (non-empty), `description`, `routingKeywords` (a list of non-empty strings),
  `briefing`. Unknown metadata keys and the fields not given are preserved. A missing persona
  or an invalid field refuses with a `PersonaCallRejectedError` that writes nothing, naming
  the field. The call answers the updated `readPersona` shape.

Out of scope, named so a host does not wait for them:

- **No create and no delete.** The screen edits what exists; creating a persona is CV-015
  territory and routing-keyword design.
- **No image.** A persona's image is the host's, as a Journey's appearance already is.
- **`default_model` and `inherits_from` stay read-only.** Changing them changes routing and
  inheritance semantics this CR does not touch.

## Impact

Additive for every host; `DESKTOP_API_VERSION` stays 1. Nautilus for Mirror builds its persona
screen on these calls. The CLI and the terminal flow are untouched.

## Plan Or Decision

Captured 2026-11-08 by the Navigator ("criando as CRs tanto do core quanto do app"), for the
Nautilus persona screen: click the persona's name beside its words, see it, edit it.

Open questions:

- Whether `updatePersona` should refuse an empty `routingKeywords` list or read it as "remove
  the key". Leaning: an empty list removes the key, like `name: null`.
- Whether editing `routing_keywords` matters while CR203's router offers personas by
  `description` first. Leaning: keep them editable; they are still the fallback corpus.
