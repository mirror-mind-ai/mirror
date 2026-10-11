# Test Guide — CV22.DS2.TS3 Reusable Real-DB-Copy Parity Harness

## Automated Validation

From the `ts/` package:

```bash
cd ts
npm run typecheck
npm run lint
npm test
```

## Harness Validation Route

From repository root, generate the synthetic demo database and run the harness against it:

```bash
uv run python ts/parity/generate_demo_memory_db.py --out tmp/parity/demo-memory.db
uv run python ts/parity/real_db_copy_parity.py \
  --source-db tmp/parity/demo-memory.db
```

## Expected Observation

The harness should:

- generate a synthetic public-content demo DB in ignored local storage;
- copy the source DB into ignored local storage before reading;
- compare Python oracle output with TS replay output against the copied DB;
- print commit-safe redacted evidence only;
- keep generated copied DBs and generated fixture artifacts out of git status.

Default stdout should contain only evidence shaped like:

```text
probe: search_demo_1
result_count: <n>
python_order_hash: <sha256>
ts_order_hash: <sha256>
match: true
```

Default stdout must not contain:

- memory content;
- conversation titles;
- raw memory ids;
- embeddings;
- generated fixture JSON;
- personal source DB contents.

## Pass Condition

- Automated checks pass.
- Demo DB generation passes.
- Harness route passes against `tmp/parity/demo-memory.db`.
- Evidence is redacted by default.
- Generated DB artifacts remain ignored and untracked.

## Fail Condition

- Any parity mismatch.
- Any raw id/content/title/embedding appears in default evidence output.
- Generated database artifacts are tracked by git.
- The documented route cannot be followed by a future DS2 driver.

## Validation Evidence

Automated validation:

```bash
cd ts
npm run typecheck
npm run lint
npm test
```

Result: passed. `npm test` reported 21 passing tests, including redacted evidence tests.

Harness validation:

```bash
uv run python ts/parity/generate_demo_memory_db.py --out tmp/parity/demo-memory.db
uv run python ts/parity/real_db_copy_parity.py \
  --source-db tmp/parity/demo-memory.db
```

Result: passed with redacted output only.

```text
probe: search_demo_1
result_count: <n>
python_order_hash: <sha256>
ts_order_hash: <same sha256>
match: true

probe: search_demo_2
result_count: <n>
python_order_hash: <sha256>
ts_order_hash: <same sha256>
match: true

probe: search_demo_3
result_count: <n>
python_order_hash: <sha256>
ts_order_hash: <same sha256>
match: true

probe: search_demo_4
result_count: <n>
python_order_hash: <sha256>
ts_order_hash: <same sha256>
match: true

probe: search_demo_5
result_count: <n>
python_order_hash: <sha256>
ts_order_hash: <same sha256>
match: true

overall_match: true
```

Safety check:

```bash
git status --short --ignored tmp/parity
```

Result: generated DBs and real-data fixtures stayed under ignored `tmp/` local storage.
