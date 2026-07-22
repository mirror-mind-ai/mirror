// Mirror Mind TypeScript core — package entry point and public API surface.
//
// The core is grown as a database-seam strangler of the Python core in
// `src/memory/` (see docs/project/roadmap/cv22-typescript-core-port/). This file
// is the deliberate public surface: everything a consumer of the package should
// use is re-exported here, read and write. Internal modules still import each
// other by deep path; only the public API lives here, and it is kept in sync as
// the strangler grows (CR011).

// --- Consult command core ---
export type {
  ConsultAskCommand,
  ConsultCreditsCommand,
  ConsultParseResult,
} from "./consult/args.ts";
export { CONSULT_USAGE, ConsultArgError, parseConsultArgs } from "./consult/args.ts";
export type {
  ConsultContextLoader,
  ConsultContextRequest,
  RunConsultOptions,
} from "./consult/core.ts";
export {
  buildConsultLlmRequest,
  runConsult,
  runConsultAsk,
  runConsultCredits,
  SYSTEM_PREAMBLE,
} from "./consult/core.ts";
export type { ConsultTier } from "./consult/modelCatalog.ts";
export { CONSULT_TIERS, LLM_FAMILIES, resolveConsultModel } from "./consult/modelCatalog.ts";
export type { CreditInfo as ConsultCreditInfo } from "./consult/render.ts";
export {
  BALANCE_BAR_WIDTH,
  renderConsultAsk,
  renderCost,
  renderCredits,
  USD_TO_BRL,
} from "./consult/render.ts";

// --- Conversation extraction ---
export type {
  ConversationExtractionOptions,
  ConversationExtractionResult,
} from "./conversation/extraction.ts";
export { runConversationExtraction } from "./conversation/extraction.ts";
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
export type {
  ExistingMemoryForCuration,
  ExtractedMemory,
  ExtractedTask,
  ExtractionMessage,
} from "./extraction/conversation.ts";
export {
  curateAgainstExisting,
  extractMemories,
  extractTasks,
  formatTranscript,
  naiveSummary,
} from "./extraction/conversation.ts";
export { parseJsonResponse } from "./extraction/json.ts";
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

// --- External providers (DS5 substrate) ---
export type { ProviderConfig, ProviderConfigOptions, ProviderName } from "./providers/config.ts";
export { ProviderConfigError, resolveProviderConfig } from "./providers/config.ts";
export type { CreditInfo, CreditProvider, ReplayCreditFixture } from "./providers/credits.ts";
export {
  assertReplayCreditFixture,
  loadReplayCreditProvider,
  ReplayCreditProvider,
} from "./providers/credits.ts";
export type { EmbeddingProvider, ReplayEmbeddingFixture } from "./providers/embedding.ts";
export {
  assertReplayEmbeddingFixture,
  loadReplayEmbeddingProvider,
  ReplayEmbeddingProvider,
} from "./providers/embedding.ts";
export type {
  LlmProvider,
  LlmRequest,
  LlmResponse,
  LlmRole,
  ReplayLlmFixture,
} from "./providers/llm.ts";
export {
  assertReplayLlmFixture,
  loadReplayLlmProvider,
  ReplayLlmProvider,
} from "./providers/llm.ts";
export type { RedactionOptions } from "./providers/redaction.ts";
export {
  assertFixtureSafe,
  redactJson,
  redactString,
  UnsafeFixtureError,
} from "./providers/redaction.ts";
export type { ReplayFixture } from "./providers/replay.ts";
export { loadReplayFixture } from "./providers/replay.ts";
// --- Hybrid search ranker ---
export type {
  FreshSearchFilters,
  FreshSearchOptions,
  FreshSearchResult,
} from "./search/memorySearch.ts";
export {
  accessCountsByMemoryId,
  DEFAULT_SEARCH_RANKER_CONFIG,
  ftsLexicalScores,
  ftsQuery,
  listSearchMemoryRows,
  searchMemories,
} from "./search/memorySearch.ts";
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
