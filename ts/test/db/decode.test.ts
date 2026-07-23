import assert from "node:assert/strict";
import { test } from "node:test";
import { blobToFloat32, embeddingToBytes, parseUtcMs } from "../../src/db/decode.ts";

// Known little-endian IEEE-754 float32 encodings, hardcoded (not produced via
// Float32Array) so this is an independent check of the decode, not a round-trip.
//   1.0  = 0x3F800000 -> 00 00 80 3F
//   0.0  = 0x00000000 -> 00 00 00 00
//   0.5  = 0x3F000000 -> 00 00 00 3F
//  -2.5  = 0xC0200000 -> 00 00 20 C0
const KNOWN_BYTES = [
  0x00, 0x00, 0x80, 0x3f, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x3f, 0x00, 0x00, 0x20, 0xc0,
];

test("blobToFloat32 decodes little-endian float32 bytes to exact values", () => {
  const decoded = blobToFloat32(Uint8Array.from(KNOWN_BYTES));
  assert.deepEqual(Array.from(decoded), [1.0, 0.0, 0.5, -2.5]);
});

test("blobToFloat32 ignores trailing bytes that do not complete a float", () => {
  const decoded = blobToFloat32(Uint8Array.from([...KNOWN_BYTES, 0x01, 0x02, 0x03]));
  assert.equal(decoded.length, 4);
  assert.deepEqual(Array.from(decoded), [1.0, 0.0, 0.5, -2.5]);
});

test("blobToFloat32 handles a non-4-aligned byteOffset (base64/Buffer decode case)", () => {
  // Place the known bytes at offset 1 of a larger buffer so byteOffset is 1.
  const backing = new Uint8Array(KNOWN_BYTES.length + 1);
  backing.set(KNOWN_BYTES, 1);
  const misaligned = backing.subarray(1);
  assert.equal(misaligned.byteOffset, 1);
  const decoded = blobToFloat32(misaligned);
  assert.deepEqual(Array.from(decoded), [1.0, 0.0, 0.5, -2.5]);
});

test("embeddingToBytes is the exact round-trip inverse of blobToFloat32", () => {
  const values = [1.0, 0.0, 0.5, -2.5];
  assert.deepEqual(Array.from(blobToFloat32(embeddingToBytes(values))), values);
});

test("embeddingToBytes encodes to the same known little-endian bytes blobToFloat32 decodes", () => {
  assert.deepEqual(Array.from(embeddingToBytes([1.0, 0.0, 0.5, -2.5])), KNOWN_BYTES);
});

test("parseUtcMs treats a naive string as UTC (matches _parse_datetime_utc)", () => {
  const expected = Date.UTC(2026, 5, 23, 12, 0, 0);
  assert.equal(parseUtcMs("2026-06-23T12:00:00"), expected);
  assert.equal(parseUtcMs("2026-06-23T12:00:00Z"), expected);
});

test("parseUtcMs honors an explicit offset", () => {
  // 09:00:00-03:00 is the same instant as 12:00:00Z.
  assert.equal(parseUtcMs("2026-06-23T09:00:00-03:00"), Date.UTC(2026, 5, 23, 12, 0, 0));
});

test("parseUtcMs returns null for empty or unparseable input", () => {
  assert.equal(parseUtcMs(null), null);
  assert.equal(parseUtcMs(undefined), null);
  assert.equal(parseUtcMs(""), null);
  assert.equal(parseUtcMs("not-a-date"), null);
});
