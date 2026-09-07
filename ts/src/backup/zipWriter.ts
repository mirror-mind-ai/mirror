// Minimal ZIP writer for the dated database backup (CV22.DS7.TS1).
//
// Mirrors what Python's `zipfile.ZipFile(..., ZIP_DEFLATED).write(path, name)`
// produces for a small set of whole files: one deflate-raw local header per
// member (no data descriptor — sizes are known before the header is written),
// a central directory, and the end-of-central-directory record. DOS mtimes
// come from each file's stat in LOCAL time, as zipfile does.
//
// Deliberately not implemented: ZIP64 (refused above 4 GiB with a clear error;
// Python would switch formats silently), encryption, comments, streaming.
// Members are compressed in memory — fine for a database of tens of MB, which
// is what this backs up; a streaming writer is the change to make if that
// stops being true.

import { statSync } from "node:fs";
import { crc32, deflateRawSync } from "node:zlib";

export interface ZipEntryInput {
  /** Member name inside the archive (ASCII; `memory.db`, `memory.db-wal`, ...). */
  name: string;
  data: Uint8Array;
  /** Modification time stored as DOS date/time in local time. */
  mtime: Date;
  /** POSIX mode bits, stored in the external attributes like zipfile does. */
  mode: number;
}

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
const VERSION_NEEDED = 20;
const METHOD_DEFLATE = 8;
const UINT32_MAX = 0xffffffff;
const UINT16_MAX = 0xffff;

// `version made by`: high byte is the host system (3 = Unix, 0 = MS-DOS/
// Windows), low byte the zip spec version — the same pair zipfile records.
const CREATE_SYSTEM = process.platform === "win32" ? 0 : 3;

export class Zip64RequiredError extends Error {
  constructor(detail: string) {
    super(`archive needs ZIP64, which this writer does not implement: ${detail}`);
    this.name = "Zip64RequiredError";
  }
}

/** DOS date/time pair for a local-time instant; years before 1980 clamp to 1980. */
export function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(date.getFullYear(), 1980);
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

/** Read a whole file as a member input, stat-derived mtime and mode included. */
export function entryFromFile(path: string, name: string, data: Uint8Array): ZipEntryInput {
  const stat = statSync(path);
  return { name, data, mtime: stat.mtime, mode: stat.mode };
}

interface WrittenEntry {
  input: ZipEntryInput;
  crc: number;
  compressed: Buffer;
  localOffset: number;
  dos: { time: number; date: number };
}

function assertFits(value: number, what: string): void {
  if (value > UINT32_MAX) throw new Zip64RequiredError(`${what} exceeds 4 GiB`);
}

/** Build the complete archive bytes for `entries`, in the given order. */
export function writeZipArchive(entries: readonly ZipEntryInput[]): Buffer {
  if (entries.length > UINT16_MAX) throw new Zip64RequiredError("more than 65535 members");

  const parts: Buffer[] = [];
  const written: WrittenEntry[] = [];
  let offset = 0;

  for (const input of entries) {
    assertFits(input.data.byteLength, `${input.name} uncompressed size`);
    const compressed = deflateRawSync(input.data);
    assertFits(compressed.byteLength, `${input.name} compressed size`);
    assertFits(offset, "archive offset");
    const name = Buffer.from(input.name, "utf8");
    const dos = dosDateTime(input.mtime);
    const crc = crc32(input.data);

    const header = Buffer.alloc(30);
    header.writeUInt32LE(LOCAL_SIG, 0);
    header.writeUInt16LE(VERSION_NEEDED, 4);
    header.writeUInt16LE(0, 6); // flags: no data descriptor, no UTF-8 bit (ASCII names)
    header.writeUInt16LE(METHOD_DEFLATE, 8);
    header.writeUInt16LE(dos.time, 10);
    header.writeUInt16LE(dos.date, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(compressed.byteLength, 18);
    header.writeUInt32LE(input.data.byteLength, 22);
    header.writeUInt16LE(name.byteLength, 26);
    header.writeUInt16LE(0, 28);

    written.push({ input, crc, compressed, localOffset: offset, dos });
    parts.push(header, name, compressed);
    offset += header.byteLength + name.byteLength + compressed.byteLength;
  }

  const centralStart = offset;
  for (const entry of written) {
    const name = Buffer.from(entry.input.name, "utf8");
    const header = Buffer.alloc(46);
    header.writeUInt32LE(CENTRAL_SIG, 0);
    header.writeUInt16LE((CREATE_SYSTEM << 8) | VERSION_NEEDED, 4);
    header.writeUInt16LE(VERSION_NEEDED, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(METHOD_DEFLATE, 10);
    header.writeUInt16LE(entry.dos.time, 12);
    header.writeUInt16LE(entry.dos.date, 14);
    header.writeUInt32LE(entry.crc, 16);
    header.writeUInt32LE(entry.compressed.byteLength, 20);
    header.writeUInt32LE(entry.input.data.byteLength, 24);
    header.writeUInt16LE(name.byteLength, 28);
    header.writeUInt16LE(0, 30); // extra
    header.writeUInt16LE(0, 32); // comment
    header.writeUInt16LE(0, 34); // disk number start
    header.writeUInt16LE(0, 36); // internal attributes
    header.writeUInt32LE(((entry.input.mode & 0xffff) << 16) >>> 0, 38);
    header.writeUInt32LE(entry.localOffset, 42);
    parts.push(header, name);
    offset += header.byteLength + name.byteLength;
  }
  const centralSize = offset - centralStart;
  assertFits(centralStart, "central directory offset");

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(EOCD_SIG, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(written.length, 8);
  eocd.writeUInt16LE(written.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralStart, 16);
  eocd.writeUInt16LE(0, 20);
  parts.push(eocd);

  return Buffer.concat(parts);
}
