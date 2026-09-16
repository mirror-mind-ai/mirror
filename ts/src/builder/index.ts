// Lazy Builder boundary for the front door (CV22.DS7.US8 plateau 8).
//
// `frontDoor/cli.ts` imports this module only after routing has chosen the TS
// engine. Keeping the whole Builder command tree behind one module is what lets
// MIRROR_TS_BUILD=0 reach Python even when this module cannot load.

export {
  invokeBuilderArgv,
  invokeReadOnlyBuilderArgv,
  READ_ONLY_BUILDER_SUBCOMMANDS,
} from "./argv.ts";
