// Mirror Mind TypeScript core — package entry point.
//
// The core is being grown as a database-seam strangler of the Python core in
// `src/memory/`. See docs/project/roadmap/cv22-typescript-core-port/.

export type { Database, PreparedQuery, Row, SqlValue } from "./db/database.ts";
export { openDatabaseReadOnly } from "./db/database.ts";
export type { RankableMemory, RankedMemory, RankerConfig, SearchWeights } from "./search/ranker.ts";
export {
  cosineSimilarity,
  hybridScore,
  rankMemories,
  recencyScore,
  reinforcementScore,
} from "./search/ranker.ts";
