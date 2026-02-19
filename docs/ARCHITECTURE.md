# Network Vis - Architecture Specification

## Process Model

Network Vis uses Electron's three-process architecture with strict isolation:

```
┌─────────────────────────────┐   ┌──────────────┐   ┌─────────────────────────────┐
│     Main Process (Node.js)  │   │   Preload     │   │   Renderer (Chromium)       │
│     src/main/               │   │   Bridge      │   │   src/renderer/             │
│                             │   │               │   │                             │
│  ┌─────────────────────┐   │   │  contextBridge│   │  ┌───────────────────────┐  │
│  │  Orchestrator        │   │   │  exposes      │   │  │  React App            │  │
│  │  ├── NetworkState    │◄──┼───┤  scanner API  ├───┼──┤  ├── useScanner       │  │
│  │  ├── Scanners (5+3)  │   │   │  + event      │   │  │  ├── useNetworkState  │  │
│  │  ├── PacketScanner   │   │   │  listeners    │   │  │  ├── useD3Simulation  │  │
│  │  └── Fingerprinter   │   │   │               │   │  │  └── usePacketEvents  │  │
│  └─────────────────────┘   │   │               │   │  └───────────────────────┘  │
│                             │   │               │   │                             │
│  ┌─────────────────────┐   │   └──────────────┘   │  ┌───────────────────────┐  │
│  │  IPC Handlers        │   │                       │  │  D3 SVG Canvas        │  │
│  │  (scanner:*)         │   │                       │  │  (force/radial graph) │  │
│  └─────────────────────┘   │                       │  └───────────────────────┘  │
└─────────────────────────────┘                       └─────────────────────────────┘
```

### Main Process (`src/main/`)

Runs in Node.js. Responsible for:
- App lifecycle management (window creation, shutdown)
- PATH augmentation for packaged `.app` (Homebrew paths)
- Scanner scheduling and execution
- Network state management with node lifecycle
- Device fingerprinting enrichment
- IPC handler registration
- Broadcasting state updates to renderer

### Preload (`src/preload/`)

Thin context bridge. Exposes a typed `window.electron` API:
- **Scanner invoke methods**: `pause()`, `resume()`, `scanNow(name?)`, `getFullState()`
- **Packet invoke methods**: `packet.start(options?)`, `packet.stop()`, `packet.status()`, `packet.getEvents()`
- **Event listeners**: `scannerUpdate(callback)`, `scannerFullState(callback)`, `packetEvent(callback)`, `topologyUpdate(callback)`

Each event listener returns an unsubscribe function for cleanup.

### Renderer (`src/renderer/`)

Runs in Chromium. Responsible for:
- React UI chrome (sidebar, controls, legend, tooltip)
- D3 force/radial graph rendering
- User interaction (filters, search, zoom, drag, click, hover)
- Maintaining filtered views of network state

## Data Flow

### Scan Cycle

```
1. Orchestrator timer fires (or user triggers "Scan Now")
2. Scanner.scan() executes system command
3. Scanner parses output → ScanResult { nodes[], edges[] }
4. Orchestrator.applyResult() upserts nodes/edges into NetworkState
5. Orchestrator.classify() runs DeviceFingerprinter (device type) then OsEnricher (OS family) on LAN/Bluetooth nodes
6. Orchestrator.enrichEdges()/enrichNodes() adds TrafficScanner bandwidth data at IPC boundary
7. Orchestrator.pushUpdate() sends enriched ScannerUpdate to renderer
8. Preload bridge forwards to event listeners
9. useScanner passes message to useNetworkState.handleMessage()
10. useNetworkState upserts into maps, triggers React setState
11. App.tsx derives filtered nodes/edges
12. useD3Simulation.updateGraph() binds data to D3
13. D3 simulation tick renders at 60fps
```

### Initial Load (Double-Gate Pattern)

Both conditions must be met before sending full state:
1. `BrowserWindow.webContents` fires `did-finish-load`
2. `Orchestrator.start()` promise resolves (initial scan complete)

Whichever completes second triggers `orchestrator.sendFullState()`. This prevents an empty state flash.

### Lifecycle Tick

Every 5 seconds, the orchestrator calls `NetworkState.tick()`:
- Nodes not seen in 30s → `stale`
- Nodes not seen in 60s → `expired`
- Nodes not seen in 90s → removed (deleted from maps, edges cleaned)
- `this_device` is exempt

If any removals or status changes occurred, a `ScannerUpdate` is broadcast.

## IPC Protocol

| Channel | Direction | Trigger | Payload |
|---|---|---|---|
| `scanner:pause` | Renderer → Main | User clicks pause | — |
| `scanner:resume` | Renderer → Main | User clicks play | — |
| `scanner:scan-now` | Renderer → Main | User clicks refresh | `{ scannerName?: string }` |
| `scanner:get-full-state` | Renderer → Main | Hook mount | — |
| `scanner:full-state` | Main → Renderer | Window load + scan ready | `ScannerFullState` |
| `scanner:update` | Main → Renderer | Every scan cycle / tick | `ScannerUpdate` |
| `packet:start` | Renderer → Main | User starts DPI | `{ interface?: string }` |
| `packet:stop` | Renderer → Main | User stops DPI | — |
| `packet:status` | Renderer → Main | On mount / after toggle | — → `PacketScannerStatus` |
| `packet:get-events` | Renderer → Main | On demand | — → `PacketEvent[]` |
| `packet:event` | Main → Renderer | Per captured packet batch | `PacketEvent` |
| `topology:update` | Main → Renderer | After topology scan + on window load | `SubnetInfo[]` |
| `os:nmap-scan` | Renderer → Main | User clicks "Scan with nmap" | `ip: string` → `NmapScanResult` |
| `os:nmap-status` | Renderer → Main | On detail panel mount | — → `{ available: boolean }` |

### Message Types

```typescript
ScannerFullState {
  type: 'full_state'
  nodes: NetworkNode[]
  edges: NetworkEdge[]
  timestamp: number
}

ScannerUpdate {
  type: 'node_update'
  nodes: NetworkNode[]       // all current nodes (full replace)
  edges: NetworkEdge[]       // all current edges (full replace)
  removed: string[]          // IDs of removed nodes
  timestamp: number
}
```

## State Management

### Main Process: NetworkState

In-memory `Map<string, NetworkNode>` and `Map<string, NetworkEdge>`. Methods:
- `upsertNode(node)` — merge with existing, preserve `firstSeen`, update `lastSeen`, force `active`
- `patchNode(id, fields)` — merge fields into existing node without resetting lifecycle (lastSeen/status). Used by OS enrichment and nmap scans to avoid making fingerprinted nodes immortal.
- `upsertEdge(edge)` — simple set by ID
- `removeEdgesForNode(nodeId)` — iterates all edges, removes those referencing the node
- `tick()` — lifecycle transitions, returns `{ removed[], statusChanged }`
- `getNodes()` / `getEdges()` — array snapshots from maps

### Renderer: useNetworkState

Mirror maps (`Map<string, NetworkNode>` and `Map<string, NetworkEdge>`) stored in refs (no re-render on map mutation). React state is only updated after processing a complete message:
- `full_state` → replace both maps entirely
- `node_update` → upsert nodes/edges, delete removed, clean up edges for removed nodes

## Node Identity

Each node type uses a deterministic ID scheme for stable deduplication:

| Signal Type | ID Pattern | Example |
|---|---|---|
| This Device | `this-device` | `this-device` |
| LAN | `lan-{normalized_mac}` | `lan-08:00:20:01:02:03` |
| Wi-Fi | `wifi-{ssid}` | `wifi-MyNetwork` |
| Bluetooth | `bt-{mac_or_name}` | `bt-AA:BB:CC:DD:EE:FF` |
| Bonjour | `bonjour-{type}-{name_or_host}` | `bonjour-airplay-Living-Room` |
| Connection | `conn-{proto}-{host}-{port}-{process}` | `conn-TCP-142.250.80.46-443-firefox` |

## Build System

electron-vite compiles three targets from a single config (`electron.vite.config.ts`):

| Target | Entry | Plugins | Output |
|---|---|---|---|
| **main** | `src/main/index.ts` | `externalizeDepsPlugin()` | `out/main/` |
| **preload** | `src/preload/index.ts` | `externalizeDepsPlugin()` | `out/preload/` |
| **renderer** | `src/renderer/index.html` | `@vitejs/plugin-react`, `@tailwindcss/vite` | `out/renderer/` |

Production packaging: `electron-builder` produces a macOS `.app` to `release/`.

## Key Design Decisions

1. **D3 owns SVG, React owns chrome**: D3 directly manipulates SVG DOM for 60fps. React manages sidebar, controls, tooltips. They never touch the same DOM elements.

2. **IPC over WebSocket**: Native Electron IPC is simpler, faster, and more appropriate than spinning up a WebSocket server.

3. **Full state on every update**: `ScannerUpdate` includes all current nodes/edges (not just deltas). This simplifies renderer reconciliation at the cost of slightly larger payloads. The `removed` array handles deletions.

4. **Fingerprinting as post-processing**: Device classification and OS fingerprinting run after ARP/Bonjour scans, not inside scanners. This separates concerns and allows cross-referencing data from multiple scanners. Device fingerprinting runs first (deviceType/iconKey), then OS enrichment runs second (osFamily/deviceCategory), using TTL data from PacketScanner when available.

5. **Position preservation**: `useD3Simulation` maps existing D3 node positions by ID before rebuilding the simulation, preventing visual jumps on incremental updates.

6. **Late re-rendering**: Nodes track `data-icon-key`, `data-os-family`, and `data-protocols-hash` attributes. When fingerprinting, OS enrichment, or DPI enriches a node after initial render, the node shape/ring/badge is re-rendered.

7. **Double-gate initialization**: Prevents empty state flash by waiting for both window load and initial scan completion.

8. **Callback-based event dispatch**: The PacketScanner does not import BrowserWindow. Instead, the orchestrator passes an `onEvent` callback when starting capture, maintaining the architecture boundary where only the orchestrator/IPC layer touches `webContents.send`.

9. **Two DPI data flows**: Protocol enrichment flows through the existing `scanner:update` channel (orchestrator enriches nodes, pushes full state). Individual packet events flow through the dedicated `packet:event` push channel for the detail panel's live feed.

10. **Traffic enrichment at IPC boundary**: The TrafficScanner computes per-connection bandwidth rates from `nettop` samples but does NOT store them in the state manager (which would be overwritten by ConnectionsScanner every 3s). Instead, the orchestrator enriches edges and nodes with rate data in `pushUpdate()` and `getFullState()` — just before sending over IPC. This keeps the state clean and avoids race conditions.
