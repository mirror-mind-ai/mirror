"""Central configuration for the memory system."""

import os
from pathlib import Path

# Load .env by walking upward until a file is found.
_env_file = None
for _parent in Path(__file__).resolve().parents:
    _candidate = _parent / ".env"
    if _candidate.exists():
        _env_file = _candidate
        break

if _env_file:
    for line in _env_file.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip())


# Environment: 'production', 'development', 'test'.
MEMORY_ENV = os.environ.get("MEMORY_ENV") or "production"


def _path_from_env(name: str, default: Path) -> Path:
    value = os.environ.get(name)
    if not value:
        return default
    return Path(value).expanduser()


def _bool_from_env(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None or value == "":
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


_DEFAULT_USER_HOMES_DIR_NAME = ".mirror-minds"
_LEGACY_USER_HOMES_DIR_NAME = ".mirror"
_legacy_warning_emitted: set[str] = set()


def _default_memory_dir(home: Path) -> Path:
    return home / _DEFAULT_USER_HOMES_DIR_NAME


def _default_user_homes_dir(home: Path) -> Path:
    return home / _DEFAULT_USER_HOMES_DIR_NAME


def _default_user_home(home: Path, user: str) -> Path:
    return _default_user_homes_dir(home) / user


def _legacy_user_home(home: Path, user: str) -> Path:
    return home / _LEGACY_USER_HOMES_DIR_NAME / user


def _warn_legacy_path_once(legacy_path: Path, new_path: Path) -> None:
    """Emit a one-time stderr warning per legacy path in use.

    The legacy ``~/.mirror/<user>`` layout is permanently supported (see
    ``docs/project/decisions.md`` — "Default mirror home directory renamed"),
    but a warning is emitted to surface that the install can be migrated to
    the new ``~/.mirror-minds/<user>`` location with a single ``mv``.
    """
    key = str(legacy_path)
    if key in _legacy_warning_emitted:
        return
    _legacy_warning_emitted.add(key)
    import sys

    print(
        f"warning: using legacy mirror home at {legacy_path}. "
        f"To migrate: mv {legacy_path} {new_path}. "
        "The legacy path remains supported indefinitely.",
        file=sys.stderr,
    )


def resolve_mirror_home(
    *,
    mirror_home: str | Path | None = None,
    mirror_user: str | None = None,
    home: Path | None = None,
) -> Path:
    selected_home = Path(home).expanduser() if home is not None else Path.home()
    explicit_home = mirror_home if mirror_home is not None else os.environ.get("MIRROR_HOME", "")
    explicit_user = mirror_user if mirror_user is not None else os.environ.get("MIRROR_USER", "")

    resolved_home = Path(explicit_home).expanduser() if explicit_home else None
    derived_home = _default_user_home(selected_home, explicit_user) if explicit_user else None

    if resolved_home and explicit_user and resolved_home.name != explicit_user:
        raise ValueError(
            f"MIRROR_HOME ({resolved_home}) conflicts with MIRROR_USER ({explicit_user})."
        )
    if resolved_home:
        return resolved_home
    if derived_home:
        # Legacy path compatibility: if the new default location does not
        # exist but the legacy ``~/.mirror/<user>`` does, use the legacy
        # path and emit a one-time warning. Permanent support; no sunset.
        if not derived_home.exists() and explicit_user:
            legacy_home = _legacy_user_home(selected_home, explicit_user)
            if legacy_home.exists():
                _warn_legacy_path_once(legacy_home, derived_home)
                return legacy_home
        return derived_home
    raise ValueError("Mirror home is not configured. Set MIRROR_HOME or MIRROR_USER.")


def default_db_path_for_home(home: Path) -> Path:
    return home / "memory.db"


def default_backup_dir_for_home(home: Path) -> Path:
    return home / "backups"


def default_export_dir_for_home(home: Path) -> Path:
    return home / "exports"


def default_extensions_dir_for_home(home: Path) -> Path:
    return home / "extensions"


def default_runtime_skills_dir_for_home(home: Path, runtime: str) -> Path:
    return home / "runtime" / "skills" / runtime


def default_transcript_export_dir_for_home(home: Path) -> Path:
    return default_export_dir_for_home(home) / "transcripts"


# Directories by environment.
_HOME = Path.home()
DEFAULT_USER_HOMES_DIR = _default_user_homes_dir(_HOME)
DEFAULT_MIRROR_DIR = _HOME / ".mirror-minds"
DEFAULT_MEMORY_DIR = _default_memory_dir(_HOME)

try:
    _RESOLVED_MIRROR_HOME = resolve_mirror_home()
except ValueError:
    _RESOLVED_MIRROR_HOME = None

_DEFAULT_RUNTIME_DIR = (
    _RESOLVED_MIRROR_HOME
    if _RESOLVED_MIRROR_HOME and MEMORY_ENV == "production" and not os.environ.get("MEMORY_DIR")
    else DEFAULT_MEMORY_DIR
)
_LOCAL_DIR = _path_from_env("MEMORY_DIR", _DEFAULT_RUNTIME_DIR)

# All environments use the local memory directory, isolated by database name.
_ENV_DIRS = {
    "production": _path_from_env("MEMORY_PROD_DIR", _LOCAL_DIR),
    "development": _LOCAL_DIR,
    "test": _LOCAL_DIR,
}
MEMORY_DIR = _ENV_DIRS.get(MEMORY_ENV, _LOCAL_DIR)
# Session routing and mirror state used to live in singleton JSON files under
# MEMORY_DIR. CV5 replaced that with the SQLite `runtime_sessions` table; the
# legacy paths are no longer written or read by any runtime code.
MUTE_FLAG_PATH = MEMORY_DIR / "mute"

# Database isolated by environment.
_DB_NAMES = {
    "production": "memory.db",
    "development": "memory_dev.db",
    "test": "memory_test.db",
}


def db_path_for_env(env: str | None = None) -> Path:
    selected_env = env or MEMORY_ENV
    env_dir = _ENV_DIRS.get(selected_env, _LOCAL_DIR)
    db_name = _DB_NAMES.get(selected_env, f"memory_{selected_env}.db")
    return env_dir / db_name


_DEFAULT_DB_PATH = (
    default_db_path_for_home(_RESOLVED_MIRROR_HOME)
    if _RESOLVED_MIRROR_HOME and MEMORY_ENV == "production" and not os.environ.get("DB_PATH")
    else db_path_for_env()
)
DB_PATH = _path_from_env("DB_PATH", _DEFAULT_DB_PATH)
DB_BACKUP_PATH = _path_from_env("DB_BACKUP_PATH", DB_PATH.parent / "backups")

EXPORT_DIR = _path_from_env(
    "EXPORT_DIR",
    default_export_dir_for_home(_RESOLVED_MIRROR_HOME)
    if _RESOLVED_MIRROR_HOME
    else DEFAULT_USER_HOMES_DIR / "exports",
)
TRANSCRIPT_EXPORT_DIR = _path_from_env(
    "TRANSCRIPT_EXPORT_DIR",
    default_transcript_export_dir_for_home(_RESOLVED_MIRROR_HOME)
    if _RESOLVED_MIRROR_HOME and not os.environ.get("EXPORT_DIR")
    else EXPORT_DIR / "transcripts",
)
# Embeddings — routed through OpenRouter (same model, no separate OpenAI key needed).
EMBEDDING_MODEL = "openai/text-embedding-3-small"
EMBEDDING_DIMENSIONS = 1536

# OpenRouter — used for embeddings, extraction, and multi-LLM consult.
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
EXTRACTION_MODEL = "google/gemini-2.5-flash-lite"

# LLM model families: family -> tier -> OpenRouter model_id.
LLM_FAMILIES = {
    "gemini": {
        "lite": "google/gemini-2.5-flash-lite",
        "mid": "google/gemini-2.5-flash",
        "flagship": "google/gemini-2.5-pro",
    },
    "grok": {
        "lite": "x-ai/grok-3-mini",
        "mid": "x-ai/grok-3",
        "flagship": "x-ai/grok-4.1-fast",
    },
    "deepseek": {
        "lite": "deepseek/deepseek-chat",
        "mid": "deepseek/deepseek-v3.2",
        "flagship": "deepseek/deepseek-r1",
    },
    "openai": {
        "lite": "openai/gpt-5.4-nano",
        "mid": "openai/gpt-5.4-mini",
        "flagship": "openai/gpt-5.4",
    },
    "claude": {
        "lite": "anthropic/claude-haiku-4.5",
        "mid": "anthropic/claude-sonnet-4.6",
        "flagship": "anthropic/claude-opus-4.6",
    },
    "llama": {
        "lite": "meta-llama/llama-3.3-70b-instruct",
        "mid": "meta-llama/llama-4-scout",
        "flagship": "meta-llama/llama-4-maverick",
    },
}

# Hybrid search weights (sum = 1.0)
SEARCH_WEIGHTS = {
    "semantic": 0.50,
    "recency": 0.15,
    "reinforcement": 0.10,
    "relevance": 0.10,
    "lexical": 0.15,  # FTS5 rank-based score
}

# MMR deduplication threshold — candidates with cosine similarity >= this to any
# already-selected result are suppressed. 0.92 = conservative, near-identical only.
MMR_DEDUP_THRESHOLD = float(os.getenv("MEMORY_DEDUP_THRESHOLD", "0.92"))

# Recência — half-life em dias
RECENCY_HALF_LIFE_DAYS = 90

# Reinforcement honest (CV7.E4.S2)
# Half-life for retrieval signal decay — a memory last accessed this many days ago
# has its retrieval signal halved. 180 days ≈ 6 months.
REINFORCEMENT_DECAY_DAYS = int(os.getenv("MEMORY_REINFORCEMENT_DECAY_DAYS", "180"))
# Weight of use_count signal within the reinforcement component (0-1).
# Remainder (1 - USE_WEIGHT) goes to the retrieval signal.
REINFORCEMENT_USE_WEIGHT = float(os.getenv("MEMORY_REINFORCEMENT_USE_WEIGHT", "0.7"))
REINFORCEMENT_RETRIEVAL_WEIGHT = float(os.getenv("MEMORY_REINFORCEMENT_RETRIEVAL_WEIGHT", "0.3"))

# Observability — set MEMORY_LOG_LLM_CALLS=1 to write every LLM call to llm_calls table
LOG_LLM_CALLS = os.getenv("MEMORY_LOG_LLM_CALLS", "") == "1"

# Reception — set MEMORY_RECEPTION=0 to disable LLM-based turn classification
# When enabled (default), persona/journey routing uses the LLM instead of keywords.
RECEPTION_ENABLED = os.getenv("MEMORY_RECEPTION", "1") == "1"

# Two-pass extraction — set MEMORY_TWO_PASS=1 to enable curation against existing memories
# When disabled (default), extraction is single-pass unchanged.
TWO_PASS_ENABLED = os.getenv("MEMORY_TWO_PASS", "") == "1"

# Conversation summary — set MEMORY_SUMMARIZE=1 to generate LLM summaries per conversation
# When disabled (default), a naive message concatenation is stored instead.
SUMMARIZE_ENABLED = os.getenv("MEMORY_SUMMARIZE", "") == "1"
