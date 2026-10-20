# Validation — CV21.DS5.US3

## Status

Passed

## Automated Checks

- bash route.sh static (7 passed); npm test 3389/3392, 0 fail; typecheck; biome; checkDocLinks

Checks status: passed

## E2E

Decision: required

Evidence: Ten live sessions on the registry's mirror-mind@0.36.0 (claude 2.1.304, codex 0.163.0, agy 1.4.3, grok 1.0.62): review-copy and hello on all four, each read from the scratch ledger, ext_hello_pings, and conversations; test-guide.md Validation Evidence, evidence/table.tsv

## Navigator Validation

Route: The route's steps 0-6 as test-guide.md writes them; the Navigator ran the three logins, trust codex, and the Grok TUI probe; the Driver ran setup, probe, install, wire, the headless sessions, verify, clean, and untouched, with every reading in evidence/table.tsv

Navigator accepted: yes

Expected observation: On each of the four runtimes: ext-review-copy and ext-hello listed after the printed steps and not before; +1 consult call and a report carrying the ledger's model id per review-copy session; +1 ping with the cell's canary per hello session; the runtime's interface on its probe conversation; untouched passing

Pass condition: Every read as stated, or a miss diagnosed and captured: CR151, CR152, CR153 captured and decided to be fixed in their own Change Requests

Fail condition: A skill not listed after the printed steps, a session whose work is missing from the ledger or the ping table without a diagnosis, a cell that searched the disk, or a changed real configuration entry attributable to the route

## Missing Evidence

- none
<!-- ariad-seal sha256:5085f46200a96b1447c38aa183e7398f4af9138bebabc569681504523e093ad6 — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
