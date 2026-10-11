# Review — CV22.DS10.TS2

## Status

Reviewed

## Debt Findings

- PAID 1/4 - validator fork: the six inert .py fixture bodies cannot convert while Python-recorded goldens grade their bytes (Python's validator only resolves entrypoint.module to .py, so converting makes the oracle call the fixture invalid and the golden unregenerable). Reassigned to TS5, the same disposition this roadmap already gives ts/parity/, and the Zero Python gate row now states it. The gate's real requirement - CI needs no interpreter - is now MECHANICAL: a new CI step shadows python/python3/uv with stubs that exit 66 and runs the extension suites (41 pass, 3 shim tests correctly skip).
- PAID 2/4 - rollback evidence: test-guide route 7 executed against a worktree at 8bc3a31a~1, the last commit with the host present. The migrated extensions answered identically there, proving forward-compatibility and making the ordered revert (automation first, then core) safe. Contrast confirmed: on that core the unmigrated google-ads still spawned the Python host; on the current core it refuses without a process.
- CARRIED 3/4 - CR092 (RS010): the shim template resolves python3 from ambient PATH. Correct for the Navigator's own tooling, undecided for a third party. Owner US3.
- CARRIED 4/4 - CR093 (RS010): every documented Mirror invocation names a Python entry point that TS5 deletes - 245 call sites across 11 extension SKILL.md files, 6 materialized runtime copies, and REFERENCE.md. Navigator chose pay_now; payment was unavailable because no stable entry point exists yet (ts/package.json has no bin; mirror-ts is a Pi launcher; the only working form is relative to a dev checkout). Writing that form into another repository would be worse than the status quo. Owner US3, which is what creates the entry point. Original TS2 report under-scoped this at 2 files; the CR records the measured 245.

## Debt Decision

defer

## Defer Reason

The two carried items both depend on a stable npm-era entry point that does not exist until CV22.DS10.US3 defines it. Paying either now would hard-code a developer's working copy into documentation and extension repositories, which is strictly worse than the status quo it replaces. Both are captured as CRs against RS010 with owners, evidence, and measured scope, so neither is latent.

## Revisit Trigger

CV22.DS10.US3 defines the npm entry point - at which point CR093's 245 call sites and CR092's interpreter pinning both become writable with a command that will still exist after TS5.

## Missing Decision

- none
