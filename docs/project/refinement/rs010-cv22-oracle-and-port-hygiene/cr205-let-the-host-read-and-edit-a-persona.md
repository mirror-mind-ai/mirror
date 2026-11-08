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

## Delivered

Built 2026-11-08 on the Navigator's word ("construa a Core CR205"), in
`ts/src/persona/personaCalls.ts`, exported by name from `lib/desktop.js`.
`DESKTOP_API_VERSION` stays 1.

- `listPersonas(dbPath)` answers `{ id, name, description }` per persona, by id; read-only.
- `readPersona(dbPath, { persona })` answers `id`, `name`, `description`, `prompt`,
  `routingKeywords`, `defaultModel`, `inheritsFrom` and `updatedAt`, each text `null` when
  absent and the keywords `[]`.
- `updatePersona(dbPath, { persona, expectedUpdatedAt, name?, prompt?, description?,
  routingKeywords? })` answers the persona as `readPersona` reads it.

Where the build departs from the capture, and why:

- **No `briefing`.** Nothing in the Core reads a metadata `briefing`; the seed puts a YAML
  briefing into the prompt as a `# Briefing` section. Three personas on the maintainer's home
  carry the key, two of them with text that is not in their prompt. Offering it as an editable
  field would offer an edit with no effect. It is kept untouched, as every unknown key is.
- **`expectedUpdatedAt` is required**, as `updateJourney` requires it: an edit made on a screen
  opened before another write is refused with `persona_changed` instead of overwriting it.
- **Unreadable metadata is refused, not replaced.** A metadata field written to a row whose
  metadata is not a JSON object refuses with `metadata_unreadable`; a prompt alone can still
  change, since it leaves the metadata as it is.
- An empty `routingKeywords` list removes the key, and `null` removes a name or a description,
  as the open questions leaned. The keywords stay editable: `detectPersona`, the MCP tool and the
  default resolution still read them.
- A changed prompt leaves the persona's generated descriptor as it was, as `mirror identity set`
  does; `mirror descriptor generate` refreshes it.

Bounds: a name trimmed, 1 to 80 characters, no C0 or C1 control character (CR204's reading); a
description trimmed, 1 to 2,000 characters; a prompt not blank, kept as given; at most 200
keywords, each trimmed, 1 to 80 characters, no control character. An update that changes
nothing writes nothing and keeps `updatedAt`.

## Validation

- Spec first, `ts/test/persona/personaCalls.test.ts` (12), red on the missing module; the Desktop
  entry's name list (`ts/test/desktop/desktopEntry.test.ts`) red before the export.
- 26 mutations of `personaCalls.ts`: 25 caught. Four survived a first run and were answered: two
  gained a case (a read-only field beside a writable one; a persona at a version other than
  `1.0.0`), one was dead code and was removed (a branch turning `{}` back into `null`, which
  could not be reached), and one remains: running the update outside its transaction. That
  transaction makes the `updatedAt` check and the write one step against another writer, as in
  the Journey calls; a single-process test cannot see the difference.
- `tsc` clean; Biome clean but for the known warning in `testTempHomes.test.ts`; the suite,
  3,854 tests: 3,850 pass, 3 skipped, 1 known local failure (`the two cores describe a broken
  index with the same driver text`). Run with a clean environment and a throwaway `HOME`; the
  maintainer's `front-door.log` and `backups/` unchanged.

