"""Controlled command execution for allowlisted web operations."""

from __future__ import annotations

import os
import subprocess
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

_ALLOWED_ENV_KEYS = {
    "HOME",
    "LANG",
    "LC_ALL",
    "LOGNAME",
    "PATH",
    "PYTHONPATH",
    "TMPDIR",
    "USER",
    "VIRTUAL_ENV",
}
_DEFAULT_OUTPUT_LIMIT = 12_000


@dataclass(frozen=True)
class ControlledCommand:
    """A server-owned command definition.

    This object intentionally accepts argv, not a shell string. Browser input must
    never be transformed into this object directly.
    """

    id: str
    argv: tuple[str, ...]
    cwd: Path
    timeout_seconds: int = 30
    output_limit: int = _DEFAULT_OUTPUT_LIMIT
    extra_env: Mapping[str, str] | None = None


@dataclass(frozen=True)
class CommandResult:
    command_id: str
    argv: tuple[str, ...]
    cwd: str
    return_code: int | None
    timed_out: bool
    stdout: str
    stderr: str

    @property
    def succeeded(self) -> bool:
        return self.return_code == 0 and not self.timed_out

    def to_dict(self) -> dict[str, object]:
        return {
            "commandId": self.command_id,
            "argv": list(self.argv),
            "cwd": self.cwd,
            "returnCode": self.return_code,
            "timedOut": self.timed_out,
            "stdout": self.stdout,
            "stderr": self.stderr,
            "succeeded": self.succeeded,
        }


def run_controlled_command(command: ControlledCommand) -> CommandResult:
    """Run a code-owned command with bounded output and no shell."""

    if not command.argv:
        raise ValueError("Controlled command argv is required")
    cwd = command.cwd.expanduser().resolve()
    if not cwd.exists() or not cwd.is_dir():
        raise ValueError(f"Controlled command cwd must be an existing directory: {cwd}")
    env = _sanitized_env(command.extra_env)
    try:
        completed = subprocess.run(
            list(command.argv),
            cwd=cwd,
            env=env,
            shell=False,
            check=False,
            capture_output=True,
            text=True,
            timeout=command.timeout_seconds,
        )
    except subprocess.TimeoutExpired as exc:
        return CommandResult(
            command_id=command.id,
            argv=command.argv,
            cwd=cwd.as_posix(),
            return_code=None,
            timed_out=True,
            stdout=_bounded_text(exc.stdout or "", command.output_limit),
            stderr=_bounded_text(exc.stderr or "", command.output_limit),
        )

    return CommandResult(
        command_id=command.id,
        argv=command.argv,
        cwd=cwd.as_posix(),
        return_code=completed.returncode,
        timed_out=False,
        stdout=_bounded_text(completed.stdout, command.output_limit),
        stderr=_bounded_text(completed.stderr, command.output_limit),
    )


def _sanitized_env(extra_env: Mapping[str, str] | None) -> dict[str, str]:
    env = {key: value for key, value in os.environ.items() if key in _ALLOWED_ENV_KEYS}
    if extra_env:
        env.update({key: str(value) for key, value in extra_env.items()})
    return env


def _bounded_text(value: str | bytes, limit: int) -> str:
    text = value.decode("utf-8", errors="replace") if isinstance(value, bytes) else value
    if len(text) <= limit:
        return text
    omitted = len(text) - limit
    return f"{text[:limit]}\n... truncated {omitted} characters"
