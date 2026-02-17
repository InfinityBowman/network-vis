import { execFile } from 'child_process';
import { promisify } from 'util';
import { BaseScanner, type ScanResult } from './base';

const execFileAsync = promisify(execFile);

export interface TrafficRate {
  bytesPerSec: number;
  bytesInPerSec: number;
  bytesOutPerSec: number;
}

interface NettopSample {
  bytesIn: number;
  bytesOut: number;
}

/**
 * TrafficScanner samples `nettop` to compute per-connection bandwidth rates.
 *
 * It does NOT produce nodes/edges — scan() always returns empty arrays.
 * Instead, the orchestrator reads getRates() and enriches edges at the IPC boundary.
 *
 * Connection IDs match ConnectionsScanner format:
 *   conn-{proto}-{remoteHost}-{remotePort}-{processName}
 */
export class TrafficScanner extends BaseScanner {
  name = 'traffic';

  private prevSample = new Map<string, NettopSample>();
  private prevTimestamp = 0;
  private rates = new Map<string, TrafficRate>();

  async scan(): Promise<ScanResult> {
    try {
      // nettop: -m tcp = TCP only, -L 1 = single sample then exit,
      // -J bytes_in,bytes_out = only these columns, -n = no DNS, -x = extended (skip header delay)
      const { stdout } = await execFileAsync(
        'nettop',
        ['-m', 'tcp', '-L', '1', '-J', 'bytes_in,bytes_out', '-n', '-x'],
        { timeout: 10000 }
      );

      this.processSample(stdout);
    } catch (err) {
      const reason = (err as any)?.killed
        ? `killed (${(err as any).signal})`
        : ((err as Error)?.message ?? 'unknown');
      console.warn(`[Traffic] scan failed: ${reason}`);
    }

    // TrafficScanner never produces nodes/edges directly
    return { nodes: [], edges: [] };
  }

  /** Get current per-connection rates. Keys are connection IDs matching ConnectionsScanner format. */
  getRates(): Map<string, TrafficRate> {
    return this.rates;
  }

  private processSample(stdout: string): void {
    const now = Date.now();
    const elapsed = this.prevTimestamp > 0 ? (now - this.prevTimestamp) / 1000 : 0;
    const currentSample = new Map<string, NettopSample>();

    const lines = stdout.split('\n');

    // nettop -J bytes_in,bytes_out outputs CSV-like lines:
    // Header line, then: process.pid, bytes_in, bytes_out  (process-level)
    //   followed by socket lines indented or with socket detail
    //
    // Format varies — process lines have the process name, socket lines show connections.
    // We parse both: process lines track process name, socket lines track connections.

    let currentProcess = '';

    for (const line of lines) {
      if (!line.trim()) continue;

      // Split by comma (CSV format from nettop)
      const parts = line.split(',').map(s => s.trim());

      if (parts.length < 3) continue;

      const nameField = parts[0];
      const bytesIn = parseInt(parts[1], 10);
      const bytesOut = parseInt(parts[2], 10);

      if (isNaN(bytesIn) || isNaN(bytesOut)) continue;

      // Socket lines contain connection details like:
      //   "  process.12345" (indented = process header)
      //   "    192.168.1.100:54321<->142.250.80.46:443" (socket line)
      //
      // Or in some nettop versions, socket lines appear as:
      //   "  tcp4  192.168.1.100:54321<->142.250.80.46:443"

      // Detect if this is a process line (has PID) or socket line (has <-> or ->)
      if (nameField.includes('<->') || nameField.includes('->')) {
        // Socket line — extract connection details
        const connId = this.parseSocketLine(nameField, currentProcess);
        if (connId) {
          currentSample.set(connId, { bytesIn, bytesOut });
        }
      } else {
        // Process line — extract process name
        // Format: "processName.PID" or just "processName"
        const dotIdx = nameField.lastIndexOf('.');
        if (dotIdx > 0) {
          const maybePid = nameField.slice(dotIdx + 1);
          if (/^\d+$/.test(maybePid)) {
            currentProcess = nameField.slice(0, dotIdx).trim();
          } else {
            currentProcess = nameField.trim();
          }
        } else {
          currentProcess = nameField.trim();
        }
      }
    }

    // Compute rates by diffing against previous sample
    if (elapsed > 0 && this.prevSample.size > 0) {
      const newRates = new Map<string, TrafficRate>();

      for (const [connId, current] of currentSample) {
        const prev = this.prevSample.get(connId);
        if (prev) {
          const deltaIn = Math.max(0, current.bytesIn - prev.bytesIn);
          const deltaOut = Math.max(0, current.bytesOut - prev.bytesOut);
          const totalRate = (deltaIn + deltaOut) / elapsed;
          if (totalRate > 0) {
            newRates.set(connId, {
              bytesPerSec: totalRate,
              bytesInPerSec: deltaIn / elapsed,
              bytesOutPerSec: deltaOut / elapsed,
            });
          }
        }
      }

      this.rates = newRates;
    }

    this.prevSample = currentSample;
    this.prevTimestamp = now;
  }

  /**
   * Parse a nettop socket line into a ConnectionsScanner-compatible ID.
   *
   * Formats seen:
   *   "192.168.1.100:54321<->142.250.80.46:443"
   *   "tcp4  192.168.1.100:54321<->142.250.80.46:443"
   *   "[::1]:54321<->[fe80::1]:443"
   *
   * IPv4 uses ":port", IPv6 uses ".port" in nettop output.
   */
  private parseSocketLine(nameField: string, processName: string): string | null {
    // Extract the connection part (after any protocol prefix)
    const connPart = nameField.replace(/^\s*(tcp[46]?|udp[46]?)\s+/i, '').trim();

    // Split on <-> or ->
    const separator = connPart.includes('<->') ? '<->' : '->';
    const sides = connPart.split(separator);
    if (sides.length !== 2) return null;

    const remote = sides[1].trim();
    const remoteInfo = this.parseHostPort(remote);
    if (!remoteInfo) return null;

    // Skip loopback
    if (remoteInfo.host === '127.0.0.1' || remoteInfo.host === '::1') return null;

    // Build ID matching ConnectionsScanner format: conn-{proto}-{remoteHost}-{remotePort}-{processName}
    return `conn-TCP-${remoteInfo.host}-${remoteInfo.port}-${processName}`;
  }

  /**
   * Parse host:port from nettop format.
   * IPv4: "142.250.80.46:443" — last colon separates port
   * IPv6: "[fe80::1].443" or "fe80::1.443" — last dot separates port for IPv6
   */
  private parseHostPort(addr: string): { host: string; port: number } | null {
    // Try IPv4 format first (last colon is port separator)
    const lastColon = addr.lastIndexOf(':');
    if (lastColon > 0) {
      const maybPort = addr.slice(lastColon + 1);
      const port = parseInt(maybPort, 10);
      if (!isNaN(port) && port > 0) {
        const host = addr.slice(0, lastColon);
        // Verify it looks like an IPv4 address (contains dots, no more colons)
        if (host.includes('.') && !host.includes(':')) {
          return { host, port };
        }
        // Could be a simple IPv4 with port
        if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
          return { host, port };
        }
      }
    }

    // Try IPv6 format — nettop uses ".port" suffix for IPv6
    const lastDot = addr.lastIndexOf('.');
    if (lastDot > 0) {
      const maybePort = addr.slice(lastDot + 1);
      const port = parseInt(maybePort, 10);
      if (!isNaN(port) && port > 0) {
        let host = addr.slice(0, lastDot);
        // Remove brackets if present
        host = host.replace(/^\[/, '').replace(/\]$/, '');
        return { host, port };
      }
    }

    return null;
  }
}
