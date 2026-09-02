"""Bootstrap a user home from repository identity templates."""

import argparse
import shutil
from pathlib import Path


def find_templates_identity_root(start: Path | None = None) -> Path:
    current = (start or Path(__file__).resolve()).resolve()
    for parent in [current, *current.parents]:
        candidate = parent / "templates" / "identity"
        if candidate.exists():
            return candidate
    raise FileNotFoundError("Could not find templates/identity in the repository.")


def default_user_home(user: str, home: Path | None = None) -> Path:
    """Return the default home for ``user``, honoring an existing legacy home.

    Mirrors ``memory.config.resolve_mirror_home``: new installs live under
    ``~/.mirror-minds/<user>``; if only the legacy ``~/.mirror/<user>`` exists,
    keep using it so a re-run never splits an identity across two homes.
    Previously this always returned the legacy path, so every fresh onboarding
    immediately saw the "using legacy mirror home" migration warning about a
    location init itself had just created.
    """
    selected_home = Path(home).expanduser() if home is not None else Path.home()
    new_home = selected_home / ".mirror-minds" / user
    legacy_home = selected_home / ".mirror" / user
    if not new_home.exists() and legacy_home.exists():
        return legacy_home
    return new_home


def _substitute_user_name(identity_root: Path, user: str) -> None:
    """Replace {{user_name}} tokens in all YAML files with the actual user name."""
    for yaml_file in identity_root.rglob("*.yaml"):
        content = yaml_file.read_text(encoding="utf-8")
        if "{{user_name}}" in content:
            yaml_file.write_text(content.replace("{{user_name}}", user), encoding="utf-8")


def init_user_home(
    user: str,
    *,
    templates_identity_root: Path | None = None,
    user_home: Path | None = None,
) -> Path:
    templates_root = templates_identity_root or find_templates_identity_root()
    if not templates_root.exists():
        raise FileNotFoundError(f"Identity templates not found: {templates_root}")

    destination_home = user_home or default_user_home(user)
    identity_root = destination_home / "identity"

    if identity_root.exists() and any(identity_root.iterdir()):
        raise FileExistsError(f"Identity root already exists and is not empty: {identity_root}")

    destination_home.mkdir(parents=True, exist_ok=True)
    shutil.copytree(templates_root, identity_root, dirs_exist_ok=True)
    _substitute_user_name(identity_root, user)
    return identity_root


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Initialize a user home from identity templates")
    parser.add_argument("user", help="User name for ~/.mirror-minds/<user>")
    args = parser.parse_args(argv)

    identity_root = init_user_home(args.user)
    print(f"Created user home: {identity_root.parent}")
    print(f"Identity ready at: {identity_root}")
    print("\nNext steps:")
    print(f"  1. Add to your .env: MIRROR_HOME={identity_root.parent}")
    print("  2. Run: uv run python -m memory seed")
    print("\nYour identity is ready to use. Deepen it over time with:")
    print("  uv run python -m memory identity edit user identity")


if __name__ == "__main__":
    main()
