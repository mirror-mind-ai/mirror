"""Generate the extension-catalog golden from the Python CLI (CV22.DS7.TS4 plateau 1).

The catalog reads are `extensions list|validate`, `ext list`, `list extensions`,
`inspect extension`, and `inspect runtime-catalog`. Every case here runs the
REAL CLI in a subprocess, one process per case, and records the three things a
shell observes: stdout, stderr, and the exit code.

Why a subprocess and not an in-process call (measured in CV22.DS7.US8 plateau 1,
and the same trap applies here): `memory.config` resolves the home once at
import, so a second case in the same process silently reuses the first case's
paths. A subprocess is also the only way to grade the stream split and the exit
code -- and this family's refusals are the reason that matters. `extensions` and
`ext` are HAND-ROLLED parsers: they print `Usage: ...` to **stdout** and exit
**1**, where the argparse leaves print to stderr and exit 2. The exit codes in
this golden are the contract, not an implementation detail.

The fixture root is rewritten to `<HOME>` in every recorded stream, because the
paths these commands print are absolute and the golden must be byte-stable on
another machine. The generator fails if any absolute path survives.

Usage:
    uv run python ts/parity/generate_extension_catalog_golden.py
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
FIXTURE_HOME = REPO_ROOT / "ts" / "test" / "fixtures" / "extension-catalog" / "home"
GOLDEN_PATH = REPO_ROOT / "ts" / "test" / "fixtures" / "extension-catalog.golden.json"
HOME_TOKEN = "<HOME>"

# (label, argv). `--mirror-home` is appended by the runner unless the case
# already carries one, so a case cannot accidentally read the developer's home.
CASES: list[tuple[str, list[str]]] = [
    # --- extensions -------------------------------------------------------
    ("extensions_bare_defaults_to_list", ["extensions"]),
    ("extensions_list", ["extensions", "list"]),
    ("extensions_list_runtime_pi", ["extensions", "list", "--runtime", "pi"]),
    ("extensions_list_runtime_claude", ["extensions", "list", "--runtime", "claude"]),
    ("extensions_list_runtime_unknown", ["extensions", "list", "--runtime", "zed"]),
    (
        "extensions_list_explicit_root",
        ["extensions", "list", "--extensions-root", "<HOME>/extensions"],
    ),
    ("extensions_list_missing_root", ["extensions", "list", "--extensions-root", "<HOME>/nope"]),
    ("extensions_validate_with_invalid", ["extensions", "validate"]),
    ("extensions_validate_runtime_pi", ["extensions", "validate", "--runtime", "pi"]),
    # Refusal class A: usage on stdout, exit 1.
    ("extensions_unknown_subcommand", ["extensions", "bogus"]),
    ("extensions_install_without_positional", ["extensions", "install"]),
    ("extensions_install_without_root", ["extensions", "install", "ext-alpha"]),
    ("extensions_sync_without_runtime", ["extensions", "sync"]),
    ("extensions_sync_without_target_root", ["extensions", "sync", "--runtime", "pi"]),
    ("extensions_expose_claude_without_target", ["extensions", "expose-claude"]),
    ("extensions_clean_claude_without_target", ["extensions", "clean-claude"]),
    # --- ext --------------------------------------------------------------
    ("ext_list", ["ext", "list"]),
    ("ext_bare_help", ["ext"]),
    ("ext_help_flag", ["ext", "--help"]),
    # --- list -------------------------------------------------------------
    ("list_extensions", ["list", "extensions"]),
    ("list_extensions_runtime_pi", ["list", "extensions", "--runtime", "pi"]),
    (
        "list_extensions_explicit_root",
        ["list", "extensions", "--extensions-root", "<HOME>/extensions"],
    ),
    ("list_unknown_target", ["list", "bogus"]),
    # --- inspect ----------------------------------------------------------
    ("inspect_extension_prompt_skill", ["inspect", "extension", "ext-alpha"]),
    ("inspect_extension_command_skill", ["inspect", "extension", "ext-beta"]),
    ("inspect_extension_invalid", ["inspect", "extension", "ext-broken"]),
    ("inspect_extension_missing", ["inspect", "extension", "ext-nope"]),
    ("inspect_runtime_catalog_pi", ["inspect", "runtime-catalog", "pi"]),
    ("inspect_runtime_catalog_missing", ["inspect", "runtime-catalog", "zed"]),
    ("inspect_runtime_catalog_corrupt", ["inspect", "runtime-catalog", "corrupt"]),
    ("inspect_bare", ["inspect"]),
    ("inspect_unknown_target", ["inspect", "bogus", "x"]),
]


def _environment(home: Path) -> dict[str, str]:
    env = dict(os.environ)
    # Offline and home-pinned: no provider key, no inherited Mirror home, and
    # no TS gate (this generator records PYTHON, always).
    for key in list(env):
        if key.startswith("MIRROR_TS_") or key in {"MIRROR_HOME", "MIRROR_USER", "DB_PATH"}:
            del env[key]
    env["MIRROR_HOME"] = str(home)
    env["MEMORY_ENV"] = "test"
    env["OPENROUTER_API_KEY"] = ""
    env["PYTHONIOENCODING"] = "utf-8"
    return env


def _redact(text: str, home: Path) -> str:
    return text.replace(str(home), HOME_TOKEN)


def main() -> int:
    if not FIXTURE_HOME.exists():
        print(f"fixture home missing: {FIXTURE_HOME}", file=sys.stderr)
        return 1

    # A disposable COPY of the fixture, so a case that writes cannot edit the
    # committed tree -- the trap CV22.DS7.US8 plateau 2 hit for real.
    with tempfile.TemporaryDirectory(prefix="ext-catalog-golden-") as tmp:
        home = Path(tmp) / "vinicius-ts"
        shutil.copytree(FIXTURE_HOME, home)
        env = _environment(home)

        cases: list[dict[str, object]] = []
        for label, argv in CASES:
            resolved = [token.replace(HOME_TOKEN, str(home)) for token in argv]
            if "--mirror-home" not in resolved:
                resolved = [*resolved, "--mirror-home", str(home)]
            completed = subprocess.run(
                [sys.executable, "-m", "memory", *resolved],
                cwd=REPO_ROOT,
                env=env,
                capture_output=True,
                text=True,
            )
            cases.append(
                {
                    "label": label,
                    "argv": argv,
                    "stdout": _redact(completed.stdout, home),
                    "stderr": _redact(completed.stderr, home),
                    "exit_code": completed.returncode,
                }
            )

        leaked = [
            case["label"]
            for case in cases
            if str(home) in str(case["stdout"]) or str(home) in str(case["stderr"])
        ]
        if leaked:
            print(f"absolute fixture path survived redaction in: {leaked}", file=sys.stderr)
            return 1

    document = {
        "_generated_by": "ts/parity/generate_extension_catalog_golden.py",
        "_semantics": (
            "Python's answer for the extension-catalog reads, one subprocess per case. "
            "stdout, stderr, and exit_code are all contract: this family's refusals print "
            "usage to STDOUT and exit 1, unlike the argparse leaves."
        ),
        "home_token": HOME_TOKEN,
        "cases": cases,
    }
    GOLDEN_PATH.write_text(
        json.dumps(document, ensure_ascii=False, indent=2, sort_keys=False) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {GOLDEN_PATH.relative_to(REPO_ROOT)} ({len(cases)} cases)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
