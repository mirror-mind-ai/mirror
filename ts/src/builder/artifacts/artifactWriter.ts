// CR079: no Ariad command replaces content it did not write.
//
// Every file the Builder writes goes through here, under one of two policies.
//
// A SCAFFOLD (`create-only`) is written once, when absent, and never again: the
// Plan packages, Expand's story indexes, the method templates. From its first
// write on, it belongs to the Driver.
//
// A RECORD (`sealed-record`) may be rewritten, because a checkpoint recorded as
// pending and later accepted runs its command again, and the file has to follow.
// These are the closure artifacts: `validation.md`, `review.md`, `coherence.md`
// and `done.md`, at story and Delivery Story level. A record is rewritten only
// while the runtime can prove that it wrote the file and nobody changed it
// since. The proof is a seal on the record's last line: the SHA-256 of everything
// above it, with line endings normalized, so that a CRLF checkout does not read
// as an edit.
//
// Anything else is PRESERVED, byte for byte, and the caller reports that: an
// authored file, an edited record, a record written before the seal existed, a
// removed seal, or text after the seal. Before this, the closure writers
// replaced whatever was there, and two stories lost authored validation evidence
// to them.
//
// Both policies refuse a path outside the project before writing anything.
// `builderWriteGuard.test.ts` fails if any other module under `ts/src/builder`
// writes a file, so a new artifact cannot arrive without choosing a policy here.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

export type ArtifactPolicy = "create-only" | "sealed-record";

/** What the writer did, which is what a surface must report: never a pre-check. */
export type ArtifactOutcome = "created" | "updated" | "existing" | "preserved";

export class ArtifactOutsideProjectError extends Error {}

const SEAL_TEXT =
  "Ariad wrote this file and rewrites it only while this line matches the text above it. " +
  "Edit the file and Ariad will leave it as it is.";

/** The hash and a closing marker; the prose between them may change without orphaning old seals. */
const SEAL_LINE = /^<!-- ariad-seal sha256:([0-9a-f]{64}) .*-->$/u;

export function writeBuilderArtifact(options: {
  readonly path: string;
  readonly content: string;
  readonly policy: ArtifactPolicy;
  readonly projectRoot: string;
}): ArtifactOutcome {
  const target = confinedTo(options.projectRoot, options.path);
  const sealed = options.policy === "sealed-record";
  if (!existsSync(target)) {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, sealed ? sealArtifact(options.content) : options.content, "utf8");
    return "created";
  }
  if (!sealed) return "existing";
  if (!isSealedByAriad(readFileSync(target, "utf8"))) return "preserved";
  writeFileSync(target, sealArtifact(options.content), "utf8");
  return "updated";
}

/**
 * The project root a write must stay inside. A path that arrives without one is a
 * caller bug: it is refused loudly rather than written unconfined.
 */
export function requireProjectRoot(projectRoot: string | null | undefined, path: string): string {
  if (!projectRoot) {
    throw new Error(`Error: ${path} was given without its project root; refusing to write it.`);
  }
  return projectRoot;
}

/** The content, then one line carrying the SHA-256 of that content. */
export function sealArtifact(content: string): string {
  const body = normalized(content.endsWith("\n") ? content : `${content}\n`);
  return `${body}<!-- ariad-seal sha256:${sha256(body)} — ${SEAL_TEXT} -->\n`;
}

/** True only when the last line is a seal whose hash matches everything above it. */
export function isSealedByAriad(text: string): boolean {
  const lines = normalized(text).replace(/\n+$/u, "").split("\n");
  const match = SEAL_LINE.exec(lines.pop() ?? "");
  if (match === null) return false;
  return match[1] === sha256(lines.length > 0 ? `${lines.join("\n")}\n` : "");
}

function normalized(text: string): string {
  return text.replaceAll("\r\n", "\n");
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Both resolved against the working directory, as `writeFileSync` would resolve the
 * path: a relative project path (the lifecycle corpus uses one) must not be read as
 * relative to itself.
 */
function confinedTo(projectRoot: string, path: string): string {
  const root = resolve(projectRoot);
  const target = resolve(path);
  const within = relative(root, target);
  if (within === "" || within === ".." || within.startsWith(`..${sep}`) || isAbsolute(within)) {
    throw new ArtifactOutsideProjectError(
      `Error: refusing to write ${path}: it is outside the project at ${root}.`,
    );
  }
  return target;
}
