// Compatibility export for the Builder command corpus and lifecycle smoke.
// The argv mapping became production code in plateau 8; tests import it through
// this stable helper path so existing harnesses need no duplicate parser.

export {
  type BuilderInvokeDeps,
  invokeBuilderArgv,
  UnsupportedBuilderArgvError,
} from "#builder/argv.ts";
