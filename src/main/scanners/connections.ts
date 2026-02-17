import { execFile } from 'child_process';
import { promisify } from 'util';
import type { ActiveConnectionNode, NetworkEdge } from '../types';
import { BaseScanner, type ScanResult } from './base';

const execFileAsync = promisify(execFile);

export class ConnectionsScanner extends BaseScanner {
  name = 'connections';

  async scan(): Promise<ScanResult> {
    const nodes: ActiveConnectionNode[] = [];
    const edges: NetworkEdge[] = [];
    const seen = new Set<string>();

    try {
      const { stdout } = await execFileAsync(
        'lsof',
        ['-i', '-P', '-n', '-F', 'cnPTs'],
        { timeout: 10000 }
      );

      // Parse lsof -F output: fields prefixed by letter codes
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

        const displayName = `${currentProcess} → ${remoteHost}:${remotePort}`;

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

    return { nodes, edges };
  }
}
