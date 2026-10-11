[< Refinement Campaign](index.md)

# RS005 — Security audit of the front door and data surfaces

**Lens:** security-engineer · **CRs:** CR030–CR035 (6) · **Status:** complete

> *Security audit of the CV22 front door and data surfaces (authored by the security-engineer persona).*

## Framing

The adversarial lens. The asset under protection is unusually sensitive — a
Mirror database *is a person*: identity, memories, journal, decisions — and DS4
put a new code path (the TS front door) with **write access** on top of it,
invoked by an LLM agent. Threat model: manipulated agent input, poisoned
filesystem state (symlinks, traversal), data-at-rest exposure on shared machines,
sensitive-data leakage through fixtures/logs, and supply chain. Positive ledger:
parameterized SQL throughout, `tmp/` gitignored, redaction-by-default harness
output, opt-in-only sensitive debug, and **zero runtime npm dependencies** — the
local-first architecture is itself the strongest control.

## Change requests

### CR030 — Harden the copy-only and backup guards — `007ba69`
**Problem.** `assertCopyTarget` checked the *unresolved* path string, so a symlink
named `copy.db` under `tmp/` pointing at a live `memory.db`, or a `tmp/..`
traversal, defeated it. **Resolution.** The guard now `lstat`-refuses symlinked
targets and `realpath`-resolves before checking basename and `tmp` segment;
`requireBackup` refuses a symlinked backup path so the hash pin can't be
redirected after verification. Both bypasses are covered by tests. *(Also cleared
a long-standing lint warning in `backupGate.ts`.)*

### CR031 — Data-at-rest permissions posture — `760c546` (+ `9eef942` TS)
**Problem.** Nothing anywhere set restrictive permissions — the database, backups,
fixtures, and sidecars followed the umask (commonly world-readable) on shared
machines. **Resolution.** Owner-only posture (dirs 0700, files 0600) enforced at
creation points: the Python connection bootstrap chmods directories it creates
and the DB file (never mutating pre-existing user directories); the TS backup
writes `backups/` 0700 and the snapshot 0600; the parity harness work dir is
owner-only. `runtime diagnose` reports loose permissions with the exact `chmod`;
REFERENCE documents the posture and the Windows-ACL deferral.

### CR032 — Identity-poisoning threat model + audit gap — `a20616d`
**Problem.** `identity set` lets an agent overwrite identity content, which feeds
*future system prompts* — persistent prompt injection surviving sessions and
runtimes — and identity mutations leave no forensic trail. **Resolution.** An
abuse-cases section in the runtime-interface spec names identity poisoning,
journey-path redirection, and content-mediated injection, states the current
mitigations honestly (permission gates, user-invocable skills, pre-write
snapshot) and their limits, and records the direction: metadata-only front-door
logging (CR026) as the interim trail, mutation-provenance columns as post-CV22
work gated on the CR019 custody transfer. *The product's signature attack, now
with a named defense posture ahead of the DS6 MCP server.*

### CR033 — Security riders for planned work — `1b80715`
**Problem.** Three requirements were cheapest to attach before the work is
planned. **Resolution.** A Security Riders section in the [CV22 index](../index.md)
records them where DS5/DS6 planning will read them: front-door logging must never
record content payloads (a redaction test is acceptance criteria for CR026); DS5
API keys must come from env/config only (never argv/logged, fixtures scrubbed);
the DS6 MCP server requires a threat model (binding, authn, per-tool scoping)
before implementation.

### CR034 — Parity-fixture sensitivity hygiene — `26f0b0e`
**Problem.** The real-DB-copy harness left the copied database and fixture JSON —
both equivalent to the live database — lying under the work dir after every run.
**Resolution.** The harness removes the work dir on a passing run and retains it
(stated) on failure or with a new `--keep` flag; the argparse epilog and the
REFERENCE data-at-rest section name the copy/fixture as live-database-equivalent.
Owner-only permissions already landed with CR031; sensitive-debug stays opt-in.

### CR035 — Make the supply-chain posture explicit — `acec919`
**Problem.** Zero runtime npm dependencies was the TS core's best security
property but existed only by accident. **Resolution.** It is now policy in the
[engineering principles](../../../../process/engineering-principles.md) (new runtime
deps require justification + security review); [Decisions](../../../decisions.md)
records the deliberate acceptance of tag-pinned first-party CI actions with
revisit triggers (third-party actions, or DS6 release credentials in CI).
