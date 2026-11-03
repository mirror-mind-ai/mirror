// CR134 — named entries out of a gzipped tar archive, in memory.
//
// A package's pending release notes are read from the channel version's
// tarball, which crosses a trust boundary: the registry is whatever the npm
// config names (CR135). The reader keeps only the entries it is asked for,
// writes nothing, and stops at a bound on inflated bytes.
//
// The archives are built by the system's own `tar`, in two layouts, because
// where an entry's bytes fall depends on the writer. The default layout meets
// a long-name encoding on the way to the note -- bsdtar on macOS writes pax `x`
// headers, GNU tar on the ubuntu runner `L` entries -- and `--format=ustar`,
// which both accept, splits the same long path across the `prefix` field
// instead. CI at 565b7b97 failed a truncation case that held only for the
// first layout: a macOS runner's bsdtar wrote plain ustar where this Mac's
// wrote pax, and the reader accepted an archive cut inside the first entry's
// padding. Every case here now runs on both layouts.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { gunzipSync, gzipSync } from "node:zlib";
import { tempDir } from "#helpers/tempDir.ts";
import { readTarGzEntries } from "#util/tarEntries.ts";

const NOTE = /^package\/docs\/releases\/v\d+\.\d+\.\d+\.md$/;
const LONG_DIR = `package/${"a".repeat(70)}/${"b".repeat(70)}`;
const LONG_PATH = `${LONG_DIR}/long-named.txt`;
const NOTE_PATH = "package/docs/releases/v1.2.3.md";
const LAYOUTS = [
  { label: "the system tar's default layout", flags: [] as string[] },
  { label: "ustar, the long path split across prefix and name", flags: ["--format=ustar"] },
];

function archive(flags: string[]): { gz: Buffer; cleanup: () => void } {
  const root = tempDir("tar-entries-");
  mkdirSync(join(root, LONG_DIR), { recursive: true });
  mkdirSync(join(root, "package", "docs", "releases"), { recursive: true });
  writeFileSync(join(root, LONG_PATH), "far down\n");
  writeFileSync(join(root, "package", "docs", "releases", "index.md"), "# Releases\n");
  writeFileSync(join(root, NOTE_PATH), "# v1.2.3 — Found\n");
  const out = join(root, "out.tgz");
  // The long name goes first: a reader that mis-skips its encoding never
  // reaches the note after it, or reads it under the wrong name.
  execFileSync(
    "tar",
    [...flags, "-czf", out, "-C", root, LONG_PATH, "package/docs/releases/index.md", NOTE_PATH],
    { env: { ...process.env, COPYFILE_DISABLE: "1" } },
  );
  return { gz: readFileSync(out), cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function eachLayout(body: (gz: Buffer, label: string) => void): void {
  for (const layout of LAYOUTS) {
    const a = archive(layout.flags);
    try {
      body(a.gz, layout.label);
    } finally {
      a.cleanup();
    }
  }
}

function refused(read: ReturnType<typeof readTarGzEntries>, label: string): string {
  assert.equal(read.ok, false, `${label}: expected a refusal, got an archive accepted`);
  return read.ok ? "" : read.detail;
}

/** Where the last block that is not all zeroes ends: the archive minus its end-of-archive blocks. */
function lastEntryEnd(tar: Buffer): number {
  for (let end = tar.length; end >= 512; end -= 512) {
    if (!tar.subarray(end - 512, end).every((byte) => byte === 0)) return end;
  }
  return 0;
}

test("keeps only the entries asked for, after a long name", () => {
  eachLayout((gz, label) => {
    const read = readTarGzEntries(gz, (name) => NOTE.test(name));
    assert.ok(read.ok, `${label}: ${read.ok ? "" : read.detail}`);
    assert.deepEqual([...read.entries.keys()], [NOTE_PATH], label);
    assert.equal(read.entries.get(NOTE_PATH)?.toString("utf8"), "# v1.2.3 — Found\n", label);
  });
});

test("names a long entry in full, not by its truncated header", () => {
  eachLayout((gz, label) => {
    const read = readTarGzEntries(gz, (name) => name.endsWith("long-named.txt"));
    assert.ok(read.ok, `${label}: ${read.ok ? "" : read.detail}`);
    assert.deepEqual([...read.entries.keys()], [LONG_PATH], label);
    assert.equal(read.entries.get(LONG_PATH)?.toString("utf8"), "far down\n", label);
  });
});

test("stops at the bound on inflated bytes", () => {
  // A small gzip that inflates far past its size: the shape of the attack.
  const bomb = gzipSync(Buffer.alloc(2 * 1024 * 1024));
  assert.ok(bomb.length < 16 * 1024, "the fixture is a small gzip");
  assert.match(
    refused(
      readTarGzEntries(bomb, () => true, 1024 * 1024),
      "bomb",
    ),
    /more than 1048576 bytes/,
  );
  eachLayout((gz, label) => {
    assert.match(
      refused(
        readTarGzEntries(gz, () => true, 1024),
        label,
      ),
      /more than 1024 bytes/,
    );
  });
});

test("a truncated archive is refused, not half-read", () => {
  eachLayout((gz, label) => {
    // The gzip stream cut short.
    assert.match(
      refused(
        readTarGzEntries(gz.subarray(0, gz.length - 20), () => true),
        label,
      ),
      /gzip/,
    );
    // Whole gzip streams of a tar cut short: inside the first header, just past
    // it -- inside the first entry's data or its padding, depending on the
    // layout -- and cleanly after the last entry, with the end-of-archive
    // blocks gone. The last is the half-read this guards against: every entry
    // whole, and nothing to say none came after them.
    const tar = gunzipSync(gz);
    for (const cut of [100, 512 + 10, lastEntryEnd(tar)]) {
      assert.match(
        refused(
          readTarGzEntries(gzipSync(tar.subarray(0, cut)), () => true),
          `${label}, cut at ${cut}`,
        ),
        /truncated/,
        `${label}, cut at ${cut}`,
      );
    }
  });
});

test("a header whose checksum does not add up is refused", () => {
  eachLayout((gz, label) => {
    const tar = Buffer.from(gunzipSync(gz));
    tar[0] = (tar[0] as number) ^ 0x01;
    assert.match(
      refused(
        readTarGzEntries(gzipSync(tar), () => true),
        label,
      ),
      /checksum/,
    );
  });
});

test("what is not a gzipped tar is refused", () => {
  assert.match(
    refused(
      readTarGzEntries(Buffer.from("plain text"), () => true),
      "plain",
    ),
    /gzip/,
  );
  assert.match(
    refused(
      readTarGzEntries(gzipSync(Buffer.from("not a tar archive")), () => true),
      "short",
    ),
    /truncated/,
  );
});
