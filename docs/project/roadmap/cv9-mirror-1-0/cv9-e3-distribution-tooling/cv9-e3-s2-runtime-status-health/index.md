[< CV9.E3 Distribution & Tooling](../index.md)

# CV9.E3.S2 — Runtime Status Health Checks

**Status:** ✅ Done  
**Epic:** CV9.E3 Distribution & Tooling

---

## User-Visible Outcome

Before planning a self-update, a user can ask Mirror for runtime status and see whether the local database migrations and installed extensions are healthy enough to continue.

The command remains simple:

```bash
uv run python -m memory runtime status
```

But the answer becomes safer: it no longer stops at version, git state, database existence, and extension names. It also says whether the core schema migrations are current and whether installed extensions have manifest or migration drift that needs attention.

---

## Problem

The current runtime status command is a good first diagnostic surface, but it does not yet inspect the two areas most likely to break a self-update:

- the core SQLite migration ledger;
- installed extension manifests and extension SQL migration ledgers.

A self-update dry-run that starts from this status would know that a database exists, but not whether it has every known core migration applied. It would know that extension directories exist, but not whether their manifests are valid, whether installed command-skill migrations are pending, or whether an applied migration file has drifted from its recorded checksum.

That is too shallow for update planning. The update path needs current state before target state.

---

## Scope

In scope:

- Add core migration health to `memory runtime status`.
- Add installed extension health to `memory runtime status`.
- Keep the human-readable output concise and deterministic.
- Return non-zero when migration or extension health needs attention.
- Cover the health calculations with unit tests.
- Update operational docs for the expanded status surface.

Out of scope:

- Applying migrations from `runtime status`.
- Creating `runtime update --dry-run`.
- Repairing extension installs.
- Changing the extension migration contract.
- Adding JSON output.

---

## Acceptance Criteria

- A healthy runtime reports core migrations as current.
- A database with missing core migrations reports attention needed.
- A missing or unreadable database reports attention needed without creating or mutating the database.
- Installed extensions with valid manifests and no pending migration drift report healthy.
- Invalid installed extension manifests are surfaced in runtime status.
- Command-skill extensions with unapplied migration files are surfaced as attention needed.
- Command-skill extensions with checksum drift in an already applied migration are surfaced as attention needed.
- Prompt-skill extensions without migrations do not create false warnings.
- Existing ready status behavior for clean git, configured mirror home, and existing database still works.

---

## See also

- [CV9.E3 Distribution & Tooling](../index.md)
- [Command Reference](../../../../../../REFERENCE.md)
- [Development Guide](../../../../../process/development-guide.md)
