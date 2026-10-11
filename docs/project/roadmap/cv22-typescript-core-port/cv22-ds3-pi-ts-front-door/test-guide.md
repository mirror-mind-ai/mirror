# Test Guide — CV22.DS3 Pi TS Front Door

## Automated Validation

From the `ts/` package:

```bash
cd ts
npm run typecheck
npm run lint
npm test
```

If Python fallback code or wrapper scripts are touched, run the focused Python checks from repository root:

```bash
uv run pytest <focused test path>
```

Always run:

```bash
git diff --check
```

## Front-Door Validation Route

Generate a portable synthetic demo DB from repository root:

```bash
uv run python ts/parity/generate_demo_memory_db.py --out tmp/parity/ds3-demo-memory.db
```

Exercise DS2-ported read commands through the TS front door:

```bash
NODE_OPTIONS=--no-warnings node ts/src/frontDoor/cli.ts journeys \
  --db-path tmp/parity/ds3-demo-memory.db
NODE_OPTIONS=--no-warnings node ts/src/frontDoor/cli.ts memories \
  --db-path tmp/parity/ds3-demo-memory.db --limit 2
```

Exercise a Python fallback command through the same front door:

```bash
NODE_OPTIONS=--no-warnings node ts/src/frontDoor/cli.ts runtime version
```

Inspect routing coverage through tests:

```bash
cd ts
npm test -- test/frontDoor/routing.test.ts
```

## Expected Observation

- Ported read command returns compatible observable output through the TS route.
- Unported command returns compatible observable output through Python fallback.
- Runtime does not ask the user to choose Python or TS.
- Write/state-mutating commands remain on Python fallback.

## Pass Condition

- Automated checks pass.
- Front-door routing tests prove TS route for allowlisted DS2 reads and Python fallback for everything else.
- Smoke/dogfood route passes through the same dispatch code.
- No unvalidated write path is routed to TS.

## Fail Condition

- Any unported command routes to TS by accident.
- Any write/state-mutating command routes to TS.
- Fallback changes stdout/stderr/exit-code behavior unexpectedly.
- User-visible command names or language-selection behavior changes.

## Validation Evidence

Automated TS core checks:

```bash
cd ts
npm run typecheck
npm run lint
npm test
```

Result: passed with 56 tests.

Pi extension TypeScript check:

```bash
cd .pi
npm ci
npx tsc --noEmit
```

Result: passed. `npm ci` reported existing dependency advisories in Pi dependencies but installed successfully.

Front-door smoke route:

```bash
uv run python ts/parity/generate_demo_memory_db.py --out tmp/parity/ds3-demo-memory.db
NODE_OPTIONS=--no-warnings node ts/src/frontDoor/cli.ts journeys --db-path tmp/parity/ds3-demo-memory.db
NODE_OPTIONS=--no-warnings node ts/src/frontDoor/cli.ts memories --db-path tmp/parity/ds3-demo-memory.db --limit 2
NODE_OPTIONS=--no-warnings node ts/src/frontDoor/cli.ts runtime version
```

Result: `journeys` and non-search `memories` returned TS-front-door output over the demo DB; `runtime version` fell back to Python and returned the Python runtime version surface. `NODE_OPTIONS=--no-warnings` suppresses Node's experimental `node:sqlite` warning so the user-facing skill output does not expose implementation noise.
