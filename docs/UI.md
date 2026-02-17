# Network Vis - UI & Renderer Specification

## Overview

The renderer is a React + D3 application running in Chromium. React owns all UI chrome (sidebar, controls, legend, tooltip). D3 owns the SVG canvas for 60fps force-directed graph rendering. They never manipulate the same DOM elements.

## Component Tree

```
App.tsx
├── div.titlebar                    // macOS drag region (40px)
├── Sidebar                         // Left panel (w-72)
│   ├── Filter toggles (5)
│   ├── Search input
│   └── Node list (scrollable)
├── main (flex-1, relative)
│   ├── NetworkCanvas (forwardRef)  // Full-viewport SVG
│   │   └── useD3Simulation         // D3 force graph
│   ├── Legend                      // Top-right card
│   ├── Controls                    // Bottom-center toolbar
│   ├── NodeTooltip                 // Cursor-following card
│   └── NodeDetailPanel             // Right slide-in panel (on node click)
```

## App State (App.tsx)

| State | Type | Default | Description |
|---|---|---|---|
| `canvasRef` | `Ref<NetworkCanvasHandle>` | — | Exposes zoom methods |
| `state` | `NetworkState` | `{ nodes: [], edges: [], nodeMap: {} }` | From `useNetworkState` |
| `connected` | `boolean` | `false` | IPC connection status |
| `layoutMode` | `LayoutMode` | `'force'` | `'force'` or `'radial'` |
| `scanning` | `boolean` | `true` | Whether scanners are active |
| `filters` | `Set<SignalType>` | All 6 types | Active signal type filters |
| `selectedNode` | `NetworkNode \| null` | `null` | Clicked node |
| `tooltip` | `{ node, x, y } \| null` | `null` | Hovered node + position |
| `packetCapturing` | `boolean` | `false` | DPI capture active |
| `captureStatus` | `PacketScannerStatus \| null` | `null` | Current capture status |
| `showSubnetGroups` | `boolean` | `false` | Subnet grouping overlay visible |
| `showTrafficFlow` | `boolean` | `true` | Traffic flow animation on edges |

### Derived Data

- `filteredNodes`: `state.nodes.filter(n => filters.has(n.signalType))`
- `filteredEdges`: edges where both `source` and `target` node IDs are in the filtered node set
- `freshSelectedNode`: selected node refreshed from `state.nodeMap` on every render (so protocol data stays current)

---

## Components

### Sidebar (`components/Sidebar.tsx`)

**Props**: `nodes`, `filters`, `onToggleFilter`, `onNodeClick`, `selectedNode`, `showSubnetGroups?`, `subnets?`, `getSubnetForIp?`

**Layout**: Fixed `w-72` aside, full height, dark card background.

**Sections**:
1. **Header**: "Network Signals" title + total device count badge
2. **Filter toggles**: 5 buttons (excludes `this_device`). Each shows:
   - Colored dot (signal type color)
   - Lucide icon (`Wifi`, `Monitor`, `Bluetooth`, `Globe`, `ArrowUpDown`)
   - Label text
   - Count of nodes for that type
   - Active state: `bg-accent`, inactive: muted
3. **Search input**: Text filter for node list (case-insensitive substring match on name)
4. **Node list**: Scrollable. Each row:
   - Colored dot (signal type)
   - Name (truncated)
   - IP address (if present, muted)
   - Product name for LAN nodes (10px, muted)
   - Status badge: green dot (active), yellow (stale), red (expired)
   - Click handler → `onNodeClick`
   - Selected node highlighted with `bg-accent`

**Sorting**: Visible nodes sorted alphabetically by name.

**Subnet grouped mode** (when `showSubnetGroups` is true and LAN filter is active): Non-LAN nodes render in a flat list first. LAN nodes are grouped under teal-tinted subnet headers showing CIDR, interface, and device count (e.g., `192.168.1.0/24 (en0) — 3`). Nodes within each group are sorted alphabetically. LAN nodes with no matching subnet appear under an "Other" group.

### NetworkCanvas (`components/NetworkCanvas.tsx`)

**Props**: `nodes`, `edges`, `layoutMode`, `onNodeHover`, `onNodeClick`, `showSubnetGroups`, `getSubnetForIp`, `showTrafficFlow`

Wraps `useD3Simulation` and exposes `NetworkCanvasHandle` via `useImperativeHandle`:

```typescript
interface NetworkCanvasHandle {
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void
}
```

Renders a single `<svg>` element at 100% width/height with transparent background.

### Controls (`components/Controls.tsx`)

**Props**: `layoutMode`, `onToggleLayout`, `scanning`, `onToggleScanning`, `onScanNow`, `onZoomIn`, `onZoomOut`, `onResetZoom`, `connected`, `packetCapturing`, `onToggleCapture`, `showSubnetGroups`, `onToggleSubnetGroups`, `showTrafficFlow`, `onToggleTrafficFlow`

**Layout**: Fixed bottom-center, pill-shaped, `bg-card/90 backdrop-blur`, flex row with dividers.

**Sections** (left to right):
1. **Connection indicator**: Green/red dot + "Live"/"Offline"
2. **Layout toggle**: `Circle` icon (→ radial) or `LayoutGrid` icon (→ force)
3. **Subnet grouping toggle**: `GitBranch` icon + "Subnets". Teal tint when active.
4. **Traffic flow toggle**: `Activity` icon + "Traffic". Cyan tint when active (default on). Toggles animated edge visualization.
5. **Zoom controls**: ZoomOut / Maximize (reset) / ZoomIn buttons
6. **Scan controls**: Pause/Play toggle + RefreshCw (scan now)
7. **DPI capture**: Radio icon + "DPI"/"Stop DPI" label. Red tint when active, muted when inactive.

### NodeDetailPanel (`components/NodeDetailPanel.tsx`)

**Props**: `node`, `events`, `onClose`, `capturing`, `onStartCapture`, `onStopCapture`, `captureStatus`

**Layout**: Absolute right-side panel (w-80), full height, slides in when a node is selected. `bg-card` with left border.

**Sections** (top to bottom):
1. **Header**: Node color dot, name, signal type label, close button
2. **Basic info**: IP, MAC, status, signal strength
3. **Packet capture controls**: Start/Stop button with capture status and error display
4. **Traffic stats**: Total packets and bytes (shown when DPI data available)
5. **Protocol breakdown**: Horizontal bar charts sorted by packet count (top 10). Each bar colored by protocol color map. Shows count and percentage.
6. **Recent packets**: Last 50 packet events (reversed). Each shows protocol badge (colored), source→destination IPs, and byte length.
7. **Empty state**: Prompt to start capture when no DPI data and capture is off.

### Legend (`components/Legend.tsx`)

**Layout**: Fixed top-right, small card with `bg-card/90 backdrop-blur`.

Shows all 6 signal types with colored dot + label text. Uses `SIGNAL_COLORS` and `SIGNAL_LABELS` from `visualization/colors.ts`.

### NodeTooltip (`components/NodeTooltip.tsx`)

**Props**: `node`, `x`, `y`

**Position**: Fixed, `left: x + 16px`, `top: y - 10px`, `z-index: 50`.

**Content**: Header with colored dot + node name. Body with label/value rows:

| Common Fields | Signal-Specific Fields |
|---|---|
| Type, Status | **Wi-Fi**: SSID, Channel+Band, Security |
| IP, MAC | **LAN**: Vendor, Device Type, Product, Role, Interface |
| Signal strength | **Bluetooth**: Device Type, Connected, Battery |
| First Seen, Last Seen | **Bonjour**: Service Type, Host, Port |
| | **Connection**: Process, Remote, Protocol, State, Throughput (when > 0) |
| | **This Device**: Hostname |

---

## Hooks

### useScanner (`hooks/useScanner.ts`)

**Input**: `onMessage: (msg: ScannerMessage) => void`
**Returns**: `{ connected, pause, resume, scanNow }`

Lifecycle:
1. On mount: calls `window.electron.scanner.getFullState()` → passes to `onMessage`
2. Subscribes to `scannerUpdate` and `scannerFullState` IPC events
3. Returns unsubscribe functions on unmount

### useNetworkState (`hooks/useNetworkState.ts`)

**Returns**: `{ state: NetworkState, handleMessage }`

```typescript
interface NetworkState {
  nodes: NetworkNode[]
  edges: NetworkEdge[]
  nodeMap: Record<string, NetworkNode>
}
```

Internal `Map` refs for O(1) lookups. Message handling:
- `full_state`: Replaces both maps entirely
- `node_update`: Upserts nodes/edges, deletes removed IDs + their edges
- After processing: creates fresh arrays from maps, triggers React state update

### usePacketEvents (`hooks/usePacketEvents.ts`)

**Returns**: `{ getEventsForNode, getAllEvents, totalEvents, version }`

Subscribes to `window.electron.on.packetEvent`. Buffers events in a ref (max 1000). Throttles React re-renders to 500ms intervals.

- `getEventsForNode(nodeId)`: Filters buffered events by `nodeId`
- `getAllEvents()`: Returns a copy of all buffered events
- `version`: Incremented on each throttled flush (used as dependency for memoization)

### useD3Simulation (`hooks/useD3Simulation.ts`)

**Input**: `{ nodes, edges, layoutMode, onNodeHover, onNodeClick }`
**Returns**: `{ svgRef, zoomIn, zoomOut, resetZoom }`

This is the core visualization hook. It manages the D3 force simulation, SVG rendering, zoom, drag, and event binding.

**Key behaviors**:
- Creates simulation via `createSimulation()` (only on layout mode change)
- Preserves node positions across updates by mapping existing `SimNode` positions by ID
- Fixes `this_device` node to canvas center (`fx`, `fy`)
- Enter/exit/update pattern for both edges (`<line>`) and nodes (`<g.node>`)
- Detects `iconKey` changes on existing nodes and re-renders them (for fingerprint enrichment)
- Detects `protocols` hash changes on existing nodes and re-renders protocol rings (for DPI enrichment). Uses `data-protocols-hash` attribute gating.
- SVG glow filter on active nodes (`feGaussianBlur` + `feMerge`)
- Opacity transitions for status changes
- D3 drag behavior (releases `fx`/`fy` on dragend, except for `this_device`)
- D3 zoom behavior (scale 0.2–4x)
- Simulation alpha: 0.5 on layout change, 0.1 on data update
- **Traffic flow animation**: When `showTrafficFlow` is enabled, edges with `bytesPerSec > 0` get dynamic styling:
  - **Stroke width**: Log scale 1-5px based on bandwidth
  - **Color tiers**: dim gray (< 1 KB/s) → teal (< 100 KB/s) → cyan (< 1 MB/s) → bright cyan (1 MB/s+)
  - **Animation**: CSS `dash-flow` animation with `stroke-dasharray: 6 4`. Speed scales inversely with bandwidth (faster = more traffic).
  - Uses CSS `--flow-duration` custom property for per-edge animation speed. Runs on compositor thread for zero main-thread cost.

---

## Visualization

### Layout Modes (`visualization/force-layout.ts`)

#### Force Layout
- Link force: distance 120, strength 0.3
- Charge force: many-body strength -200
- Center force: canvas center
- Collision force: node radius + 8px padding
- Alpha decay: 0.02

#### Radial Layout
Same base forces as force layout, minus center force, plus:
- Radial force: radius = `60 + (100 - signalStrength) * 2.5`, strength 0.8
- X/Y positional forces: target angle by signal type, strength 0.15

**Type angles** (radial):
| Signal Type | Angle |
|---|---|
| Wi-Fi | 0 (right) |
| LAN | 72deg |
| Bluetooth | 144deg |
| Bonjour | 216deg |
| Connection | 288deg |

### Node Rendering (`visualization/renderers.ts`)

| Signal Type | Shape | Details |
|---|---|---|
| This Device | Pulsing circle | Outer pulse-ring (r=24, animated), inner solid (r=16.8, glow) |
| LAN | Rounded rectangle | `rx:4`, width/height proportional to radius. Device icon badge if `iconKey` set |
| Bonjour | Diamond | 4-point polygon |
| Wi-Fi, Bluetooth, Connection | Circle | Standard circle with glow filter on active |

**Device icon badges** (LAN only): Small circle (r=8) at top-right corner with SVG path icon inside. 10 available icons from `visualization/device-icons.ts`.

**Protocol rings** (`renderProtocolRing`): Nodes with DPI protocol data get a colored donut ring around the shape. Built with `d3.arc()` and `d3.pie()`. Ring inner radius = nodeRadius + 4, outer = nodeRadius + 8. Each arc segment represents a protocol, colored via `protocol-colors.ts`. When updating existing nodes, the ring is inserted before the text label to maintain correct z-order.

**Labels**: All non-connection nodes get a text label below the shape (10px, `#94a3b8`, truncated to 20 chars). Label offset is increased when protocol ring is present.

### Colors (`visualization/colors.ts`)

| Signal Type | Color | Label |
|---|---|---|
| `this_device` | `#ffffff` | "This Device" |
| `wifi` | `#3B82F6` | "Wi-Fi" |
| `lan` | `#10B981` | "LAN Devices" |
| `bluetooth` | `#8B5CF6` | "Bluetooth" |
| `bonjour` | `#F59E0B` | "Bonjour" |
| `connection` | `#EF4444` | "Connections" |

---

## Styling

- **Framework**: Tailwind CSS 4 + shadcn design tokens
- **Font**: Inter Variable (via `@fontsource-variable/inter`)
- **Theme**: Dark mode only (enforced via `class="dark"` on `<html>` and root `<div>`)
- **Color space**: OKLCH for all design tokens
- **Titlebar**: macOS `hiddenInset` with custom 40px drag region (`-webkit-app-region: drag`)
- **Backdrop blur**: Controls and Legend use `backdrop-blur` for glassmorphism effect
- **Pulse animation**: `@keyframes pulse-ring` for the center "this device" node
- **Dash flow animation**: `@keyframes dash-flow` + `.edge-flowing` class for traffic-active edges. Uses CSS custom property `--flow-duration` for per-edge speed control.

### shadcn Components Available

The following shadcn components are installed in `components/ui/` for future use:
`Button`, `Badge`, `Card`, `Input`, `Textarea`, `Label`, `Separator`, `Select`, `DropdownMenu`, `AlertDialog`, `Field`, `InputGroup`, `Combobox`

Currently the main app components use raw Tailwind classes rather than these shadcn primitives.
