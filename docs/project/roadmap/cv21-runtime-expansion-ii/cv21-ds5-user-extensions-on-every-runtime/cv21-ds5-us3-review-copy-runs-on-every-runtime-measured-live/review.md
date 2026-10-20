# Review — CV21.DS5.US3

## Status

Reviewed

## Debt Findings

- Product, found by the route, already decided by the Navigator to be fixed in their own Change Requests: CR151 (the transcript backfill fills conversations by time window), CR152 (codex exec never runs the plugin's async Stop and SessionEnd to Mirror), CR153 (a home's Pi backfill imports another home's sessions). Route-internal, small: (1) the hello fixture is a verbatim copy of the authoring guide's listings and nothing guards the two from drifting — static could re-extract and diff; (2) Codex's and agy's headless output name no model, so versions.tsv says 'not reported'; (3) route.sh copies TS1's helpers (keep, row, config_manifest, clean) rather than sharing them, two live routes now duplicate them; (4) table.tsv keeps superseded readings beside their corrections by design, so it reads noisily — test-guide.md carries the summary.

## Debt Decision

defer

## Defer Reason

US3 introduced no product debt: it changed no product code. The three product defects it found are captured and decided to be fixed in their own Change Requests; the route-internal items are small and each has a natural later home — the fixture guard in TS4, which edits the authoring guide next; the model ids a runtime limit DS11's matrix may record; the shared helpers when a third live route exists; the table's superseded readings kept by design.

## Revisit Trigger

CR151, CR152, or CR153 is pulled; TS4 edits the authoring guide (add the re-extract-and-diff to static); DS11 builds the parity matrix (record the headless model ids or their absence); a third live route is written (extract the shared helpers).

## Missing Decision

- none
<!-- ariad-seal sha256:4942797c431e188555fc1817fae11492595b2e5a63749554df68df808dd3a9f1 — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
