[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR194 — Text piped from Windows PowerShell reaches `identity set` and `journey update -` as UTF-16 or as ASCII, and is stored as it arrives

## Problem

`identity set` without `--content` and `journey update <slug> -` read their text from
stdin, decoded as UTF-8 (`readStdinContent`, `ts/src/frontDoor/cli.ts`). PR #49 drops
the one leading byte-order mark PowerShell writes; that was the case that produced a
clean entry with one stray character. The two other things Windows PowerShell 5.1 does
to piped text produce garbage, and nothing refuses it:

- `mirror journey update s - < file` from `cmd.exe` or bash, where `file` was written
  with `>` in Windows PowerShell 5.1, is UTF-16LE (PowerShell itself has no `<`; a
  `Get-Content file | …` of the same file decodes it and re-encodes it as the next
  case): `FF FE` and a NUL after every ASCII byte. Decoded as
  UTF-8, the content stored is two replacement characters and the text interleaved with
  NULs.
- `Get-Content perfil.md | mirror identity set ego perfil` goes through
  `$OutputEncoding`, whose default in Windows PowerShell 5.1 is ASCII: every character
  outside ASCII arrives as `?`. Mirror's users write in Portuguese; an identity entry
  piped this way loses every accent and `ç`, and the row is written.

PowerShell 7 defaults both to UTF-8 without a mark, so the hazard is the 5.1 that
ships with Windows. Neither case is a defect in the two commands' logic; both are
input arriving in an encoding the reader was not told about, and stored as it arrived.

## Expected Behavior

- A stdin that begins with a UTF-16 mark (`FF FE`, `FE FF`) is decoded as UTF-16 of
  that endianness before anything else looks at it; the mark is dropped as the UTF-8
  one is.
- The Windows troubleshooting page names the three PowerShell 5.1 behaviors (the UTF-8
  mark, `>` as UTF-16LE, `$OutputEncoding` ASCII) beside the one-line fix for each
  (`$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new()`, or
  PowerShell 7), and `--content` as the route that bypasses stdin.
- Decision for Plan: whether content that arrives through stdin with `?` where
  letters were is detectable at all without guessing, and if not, whether the doc line
  is the whole answer for that case.

## Impact

Low frequency, high cost when met: an identity entry is the mirror's own voice, and a
version with every accent replaced is wrong in a way that reads as careless rather than
broken. Windows is not a supported product surface today (CR189: "there is still no
Windows product"), which bounds the urgency; the fix is a few lines in one reader.

## Plan Or Decision

Captured, unassigned, 2026-11-02, at the Navigator's direction, from the DevOps lens of
PR #49's review. Selected as Current Focus and planned the same day.

### The ASCII question, answered

Content that arrived through an ASCII pipe is not detectable: a `?` is a legitimate
character, and "`?` where a letter would be" is a guess about the language. The answer is
not to detect it but to give the text a route that never goes through the pipe: a
`--file <path>` option, read by Mirror itself as bytes. An editor on Windows writes UTF-8
(with or without a mark) or, from PowerShell 5.1's `>`, UTF-16LE; the one decoder below
reads all three. The doc names `--file` as the PowerShell route, and the shell fix for
anyone who wants the pipe.

### Scope

1. **One decoder for human text input**, `ts/src/frontDoor/textInput.ts`:
   `decodeTextInput(bytes: Buffer): string`. `FF FE` → UTF-16LE, mark dropped; `FE FF` →
   UTF-16BE, swapped and decoded, mark dropped; else UTF-8 with one leading U+FEFF
   dropped, as PR #49 does. Nothing else about the content is touched.
2. **`readStdinContent` reads bytes** (`readFileSync(0)`) and decodes through it. The
   two commands that call it are unchanged in every other way.
3. **`--file <path>`** on `identity set` and `journey update`: the file's bytes through
   the same decoder. `identity set <layer> <key> --file perfil.md`;
   `journey update <slug> --file caminho.md` (content positional omitted). `--file` with
   `--content`, or with `-`, is refused in one line; a file that cannot be read is
   refused naming the path; empty decoded content is refused as it is today.
4. **Docs.** `REFERENCE.md`'s `/mm-identity` and `/mm-journey` rows gain `--file`;
   `.pi/skills/mm-identity/SKILL.md` and `mm-journey/SKILL.md` show it beside the pipe
   form (and the plugin copies regenerate, `buildClaudePlugin.ts`);
   `docs/process/troubleshooting.md` gains a section beside the mojibake one: the three
   PowerShell 5.1 behaviors (the UTF-8 mark, `>` as UTF-16LE, `$OutputEncoding` ASCII),
   `--file` as the route that avoids all three, and the shell fix
   (`$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new()`, or
   PowerShell 7) for the pipe.

### Affected files

- `ts/src/frontDoor/textInput.ts` (new), `ts/src/frontDoor/cli.ts`.
- `ts/test/frontDoor/textInput.test.ts` (new), `ts/test/frontDoor/identityWriteCli.test.ts`,
  the journey update test file.
- `REFERENCE.md`, `.pi/skills/mm-identity/SKILL.md`, `.pi/skills/mm-journey/SKILL.md`
  and their generated plugin copies, `docs/process/troubleshooting.md`.

### Acceptance

1. `identity set` fed UTF-16LE bytes with a mark on stdin stores the text, accents
   intact, no mark; the same for UTF-16BE and for UTF-8 with a mark.
2. `identity set … --file` of a UTF-8 file with Portuguese text stores it byte-for-byte;
   of a UTF-16LE file, the same text.
3. `journey update <slug> --file` likewise; `--file` with `--content` or `-` is refused
   without writing; a missing file is refused naming it, without writing.
4. Plain UTF-8 on stdin, no mark, is stored as before: every existing test passes
   unchanged.
5. The troubleshooting section exists and `checkDocLinks` is clean; the plugin copies
   are in sync.

### Validation

Automated: the decoder's unit tests (UTF-8 plain, UTF-8 mark, UTF-16LE, UTF-16BE, empty,
mark alone); the front-door tests above through `spawnFrontDoor` with a `Buffer` on
stdin. By the Navigator: `mirror identity set ego probe --file <a UTF-8 file with
accents>` on this machine, read back with `identity get`, then removed. A PowerShell
5.1 run is not available here and is recorded as not measured.

### Exclusions

- Detecting ASCII-replaced content: not possible without guessing.
- The JSON stdin readers (`takeStdin`, the hooks' `readStdin`, `conversations append`):
  payloads from runtimes, which write UTF-8 without a mark.
- `identity edit`, which opens an editor and reads no stdin.

### Lenses

- **Engineer.** One decoder, two callers, one new option parsed the way `--content` is
  (`optionValue`, `stripOptionWithValue`); no new dependency.
- **Quality assurance.** Each encoding through the real front door; the refusal pairs
  (`--file` + `--content`, `--file` + `-`, missing file) pinned as writing nothing.
- **Security engineer.** `--file` reads a path the user names, as `--db-path` and
  `--mirror-home` already do; it is read, never written, and never logged. The decoder
  interprets two marks and nothing else.
- **DevOps engineer.** The doc section is the operational answer for the case code
  cannot see; it names PowerShell 7 as the version where none of this happens.

### Decisions Taken At Approval

Reviewed through six lenses on 2026-11-02 (engineer, quality assurance, security engineer,
product designer, writer, DevOps engineer); approved by the Navigator the same day with
the amendments folded. Driver `@viniciusteles`, Delivery `main`.

1. **Engineer.** `spawnFrontDoor`'s `input` widens to `string | Buffer`; callers unchanged.
2. **Engineer.** `--file` expands `~` as `--mirror-home` does; a relative path resolves
   against the cwd, as `--db-path` does.
3. **Engineer.** UTF-16 without a mark is undetectable and stays out of scope, said in
   the decoder's comment.
4. **Quality assurance.** Each refusal is pinned as writing nothing: the row is read
   back and not found.
5. **Quality assurance.** The encoding matrix lives in the decoder's unit tests; the
   front-door tests carry one UTF-16LE case and one `--file` case per command.
6. **Quality assurance / DevOps.** PowerShell 5.1 is not measurable here. After release,
   ask Rodrigo Immaginario on PR #49's thread to try the pipe with and without the shell
   fix, and `--file`.
7. **Security engineer.** A directory is refused with the same line as a missing file,
   naming the path and nothing from the error's internals; a refusal never echoes
   content. No cap: stdin has none, and the operator is the user.
8. **Product designer.** `--file` is the route for any text longer than a line, on every
   platform, and the only safe one on PowerShell 5.1; the pipe stays as the one-liner
   form. The skills and REFERENCE say it that way.
9. **Writer.** The troubleshooting section takes the page's shape: a symptom as title
   ("Text piped from PowerShell loses its accents, or arrives as UTF-16"), then Symptom,
   Root cause, Diagnosis, Fix; PowerShell 7 named as the version where none of it happens.
10. **Writer.** REFERENCE's `/mm-identity` and `/mm-journey` rows gain `--file PATH` beside
    `--content`, nothing more there.
11. **DevOps engineer.** The shell fix sets both sides,
    `$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new()`, named as a
    per-session setting or a `$PROFILE` line; `::new()` exists in 5.1; no `chcp`.

## Evidence

- PR #49, merged 2026-11-02 as `6a24b0bd`: the UTF-8 mark case, and the 2026-10-17
  incident it names (an identity entry whose first character was U+FEFF, repaired by
  hand from a backup).
- `readStdinContent` in `ts/src/frontDoor/cli.ts`: `readFileSync(0, "utf8")`, then the
  mark check; the only reader of human text on stdin (`takeStdin` and the hooks'
  `readStdin` carry JSON payloads from runtimes).
- Windows PowerShell 5.1 documentation: `>` and `Out-File` default to UTF-16LE
  (`-Encoding Unicode`); `$OutputEncoding` defaults to ASCII for native commands.
  PowerShell 7: UTF-8 without a mark for both.

## Outcome

Pending: planned, approved 2026-11-02; implementation on `main`.
