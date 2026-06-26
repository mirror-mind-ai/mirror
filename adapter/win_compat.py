"""Windows compatibility adapter for Mirror Mind.

Loaded via PYTHONSTARTUP before any Mirror code runs.
Monkey-patches Python builtins to fix Windows-specific issues:
  1. builtins.open — injects encoding="utf-8" for text mode when absent
  2. subprocess.Popen — converts string commands to lists (prevents shell quoting issues)
  3. os.environ["EDITOR"] fallback — uses notepad.exe instead of nano

Run with --selftest to validate patches in isolation.
"""

from __future__ import annotations

import builtins
import os
import platform
import shlex
import subprocess
import sys

if platform.system() != "Windows":
    pass  # No-op on non-Windows; adapter only patches when needed
else:
    # --- 1. Patch builtins.open to default to UTF-8 ---

    _original_open = builtins.open

    def _patched_open(*args, **kwargs):
        # Only inject encoding for text mode (not binary)
        mode = args[1] if len(args) > 1 else kwargs.get("mode", "r")
        if "b" not in (mode or "r") and "encoding" not in kwargs:
            # Check positional args: open(file, mode, buffering, encoding)
            if len(args) < 4:
                kwargs["encoding"] = "utf-8"
        return _original_open(*args, **kwargs)

    builtins.open = _patched_open

    # Also patch pathlib.Path.read_text to default to UTF-8
    import pathlib

    _original_read_text = pathlib.Path.read_text

    def _patched_read_text(self, encoding=None, errors=None):
        if encoding is None:
            encoding = "utf-8"
        return _original_read_text(self, encoding=encoding, errors=errors)

    pathlib.Path.read_text = _patched_read_text

    # --- 2. Patch subprocess.Popen to convert str commands to list ---

    _original_popen_init = subprocess.Popen.__init__

    def _patched_popen_init(self, args, *a, **kw):
        if isinstance(args, str) and not kw.get("shell", False):
            try:
                args = shlex.split(args)
            except ValueError:
                pass  # Keep original if shlex can't parse
        _original_popen_init(self, args, *a, **kw)

    subprocess.Popen.__init__ = _patched_popen_init

    # --- 3. Editor fallback ---

    if not os.environ.get("EDITOR") and not os.environ.get("VISUAL"):
        os.environ["EDITOR"] = "notepad.exe"


# --- Self-test ---

def _selftest():
    import io
    import tempfile

    print("win_compat.py self-test")
    print("=" * 40)
    errors = 0

    # Test 1: open() defaults to UTF-8
    print("[TEST 1] builtins.open UTF-8 default...")
    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False,
                                      encoding="utf-8") as f:
        f.write("café résumé naïve")
        tmp = f.name
    try:
        with open(tmp, "r") as f:
            content = f.read()
        assert content == "café résumé naïve", f"Got: {content!r}"
        print("  OK")
    except Exception as e:
        print(f"  FAIL: {e}")
        errors += 1
    finally:
        os.unlink(tmp)

    # Test 2: Path.read_text defaults to UTF-8
    print("[TEST 2] Path.read_text UTF-8 default...")
    from pathlib import Path
    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False,
                                      encoding="utf-8") as f:
        f.write("São Paulo — açaí")
        tmp = f.name
    try:
        content = Path(tmp).read_text()
        assert content == "São Paulo — açaí", f"Got: {content!r}"
        print("  OK")
    except Exception as e:
        print(f"  FAIL: {e}")
        errors += 1
    finally:
        os.unlink(tmp)

    # Test 3: subprocess str-to-list conversion
    print("[TEST 3] subprocess str-to-list conversion...")
    try:
        result = subprocess.run("python --version", capture_output=True, text=True)
        assert result.returncode == 0, f"returncode={result.returncode}"
        print(f"  OK ({result.stdout.strip()})")
    except Exception as e:
        print(f"  FAIL: {e}")
        errors += 1

    # Test 4: EDITOR fallback
    print("[TEST 4] EDITOR fallback...")
    editor = os.environ.get("EDITOR", "")
    if platform.system() == "Windows":
        assert "notepad" in editor.lower() or os.environ.get("VISUAL"), \
            f"EDITOR={editor!r}"
        print(f"  OK (EDITOR={editor})")
    else:
        print("  SKIP (not Windows)")

    print("=" * 40)
    if errors:
        print(f"FAILED: {errors} test(s)")
        sys.exit(1)
    else:
        print("ALL PASSED")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        _selftest()
    else:
        print("Usage: python win_compat.py --selftest")
        print("Normal usage: set PYTHONSTARTUP to this file's path.")
