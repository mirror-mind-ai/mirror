// The refusals the front door answers by name when no route answered them.
//
// A route answers its own refusals. Two can reach the top of the front door
// unanswered, and each is still a refusal the user can act on, so each gets one
// line and an exit code, never a stack trace:
//
//   * a half-configured replay fixture, raised wherever a provider is built. Until
//     CV22.DS10.TS5 a plain family sent this case to the Python fallback instead,
//     which had no replay transport and would have called the live provider;
//   * a new journey slug or persona id outside the grammar, which the identity
//     store refuses for any route that did not ask first (CR104). Today every route
//     asks first, so this answers the next route that creates a key.
//
// Like every `Error:` line, the answer claims nothing about what changed before
// the refusal was raised.

import { InvalidIdentityKeyError } from "#identity/identityKey.ts";
import { ReplayFixtureIncompleteError } from "#providers/transport.ts";

export interface NamedRefusal {
  /** The one line printed to stderr. */
  readonly line: string;
  readonly exitCode: number;
}

/** The line and exit code for a refusal the front door can name, or null for a crash. */
export function namedRefusal(error: unknown): NamedRefusal | null {
  if (error instanceof ReplayFixtureIncompleteError) {
    return { line: `Mirror TS front door: ${error.message}`, exitCode: 2 };
  }
  if (error instanceof InvalidIdentityKeyError) {
    return { line: `Error: ${error.message}`, exitCode: 1 };
  }
  return null;
}
