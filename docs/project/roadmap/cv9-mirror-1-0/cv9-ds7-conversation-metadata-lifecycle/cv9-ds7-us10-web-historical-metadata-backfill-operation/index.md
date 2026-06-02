# CV9.DS7.US10 — Web Historical Metadata Backfill Operation

**Type:** User Story
**Status:** Done
**Parent:** [CV9.DS7 — Conversation Metadata Lifecycle](../index.md)

## Story

As a Mirror user with legacy conversations, I want to run metadata backfill from
the web Operations surface so I can repair old titles, summaries, and tags
without using the CLI.

## Scope

- Add a runnable web operation for historical metadata backfill.
- Support dry-run preview and apply.
- Support `safe` and `force` modes through a dropdown.
- Support all-conversation batches, bounded limits, journey filters, and resume-oriented scopes.
- Require approval before mutating apply.
- Create a backup before apply.
- Return changed/skipped/no-change evidence per conversation.
- Expose approval-gated cleanup for short no-change orphan records and empty conversation shells discovered during production backfill.

## Acceptance Behavior

```gherkin
Given I open Operations
When I run Historical Metadata Backfill as dry run
Then Mirror previews candidates without mutation

Given I reviewed the preview
When I apply the operation
Then Mirror requires approval before mutation
And creates a backup
And applies the selected mode with changed/skipped evidence

Given a long backfill has already run
When I choose the not-backfilled or no-change latest-run scope
Then Mirror limits the batch to the selected recovery/review set

Given orphan or empty no-change conversations are visible
When I run cleanup as dry-run
Then Mirror previews deletion candidates with cleanup reasons and without mutation
And when I approve apply
Then Mirror creates a backup and deletes only the selected orphan candidates
```
