import { readFileSync } from "node:fs";
import { renderRedactedWriteReport } from "../src/parity/writeParity.ts";
import {
  verifyWriteFixture,
  type WriteParityFixture,
} from "../src/parity/writeParityFixture.ts";

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

const fixturePath = argValue("--fixture");
const includeSensitiveDebug = process.argv.includes("--debug-sensitive-output");

if (!fixturePath) {
  console.error(
    "Usage: node ts/parity/write_parity_verify.ts --fixture <path> [--debug-sensitive-output]",
  );
  process.exit(2);
}

const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as WriteParityFixture;
const results = verifyWriteFixture(fixture, { includeSensitiveDebug });

process.stdout.write("== write-parity ==\n");
process.stdout.write(renderRedactedWriteReport(results));

if (includeSensitiveDebug) {
  process.stdout.write("\nSENSITIVE DEBUG OUTPUT ENABLED\n");
  for (const result of results) {
    process.stdout.write(`probe: ${result.label}\n`);
    process.stdout.write(`python_state: ${JSON.stringify(result.pythonState ?? [])}\n`);
    process.stdout.write(`ts_state: ${JSON.stringify(result.tsState ?? [])}\n`);
  }
}

process.exit(results.every((result) => result.match) ? 0 : 1);
