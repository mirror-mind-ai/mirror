# Test Guide — CV20.DS6 Refinement Workbench And Flow

This guide will evolve as DS6 implementation stories land.

## Full DS Validation Target

A complete DS6 validation should prove this path:

```text
Builder activation shows Delivery and Refinement fields
Navigator creates RS
Navigator adds CRs
Navigator pulls RS
Builder selects CR
CR confirm -> plan -> implement -> validate -> done note
RS review -> coherence -> close
```

## Required Automated Gates

Before closing DS6:

```bash
uv sync --extra dev
uv run pytest tests/unit/ tests/integration/ -m "not live"
uv run ruff check src/ tests/
uv run ruff format --check src/ tests/
uv run mypy src/memory
git diff --check
```

Focused checks should be added by each child story. Expected areas:

```bash
uv run pytest tests/unit/memory/builder -q
uv run pytest tests/unit/memory/cli/test_build.py -q
uv run ruff check src/memory/builder src/memory/cli/build.py tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run ruff format --check src/memory/builder src/memory/cli/build.py tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run mypy src/memory/builder src/memory/cli/build.py
```

## Manual Dogfooding Route

Use two sessions.

### Session A: Sandbox lifecycle

Use the sandbox project to traverse the existing Ariad Builder lifecycle and
surface real friction.

Expected result: concrete Change Requests emerge from real use, not invented
planning.

### Session B: Mirror Builder Workbench

Activate Builder for `mirror-mind` and compose the target RS:

```text
Create Refinement Story: Builder lifecycle end-to-end refinement
Add CR: <observed requested change>
Add CR: <observed requested change>
Show RS: Builder lifecycle end-to-end refinement
Pull RS: Builder lifecycle end-to-end refinement
```

Expected observations:

- Builder renders visible Workbench / RS / CR surfaces.
- CRs remain associated with the RS in order.
- Pulling the RS enters Refinement Work, not Delivery Work.
- The active Builder state resumes the RS and current CR across Builder loads.

### CR Cycle Validation

For at least one CR:

```text
select CR
confirm CR
plan CR
implement CR
validate CR
mark CR done
```

Expected observations:

- Confirm names understanding, scope, risk, and done condition.
- Plan names implementation route and validation evidence.
- Implementation stays inside the CR boundary.
- Validation includes automated evidence and Navigator route when applicable.
- Done note records outcome and evidence.

### RS Closure Validation

After CR cycles:

```text
review RS
coherence RS
close RS
```

Expected observations:

- Review summarizes CR outcomes and patterns.
- Review does not mutate files directly.
- Debt or follow-up is recorded rather than implemented in review.
- Coherence checks Process, Project, Product, Workbench, docs, and tests.
- Close preserves CR outcomes and final RS state.

## Conscious Exclusions To Verify

The validation should confirm DS6 does not accidentally implement:

- Signal Field.
- Automatic CR clustering.
- Web Workbench UI.
- Full debt ledger/refactor loop.
- Release or push authorization.
- Method preference override resolution.
