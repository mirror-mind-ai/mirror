// Mirror Mind TypeScript core — package entry point.
//
// The core is being grown as a database-seam strangler of the Python core in
// `src/memory/`. See docs/project/roadmap/cv22-typescript-core-port/.

export type { Database, PreparedQuery, Row, SqlValue } from "./db/database.ts";
export { openDatabaseReadOnly } from "./db/database.ts";
export type { JourneyIdentityRow, JourneyOption } from "./journey/journeyOptions.ts";
export { listJourneyOptions } from "./journey/journeyOptions.ts";
export type { ListRecentFilters, MemorySummary } from "./memory/listing.ts";
export {
  buildListRecentQuery,
  countMemoriesByType,
  listRecentMemorySummaries,
} from "./memory/listing.ts";
export type {
  JourneyProbe,
  ListingProbe,
  PersonaProbe,
  ProbeParityResult,
  RealDbCopyFixture,
  RealDbCopyProbe,
} from "./parity/realDbCopyParity.ts";
export {
  evaluateJourneyProbes,
  evaluateListingProbes,
  evaluatePersonaProbes,
  evaluateRealDbCopyFixture,
  orderedIdsHash,
  renderRedactedReport,
  toProbeResult,
} from "./parity/realDbCopyParity.ts";
export type { PersonaMatch, PersonaRoutingRow } from "./persona/detectPersona.ts";
export { detectPersona, normalizeRoutingText } from "./persona/detectPersona.ts";
export type { RankableMemory, RankedMemory, RankerConfig, SearchWeights } from "./search/ranker.ts";
export {
  cosineSimilarity,
  hybridScore,
  rankMemories,
  recencyScore,
  reinforcementScore,
} from "./search/ranker.ts";
