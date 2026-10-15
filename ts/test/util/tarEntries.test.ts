// CR134 — named entries out of a gzipped tar archive, in memory.
//
// A package's pending release notes are read from the channel version's
// tarball, which crosses a trust boundary: the registry is whatever the npm
// config names (CR135). The reader keeps only the entries it is asked for,
// writes nothing, and stops at a bound on inflated bytes. The archives here are
// built by the system's own `tar` -- bsdtar on macOS, GNU tar on the ubuntu
// runner -- so both long-name encodings, pax `x` headers and GNU `L` entries,
// are met on the way to the note behind them.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { gunzipSync, gzipSync } from "node:zlib";
import { readTarGzEntries } from "#util/tarEntries.ts";

const NOTE = /^package\/docs\/releases\/v\d+\.\d+\.\d+\.md$/;
const LONG_DIR = `package/${"a".repeat(70)}/${"b".repeat(70)}`;
const NOTE_PATH = "package/docs/releases/v1.2.3.md";

function archive(): { gz: Buffer; cleanup: () => void } {
  const root = realpathSync(mkdtempSync("/tmp/tar-entries-"));
  mkdirSync(join(root, LONG_DIR), { recursive: true });
  mkdirSync(join(root, "package", "docs", "releases"), { recursive: true });
  writeFileSync(join(root, LONG_DIR, "long-named.txt"), "far down\n");
  writeFileSync(join(root, "package", "docs", "releases", "index.md"), "# Releases\n");
  writeFileSync(join(root, NOTE_PATH), "# v1.2.3 — Found\n");
  const out = join(root, "out.tgz");
  // The long name goes first: a reader that mis-skips its encoding never
  // reaches the note after it, or reads it under the wrong name.
  execFileSync(
    "tar",
    [
      "-czf",
      out,
      "-C",
      root,
      `${LONG_DIR}/long-named.txt`,
      "package/docs/releases/index.md",
      NOTE_PATH,
    ],
    { env: { ...process.env, COPYFILE_DISABLE: "1" } },
  );
  return { gz: readFileSync(out), cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function refused(read: ReturnType<typeof readTarGzEntries>): string {
  assert.equal(read.ok, false, "expected a refusal");
  return read.ok ? "" : read.detail;
}

test("keeps only the entries asked for, after a long name in either encoding", () => {
  const a = archive();
  try {
    const read = readTarGzEntries(a.gz, (name) => NOTE.test(name));
    assert.ok(read.ok, read.ok ? "" : read.detail);
    assert.deepEqual([...read.entries.keys()], [NOTE_PATH]);
    assert.equal(read.entries.get(NOTE_PATH)?.toString("utf8"), "# v1.2.3 — Found\n");
  } finally {
    a.cleanup();
  }
});

test("names a long entry in full, not by its truncated header", () => {
  const a = archive();
  try {
    const read = readTarGzEntries(a.gz, (name) => name.endsWith("long-named.txt"));
    assert.ok(read.ok, read.ok ? "" : read.detail);
    assert.deepEqual([...read.entries.keys()], [`${LONG_DIR}/long-named.txt`]);
    assert.equal(read.entries.get(`${LONG_DIR}/long-named.txt`)?.toString("utf8"), "far down\n");
  } finally {
    a.cleanup();
  }
});

test("stops at the bound on inflated bytes", () => {
  // A small gzip that inflates far past its size: the shape of the attack.
  const bomb = gzipSync(Buffer.alloc(2 * 1024 * 1024));
  assert.ok(bomb.length < 16 * 1024, "the fixture is a small gzip");
  assert.match(refused(readTarGzEntries(bomb, () => true, 1024 * 1024)), /more than 1048576 bytes/);

  const a = archive();
  try {
    assert.match(refused(readTarGzEntries(a.gz, () => true, 1024)), /more than 1024 bytes/);
  } finally {
    a.cleanup();
  }
});

test("a truncated archive is refused, not half-read", () => {
  const a = archive();
  try {
    // The gzip stream cut short.
    assert.match(refused(readTarGzEntries(a.gz.subarray(0, a.gz.length - 20), () => true)), /gzip/);
    // A whole gzip of a tar cut inside its first entry's data.
    const tar = gunzipSync(a.gz);
    assert.match(
      refused(readTarGzEntries(gzipSync(tar.subarray(0, 512 + 10)), () => true)),
      /truncated/,
    );
  } finally {
    a.cleanup();
  }
});

test("a header whose checksum does not add up is refused", () => {
  const a = archive();
  try {
    const tar = Buffer.from(gunzipSync(a.gz));
    tar[0] = (tar[0] as number) ^ 0x01;
    assert.match(refused(readTarGzEntries(gzipSync(tar), () => true)), /checksum/);
  } finally {
    a.cleanup();
  }
});

test("what is not a gzipped tar is refused", () => {
  assert.match(refused(readTarGzEntries(Buffer.from("plain text"), () => true)), /gzip/);
  assert.match(
    refused(readTarGzEntries(gzipSync(Buffer.from("not a tar archive")), () => true)),
    /truncated/,
  );
});
