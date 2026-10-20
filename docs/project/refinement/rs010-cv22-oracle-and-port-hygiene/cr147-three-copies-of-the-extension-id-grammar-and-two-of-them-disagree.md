[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR147 — Three copies of the extension-id grammar, and two of them disagree

## Problem

The rule for what an extension id may look like is written three times in
`ts/src/extensions/`:

| File | Constant | Pattern |
|---|---|---|
| `manifest.ts` | `SKILL_ID_RE` | `/^[a-z0-9]+(?:-[a-z0-9]+)*$/` |
| `contextRuntime.ts` | `EXTENSION_ID` | `/^[a-z0-9]+(?:-[a-z0-9]+)*$/` |
| `dispatch.ts` | `EXTENSION_ID` | `/^[a-z][a-z0-9-]*$/` |

The first two agree. The third — the one that guards `runExtensionSubcommand`
before it spawns — is neither a subset nor a superset of them: `a--b` and `a-`
pass the dispatcher and fail the manifest; `9x` passes the manifest and fails the
dispatcher. An id that `install` accepts can be refused at dispatch as "not a valid
extension id", and a hand-made directory whose name `install` would reject can be
dispatched.

In practice the gap is narrow — every installed extension passed the manifest's
rule, and the dispatcher's installed check runs first — but the rule exists to be
one rule, and the comment in `dispatch.ts` ("unchanged since the catalog defined
it") says it believes it is.

## Expected Behavior

One exported grammar, used by the manifest validator, the context runtime, the
dispatcher, and the settings reader CR145 adds. The chosen grammar is the manifest's
(`install` is the authority on what an id is); the dispatcher's refusal message and
its test cases (`"/etc"`, `".."`, `"Tools"`, `""`) hold under it.

## Impact

Low today; a latent disagreement at a security check. The cost of the fix is one
export and two imports.

## Plan Or Decision

Captured, unassigned, 2026-10-20, from CR145's review (engineering lens), at the
Navigator's direction. Current Focus unchanged. CR145 exports `SKILL_ID_RE` from
`manifest.ts` and uses it for the settings path; it leaves the two other copies in
place so that its own scope stays bounded.

## Evidence

Read in the tree on 2026-10-20: `manifest.ts:34`, `contextRuntime.ts:10`,
`dispatch.ts:51`.

## Outcome

Open.
