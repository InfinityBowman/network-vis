# Network Vis - Product Specification

## Overview

Network Vis is a native macOS Electron application that discovers and visualizes real-time network signals as an interactive force-directed graph. It scans Wi-Fi access points, LAN devices (via ARP), Bluetooth peripherals, Bonjour/mDNS services, and active TCP/UDP connections, rendering them in a D3-powered SVG canvas with a React UI chrome layer.

The app is distributed as a `.app` bundle and requests macOS Location Services permission to resolve real Wi-Fi SSID names (which macOS redacts without location authorization).

## Target Platform

- **OS**: macOS (Darwin) only
- **Architecture**: Apple Silicon (arm64) and Intel (x86_64) via Homebrew path detection
- **Runtime**: Electron (Chromium + Node.js)
- **Package format**: `.app` bundle via electron-builder

## Core Capabilities

### Network Discovery

The app continuously scans six signal types plus topology:

| Signal Type | Scanner | System Command / Library | Scan Interval |
|---|---|---|---|
| **LAN Devices** | `ArpScanner` | `arp -an` + broadcast ping | 5s |
| **Active Connections** | `ConnectionsScanner` | `lsof -i -P -n -F` | 3s |
| **Bluetooth** | `BluetoothScanner` | `system_profiler SPBluetoothDataType` | 8s |
| **Wi-Fi APs** | `WifiScanner` | `system_profiler SPAirPortDataType` | 10s |
| **Bonjour Services** | `BonjourScanner` | `bonjour-service` (mDNS) | Event-driven |
| **Network Topology** | `TopologyScanner` | `netstat -rn` | 30s |

Each scanner produces typed node and edge objects. The orchestrator merges results into a unified network state and pushes incremental updates to the renderer via Electron IPC.

### Deep Packet Inspection (DPI)

User-initiated live packet capture via `tshark` (Wireshark CLI). When enabled:
- Spawns `tshark` as a persistent child process on the auto-detected default network interface
- Parses packet fields in real time: source/destination IPs, protocol, length, info
- Correlates captured IPs to known nodes via an IP→nodeId index (refreshed after ARP scans)
- Enriches existing nodes with protocol breakdown (`protocols: Record<string, number>`), total bytes, and total packets
- Streams individual packet events to the renderer for per-node inspection (1000 event ring buffer)

**Requirements**: `tshark` installed (via `brew install --cask wireshark`) and BPF read permission (`access_bpf` group or `sudo chmod o+r /dev/bpf*`).

### Device Fingerprinting

LAN devices discovered via ARP are enriched through cross-referencing:
- **OUI vendor lookup**: MAC address prefix mapped to manufacturer via Wireshark's `manuf` database
- **Bonjour service correlation**: Matching device IPs to discovered mDNS service types
- **Profile matching**: 26 built-in device profiles (Apple TV, Chromecast, Sonos, printers, NAS devices, IoT hubs, etc.) scored against vendor, service, and hostname patterns

Enriched devices receive a `deviceType`, `productName`, and `iconKey` for visual differentiation.

### Network Topology and Subnet Mapping

The TopologyScanner parses the macOS routing table (`netstat -rn`) to discover subnet structure. Results are broadcast as `SubnetInfo[]` metadata via a dedicated `topology:update` IPC channel — separate from the node/edge pipeline.

When the user enables "Subnets" toggle:
- **Canvas**: Translucent teal rounded rectangles render behind clusters of LAN nodes sharing the same subnet CIDR. Each rectangle is labeled with the CIDR and interface name (e.g., `192.168.1.0/24  en0`). A D3 cluster force gently pulls subnet members together.
- **Sidebar**: LAN nodes are grouped under subnet headers showing CIDR, interface, and device count. Non-LAN nodes remain in a flat list.

Subnet grouping works as an overlay in both force and radial layout modes. It does not create new node types — existing LAN node IPs are matched against discovered subnet CIDRs using bitwise CIDR containment checks.

### Visualization

Two layout modes:
- **Force layout**: Standard D3 force-directed graph with charge repulsion, link distance, and collision avoidance. The local device ("this device") is pinned to the center.
- **Radial layout**: Nodes arranged by signal type (angular position) and signal strength (radial distance from center). Stronger signals appear closer to the center.

Visual encoding:
- **Color**: Each signal type has a distinct color (Wi-Fi blue, LAN green, Bluetooth purple, Bonjour amber, Connections red, This Device white)
- **Shape**: Circles (Wi-Fi, Bluetooth, Connections), rounded rectangles (LAN), diamonds (Bonjour), pulsing circle (This Device)
- **Opacity**: Active = 100%, Stale = 50%, Expired = 20%
- **Device badges**: LAN nodes with identified device types show a small icon badge (TV, speaker, printer, etc.)
- **Glow filter**: Active nodes have a subtle SVG glow effect
- **Protocol rings**: Nodes with captured DPI traffic display colored arc segments around the node shape. Each segment represents a protocol, sized by packet count. Colors are from a 20+ protocol color map.

### User Interface

- **Sidebar** (left, 288px): Signal type filter toggles, search input, scrollable node list with status indicators and device metadata. Clicking a node selects it.
- **Canvas** (center): Full-viewport SVG with pan/zoom via D3 zoom behavior. Nodes are draggable. Hover shows tooltip, click selects.
- **Controls** (bottom center): Connection status indicator, layout mode toggle, subnet grouping toggle, zoom controls (in/out/reset), scan controls (pause/resume, scan now), DPI capture toggle.
- **Legend** (top right): Color-coded signal type reference.
- **Tooltip**: Follows cursor on node hover, shows detailed metadata (IP, MAC, vendor, signal strength, timestamps, etc.)
- **Node Detail Panel** (right side): Slides in on node click. Shows basic info, packet capture start/stop controls, traffic stats (packets, bytes), protocol breakdown with horizontal bar charts, and recent packet event log.
- **Titlebar**: macOS `hiddenInset` style with native traffic lights. Custom drag region.

### Node Lifecycle

Nodes transition through status states based on time since last seen:

```
Active (0-30s) → Stale (30-60s) → Expired (60-90s) → Removed (>90s)
```

- The `this_device` node is exempt from lifecycle (never goes stale)
- Removed nodes are deleted from state and their edges cleaned up
- Removal IDs are broadcast to the renderer for cleanup

### Scan Control

Users can:
- **Pause/Resume**: Stops all polled scanners from executing (Bonjour continues listening)
- **Scan Now**: Trigger an immediate scan cycle for all scanners or a specific one by name

## Non-Functional Requirements

### Security
- `contextIsolation: true` — renderer cannot access Node.js APIs directly
- `nodeIntegration: false` — no `require()` in renderer
- `sandbox: false` — required for system command execution in main process
- All system interaction happens in the main process; renderer communicates only via the preload bridge

### Performance
- D3 owns SVG DOM for 60fps animation; React never touches the canvas
- Node positions are preserved across incremental updates (no position jumps)
- Maps used for O(1) node/edge lookups by ID
- Simulation alpha restart is minimal (0.1) for data updates, higher (0.5) for layout changes

### Resilience
- All scanners catch and log errors gracefully; no scanner failure crashes the app
- OUI build script is non-fatal (exits 0 on network failure)
- SSID resolution has a fallback path via `networksetup` when `system_profiler` returns `<redacted>`
- Bonjour scanner discovers dynamic service types beyond the hardcoded 20 common types
