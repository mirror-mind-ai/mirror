from __future__ import annotations

import json
import threading
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from pathlib import Path
from typing import Any

from memory import MemoryClient
from memory.web.server import create_handler


def make_docs_root(tmp_path: Path) -> Path:
    root = tmp_path / "repo"
    (root / "docs").mkdir(parents=True)
    (root / "docs" / "index.md").write_text("# Home\n", encoding="utf-8")
    return root


class WebTestServer:
    def __init__(self, root: Path, mirror_home: Path, db_path: Path) -> None:
        handler = create_handler(root=root, mirror_home=mirror_home, db_path=db_path)
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    @property
    def port(self) -> int:
        return int(self.server.server_address[1])

    def request(
        self, method: str, path: str, body: dict[str, Any] | None = None
    ) -> tuple[int, Any]:
        conn = HTTPConnection("127.0.0.1", self.port, timeout=5)
        payload = json.dumps(body).encode("utf-8") if body is not None else None
        headers = {"Content-Type": "application/json"} if body is not None else {}
        conn.request(method, path, body=payload, headers=headers)
        response = conn.getresponse()
        raw = response.read().decode("utf-8")
        conn.close()
        return response.status, json.loads(raw)

    def close(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)


def test_shell_api_reports_workspace_default_and_mirror_name(tmp_path: Path) -> None:
    mirror_home = tmp_path / ".mirror-minds" / "mirror-home"
    sandbox_home = tmp_path / ".mirror-minds" / "sandbox"
    sandbox_home.mkdir(parents=True)
    (sandbox_home / "memory.db").write_text("", encoding="utf-8")
    server = WebTestServer(
        root=make_docs_root(tmp_path),
        mirror_home=mirror_home,
        db_path=mirror_home / "memory.db",
    )
    try:
        status, payload = server.request("GET", "/api/shell")
    finally:
        server.close()

    assert status == 200
    assert payload["mirror"]["name"] == "mirror-home"
    assert payload["mirror"]["path"].endswith("/.mirror-minds/mirror-home")
    assert payload["profile"] == {"displayName": "mirror-home", "avatarSymbol": "◇"}
    assert payload["theme"] == "system"
    assert payload["preferencesPath"].endswith("/web/preferences.json")
    assert payload["mirrors"][0]["name"] == "mirror-home"
    assert payload["mirrors"][0]["displayName"] == "mirror-home"
    assert payload["mirrors"][0]["avatarSymbol"] == "◇"
    assert payload["mirrors"][0]["isCurrent"] is True
    assert payload["mirrors"][1]["name"] == "sandbox"
    assert payload["defaultPerspective"] == "workspace"
    assert payload["validPerspectives"] == ["atlas", "workspace"]
    assert payload["docsAvailable"] is True


def test_mirrors_api_lists_local_mirrors_read_only(tmp_path: Path) -> None:
    root = tmp_path / ".mirror-minds"
    mirror_home = root / "mirror-home"
    other_home = root / "other"
    mirror_home.mkdir(parents=True)
    other_home.mkdir()
    (other_home / "memory.db").write_text("", encoding="utf-8")
    server = WebTestServer(
        root=make_docs_root(tmp_path),
        mirror_home=mirror_home,
        db_path=mirror_home / "memory.db",
    )
    try:
        status, payload = server.request("GET", "/api/mirrors")
    finally:
        server.close()

    assert status == 200
    assert [mirror["name"] for mirror in payload] == ["mirror-home", "other"]
    assert payload[0]["displayName"] == "mirror-home"
    assert payload[0]["isCurrent"] is True
    assert payload[1]["databaseExists"] is True


def test_select_mirror_api_switches_active_mirror_and_surface_data(tmp_path: Path) -> None:
    root = tmp_path / ".mirror-minds"
    alpha_home = root / "alpha"
    beta_home = root / "beta"
    alpha_db = alpha_home / "memory.db"
    beta_db = beta_home / "memory.db"
    with MemoryClient(db_path=alpha_db) as mem:
        mem.identity.set_identity("ego", "identity", "# Alpha Ego\nAlpha voice")
    with MemoryClient(db_path=beta_db) as mem:
        mem.identity.set_identity("ego", "identity", "# Beta Ego\nBeta voice")

    server = WebTestServer(root=make_docs_root(tmp_path), mirror_home=alpha_home, db_path=alpha_db)
    try:
        initial_status, initial = server.request(
            "GET", "/api/surface/object?kind=identity&id=ego%3Aidentity"
        )
        select_status, shell = server.request("POST", "/api/mirrors/select", {"name": "beta"})
        selected_status, selected = server.request(
            "GET", "/api/surface/object?kind=identity&id=ego%3Aidentity"
        )
    finally:
        server.close()

    assert initial_status == 200
    assert select_status == 200
    assert selected_status == 200
    assert initial["content"] == "# Alpha Ego\nAlpha voice"
    assert shell["mirror"]["name"] == "beta"
    assert shell["mirrors"][0]["name"] == "beta"
    assert shell["mirrors"][0]["isCurrent"] is True
    assert selected["content"] == "# Beta Ego\nBeta voice"


def test_select_mirror_api_rejects_undiscovered_names_and_paths(tmp_path: Path) -> None:
    root = tmp_path / ".mirror-minds"
    alpha_home = root / "alpha"
    beta_home = root / "beta"
    backup_home = root / "backups"
    with MemoryClient(db_path=alpha_home / "memory.db") as mem:
        mem.identity.set_identity("ego", "identity", "# Alpha Ego\nAlpha voice")
    beta_home.mkdir()
    backup_home.mkdir()

    server = WebTestServer(
        root=make_docs_root(tmp_path),
        mirror_home=alpha_home,
        db_path=alpha_home / "memory.db",
    )
    try:
        missing_status, missing = server.request("POST", "/api/mirrors/select", {"name": "beta"})
        path_status, path = server.request("POST", "/api/mirrors/select", {"name": "../alpha"})
        backup_status, backup = server.request("POST", "/api/mirrors/select", {"name": "backups"})
    finally:
        server.close()

    assert missing_status == 400
    assert path_status == 400
    assert backup_status == 400
    assert "discovered local Mirrors" in missing["error"]
    assert "discovered local Mirrors" in path["error"]
    assert "discovered local Mirrors" in backup["error"]


def test_theme_preferences_api_persists_to_active_mirror_home(tmp_path: Path) -> None:
    root = tmp_path / ".mirror-minds"
    alpha_home = root / "alpha"
    beta_home = root / "beta"
    with MemoryClient(db_path=alpha_home / "memory.db") as mem:
        mem.identity.set_identity("ego", "identity", "# Alpha Ego\nAlpha voice")
    with MemoryClient(db_path=beta_home / "memory.db") as mem:
        mem.identity.set_identity("ego", "identity", "# Beta Ego\nBeta voice")

    server = WebTestServer(
        root=make_docs_root(tmp_path),
        mirror_home=alpha_home,
        db_path=alpha_home / "memory.db",
    )
    try:
        status, payload = server.request("POST", "/api/preferences/theme", {"theme": "dark"})
        server.request("POST", "/api/mirrors/select", {"name": "beta"})
        beta_status, beta_payload = server.request(
            "POST", "/api/preferences/theme", {"theme": "light"}
        )
    finally:
        server.close()

    assert status == 200
    assert payload["theme"] == "dark"
    assert beta_status == 200
    assert beta_payload["theme"] == "light"
    assert '"theme": "dark"' in (alpha_home / "web" / "preferences.json").read_text(
        encoding="utf-8"
    )
    assert '"theme": "light"' in (beta_home / "web" / "preferences.json").read_text(
        encoding="utf-8"
    )


def test_shell_keeps_profile_and_theme_isolated_across_mirror_switches(tmp_path: Path) -> None:
    root = tmp_path / ".mirror-minds"
    alpha_home = root / "alpha"
    beta_home = root / "beta"
    with MemoryClient(db_path=alpha_home / "memory.db") as mem:
        mem.identity.set_identity("ego", "identity", "# Alpha Ego\nAlpha voice")
    with MemoryClient(db_path=beta_home / "memory.db") as mem:
        mem.identity.set_identity("ego", "identity", "# Beta Ego\nBeta voice")

    server = WebTestServer(
        root=make_docs_root(tmp_path),
        mirror_home=alpha_home,
        db_path=alpha_home / "memory.db",
    )
    try:
        server.request(
            "POST", "/api/preferences/profile", {"displayName": "Alpha", "avatarSymbol": "A"}
        )
        server.request("POST", "/api/preferences/theme", {"theme": "dark"})
        server.request("POST", "/api/mirrors/select", {"name": "beta"})
        beta_default_status, beta_default = server.request("GET", "/api/shell")
        server.request(
            "POST", "/api/preferences/profile", {"displayName": "Beta", "avatarSymbol": "B"}
        )
        server.request("POST", "/api/preferences/theme", {"theme": "light"})
        server.request("POST", "/api/mirrors/select", {"name": "alpha"})
        alpha_status, alpha = server.request("GET", "/api/shell")
        server.request("POST", "/api/mirrors/select", {"name": "beta"})
        beta_status, beta = server.request("GET", "/api/shell")
    finally:
        server.close()

    assert beta_default_status == 200
    assert beta_default["profile"] == {"displayName": "beta", "avatarSymbol": "◇"}
    assert beta_default["theme"] == "system"
    assert alpha_status == 200
    assert alpha["profile"] == {"displayName": "Alpha", "avatarSymbol": "A"}
    assert alpha["theme"] == "dark"
    assert beta_status == 200
    assert beta["profile"] == {"displayName": "Beta", "avatarSymbol": "B"}
    assert beta["theme"] == "light"


def test_theme_preferences_api_rejects_invalid_theme(tmp_path: Path) -> None:
    mirror_home = tmp_path / "mirror-home"
    server = WebTestServer(
        root=make_docs_root(tmp_path),
        mirror_home=mirror_home,
        db_path=mirror_home / "memory.db",
    )
    try:
        status, payload = server.request("POST", "/api/preferences/theme", {"theme": "sepia"})
    finally:
        server.close()

    assert status == 400
    assert "theme" in payload["error"]


def test_profile_preferences_api_persists_to_active_mirror_home(tmp_path: Path) -> None:
    root = tmp_path / ".mirror-minds"
    alpha_home = root / "alpha"
    beta_home = root / "beta"
    with MemoryClient(db_path=alpha_home / "memory.db") as mem:
        mem.identity.set_identity("ego", "identity", "# Alpha Ego\nAlpha voice")
    with MemoryClient(db_path=beta_home / "memory.db") as mem:
        mem.identity.set_identity("ego", "identity", "# Beta Ego\nBeta voice")

    server = WebTestServer(
        root=make_docs_root(tmp_path),
        mirror_home=alpha_home,
        db_path=alpha_home / "memory.db",
    )
    try:
        status, payload = server.request(
            "POST", "/api/preferences/profile", {"displayName": "Navigator", "avatarSymbol": "✦"}
        )
        server.request("POST", "/api/mirrors/select", {"name": "beta"})
        beta_status, beta_payload = server.request(
            "POST", "/api/preferences/profile", {"displayName": "Builder", "avatarSymbol": "◇"}
        )
    finally:
        server.close()

    assert status == 200
    assert payload["profile"] == {"displayName": "Navigator", "avatarSymbol": "✦"}
    assert beta_status == 200
    assert beta_payload["profile"] == {"displayName": "Builder", "avatarSymbol": "◇"}
    assert "Navigator" in (alpha_home / "web" / "preferences.json").read_text(encoding="utf-8")
    assert "Builder" in (beta_home / "web" / "preferences.json").read_text(encoding="utf-8")


def test_profile_preferences_api_rejects_invalid_payload(tmp_path: Path) -> None:
    mirror_home = tmp_path / "mirror-home"
    server = WebTestServer(
        root=make_docs_root(tmp_path),
        mirror_home=mirror_home,
        db_path=mirror_home / "memory.db",
    )
    try:
        status, payload = server.request(
            "POST", "/api/preferences/profile", {"displayName": "", "avatarSymbol": "✦"}
        )
    finally:
        server.close()

    assert status == 400
    assert "displayName" in payload["error"]


def test_conversation_detail_api_returns_read_only_transcript(tmp_path: Path) -> None:
    mirror_home = tmp_path / "mirror-home"
    db_path = mirror_home / "memory.db"
    with MemoryClient(db_path=db_path) as mem:
        conversation = mem.conversations.start_conversation(
            interface="pi",
            persona="architect",
            journey="mirror-mind",
            title="Plan conversation intelligence",
        )
        mem.conversations.add_message(conversation.id, "user", "Can we read transcripts?")
        mem.conversations.add_message(conversation.id, "assistant", "Yes, as read-only pages.")
        mem.store.update_conversation(conversation.id, summary="Transcript detail planning")

    server = WebTestServer(root=make_docs_root(tmp_path), mirror_home=mirror_home, db_path=db_path)
    try:
        status, payload = server.request("GET", f"/api/conversations/detail?id={conversation.id}")
    finally:
        server.close()

    assert status == 200
    assert payload["id"] == conversation.id
    assert payload["title"] == "Plan conversation intelligence"
    assert payload["interface"] == "pi"
    assert payload["persona"] == "architect"
    assert payload["journey"] == "mirror-mind"
    assert payload["summary"] == "Transcript detail planning"
    assert payload["messageCount"] == 2
    assert payload["messages"] == [
        {
            "id": payload["messages"][0]["id"],
            "role": "user",
            "content": "Can we read transcripts?",
            "createdAt": payload["messages"][0]["createdAt"],
            "tokenCount": None,
        },
        {
            "id": payload["messages"][1]["id"],
            "role": "assistant",
            "content": "Yes, as read-only pages.",
            "createdAt": payload["messages"][1]["createdAt"],
            "tokenCount": None,
        },
    ]
    assert "metadata" not in payload
    assert "metadata" not in payload["messages"][0]


def test_conversation_title_api_updates_one_title(tmp_path: Path) -> None:
    mirror_home = tmp_path / "mirror-home"
    db_path = mirror_home / "memory.db"
    with MemoryClient(db_path=db_path) as mem:
        mem.identity.set_identity(
            "journey",
            "mirror-mind",
            "# Mirror Mind\n**Status:** active\n\n## Description\nBuild the mirror.",
        )
        conversation = mem.conversations.start_conversation(
            interface="pi",
            journey="mirror-mind",
            title="Old title",
        )
        mem.conversations.add_message(conversation.id, "user", "Rename this")

    server = WebTestServer(root=make_docs_root(tmp_path), mirror_home=mirror_home, db_path=db_path)
    try:
        status, payload = server.request(
            "POST",
            "/api/conversations/title",
            {"conversationId": conversation.id, "title": "  Better transcript title  "},
        )
        workspace_status, workspace = server.request(
            "GET", "/api/surface/workspace?journey=mirror-mind"
        )
    finally:
        server.close()

    assert status == 200
    assert payload["id"] == conversation.id
    assert payload["title"] == "Better transcript title"
    assert workspace_status == 200
    conversations = next(
        section for section in workspace["sections"] if section["id"] == "conversations"
    )
    assert conversations["cards"][0]["title"] == "Better transcript title"


def test_conversation_title_suggestion_api_returns_suggestion_without_saving(
    tmp_path: Path, monkeypatch
) -> None:
    mirror_home = tmp_path / "mirror-home"
    db_path = mirror_home / "memory.db"
    with MemoryClient(db_path=db_path) as mem:
        conversation = mem.conversations.start_conversation(interface="pi", title="Old title")
        mem.conversations.add_message(conversation.id, "user", "Plan transcript naming")
        mem.conversations.add_message(conversation.id, "assistant", "Use explicit approval")

    monkeypatch.setattr(
        "memory.services.conversation.generate_conversation_title",
        lambda messages, on_llm_call=None: "Explicit Transcript Naming",
    )

    server = WebTestServer(root=make_docs_root(tmp_path), mirror_home=mirror_home, db_path=db_path)
    try:
        status, payload = server.request(
            "POST", "/api/conversations/title-suggestion", {"conversationId": conversation.id}
        )
        detail_status, detail = server.request(
            "GET", f"/api/conversations/detail?id={conversation.id}"
        )
    finally:
        server.close()

    assert status == 200
    assert payload == {
        "conversationId": conversation.id,
        "suggestedTitle": "Explicit Transcript Naming",
    }
    assert detail_status == 200
    assert detail["title"] == "Old title"


def test_conversation_title_suggestion_api_rejects_empty_conversations(tmp_path: Path) -> None:
    mirror_home = tmp_path / "mirror-home"
    db_path = mirror_home / "memory.db"
    with MemoryClient(db_path=db_path) as mem:
        conversation = mem.conversations.start_conversation(interface="pi", title="Old title")

    server = WebTestServer(root=make_docs_root(tmp_path), mirror_home=mirror_home, db_path=db_path)
    try:
        status, payload = server.request(
            "POST", "/api/conversations/title-suggestion", {"conversationId": conversation.id}
        )
    finally:
        server.close()

    assert status == 400
    assert payload["error"] == "Conversation has no messages to title"


def test_conversation_title_api_rejects_blank_title(tmp_path: Path) -> None:
    mirror_home = tmp_path / "mirror-home"
    db_path = mirror_home / "memory.db"
    with MemoryClient(db_path=db_path) as mem:
        conversation = mem.conversations.start_conversation(interface="pi", title="Old title")

    server = WebTestServer(root=make_docs_root(tmp_path), mirror_home=mirror_home, db_path=db_path)
    try:
        status, payload = server.request(
            "POST", "/api/conversations/title", {"conversationId": conversation.id, "title": "  "}
        )
    finally:
        server.close()

    assert status == 400
    assert payload["error"] == "title is required"


def test_conversation_detail_api_returns_404_for_missing_conversation(tmp_path: Path) -> None:
    mirror_home = tmp_path / "mirror-home"
    server = WebTestServer(
        root=make_docs_root(tmp_path),
        mirror_home=mirror_home,
        db_path=mirror_home / "memory.db",
    )
    try:
        status, payload = server.request("GET", "/api/conversations/detail?id=missing")
    finally:
        server.close()

    assert status == 404
    assert payload["error"] == "Conversation not found"


def test_journey_metadata_api_updates_selected_safe_fields(tmp_path: Path) -> None:
    mirror_home = tmp_path / "mirror-home"
    db_path = mirror_home / "memory.db"
    with MemoryClient(db_path=db_path) as mem:
        mem.identity.set_identity(
            "journey",
            "mirror-mind",
            "# Mirror Mind\n**Status:** active\n\n## Description\nBuild the mirror.",
        )

    server = WebTestServer(root=make_docs_root(tmp_path), mirror_home=mirror_home, db_path=db_path)
    try:
        status, payload = server.request(
            "POST",
            "/api/journeys/metadata",
            {
                "journeyId": "mirror-mind",
                "projectPath": "/code/mirror",
                "syncFile": "/code/mirror/path.md",
                "icon": "◇",
                "color": "amber",
            },
        )
        workspace_status, workspace = server.request("GET", "/api/surface/workspace")
    finally:
        server.close()

    assert status == 200
    assert payload["metadata"] == {
        "color": "amber",
        "icon": "◇",
        "project_path": "/code/mirror",
        "sync_file": "/code/mirror/path.md",
    }
    assert workspace_status == 200
    settings = next(section for section in workspace["sections"] if section["id"] == "settings")
    values = {item["key"]: item["value"] for item in settings["metadata"]["settings"]}
    assert values["projectPath"] == "/code/mirror"
    assert values["syncFile"] == "/code/mirror/path.md"
    assert values["icon"] == "◇"
    assert values["color"] == "amber"


def test_configuration_console_boundaries_stay_coherent(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-boundary-secret")
    mirror_home = tmp_path / "mirror-home"
    db_path = mirror_home / "memory.db"
    with MemoryClient(db_path=db_path) as mem:
        mem.identity.set_identity(
            "journey",
            "mirror-mind",
            "# Mirror Mind\n**Status:** active\n\n## Description\nBuild the mirror.",
        )

    server = WebTestServer(root=make_docs_root(tmp_path), mirror_home=mirror_home, db_path=db_path)
    try:
        config_status, config_payload = server.request("GET", "/api/configuration/overview")
        update_status, update_payload = server.request(
            "POST",
            "/api/journeys/metadata",
            {
                "journeyId": "mirror-mind",
                "projectPath": "/code/mirror",
                "syncFile": "/code/mirror/path.md",
                "icon": "◇",
                "color": "amber",
            },
        )
        workspace_status, workspace = server.request("GET", "/api/surface/workspace")
    finally:
        server.close()

    assert config_status == 200
    config_sections = {section["id"] for section in config_payload["sections"]}
    assert "journeys" not in config_sections
    assert "sk-boundary-secret" not in str(config_payload)
    assert "sk-…ret (masked)" in str(config_payload)
    assert update_status == 200
    assert update_payload["metadata"]["project_path"] == "/code/mirror"
    assert workspace_status == 200
    settings = next(section for section in workspace["sections"] if section["id"] == "settings")
    values = {item["key"]: item["value"] for item in settings["metadata"]["settings"]}
    assert values["projectPath"] == "/code/mirror"
    assert values["syncFile"] == "/code/mirror/path.md"
    assert values["icon"] == "◇"
    assert values["color"] == "amber"


def test_journey_metadata_api_rejects_missing_journey(tmp_path: Path) -> None:
    mirror_home = tmp_path / "mirror-home"
    server = WebTestServer(
        root=make_docs_root(tmp_path),
        mirror_home=mirror_home,
        db_path=mirror_home / "memory.db",
    )
    try:
        status, payload = server.request(
            "POST", "/api/journeys/metadata", {"journeyId": "missing", "projectPath": "/x"}
        )
    finally:
        server.close()

    assert status == 400
    assert "not found" in payload["error"]


def test_default_perspective_api_persists_to_user_home(tmp_path: Path) -> None:
    mirror_home = tmp_path / "mirror-home"
    server = WebTestServer(
        root=make_docs_root(tmp_path),
        mirror_home=mirror_home,
        db_path=mirror_home / "memory.db",
    )
    try:
        status, payload = server.request(
            "POST", "/api/preferences/default-perspective", {"defaultPerspective": "workspace"}
        )
        shell_status, shell = server.request("GET", "/api/shell")
    finally:
        server.close()

    assert status == 200
    assert payload["defaultPerspective"] == "workspace"
    assert shell_status == 200
    assert shell["defaultPerspective"] == "workspace"
    assert (mirror_home / "web" / "preferences.json").exists()


def test_default_perspective_api_rejects_invalid_perspective(tmp_path: Path) -> None:
    mirror_home = tmp_path / "mirror-home"
    server = WebTestServer(
        root=make_docs_root(tmp_path),
        mirror_home=mirror_home,
        db_path=mirror_home / "memory.db",
    )
    try:
        status, payload = server.request(
            "POST", "/api/preferences/default-perspective", {"defaultPerspective": "docs"}
        )
    finally:
        server.close()

    assert status == 400
    assert "atlas" in payload["error"]


def test_configuration_overview_api_serializes_active_mirror_context(tmp_path: Path) -> None:
    mirror_home = tmp_path / "mirror-home"
    db_path = mirror_home / "memory.db"
    with MemoryClient(db_path=db_path) as mem:
        mem.identity.set_identity("ego", "identity", "# Ego\nOperational voice")
        mem.identity.set_identity(
            "journey",
            "mirror-mind",
            "# Mirror Mind\n**Status:** active\n\n## Description\nBuild the mirror.",
            metadata='{"project_path": "/code/mirror", "icon": "◇"}',
        )

    server = WebTestServer(root=make_docs_root(tmp_path), mirror_home=mirror_home, db_path=db_path)
    try:
        status, payload = server.request("GET", "/api/configuration/overview")
    finally:
        server.close()

    assert status == 200
    sections = {section["id"]: section for section in payload["sections"]}
    mirror_items = {item["label"]: item for item in sections["mirror-home"]["items"]}
    assert mirror_items["Mirror home"]["value"] == str(mirror_home.resolve())
    assert mirror_items["Database"]["value"] == str(db_path.resolve())
    assert "journeys" not in sections
    assert "project_path: /code/mirror" not in str(payload)
    assert "OPENROUTER_API_KEY" in str(payload)
    assert "sk-test" not in str(payload)


def test_surface_apis_serialize_core_surface_read_models(tmp_path: Path) -> None:
    mirror_home = tmp_path / "mirror-home"
    db_path = mirror_home / "memory.db"
    with MemoryClient(db_path=db_path) as mem:
        mem.identity.set_identity("ego", "identity", "# Ego\nOperational voice")

    server = WebTestServer(root=make_docs_root(tmp_path), mirror_home=mirror_home, db_path=db_path)
    try:
        atlas_status, atlas = server.request("GET", "/api/surface/atlas")
        workspace_status, workspace = server.request("GET", "/api/surface/workspace")
        detail_status, detail = server.request(
            "GET", "/api/surface/object?kind=identity&id=ego%3Aidentity"
        )
    finally:
        server.close()

    assert atlas_status == 200
    assert workspace_status == 200
    assert detail_status == 200
    ego_region = next(region for region in atlas["regions"] if region["id"] == "ego")
    assert ego_region["cards"][0]["id"] == "ego"
    assert "sections" in workspace
    assert detail["id"] == "ego:identity"
    assert detail["source"]["path"] == "identity/ego/identity"


def test_workspace_api_accepts_selected_journey_query(tmp_path: Path) -> None:
    mirror_home = tmp_path / "mirror-home"
    db_path = mirror_home / "memory.db"
    with MemoryClient(db_path=db_path) as mem:
        mem.identity.set_identity(
            "journey", "alpha", "# Alpha\n**Status:** active\n\n## Description\nFirst."
        )
        mem.identity.set_identity(
            "journey", "beta", "# Beta\n**Status:** active\n\n## Description\nSecond."
        )

    server = WebTestServer(root=make_docs_root(tmp_path), mirror_home=mirror_home, db_path=db_path)
    try:
        status, payload = server.request("GET", "/api/surface/workspace?journey=beta")
    finally:
        server.close()

    assert status == 200
    assert payload["selected_journey_id"] == "beta"
    assert payload["selected_journey"]["title"] == "Beta"


def test_search_api_serializes_recent_memory_results(tmp_path: Path, mock_embeddings) -> None:
    mirror_home = tmp_path / "mirror-home"
    db_path = mirror_home / "memory.db"
    with MemoryClient(db_path=db_path) as mem:
        mem.memories.add_memory(
            title="Choose surface boundary",
            content="Web renders surfaces.",
            memory_type="decision",
        )

    server = WebTestServer(root=make_docs_root(tmp_path), mirror_home=mirror_home, db_path=db_path)
    try:
        status, payload = server.request("GET", "/api/surface/search?q=surface")
    finally:
        server.close()

    assert status == 200
    assert payload["query"] == "surface"
    assert payload["results"][0]["title"] == "Choose surface boundary"


def test_memory_category_api_serializes_recent_memory_results(
    tmp_path: Path, mock_embeddings
) -> None:
    mirror_home = tmp_path / "mirror-home"
    db_path = mirror_home / "memory.db"
    with MemoryClient(db_path=db_path) as mem:
        mem.memories.add_memory(
            title="Choose surface boundary",
            content="Web renders surfaces.",
            memory_type="decision",
        )

    server = WebTestServer(root=make_docs_root(tmp_path), mirror_home=mirror_home, db_path=db_path)
    try:
        status, payload = server.request("GET", "/api/surface/memories?category=decisions")
    finally:
        server.close()

    assert status == 200
    assert payload["query"] == "Decisions"
    assert payload["perspective"] == "memories"
    assert payload["results"][0]["title"] == "Choose surface boundary"


def test_object_detail_api_returns_404_for_missing_object(tmp_path: Path) -> None:
    mirror_home = tmp_path / "mirror-home"
    db_path = mirror_home / "memory.db"
    server = WebTestServer(root=make_docs_root(tmp_path), mirror_home=mirror_home, db_path=db_path)
    try:
        status, payload = server.request("GET", "/api/surface/object?kind=identity&id=missing")
    finally:
        server.close()

    assert status == 404
    assert payload == {"error": "Object not found"}
