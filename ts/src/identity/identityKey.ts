// CR104 — the identity keys agents put into commands.
//
// A journey slug and a persona id are identity keys, and they do not stay in the
// database: `--journey <slug>` goes into every Builder command, and the id that
// `detect-persona` prints goes into `mirror load --persona <id>`. Agents write
// those commands. A key that holds shell syntax is therefore two steps from a
// command on the user's machine: a crafted key, then a command that carries it.
// Persona ids can arrive from a stranger, in a persona bundle made to be shared
// and seeded.
//
// So a NEW key in these layers must be a kebab-case slug (`isKebabSlug`), checked
// where every creation passes: `upsertIdentity`'s INSERT branch. `identity set`
// and `identity edit` ask the same question earlier, before the write seam takes
// its snapshot and before an editor opens. A key that already exists predates
// the rule and stays writable; `runtime diagnose` reports it instead
// (`identityKeyBreaksGrammar`).
//
// Nothing here normalizes a key. A key stored differently from how it was typed
// would miss the next command that uses the typed one, so the answer is a refusal
// that names a key that would work.

import { pyRepr } from "#util/pythonText.ts";
import { isKebabSlug, kebabSlug } from "#util/slug.ts";

/** What each guarded layer calls its key, in the refusal. */
const KEY_NAMES: ReadonlyMap<string, string> = new Map([
  ["journey", "journey slug"],
  ["persona", "persona id"],
]);

/** The layers whose keys agents put into commands, and so must be kebab-case slugs. */
export const SLUG_KEYED_LAYERS: readonly string[] = [...KEY_NAMES.keys()];

/** Whether `key` breaks the grammar its layer requires. Always false for other layers. */
export function identityKeyBreaksGrammar(layer: string, key: string): boolean {
  return KEY_NAMES.has(layer) && !isKebabSlug(key);
}

/**
 * Why a NEW row in `layer` cannot take `key`, or null when it can. The sentence
 * leads with the consequence, because the reader is often an agent deciding its
 * next move, then gives the rule and a key that would work. The key is printed
 * escaped, so a newline or a terminal escape inside it cannot forge output.
 */
export function newIdentityKeyProblem(layer: string, key: string): string | null {
  const keyName = KEY_NAMES.get(layer);
  if (keyName === undefined || isKebabSlug(key)) return null;
  const suggestion = kebabSlug(key);
  const example = suggestion ? `, for example ${pyRepr(suggestion)}` : "";
  return (
    `no ${layer} was created: ${pyRepr(key)} is not a ${keyName}. ` +
    `Use lowercase letters, digits, and single hyphens, up to 80 characters${example}.`
  );
}

/**
 * Thrown when a new identity row's key breaks its layer's grammar. Nothing was written.
 * A route that did not ask first lets it through, and the front door answers it as
 * one `Error:` line (`#frontDoor/namedRefusal.ts`).
 */
export class InvalidIdentityKeyError extends Error {
  readonly layer: string;
  readonly key: string;

  constructor(layer: string, key: string, problem: string) {
    super(problem);
    this.name = "InvalidIdentityKeyError";
    this.layer = layer;
    this.key = key;
  }
}

/** Throw `InvalidIdentityKeyError` when a new row in `layer` cannot take `key`. */
export function assertNewIdentityKey(layer: string, key: string): void {
  const problem = newIdentityKeyProblem(layer, key);
  if (problem !== null) throw new InvalidIdentityKeyError(layer, key, problem);
}
