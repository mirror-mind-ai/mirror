[< CV9.E3.S15](index.md)

# Plan — CV9.E3.S15 Release Promotion Checklist / Doctor

## Current State

Release promotion is documented as a process boundary: close the release arc, bump version, write release notes, pass CI and smoke validation, tag the version, then fast-forward `stable`. This worked manually for `v0.8.0`, but there is no read-only command that makes promotion readiness visible before someone starts mutating refs.

## Design

Add a small release doctor to `src/memory/cli/runtime.py` under the existing `runtime` namespace:

```bash
uv run python -m memory runtime release-doctor --target v0.9.0
```

The doctor returns a report composed of checklist items:

```text
Mirror runtime release doctor

Target: v0.9.0
Repository: /path/to/repo

[✓] git tree clean
[✓] package version matches target: 0.9.0
[✓] release note exists: docs/releases/v0.9.0.md
[✓] release index links target
[!] tag v0.9.0 is not created yet
[!] origin/stable does not contain HEAD yet

Release doctor result: attention needed
```

### Check model

Introduce a small dataclass:

```python
@dataclass(frozen=True)
class ReleaseDoctorCheck:
    name: str
    state: str  # pass | warn | fail
    detail: str | None = None
```

And a report:

```python
@dataclass(frozen=True)
class ReleaseDoctorReport:
    target: str
    repository: Path | None
    checks: tuple[ReleaseDoctorCheck, ...]
```

Result semantics:

- `pass`: required release readiness is satisfied;
- `warn`: not ready for completed promotion, but acceptable before the mutating promotion step, for example tag not created yet or stable not advanced yet;
- `fail`: unsafe or incoherent state requiring correction before promotion.

Exit code:

- `0` only if no `fail` checks exist;
- warnings are allowed because S15 is a pre-promotion doctor, not the final promotion verifier.

### Required checks

- repository exists;
- git tree is clean;
- `pyproject.toml` version matches target;
- `docs/releases/vX.Y.Z.md` exists;
- release note heading matches target;
- `docs/releases/index.md` references the target release note;
- tag target state:
  - tag absent: warn;
  - tag at HEAD: pass;
  - tag exists elsewhere: fail;
- stable containment state:
  - `origin/stable` missing or unfetched: warn;
  - `origin/stable` contains HEAD: pass;
  - `origin/stable` behind HEAD: warn, because S16 will advance it;
  - HEAD and `origin/stable` diverged or stable ahead: fail.

### Out of scope for this story

Do not create tags, push branches, fetch remotes, run tests, query GitHub Actions, or modify release notes. S15 only makes the preflight visible. S16 can implement the controlled promotion execution path.

## Test Approach

Use unit tests with monkeypatched git calls and temporary files:

- all local file checks pass with missing tag/stable warnings;
- dirty tree fails;
- version mismatch fails;
- missing release note fails;
- release index missing target fails;
- tag at HEAD passes;
- tag elsewhere fails;
- stable behind HEAD warns;
- stable diverged fails;
- CLI dispatch prints report and returns non-zero on fail.

## Documentation Updates

Update:

- `REFERENCE.md`, adding `runtime release-doctor` under release operations;
- story `index.md` result after validation;
- CV9.E3 index status after close;
- worklog after meaningful completion.

## Open Question

Should warnings produce exit code `0` or `1`? Current plan: warnings keep exit `0`, failures exit `1`. The rationale is that a pre-promotion doctor should allow a release candidate state where the tag and stable promotion are not done yet, while still making those missing steps visible.
