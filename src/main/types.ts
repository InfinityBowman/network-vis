// === Signal Types ===
export type SignalType = 'this_device' | 'wifi' | 'lan' | 'bluetooth' | 'bonjour' | 'connection';

export type NodeStatus = 'active' | 'stale' | 'expired';

// === OS Fingerprinting ===
export type OsFamily = 'windows' | 'macos' | 'ios' | 'linux' | 'android' | 'freebsd' | 'unknown';
export type DeviceCategory = 'desktop' | 'laptop' | 'mobile' | 'server' | 'iot' | 'embedded' | 'unknown';

// === Base Node ===
export interface NetworkNodeBase {
  id: string;
  signalType: SignalType;
  name: string;
  status: NodeStatus;
  firstSeen: number;
  lastSeen: number;
  mac?: string;
  ip?: string;
  signalStrength?: number; // 0-100 normalized
  protocols?: Record<string, number>; // protocol name -> packet count (populated by PacketScanner)
  totalBytes?: number;
  totalPackets?: number;
  // OS fingerprinting (populated by OsEnricher)
  osFamily?: OsFamily;
  osVersion?: string;
  deviceCategory?: DeviceCategory;
  osFingerprintConfidence?: number; // 0.0-1.0
}

// === Type-specific nodes ===
export interface ThisDeviceNode extends NetworkNodeBase {
  signalType: 'this_device';
  hostname: string;
  interfaces: { name: string; ip: string; mac: string }[];
}

export interface WifiApNode extends NetworkNodeBase {
  signalType: 'wifi';
  ssid: string;
  bssid: string;
  channel: number;
  band: '2.4GHz' | '5GHz' | '6GHz';
  security: string;
  isConnected: boolean;
}

export interface LanDeviceNode extends NetworkNodeBase {
  signalType: 'lan';
  interface: string;
  isGateway: boolean;
  vendor?: string;
  deviceType?: string;
  productName?: string;
  iconKey?: string;
}

export interface BluetoothNode extends NetworkNodeBase {
  signalType: 'bluetooth';
  minorType?: string;
  isConnected: boolean;
  batteryLevel?: number;
  rssi?: number;
}

export interface BonjourServiceNode extends NetworkNodeBase {
  signalType: 'bonjour';
  serviceType: string;
  port: number;
  host: string;
}

export interface ActiveConnectionNode extends NetworkNodeBase {
  signalType: 'connection';
  protocol: 'TCP' | 'UDP';
  localPort: number;
  remotePort: number;
  remoteHost: string;
  state: string;
  processName: string;
  resolvedHostname?: string;
  serviceName?: string;
  bytesPerSec?: number;
  bytesInPerSec?: number;
  bytesOutPerSec?: number;
}

export type NetworkNode =
  | ThisDeviceNode
  | WifiApNode
  | LanDeviceNode
  | BluetoothNode
  | BonjourServiceNode
  | ActiveConnectionNode;

// === Edges ===
export type EdgeType = 'connected_to' | 'hosts_service' | 'gateway' | 'same_device';

export interface NetworkEdge {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  bytesPerSec?: number;
  bytesInPerSec?: number;
  bytesOutPerSec?: number;
}

// === IPC Messages (replacing WebSocket) ===
export interface ScannerFullState {
  type: 'full_state';
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  timestamp: number;
}

export interface ScannerUpdate {
  type: 'node_update';
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  removed: string[];
  timestamp: number;
}

export type ScannerMessage = ScannerFullState | ScannerUpdate;

// === Packet Capture (DPI) ===

export interface PacketEvent {
  id: string;
  timestamp: number;
  nodeId: string | null;
  srcIp: string;
  dstIp: string;
  protocol: string;
  length: number;
  info: string;
}

export interface PacketScannerStatus {
  available: boolean;
  hasPermission: boolean;
  capturing: boolean;
  interface: string | null;
  interfaces: string[];
  error?: string;
}

export interface PacketStartOptions {
  interface?: string;
}

// === OS Fingerprinting (nmap) ===

export interface NmapScanResult {
  success: boolean;
  ip: string;
  osFamily?: OsFamily;
  osVersion?: string;
  confidence?: number;
  error?: string;
}

// === Topology / Subnet Mapping ===

export interface SubnetInfo {
  cidr: string;           // e.g., "192.168.1.0/24"
  networkAddress: string; // e.g., "192.168.1.0"
  prefix: number;         // e.g., 24
  gateway: string | null; // e.g., "192.168.1.1" or null if directly connected
  interface: string;      // e.g., "en0"
  localIp: string;        // this device's IP on this interface
}
