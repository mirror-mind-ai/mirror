// `mirror-mind/desktop` — the core's library entry for Mirror Desktop. CV24.DS1.
//
// Mirror Desktop hosts this core in its own Node process and imports it from
// `node_modules`, where Node refuses to strip TypeScript types. So this entry
// registers the same type-stripping hook the bins use, and only then imports
// the TypeScript modules -- dynamically, because a static `export ... from
// "./x.ts"` would be loaded before the hook exists.
//
// Everything Desktop may call is re-exported here BY NAME. A name missing from
// this file is not part of the contract, whatever the TypeScript tree holds.
// `DESKTOP_API_VERSION` changes when a name is removed or changes meaning.

import { registerTypeStripping } from "../bin/loader.js";

registerTypeStripping();

const migrationReport = await import("../ts/src/db/migrationReport.ts");
const conversations = await import("../ts/src/conversation/hostCalls.ts");
const reads = await import("../ts/src/conversation/hostReads.ts");
const homes = await import("../ts/src/init/createHome.ts");

export const DESKTOP_API_VERSION = 1;
export const inspectMigrationState = migrationReport.inspectMigrationState;

// CV24.DS2: Conversations as calls. Each opens only a `current` database,
// never migrates, and writes through the narrowed Conversation handle.
export const ensureConversation = conversations.ensureConversation;
export const appendConversationMessages = conversations.appendConversationMessages;
export const renameConversation = conversations.renameConversation;
export const rebindConversationJourney = conversations.rebindConversationJourney;
export const DatabaseNotCurrentError = conversations.DatabaseNotCurrentError;
export const ConversationCallRejectedError = conversations.ConversationCallRejectedError;

// CV24.DS3: the reads a sidebar is built from. Read-only, `current` homes only.
export const readJourneyTree = reads.readJourneyTree;
export const listJourneyConversations = reads.listJourneyConversations;
export const inspectConversation = reads.inspectConversation;

// CV24.DS4: create a complete, seeded home at an explicit path, all or nothing.
// Writes nothing outside it, never the machine-wide ~/.config/mirror/env.
export const createHome = homes.createHome;
export const CreateHomeRejectedError = homes.CreateHomeRejectedError;
