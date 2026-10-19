# Review — CV21.DS5.US2

## Status

Reviewed

## Debt Findings

- Six findings. Paid in the story: (1) the canonical plugin's Claude Code step gained mkdir -p ~/.claude/skills (wiring.ts, diagnose's relink route, Getting Started, the contract; tests pin it); (2) Codex's cache reader: measured on 0.163.0 that codex plugin add replaces the cache directory, so newest is the only entry; recorded in the reader's comment, no change needed; (6) the report block names installed extensions with no claude block as 'not carried', golden appended by hand. Deferred: (3) the canonical plugin has no agy copy finding; agyPluginCopyState now exists to serve it. No action: (4) sync regenerates from the home's own catalog, a deliberate fit recorded in the contract; (5) the golden edited by hand with the tree as a documented divergence, per the goldens README rather than amendment 11's re-pin.

## Debt Decision

defer

## Defer Reason

The one carried item, the canonical plugin's missing agy finding, belongs with the contract refresh that touches every runtime's row; the reader it needs exists. The three paid items are in the story's own commits; the two no-action items are recorded where they act.

## Revisit Trigger

DS11's contract and docs refresh, or the first agy copy of the canonical plugin found behind an npm update.

## Missing Decision

- none
<!-- ariad-seal sha256:6ed3e904e0d173434073c8d811e05d8a844406b3d28e0efb2ff3feafe02409bd — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
