import { openDatabaseReadOnly } from "../src/db/database.ts";
import {
  evaluateJourneyProbes,
  evaluateListingProbes,
  evaluatePersonaProbes,
  evaluateSearchProbes,
  type ProbeParityResult,
  type RealDbCopyFixture,
  renderRedactedReport,
} from "../src/parity/realDbCopyParity.ts";
import { loadFixture, parseVerifyArgs } from "../src/parity/verifyCli.ts";

const { fixturePath, includeSensitiveDebug } = parseVerifyArgs(
  "Usage: node ts/parity/real_db_copy_verify.ts --fixture <path> [--debug-sensitive-output]",
);

const fixture = loadFixture<RealDbCopyFixture>(fixturePath);
const searchResults = evaluateSearchProbes(fixture, { includeSensitiveDebug });
const personaResults = evaluatePersonaProbes(fixture, { includeSensitiveDebug });
const journeyResults = evaluateJourneyProbes(fixture, { includeSensitiveDebug });

let listingResults: ProbeParityResult[] = [];
if ((fixture.listing_probes?.length || fixture.count_by_type_expected) && fixture.copied_db_path) {
  const db = openDatabaseReadOnly(fixture.copied_db_path);
  try {
    listingResults = evaluateListingProbes(fixture, db, { includeSensitiveDebug });
  } finally {
    db.close();
  }
}

process.stdout.write("== search ==\n");
process.stdout.write(renderRedactedReport(searchResults));
if (personaResults.length > 0) {
  process.stdout.write("== detect-persona ==\n");
  process.stdout.write(renderRedactedReport(personaResults));
}
if (journeyResults.length > 0) {
  process.stdout.write("== journeys ==\n");
  process.stdout.write(renderRedactedReport(journeyResults));
}
if (listingResults.length > 0) {
  process.stdout.write("== memory-listing ==\n");
  process.stdout.write(renderRedactedReport(listingResults));
}

const allResults = [...searchResults, ...personaResults, ...journeyResults, ...listingResults];
if (includeSensitiveDebug) {
  process.stdout.write("\nSENSITIVE DEBUG OUTPUT ENABLED\n");
  for (const result of allResults as ProbeParityResult[]) {
    process.stdout.write(`probe: ${result.label}\n`);
    process.stdout.write(`python_order: ${(result.expectedOrder ?? []).join(",")}\n`);
    process.stdout.write(`ts_order: ${(result.actualOrder ?? []).join(",")}\n`);
  }
}

process.exit(allResults.every((result) => result.match) ? 0 : 1);
