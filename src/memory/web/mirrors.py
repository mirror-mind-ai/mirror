"""Read-only discovery of local Mirror homes for the web surface."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from memory.config import DEFAULT_USER_HOMES_DIR, default_db_path_for_home


@dataclass(frozen=True)
class MirrorSummary:
    """A local Mirror home that may be shown in the web shell."""

    name: str
    path: str
    is_current: bool
    database_exists: bool

    def to_dict(self) -> dict[str, object]:
        return {
            "name": self.name,
            "path": self.path,
            "isCurrent": self.is_current,
            "databaseExists": self.database_exists,
        }


class MirrorRegistry:
    """Discover local Mirror homes without switching or mutating them."""

    def __init__(
        self,
        mirror_home: str | Path | None,
        *,
        user_homes_dir: str | Path | None = None,
    ) -> None:
        self.mirror_home = Path(mirror_home).expanduser().resolve() if mirror_home else None
        if user_homes_dir is not None:
            self.user_homes_dir = Path(user_homes_dir).expanduser().resolve()
        elif self.mirror_home is not None:
            self.user_homes_dir = self.mirror_home.parent
        else:
            self.user_homes_dir = DEFAULT_USER_HOMES_DIR.expanduser().resolve()

    def current_name(self) -> str:
        if self.mirror_home is None:
            return "Mirror"
        return self.mirror_home.name

    def list_mirrors(self) -> list[MirrorSummary]:
        candidates: list[Path] = []
        if self.user_homes_dir.exists():
            candidates.extend(
                path.resolve()
                for path in self.user_homes_dir.iterdir()
                if self._is_candidate_mirror_home(path)
            )
        if self.mirror_home is not None and self.mirror_home not in candidates:
            candidates.append(self.mirror_home)

        mirrors = [self._summary(path) for path in candidates]
        mirrors.sort(key=lambda mirror: (not mirror.is_current, mirror.name.lower()))
        return mirrors

    def _is_candidate_mirror_home(self, path: Path) -> bool:
        if not path.is_dir() or path.name.startswith("."):
            return False
        return default_db_path_for_home(path).exists()

    def _summary(self, mirror_home: Path) -> MirrorSummary:
        return MirrorSummary(
            name=mirror_home.name,
            path=str(mirror_home),
            is_current=self.mirror_home is not None and mirror_home == self.mirror_home,
            database_exists=default_db_path_for_home(mirror_home).exists(),
        )
