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


def test_shell_api_reports_missing_default_and_mirror_name(tmp_path: Path) -> None:
    server = WebTestServer(
        root=make_docs_root(tmp_path),
        mirror_home=tmp_path / "mirror-home",
        db_path=tmp_path / "mirror-home" / "memory.db",
    )
    try:
        status, payload = server.request("GET", "/api/shell")
    finally:
        server.close()

    assert status == 200
    assert payload["mirror"] == {"name": "mirror-home"}
    assert payload["defaultPerspective"] is None
    assert payload["validPerspectives"] == ["atlas", "workspace"]
    assert payload["docsAvailable"] is True


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
