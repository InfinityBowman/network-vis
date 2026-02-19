# Network Vis - Type Specification

Canonical types are defined in `src/main/types.ts` and duplicated in `src/renderer/src/types.ts`. These files **must be kept in sync**.

## Signal and Status Types

```typescript
type SignalType = 'this_device' | 'wifi' | 'lan' | 'bluetooth' | 'bonjour' | 'connection'

type NodeStatus = 'active' | 'stale' | 'expired'

// OS Fingerprinting
type OsFamily = 'windows' | 'macos' | 'ios' | 'linux' | 'android' | 'freebsd' | 'unknown'
type DeviceCategory = 'desktop' | 'laptop' | 'mobile' | 'server' | 'iot' | 'embedded' | 'unknown'
```

## Node Types

All nodes extend `NetworkNodeBase`:

```typescript
interface NetworkNodeBase {
  id: string              // Deterministic, unique per node (see ID scheme below)
  signalType: SignalType
  name: string            // Human-readable display name
  status: NodeStatus
  firstSeen: number       // Unix timestamp (ms)
  lastSeen: number        // Unix timestamp (ms)
  mac?: string            // Normalized MAC address (AA:BB:CC:DD:EE:FF)
  ip?: string             // IPv4 address
  signalStrength?: number // 0-100 normalized
  protocols?: Record<string, number>  // Protocol name → packet count (populated by PacketScanner DPI)
  totalBytes?: number                 // Total bytes captured for this node
  totalPackets?: number               // Total packets captured for this node
  // OS fingerprinting (populated by OsEnricher)
  osFamily?: OsFamily                 // Inferred OS family
  osVersion?: string                  // OS version string (from nmap)
  deviceCategory?: DeviceCategory     // Inferred device category
  osFingerprintConfidence?: number    // 0.0-1.0 confidence score
}
```

### ThisDeviceNode

The local machine. Always exactly one instance with `id: 'this-device'`.

```typescript
interface ThisDeviceNode extends NetworkNodeBase {
  signalType: 'this_device'
  hostname: string
  interfaces: Array<{ name: string; ip: string; mac: string }>
}
```

**Seeded from**: `os.networkInterfaces()` — collects all non-internal IPv4 interfaces.

### WifiApNode

A discovered Wi-Fi access point.

```typescript
interface WifiApNode extends NetworkNodeBase {
  signalType: 'wifi'
  ssid: string
  bssid: string                         // AP MAC address
  channel: number
  band: '2.4GHz' | '5GHz' | '6GHz'
  security: string                      // e.g., "wpa2-personal"
  isConnected: boolean
}
```

**ID**: `wifi-{ssid}`
**Signal strength**: RSSI converted to 0-100: `max(0, min(100, (rssi + 90) * (100/60)))`
**Band detection**: channel > 177 = 6GHz, > 14 = 5GHz, else 2.4GHz

### LanDeviceNode

A device on the local network discovered via ARP.

```typescript
interface LanDeviceNode extends NetworkNodeBase {
  signalType: 'lan'
  interface: string                     // Network interface (e.g., "en0")
  isGateway: boolean
  vendor?: string                       // OUI vendor name (e.g., "Apple, Inc.")
  deviceType?: string                   // Enriched by fingerprinter (e.g., "media-player")
  productName?: string                  // Enriched by fingerprinter (e.g., "Apple TV")
  iconKey?: string                      // Enriched by fingerprinter (e.g., "tv")
}
```

**ID**: `lan-{normalized_mac}`
**Gateway detection**: ARP line contains `ifscope` and IP ends in `.1`
**Vendor lookup**: First 3 octets of MAC mapped via `src/data/oui.json`

### BluetoothNode

A discovered Bluetooth device.

```typescript
interface BluetoothNode extends NetworkNodeBase {
  signalType: 'bluetooth'
  minorType?: string                    // Bluetooth minor device class
  isConnected: boolean
  batteryLevel?: number                 // 0-100 percentage
  rssi?: number                         // Raw RSSI value
}
```

**ID**: `bt-{mac}` (or `bt-{sanitized_name}` if no MAC available)
**Signal strength**: Same RSSI-to-percentage formula as Wi-Fi

### BonjourServiceNode

An mDNS/Bonjour service discovered on the network.

```typescript
interface BonjourServiceNode extends NetworkNodeBase {
  signalType: 'bonjour'
  serviceType: string                   // e.g., "_airplay._tcp"
  port: number
  host: string                          // Hostname advertising the service
}
```

**ID**: `bonjour-{type}-{name_or_host}` (spaces replaced with `-`)

### ActiveConnectionNode

An active TCP or UDP connection from the local machine.

```typescript
interface ActiveConnectionNode extends NetworkNodeBase {
  signalType: 'connection'
  protocol: 'TCP' | 'UDP'
  localPort: number
  remotePort: number
  remoteHost: string                    // IP address or hostname
  state: string                         // TCP state (e.g., "ESTABLISHED")
  processName: string                   // Process holding the connection
  bytesPerSec?: number                  // Total throughput (enriched by TrafficScanner)
  bytesInPerSec?: number                // Inbound throughput
  bytesOutPerSec?: number               // Outbound throughput
}
```

**ID**: `conn-{protocol}-{remoteHost}-{remotePort}-{processName}`
**Name format**: `"{processName} → {remoteHost}:{remotePort}"`

### NetworkNode (Union)

```typescript
type NetworkNode =
  | ThisDeviceNode
  | WifiApNode
  | LanDeviceNode
  | BluetoothNode
  | BonjourServiceNode
  | ActiveConnectionNode
```

## Edge Types

```typescript
type EdgeType = 'connected_to' | 'hosts_service' | 'gateway' | 'same_device'

interface NetworkEdge {
  id: string
  source: string     // Node ID
  target: string     // Node ID
  type: EdgeType
  bytesPerSec?: number     // Total throughput (enriched by TrafficScanner at IPC boundary)
  bytesInPerSec?: number   // Inbound throughput
  bytesOutPerSec?: number  // Outbound throughput
}
```

### Edge Creation Rules

| Scanner | Edge Type | Source | Target |
|---|---|---|---|
| ARP (gateway) | `gateway` | LAN node | `this-device` |
| ARP (non-gateway) | `connected_to` | LAN node | `this-device` |
| Wi-Fi | `connected_to` | Wi-Fi node | `this-device` |
| Bluetooth | `connected_to` | Bluetooth node | `this-device` |
| Bonjour | `hosts_service` | Bonjour node | `this-device` |
| Connections | `connected_to` | Connection node | `this-device` |

All edges currently connect to `this-device`. The `same_device` edge type exists for future use (e.g., correlating a LAN device with its Bonjour services).

## IPC Message Types

```typescript
interface ScannerFullState {
  type: 'full_state'
  nodes: NetworkNode[]
  edges: NetworkEdge[]
  timestamp: number
}

interface ScannerUpdate {
  type: 'node_update'
  nodes: NetworkNode[]       // All current nodes
  edges: NetworkEdge[]       // All current edges
  removed: string[]          // IDs of removed nodes
  timestamp: number
}

type ScannerMessage = ScannerFullState | ScannerUpdate
```

## Scanner Internal Types

```typescript
interface ScanResult {
  nodes: NetworkNode[]
  edges: NetworkEdge[]
}

abstract class BaseScanner {
  abstract name: string
  abstract scan(): Promise<ScanResult>
  start?(onUpdate: (result: ScanResult) => void, onEvent?: (event: PacketEvent) => void): Promise<void>
  stop?(): Promise<void>
}
```

## Packet Capture Types

```typescript
interface PacketEvent {
  id: string             // "pkt-{seq}"
  timestamp: number      // Unix ms from frame.time_epoch
  nodeId: string | null  // Correlated node ID (null if IP not matched)
  srcIp: string
  dstIp: string
  protocol: string       // e.g., "TCP", "DNS", "TLS", "HTTP"
  length: number         // Frame length in bytes
  info: string           // Truncated info column (max 80 chars)
}

interface PacketScannerStatus {
  available: boolean       // tshark found in PATH
  hasPermission: boolean   // BPF device readable
  capturing: boolean       // Currently running
  interface: string | null // Active capture interface
  interfaces: string[]     // Available non-loopback IPv4 interfaces
  error?: string           // Last error message
}

interface PacketStartOptions {
  interface?: string       // Override auto-detected interface
}
```

## Fingerprinting Types

```typescript
interface DeviceProfile {
  id: string
  deviceType: string
  productName: string
  iconKey: string
  vendorPatterns?: string[]
  serviceTypes?: string[]
  hostnamePatterns?: string[]
}

interface FingerprintResult {
  deviceType: string
  productName: string
  iconKey: string
}
```

## Topology / Subnet Mapping Types

```typescript
interface SubnetInfo {
  cidr: string           // e.g., "192.168.1.0/24"
  networkAddress: string // e.g., "192.168.1.0"
  prefix: number         // e.g., 24
  gateway: string | null // e.g., "192.168.1.1" or null if directly connected
  interface: string      // e.g., "en0"
  localIp: string        // this device's IP on this interface
}
```

`SubnetInfo` is **not** a `NetworkNode` variant. It flows through a separate IPC channel (`topology:update`) and is used purely as grouping metadata in the renderer. No `SignalType` value exists for subnets.

## Visualization Types

```typescript
type LayoutMode = 'force' | 'radial'

interface SimNode extends d3.SimulationNodeDatum {
  id: string
  signalType: SignalType
  name: string
  status: NodeStatus
  signalStrength?: number
  [key: string]: unknown   // Allows accessing iconKey, etc.
}

interface SimEdge extends d3.SimulationLinkDatum<SimNode> {
  id: string
  type: EdgeType
  bytesPerSec?: number   // Traffic throughput for edge animation
}
```

## Visual Constants

### Signal Colors

| Signal Type | Color | Hex |
|---|---|---|
| This Device | White | `#ffffff` |
| Wi-Fi | Blue | `#3B82F6` |
| LAN | Green | `#10B981` |
| Bluetooth | Purple | `#8B5CF6` |
| Bonjour | Amber | `#F59E0B` |
| Connection | Red | `#EF4444` |

### Node Radii

| Signal Type | Radius (px) |
|---|---|
| This Device | 24 |
| Connection | 6 |
| All others | 12 |

### Status Opacity

| Status | Opacity |
|---|---|
| Active | 1.0 |
| Stale | 0.5 |
| Expired | 0.2 |

### Device Icon Keys

Available icon keys for LAN device badges: `monitor`, `tv`, `printer`, `speaker`, `home`, `lightbulb`, `hard-drive`, `server`, `router`, `camera`

### OS Family Colors

| OS Family | Color | Hex |
|---|---|---|
| Windows | Blue | `#00a4ef` |
| macOS | Gray | `#a3a3a3` |
| iOS | Gray | `#a3a3a3` |
| Linux | Yellow | `#f8b900` |
| Android | Green | `#3ddc84` |
| FreeBSD | Red | `#ab1829` |
| Unknown | Slate | `#64748b` |

## OS Fingerprinting Types

```typescript
// Signal source types used by OsFingerprintEngine
type OsSignalSource = 'ttl' | 'oui' | 'hostname' | 'bonjour' | 'bluetooth_name' | 'nmap'

interface OsSignal {
  source: OsSignalSource
  osFamily: OsFamily
  confidence: number  // 0.0-1.0
  raw?: string        // raw matched value for diagnostics
}

interface OsFingerprintResult {
  osFamily: OsFamily
  deviceCategory: DeviceCategory
  confidence: number
}

// nmap IPC result
interface NmapScanResult {
  success: boolean
  ip: string
  osFamily?: OsFamily
  osVersion?: string
  confidence?: number
  error?: string
}
```

### OS Profiles Database (`src/data/os-profiles.json`)

Each profile matches one OS family and contains optional signal arrays:

```typescript
interface OsProfile {
  id: string
  osFamily: OsFamily
  ttlRange?: [number, number]          // Acceptable TTL range (e.g., [118, 128] for Windows)
  ouiPatterns?: string[]               // MAC vendor substrings
  hostnamePatterns?: string[]           // Regex patterns for hostname matching
  bonjourServiceTypes?: string[]       // Bonjour service type matches
  bluetoothNamePatterns?: string[]     // Bluetooth device name patterns
  nmapOsPatterns?: string[]            // nmap OS detail string patterns
}
```
