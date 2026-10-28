[< CV24](../index.md)

# CV24.DS4 — Create a Home

**Status:** 🟡 Planned (2026-10-28). Two decisions are the Navigator's, below. Nothing is built
until they are answered.

## Outcome

A host's first-run assistant creates a complete Mirror home with one call through
`mirror-mind/desktop`, with no CLI:

**`createHome({ homePath, userName })`** returns `{ homePath, dbPath, identityRoot, seeded }`. It:

1. copies the identity templates into `<homePath>/identity` and substitutes `{{user_name}}`;
2. creates `<homePath>/memory.db` at the current schema;
3. seeds the identity, personas and Journeys from that tree, as `mirror seed` does.

The home either appears complete or does not appear at all. Afterwards, DS1's report reads it as
`current`, and DS2 and DS3 accept it.

## Measured Before Planning

- **The pieces are ported:**
  - `initUserHome` (`init/init.ts`) copies templates and substitutes the name. It refuses a
    non-empty identity root.
  - `bootstrapDatabase` creates a database at the current schema.
  - `runSeed` (`seed/seed.ts`) seeds from an identity root into an open `WritableDatabase`.
  - The package smoke shows a fresh seed creating 20 entries with no errors.
- **The CLI's `init` writes a global file.** When no user is configured, it writes `MIRROR_USER=<user>`
  into `~/.config/mirror/env`. That file selects the home for **every** `mirror` and `mirror-hook`
  process on the machine, including the runtime hooks of Pi, Claude Code and Codex. A library call
  must never do this: a host creating its own home would silently redirect the person's terminal
  Mirror to it.
- **The CLI's `seed` writes through the per-write snapshot** (`openLiveWriteDatabase`). On a fresh
  home that snapshot protects nothing, because the database was created a moment earlier, and DS2's
  narrowed handle cannot write the `identity` table.
- **The name check exists.** The CLI's `init` refuses a name that starts with `-` and any name that
  `newUserNameProblem` rejects (CR104 and CR141). The name becomes a directory and a template value.

## The Two Decisions

### 1. Custody of the seed: build beside, then rename (recommended)

The seed writes the `identity` table, which no sanctioned host handle may write. The recommendation:

- `createHome` builds the whole home in a staging directory beside the target, named
  `<parent>/.<name>.creating-<pid>-<random>`.
- It copies the templates, bootstraps the database and seeds it there.
- It checks that DS1's report reads `current` and that the seed recorded no errors.
- Only then does it rename the staging directory to `homePath`, which is atomic on one filesystem.
- On any failure, it removes the staging directory and leaves no target.

Until the rename, no other process can know the path, so nothing exists to protect. This is the same
reasoning that lets `openDatabaseForBootstrap` write a file it is creating. If chosen, it is recorded
in `docs/project/decisions.md` beside the two narrowed writers before any code is written, and it
grants no write to an existing home.

The alternative is to seed through `openLiveWriteDatabase`, as the CLI does. That takes a snapshot of
an empty database and leaves a `backups/` directory in a home that has never held anything, and it
offers no all-or-nothing property.

### 2. No global configuration (recommended)

`createHome` writes nothing outside `homePath`. In particular, it never writes `~/.config/mirror/env`.
The host keeps the home's path in its own configuration and passes it explicitly, as every other
CV24 call requires. A person who later wants their terminal Mirror on that home sets it themselves.

## Refusals

`createHome` throws `CreateHomeRejectedError` with one of these reasons:

- `invalid_user_name`: the name fails the CLI's rule;
- `invalid_home_path`: the path is not absolute, or its parent does not exist;
- `home_exists`: anything already exists at `homePath`, including an empty directory;
- `templates_unavailable`;
- `seed_failed`: the seed recorded errors. The staging directory is removed.

## Acceptance

- **A created home is complete:**
  - the `identity/` tree, with no `{{user_name}}` token left in any `.yaml`;
  - DS1 reports `current`;
  - the seed counts are the CLI seed's for the same templates;
  - DS3's `readJourneyTree` and DS2's `ensureConversation` work on it.
- **The CLI agrees.** `mirror init` plus `mirror seed` on a scratch `HOME` produce the same `identity`
  rows as `createHome`, compared by layer, key and content, with ids and timestamps excluded.
- **All or nothing.** A seed failure, forced in the test through a broken template, leaves no
  `homePath` and no staging directory. The same holds for a failure after the bootstrap.
- **Nothing outside the home.** With `HOME` set to a scratch directory, nothing appears under
  `~/.config`. `MIRROR_HOME` and `MIRROR_USER` aimed at a canary are ignored.
- **The refusals:** every reason above. For `home_exists`, the existing path is untouched.
- **The installed entry.** Step 7 of the package smoke creates a home from the tarball and records a
  Conversation in it.
- **Mutation controls.** Each of these fails a test:
  - writing the global config;
  - renaming before the seed;
  - accepting an existing empty directory;
  - skipping the name check.

## Exclusions

- **A re-seed of an existing home** (the CLI's `seed --force`). It overwrites identity in a home that
  holds a person's work, so it is a separate decision.
- **Desktop's 0.3 home marker** (DS-005 condition b). The core does not know Desktop. The host writes
  its own marker after `createHome` returns.
- **Providers and keys.** Nothing is written to a `.env`. That is DS-005 phase 3, DS-004.
- No CLI change, no release.

## Validation

- typecheck, lint, `npm test` against DS3's baseline (3,567 passing, plus the local-only diagnose
  failure), and the package smoke;
- every new file committed **before** the final local run, because the retired-surface sweep reads
  only committed files, as DS3 learned;
- Core CI dispatched on the branch;
- DS1's isolation, with the production ledger read before and after.
