// Shared types (mirrored from @network-vis/shared for client use)

export type SignalType = 'this_device' | 'wifi' | 'lan' | 'bluetooth' | 'bonjour' | 'connection';
export type NodeStatus = 'active' | 'stale' | 'expired';

export interface NetworkNodeBase {
  id: string;
  signalType: SignalType;
  name: string;
  status: NodeStatus;
  firstSeen: number;
  lastSeen: number;
  mac?: string;
  ip?: string;
  signalStrength?: number;
}

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
}

export type NetworkNode =
  | ThisDeviceNode
  | WifiApNode
  | LanDeviceNode
  | BluetoothNode
  | BonjourServiceNode
  | ActiveConnectionNode;

export type EdgeType = 'connected_to' | 'hosts_service' | 'gateway' | 'same_device';

export interface NetworkEdge {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
}

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
