# Plan — CV20.DS12.US2

## Objective

Make Builder honor the document-first authority decision at both conversational and
orientation surfaces. When `docs/project/refinement/index.md` exists, Builder points to
that file without reading or presenting personal SQLite Workbench rows. During an
already-authorized mutable operation, it repairs deterministic structural defects and
reports them; it stops only when continuing would choose meaning or exceed the original
intent.

## Why This Slice Exists

TS1 established the file contract, US1 proved it manually, and TS2 classified SQLite as
compatibility-only local state. Builder guidance and entry surfaces still describe the
legacy database as if it were current project state. This story removes that behavioral
contradiction without creating a Markdown runtime or migrating legacy data.

## Scope

### 1. Authority detection and orientation

- Detect only the explicit relative path `docs/project/refinement/index.md` beneath the
  trusted journey project root.
- When the file exists, Builder Home/Orientation and Builder Resume identify project
  files as the Refinement authority and point to the relative index path.
- Do not query the legacy Workbench snapshot on that file-first path.
- Do not parse RS/CR status into runtime state. The skill reads the canonical document
  after activation.
- When the path is absent, preserve the existing SQLite-backed surfaces and commands.

The Python change is a bounded compatibility correction to a currently misleading
surface, not a new Refinement subsystem. It must not add document parsing, lifecycle, or
persistence to the frozen Python core.

### 2. Conversational routing

Update `.pi/skills/mm-build/SKILL.md` so ordinary requests to inspect, capture, select,
or continue Refinement first check the canonical path:

- present: read and work through the project documents;
- absent: retain the existing legacy command guidance;
- present but unreadable or semantically ambiguous: never fall back to SQLite.

Keep the root index as the sole status/focus/order authority. Linked RS/CR documents own
narrative and evidence only.

### 3. Smooth repair policy

For a read-only request, report defects without mutating files.

For an already-authorized mutable operation, repair without another confirmation only
when the repair is all of:

- necessary for the requested operation;
- deterministic and supported by existing project evidence;
- local to the involved Refinement documents;
- non-destructive and reversible through Git;
- meaning-preserving;
- free of status, priority, focus, identity, SQLite, configuration, commit, push, or
  publication decisions not already authorized.

Afterward, explain in Navigator-facing language what was found and repaired. Stop,
recommend the smallest safe solution, and ask for a decision only when repair would
choose meaning, remove content, resolve a concurrent conflict, or expand the request.
Do not expose internal Mirror terminology as the primary explanation.

### 4. Operational documentation

Update `REFERENCE.md` to describe the file-first authority check, the bounded repair
policy, and the compatibility-only legacy commands when the canonical index is absent.
Do not remove the command reference while supported databases may still rely on it.

## Intended Implementation Footprint

- `.pi/skills/mm-build/SKILL.md`
- `REFERENCE.md`
- `src/memory/builder/home_surface.py`
- `src/memory/builder/resume_state.py`
- `src/memory/builder/resume_surface.py`
- the smallest required call-site adjustment in `src/memory/cli/build.py`
- focused unit/CLI tests for authority routing and legacy preservation
- this story package and necessary parent roadmap status evidence

Any need to change Workbench commands, storage, migrations, TypeScript schema handling,
or canonical Markdown contents is a scope change and must stop implementation.

## Non-Goals

- Parse or validate the Markdown backlog in Python.
- Mirror canonical focus/status into a runtime cursor.
- Compare, reconcile, migrate, export, freeze, or delete legacy rows.
- Dual-write files and SQLite.
- Add watchers, manifests, projections, recovery journals, or Git protocols.
- Change TypeScript Workbench schema recognition.
- Implement CR001, CR002, or CR004.
- Commit, push, merge, release, or publish without the corresponding explicit boundary.

## Acceptance Behavior

```text
Given a trusted project with docs/project/refinement/index.md
And legacy SQLite contains different or stale Refinement state
When Builder loads or handles an ordinary Refinement request
Then it identifies project files as authoritative
And it does not inspect, display, or mutate legacy Workbench rows
And it directs the agent to the canonical relative path

Given a project without docs/project/refinement/index.md
When Builder loads or handles a Refinement request
Then the shipped SQLite Workbench behavior remains available

Given a read-only file-first request encounters a structural defect
When Builder explains the result
Then it does not mutate files
And it describes the practical problem and a concrete correction

Given an authorized mutable file-first operation encounters a deterministic local defect
When the repair preserves meaning and stays within the request
Then Builder repairs it without a second authorization prompt
And reports what it repaired after completing the operation

Given repair would choose status, priority, focus, identity, deletion, or conflict meaning
When Builder cannot continue safely
Then it recommends the smallest safe solution and asks for the missing decision
And it does not fall back to SQLite
```

## Implementation Sequence

1. Add failing tests proving a canonical index suppresses SQLite snapshot inspection and
   changes both orientation and resume copy while an absent index preserves legacy output.
2. Introduce the smallest explicit-path authority check and pass that result to the two
   presentation paths without parsing the document.
3. Update the Builder skill routing and repair policy.
4. Update `REFERENCE.md` while preserving the legacy command reference.
5. Run focused tests, lint/type checks for changed Python, documentation checks, and the
   Navigator-visible route.

## Validation Route

### Automated

- Focused unit tests for Home/Orientation, resume-state composition, resume rendering,
  and CLI load behavior.
- Existing Workbench tests proving the absent-index compatibility path remains intact.
- Ruff and targeted mypy for changed Python modules.
- `python scripts/check_doc_links.py` and `git diff --check`.
- Story-scoped changed-path review confirming no storage, migration, TypeScript, or
  canonical Refinement backlog files changed.

### E2E decision

**Required.** This is a user-visible routing change spanning runtime orientation and an
agent skill contract.

### Navigator-visible E2E

1. Reload the updated skill in a session bound to this project.
2. Load Builder and observe that Refinement names
   `docs/project/refinement/index.md` as authority rather than showing SQLite RS/CR state.
3. Ask to inspect current Refinement work; Builder reads the canonical index and reports
   RS001/CR focus from files without invoking Workbench commands.
4. Exercise a bounded mutable file-first operation or a disposable fixture equivalent;
   when an unambiguous structural repair is needed, Builder completes it and reports the
   repair rather than requesting redundant authorization.
5. In a fixture without the canonical index, confirm legacy guidance remains available.

Pass: all five behaviors hold and no personal Workbench row is read or changed on the
file-first path. Fail: SQLite appears as competing authority, silent fallback occurs,
read-only intent mutates files, safe repairs cause unnecessary ceremony, or semantic
choices are made without the Navigator.

## Stop Conditions

- Implementing the route requires parsing canonical RS/CR state in Python.
- A proposed repair is destructive, ambiguous, or changes project meaning.
- The implementation needs storage, migration, TypeScript schema, or command changes.
- Existing legacy behavior cannot be preserved for projects without the canonical index.
- Required checks fail without a clear story-local fix.

## Approval Gate

- Active checkpoint: `after_plan`.
- Implementation remains blocked until Navigator approval.
