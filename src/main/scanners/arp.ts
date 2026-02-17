import { execFile } from 'child_process';
import { promisify } from 'util';
import type { LanDeviceNode, NetworkEdge } from '../types';
import { BaseScanner, type ScanResult } from './base';
import ouiData from '../../data/oui.json';

const execFileAsync = promisify(execFile);

const OUI_DB = ouiData as Record<string, string>;

/** Normalize macOS short-form MACs (e.g. "8:0:20:1:2:3" → "08:00:20:01:02:03") */
function normalizeMac(mac: string): string {
  return mac.split(':').map(o => o.padStart(2, '0')).join(':');
}

function lookupVendor(mac: string): string | undefined {
  const normalized = normalizeMac(mac);
  const prefix = normalized.substring(0, 8).toUpperCase();
  return OUI_DB[prefix];
}

export class ArpScanner extends BaseScanner {
  name = 'arp';

  async scan(): Promise<ScanResult> {
    const nodes: LanDeviceNode[] = [];
    const edges: NetworkEdge[] = [];

    try {
      // Broadcast ping to populate ARP cache (-W 1000 = 1s timeout on macOS)
      try {
        await execFileAsync('ping', ['-c', '1', '-W', '1000', '224.0.0.1'], { timeout: 3000 });
      } catch {
        // ping to broadcast often fails, that's ok
      }

      // -n skips reverse DNS lookups which can stall for seconds
      const { stdout } = await execFileAsync('arp', ['-an'], { timeout: 5000 });
      const lines = stdout.split('\n').filter(Boolean);

      // Parse: ? (192.168.1.1) at aa:bb:cc:dd:ee:ff on en0 ifscope [ethernet]
      const arpRegex = /\?\s+\(([^)]+)\)\s+at\s+([0-9a-f:]+)\s+on\s+(\S+)/i;

      for (const line of lines) {
        const match = line.match(arpRegex);
        if (!match) continue;

        const [, ip, mac, iface] = match;
        if (mac === '(incomplete)' || mac === 'ff:ff:ff:ff:ff:ff') continue;

        const isGateway = line.includes('ifscope') && ip.endsWith('.1');
        const vendor = lookupVendor(mac);
        const id = `lan-${mac}`;

        nodes.push({
          id,
          signalType: 'lan',
          name: vendor ? `${vendor} (${ip})` : ip,
          status: 'active',
          firstSeen: Date.now(),
          lastSeen: Date.now(),
          mac,
          ip,
          interface: iface,
          isGateway,
          vendor,
        });

        edges.push({
          id: `edge-this-${id}`,
          source: 'this-device',
          target: id,
          type: isGateway ? 'gateway' : 'connected_to',
        });
      }
    } catch (err: any) {
      // Only log a short message — arp failures are common (sandbox, permissions)
      const reason = err?.killed ? `killed (${err.signal})` : (err?.message ?? 'unknown');
      console.warn(`[ARP] scan failed: ${reason}`);
    }

    return { nodes, edges };
  }
}
