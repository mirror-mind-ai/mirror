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
//     asks first, so this answers the next route that creates a key;
//   * a missing OpenRouter key (CR187), refused up front by the commands that
//     cannot work without one and lazily, at a first model call, by the rest --
//     and a key OpenRouter refused (HTTP 401 or 403), whether a chat call or an
//     embedding call met it. A configuration failure, so exit 2, as a missing
//     home is.
//
// Like every `Error:` line, the answer claims nothing about what changed before
// the refusal was raised.

import { InvalidIdentityKeyError } from "#identity/identityKey.ts";
import { keyRefusedMessage, ProviderConfigError } from "#providers/config.ts";
import { EmbeddingError } from "#providers/embedding.ts";
import { LlmTransportError } from "#providers/openrouter.ts";
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
  if (error instanceof ProviderConfigError) {
    return { line: `Error: ${error.message}`, exitCode: 2 };
  }
  const refusedStatus = refusedKeyStatus(error);
  if (refusedStatus !== undefined) {
    return { line: `Error: ${keyRefusedMessage(refusedStatus)}`, exitCode: 2 };
  }
  return null;
}

/**
 * The HTTP status of a key OpenRouter refused, null when it was not kept, or
 * undefined when `error` is not a refused key. Only the classification is read:
 * the transport keeps nothing the provider sent back, and neither does this.
 */
function refusedKeyStatus(error: unknown): number | null | undefined {
  if (error instanceof LlmTransportError && error.kind === "auth") return error.status;
  if (error instanceof EmbeddingError && error.transport?.kind === "auth") {
    return error.transport.status;
  }
  return undefined;
}
