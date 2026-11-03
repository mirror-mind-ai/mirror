[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR194 — Text piped from Windows PowerShell reaches `identity set` and `journey update -` as UTF-16 or as ASCII, and is stored as it arrives

## Problem

`identity set` without `--content` and `journey update <slug> -` read their text from
stdin, decoded as UTF-8 (`readStdinContent`, `ts/src/frontDoor/cli.ts`). PR #49 drops
the one leading byte-order mark PowerShell writes; that was the case that produced a
clean entry with one stray character. The two other things Windows PowerShell 5.1 does
to piped text produce garbage, and nothing refuses it:

- `mirror journey update s - < file`, where `file` was written with `>` in Windows
  PowerShell 5.1, is UTF-16LE: `FF FE` and a NUL after every ASCII byte. Decoded as
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
PR #49's review.

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

Pending: captured, not planned.
