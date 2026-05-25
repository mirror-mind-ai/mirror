# Template — extension repository layout

This directory is a **template**, not a runnable extension. It documents the
recommended layout for an extension's own repository, with placeholder files
that explain what each one should contain.

To create a new extension, copy this template into a new repository (or a
new directory under your extensions monorepo) and fill in the placeholders.

```bash
cp -R docs/product/extensions/template <extensions-root>/<id>
```

`<extensions-root>` is any directory you choose to host your extension
source trees (e.g. `~/Code/my-extensions/` — the framework does not
impose a location).

Then rename or edit:

- `skill.yaml.template` → `skill.yaml`
- `SKILL.md.template` → `SKILL.md`
- `extension.py.template` → `extension.py`
- `migrations/001_init.sql.template` → `migrations/001_init.sql`

Replace `<id>` everywhere with your extension's id (lowercase, dash-separated,
matches the folder name and `skill.yaml:id`).

## What to fill in

| File | Purpose |
|---|---|
| `skill.yaml` | Manifest. See [`../api-reference.md`](../api-reference.md). |
| `SKILL.md` | Prompt for the agent. One per runtime if they diverge. |
| `extension.py` | Entrypoint with `register(api)`. |
| `migrations/001_init.sql` | Initial schema. |
| `README.md` | Top-level entry point. What does this extension do? Top commands. |
| `docs/product/architecture.md` | Internal design and decisions. |
| `docs/commands.md` | Full CLI reference. |
| `docs/data-model.md` | Tables, columns, indices, FKs. |
| `docs/bindings.md` | Capabilities and binding instructions. |
| `docs/migrations.md` | History and strategy. |
| `docs/legacy-migration.md` | Delete if not migrating from older system. |
| `docs/persona-recipes.md` | Delete if not paired with specific personas. |
| `docs/user-stories/` | One file per story, `US-NN-<slug>.md`. |
| `docs/CHANGELOG.md` | Versioned change log. |
| `tests/` | Pytest tests using `memory.extensions.testing.api_for_test`. |

## What this template does not include

- A `pyproject.toml`. Add one only if the extension has Python dependencies
  beyond what the mirror provides.
- A CI workflow. Add one matched to your hosting (GitHub Actions, GitLab,
  etc.).
- License and contribution guidelines. Add the ones your repo uses.

## Style reminders

- Avoid proper nouns in identifiers and document titles. Banks, vendors,
  and file formats are parameters, not identity.
- Describe capabilities, not implementations. `runway` is fine;
  `calculate-runway-from-bills` is not.
- One subcommand per behavior. Compose, do not overload.
- Document the *why*, not only the *what*. Future you will thank present you.
