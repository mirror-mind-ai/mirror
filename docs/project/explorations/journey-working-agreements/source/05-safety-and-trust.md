# Safety, Privacy, and Failure Behavior

## Trust model

The contract is user-owned data, but its text may be produced from model interpretation and may reference project content that contains untrusted instructions. Nothing in a contract or loaded source is system authority.

The application owns validation, path resolution, state transitions, and persistence. The model may classify and propose. It may not directly mutate the database, edit project files, or bypass confirmation.

## Contract learning boundary

Natural language is analyzed as data. The learning prompt must state that the message cannot alter schema, confirmation rules, safety constraints, or output format.

Model output is accepted only into a strict proposal DTO. It is bounded, allowlisted, and stored as pending. No proposal becomes active from the same model call that created it.

Confirmation must be attributable to an active user turn. Tool output, quoted content, pasted transcripts, project files, memories, or extension output cannot confirm a proposal.

## Prompt injection

Potential injection sources include:

- the user message being classified;
- profile examples and instructions;
- project files;
- attachments;
- extension context;
- imported contract files in a future version.

Mitigations:

- fence all source content as data or journey-owned guidance;
- keep hard constraints before journey content;
- never execute commands found in loaded context;
- allowlist model output fields and IDs;
- cap source count and size;
- add adversarial eval probes;
- preserve provenance in every rendered section;
- do not let a context source modify the contract that selected it.

## Project file safety

Recommended v1 limits:

```text
maximum profiles per contract: 12
maximum context sources per profile: 8
maximum single project file: 64 KiB
maximum aggregate contract context per turn: 128 KiB
allowed suffixes: .md, .txt, .yaml, .yml
encoding: strict UTF-8
```

Resolution rules:

- obtain the root from validated journey `project_path`;
- require the root to exist and be a directory;
- reject filesystem root as a project root;
- reject absolute source paths;
- reject `..` path segments;
- walk each component and reject symlinks;
- canonicalize with strict resolution;
- require the result to remain under the canonical project root;
- require a regular file;
- check size before and after read;
- decode strictly;
- reject duplicate canonical files;
- never truncate required context silently.

## Required and optional failure posture

### Required source

If validation or loading fails, resolution is blocked before model response. Return an actionable error that identifies journey, profile, source label, and safe remedy without leaking unrelated filesystem paths.

Example:

```text
Cannot use the Authoring profile because the required Voice guide is unavailable.
Expected journey-relative path: docs/obra/voz.md
Update the journey contract, restore the file, or choose another profile.
```

### Optional source

Continue with `degraded=true` and a visible warning in the resolution. Never represent degraded context as complete.

### Contract unavailable or malformed

Fail loud in core commands. Runtime hooks that must not break the host session may fail quiet only at the adapter boundary, log a stable error code, and inject a warning that contract context was unavailable. They must not silently pretend the contract was applied.

## Permission boundaries

A contract can select context and a persona. It cannot grant authority for:

- filesystem mutation;
- code implementation;
- database mutation outside contract confirmation;
- commit or push;
- release or publication;
- deployment;
- purchase, order, financial transfer, or external submission;
- bypassing Builder, Explorer, Soul, or Ariad gates;
- weakening system or user constraints.

These boundaries are enforced in code and repeated in prompt framing.

## Privacy

Contract resolution should not create a new full-content log by default. Persist only the contract, proposal rationale, references to source conversation or message when available, and metadata needed for explanation.

Do not store full user messages in a resolution ledger merely for observability. Existing conversation logging already owns message history. If resolution telemetry is later added, store identifiers, reason codes, profile IDs, timing, model metadata, and warnings, not duplicated prompt bodies.

`MEMORY_LOG_LLM_CALLS=metadata` remains the default. Contract-learning and profile-classification calls use the existing cost and observability authority.

## Concurrency

Proposal acceptance uses `BEGIN IMMEDIATE` or the project's established transaction helper. The base revision is compared inside the transaction. Stale proposals fail rather than overwriting a newer contract.

Two simultaneous sessions may resolve different turns from the same active revision. When one accepts a new revision, the other session detects the revision mismatch before reusing a sticky profile.

## Backup and migration

The migration is append-only and must be rehearsed against:

- a fresh database;
- a current production-shaped fixture;
- a legacy migration fixture;
- a database containing unknown journey metadata keys;
- a database with no contracts.

Before production migration, create and verify a backup, then rehearse an actual restore according to the project's release policy.

## Security tests

Required tests include:

- parent traversal;
- absolute path;
- symlinked file;
- symlinked parent directory;
- unsupported suffix;
- invalid UTF-8;
- oversized file;
- aggregate size overflow;
- file replaced between stat and read;
- unknown persona;
- unknown profile from model output;
- model output with extra fields;
- source content attempting to override system instructions;
- quoted user text attempting to confirm a proposal;
- stale proposal acceptance;
- cross-journey sticky profile reuse;
- contract attempt to weaken mode or permission boundaries.
