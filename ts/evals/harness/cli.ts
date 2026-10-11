/**
 * Eval harness entry point (CV22.DS10.TS3).
 *
 * Run from `ts/`:
 *
 *   npm run eval -- <name>              # one eval
 *   npm run eval -- --all               # the whole suite (release gate)
 *   npm run eval -- <name> --history 5  # trend past runs of one eval
 *
 * The npm script invokes this with `--env-file-if-exists=../.env`, so the
 * repo-root `.env` reaches `process.env` from `ts/` while the keyless modules
 * still run where no `.env` exists. Never added to CI: these probes hit real
 * model APIs and cost money per run.
 */

import { main } from "#evals/harness/runner.ts";

process.exitCode = await main(process.argv.slice(2));
