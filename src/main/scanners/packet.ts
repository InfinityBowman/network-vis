import { spawn, execFile, type ChildProcess } from 'child_process';
import { promisify } from 'util';
import { access, constants } from 'fs';
import { networkInterfaces } from 'os';
import type { NetworkNode, ThisDeviceNode, PacketEvent, PacketScannerStatus } from '../types';
import { BaseScanner, type ScanResult } from './base';

const execFileAsync = promisify(execFile);
const accessAsync = promisify(access);

const MAX_EVENTS = 10000;
const ENRICHMENT_INTERVAL_MS = 2000;
const EVENT_DRAIN_INTERVAL_MS = 100;
const MAX_EVENTS_PER_DRAIN = 10;

const TSHARK_FIELDS = [
  'frame.time_epoch',
  'ip.src',
  'ip.dst',
  'ipv6.src',
  'ipv6.dst',
  '_ws.col.Protocol',
  'frame.len',
  '_ws.col.Info',
];

export class PacketScanner extends BaseScanner {
  name = 'packet';

  private proc: ChildProcess | null = null;
  private events: PacketEvent[] = [];
  private pendingEvents: PacketEvent[] = [];
  private eventSeq = 0;

  // Protocol aggregation keyed by IP
  private protocolsByIp = new Map<string, Record<string, number>>();
  private bytesByIp = new Map<string, number>();
  private packetsByIp = new Map<string, number>();

  // IP → nodeId index for correlation
  private ipIndex = new Map<string, string>();
  private thisDeviceIps = new Set<string>();

  private enrichmentTimer: NodeJS.Timeout | null = null;
  private drainTimer: NodeJS.Timeout | null = null;
  private currentOnUpdate: ((result: ScanResult) => void) | null = null;
  private onEventCallback: ((event: PacketEvent) => void) | null = null;
  private killTimer: NodeJS.Timeout | null = null;
  private activeInterface = 'en0';
  private _isCapturing = false;
  private _available: boolean | null = null;
  private _hasPermission: boolean | null = null;
  private lastError: string | undefined;

  get isCapturing(): boolean {
    return this._isCapturing;
  }

  // Called by Orchestrator to keep the IP→nodeId index fresh
  refreshIndex(nodes: NetworkNode[]): void {
    this.ipIndex.clear();
    this.thisDeviceIps.clear();
    for (const n of nodes) {
      if (n.signalType === 'this_device') {
        const td = n as ThisDeviceNode;
        for (const iface of td.interfaces ?? []) {
          if (iface.ip) {
            this.thisDeviceIps.add(iface.ip);
            this.ipIndex.set(iface.ip, 'this-device');
          }
        }
        continue;
      }
      if (n.ip) this.ipIndex.set(n.ip, n.id);
    }
  }

  getProtocolsByIp(): Map<string, Record<string, number>> {
    return this.protocolsByIp;
  }

  getBytesByIp(): Map<string, number> {
    return this.bytesByIp;
  }

  getPacketsByIp(): Map<string, number> {
    return this.packetsByIp;
  }

  getEvents(): PacketEvent[] {
    return [...this.events];
  }

  async scan(): Promise<ScanResult> {
    return { nodes: [], edges: [] };
  }

  async start(onUpdate: (result: ScanResult) => void, onEvent?: (event: PacketEvent) => void): Promise<void> {
    this.currentOnUpdate = onUpdate;
    this.onEventCallback = onEvent ?? null;
    this._isCapturing = true;
    this.lastError = undefined;

    const args = [
      '-i', this.activeInterface,
      '-l',
      '-n',
      '-T', 'fields',
      '-E', 'separator=|',
      '-E', 'occurrence=f',
      ...TSHARK_FIELDS.flatMap(f => ['-e', f]),
    ];

    try {
      this.proc = spawn('tshark', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      this._isCapturing = false;
      this.lastError = `Failed to spawn tshark: ${(err as Error).message}`;
      return;
    }

    let buffer = '';
    this.proc.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim()) this.parseLine(line.trim());
      }
    });

    this.proc.stderr?.on('data', (chunk: Buffer) => {
      const msg = chunk.toString().trim();
      if (msg.includes('permission denied') || msg.includes('You don\'t have permission')) {
        this._hasPermission = false;
        this.lastError = 'BPF permission denied. Install Wireshark ChmodBPF or run: sudo chmod o+r /dev/bpf*';
        this.stop();
      } else if (!msg.includes('Capturing on') && !msg.includes('packets captured') && msg.length > 0) {
        console.warn('[PacketScanner]', msg);
      }
    });

    this.proc.on('exit', (code) => {
      console.log(`[PacketScanner] tshark exited (code=${code})`);
      this._isCapturing = false;
      this.proc = null;
      if (this.killTimer) {
        clearTimeout(this.killTimer);
        this.killTimer = null;
      }
    });

    this.proc.on('error', (err) => {
      console.error('[PacketScanner] spawn error:', err.message);
      this._isCapturing = false;
      this.lastError = err.message;
      this.proc = null;
      if (this.enrichmentTimer) {
        clearInterval(this.enrichmentTimer);
        this.enrichmentTimer = null;
      }
      if (this.drainTimer) {
        clearInterval(this.drainTimer);
        this.drainTimer = null;
      }
    });

    // Periodic enrichment flush
    this.enrichmentTimer = setInterval(() => {
      if (this.currentOnUpdate) {
        this.currentOnUpdate({ nodes: [], edges: [] });
      }
    }, ENRICHMENT_INTERVAL_MS);

    // Drain packet events to renderer
    this.drainTimer = setInterval(() => this.drainEvents(), EVENT_DRAIN_INTERVAL_MS);
  }

  async stop(): Promise<void> {
    if (this.enrichmentTimer) {
      clearInterval(this.enrichmentTimer);
      this.enrichmentTimer = null;
    }
    if (this.drainTimer) {
      clearInterval(this.drainTimer);
      this.drainTimer = null;
    }
    if (this.killTimer) {
      clearTimeout(this.killTimer);
      this.killTimer = null;
    }
    if (this.proc) {
      this.proc.kill('SIGTERM');
      // Escalate to SIGKILL after 2s if still alive
      const proc = this.proc;
      this.killTimer = setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch {}
        this.killTimer = null;
      }, 2000);
      this.proc = null;
    }
    this._isCapturing = false;
    this.currentOnUpdate = null;
    this.onEventCallback = null;
  }

  setInterface(iface: string): void {
    this.activeInterface = iface;
  }

  async getStatus(): Promise<PacketScannerStatus> {
    if (this._available === null) {
      await this.checkAvailability();
    }
    const ifaces = await this.listInterfaces();
    return {
      available: this._available ?? false,
      hasPermission: this._hasPermission ?? false,
      capturing: this._isCapturing,
      interface: this._isCapturing ? this.activeInterface : null,
      interfaces: ifaces,
      error: this.lastError,
    };
  }

  async detectDefaultInterface(): Promise<string> {
    try {
      const { stdout } = await execFileAsync('route', ['get', 'default'], { timeout: 3000 });
      const match = stdout.match(/interface:\s+(\S+)/);
      return match?.[1] ?? 'en0';
    } catch {
      return 'en0';
    }
  }

  async listInterfaces(): Promise<string[]> {
    const ifaces = networkInterfaces();
    return Object.keys(ifaces).filter(name =>
      !name.startsWith('lo') &&
      ifaces[name]?.some(a => a.family === 'IPv4' && !a.internal)
    );
  }

  private async checkAvailability(): Promise<void> {
    try {
      await execFileAsync('tshark', ['--version'], { timeout: 3000 });
      this._available = true;
    } catch {
      this._available = false;
      this.lastError = 'tshark not found. Install via: brew install --cask wireshark';
      return;
    }

    try {
      await accessAsync('/dev/bpf0', constants.R_OK);
      this._hasPermission = true;
    } catch {
      this._hasPermission = false;
    }
  }

  private parseLine(line: string): void {
    const parts = line.split('|');
    if (parts.length < 7) return;

    const [tsRaw, srcIp4, dstIp4, srcIp6, dstIp6, protocol, lenRaw, ...infoParts] = parts;

    // Use IPv4 if present, fall back to IPv6
    const srcIp = srcIp4 || srcIp6;
    const dstIp = dstIp4 || dstIp6;
    if (!srcIp || !dstIp) return;

    const ts = Math.round(parseFloat(tsRaw) * 1000) || Date.now();
    const len = parseInt(lenRaw) || 0;
    const proto = protocol?.trim() || 'Unknown';
    const info = infoParts.join('|').slice(0, 80);

    // Correlate to node
    const srcNodeId = this.ipIndex.get(srcIp) ?? null;
    const dstNodeId = this.ipIndex.get(dstIp) ?? null;
    const nodeId = (srcNodeId && srcNodeId !== 'this-device') ? srcNodeId
      : (dstNodeId && dstNodeId !== 'this-device') ? dstNodeId
      : srcNodeId ?? dstNodeId;

    // Record event
    const event: PacketEvent = {
      id: `pkt-${++this.eventSeq}`,
      timestamp: ts,
      nodeId,
      srcIp,
      dstIp,
      protocol: proto,
      length: len,
      info,
    };

    if (this.events.length >= MAX_EVENTS) this.events.shift();
    this.events.push(event);
    this.pendingEvents.push(event);

    // Aggregate protocol stats per IP (excluding this device's own IPs)
    for (const ip of [srcIp, dstIp]) {
      if (this.thisDeviceIps.has(ip)) continue;
      const protos = this.protocolsByIp.get(ip) ?? {};
      protos[proto] = (protos[proto] ?? 0) + 1;
      this.protocolsByIp.set(ip, protos);
      this.bytesByIp.set(ip, (this.bytesByIp.get(ip) ?? 0) + len);
      this.packetsByIp.set(ip, (this.packetsByIp.get(ip) ?? 0) + 1);
    }
  }

  private drainEvents(): void {
    if (this.pendingEvents.length === 0) return;
    if (!this.onEventCallback) return;

    const batch = this.pendingEvents.splice(0, MAX_EVENTS_PER_DRAIN);
    for (const event of batch) {
      this.onEventCallback(event);
    }
  }
}
