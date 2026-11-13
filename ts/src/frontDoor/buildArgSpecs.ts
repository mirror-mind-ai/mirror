// The argument specs `build`'s parser enforces, one per subcommand (CR215).
//
// Pure data, apart from the route, so the help answer can read them without
// loading the Builder route: routing answers `build <sub> --help` from these
// specs, and the parser in `buildRoute.ts` validates against the same ones. A
// usage line and the parser cannot disagree about what a subcommand takes.

export interface CommandSpec {
  readonly values?: readonly string[];
  readonly flags?: readonly string[];
  readonly required?: readonly string[];
  readonly choices?: Readonly<Record<string, readonly string[]>>;
  readonly positionals?: number;
}

const COMMON = ["--method", "--journey", "--session-id"] as const;
const COMMON_REQUIRED = ["--method"] as const;

export const COMMAND_SPECS: Readonly<Record<string, CommandSpec>> = {
  "inspect-method": {
    values: ["--journey", "--session-id", "--mirror-home", "--db-path"],
    positionals: 1,
  },
  adopt: { values: [...COMMON, "--mirror-home", "--db-path"], required: COMMON_REQUIRED },
  "prepare-templates": {
    values: [...COMMON, "--mirror-home", "--db-path"],
    required: COMMON_REQUIRED,
  },
  "sync-cursor": { values: [...COMMON, "--mirror-home", "--db-path"], required: COMMON_REQUIRED },
  "pull-candidates": {
    values: [...COMMON, "--mirror-home", "--db-path"],
    required: COMMON_REQUIRED,
  },
  "check-implementation": {
    values: [...COMMON, "--mirror-home", "--db-path"],
    required: COMMON_REQUIRED,
  },
  show: {
    values: [...COMMON, "--mirror-home", "--db-path"],
    required: COMMON_REQUIRED,
  },
  "pull-item": {
    values: [
      ...COMMON,
      "--item-code",
      "--item-title",
      "--item-level",
      "--why-now",
      "--mirror-home",
      "--db-path",
    ],
    required: ["--method", "--item-code", "--item-title", "--item-level", "--why-now"],
  },
  "prepare-item": { values: [...COMMON, "--mirror-home", "--db-path"], required: COMMON_REQUIRED },
  "plan-item": {
    values: [...COMMON, "--objective", "--stop-after", "--mirror-home", "--db-path"],
    flags: ["--preauthorize-approval"],
    required: COMMON_REQUIRED,
    choices: { "--stop-after": ["navigator_validation"] },
  },
  "approve-plan": {
    values: [...COMMON, "--mirror-home", "--db-path"],
    flags: ["--use-preauthorization"],
    required: COMMON_REQUIRED,
  },
  "cancel-plan-preauthorization": {
    values: [...COMMON, "--mirror-home", "--db-path"],
    required: COMMON_REQUIRED,
  },
  "validate-item": {
    values: [
      ...COMMON,
      "--check",
      "--checks-status",
      "--e2e-decision",
      "--e2e-evidence",
      "--navigator-route",
      "--expected-observation",
      "--pass-condition",
      "--fail-condition",
      "--mirror-home",
      "--db-path",
    ],
    flags: ["--navigator-accepted", "--implementation-complete"],
    required: COMMON_REQUIRED,
    choices: {
      "--checks-status": ["passed", "failed", "not_run"],
      "--e2e-decision": ["required", "not_required", "waived", "skipped"],
    },
  },
  "review-item": {
    values: [
      ...COMMON,
      "--debt",
      "--decision",
      "--defer-reason",
      "--revisit-trigger",
      "--mirror-home",
      "--db-path",
    ],
    required: COMMON_REQUIRED,
    choices: { "--decision": ["pending", "no_action", "defer", "pay_now"] },
  },
  "coherence-item": {
    values: [
      ...COMMON,
      "--process",
      "--project",
      "--product",
      "--local-difference",
      "--mirror-home",
      "--db-path",
    ],
    required: COMMON_REQUIRED,
  },
  "done-item": {
    values: [
      ...COMMON,
      "--history-action",
      "--roadmap-update",
      "--next-recommendation",
      "--mirror-home",
      "--db-path",
    ],
    required: COMMON_REQUIRED,
  },
  "set-flow-unit": {
    values: [...COMMON, "--unit", "--mirror-home", "--db-path"],
    required: COMMON_REQUIRED,
    choices: { "--unit": ["story_by_story", "delivery_story"] },
  },
  "plan-delivery-story": {
    values: [...COMMON, "--objective", "--child", "--stop-after", "--mirror-home", "--db-path"],
    flags: ["--preauthorize-approval"],
    required: ["--method", "--objective"],
    choices: { "--stop-after": ["navigator_validation"] },
  },
  "approve-delivery-story-plan": {
    values: [...COMMON, "--mirror-home", "--db-path"],
    flags: ["--use-preauthorization"],
    required: COMMON_REQUIRED,
  },
  "cancel-delivery-story-plan-preauthorization": {
    values: [...COMMON, "--mirror-home", "--db-path"],
    required: COMMON_REQUIRED,
  },
  "validate-delivery-story": {
    values: [...COMMON, "--summary", "--mirror-home", "--db-path"],
    flags: ["--navigator-accepted"],
    required: ["--method", "--summary"],
  },
  "review-delivery-story": {
    values: [...COMMON, "--decision", "--summary", "--mirror-home", "--db-path"],
    required: ["--method", "--decision", "--summary"],
    choices: { "--decision": ["no_action", "defer", "pay_now"] },
  },
  "coherence-delivery-story": {
    values: [...COMMON, "--summary", "--mirror-home", "--db-path"],
    required: ["--method", "--summary"],
  },
  "done-delivery-story": {
    values: [...COMMON, "--summary", "--mirror-home", "--db-path"],
    required: ["--method", "--summary"],
  },
  "set-cadence": {
    values: [...COMMON, "--profile", "--limit", "--mirror-home", "--db-path"],
    required: ["--method", "--profile"],
  },
  "release-intent": {
    values: [...COMMON, "--intent", "--mirror-home", "--db-path"],
    required: COMMON_REQUIRED,
    choices: { "--intent": ["planned", "none", "undecided"] },
  },
  "continue-lifecycle": {
    values: [
      ...COMMON,
      "--process",
      "--project",
      "--product",
      "--local-difference",
      "--history-action",
      "--roadmap-update",
      "--next-recommendation",
      "--mirror-home",
      "--db-path",
    ],
    required: COMMON_REQUIRED,
  },
};

export const LOAD_SPEC: CommandSpec = {
  values: ["--session-id", "--mirror-home", "--db-path"],
  flags: ["--ignore-production-role"],
  positionals: 1,
};

/** The positional each subcommand that takes one names, for its usage line. */
const POSITIONAL_NAMES: Readonly<Record<string, string>> = {
  load: "<journey>",
  "inspect-method": "[<method>]",
};

/** An option's placeholder: `--item-code` takes ITEM_CODE, a path option takes PATH. */
function metavar(option: string): string {
  if (option === "--mirror-home") return "PATH";
  return option.slice(2).toUpperCase().replaceAll("-", "_");
}

/**
 * `build <subcommand>`'s usage line, without the `usage: ` prefix, read from
 * the spec its parser enforces: the positional, the required options, then the
 * optional ones and the flags. `--db-path` is the front door's own option, not
 * the subcommand's, and is left out. Null for a name with no spec.
 */
export function buildUsageSynopsis(subcommand: string): string | null {
  const spec = subcommand === "load" ? LOAD_SPEC : COMMAND_SPECS[subcommand];
  if (spec === undefined) return null;
  const required = new Set(spec.required ?? []);
  const withValue = (option: string): string => {
    const choices = spec.choices?.[option];
    return `${option} ${choices ? `{${choices.join(",")}}` : metavar(option)}`;
  };
  const values = (spec.values ?? []).filter((option) => option !== "--db-path");
  return [
    `build ${subcommand}`,
    ...(spec.positionals ? [POSITIONAL_NAMES[subcommand] ?? "<arg>"] : []),
    ...values.filter((option) => required.has(option)).map(withValue),
    ...values.filter((option) => !required.has(option)).map((option) => `[${withValue(option)}]`),
    ...(spec.flags ?? []).map((flag) => `[${flag}]`),
  ].join(" ");
}
