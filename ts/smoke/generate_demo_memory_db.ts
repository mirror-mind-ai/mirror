#!/usr/bin/env node
// Generate the public synthetic `memory.db` (CV22.DS10.TS5, slice G).
//
// Usage (from the repository root):
//   node ts/smoke/generate_demo_memory_db.ts --out tmp/demo/memory.db
//
// Every row is fictional; see `demoMemoryDb.ts` for what the database holds
// and why. Replaces `ts/parity/generate_demo_memory_db.py`, which needed the
// Python core this story deletes.

import { resolve } from "node:path";

import { generateDemoMemoryDb } from "./demoMemoryDb.ts";

function main(argv: readonly string[]): number {
  const at = argv.indexOf("--out");
  const out = at >= 0 ? argv[at + 1] : undefined;
  if (out === undefined || out.startsWith("--")) {
    process.stderr.write("usage: generate_demo_memory_db.ts --out PATH\n");
    return 2;
  }
  generateDemoMemoryDb(resolve(out));
  process.stdout.write(`wrote ${out}\n`);
  return 0;
}

process.exit(main(process.argv.slice(2)));
