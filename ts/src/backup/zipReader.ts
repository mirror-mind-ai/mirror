// The read half of `ts/src/backup/zipWriter.ts` (CV22.DS10.US2).
//
// Node ships a zip WRITER's primitives (`deflateRawSync`, `crc32`) but no
// reader, and `runtime backup --verify` has to open archives written by three
// different producers: this repository's writer (deflate-raw), Python's
// `zipfile` in the shipped backup path (deflate), and Python's `zipfile`
// defaults in any hand-made archive (STORED). Both methods are supported for
// that reason, not for generality.
//
// Scope is deliberately small: list the central directory, and extract one
// named entry. No streaming, no zip64, no encryption, no directory creation --
// this module never writes to the filesystem, which is also why zip-slip is not
// ITS problem: the caller refuses unsafe names (see `runtime/backup.ts`), and
// nothing here ever turns an entry name into a path.

import { inflateRawSync } from "node:zlib";

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const EOCD_MIN_SIZE = 22;
/** The comment field is 16 bits, so the EOCD starts at most this far from the end. */
const EOCD_MAX_SCAN = EOCD_MIN_SIZE + 0xffff;

const METHOD_STORED = 0;
const METHOD_DEFLATED = 8;

export class NotAReadableZipError extends Error {}

export interface ZipDirectoryEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const earliest = Math.max(0, buffer.length - EOCD_MAX_SCAN);
  for (let offset = buffer.length - EOCD_MIN_SIZE; offset >= earliest; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
  }
  throw new NotAReadableZipError("end of central directory not found");
}

/** The archive's central directory, in the order the archive lists it. */
export function readZipDirectory(buffer: Buffer): ZipDirectoryEntry[] {
  if (buffer.length < EOCD_MIN_SIZE) throw new NotAReadableZipError("file is too small for a zip");
  const eocd = findEndOfCentralDirectory(buffer);
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);

  const entries: ZipDirectoryEntry[] = [];
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > buffer.length) throw new NotAReadableZipError("central directory truncated");
    if (buffer.readUInt32LE(offset) !== CENTRAL_SIGNATURE) {
      throw new NotAReadableZipError("central directory header not found");
    }
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    entries.push({
      // Zip stores names as bytes; `zipfile` writes UTF-8 when the flag is set
      // and cp437 otherwise. Mirror's own entries are ASCII either way.
      name: buffer.toString("utf8", offset + 46, offset + 46 + nameLength),
      method: buffer.readUInt16LE(offset + 10),
      compressedSize: buffer.readUInt32LE(offset + 20),
      uncompressedSize: buffer.readUInt32LE(offset + 24),
      localHeaderOffset: buffer.readUInt32LE(offset + 42),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** Every entry name, sorted — the oracle's `sorted(zf.namelist())`. */
export function readZipEntryNames(buffer: Buffer): string[] {
  return readZipDirectory(buffer)
    .map((entry) => entry.name)
    .sort();
}

/** The bytes of one named entry, or null when the archive does not hold it. */
export function readZipEntry(buffer: Buffer, name: string): Buffer | null {
  const entry = readZipDirectory(buffer).find((candidate) => candidate.name === name);
  if (entry === undefined) return null;

  const header = entry.localHeaderOffset;
  if (header + 30 > buffer.length) throw new NotAReadableZipError("local header truncated");
  if (buffer.readUInt32LE(header) !== LOCAL_SIGNATURE) {
    throw new NotAReadableZipError("local header not found");
  }
  // The local header's own name/extra lengths are authoritative for the data
  // offset: `zipfile` pads extra fields differently from the central copy.
  const nameLength = buffer.readUInt16LE(header + 26);
  const extraLength = buffer.readUInt16LE(header + 28);
  const start = header + 30 + nameLength + extraLength;
  const data = buffer.subarray(start, start + entry.compressedSize);

  if (entry.method === METHOD_STORED) return Buffer.from(data);
  if (entry.method === METHOD_DEFLATED) {
    try {
      return inflateRawSync(data);
    } catch (error) {
      throw new NotAReadableZipError(`entry '${name}' could not be inflated: ${String(error)}`);
    }
  }
  throw new NotAReadableZipError(`entry '${name}' uses unsupported compression ${entry.method}`);
}
