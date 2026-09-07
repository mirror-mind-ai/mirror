// Minimal ZIP reader for tests: walks the central directory, inflates each
// member, and verifies its CRC-32 — the equivalent of Python's
// `zipfile.testzip()` plus `infolist()`, without a dependency. Enough to grade
// the restore image (names, order, sizes, CRCs, DOS times); not a general
// unzip (no ZIP64, no encryption, no data descriptors — the writer under test
// emits none of those).

import { readFileSync } from "node:fs";
import { crc32, inflateRawSync } from "node:zlib";

export interface ZipMember {
  name: string;
  crc32: number;
  size: number;
  compress_type: number;
  date_time: number[];
}

const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;
const EOCD_SIG = 0x06054b50;

function dosDateTime(dosTime: number, dosDate: number): number[] {
  return [
    ((dosDate >> 9) & 0x7f) + 1980,
    (dosDate >> 5) & 0x0f,
    dosDate & 0x1f,
    (dosTime >> 11) & 0x1f,
    (dosTime >> 5) & 0x3f,
    (dosTime & 0x1f) * 2,
  ];
}

/** List members in central-directory order, verifying every member's CRC-32. */
export function inspectZip(path: string): ZipMember[] {
  const buffer = readFileSync(path);
  let eocd = -1;
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIG) {
      eocd = offset;
      break;
    }
  }
  if (eocd === -1) throw new Error(`${path}: no end-of-central-directory record`);
  const entries = buffer.readUInt16LE(eocd + 10);
  let cursor = buffer.readUInt32LE(eocd + 16);

  const members: ZipMember[] = [];
  for (let index = 0; index < entries; index += 1) {
    if (buffer.readUInt32LE(cursor) !== CENTRAL_SIG) throw new Error(`${path}: bad central header`);
    const method = buffer.readUInt16LE(cursor + 10);
    const dosTime = buffer.readUInt16LE(cursor + 12);
    const dosDate = buffer.readUInt16LE(cursor + 14);
    const crc = buffer.readUInt32LE(cursor + 16);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const size = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");

    if (buffer.readUInt32LE(localOffset) !== LOCAL_SIG)
      throw new Error(`${path}: bad local header for ${name}`);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    const data = method === 8 ? inflateRawSync(compressed) : compressed;
    if (data.length !== size || crc32(data) !== crc)
      throw new Error(`${path}: ${name} fails CRC/size check`);

    members.push({
      name,
      crc32: crc,
      size,
      compress_type: method,
      date_time: dosDateTime(dosTime, dosDate),
    });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return members;
}
