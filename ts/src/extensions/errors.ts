// Extension error hierarchy (CV22.DS7.TS3 plateau 3a). Port of
// `src/memory/extensions/errors.py`.
//
// These messages are not internal: `runtime status` prints an extension's
// validation or migration failure verbatim as its health note, so the text and
// the `[extension/<id>]` prefix are a graded parity surface, not free-form
// diagnostics. `extension_id` is optional because a malformed manifest is
// discovered before the id is known.

export class ExtensionError extends Error {
  readonly extensionId: string | null;

  constructor(message: string, extensionId: string | null = null) {
    super(extensionId ? `[extension/${extensionId}] ${message}` : message);
    this.extensionId = extensionId;
    this.name = new.target.name;
  }
}

/** Raised when an extension's manifest fails validation. */
export class ExtensionValidationError extends ExtensionError {}

/** Raised when a SQL migration file is malformed or fails to apply. */
export class ExtensionMigrationError extends ExtensionError {}
