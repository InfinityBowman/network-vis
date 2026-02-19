# NetRadar - Signal Landscape Explorer

A native macOS Electron app that visualizes all network signals around your Mac in real time: Wi-Fi access points, LAN devices, Bluetooth devices, Bonjour/mDNS services, and active connections. An interactive "radar" of your electromagnetic/network environment.

As a proper `.app` bundle, it can request Location Services permission for real Wi-Fi SSID names and run system commands without terminal sandbox restrictions.

## Quick Start

```bash
pnpm install
pnpm dev
```

## Architecture

```
src/
  main/       Electron main process — scanners, orchestrator, state, IPC handlers
  preload/    IPC bridge (context isolation)
  renderer/   React 19 + D3.js visualization
```

The main process runs network scanners on intervals, merges results into an in-memory state store, and pushes updates to the renderer over Electron IPC. The renderer renders a D3 force-directed (or radial) graph with React handling all UI chrome.

```
React + D3 (Renderer)  <-- Electron IPC -->  Main Process (Node.js)
                                                    |
                                              Orchestrator
                                    ┌───┬───┬───┬──────┐
                                   ARP WiFi BT Bonjour Conn
```

## Scanners

| Scanner | Command | Interval | Notes |
|---|---|---|---|
| ARP | `arp -a` | 5s | Broadcast ping first to populate cache |
| Connections | `lsof -i -P -n` | 3s | Active TCP/UDP connections with process names |
| Bluetooth | `system_profiler SPBluetoothDataType -json` | 8s | Paired/known devices with RSSI, battery |
| Wi-Fi | `system_profiler SPAirPortDataType -json` | 10s | Connected network info |
| Bonjour | `bonjour-service` npm | Event-driven | Persistent mDNS listener |

Node lifecycle: **active** (seen) -> **stale** (30s unseen) -> **expired** (60s) -> **removed** (90s)

## Visualization

Two layout modes toggled from the bottom control bar:

- **Force-directed** (default) - your device pinned at center, nodes cluster by type, edges as springs
- **Radial** - signal strength determines distance from center, signal type determines angular sector

| Signal Type | Color | Shape |
|---|---|---|
| Your Device | White | Pulsing circle |
| Wi-Fi AP | Blue `#3B82F6` | Circle |
| LAN Device | Green `#10B981` | Rounded rect |
| Bluetooth | Purple `#8B5CF6` | Circle |
| Bonjour | Amber `#F59E0B` | Diamond |
| Connection | Red `#EF4444` | Small circle |

## Controls

- **Sidebar** - filter by signal type, search nodes, click to select
- **Bottom bar** - connection status, layout toggle, zoom in/out/reset, pause/resume scanning, scan now
- **Canvas** - drag nodes, scroll to zoom, hover for tooltip details

## Tech Stack

- **Electron**: electron-vite, electron-builder
- **Main Process**: Node.js, bonjour-service
- **Renderer**: React 19, Vite 7, Tailwind CSS 4, shadcn, D3.js 7
- **Tooling**: pnpm, TypeScript

## macOS Requirements

Requires macOS for the system_profiler and arp commands. Grant Location Services permission when prompted for real Wi-Fi SSID names.
