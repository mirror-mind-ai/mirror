[< CV13](../index.md)

# CV13.E5 — Web Operations Runner

**Status:** ✅ Done
**Release target:** v0.15.0

---

## User-visible outcome

The web app can run a small allowlisted set of Mirror maintenance operations with clear descriptions, explicit parameters, dry-run where applicable, synchronous-first execution, and durable evidence of what happened. Job-based execution, streamed progress, cancellation, and long-running safeguards remain explicit follow-up work.

---

## Motivation

Mirror Web is moving from visibility toward responsible action. The user should not need to know terminal commands, flags, database repair paths, or runtime health routines to care for a local Mirror. At the same time, the web app must not become a generic command runner.

This epic introduces a guarded operations layer: operations are named, allowlisted, described, parameterized, validated, auditable, and eventually cancellable where possible. That layer gives users safer maintenance flows now and prepares the product architecture for future agentic web work. A future web agent should request capabilities through the same operation contracts rather than receiving raw access to the machine.

---

## Stories

| Code | Story | User-visible outcome | Status |
|------|-------|----------------------|--------|
| [CV13.E5.S1](cv13-e5-s1-operation-registry-and-dry-run-contract/index.md) | Operation registry and dry-run contract | The web API exposes a read-only catalog of allowed maintenance operations with metadata and parameter schemas | ✅ Done |
| [CV13.E5.S2](cv13-e5-s2-runtime-health-operation/index.md) | Runtime health operation | The user can run a read-only runtime health check from the web app and see structured results | ✅ Done |
| [CV13.E5.S3](cv13-e5-s3-backup-operation/index.md) | Backup operation | The user can create and verify a local Mirror database backup through an explicit operation flow | ✅ Done |
| [CV13.E5.S4](cv13-e5-s4-conversation-repair-dry-run-and-apply/index.md) | Conversation repair dry-run and apply | The user can preview and approve a bounded repair for conversations missing journey association | ✅ Done |
| [CV13.E5.S5](cv13-e5-s5-operation-job-history-and-audit-evidence/index.md) | Operation job history and audit evidence | Operation runs are recorded with status, parameters, timestamps, output summary, and errors | ✅ Done |
| [CV13.E5.S6](cv13-e5-s6-operations-runner-surface/index.md) | Operations Runner surface | The web app exposes runnable maintenance operations and recent audit history with explicit results | ✅ Done |
| [CV13.E5.S7](cv13-e5-s7-operations-surface-polish-and-release-coherence/index.md) | Operations surface polish and release coherence | Operation results, history, and safety boundaries are readable enough for the v0.15 release candidate | ✅ Done |

---

## Initial operation candidates

Early operations should be maintenance-oriented, explainable, and bounded:

- Runtime status and diagnosis, read-only.
- Backup and backup verification.
- Conversation journey-association repair, dry-run before apply.
- Single-conversation title suggestion or retitle where already supported by services.
- Batch conversation retitle only after dry-run, limits, audit evidence, and explicit approval exist.
- Conversation logger persistence health checks.

---

## Guardrails

- No arbitrary shell command execution.
- No user-supplied command strings.
- No raw database editor.
- No direct `.env` editing.
- No automatic git mutation in the initial epic.
- No runtime update execution until the operation contract, audit evidence, and recovery path are mature.
- Operations must be allowlisted in server-side code.
- Mutating operations must declare whether dry-run is supported or required.
- Parameters must be validated against operation-owned schemas before execution.
- Operation output must avoid leaking secrets or private environment values.
