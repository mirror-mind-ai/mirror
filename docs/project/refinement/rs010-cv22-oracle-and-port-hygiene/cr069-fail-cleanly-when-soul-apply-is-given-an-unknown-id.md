[< RS010](index.md)

# CR069 — Fail cleanly when `soul apply` is given an unknown id

**Status:** captured
**RS:** RS010
**Driver:** —
**Delivery:** —

## Problem

`identity_integrations` carries real foreign keys to `conversations` and
`memories`. `cmd_apply` (`src/memory/cli/soul.py`) catches only `ValueError`:

```python
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)
```

So `soul apply self --proposed "..." --confirm APPLY --conversation-id nope`
raises `sqlite3.IntegrityError: FOREIGN KEY constraint failed` uncaught, and the
user gets a traceback. Every other refusal in this command — unsupported layer,
missing `--confirm`, empty content, persona without `--key` — prints a clean
`Error: ...` line and exits 1.

## Expected Behavior

An unknown conversation or journal id is refused the way every other bad
argument is: one `Error: ...` line naming the id that does not exist, exit 1,
and nothing written. The identity document must not move either — the
integration row and the document append are one logical write.

## Impact

Low frequency, poor manners, and one sharp edge. Soul Mode is the most intimate
surface in the product, and the moment it fails it should not answer with a
Python stack trace. The sharp edge is ordering: the audit row is inserted before
the document is appended, so a caller has to trust that a failed insert left
nothing behind rather than see it stated.

## Plan Or Decision

Catch the integrity error at the CLI boundary and render it as a refusal, or
validate the ids before writing. Prefer whichever keeps the two writes in one
transaction, and say which rule won in the code.

The TypeScript port reproduces the behavior rather than correcting it
(`ts/src/soul/apply.ts`), because a port is not the place to decide a refusal's
wording. Both cores should change together.

## Evidence

Found while building the CV22.DS7.US6 golden: the first fixture used provenance
ids that did not exist and the generator died on
`sqlite3.IntegrityError: FOREIGN KEY constraint failed` raised through
`add_identity_integration`. The fixture now seeds real rows; the defect was left
in place.

## Outcome

_Pending._

## Provenance

Found during CV22.DS7.US6 plateau 4 and captured at that story's Debt Review on
2026-09-08.
