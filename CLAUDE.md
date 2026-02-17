# CLAUDE.md

## Project Overview

Network Vis is a native macOS Electron app that visualizes real-time network signals. It discovers Wi-Fi, LAN, Bluetooth, Bonjour, and active connection data via system commands, and renders an interactive D3 force graph. As a proper `.app` bundle it can request Location Services permission for real Wi-Fi SSID names.

## Commands

```bash
pnpm dev          # electron-vite dev (opens Electron window with hot reload)
pnpm build        # electron-vite build (compile to out/)
pnpm dist         # Build + package macOS .app to release/
pnpm typecheck    # tsc --noEmit
```

## Project Structure

```
src/
  main/                        # Electron main process (Node.js)
    index.ts                   # App lifecycle, PATH augmentation, init orchestrator
    window.ts                  # BrowserWindow creation (hiddenInset titlebar)
    types.ts                   # Canonical type definitions (NetworkNode, edges, IPC messages)
    ipc/
      index.ts                 # registerAllHandlers()
      scanner.handler.ts       # IPC handlers: pause, resume, scan_now, get_full_state
    services/
      orchestrator.ts          # Schedules scanners, merges state, broadcasts via IPC
      state.ts                 # In-memory node map with lifecycle management
    scanners/                  # One file per scanner (arp, wifi, bluetooth, bonjour, connections)
      base.ts                  # Abstract BaseScanner class
  preload/
    index.ts                   # Expose scanner API + event listeners via contextBridge
  renderer/
    index.html                 # HTML entry point
    src/
      main.tsx                 # React entry
      index.css                # Tailwind + dark theme CSS variables
      App.tsx                  # Root layout: sidebar + canvas + controls
      types.ts                 # Renderer copy of types
      hooks/
        useScanner.ts          # IPC-based scanner communication (replaces WebSocket)
        useNetworkState.ts     # Node/edge state management
        useD3Simulation.ts     # D3 force simulation + rendering
      components/              # NetworkCanvas, Sidebar, Controls, Legend, NodeTooltip
      visualization/           # D3 force/radial layout, renderers, color scales
      lib/                     # shadcn utils
```

## Architecture

Three-process Electron model:
```
Main Process (Node.js)          Preload (context bridge)          Renderer (Chromium/React)
  src/main/                       src/preload/index.ts              src/renderer/
  ├── index.ts (entry)                                              ├── App.tsx
  ├── services/                                                     ├── hooks/
  ├── ipc/                                                          ├── components/
  └── scanners/                                                     └── visualization/
```

**IPC communication flow:**
React hooks → `window.electron.*` (preload bridge) → IPC handlers (`src/main/ipc/`) → Orchestrator/Scanners → events back via `webContents.send` → preload listeners → React re-renders.

## Key Conventions

- **Package manager**: pnpm (not npm).
- **Build system**: electron-vite with three targets (main, preload, renderer) in `electron.vite.config.ts`.
- **Renderer UI**: Tailwind CSS 4 + shadcn components. Use `@/` path alias for imports (`@/*` → `src/renderer/src/*`).
- **D3 strategy**: D3 owns SVG manipulation for 60fps (force simulation, node rendering). React owns all UI chrome (sidebar, controls, tooltips). They don't fight over the same DOM.
- **Types**: Canonical types in `src/main/types.ts`, duplicated in `src/renderer/src/types.ts`. Keep in sync.
- **bonjour-service**: Use named import `import { Bonjour } from 'bonjour-service'` (not default).
- **Dark theme**: Applied via `className="dark"` on root div in App.tsx and `<html class="dark">` in index.html.
- **Scanner errors**: All scanners catch and log errors gracefully. System command failures don't crash the app.
- **PATH augmentation**: `src/main/index.ts` prepends `/opt/homebrew/bin` etc. so packaged app finds system commands.
- **Security**: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: false` (required for system command execution).

## Architecture Notes

- Main process sends full state on window load, then incremental `scanner:update` IPC messages
- Node lifecycle: active -> stale (30s) -> expired (60s) -> removed (90s)
- Renderer filters nodes/edges by signal type before passing to D3
- NetworkCanvas exposes zoom controls via `useImperativeHandle` ref
- Location Services: `NSLocationWhenInUseUsageDescription` in electron-builder mac config

## Spec Documentation (`docs/`)

The `docs/` directory contains specification documents that describe the system in detail:

- **`SPEC.md`** — Product specification: capabilities, discovery matrix, fingerprinting, visualization modes, lifecycle, non-functional requirements
- **`ARCHITECTURE.md`** — Architecture specification: process model, data flow, IPC protocol, state management, node identity, build system, design decisions
- **`TYPES.md`** — Type specification: all TypeScript interfaces, union types, visual constants, edge creation rules
- **`SCANNERS.md`** — Scanner specification: each scanner's system command, parsing logic, field extraction, error handling, OUI database, fingerprinting process
- **`UI.md`** — UI & renderer specification: component tree, app state, hooks, D3 simulation, layout modes, node rendering, styling

### Keeping Spec Docs Up to Date

**When making changes to the codebase, you MUST update the relevant spec docs to reflect those changes.** This includes:

- **New features**: Add to `SPEC.md` (capabilities), `ARCHITECTURE.md` (data flow if applicable), and the relevant detail doc.
- **New/modified types**: Update `TYPES.md` with the new interfaces, fields, or union members.
- **New/modified scanners**: Update `SCANNERS.md` with the scanner's command, parsing, and output.
- **New/modified components or hooks**: Update `UI.md` with the component's props, behavior, and position in the tree.
- **Architectural changes** (new IPC channels, state management changes, new processes): Update `ARCHITECTURE.md`.
- **Refactors**: If a refactor changes file locations, data flow, or public interfaces, update all affected spec docs.

Spec docs should describe *what the system does and how*, not aspirational features. Only document implemented behavior.

## Browser Automation (Testing)

Use [agent-browser](https://github.com/vercel/agent-browser) to interact with the Electron renderer for automated testing:

```bash
pnpm dev:debug          # Start electron-vite dev with CDP on port 9222
agent-browser connect 9222  # Connect agent-browser to the Electron window
```

Key agent-browser commands:
- `snapshot` — dump the accessibility tree (find `@ref` handles for elements)
- `screenshot <path>` — save a screenshot of the current window
- `click @ref` — click an element by its accessibility ref
- `hover @ref` — hover an element by its accessibility ref

Requires `agent-browser` installed globally: `pnpm add -g agent-browser`
