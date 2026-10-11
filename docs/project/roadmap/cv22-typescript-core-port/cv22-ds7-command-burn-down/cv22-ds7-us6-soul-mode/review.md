# Review — CV22.DS7.US6

## Status

Reviewed

## Debt Findings

- Four findings, three captured as Change Requests under RS010 and one deliberately not: CR069 - soul apply with an unknown --conversation-id or --journal-id raises sqlite3.IntegrityError through a CLI that catches only ValueError, so the most intimate surface in the product answers a bad argument with a stack trace. CR070 - soul rite accepts --listening-for and nothing consumes it; the flag and the dead defaults entry promise a situated listening focus the card never renders. CR071 - the three skill copies duplicate every invocation (60 for mm-soul), so each remaining CV22 flip pays the same manual tax and a missed copy silently leaves one runtime on Python; this is the CR059 defect in a different costume and it gets worse at US7 and US8. NOT captured: the read-modify-write race on runtime_sessions.metadata is pre-existing, identical in both cores, and Soul's commands are sequential within a session, so a CR would record a hazard nobody can currently reach - recorded here instead. Also carried in the story record rather than as debt: the port accepts --mirror-home where Python refuses it (accepted superset, decisions.md), and the validation sheet defect that reported five passes while measuring nothing.

## Debt Decision

defer

## Defer Reason

All three are adjacent to the port rather than in it: two are Python-side behaviors the TypeScript core reproduces faithfully and must not unilaterally change, and the third is a distribution-shape decision that belongs with whoever chooses how skills ship. Fixing any of them inside a burn-down story would mean changing product behavior or packaging under cover of a port.

## Revisit Trigger

CR069 and CR070 when either core next changes soul behavior for a reason of its own, or at DS10 when the Python surface is retired and the choice collapses to one core. CR071 before DS7.US8 pulls the Builder tree - the largest skill surface in the product - because that is the flip where a missed copy is most likely and most expensive.

## Missing Decision

- none
