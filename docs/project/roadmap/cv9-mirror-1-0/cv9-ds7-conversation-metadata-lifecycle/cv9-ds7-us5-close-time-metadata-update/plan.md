# Plan — CV9.DS7.US5 Close-time Metadata Update

## Product Semantics

Close-time metadata update is finalization, not conservative maintenance.

At the moment a conversation closes, Mirror has the best available context for
user-facing metadata. Therefore Mirror should regenerate final metadata for
non-manual fields and preserve user-authored/manual fields.

## Execution Profile

Update the `close_time` profile to behave as a finalization profile:

- regenerate non-manual title when conversation has titleable substance;
- regenerate summary when conversation has summary-level substance;
- regenerate tags when conversation has tag-level substance;
- preserve manual title, summary, and tags;
- record update source as `close_time_metadata_finalization`.

## Implementation Plan

1. Update execution profile semantics for `close_time`.
2. Add close-time finalization call to the conversation close path.
3. Avoid duplicate/conflicting summary/title generation in `end_conversation`.
4. Ensure manual metadata remains preserved.
5. Add focused tests for:
   - missing/generated title finalized;
   - summary/tags generated at close;
   - manual title preserved;
   - manual summary/tags preserved where metadata indicates manual source;
   - provenance recorded.
6. Validate with focused/full tests.

## Out of Scope

- Per-message active refresh.
- First-exchange metadata initialization.
- Overriding manual metadata.
