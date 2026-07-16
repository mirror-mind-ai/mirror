"""Tests for memories CLI behavior."""

import numpy as np

from memory import MemoryClient
from memory.config import default_db_path_for_home


def _mock_embeddings(mocker) -> None:
    mocker.patch("memory.services.memory.generate_embedding", return_value=[0.1, 0.2, 0.3])
    mocker.patch("memory.services.memory.embedding_to_bytes", return_value=b"embedding")


def test_search_prints_degraded_marker_when_embedding_unavailable(mocker, tmp_path, capsys):
    unit = np.ones(1536, dtype=np.float32) / np.sqrt(1536)
    mocker.patch("memory.services.memory.generate_embedding", return_value=unit)
    mirror_home = tmp_path / ".mirror" / "u"
    mem = MemoryClient(env="test", db_path=default_db_path_for_home(mirror_home))
    mem.add_memory(
        title="Nomad freedom",
        content="digital nomad lifestyle",
        memory_type="insight",
        journey="mirror",
    )
    mocker.patch(
        "memory.intelligence.search.generate_embedding",
        side_effect=RuntimeError("offline"),
    )

    from memory.cli.memories import main

    main(["--mirror-home", str(mirror_home), "--search", "nomad"])

    out = capsys.readouterr().out
    assert "degraded" in out.lower()
    assert "Nomad freedom" in out


def test_memories_reads_from_explicit_mirror_home(mocker, tmp_path, capsys):
    _mock_embeddings(mocker)
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.add_memory(
        title="Scoped memory",
        content="Memory content for the explicit home.",
        memory_type="insight",
        journey="mirror-poc",
    )

    from memory.cli.memories import main

    main(["--mirror-home", str(mirror_home)])

    captured = capsys.readouterr()
    assert "Scoped memory" in captured.out
    assert "mirror-poc" in captured.out


def test_memories_explicit_mirror_home_overrides_environment_selection(mocker, tmp_path, capsys):
    _mock_embeddings(mocker)

    env_home = tmp_path / ".mirror" / "testuser"
    env_db_path = default_db_path_for_home(env_home)
    env_mem = MemoryClient(env="test", db_path=env_db_path)
    env_mem.add_memory(
        title="Environment memory",
        content="env content",
        memory_type="insight",
    )

    explicit_home = tmp_path / ".mirror" / "pati"
    explicit_db_path = default_db_path_for_home(explicit_home)
    explicit_mem = MemoryClient(env="test", db_path=explicit_db_path)
    explicit_mem.add_memory(
        title="Explicit memory",
        content="explicit content",
        memory_type="insight",
    )

    mocker.patch.dict("os.environ", {"MIRROR_HOME": str(env_home)}, clear=False)

    from memory.cli.memories import main

    main(["--mirror-home", str(explicit_home)])

    captured = capsys.readouterr()
    assert "Explicit memory" in captured.out
    assert "Environment memory" not in captured.out
