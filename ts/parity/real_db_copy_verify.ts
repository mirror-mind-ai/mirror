import { readFileSync } from "node:fs";
import {
  evaluateRealDbCopyFixture,
  renderRedactedReport,
  type RealDbCopyFixture,
} from "../src/parity/realDbCopyParity.ts";

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

const fixturePath = argValue("--fixture");
const includeSensitiveDebug = process.argv.includes("--debug-sensitive-output");

if (!fixturePath) {
  console.error("Usage: node ts/parity/real_db_copy_verify.ts --fixture <path> [--debug-sensitive-output]");
  process.exit(2);
}

const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as RealDbCopyFixture;
const results = evaluateRealDbCopyFixture(fixture, { includeSensitiveDebug });
process.stdout.write(renderRedactedReport(results));

if (includeSensitiveDebug) {
  process.stdout.write("\nSENSITIVE DEBUG OUTPUT ENABLED\n");
  for (const result of results) {
    process.stdout.write(`probe: ${result.label}\n`);
    process.stdout.write(`python_order: ${(result.expectedOrder ?? []).join(",")}\n`);
    process.stdout.write(`ts_order: ${(result.actualOrder ?? []).join(",")}\n`);
  }
}

process.exit(results.every((result) => result.match) ? 0 : 1);
