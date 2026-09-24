// Lazy Builder boundary for the front door (CV22.DS7.US8 plateau 8).
//
// `frontDoor/cli.ts` imports this module only when a `build` command is routed.
// Keeping the whole Builder command tree behind one module is what keeps every
// other command working when this one cannot load.

export {
  invokeBuilderArgv,
  invokeReadOnlyBuilderArgv,
  READ_ONLY_BUILDER_SUBCOMMANDS,
} from "./argv.ts";
