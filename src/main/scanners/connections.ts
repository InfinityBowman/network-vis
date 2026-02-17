import { execFile } from 'child_process';
import { promisify } from 'util';
import { reverse } from 'dns/promises';
import type { ActiveConnectionNode, NetworkEdge } from '../types';
import { BaseScanner, type ScanResult } from './base';

const execFileAsync = promisify(execFile);

const WELL_KNOWN_SERVICES: Record<number, string> = {
  21: 'FTP', 22: 'SSH', 23: 'Telnet', 25: 'SMTP',
  53: 'DNS', 80: 'HTTP', 110: 'POP3', 123: 'NTP',
  143: 'IMAP', 443: 'HTTPS', 465: 'SMTPS', 587: 'SMTP',
  853: 'DNS-TLS', 993: 'IMAPS', 995: 'POP3S',
  3306: 'MySQL', 3389: 'RDP', 5222: 'XMPP', 5228: 'GCM',
  5353: 'mDNS', 5432: 'PostgreSQL', 5900: 'VNC', 6379: 'Redis',
  8080: 'HTTP', 8443: 'HTTPS', 27017: 'MongoDB',
};

/** Extract the registrable domain from a full hostname (e.g. cdn.github.com → github.com) */
function shortenHostname(hostname: string): string {
  const parts = hostname.split('.');
  if (parts.length <= 2) return hostname;
  // ccTLDs like .co.uk, .com.au — keep 3 parts
  const sld = parts[parts.length - 2];
  if (sld.length <= 3 && parts.length >= 3) {
    return parts.slice(-3).join('.');
  }
  return parts.slice(-2).join('.');
}

function buildDisplayName(
  process: string,
  remoteHost: string,
  remotePort: number,
  resolvedHostname: string | undefined,
  service: string | undefined
): string {
  const displayHost = resolvedHostname ? shortenHostname(resolvedHostname) : remoteHost;
  return service
    ? `${process} → ${displayHost} (${service})`
    : `${process} → ${displayHost}:${remotePort}`;
}

export class ConnectionsScanner extends BaseScanner {
  name = 'connections';
  private dnsCache = new Map<string, string | null>();
  private pendingLookups = new Set<string>();

  async scan(): Promise<ScanResult> {
    const nodes: ActiveConnectionNode[] = [];
    const edges: NetworkEdge[] = [];
    const seen = new Set<string>();
    const pidToNodeIds = new Map<number, string[]>();

    try {
      const { stdout } = await execFileAsync(
        'lsof',
        ['-i', '-P', '-n', '-F', 'cnPTs'],
        { timeout: 10000 }
      );

      // Parse lsof -F output: fields prefixed by letter codes
      let currentPid = 0;
      let currentProcess = '';
      let currentProto = '';
      let currentState = '';
      let currentName = '';

      for (const line of stdout.split('\n')) {
        if (!line) continue;
        const code = line[0];
        const value = line.slice(1);

        switch (code) {
          case 'p':
            currentPid = parseInt(value) || 0;
            currentProcess = '';
            currentProto = '';
            currentState = '';
            currentName = '';
            break;
          case 'c': currentProcess = value; break;
          case 'P': currentProto = value; break;
          case 'T': if (value.startsWith('ST=')) currentState = value.slice(3); break;
          case 'n': currentName = value; break;
          case 's': break; // size, skip
          default: continue;
        }

        // When we get a name field, process the connection
        if (code !== 'n' || !currentName.includes('->')) continue;

        const parts = currentName.split('->');
        if (parts.length !== 2) continue;

        const [localPart, remotePart] = parts;
        const localMatch = localPart.match(/(?:\[?([^\]]*)\]?)?:(\d+|\*)$/);
        const remoteMatch = remotePart.match(/(?:\[?([^\]]*)\]?)?:(\d+|\*)$/);
        if (!localMatch || !remoteMatch) continue;

        const remoteHost = remoteMatch[1] || remotePart.split(':')[0];
        const remotePort = parseInt(remoteMatch[2]) || 0;
        const localPort = parseInt(localMatch[2]) || 0;

        // Skip loopback
        if (remoteHost === '127.0.0.1' || remoteHost === '::1' || remoteHost === 'localhost') continue;
        // Skip unresolved
        if (remoteHost === '*' || remotePort === 0) continue;

        const id = `conn-${currentProto}-${remoteHost}-${remotePort}-${currentProcess}`;
        if (seen.has(id)) continue;
        seen.add(id);

        // Enrich with cached DNS and well-known port names
        const resolved = this.dnsCache.get(remoteHost) ?? undefined;
        const service = WELL_KNOWN_SERVICES[remotePort];
        const displayName = buildDisplayName(currentProcess, remoteHost, remotePort, resolved, service);

        // Track PID → node IDs for process name resolution
        const existing = pidToNodeIds.get(currentPid);
        if (existing) existing.push(id);
        else pidToNodeIds.set(currentPid, [id]);

        nodes.push({
          id,
          signalType: 'connection',
          name: displayName,
          status: 'active',
          firstSeen: Date.now(),
          lastSeen: Date.now(),
          ip: remoteHost,
          protocol: currentProto === 'UDP' ? 'UDP' : 'TCP',
          localPort,
          remotePort,
          remoteHost,
          state: currentState || 'UNKNOWN',
          processName: currentProcess,
          resolvedHostname: resolved,
          serviceName: service,
        });

        edges.push({
          id: `edge-this-${id}`,
          source: 'this-device',
          target: id,
          type: 'connected_to',
        });
      }
    } catch (err) {
      const reason = (err as any)?.killed ? `killed (${(err as any).signal})` : ((err as Error)?.message ?? 'unknown');
      console.warn(`[Connections] scan failed: ${reason}`);
    }

    // Resolve real executable names from PIDs (lsof reports process.title which
    // apps like Node.js/bun can set to anything — ps -o comm= gives the real binary)
    await this.enrichProcessNames(nodes, pidToNodeIds);

    // Kick off reverse DNS for any new IPs (non-blocking — results available next scan)
    this.resolveNewIps(nodes.map(n => n.remoteHost));

    return { nodes, edges };
  }

  /** Cross-reference PIDs via `ps` to get reliable executable names */
  private async enrichProcessNames(
    nodes: ActiveConnectionNode[],
    pidToNodeIds: Map<number, string[]>
  ): Promise<void> {
    const pids = [...pidToNodeIds.keys()];
    if (pids.length === 0) return;

    try {
      const { stdout } = await execFileAsync('ps', [
        '-p', pids.join(','),
        '-o', 'pid=,comm='
      ], { timeout: 3000 });

      const resolvedNames = new Map<number, string>();
      for (const line of stdout.trim().split('\n')) {
        const match = line.trim().match(/^(\d+)\s+(.+)/);
        if (!match) continue;
        const pid = parseInt(match[1]);
        const raw = match[2].trim();

        // Try to extract .app bundle name: /Foo Bar.app/... → Foo Bar
        const appMatch = raw.match(/\/([^/]+)\.app\//);
        if (appMatch) {
          resolvedNames.set(pid, appMatch[1]);
          continue;
        }

        // Fall back to basename of executable path
        const basename = raw.includes('/') ? raw.split('/').pop()! : raw;
        resolvedNames.set(pid, basename);
      }

      // Update nodes whose lsof name differs from the real executable name
      for (const [pid, nodeIds] of pidToNodeIds) {
        const realName = resolvedNames.get(pid);
        if (!realName) continue;

        for (const nodeId of nodeIds) {
          const node = nodes.find(n => n.id === nodeId);
          if (!node || node.processName === realName) continue;

          node.processName = realName;
          node.name = buildDisplayName(
            realName,
            node.remoteHost,
            node.remotePort,
            node.resolvedHostname,
            node.serviceName
          );
        }
      }
    } catch {
      // ps might fail — keep lsof names as fallback
    }
  }

  /** Start background DNS reverse lookups for IPs not yet in cache */
  private resolveNewIps(ips: string[]): void {
    const newIps = [...new Set(ips)].filter(
      ip => !this.dnsCache.has(ip) && !this.pendingLookups.has(ip)
    );

    for (const ip of newIps) {
      this.pendingLookups.add(ip);
      reverse(ip)
        .then(hostnames => {
          this.dnsCache.set(ip, hostnames[0] || null);
        })
        .catch(() => {
          this.dnsCache.set(ip, null);
        })
        .finally(() => {
          this.pendingLookups.delete(ip);
        });
    }
  }
}
