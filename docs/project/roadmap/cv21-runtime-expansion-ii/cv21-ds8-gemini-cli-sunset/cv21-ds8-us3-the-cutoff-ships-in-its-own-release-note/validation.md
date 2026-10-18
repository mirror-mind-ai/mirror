# Validation — CV21.DS8.US3

## Status

Passed

## Automated Checks

- build then npm test 3308/3308 (3 pre-existing skips); buildClaudePlugin --check in sync (plugin.json 0.35.0); checkRetiredSurfaces clean (the literal skills-link command tripped the row once, rephrased, no exemption); checkDocLinks clean; biome clean; release:doctor on the dirty tree: only the two expected non-passes (tree dirty, tag absent) plus origin/stable behind HEAD; mirror runtime release-notes latest renders v0.35.0

Checks status: passed

## E2E

Decision: not_required

Evidence: The release route (release:promote, the trusted publisher's workflow, the GitHub Release) is the E2E and runs after Done on the Navigator's word; release:doctor proves the commit will be accepted. Probe 1 measured: Gemini CLI 0.61.0 skips a missing hook command in silence (headless, with a control hook proving hooks fire). Probe 2 not measured: agy needs an interactive OAuth login; probe-agy-skills.sh in the package is the route.

## Navigator Validation

Route: 1) read v0.35.0's cutoff section as a Gemini CLI user: keep/removed/why/instead/still works/if you do nothing/the pin, each sourced or 'not measured'; 2) Getting Started's Antigravity section and the troubleshooting entry carry the un-wiring guidance; 3) release:doctor shows only the expected non-passes; 4) the version is one number in package.json, plugin.json, the releases index; 5) DS8 reads Done with v0.35.0 in its index and the CV21 roadmap

Navigator accepted: yes

Expected observation: The cutoff answers every question a Gemini CLI user has before the update happens to them; the guidance is where a user with a failing hook looks; the release commit will pass the doctor; DS8 closes with its release boundary

Pass condition: All five observations as the test guide states

Fail condition: An answer missing or guessed; the guidance names the deleted path or needs an exemption; the doctor fails on anything but tree-clean and the tag; a version copy lags; DS8 still reads In Progress

## Missing Evidence

- none
<!-- ariad-seal sha256:12c1a7173246c7fa47ddcf65b59ff33fe1ef81107b13cbfc8dcf55314cb1f576 — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
