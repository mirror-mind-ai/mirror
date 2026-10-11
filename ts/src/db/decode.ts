// Core decoders for on-disk value shapes (originally CV22.DS2.TS2).
//
// These two functions turn the exact on-disk shapes the Python core writes
// (little-endian float32 embedding BLOBs, ISO timestamps) into the values the
// ranker consumes. They live in the db layer because both the production core
// (search/ranker.ts) and the parity harness depend on them — the dependency
// flows downward into the core, never from core into parity (CR006).

/**
 * Decode a little-endian IEEE-754 float32 BLOB into a `Float32Array`.
 *
 * The Python core stores embeddings as `np.float32(...).tobytes()`
 * (see `memory.intelligence.embeddings.embedding_to_bytes`), i.e. packed
 * little-endian 4-byte floats. We decode via `DataView` with an explicit
 * little-endian flag so the result is independent of both the platform byte
 * order and the byte alignment of the incoming view (a base64/Buffer decode can
 * hand us a non-4-aligned `byteOffset`, which the `new Float32Array(buffer, …)`
 * view constructor rejects).
 *
 * Trailing bytes that do not complete a 4-byte float are ignored, matching
 * `np.frombuffer(data, dtype=np.float32)`.
 */
export function blobToFloat32(bytes: Uint8Array): Float32Array {
  const count = Math.floor(bytes.byteLength / 4);
  const out = new Float32Array(count);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < count; i++) {
    out[i] = view.getFloat32(i * 4, /* littleEndian */ true);
  }
  return out;
}

/**
 * Encode a vector as a little-endian IEEE-754 float32 BLOB -- the counterpart
 * to `blobToFloat32` and a byte-for-byte match of Python's
 * `embedding_to_bytes` (`np.float32(...).tobytes()`). Shared by every writer
 * that stores a freshly generated embedding (conversation extraction,
 * cultivation's `merge` action), so the encode step has exactly one
 * implementation, matching `blobToFloat32`'s single decode implementation.
 */
export function embeddingToBytes(values: readonly number[]): Uint8Array {
  const buffer = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => {
    buffer.writeFloatLE(value, index * 4);
  });
  return buffer;
}

/**
 * Parse a stored ISO timestamp into epoch milliseconds (UTC), or `null`.
 *
 * Mirrors `memory.intelligence.search._parse_datetime_utc`: naive strings are
 * treated as UTC, while Z-suffixed and offset-aware strings are honored as
 * written. Returns `null` for empty/unparseable input (the Python helper returns
 * `None`, which the ranker treats as a neutral default).
 *
 * Millisecond precision is intentional: JS `Date` is millisecond-resolution, so
 * the golden generator records epoch-ms references truncated to the same
 * granularity.
 */
export function parseUtcMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const hasTz = /[zZ]$|[+-]\d\d:\d\d$/.test(value);
  const ms = Date.parse(hasTz ? value : `${value}Z`);
  return Number.isNaN(ms) ? null : ms;
}
