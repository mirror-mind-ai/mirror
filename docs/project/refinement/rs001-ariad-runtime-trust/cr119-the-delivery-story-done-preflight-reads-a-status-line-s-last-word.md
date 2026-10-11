[< RS001](index.md) · [Canonical status](../index.md#change-requests)

# CR119 — The Delivery Story Done preflight reads a status line's last word

## Problem

`done-delivery-story` runs an authored roadmap closure preflight before it mutates
anything (CR016): the Delivery Story's package, every child package, and every status
table row for those codes must be Done. The test is `isDone` in
`ts/src/builder/deliveryStoryRoadmapClosure.ts`:

```ts
function isDone(status: string): boolean {
  return pyStrip(status).toLowerCase().endsWith("done");
}
```

It reads the whole `**Status:**` line, or the whole table cell, and passes it only when
its last word is `done`. So the authored forms this repository uses are refused:
`✅ Done · 2026-05-11`, `Done — Navigator validated 2026-07-16`, `✅ Done — 2026-09-25.
Pulled 2026-09-23; …`, `✅ Done (2026-09-08). …`. The refusal says `package status is
not Done` or `table row CVx.DSy is not Done`, which is not the reason: the package is
Done, with a date after the word. And `Not done` passes.

## Expected Behavior

The preflight reads the status the author declared, the first clause of the line
([CR103](cr103-candidate-and-position-rows-print-a-package-s-entire-status-line.md)'s
reading, `statusClause`), and passes it when that clause's status word is Done:
`✅ Done · 2026-05-11` passes, `✅ Done` passes, `Done` passes, `Not done` does not, and
`🟡 Planned — Done condition pending` does not. Its refusal names a package or row whose
declared status is not Done, and nothing else.

## Impact

A Delivery Story in Delivery Story flow whose packages are marked Done with a date or a
note cannot close through `done-delivery-story` until every such line is rewritten to
end in `done`, and the card tells the Navigator the packages are not Done. On this
repository's roadmap at `548e70a2`, 47 of the 320 statuses whose first clause is Done
would be refused. It is a refusal naming a wrong reason, CR020's class, on the gate that
protects history.

## Plan Or Decision

Pending. Captured 2026-10-04 while characterizing CR103, which found that every
Builder reader of a status line read it whole; the rows and the classifiers behind
them take CR103's clause, and this gate is left to its own change, outside the floor
(CR103's D4). The plan should read the clause through `statusClause`, so that the gate
and the rows cannot read one line two ways, and decide the test on the clause: `ends
with done` on the clause still passes `Not done`, so the test is the clause's status
word, after any leading glyph. Both readers of the gate take it: the package line
(`STATUS_LINE_RE`) and the table cell (`statusTableRows`). The `isDone` row of the
`builder-lifecycle` and `builder-command` goldens, if any records a refusal, is the
ledger's.

## Evidence

- `ts/src/builder/deliveryStoryRoadmapClosure.ts`, `isDone`, at `548e70a2`.
- A script over every `index.md` under `docs/project/roadmap` at `548e70a2`: of the 320
  `**Status:**` lines whose first clause is Done, 47 do not end with `done` (CR103's
  characterization).
- `Not done`, `Done` under `pyStrip` and `toLowerCase`, ends with `done`.

## Outcome

Pending.
