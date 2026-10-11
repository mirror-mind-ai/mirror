[< Story](index.md)

# Test Guide — CV22.DS4.US5

## Automated Validation

- **normalizeProjectPath:**
  - expands a leading `~` to the home directory;
  - returns an absolute path for a relative input;
  - resolves symlinks for an existing target (create a real tmp dir + symlink and
    assert the link resolves to the real path, matching Python `Path.resolve`);
  - falls back to the absolute (non-symlink) path for a non-existent input, without
    throwing.
- **Routing table:** `journey set-path` routes to `ts`; `journey update`,
  `journey status`, journey reads, and every other unported/mutating command still
  route to `python`.
- **Handler (against a DB copy):**
  - existing journey → `project_path` metadata is set to the normalized path,
    `updated_at` stamped, the resolved path returned/printed; other metadata keys
    preserved;
  - missing journey → `Error: journey '<slug>' not found.` on stderr, exit 1, no write.
- TS suite green (`node:test`), `tsc` / `biome` clean.

## E2E Decision

A **real front-door journey write** against a DB copy / dev database — a genuine
(non-fixture) end-to-end write, never against production.

## Navigator Validation

- **Route (dev copy):** take a backup, then
  `node frontDoor/cli.ts journey set-path <existing-slug> <dir> --db-path <copy>`.
- **Expected observation:** the resolved absolute path prints to stdout; the journey's
  `project_path` metadata is updated; a missing slug prints the not-found error and
  exits 1; `journey update` still routes to Python.
- **Pass condition:** the `project_path` is written exactly as Python would normalize
  it (expanduser + resolve), other metadata preserved, backup taken, fallback intact.
- **Fail condition:** a divergent normalized path, wrong/missing metadata update, no
  backup, wrong exit code, or an unported command wrongly routed to TS.

## Validation Evidence

Pending implementation and validation.
