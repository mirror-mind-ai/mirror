# Installer assets

- `mirror.ico` — the product's diamond sign as an octahedron, violet to
  indigo, no background plate. Nine sizes (16–256): DIB entries up to 64 px so
  every reader (Inno included) accepts it, PNG at 128 and 256.
- `wizard-small.bmp` / `wizard-small-200.bmp` — the wizard's top-right image
  at 100% and 200% DPI, same octahedron on white.
- `wizard-banner.bmp`, `wizard-large.bmp` — welcome/finish page images.
- `mirror-256.png` — preview for READMEs.

All of the first three are generated: run `build-icon.ps1` after changing the
shape or palette; do not hand-edit the binaries.
