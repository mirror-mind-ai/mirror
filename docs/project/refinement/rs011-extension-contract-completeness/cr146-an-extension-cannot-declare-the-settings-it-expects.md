[< RS011](index.md) · [Canonical status](../index.md#change-requests)

# CR146 — An extension cannot declare the settings it expects, so nothing can say which are missing

## Problem

[CR145](cr145-an-extension-s-installation-settings-have-nowhere-to-live-but-the-login-shell.md)
gives an extension's installation settings a file, `<mirror-home>/extensions/<id>.env`,
and `mirror ext <id>` says whether the file exists and which keys it carries. What
nothing can say is whether those are the *right* keys: the manifest has no way to
declare the settings the extension expects, so Mirror cannot tell a person at
`install` time that the extension needs `PGHOST` and `PGSSLMODE`, cannot name the
missing one when a subcommand fails, and cannot print the settings path at the one
moment the person needs it — `install` — without printing it for every extension,
including the many that need no settings at all.

The person installing learns the keys from the extension's README, writes the file
by hand, and finds out whether they got it right by running the extension.

## Expected Behavior

A manifest may declare the settings it expects — name, whether required, and a
one-line description, values never — and Mirror uses the declaration where the
person is: `install` prints the settings path and the declared keys when there are
any; `ext <id>` marks each declared key present or missing; a `mirror-cli-v1`
dispatch of a subcommand whose required settings are missing can refuse with the
names, before the extension has to fail in its own vocabulary. An extension that
declares nothing behaves exactly as under CR145.

## Impact

Turns "edit a text file at a path from the README" into a guided step with a
checklist, which is the onboarding a non-technical user can complete. Additive to
the manifest format: an unknown key today, a documented one after.

## Plan Or Decision

Captured, unassigned, 2026-10-20, from CR145's review (product lens), at the
Navigator's direction. Current Focus unchanged. Gated on CR145: the file and the
listing line it builds on.

## Evidence

CR145's review, 2026-10-20: the listing line is discoverable only by someone who
knows to run `mirror ext <id>`; printing the path at every `install` is noise for
extensions that need nothing; the honest fix is a declaration. The manifest
validator (`ts/src/extensions/manifest.ts`) has no `settings` key today.

## Outcome

Open.
