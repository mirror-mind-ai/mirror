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
const migration = await import("../ts/src/db/migrateHome.ts");
const context = await import("../ts/src/mirror/deliverContext.ts");
const learning = await import("../ts/src/conversation/learnFromConversations.ts");
const journeys = await import("../ts/src/journey/journeyCalls.ts");

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

// CV24.DS5: migrate a home on request, applying exactly the pending list the
// person was shown, behind a uniquely named, verified, retained backup.
export const migrateHome = migration.migrateHome;
export const MigrateHomeRejectedError = migration.MigrateHomeRejectedError;

// CV24.DS6: Mirror's context for a host's turn -- the doorman as a call. The
// key is an argument; nothing is read from the environment. A Conversation is
// in Mirror Mode from its first turn.
export const deliverMirrorContext = context.deliverMirrorContext;
export const forgetMirrorContext = context.forgetMirrorContext;
export const MirrorContextRejectedError = context.MirrorContextRejectedError;

// CV24.DS7: learn from a host's idle Conversations without ending them -- the
// stretch each gained since it was last learned from. The key is an argument.
export const learnFromConversations = learning.learnFromConversations;
export const LearningRejectedError = learning.LearningRejectedError;

// CV24.DS8: Journeys as calls -- create, edit, move, set a project path,
// delete -- each answering with the tree `readJourneyTree` reads.
export const addJourney = journeys.addJourney;
export const updateJourney = journeys.updateJourney;
export const setJourneyProjectPath = journeys.setJourneyProjectPath;
export const moveJourney = journeys.moveJourney;
export const deleteJourney = journeys.deleteJourney;
export const JourneyCallRejectedError = journeys.JourneyCallRejectedError;
