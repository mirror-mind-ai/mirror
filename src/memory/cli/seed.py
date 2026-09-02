"""Identity migration: personal YAML files -> database.

Usage:
    python -m memory.seed                    # migrate to default env
    python -m memory.seed --env production   # migrate to production
    python -m memory.seed --env test         # migrate to test
"""

import argparse
import json
import sys
from pathlib import Path

import yaml

from memory.client import MemoryClient
from memory.config import db_path_for_home, resolve_mirror_home

# Mapping: (layer, key) -> YAML file relative to identity root + content field.
IDENTITY_MAP = {
    ("self", "soul"): ("self/soul.yaml", "soul"),
    ("ego", "identity"): ("ego/identity.yaml", "identity"),
    ("ego", "behavior"): ("ego/behavior.yaml", "behavior"),
    ("ego", "constraints"): ("ego/constraints.yaml", "constraints"),
    ("ego", "expression"): ("ego/expression.yaml", "expression"),
    ("user", "identity"): ("user/identity.yaml", "user"),
    ("organization", "identity"): ("organization/identity.yaml", "identity"),
    ("organization", "principles"): ("organization/principles.yaml", "principles"),
    ("shadow", "profile"): ("shadow/profile.yaml", "profile"),
}

_REQUIRED_IDENTITY_KEYS = {
    ("self", "soul"),
    ("ego", "identity"),
    ("ego", "behavior"),
    ("user", "identity"),
}


def resolve_identity_root(
    identity_root: Path | None = None,
    *,
    mirror_home: str | Path | None = None,
) -> Path:
    if identity_root is not None:
        return identity_root
    if mirror_home is not None:
        return Path(mirror_home).expanduser() / "identity"
    return resolve_mirror_home() / "identity"


def load_yaml_content(identity_root: Path, yaml_path: str, field: str) -> tuple[str, str]:
    """Load one YAML field and return content plus version."""
    full_path = identity_root / yaml_path
    if not full_path.exists():
        raise FileNotFoundError(f"File not found: {full_path}")

    with open(full_path) as f:
        data = yaml.safe_load(f)

    content = data.get(field, "")
    version = data.get("version", "1.0.0")
    return content, version


def load_persona_content(persona_file: Path) -> tuple[str, str, str, str | None]:
    """Load persona content and return persona_id, content, version, and metadata."""
    with open(persona_file) as f:
        data = yaml.safe_load(f)

    persona_id = data.get("persona_id", persona_file.stem)
    version = data.get("version", "1.0.0")

    # Combine system_prompt and briefing as persona content.
    parts = []
    if data.get("system_prompt"):
        parts.append(data["system_prompt"])
    if data.get("briefing"):
        parts.append(f"\n\n# Briefing\n\n{data['briefing']}")

    metadata = {
        "persona_id": persona_id,
        "name": data.get("name"),
        "inherits_from": data.get("inherits_from"),
        "description": data.get("description"),
        "routing_keywords": data.get("routing_keywords") or [],
        "default_model": data.get("default_model"),
    }

    content = "".join(parts)
    return persona_id, content, version, json.dumps(metadata)


def _resolve_journey_id(data: dict, fallback: str) -> str:
    return data.get("journey_id") or fallback


def load_journey_content(journey_file: Path) -> tuple[str, str, str]:
    """Load journey content and return journey_id, content, and version."""
    with open(journey_file) as f:
        data = yaml.safe_load(f)

    journey_id = _resolve_journey_id(data, journey_file.stem)
    version = data.get("version", "1.0.0")

    parts = []
    if data.get("name"):
        parts.append(f"# {data['name']}")
    if data.get("status"):
        parts.append(f"**Status:** {data['status']}")
    if data.get("description"):
        parts.append(f"\n## Description\n\n{data['description']}")
    if data.get("briefing"):
        parts.append(f"\n## Briefing\n\n{data['briefing']}")
    if data.get("context"):
        parts.append(f"\n## Context\n\n{data['context']}")

    content = "\n".join(parts)
    return journey_id, content, version


def _journey_files(identity_root: Path) -> list[Path]:
    journeys_dir = identity_root / "journeys"
    if journeys_dir.exists():
        return sorted(journeys_dir.glob("*.yaml"))
    return []


def seed(
    env: str = "development",
    identity_root: Path | None = None,
    *,
    mirror_home: str | Path | None = None,
    force: bool = False,
    _db_path: Path | None = None,
) -> dict:
    """Seed identity data into the database.

    By default, existing entries are skipped — the database is the source of
    truth after the first seed. Pass force=True to overwrite existing entries
    from the YAML files (e.g. to reset identity from scratch).
    """
    explicit_mirror_home = mirror_home is not None
    identity_root = resolve_identity_root(identity_root, mirror_home=mirror_home)
    mirror_home = (
        Path(mirror_home).expanduser() if mirror_home is not None else identity_root.parent
    )

    # When mirror_home is explicitly provided (CLI --mirror-home or function arg),
    # derive db_path from it so the seed writes to the correct user home rather
    # than the env-default DB. This makes --mirror-home behave consistently for
    # both reads (identity files) and writes (database).
    if _db_path is None and explicit_mirror_home:
        _db_path = db_path_for_home(mirror_home)

    mem = MemoryClient(env=env) if _db_path is None else MemoryClient(db_path=_db_path)
    results = {"created": 0, "updated": 0, "errors": []}

    print(f"Mirror home: {mirror_home}")
    print(f"Identity root: {identity_root}")

    results["skipped"] = 0

    # 1. Seed core identity (self, ego, user, organization).
    for (layer, key), (yaml_path, field) in IDENTITY_MAP.items():
        try:
            content, version = load_yaml_content(identity_root, yaml_path, field)
            if not content:
                results["errors"].append(f"{layer}/{key}: empty content")
                continue

            existing = mem.store.get_identity(layer, key)
            if existing and not force:
                results["skipped"] += 1
                print(
                    f"  → {layer}/{key} (skipped — use 'memory identity edit {layer} {key}' to update)"
                )
                continue

            mem.set_identity(layer, key, content, version)
            if existing:
                results["updated"] += 1
                print(f"  ↻ {layer}/{key} (updated)")
            else:
                results["created"] += 1
                print(f"  ✓ {layer}/{key}")
        except FileNotFoundError as e:
            if (layer, key) in _REQUIRED_IDENTITY_KEYS:
                results["errors"].append(f"{layer}/{key}: {e}")
                print(f"  ✗ {layer}/{key}: {e}")
        except Exception as e:
            results["errors"].append(f"{layer}/{key}: {e}")
            print(f"  ✗ {layer}/{key}: {e}")

    # 2. Seed personas.
    personas_dir = identity_root / "personas"
    if personas_dir.exists():
        for persona_file in sorted(personas_dir.glob("*.yaml")):
            try:
                persona_id, content, version, metadata = load_persona_content(persona_file)
                if not content:
                    continue

                existing = mem.store.get_identity("persona", persona_id)
                if existing and not force:
                    results["skipped"] += 1
                    print(
                        f"  → persona/{persona_id} (skipped — use 'memory identity edit persona {persona_id}' to update)"
                    )
                    continue

                mem.set_identity("persona", persona_id, content, version, metadata)
                if existing:
                    results["updated"] += 1
                    print(f"  ↻ persona/{persona_id} (updated)")
                else:
                    results["created"] += 1
                    print(f"  ✓ persona/{persona_id}")
            except Exception as e:
                results["errors"].append(f"persona/{persona_file.stem}: {e}")
                print(f"  ✗ persona/{persona_file.stem}: {e}")

    # 3. Seed journeys.
    for journey_file in _journey_files(identity_root):
        try:
            journey_id, content, version = load_journey_content(journey_file)
            if not content:
                continue

            existing = mem.store.get_identity("journey", journey_id)
            if existing and not force:
                results["skipped"] += 1
                print(
                    f"  → journey/{journey_id} (skipped — use 'memory identity edit journey {journey_id}' to update)"
                )
                continue

            mem.set_identity("journey", journey_id, content, version)
            if existing:
                results["updated"] += 1
                print(f"  ↻ journey/{journey_id} (updated)")
            else:
                results["created"] += 1
                print(f"  ✓ journey/{journey_id}")
        except Exception as e:
            results["errors"].append(f"journey/{journey_file.stem}: {e}")
            print(f"  ✗ journey/{journey_file.stem}: {e}")

    return results


def main():
    from memory.config import MEMORY_ENV

    parser = argparse.ArgumentParser(description="Seed identity YAML files into the database")
    parser.add_argument("--env", default=None, choices=["development", "test", "production"])
    parser.add_argument(
        "--mirror-home",
        default=None,
        help="Explicit user home to seed from; overrides MIRROR_HOME and MIRROR_USER for this command",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        default=False,
        help="Overwrite existing entries from YAML files. By default, existing entries are skipped.",
    )
    args = parser.parse_args()

    env = args.env or MEMORY_ENV
    print(f"Seeding identity into [{env}]...\n")
    if args.force:
        print("  (--force: existing entries will be overwritten from YAML files)\n")
    results = seed(env=env, mirror_home=args.mirror_home, force=args.force)

    print(
        f"\nResult: {results['created']} created, {results['updated']} updated, {results['skipped']} skipped"
    )
    if results["errors"]:
        print(f"Errors: {len(results['errors'])}")
        for err in results["errors"]:
            print(f"  - {err}")
        sys.exit(1)


if __name__ == "__main__":
    main()
