# Test Guide — CV9.DS7.US10 Web Historical Metadata Backfill Operation

## Automated

```bash
uv run pytest tests/unit/memory/web/test_operations.py tests/unit/memory/web/test_server.py -q
uv run pytest tests -q
```

## Navigator Validation

1. Open the web Operations surface.
2. Select Historical metadata backfill.
3. Run dry-run with safe mode and small limit.
4. Inspect candidate count and actions.
5. Run apply with force mode and small limit.
6. Confirm the run requires approval.
7. Approve.
8. Confirm backup path, changed/skipped/no-change evidence, and improved metadata.
9. Run an all-conversation force apply only after reviewing cost/risk.
10. Confirm long-run progress updates per conversation and final result details.
11. If no-change orphan or empty conversations remain, run Orphan conversation cleanup as dry-run.
12. Confirm candidate list, cleanup reasons, and approve apply only after backup/approval boundaries are visible.
13. Confirm deletion progress and final deleted count.
