import { renderRedactedWriteReport } from "../src/parity/writeParity.ts";
import {
  verifyWriteFixture,
  type WriteParityFixture,
} from "../src/parity/writeParityFixture.ts";
import { loadFixture, parseVerifyArgs } from "../src/parity/verifyCli.ts";

const { fixturePath, includeSensitiveDebug } = parseVerifyArgs(
  "Usage: node ts/parity/write_parity_verify.ts --fixture <path> [--debug-sensitive-output]",
);

const fixture = loadFixture<WriteParityFixture>(fixturePath);
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
