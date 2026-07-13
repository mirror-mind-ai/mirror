# Installer assets

Drop `mirror.ico` here to brand the installer and the Desktop shortcut.

- **File:** `mirror.ico`
- **Recommended:** a multi-resolution `.ico` (16, 32, 48, 256 px).

The installer references it defensively: if `mirror.ico` is absent, the build
still succeeds and Windows falls back to the default shortcut icon. Add the icon
before the release build (Phase 8) so the shortcut looks polished.
