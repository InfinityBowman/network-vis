import { BrowserWindow } from 'electron';
import type { ScannerFullState, ScannerUpdate, ThisDeviceNode, LanDeviceNode, BonjourServiceNode } from '../types';
import { NetworkState } from './state';
import { ArpScanner } from '../scanners/arp';
import { WifiScanner } from '../scanners/wifi';
import { BluetoothScanner } from '../scanners/bluetooth';
import { BonjourScanner } from '../scanners/bonjour';
import { ConnectionsScanner } from '../scanners/connections';
import type { BaseScanner, ScanResult } from '../scanners/base';
import { hostname, networkInterfaces } from 'os';
import { DeviceFingerprinter } from '../fingerprinting/fingerprinter';

const SCAN_INTERVALS = {
  arp: 5000,
  connections: 3000,
  bluetooth: 8000,
  wifi: 10000,
};

export class Orchestrator {
  private state = new NetworkState();
  private timers: NodeJS.Timeout[] = [];
  private paused = false;

  private arp = new ArpScanner();
  private wifi = new WifiScanner();
  private bluetooth = new BluetoothScanner();
  private bonjour = new BonjourScanner();
  private connections = new ConnectionsScanner();
  private fingerprinter = new DeviceFingerprinter();

  private sendToRenderer(channel: string, data: any): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      win.webContents.send(channel, data);
    }
  }

  async start(): Promise<void> {
    // Seed "this device" node
    this.seedThisDevice();

    // Start event-driven scanners
    await this.bonjour.start?.((result) => {
      this.applyResult(result);
      this.classify();
      this.pushUpdate([]);
    });

    // Schedule polled scanners
    this.schedule(this.arp, SCAN_INTERVALS.arp);
    this.schedule(this.connections, SCAN_INTERVALS.connections);
    this.schedule(this.bluetooth, SCAN_INTERVALS.bluetooth);
    this.schedule(this.wifi, SCAN_INTERVALS.wifi);

    // Lifecycle tick every 5s
    this.timers.push(setInterval(() => {
      const { removed, statusChanged } = this.state.tick();
      if (removed.length > 0 || statusChanged) {
        this.pushUpdate(removed);
      }
    }, 5000));

    // Run all scanners immediately
    await Promise.allSettled([
      this.runScanner(this.arp),
      this.runScanner(this.connections),
      this.runScanner(this.bluetooth),
      this.runScanner(this.wifi),
    ]);

    console.log('[Orchestrator] All scanners started');
  }

  stop(): void {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    this.bonjour.stop?.();
  }

  pause(): void { this.paused = true; }
  resume(): void { this.paused = false; }

  getFullState(): ScannerFullState {
    return {
      type: 'full_state',
      nodes: this.state.getNodes(),
      edges: this.state.getEdges(),
      timestamp: Date.now(),
    };
  }

  /** Send full state to renderer (called on window ready) */
  sendFullState(): void {
    this.sendToRenderer('scanner:full-state', this.getFullState());
  }

  async scanNow(scannerName?: string): Promise<void> {
    const scanners: Record<string, BaseScanner> = {
      arp: this.arp,
      wifi: this.wifi,
      bluetooth: this.bluetooth,
      bonjour: this.bonjour,
      connections: this.connections,
    };

    if (scannerName && scanners[scannerName]) {
      await this.runScanner(scanners[scannerName]);
    } else {
      await Promise.allSettled(
        Object.values(scanners).map(s => this.runScanner(s))
      );
    }
  }

  private seedThisDevice(): void {
    const ifaces = networkInterfaces();
    const ifaceList: { name: string; ip: string; mac: string }[] = [];

    for (const [name, addrs] of Object.entries(ifaces)) {
      if (!addrs) continue;
      for (const addr of addrs) {
        if (addr.family === 'IPv4' && !addr.internal) {
          ifaceList.push({ name, ip: addr.address, mac: addr.mac });
        }
      }
    }

    const node: ThisDeviceNode = {
      id: 'this-device',
      signalType: 'this_device',
      name: hostname(),
      status: 'active',
      firstSeen: Date.now(),
      lastSeen: Date.now(),
      hostname: hostname(),
      interfaces: ifaceList,
      ip: ifaceList[0]?.ip,
      mac: ifaceList[0]?.mac,
    };

    this.state.upsertNode(node);
  }

  private schedule(scanner: BaseScanner, intervalMs: number): void {
    this.timers.push(setInterval(() => {
      if (!this.paused) this.runScanner(scanner);
    }, intervalMs));
  }

  private async runScanner(scanner: BaseScanner): Promise<void> {
    try {
      const result = await scanner.scan();
      this.applyResult(result);
      // Run fingerprinting after ARP or Bonjour updates (they provide the cross-reference signals)
      if (scanner.name === 'arp' || scanner.name === 'bonjour') {
        this.classify();
      }
      this.pushUpdate([]);
    } catch (err) {
      console.error(`[${scanner.name}] error:`, err);
    }
  }

  private applyResult(result: ScanResult): void {
    for (const node of result.nodes) this.state.upsertNode(node);
    for (const edge of result.edges) this.state.upsertEdge(edge);
  }

  private classify(): void {
    const allNodes = this.state.getNodes();
    const lanNodes = allNodes.filter((n): n is LanDeviceNode => n.signalType === 'lan');
    const bonjourNodes = allNodes.filter((n): n is BonjourServiceNode => n.signalType === 'bonjour');
    if (lanNodes.length === 0) return;

    const enriched = this.fingerprinter.enrich(lanNodes, bonjourNodes);
    for (let i = 0; i < enriched.length; i++) {
      // Only upsert nodes that were actually enriched (enrich returns same reference if unchanged)
      if (enriched[i] !== lanNodes[i]) {
        this.state.upsertNode(enriched[i]);
      }
    }
  }

  private pushUpdate(removed: string[]): void {
    const msg: ScannerUpdate = {
      type: 'node_update',
      nodes: this.state.getNodes(),
      edges: this.state.getEdges(),
      removed,
      timestamp: Date.now(),
    };
    this.sendToRenderer('scanner:update', msg);
  }
}
