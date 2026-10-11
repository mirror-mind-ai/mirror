[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR125 — The publish route moves `stable` and leaves `latest` on the placeholder

## Problem

`publish.yml` stages the package under the dist-tag the dispatcher names, and the
documented dispatch names `stable`, because the updater's package lane reads `stable`
(`runtime channel`). npm installs `latest` when no tag is given, and `latest` is what
Getting Started's one install line resolves to. Nothing in the route moves `latest`.

On 2026-10-11, after `mirror-mind@0.32.1` was approved and public under `stable`, the
registry read `{ latest: '0.0.1', stable: '0.32.1' }`: a stranger running
`npm install -g mirror-mind` received the placeholder published to take the name, three
files and no `bin`. The Navigator moved `latest` by hand (`npm dist-tag add
mirror-mind@0.32.1 latest`), with 2FA, after the Driver noticed.

## Expected Behavior

A release approved under `stable` is what `npm install -g mirror-mind` installs. Either
the staged publish carries `latest` as well, or the printed route (`release:promote`'s
last step and the workflow's summary) names the `dist-tag add` as a step of the release,
not something to notice. A rehearsal under `next` must still leave `latest` alone.

## Impact

High for the first stranger and invisible to everyone else: the updater follows
`stable` and existing installs were right; only the documented install line was wrong,
for the minutes between approval and the manual tag. It would have been wrong for days
had the scratch-prefix verification been skipped.

## Plan Or Decision

Pending. The decision to take first: whether `latest` is a second tag the stage carries
(npm stages one tag per publish; a second needs `dist-tag add` after approval, which the
trusted publisher cannot run, so it is a maintainer step either way) or a step the route
prints. Printing is the smaller change and keeps every registry mutation a human act,
which is the publish decision's rule. Captured without selecting; Current Focus unchanged.

## Evidence

- 2026-10-11 20:18Z: `npm stage publish . --provenance --tag "stable"` staged
  `mirror-mind@0.32.1`; approved by the Navigator; `npm view mirror-mind dist-tags` read
  `{ latest: '0.0.1', stable: '0.32.1' }`; `npm install -g --prefix /tmp/… mirror-mind`
  installed `0.0.1` with no `bin`.
- After `npm dist-tag add mirror-mind@0.32.1 latest`: `{ latest: '0.32.1', stable:
  '0.32.1' }`, and a scratch install ran `mirror`, `init`, `seed` (20 created), `list
  personas` (12), `runtime status` (`Install: package (mirror-mind@0.32.1)`).
- `.github/workflows/publish.yml` input `dist_tag`; `ts/scripts/releasePromote.ts` final
  printed step;
  [the publish decision](../../decisions.md#the-npm-package-is-published-by-staging-from-ci-with-provenance-and-a-maintainer-approves-with-2fa).

## Outcome

Pending.
