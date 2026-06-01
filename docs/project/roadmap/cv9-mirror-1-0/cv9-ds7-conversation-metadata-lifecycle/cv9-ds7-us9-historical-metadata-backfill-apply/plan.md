# Plan — CV9.DS7.US9 Historical Metadata Backfill Apply

## Scope

Add an explicit historical metadata backfill apply route that mutates selected
conversation metadata using execution profiles.

## CLI Route

Safe mode:

```bash
uv run python -m memory.cli.conversations \
  --metadata-backfill-apply \
  --metadata-backfill-mode safe \
  --limit 10
```

Force mode:

```bash
uv run python -m memory.cli.conversations \
  --metadata-backfill-apply \
  --metadata-backfill-mode force \
  --limit 10
```

## Rules

- Apply is explicit and bounded by `--limit`.
- Safe mode applies only profile-ready fields.
- Force mode regenerates title, summary, and tags for selected conversations while preserving manual locks by default.
- The command returns JSON evidence with changed/skipped results per conversation.
- Preview remains non-mutating.
- Production use should be preceded by backup.

## Validation

- Unit tests for safe apply.
- Unit tests for force apply.
- CLI test for JSON report.
- Manual validation on a small limit before broader backfill.
