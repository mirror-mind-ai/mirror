[< Refinement Workbench](../index.md)

# RS011 — Extension Contract Completeness

## Framing

Since CV22.DS10 an extension is a process Mirror spawns: `mirror-cli-v1` runs a
declared subcommand, `mirror-context-v1` runs a bound provider. The contract
between the two sides is what the environment and stdin carry, and it was written
from the inside — what the core knows and is willing to hand over. Extension
authors building real integrations keep finding what it does not carry: a place
for the extension's own installation settings, a way to reach a backend that
needs a machine-specific certificate, the ordinary needs of a program that was
not written by the core's authors.

When the contract has no answer, each extension invents one, and the inventions
leak: into the login shell, into other programs' environment variables, into
every command a Builder session runs for an unrelated journey. This story is the
durable home for the gaps the contract has, found one extension at a time.

## Outcome

An extension author finds, in the contract and its reference, an answer for each
ordinary need of a spawned program — settings, reach, visibility — that keeps
the extension's effect inside the process Mirror spawned for it. Each gap closes
as one bounded Change Request with the test that pins it and the row in the
reference that documents it.

## Boundaries

- Additive and backward compatible: `mirror-cli-v1` and `mirror-context-v1` keep
  their names, and an extension that ignores a new facility behaves as before.
- Not a secrets manager: how a credential is stored stays the extension's and
  the user's; the contract carries what it is given.
- Not an extension framework: no SDK, no helper library, no language preference.
- Not routing or parity work: that is RS009 and RS010.
- Keep document backlog status in the canonical [Workbench index](../index.md).

## Change Requests

- [CR145 — An extension's installation settings have nowhere to live but the login shell](cr145-an-extension-s-installation-settings-have-nowhere-to-live-but-the-login-shell.md)
- [CR146 — An extension cannot declare the settings it expects, so nothing can say which are missing](cr146-an-extension-cannot-declare-the-settings-it-expects.md)
