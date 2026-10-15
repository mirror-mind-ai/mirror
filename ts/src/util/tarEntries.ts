// Named entries out of a gzipped tar archive, in memory. (CR134)
//
// A package's pending release notes are read from the channel version's
// tarball, which `npm pack` fetched across a trust boundary: the registry is
// whatever the npm config names, and a project's `.npmrc` can name it (CR135).
// So nothing here writes a file, and no entry name becomes a path or an
// argument -- the caller asks for names and gets bytes. That is also why `tar`
// is not spawned: it would take archive-chosen member names as arguments.
// Inflation stops at a bound, because a small gzip can inflate to gigabytes.
//
// What is read is what tar writers produce: ustar headers with the POSIX
// `prefix` field, pax extended headers (`x`, whose `path` names the next
// entry), and GNU long names (`L`). Every header's checksum is checked, and an
// archive that stops before its end-of-archive block is refused rather than
// half-read: a tarball cut between two entries would otherwise lose the later
// ones -- the newest note among them -- without a word.

import { gunzipSync } from "node:zlib";

const BLOCK = 512;
const USTAR_MAGIC = Buffer.from("ustar\0", "latin1");

/** The bound on inflated bytes. A release tarball inflates to a few MB. */
export const MAX_INFLATED_BYTES = 64 * 1024 * 1024;

export type TarEntries = { ok: true; entries: Map<string, Buffer> } | { ok: false; detail: string };

/** A NUL-terminated header field. */
function field(bytes: Buffer): string {
  const end = bytes.indexOf(0);
  return bytes.subarray(0, end === -1 ? bytes.length : end).toString("utf8");
}

/** An octal header number, or null when the field holds anything else. */
function octal(bytes: Buffer): number | null {
  const value = field(bytes).trim();
  return /^[0-7]+$/.test(value) ? Number.parseInt(value, 8) : null;
}

/** The checksum counts the header with its own field read as spaces. */
function checksumHolds(header: Buffer): boolean {
  const recorded = octal(header.subarray(148, 156));
  if (recorded === null) return false;
  let sum = 0;
  for (let index = 0; index < BLOCK; index += 1) {
    sum += index >= 148 && index < 156 ? 0x20 : (header[index] as number);
  }
  return sum === recorded;
}

/** The `path` record of a pax extended header: records are `<len> <key>=<value>\n`. */
function paxPath(data: Buffer): string | null {
  let path: string | null = null;
  let offset = 0;
  while (offset < data.length) {
    const space = data.indexOf(0x20, offset);
    if (space === -1) break;
    const length = Number.parseInt(data.subarray(offset, space).toString("latin1"), 10);
    if (!Number.isInteger(length) || length <= 0 || offset + length > data.length) break;
    const record = data.subarray(space + 1, offset + length - 1).toString("utf8");
    const equals = record.indexOf("=");
    if (equals !== -1 && record.slice(0, equals) === "path") path = record.slice(equals + 1);
    offset += length;
  }
  return path;
}

/**
 * The regular-file entries of a gzipped tar whose names `wanted` accepts.
 * Refuses, with a reason, an archive that inflates past the bound, is not
 * gzip, fails a header checksum, or ends inside an entry.
 */
export function readTarGzEntries(
  gz: Buffer,
  wanted: (name: string) => boolean,
  maxInflatedBytes: number = MAX_INFLATED_BYTES,
): TarEntries {
  let tar: Buffer;
  try {
    tar = gunzipSync(gz, { maxOutputLength: maxInflatedBytes });
  } catch (error) {
    if ((error as { code?: string }).code === "ERR_BUFFER_TOO_LARGE") {
      return { ok: false, detail: `the archive inflates to more than ${maxInflatedBytes} bytes` };
    }
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, detail: `unreadable gzip: ${message}` };
  }

  const entries = new Map<string, Buffer>();
  let nextName: string | null = null;
  let offset = 0;
  while (offset + BLOCK <= tar.length) {
    const header = tar.subarray(offset, offset + BLOCK);
    if (header.every((byte) => byte === 0)) return { ok: true, entries };
    if (!checksumHolds(header)) {
      return { ok: false, detail: `the tar header at byte ${offset} fails its checksum` };
    }
    const size = octal(header.subarray(124, 136));
    if (size === null) {
      return { ok: false, detail: `the tar header at byte ${offset} has an unreadable size` };
    }
    const start = offset + BLOCK;
    const end = start + size;
    if (end > tar.length) return { ok: false, detail: "the archive is truncated" };
    const data = tar.subarray(start, end);
    const type = String.fromCharCode(header[156] as number);

    if (type === "x") {
      nextName = paxPath(data) ?? nextName;
    } else if (type === "L") {
      nextName = field(data);
    } else if (type !== "g") {
      const prefix = header.subarray(257, 263).equals(USTAR_MAGIC)
        ? field(header.subarray(345, 500))
        : "";
      const base = field(header.subarray(0, 100));
      const name = nextName ?? (prefix ? `${prefix}/${base}` : base);
      nextName = null;
      if ((type === "0" || type === "\0") && wanted(name)) entries.set(name, Buffer.from(data));
    }
    offset = start + Math.ceil(size / BLOCK) * BLOCK;
  }
  // The archive stopped before its end-of-archive block: inside an entry's
  // padding, or cleanly between two entries. Entries after the last whole one
  // may be missing, so nothing read here is presented as the whole (CI at
  // 565b7b97 met the first; the second is the general case).
  return { ok: false, detail: "the archive is truncated" };
}
