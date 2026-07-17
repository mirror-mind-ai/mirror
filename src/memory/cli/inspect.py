"""Inspect database state: personas, journeys, and identity layers."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


def _extract_status(content: str) -> str:
    match = re.search(r"\*\*Status:\*\*\s*(\w+)", content)
    return match.group(1) if match else "unknown"


def _extract_description(content: str) -> str:
    match = re.search(r"## Descrição\s*\n+(.+?)(?:\n\n|\n##)", content, re.DOTALL)
    if not match:
        match = re.search(r"## Description\s*\n+(.+?)(?:\n\n|\n##)", content, re.DOTALL)
    return match.group(1).strip()[:120] if match else ""


def _parse_common_args(args: list[str]) -> tuple[str | None, list[str], bool]:
    mirror_home = None
    verbose = False
    positional: list[str] = []
    i = 0
    while i < len(args):
        if args[i] == "--mirror-home" and i + 1 < len(args):
            mirror_home = args[i + 1]
            i += 2
        elif args[i] == "--verbose":
            verbose = True
            i += 1
        else:
            positional.append(args[i])
            i += 1
    return mirror_home, positional, verbose


def _load_mem(mirror_home: str | None):
    from memory.cli.common import db_path_from_mirror_home
    from memory.client import MemoryClient

    return MemoryClient(db_path=db_path_from_mirror_home(mirror_home))


def _persona_metadata(identity) -> dict:
    if not identity.metadata:
        return {}
    try:
        data = json.loads(identity.metadata)
        return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, TypeError):
        return {}


def cmd_list(args: list[str]) -> None:
    """python -m memory list [personas|journeys|extensions|all] [--mirror-home PATH] [--verbose] [--extensions-root PATH] [--runtime NAME]"""
    from memory.cli.extensions import (
        discover_extensions,
        filter_manifests_for_runtime,
        print_extension_list,
        resolve_extensions_root,
    )
    from memory.models import Identity

    mirror_home, positional, verbose = _parse_common_args(args)
    extensions_root = None
    runtime = None
    filtered_positional: list[str] = []
    i = 0
    while i < len(positional):
        if positional[i] == "--extensions-root" and i + 1 < len(positional):
            extensions_root = Path(positional[i + 1]).expanduser()
            i += 2
        elif positional[i] == "--runtime" and i + 1 < len(positional):
            runtime = positional[i + 1]
            i += 2
        else:
            filtered_positional.append(positional[i])
            i += 1

    target = filtered_positional[0] if filtered_positional else "all"
    if target not in ("personas", "journeys", "extensions", "all"):
        print(
            "Usage: python -m memory list [personas|journeys|extensions|all] [--mirror-home PATH] [--verbose] [--extensions-root PATH] [--runtime NAME]"
        )
        sys.exit(1)

    mem = _load_mem(mirror_home) if target in ("personas", "journeys", "all") else None

    if target in ("personas", "all"):
        assert mem is not None
        result = mem.get_identity(layer="persona")
        personas: list[Identity] = result if isinstance(result, list) else []
        print("=== PERSONAS ===")
        if not personas:
            print("  (none)")
        else:
            for p in sorted(personas, key=lambda x: x.key):
                if not verbose:
                    print(f"  {p.key}")
                    continue
                metadata = _persona_metadata(p)
                keywords = metadata.get("routing_keywords") or []
                keywords_str = ", ".join(keywords) if keywords else "(none)"
                print(f"  {p.key}")
                print(f"    version: {p.version}")
                print(f"    routing_keywords: {keywords_str}")
        if target == "all":
            print()

    if target in ("journeys", "all"):
        assert mem is not None
        result = mem.get_identity(layer="journey")
        journeys: list[Identity] = result if isinstance(result, list) else []
        print("=== JOURNEYS ===")
        if not journeys:
            print("  (none)")
        else:
            for t in sorted(journeys, key=lambda x: x.key):
                status = _extract_status(t.content or "")
                desc = _extract_description(t.content or "")
                suffix = f": {desc}" if desc else ""
                print(f"  [{status}] {t.key}{suffix}")
        if target == "all":
            print()

    if target in ("extensions", "all"):
        root = resolve_extensions_root(extensions_root, mirror_home=mirror_home)
        manifests, errors = discover_extensions(root)
        manifests = filter_manifests_for_runtime(manifests, runtime)
        if runtime is not None:
            print(f"Runtime filter: {runtime}")
        print_extension_list(manifests, errors, root)


def _parse_inspect_args(args: list[str]) -> tuple[str | None, Path | None, list[str]]:
    mirror_home = None
    extensions_root = None
    positional: list[str] = []
    i = 0
    while i < len(args):
        if args[i] == "--mirror-home" and i + 1 < len(args):
            mirror_home = args[i + 1]
            i += 2
        elif args[i] == "--extensions-root" and i + 1 < len(args):
            extensions_root = Path(args[i + 1]).expanduser()
            i += 2
        else:
            positional.append(args[i])
            i += 1
    return mirror_home, extensions_root, positional


def _inspect_persona(persona_id: str, mirror_home: str | None) -> None:
    mem = _load_mem(mirror_home)
    ident = mem.store.get_identity("persona", persona_id)
    if not ident:
        print(f"persona/{persona_id} not found")
        sys.exit(1)

    metadata = _persona_metadata(ident)
    print(f"=== persona/{persona_id} ===")
    print(f"version: {ident.version}")
    print(f"updated_at: {ident.updated_at}")
    print("metadata:")
    if metadata:
        for key in ("persona_id", "name", "inherits_from", "description", "default_model"):
            if metadata.get(key) is not None:
                print(f"  {key}: {metadata[key]}")
        keywords = metadata.get("routing_keywords") or []
        print(f"  routing_keywords: {', '.join(keywords) if keywords else '(none)'}")
    else:
        print("  (none)")

    print("\ncontent:\n")
    print(ident.content)


def _inspect_extension(
    extension_id: str,
    mirror_home: str | None,
    extensions_root: Path | None,
) -> None:
    from memory.cli.extensions import (
        ExtensionValidationError,
        load_extension_manifest,
        resolve_extensions_root,
    )

    root = resolve_extensions_root(extensions_root, mirror_home=mirror_home)
    extension_dir = root / extension_id
    try:
        manifest = load_extension_manifest(extension_dir)
    except ExtensionValidationError as exc:
        print(f"extension/{extension_id} not found or invalid")
        print(f"reason: {exc}")
        sys.exit(1)

    print(f"=== extension/{extension_id} ===")
    print(f"name: {manifest['name']}")
    print(f"category: {manifest['category']}")
    print(f"kind: {manifest['kind']}")
    print(f"summary: {manifest['summary']}")
    print(f"root: {manifest['root']}")
    print(f"manifest_path: {manifest['manifest_path']}")
    if manifest.get("entrypoint"):
        print("entrypoint:")
        for key, value in manifest["entrypoint"].items():
            print(f"  {key}: {value}")
    print("runtimes:")
    for runtime_name, runtime_data in sorted(manifest["runtimes"].items()):
        print(f"  {runtime_name}:")
        print(f"    command_name: {runtime_data['command_name']}")
        if runtime_data.get("skill_file"):
            print(f"    skill_file: {runtime_data['skill_file']}")
        if runtime_data.get("skill_path"):
            print(f"    skill_path: {runtime_data['skill_path']}")


def _inspect_runtime_catalog(runtime: str, mirror_home: str | None) -> None:
    from memory.cli.extensions import _load_catalog
    from memory.config import default_runtime_skills_dir_for_home, resolve_mirror_home

    if mirror_home is None:
        runtime_root = default_runtime_skills_dir_for_home(resolve_mirror_home(), runtime)
    else:
        runtime_root = default_runtime_skills_dir_for_home(Path(mirror_home).expanduser(), runtime)

    catalog_path = runtime_root / "extensions.json"
    catalog = _load_catalog(catalog_path)
    print(f"=== runtime-catalog/{runtime} ===")
    print(f"runtime_root: {runtime_root}")
    print(f"catalog_path: {catalog_path}")
    print(f"schema_version: {catalog.get('schema_version', '(unknown)')}")
    print(f"generated_at: {catalog.get('generated_at', '(unknown)')}")
    items = catalog.get("extensions", [])
    print("extensions:")
    if not items:
        print("  (none)")
        return
    for item in items:
        print(f"  {item.get('id', '(unknown)')} -> {item.get('command_name', '(unknown)')}")
        print(f"    kind: {item.get('kind', '(unknown)')}")
        print(f"    installed_skill_path: {item.get('installed_skill_path', '(unknown)')}")


def cmd_inspect_llm_calls(args: list[str]) -> None:
    """python -m memory inspect llm-calls [--conversation ID] [--session ID] [--role ROLE] [--since DATE] [--limit N] [--mirror-home PATH]"""
    import argparse

    parser = argparse.ArgumentParser(
        prog="memory inspect llm-calls",
        description="Inspect LLM call trace logs from the llm_calls table.",
    )
    parser.add_argument(
        "--conversation", dest="conversation_id", default=None, help="Filter by conversation id"
    )
    parser.add_argument("--session", dest="session_id", default=None, help="Filter by session id")
    parser.add_argument(
        "--role",
        default=None,
        help="Filter by role (extraction, task_extraction, journal_classification, week_plan, consult)",
    )
    parser.add_argument(
        "--since", default=None, help="Filter rows called_at >= DATE (YYYY-MM-DD or ISO timestamp)"
    )
    parser.add_argument("--limit", type=int, default=20, help="Maximum rows to show (default: 20)")
    parser.add_argument("--mirror-home", default=None, help="Explicit user home")
    parsed = parser.parse_args(args)

    from memory.cli.common import db_path_from_mirror_home
    from memory.client import MemoryClient

    mem = MemoryClient(db_path=db_path_from_mirror_home(parsed.mirror_home))
    rows = mem.store.get_llm_calls(
        conversation_id=parsed.conversation_id,
        role=parsed.role,
        limit=parsed.limit,
    )

    # Apply filters not handled by the store.
    if parsed.session_id:
        rows = [r for r in rows if r.get("session_id") == parsed.session_id]
    if parsed.since:
        rows = [r for r in rows if (r.get("called_at") or "") >= parsed.since]

    if not rows:
        print("(no llm_calls rows match the given filters)")
        return

    print(f"=== llm_calls ({len(rows)} row{'s' if len(rows) != 1 else ''}) ===")
    for row in rows:
        called_at = (row.get("called_at") or "")[:19].replace("T", " ")
        role = row.get("role") or "?"
        model = row.get("model") or "?"
        latency = row.get("latency_ms")
        latency_str = f"{latency}ms" if latency is not None else "?ms"
        p_tok = row.get("prompt_tokens") or 0
        c_tok = row.get("completion_tokens") or 0
        conv = (row.get("conversation_id") or "")[:8] or "—"
        row_id = (row.get("id") or "")[:8]
        cost = row.get("cost_usd")
        cost_str = f"~${cost:.6f}" if cost is not None else "$—"

        print(f"\n[{called_at}] {role} | {model}")
        print(f"  id:{row_id}  conv:{conv}  {p_tok}→{c_tok} tokens  {latency_str}  {cost_str}")

        prompt = (row.get("prompt") or "").strip()[:200]
        response = (row.get("response") or "").strip()[:200]
        print(f"  prompt:   {prompt!r}")
        print(f"  response: {response!r}")


def cmd_inspect(args: list[str]) -> None:
    """python -m memory inspect persona|extension|runtime-catalog|llm-calls [args] [--mirror-home PATH]"""
    # llm-calls is a self-contained subcommand — dispatch before positional parsing.
    if args and args[0] == "llm-calls":
        cmd_inspect_llm_calls(args[1:])
        return

    mirror_home, extensions_root, positional = _parse_inspect_args(args)
    if len(positional) != 2 or positional[0] not in {"persona", "extension", "runtime-catalog"}:
        print(
            "Usage: python -m memory inspect persona|extension|runtime-catalog|llm-calls <id> [--mirror-home PATH] [--extensions-root PATH]"
        )
        sys.exit(1)

    target, target_id = positional
    if target == "persona":
        _inspect_persona(target_id, mirror_home)
        return
    if target == "extension":
        _inspect_extension(target_id, mirror_home, extensions_root)
        return

    _inspect_runtime_catalog(target_id, mirror_home)


def cmd_detect_persona(args: list[str]) -> None:
    """python -m memory detect-persona <query> [--mirror-home PATH]"""
    mirror_home, positional, _verbose = _parse_common_args(args)
    if not positional:
        print("Usage: python -m memory detect-persona <query> [--mirror-home PATH]")
        sys.exit(1)

    query = " ".join(positional)
    mem = _load_mem(mirror_home)
    matches = mem.detect_persona(query)
    print(f"query: {query}")
    if not matches:
        print("  (no persona match)")
        return
    for persona, score, match_type in matches:
        print(f"  - {persona}: {score:.1f} ({match_type})")
