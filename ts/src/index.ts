// Mirror Mind TypeScript core — package entry point and public API surface.
//
// The core is grown as a database-seam strangler of the Python core in
// `src/memory/` (see docs/project/roadmap/cv22-typescript-core-port/). This file
// is the deliberate public surface: everything a consumer of the package should
// use is re-exported here, read and write. Internal modules still import each
// other by deep path; only the public API lives here, and it is kept in sync as
// the strangler grows (CR011).

export type { BackupRecord } from "./db/backupGate.ts";
export { BackupGateError, requireBackup, sha256File } from "./db/backupGate.ts";
export { assertCopyTarget, CopyOnlyGuardError } from "./db/copyGuard.ts";
// --- Database seam ---
export type {
  Database,
  OpenOptions,
  PreparedQuery,
  Row,
  SqlValue,
  WritableDatabase,
  WritablePreparedQuery,
} from "./db/database.ts";
export {
  openDatabaseCopyForWrite,
  openDatabaseForWrite,
  openDatabaseReadOnly,
  snapshotDatabaseTo,
  withTransaction,
} from "./db/database.ts";
export { blobToFloat32, parseUtcMs } from "./db/decode.ts";
export { assertFtsIntegrity, FtsIntegrityError } from "./db/ftsIntegrity.ts";
export { optionalNumber, optionalString, requireString } from "./db/rowDecode.ts";
export { assertSchemaState, KNOWN_MIGRATION_IDS, SchemaStateError } from "./db/schemaState.ts";

// --- Front-door routing ---
export type { FrontDoorEngine, RouteDecision } from "./frontDoor/routing.ts";
export { routeMemoryCommand } from "./frontDoor/routing.ts";

// --- Identity (read model + writes) ---
export type { IdentityRow } from "./identity/identityStore.ts";
export { updateIdentityMetadata, upsertIdentity } from "./identity/identityStore.ts";
export type { SetIdentityInput } from "./identity/setIdentity.ts";
export { setIdentity } from "./identity/setIdentity.ts";

// --- Journeys (options + writes) ---
export type {
  JourneyHierarchy,
  JourneyIdentityRow,
  JourneyOption,
} from "./journey/journeyOptions.ts";
export { groupJourneysByParent, listJourneyOptions } from "./journey/journeyOptions.ts";
export type { CreateJourneyInput, JourneyFields } from "./journey/journeyWrite.ts";
export {
  createJourney,
  JOURNEY_LAYER,
  JourneyNotFoundError,
  journeyMetadata,
  setProjectPath,
} from "./journey/journeyWrite.ts";

// --- Memory (listing + reinforcement writes) ---
export type { ListRecentFilters, MemorySummary } from "./memory/listing.ts";
export {
  buildListRecentQuery,
  countMemoriesByType,
  listRecentMemorySummaries,
} from "./memory/listing.ts";
export { logAccess, logUse } from "./memory/reinforcement.ts";
// --- Parity harness (read + grading) ---
export { orderedIdsMatch } from "./parity/golden.ts";
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
  evaluateSearchProbes,
  orderedIdsHash,
  renderRedactedReport,
  toProbeResult,
} from "./parity/realDbCopyParity.ts";
// --- Persona routing ---
export type { PersonaMatch, PersonaRoutingRow } from "./persona/detectPersona.ts";
export { detectPersona, normalizeRoutingText } from "./persona/detectPersona.ts";
// --- Hybrid search ranker ---
export type { RankableMemory, RankedMemory, RankerConfig, SearchWeights } from "./search/ranker.ts";
export {
  cosineSimilarity,
  hybridScore,
  rankMemories,
  recencyScore,
  reinforcementScore,
} from "./search/ranker.ts";
export { expandHome, normalizeProjectPath } from "./util/paths.ts";
export { newId, nowIso, toMicrosecondIso } from "./util/pyGenerators.ts";
// --- Python-compatibility utilities ---
export type { PyJsonDumpsOptions } from "./util/pyJson.ts";
export { pyJsonDumps } from "./util/pyJson.ts";
