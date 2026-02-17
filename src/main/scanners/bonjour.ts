import { Bonjour } from 'bonjour-service';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { BonjourServiceNode, NetworkEdge } from '../types';
import { BaseScanner, type ScanResult } from './base';

const execFileAsync = promisify(execFile);

const COMMON_SERVICE_TYPES = [
  'http', 'https', 'ssh', 'ftp', 'smb', 'afpovertcp',
  'ipp', 'ipps', 'printer', 'pdl-datastream',
  'airplay', 'raop', 'homekit', 'hap',
  'googlecast', 'spotify-connect',
  'companion-link', 'touch-able',
  'workstation', 'device-info',
];

export class BonjourScanner extends BaseScanner {
  name = 'bonjour';
  private instance: InstanceType<typeof Bonjour> | null = null;
  private browsers: any[] = [];
  private discoveredNodes = new Map<string, BonjourServiceNode>();
  private discoveredEdges = new Map<string, NetworkEdge>();
  private activeTypes = new Set(COMMON_SERVICE_TYPES);
  private currentOnUpdate: ((result: ScanResult) => void) | null = null;

  async scan(): Promise<ScanResult> {
    // Return currently discovered nodes
    return {
      nodes: Array.from(this.discoveredNodes.values()),
      edges: Array.from(this.discoveredEdges.values()),
    };
  }

  async start(onUpdate: (result: ScanResult) => void): Promise<void> {
    this.instance = new Bonjour();
    this.currentOnUpdate = onUpdate;

    // Browse all known service types
    for (const type of COMMON_SERVICE_TYPES) {
      this.browseType(type, onUpdate);
    }

    // Discover additional service types dynamically via dns-sd
    this.discoverDynamicTypes(onUpdate);
  }

  async stop(): Promise<void> {
    for (const browser of this.browsers) {
      try { browser.stop(); } catch {}
    }
    this.browsers = [];
    this.instance?.destroy();
    this.instance = null;
    this.currentOnUpdate = null;
  }

  private browseType(type: string, onUpdate: (result: ScanResult) => void): void {
    if (!this.instance) return;
    try {
      const browser = this.instance.find({ type }, (service: any) => {
        const id = `bonjour-${type}-${service.name || service.host}`.replace(/\s+/g, '-');
        const host = service.host || service.fqdn || 'unknown';

        const node: BonjourServiceNode = {
          id,
          signalType: 'bonjour',
          name: `${service.name || type} (${type})`,
          status: 'active',
          firstSeen: Date.now(),
          lastSeen: Date.now(),
          ip: service.addresses?.[0],
          serviceType: `_${type}._tcp`,
          port: service.port || 0,
          host,
        };

        this.discoveredNodes.set(id, node);

        const edge: NetworkEdge = {
          id: `edge-this-${id}`,
          source: 'this-device',
          target: id,
          type: 'hosts_service',
        };
        this.discoveredEdges.set(edge.id, edge);

        onUpdate({
          nodes: Array.from(this.discoveredNodes.values()),
          edges: Array.from(this.discoveredEdges.values()),
        });
      });

      this.browsers.push(browser);
    } catch {
      // Some service types may not be browseable
    }
  }

  private async discoverDynamicTypes(onUpdate: (result: ScanResult) => void): Promise<void> {
    try {
      // dns-sd -B discovers all advertised service types on the local network.
      // We use a 5s timeout to capture announcements, then browse any new types.
      const { stdout } = await execFileAsync(
        'dns-sd',
        ['-B', '_services._dns-sd._udp', 'local.'],
        { timeout: 5000 }
      );
      this.parseDnsSdOutput(stdout, onUpdate);
    } catch (err: any) {
      // dns-sd runs forever — timeout kills it, but partial stdout is captured in the error
      if (err?.stdout) {
        this.parseDnsSdOutput(err.stdout, onUpdate);
      }
    }
  }

  private parseDnsSdOutput(stdout: string, onUpdate: (result: ScanResult) => void): void {
    // Output lines look like: "Timestamp  A/R  Flags  If  Domain  Service Type"
    // e.g.: "14:23:05.123  Add     3  4  local.  _airplay._tcp."
    const typeRegex = /(?:Add|Rmv)\s+\d+\s+\d+\s+\S+\s+(_[\w-]+)\._(?:tcp|udp)\./;
    for (const line of stdout.split('\n')) {
      const match = line.match(typeRegex);
      if (!match) continue;
      const rawType = match[1]; // e.g. "_airplay"
      const typeName = rawType.replace(/^_/, ''); // e.g. "airplay"
      if (this.activeTypes.has(typeName)) continue;

      this.activeTypes.add(typeName);
      this.browseType(typeName, onUpdate);
    }
  }
}
