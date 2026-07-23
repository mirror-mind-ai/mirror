import { openDatabaseReadOnly } from "../src/db/database.ts";
import {
  evaluateCultivationProbes,
  evaluateJourneyProbes,
  evaluateListingProbes,
  evaluatePersonaProbes,
  evaluateSearchProbes,
  evaluateTasksProbes,
  evaluateWeekProbes,
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
let tasksResults: ProbeParityResult[] = [];
let weekResults: ProbeParityResult[] = [];
let cultivationResults: ProbeParityResult[] = [];
if (fixture.copied_db_path) {
  const db = openDatabaseReadOnly(fixture.copied_db_path);
  try {
    if (fixture.listing_probes?.length || fixture.count_by_type_expected) {
      listingResults = evaluateListingProbes(fixture, db, { includeSensitiveDebug });
    }
    if (fixture.tasks_probes?.length) {
      tasksResults = evaluateTasksProbes(fixture, db, { includeSensitiveDebug });
    }
    if (fixture.week_probes?.length) {
      weekResults = evaluateWeekProbes(fixture, db, { includeSensitiveDebug });
    }
    if (fixture.cultivation_cluster_probe || fixture.cultivation_consolidation_probes?.length) {
      cultivationResults = evaluateCultivationProbes(fixture, db, { includeSensitiveDebug });
    }
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
if (tasksResults.length > 0) {
  process.stdout.write("== tasks ==\n");
  process.stdout.write(renderRedactedReport(tasksResults));
}
if (weekResults.length > 0) {
  process.stdout.write("== week ==\n");
  process.stdout.write(renderRedactedReport(weekResults));
}
if (cultivationResults.length > 0) {
  process.stdout.write("== cultivation ==\n");
  process.stdout.write(renderRedactedReport(cultivationResults));
}

const allResults = [
  ...searchResults,
  ...personaResults,
  ...journeyResults,
  ...listingResults,
  ...tasksResults,
  ...weekResults,
  ...cultivationResults,
];
if (includeSensitiveDebug) {
  process.stdout.write("\nSENSITIVE DEBUG OUTPUT ENABLED\n");
  for (const result of allResults as ProbeParityResult[]) {
    process.stdout.write(`probe: ${result.label}\n`);
    process.stdout.write(`python_order: ${(result.expectedOrder ?? []).join(",")}\n`);
    process.stdout.write(`ts_order: ${(result.actualOrder ?? []).join(",")}\n`);
  }
}

process.exit(allResults.every((result) => result.match) ? 0 : 1);
