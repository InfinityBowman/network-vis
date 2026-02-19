# Network Vis - Scanner Specification

## Overview

Scanners are the data acquisition layer. Each scanner wraps a macOS system command or library, parses its output into typed `NetworkNode[]` and `NetworkEdge[]`, and returns them as a `ScanResult`. The orchestrator schedules and merges results.

All scanners extend `BaseScanner` (`src/main/scanners/base.ts`):

```typescript
interface ScanResult {
  nodes: NetworkNode[]
  edges: NetworkEdge[]
}

abstract class BaseScanner {
  abstract name: string
  abstract scan(): Promise<ScanResult>
  start?(onUpdate: (result: ScanResult) => void): Promise<void>
  stop?(): Promise<void>
}
```

## Scanner Schedule

| Scanner | File | Interval | Mode |
|---|---|---|---|
| ARP | `scanners/arp.ts` | 5,000ms | Polled |
| Connections | `scanners/connections.ts` | 3,000ms | Polled |
| Bluetooth | `scanners/bluetooth.ts` | 8,000ms | Polled |
| Wi-Fi | `scanners/wifi.ts` | 10,000ms | Polled |
| Bonjour | `scanners/bonjour.ts` | Event-driven | `start()` / `stop()` |
| Packet (DPI) | `scanners/packet.ts` | User-initiated | `start()` / `stop()` |
| Topology | `scanners/topology.ts` | 30,000ms | Polled |
| Traffic | `scanners/traffic.ts` | 3,000ms | Polled |

Polled scanners are run via `setInterval` and skipped when the orchestrator is paused. Bonjour uses `bonjour-service`'s event-driven model and also discovers dynamic service types via `dns-sd`. The Packet scanner is user-initiated and runs a persistent `tshark` child process.

---

## ARP Scanner

**File**: `src/main/scanners/arp.ts`
**System command**: `arp -an` (preceded by broadcast ping `ping -c 1 -W 1000 224.0.0.1`)
**Timeout**: 5 seconds
**Produces**: `LanDeviceNode` + edges to `this-device`

### Process

1. **ARP cache priming**: Runs broadcast ping to `224.0.0.1` to populate the ARP cache. Failure is silently ignored.
2. **ARP table parsing**: Runs `arp -an`, matches each line against:
   ```
   ?\s+\(([^)]+)\)\s+at\s+([0-9a-f:]+)\s+on\s+(\S+)
   ```
   Extracts: IP address, MAC address, network interface.
3. **Filtering**: Skips lines with `(incomplete)` MAC or broadcast addresses.
4. **MAC normalization**: Pads short-form macOS MACs (e.g., `8:0:20:1:2:3` → `08:00:20:01:02:03`).
5. **Vendor lookup**: First 3 octets (uppercase) looked up in OUI database (`src/data/oui.json`).
6. **Gateway detection**: Heuristic — line contains `ifscope` AND IP ends in `.1`.
7. **Node creation**: `LanDeviceNode` with `id: 'lan-{mac}'`, `name: vendor or IP`.
8. **Edge creation**: `gateway` type for gateways, `connected_to` for others. Target is always `this-device`.

### OUI Database

Built by `scripts/build-oui.mjs` from Wireshark's `manuf` file. Produces `src/data/oui.json` — a flat `Record<string, string>` mapping `"AA:BB:CC"` prefixes to vendor names. The build script is non-fatal (network failure exits 0) so builds aren't blocked.

---

## Wi-Fi Scanner

**File**: `src/main/scanners/wifi.ts`
**System command**: `system_profiler SPAirPortDataType -json`
**Timeout**: 15 seconds
**Produces**: `WifiApNode` + edge to `this-device`

### Process

1. **Profile parsing**: Runs `system_profiler SPAirPortDataType -json`, navigates to `SPAirPortDataType[].spairport_airport_interfaces[]`.
2. **Station detection**: Filters to interfaces with `spairport_current_network_information` where the station info has `_channel` data.
3. **SSID resolution**: If SSID is `<redacted>` (Location Services not granted), falls back to `networksetup -listpreferredwirelessnetworks en0` and uses the first preferred network name.
4. **Channel/band parsing**: Extracts channel number. Band determined by:
   - Channel > 177 → 6GHz
   - Channel > 14 → 5GHz
   - Otherwise → 2.4GHz
5. **Signal strength**: Parses RSSI from numeric value or string format `"-60 dBm / -93 dBm"` (takes first number). Converts to 0-100: `max(0, min(100, (rssi + 90) * (100/60)))`.
6. **Node creation**: `WifiApNode` with `id: 'wifi-{ssid}'`, `isConnected: true`.
7. **Edge creation**: `connected_to` type, target `this-device`.

### SSID Redaction Note

macOS redacts Wi-Fi SSIDs from `system_profiler` output when the app lacks Location Services permission. The `NSLocationWhenInUseUsageDescription` entitlement in the electron-builder config enables the permission prompt. The `networksetup` fallback provides the preferred network name but cannot confirm it's the currently connected one.

---

## Bluetooth Scanner

**File**: `src/main/scanners/bluetooth.ts`
**System command**: `system_profiler SPBluetoothDataType -json`
**Timeout**: 15 seconds
**Produces**: `BluetoothNode` + edge to `this-device`

### Process

1. **Profile parsing**: Runs `system_profiler SPBluetoothDataType -json`, iterates `SPBluetoothDataType[]` controllers.
2. **Device discovery**: Checks three sections of each controller:
   - `device_connected` — currently connected devices
   - `device_not_connected` — previously paired, not connected
   - `devices_not_connected` — alternative key for some macOS versions
3. **Field extraction** (per device entry, keyed by device name):
   - MAC: `device_address`
   - Connected: `device_isconnected`, `device_connected`, or inferred from section
   - RSSI: `device_rssi` (numeric or string format)
   - Battery: `device_batteryLevel` or `device_batteryLevelMain` (string → int)
   - Minor type: `device_minorType`
4. **Signal strength**: Same RSSI formula as Wi-Fi.
5. **Node creation**: `BluetoothNode` with `id: 'bt-{mac}'` (or `bt-{sanitized_name}` if no MAC).
6. **Edge creation**: `connected_to` type, target `this-device`.

---

## Bonjour Scanner

**File**: `src/main/scanners/bonjour.ts`
**Library**: `bonjour-service` (mDNS)
**Mode**: Event-driven via `start()` / `stop()`
**Produces**: `BonjourServiceNode` + edges to `this-device`

### Common Service Types

The scanner browses 20 hardcoded service types on startup:

```
http, https, ssh, ftp, smb, afpovertcp, ipp, ipps, printer,
pdl-datastream, airplay, raop, homekit, hap, googlecast,
spotify-connect, companion-link, touch-able, workstation, device-info
```

### Process

1. **Initialization**: Creates `new Bonjour()` instance and browses all common service types.
2. **Dynamic discovery**: Runs `dns-sd -B _services._dns-sd._udp local.` with a 5s timeout (kills process, captures stdout). Parses output for additional service types not in the hardcoded list and browses those too.
3. **Service callback**: On each discovered service:
   - Creates `BonjourServiceNode` with `id: 'bonjour-{type}-{name_or_host}'`
   - Stores in internal maps
   - Creates `hosts_service` edge to `this-device`
   - Calls `onUpdate` callback with full current state
4. **`scan()` method**: Returns current in-memory state (does not trigger new discovery).

### State Persistence

The Bonjour scanner maintains its own `discoveredNodes` and `discoveredEdges` maps plus an `activeTypes` set. This is because mDNS is event-driven — services are discovered asynchronously and the scanner must accumulate state between orchestrator poll cycles.

---

## Connections Scanner

**File**: `src/main/scanners/connections.ts`
**System command**: `lsof -i -P -n -F cnPTs`
**Timeout**: 10 seconds
**Produces**: `ActiveConnectionNode` + edge to `this-device`

### Process

1. **Field parsing**: `lsof` with `-F` flag outputs machine-readable fields:
   - `p` — new PID (resets per-process state)
   - `c` — command/process name
   - `P` — protocol (TCP/UDP)
   - `T` with `ST=` — TCP state
   - `n` — connection name (local → remote)
   - `s` — size (skipped)
2. **Connection extraction**: On `n` field containing `->`, splits into local and remote parts. Extracts host and port via regex.
3. **Filtering**: Skips:
   - Loopback addresses (`127.0.0.1`, `::1`, `[::1]`)
   - Wildcard hosts (`*`)
   - Zero-port entries
4. **Deduplication**: By `id: 'conn-{proto}-{remoteHost}-{remotePort}-{processName}'`. Multiple file descriptors to the same destination from the same process produce one node.
5. **Node creation**: `ActiveConnectionNode` with `name: "{process} → {host}:{port}"`.
6. **Edge creation**: `connected_to` type, target `this-device`.

---

## Device Fingerprinting

**File**: `src/main/fingerprinting/fingerprinter.ts`
**Data**: `src/data/device-profiles.json` (26 profiles)

### Process

The `DeviceFingerprinter.enrich(lanNodes, bonjourNodes)` method:

1. **Index building**: Creates two maps from Bonjour nodes:
   - `servicesByIp: Map<string, string[]>` — IP → array of service types
   - `serviceNamesByIp: Map<string, string>` — IP → first service display name
2. **Filtering**: Skips LAN nodes that already have a `deviceType` (previously classified).
3. **Profile matching**: For each unclassified LAN node, scores all 26 profiles:
   - **+1** for vendor pattern match (case-insensitive substring of OUI vendor)
   - **+1** for service type match (any Bonjour service on same IP)
   - **+1** for hostname pattern match (regex against node name)
4. **Selection**: Highest-scoring profile wins (must score > 0).
5. **Enrichment**: Sets `deviceType`, `productName` (prefers Bonjour service name), `iconKey` on the node.

### Device Profiles

26 built-in profiles in `src/data/device-profiles.json`, covering:
- Media: Apple TV, Chromecast, Roku, Sonos, HomePod
- Smart Home: Philips Hue, HomeKit devices, Ring cameras, Nest, TP-Link, Espressif/Tuya/Shelly IoT
- Infrastructure: Ubiquiti, generic router
- Computing: Raspberry Pi, workstation, SSH server, HTTP server
- Storage: Synology NAS, QNAP NAS, generic NAS
- Peripherals: generic printer, HP printer

Each profile specifies matching criteria (vendor patterns, service types, hostname patterns) and output fields (deviceType, productName, iconKey).

---

## Packet Scanner (DPI)

**File**: `src/main/scanners/packet.ts`
**System command**: `tshark` (persistent child process)
**Mode**: User-initiated via `start()` / `stop()`
**Produces**: Protocol enrichment on existing nodes + `PacketEvent` stream

### Process

1. **Availability check**: Runs `tshark --version` to verify presence in PATH. Checks `/dev/bpf0` read permission for BPF access.
2. **Interface detection**: Runs `route get default` to find the default network interface. Falls back to `en0`. User can override via options.
3. **Capture start**: Spawns `tshark` with:
   ```
   tshark -i <iface> -l -n -T fields -E separator=| -E occurrence=f \
     -e frame.time_epoch -e ip.src -e ip.dst -e _ws.col.Protocol -e frame.len -e _ws.col.Info
   ```
4. **Line parsing**: Splits pipe-delimited stdout lines into fields. Skips lines with < 5 fields or missing IPs.
5. **Node correlation**: Maintains an IP→nodeId index (refreshed by orchestrator after ARP scans). For each packet, resolves srcIp and dstIp to node IDs. Prefers the non-"this-device" side.
6. **Protocol aggregation**: Per IP (excluding this device's own IPs): increments protocol packet count, accumulates bytes and packet totals.
7. **Event buffering**: Creates `PacketEvent` objects in a 1000-entry ring buffer. New events also go to a pending queue for drain.
8. **Event drain**: Every 100ms, sends up to 10 pending events to the renderer via the `onEvent` callback (dispatched through orchestrator IPC).
9. **Enrichment flush**: Every 2s, triggers the orchestrator's `enrichProtocols()` which reads aggregated data and upserts `protocols`, `totalBytes`, `totalPackets` onto matched nodes.
10. **Error handling**: Monitors stderr for permission denied messages. Logs non-fatal warnings. On BPF permission error, sets `_hasPermission = false` and auto-stops.
11. **Shutdown**: Sends SIGTERM, escalates to SIGKILL after 2s if process doesn't exit. Clears all timers.

### tshark Fields

| Field | Description |
|---|---|
| `frame.time_epoch` | Packet timestamp (Unix seconds) |
| `ip.src` | Source IPv4 address |
| `ip.dst` | Destination IPv4 address |
| `_ws.col.Protocol` | Dissected protocol name |
| `frame.len` | Frame length in bytes |
| `ipv6.src` | Source IPv6 address |
| `ipv6.dst` | Destination IPv6 address |
| `_ws.col.Info` | Info column (truncated to 80 chars) |
| `ip.ttl` | IP Time-To-Live value (used for OS fingerprinting) |

### Protocol Color Map

`src/renderer/src/visualization/protocol-colors.ts` maps ~20 common protocols to distinct colors for the protocol ring visualization and detail panel:

HTTP, HTTPS, TLS, DNS, UDP, TCP, ICMP, ARP, DHCP, MDNS, QUIC, SSH, SMB, NBNS, NTP, SSDP, LLMNR, FTP, IGMP, STUN. Unknown protocols use fallback `#64748b`.

---

## Topology Scanner

**File**: `src/main/scanners/topology.ts`
**System command**: `netstat -rn`
**Timeout**: 5 seconds
**Produces**: `SubnetInfo[]` metadata (not nodes/edges)

### Process

1. **Route table parsing**: Runs `netstat -rn`, parses each line for destination, gateway, flags, and interface.
2. **Filtering**: Skips default routes, loopback (`127.*`), IPv6, link-local (`169.254.*`), multicast (`224.*`), broadcast (`255.*`), and host routes (`/32`).
3. **CIDR inference**: Destinations without explicit prefix get inferred: 3 octets → `/24`, 2 octets → `/16`, 1 octet → `/8`.
4. **Gateway resolution**: `link#N` gateway entries are treated as directly connected (`null`). Otherwise the gateway IP is stored.
5. **Interface correlation**: Uses `os.networkInterfaces()` to find this device's IPv4 address on the matching interface.
6. **Deduplication**: Routes with the same CIDR are deduplicated (first occurrence wins).

### Output

The scanner stores `SubnetInfo[]` internally (not in `ScanResult`). The orchestrator retrieves it via `getSubnets()` and broadcasts via the `topology:update` IPC channel.

```typescript
interface SubnetInfo {
  cidr: string           // "192.168.1.0/24"
  networkAddress: string // "192.168.1.0"
  prefix: number         // 24
  gateway: string | null // null if directly connected
  interface: string      // "en0"
  localIp: string        // this device's IP on this interface
}
```

### BaseScanner Contract

`scan()` always returns `{ nodes: [], edges: [] }` to satisfy the `BaseScanner` contract. Topology data flows through its own channel, not through the node/edge pipeline.

---

## Traffic Scanner

**File**: `src/main/scanners/traffic.ts`
**System command**: `nettop -m tcp -L 1 -J bytes_in,bytes_out -n -x`
**Timeout**: 10 seconds
**Interval**: 3,000ms
**Produces**: Per-connection bandwidth rates (not nodes/edges)

### Process

1. **Snapshot capture**: Runs `nettop` in TCP mode with single-sample flag (`-L 1`), requesting only `bytes_in` and `bytes_out` columns. The `-x` flag skips the initial delay. The process exits immediately after one sample.
2. **CSV parsing**: Parses comma-separated output. Process lines contain `processName.PID` with cumulative byte counts. Socket lines contain connection details (e.g., `192.168.1.100:54321<->142.250.80.46:443`).
3. **Process tracking**: Extracts process name from PID-suffixed entries (e.g., `firefox.12345` → `firefox`).
4. **Connection extraction**: Socket lines with `<->` or `->` are parsed for remote host and port. Supports both IPv4 (`:port`) and IPv6 (`.port`) formats.
5. **Rate computation**: Stores each sample's cumulative byte counts. On subsequent scans, diffs current vs. previous sample and divides by elapsed time to compute bytes/sec.
6. **ID matching**: Connection IDs match ConnectionsScanner format: `conn-TCP-{remoteHost}-{remotePort}-{processName}`.
7. **Filtering**: Loopback addresses (`127.0.0.1`, `::1`) are skipped. Only connections with positive rate are included.

### Output

The scanner stores `Map<string, TrafficRate>` internally. `scan()` always returns `{ nodes: [], edges: [] }` to satisfy the `BaseScanner` contract. The orchestrator reads rates via `getRates()` and enriches edges/nodes at the IPC boundary in `pushUpdate()` and `getFullState()`.

```typescript
interface TrafficRate {
  bytesPerSec: number
  bytesInPerSec: number
  bytesOutPerSec: number
}
```

### Enrichment Strategy

Bandwidth data is **not** stored in the state manager's edges (which would be overwritten every 3s by ConnectionsScanner). Instead, the orchestrator enriches at the IPC boundary:
- `enrichEdges()`: Maps over edges, looks up connection ID in `traffic.getRates()`, spreads rate data onto matching edges.
- `enrichNodes()`: Maps over nodes, looks up node ID in `traffic.getRates()`, spreads rate data onto matching connection nodes.

This avoids race conditions and keeps the state manager clean.

---

## OS Fingerprinting

### Passive OS Enrichment

**File**: `src/main/fingerprinting/os-enricher.ts`
**Engine**: `src/main/fingerprinting/os-engine.ts`
**Profiles**: `src/data/os-profiles.json` (6 OS family profiles)

The `OsEnricher` runs as part of `Orchestrator.classify()` after device fingerprinting. It gathers OS signals from multiple sources and uses the `OsFingerprintEngine` to pick the best match above a 0.45 confidence threshold.

**Signal sources and confidence weights**:
| Source | Confidence | Notes |
|---|---|---|
| TTL | 0.3 | Low — TTL=64 shared by macOS/iOS/Linux/Android |
| OUI vendor | 0.4 | Apple vendor → macOS/iOS, Microsoft → Windows |
| Hostname | 0.5 | Regex patterns (e.g., `iPhone`, `DESKTOP-`, `Galaxy`) |
| Bonjour | 0.5 | Service types (e.g., `_companion-link._tcp` → iOS) |
| Bluetooth name | 0.5 | Device name patterns |
| nmap | 0.9 | Active scan — high confidence, overrides passive |

The engine sums confidence per OS family and picks the winner. Nodes with existing `osFingerprintConfidence >= 0.85` (e.g., from nmap) are not overwritten by passive signals.

**TTL data flow**: PacketScanner extracts `ip.ttl` from each captured packet, aggregating into a rolling 100-sample window per source IP via `ttlsByIp`. The OsEnricher uses the median TTL to match against profile TTL ranges (e.g., Windows 118-128, Linux/macOS 58-64).

### Active OS Scanning (nmap)

**File**: `src/main/fingerprinting/nmap-scanner.ts`
**System command**: `nmap -O --osscan-guess -T4 --max-os-tries 1 -n <ip>`
**Timeout**: 15 seconds (SIGTERM → SIGKILL escalation)

On-demand scanning triggered via the `os:nmap-scan` IPC channel when the user clicks "Scan with nmap" in the NodeDetailPanel. Parses `OS details:` and `Running:` lines from nmap stdout, extracts OS family and confidence percentage. Requires nmap installed (`brew install nmap`). OS detection (`-O`) may require root privileges.

---

## Error Handling

All scanners follow the same pattern:
- System command execution is wrapped in try/catch
- Failures log a short warning via `console.warn` or `console.error`
- The scanner returns an empty `{ nodes: [], edges: [] }` on failure
- The orchestrator's `runScanner` method also catches and logs errors
- No scanner failure propagates to crash the app
