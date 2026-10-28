[< Roadmap](../index.md)

# CV24 — Embeddable Core for Mirror Desktop

**Status:** 🟢 In Progress — DS1, DS2 and DS3 built on `desktop/library-seam-1a`, not released
**Opened:** 2026-10-28, at the Navigator's word, from the `mirror-desktop` Journey.

## Goal

Mirror Desktop 0.3 hosts this core inside its own Node process and calls it as a library, through
the entry `mirror-mind/desktop`, instead of spawning a Python CLI. This CV gives that entry a small
contract, one piece at a time. Every piece goes through this repository's gates and Mirror's own
release.

## Why

[Decision CV22.DS10.TS1](../../decisions.md#journey-projections-retire-with-the-python-core-mirror-desktop-is-outside-the-migration)
left Mirror Desktop outside the TypeScript migration. On 2026-10-28 Mirror Desktop decided to
follow the core instead. It froze its 0.2 line on the Python core and opened a 0.3 line that embeds
this one, on its own database and installation. That decision is recorded in Mirror Desktop's
repository as `docs/project/roadmap/cv-010-first-run-assistant/decision-2026-10-28-the-0-3-line.md`,
and the consumer's plan is its CV-010.DS-005, phase 1.

## Boundaries

- The core does not learn about Mirror Desktop. The entry exposes general capabilities, named by
  what they do.
- A name the entry does not re-export is not part of the contract. `DESKTOP_API_VERSION` changes
  when a name is removed or changes meaning.
- The library never reads `MIRROR_HOME`, `MIRROR_USER` or `DB_PATH`. A host passes paths
  explicitly, because the shell that starts it may export another home's.
- The library never migrates as a side effect of a read. Migration is a call of its own, made after
  the person is asked.

## Delivery Stories

| Code | Delivery Story | Outcome | Status |
|------|----------------|---------|--------|
| [CV24.DS1](cv24-ds1-inspect-a-home-without-migrating/index.md) | Inspect a Home Without Migrating | `mirror-mind/desktop` exists, importable from `node_modules`, and reports a database's migration state without changing it | 🟠 Implemented — on branch, not released |
| [CV24.DS2](cv24-ds2-conversations-as-calls/index.md) | Conversations as Calls | Create or ensure a Conversation, append explicitly, rename, and rebind its Journey | 🟠 Implemented — on branch, not released |
| [CV24.DS3](cv24-ds3-journey-reads/index.md) | Journey Reads | The Journey tree, a Journey's Conversations, and one Conversation by id, read-only, honouring the stored sibling order | 🟠 Implemented — on branch, not released |
| [CV24.DS4](cv24-ds4-create-a-home/index.md) | Create a Home | One call creates a complete, seeded home at an explicit path, all or nothing, writing nothing outside it | 🟡 Planned — two decisions await the Navigator |
| CV24.DS5 | Migrate on Request | Apply pending migrations as an explicit call, with the backup and lock `ensureMigratedOnOpen` already takes | 🟡 Candidate |

## Owed at Release

A release note for the version that first ships `mirror-mind/desktop`, naming the entry, the
`exports` field (which closes every other deep import of the package) and `lib/` in the tarball.
