# Windows Frame Mockup (ES-004 · Experiment 1)

Fully navigable, simulated prototype of the "Fusão A+C" desktop frame for
Mirror Mind on Windows: guided first-run wizard, tabbed Pi sessions, setup
traffic lights, and a living personas glossary.

- **Live:** https://windows-frame-mockup.vercel.app
- **Story:** [ES-004 Windows Desktop Frame](../../docs/project/exploration/es-004-windows-desktop-frame.md)
- **Stack:** static HTML/CSS/JS, no build step. Deployed with `vercel deploy --prod`.

Everything conversational is scripted. The architecture it depicts is real:
every panel maps to existing Mirror commands (`configure.ps1`,
`health-check.ps1`, `memory identity`, `detect-persona`, `runtime update`).
The "Experimente" persona router uses the same keyword logic as the real
`detect-persona`. The frame never touches Mirror core.

Purpose: collect Navigator-level feedback (Alisson, Vinicius) before any
construction. Feedback thickens ES-004; promotion to a CV is the exit
condition.
