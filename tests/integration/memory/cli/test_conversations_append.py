"""CLI integration tests for explicit conversation append."""

from __future__ import annotations

import json
import os
import subprocess
import sys

from memory import MemoryClient
from memory.config import default_db_path_for_home


def _run(home, payload: bytes):
    env = dict(os.environ)
    env["MEMORY_ENV"] = "production"
    return subprocess.run(
        [
            sys.executable,
            "-m",
            "memory",
            "conversations",
            "append",
            "--mirror-home",
            str(home),
            "--format",
            "json",
        ],
        input=payload,
        capture_output=True,
        check=False,
        env=env,
    )


def _payload(conversation_id):
    return {
        "schemaVersion": "1.0.0",
        "conversationId": conversation_id,
        "journeyId": "journey-1",
        "sourceInterface": "external-shell",
        "messages": [
            {
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "role": "user",
                "content": "private content",
                "createdAt": "2026-08-29T12:00:00Z",
                "metadata": {"private": "value"},
            }
        ],
    }


def test_cli_success_and_retry_use_bounded_json_receipts(tmp_path):
    home = tmp_path / "mirror-home"
    mem = MemoryClient(env="test", db_path=default_db_path_for_home(home))
    conversation = mem.start_conversation("test", journey="journey-1")
    payload = json.dumps(_payload(conversation.id), ensure_ascii=False).encode()

    first = _run(home, payload)
    retry = _run(home, payload)

    assert first.returncode == retry.returncode == 0
    first_receipt = json.loads(first.stdout)
    retry_receipt = json.loads(retry.stdout)
    assert first_receipt["messages"][0]["state"] == "inserted"
    assert retry_receipt["messages"][0]["state"] == "existing"
    assert b"private content" not in first.stdout
    assert b"private" not in first.stdout


def test_cli_bounds_recursion_and_unicode_encoding_failures_without_writes(tmp_path):
    home = tmp_path / "mirror-home"
    mem = MemoryClient(env="test", db_path=default_db_path_for_home(home))
    conversation = mem.start_conversation("test", journey="journey-1")
    mem.close()

    deep = _payload(conversation.id)
    deep["messages"][0]["metadata"] = {}
    deep_text = json.dumps(deep, separators=(",", ":"))
    nested_metadata = '{"privateDeep":' * 1_500 + "{}" + "}" * 1_500
    deep_bytes = deep_text.replace('"metadata":{}', f'"metadata":{nested_metadata}').encode()

    surrogate_content = _payload(conversation.id)
    surrogate_content["messages"][0]["content"] = "private-content-\ud800"
    surrogate_metadata = _payload(conversation.id)
    surrogate_metadata["messages"][0]["metadata"] = {"private": "private-metadata-\ud800"}

    cases = [
        deep_bytes,
        json.dumps(surrogate_content).encode(),
        json.dumps(surrogate_metadata).encode(),
    ]
    for payload in cases:
        result = _run(home, payload)
        receipt = json.loads(result.stdout)
        assert result.returncode != 0
        assert receipt["reason"] == "malformed_request"
        assert len(result.stdout) <= 512
        assert b"Traceback" not in result.stdout + result.stderr
        assert b"privateDeep" not in result.stdout
        assert b"private-content" not in result.stdout
        assert b"private-metadata" not in result.stdout

    verify = MemoryClient(env="test", db_path=default_db_path_for_home(home))
    assert verify.store.conn.execute("SELECT COUNT(*) FROM messages").fetchone()[0] == 0
    verify.close()


def test_cli_does_not_echo_invalid_message_id(tmp_path):
    payload = _payload("conversation-1")
    payload["messages"][0]["id"] = "unsafe\nidentifier"

    result = _run(tmp_path / "mirror-home", json.dumps(payload).encode())

    assert result.returncode != 0
    assert json.loads(result.stdout)["reason"] == "malformed_request"
    assert b"unsafe" not in result.stdout


def test_cli_rejects_oversized_stdin_before_json_parse(tmp_path):
    result = _run(tmp_path / "mirror-home", b"{" + b"x" * 262_144)
    assert result.returncode != 0
    assert json.loads(result.stdout)["reason"] == "limit_exceeded"


def test_cli_rejects_invalid_utf8_and_malformed_json_with_bounded_reason(tmp_path):
    invalid = _run(tmp_path / "one", b"\xff")
    malformed = _run(tmp_path / "two", b"{")
    assert invalid.returncode != 0 and malformed.returncode != 0
    assert json.loads(invalid.stdout)["reason"] == "malformed_request"
    assert json.loads(malformed.stdout)["reason"] == "malformed_request"
    assert invalid.stderr == malformed.stderr == b""
