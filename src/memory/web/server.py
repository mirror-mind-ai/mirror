"""Local read-only web server for the Mirror web console."""

from __future__ import annotations

import argparse
import json
import mimetypes
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from memory import MemoryClient
from memory.cli.common import db_path_from_mirror_home
from memory.config import resolve_mirror_home
from memory.web.configuration import build_configuration_overview
from memory.web.docs import DocsBrowser
from memory.web.mirrors import MirrorRegistry
from memory.web.preferences import DEFAULT_AVATAR_SYMBOL, VALID_PERSPECTIVES, WebPreferenceStore

STATIC_DIR = Path(__file__).parent / "static"


class MirrorWebHandler(BaseHTTPRequestHandler):
    browser: DocsBrowser
    mirror_home: Path | None
    db_path: Path | None

    def do_GET(self) -> None:
        parsed = urlparse(self.path)

        if parsed.path == "/api/shell":
            self._send_json(self._shell_payload())
            return

        if parsed.path == "/api/mirrors":
            self._send_json([mirror.to_dict() for mirror in self._mirrors().list_mirrors()])
            return

        if parsed.path == "/api/configuration/overview":
            self._send_json(build_configuration_overview(self.__class__.mirror_home).to_dict())
            return

        if parsed.path == "/api/surface/atlas":
            with MemoryClient(db_path=self._db_path()) as mem:
                self._send_json(mem.surfaces.atlas_home().to_dict())
            return

        if parsed.path == "/api/surface/workspace":
            query = parse_qs(parsed.query)
            journey_id = query.get("journey", [None])[0]
            with MemoryClient(db_path=self._db_path()) as mem:
                self._send_json(mem.surfaces.workspace_home(journey_id=journey_id).to_dict())
            return

        if parsed.path == "/api/surface/object":
            query = parse_qs(parsed.query)
            kind = query.get("kind", [""])[0]
            object_id = query.get("id", [""])[0]
            with MemoryClient(db_path=self._db_path()) as mem:
                detail = mem.surfaces.object_detail(kind, object_id)
            if detail is None:
                self._send_json({"error": "Object not found"}, status=404)
                return
            self._send_json(detail.to_dict())
            return

        if parsed.path == "/api/surface/memories":
            query = parse_qs(parsed.query)
            category = query.get("category", [""])[0]
            with MemoryClient(db_path=self._db_path()) as mem:
                self._send_json(mem.surfaces.memory_category(category).to_dict())
            return

        if parsed.path == "/api/surface/search":
            query = parse_qs(parsed.query)
            search_query = query.get("q", [""])[0]
            perspective = query.get("perspective", [None])[0]
            with MemoryClient(db_path=self._db_path()) as mem:
                self._send_json(mem.surfaces.search(search_query, perspective).to_dict())
            return

        if parsed.path == "/api/docs/tree":
            self._send_json([node.to_dict() for node in self.browser.tree()])
            return

        if parsed.path == "/api/docs/file":
            query = parse_qs(parsed.query)
            doc_path = query.get("path", [""])[0]
            try:
                self._send_json(
                    {
                        "path": doc_path,
                        "markdown": self.browser.read_markdown(doc_path),
                        "html": self.browser.render_html(doc_path),
                    }
                )
            except (FileNotFoundError, ValueError) as exc:
                self._send_json({"error": str(exc)}, status=404)
            return

        self._send_static(parsed.path)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/mirrors/select":
            self._select_mirror()
            return
        if parsed.path == "/api/preferences/default-perspective":
            self._write_default_perspective()
            return
        if parsed.path == "/api/preferences/profile":
            self._write_profile()
            return
        if parsed.path == "/api/preferences/theme":
            self._write_theme()
            return
        if parsed.path == "/api/journeys/metadata":
            self._write_journey_metadata()
            return
        self._send_json({"error": "Not found"}, status=404)

    def log_message(self, format: str, *args: object) -> None:
        return

    def _mirrors(self) -> MirrorRegistry:
        return MirrorRegistry(self.__class__.mirror_home)

    def _preferences(self) -> WebPreferenceStore:
        return WebPreferenceStore(self.__class__.mirror_home)

    def _db_path(self) -> Path | None:
        mirror_home = self.__class__.mirror_home
        if mirror_home is None:
            return self.__class__.db_path
        return db_path_from_mirror_home(mirror_home)

    def _shell_payload(self) -> dict[str, object]:
        mirrors = self._mirrors()
        preference = self._preferences().read()
        return {
            "mirror": {
                "name": mirrors.current_name(),
                "path": str(mirrors.mirror_home) if mirrors.mirror_home else None,
            },
            "profile": preference.profile.to_dict(),
            "theme": preference.theme,
            "preferencesPath": str(self._preferences().path) if self._preferences().path else None,
            "mirrors": [mirror.to_dict() for mirror in mirrors.list_mirrors()],
            "defaultPerspective": preference.default_perspective,
            "validPerspectives": list(VALID_PERSPECTIVES),
            "docsAvailable": True,
            "warning": preference.warning,
        }

    def _select_mirror(self) -> None:
        try:
            payload = self._read_json_body()
            name = payload.get("name")
            if not isinstance(name, str):
                raise ValueError("Mirror name is required.")
            mirror_home = self._mirrors().selectable_home(name)
            if mirror_home is None:
                raise ValueError("Mirror must be one of the discovered local Mirrors.")
        except (json.JSONDecodeError, ValueError, TypeError) as exc:
            self._send_json({"error": str(exc)}, status=400)
            return

        self.__class__.mirror_home = mirror_home
        self._send_json(self._shell_payload())

    def _write_default_perspective(self) -> None:
        try:
            payload = self._read_json_body()
            perspective = payload.get("defaultPerspective")
            preference = self._preferences().write_default_perspective(perspective)
        except (json.JSONDecodeError, ValueError, TypeError) as exc:
            self._send_json({"error": str(exc)}, status=400)
            return
        except OSError as exc:
            self._send_json(
                {"error": f"Default perspective preference could not be written: {exc}"}, status=500
            )
            return

        self._send_json(
            {
                "defaultPerspective": preference.default_perspective,
                "profile": preference.profile.to_dict(),
                "warning": preference.warning,
            }
        )

    def _write_journey_metadata(self) -> None:
        try:
            payload = self._read_json_body()
            journey_id = payload.get("journeyId")
            if not isinstance(journey_id, str) or not journey_id:
                raise ValueError("journeyId is required")
            fields = {
                "project_path": payload.get("projectPath", ""),
                "sync_file": payload.get("syncFile", ""),
                "icon": payload.get("icon", ""),
                "color": payload.get("color", ""),
            }
            if not all(isinstance(value, str) for value in fields.values()):
                raise ValueError("Journey metadata fields must be strings")
            with MemoryClient(db_path=self._db_path()) as mem:
                metadata = mem.journeys.update_metadata_fields(journey_id, fields)
        except (json.JSONDecodeError, ValueError, TypeError) as exc:
            self._send_json({"error": str(exc)}, status=400)
            return

        self._send_json({"journeyId": journey_id, "metadata": metadata})

    def _write_theme(self) -> None:
        try:
            payload = self._read_json_body()
            theme = payload.get("theme")
            if not isinstance(theme, str):
                raise ValueError("theme must be a string")
            preference = self._preferences().write_theme(theme)
        except (json.JSONDecodeError, ValueError, TypeError) as exc:
            self._send_json({"error": str(exc)}, status=400)
            return
        except OSError as exc:
            self._send_json({"error": f"Theme preference could not be written: {exc}"}, status=500)
            return

        self._send_json(
            {
                "theme": preference.theme,
                "warning": preference.warning,
            }
        )

    def _write_profile(self) -> None:
        try:
            payload = self._read_json_body()
            display_name = payload.get("displayName")
            avatar_symbol = payload.get("avatarSymbol", DEFAULT_AVATAR_SYMBOL)
            if not isinstance(display_name, str) or not isinstance(avatar_symbol, str):
                raise ValueError("displayName and avatarSymbol must be strings")
            preference = self._preferences().write_profile(display_name, avatar_symbol)
        except (json.JSONDecodeError, ValueError, TypeError) as exc:
            self._send_json({"error": str(exc)}, status=400)
            return
        except OSError as exc:
            self._send_json(
                {"error": f"Profile preferences could not be written: {exc}"}, status=500
            )
            return

        self._send_json(
            {
                "profile": preference.profile.to_dict(),
                "warning": preference.warning,
            }
        )

    def _read_json_body(self) -> dict[str, object]:
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length).decode("utf-8") if length else "{}"
        payload = json.loads(body)
        if not isinstance(payload, dict):
            raise TypeError("JSON body must be an object")
        return payload

    def _send_json(self, payload: object, status: int = 200) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_static(self, request_path: str) -> None:
        relative = "index.html" if request_path in {"", "/"} else request_path.lstrip("/")
        candidate = (STATIC_DIR / relative).resolve()
        if not candidate.is_file() or not candidate.is_relative_to(STATIC_DIR.resolve()):
            self.send_error(404)
            return

        body = candidate.read_bytes()
        content_type = mimetypes.guess_type(candidate.name)[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def create_handler(
    *,
    root: Path | None = None,
    mirror_home: Path | None = None,
    db_path: Path | None = None,
) -> type[MirrorWebHandler]:
    browser = DocsBrowser(root=root)
    resolved_mirror_home = Path(mirror_home).expanduser().resolve() if mirror_home else None

    class Handler(MirrorWebHandler):
        pass

    Handler.browser = browser
    Handler.mirror_home = resolved_mirror_home
    Handler.db_path = db_path
    return Handler


def serve(
    host: str = "127.0.0.1",
    port: int = 8765,
    root: Path | None = None,
    mirror_home: Path | None = None,
) -> None:
    if mirror_home is None:
        try:
            mirror_home = resolve_mirror_home()
        except ValueError:
            mirror_home = None
    db_path = db_path_from_mirror_home(mirror_home)
    server = ThreadingHTTPServer(
        (host, port), create_handler(root=root, mirror_home=mirror_home, db_path=db_path)
    )
    print(f"Mirror Web Console running at http://{host}:{port}")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        server.server_close()


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Run the local Mirror Web Console")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--root", type=Path, default=None)
    parser.add_argument("--mirror-home", type=Path, default=None)
    args = parser.parse_args(argv)
    serve(host=args.host, port=args.port, root=args.root, mirror_home=args.mirror_home)


if __name__ == "__main__":
    main()
