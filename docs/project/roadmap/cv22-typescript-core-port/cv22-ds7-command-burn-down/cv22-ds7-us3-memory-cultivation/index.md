[< Parent](../index.md)

# CV22.DS7.US3 — Memory cultivation

**Status:** 🟡 Planned
**Type:** User Story

---

## Outcome

The `consolidate` and `shadow` command families are answered by the TS core.
Deterministic subcommands (reads, non-LLM writes, and the security-critical
identity-write allowlist) flip to TS unconditionally at parity, proven on
copies. The LLM/embedding-orchestration subcommands (`scan`, and
`consolidate apply`'s `merge`) run on TS behind the DS5 replay provider,
env-gated like `memories --search`/`consult`; the live call stays on Python
until DS8. Injection-fence helpers port now; live prompt-level resistance is the
DS8 boundary (the replay provider ignores the prompt), mirroring the extraction
precedent.

## Story Statement

As a Mirror user,
I want consolidate/shadow cultivation answered by the TS core at parity — with
the identity-write allowlist and shadow write preserved exactly —
So that the security-sensitive cultivation family burns down off Python with no
user-visible change and no reopened AI-findings.

## Acceptance Behavior

```text
Given a copied memory.db exercised through the front door
When the Navigator runs the cultivation commands via TS
Then rendered output and resulting DB rows/identity match the Python oracle
And an identity_update to a non-{self,ego} layer is refused loudly with no write
And shadow apply appends to the shadow layer and advances readiness at parity
And scan / consolidate-apply(merge) reproduce parity under the DS5 replay provider
And every write is backup-gated, redacted, with no real DB artifact
And deterministic flips are user-invisible; scan/consolidate-apply stay on
  Python unless the replay gate is set
```

## Scope

- New `ts/src/cultivation/` module (consolidation store model, cluster port,
  deterministic apply actions, scan-behind-replay orchestration).
- Identity-write allowlist port (`applyConsolidationIdentityUpdate`, self/ego
  gate, loud refusal, append).
- Shared `fenceUntrusted` primitive (refactored with `fenceTranscript`).
- `consolidate`/`shadow` sub-command routing (deterministic unconditional; scan/
  consolidate-apply replay-gated), backup-gated writes, string-exact renderers.
- Oracle-drift baseline entries + a `cultivation` real-DB-copy probe family.

## Out Of Scope

- Live provider/embedding call (DS8).
- Prompt-level injection-resistance template proof (DS8).
- New schema/migration (`consolidations` + `readiness_state` already exist, DS6).
- Sibling DS7 families: mirror-mode, extraction, Soul, Explorer, Ariad tree, ops
  tail.

## Validation

- TS unit/golden + replay-fixture tests in CI (cluster golden, allowlist
  allowed+refused, deterministic apply/reject/list/show, prefix resolution, scan
  under replay) + determinism gate + oracle-drift checker.
- Redacted real-DB-copy `cultivation` probe family.
- Per-family E2E smoke before each routing flip (deterministic + replay-gated).

---

## Artifacts

- [Plan](plan.md)
- [Test Guide](test-guide.md)
