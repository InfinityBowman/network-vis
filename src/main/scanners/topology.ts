import { execFile } from 'child_process';
import { promisify } from 'util';
import { networkInterfaces } from 'os';
import type { SubnetInfo } from '../types';
import { BaseScanner, type ScanResult } from './base';

const execFileAsync = promisify(execFile);

export class TopologyScanner extends BaseScanner {
  name = 'topology';
  private _subnets: SubnetInfo[] = [];

  async scan(): Promise<ScanResult> {
    try {
      const { stdout } = await execFileAsync('netstat', ['-rn'], { timeout: 5000 });
      const ifaces = networkInterfaces();
      const seen = new Set<string>();
      const subnets: SubnetInfo[] = [];

      for (const line of stdout.split('\n')) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 4) continue;

        const [dest, gateway, , iface] = parts;

        // Skip: header lines, default route, loopback, IPv6
        if (dest === 'Destination' || dest === 'default') continue;
        if (dest.startsWith('127') || dest.includes(':')) continue;
        if (!iface || iface.startsWith('lo')) continue;

        // Parse destination into CIDR
        let networkAddress: string;
        let prefix: number;

        if (dest.includes('/')) {
          const [addr, pfx] = dest.split('/');
          networkAddress = addr;
          prefix = parseInt(pfx, 10);
          // Skip host routes (/32) and very narrow subnets
          if (prefix >= 32) continue;
        } else {
          const octets = dest.split('.');
          if (octets.length === 3) {
            prefix = 24;
            networkAddress = dest + '.0';
          } else if (octets.length === 2) {
            prefix = 16;
            networkAddress = dest + '.0.0';
          } else if (octets.length === 1 && /^\d+$/.test(dest)) {
            prefix = 8;
            networkAddress = dest + '.0.0.0';
          } else {
            continue;
          }
        }

        const cidr = `${networkAddress}/${prefix}`;

        // Skip link-local, multicast, broadcast
        if (networkAddress.startsWith('169.254')) continue;
        if (networkAddress.startsWith('224.') || networkAddress.startsWith('255.')) continue;

        // Resolve gateway: "link#N" means directly connected
        const resolvedGateway = gateway.startsWith('link#') ? null : gateway;

        // Find this device's IP on this interface
        const ifaceAddrs = ifaces[iface];
        const localAddr = ifaceAddrs?.find(a => a.family === 'IPv4' && !a.internal);
        if (!localAddr) continue;

        // Deduplicate by CIDR (after localAddr check so VPN routes don't shadow real ones)
        if (seen.has(cidr)) continue;
        seen.add(cidr);

        subnets.push({
          cidr,
          networkAddress,
          prefix,
          gateway: resolvedGateway,
          interface: iface,
          localIp: localAddr.address,
        });
      }

      this._subnets = subnets;
    } catch (err: any) {
      const reason = err?.killed ? `killed (${err.signal})` : (err?.message ?? 'unknown');
      console.warn(`[Topology] scan failed: ${reason}`);
      this._subnets = [];
    }

    return { nodes: [], edges: [] };
  }

  getSubnets(): SubnetInfo[] {
    return this._subnets;
  }
}
