# browserCAD

Browser-based CAD viewer (React 19 + Vite + three.js) for .glb/.gltf/.stl files.
Frontend lives in `src/`. `backend/` — Flask + Celery + Redis + OCP (OpenCASCADE)
STEP→GLB conversion service, built step-by-step in learning mode: scaffolding and
configs are done, logic is filled by the USER via lessons marked `TODO (Урок ...)`
in docstrings — don't implement those TODOs unless explicitly asked. Backend runs
from `backend/` with its own `.venv` (Python 3.14, `cadquery-ocp==8.0.1.0.0`,
module import name is `OCP`; in OCP 8.x the glTF writer is `RWGltf_CafWriter`,
not `RWGltf_CAFWriter`). Deploy files are in `backend/deploy/` (manual SSH deploy,
not wired to the GitHub Action).

## Commands

- `npm run dev` — dev server
- `npm run build` — typechecks (`tsc -b`) then builds; this is the ONLY typecheck (no separate script)
- `npm run lint` — ESLint 9 flat config. Currently FAILS with pre-existing error  (react-hooks/immutability in ModelViewer selection code, react-refresh/only-export-components
  in Chakra UI snippets) — don't assume your change broke it
- No test framework or tests exist. Don't invent a runner.

## Deploy warning

Pushes to `main` auto-deploy to production: `.github/workflows/deploy.yml` SSHes to
a server and runs `bash deploy.sh` there (script lives on the server, NOT in this repo).

## Architecture

- Entry: `src/main.tsx` → `src/App.tsx` (upload ↔ viewer state machine, owns VirtualFileSystem lifecycle)
- `src/utils/VirtualFileSystem.ts` — maps uploaded files to blob URLs (folder uploads use
  `webkitRelativePath`); `dispose()` must be called to revoke blob URLs
- `src/components/ModelViewer/index.tsx` — entire three.js viewer (~1800 lines): GLTF/STL loaders,
  Orbit/TransformControls, clipping planes, dimensions, distance measurement.
  Three.js objects live in refs; React state only tracks UI.
  `.gltf` external buffer/image URIs are rewritten to blob URLs by editing the glTF JSON before loading.
- `src/components/UI/` — Chakra UI v3 generated snippets (provider, color-mode, toaster, tooltip)

## Conventions

- Chakra UI v3 API: hooks (`useSlider`, `useCheckbox`) and snippets, not v2 component props
- `verbatimModuleSyntax`: type-only imports must use `import type`
- `erasableSyntaxOnly`: no enums/namespaces/parameter properties
- three.js addons import from `three/examples/jsm/...` with explicit `.js` extension
- User-facing text is in Russian
