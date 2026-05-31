[< CV9.DS7.US3](index.md)

# Test Guide — CV9.DS7.US3 Metadata Lifecycle Operation Report

## Acceptance Behavior

```text
Given a controlled fixture conversation and explicit metadata lifecycle apply values
When the Navigator runs the metadata lifecycle operation in preview or apply mode
Then Mirror reports changed and skipped fields in an inspectable operation report
And manual/user-edited title locks and refine_candidate decisions are not overwritten automatically
```

## Automated Validation

Expected focused tests:

- CLI apply command prints JSON operation report;
- report includes `mode`, `mutated`, `changed`, `skipped`, and `dry_run`;
- manual title locks are preserved;
- `refine_candidate` title decisions are skipped;
- apply requires explicit command and values;
- preview/dry-run remains non-mutating.

## Navigator Validation Route

Run one controlled demo command. It creates fixture conversations internally and
does not touch production data:

```bash
uv run python -m memory.cli.conversations --metadata-lifecycle-demo
```

Expected observation:

- JSON report prints demo scenarios;
- preview/dry-run scenario shows `mutated: false`;
- apply scenario shows `changed` and `skipped` fields;
- manual-lock scenario skips title overwrite;
- refine-candidate scenario skips automatic title apply;
- report includes an overall pass indicator.

Pass condition:

Navigator can validate metadata lifecycle apply behavior through a one-command
operation report without inspecting private service internals or creating manual fixtures.

Fail condition:

The operation hides changes, mutates candidate decisions, overwrites manual
locks, or requires private service-level inspection to understand what happened.
