import { execFile } from 'child_process';
import { promisify } from 'util';
import type { WifiApNode, NetworkEdge } from '../types';
import { BaseScanner, type ScanResult } from './base';

const execFileAsync = promisify(execFile);

interface AirPortInterface {
  _name?: string;
  spairport_signal_noise?: string | number;
  spairport_current_network_information?: {
    _name?: string;
    spairport_network_channel?: string;
    spairport_network_phymode?: string;
    spairport_network_type?: string;
    spairport_security_mode?: string;
    spairport_signal_noise?: string | number;
  };
}

export class WifiScanner extends BaseScanner {
  name = 'wifi';

  /** Try to get the real SSID when system_profiler returns <redacted> */
  private async resolveSSID(): Promise<string | null> {
    try {
      // networksetup -listpreferredwirelessnetworks returns the known list;
      // the first entry is typically the currently-connected network
      const { stdout } = await execFileAsync(
        'networksetup',
        ['-listpreferredwirelessnetworks', 'en0'],
        { timeout: 3000 }
      );
      const lines = stdout.split('\n').map(l => l.trim()).filter(Boolean);
      // First line is header ("Preferred networks on en0:"), rest are SSIDs
      if (lines.length > 1) return lines[1];
    } catch {}
    return null;
  }

  private parseRSSI(raw: string | number | undefined): number {
    if (raw == null) return -70;
    if (typeof raw === 'number') return raw;
    // Format: "-60 dBm / -93 dBm" — first value is signal, second is noise
    const match = raw.match(/-?\d+/);
    return match ? parseInt(match[0]) : -70;
  }

  async scan(): Promise<ScanResult> {
    const nodes: WifiApNode[] = [];
    const edges: NetworkEdge[] = [];

    try {
      const { stdout } = await execFileAsync(
        'system_profiler',
        ['SPAirPortDataType', '-json'],
        { timeout: 15000 }
      );

      const data = JSON.parse(stdout);
      const airportData = data?.SPAirPortDataType;
      if (!Array.isArray(airportData)) return { nodes, edges };

      let fallbackSSID: string | null = null;

      for (const entry of airportData) {
        const interfaces = entry?.spairport_airport_interfaces;
        if (!Array.isArray(interfaces)) continue;

        for (const iface of interfaces as AirPortInterface[]) {
          const network = iface.spairport_current_network_information;
          if (!network?._name) continue;
          // Skip non-station interfaces (e.g. awdl0)
          if (network.spairport_network_type && network.spairport_network_type !== 'spairport_network_type_station') continue;
          // Skip if no channel info (means not really connected)
          if (!network.spairport_network_channel) continue;

          let ssid = network._name;

          // macOS redacts SSID without Location Services permission
          if (ssid === '<redacted>') {
            if (fallbackSSID == null) fallbackSSID = await this.resolveSSID();
            ssid = fallbackSSID || 'Connected Wi-Fi';
          }

          const channelStr = network.spairport_network_channel || '';
          const channelNum = parseInt(channelStr) || 0;
          const band: '2.4GHz' | '5GHz' | '6GHz' =
            channelNum > 177 ? '6GHz' : channelNum > 14 ? '5GHz' : '2.4GHz';

          const rssi = this.parseRSSI(network.spairport_signal_noise ?? iface.spairport_signal_noise);
          const signalStrength = Math.max(0, Math.min(100, (rssi + 90) * (100 / 60)));

          const id = `wifi-${ssid}`;

          nodes.push({
            id,
            signalType: 'wifi',
            name: ssid,
            status: 'active',
            firstSeen: Date.now(),
            lastSeen: Date.now(),
            signalStrength,
            ssid,
            bssid: '',
            channel: channelNum,
            band,
            security: (network.spairport_security_mode || 'Unknown').replace('spairport_security_mode_', '').replace(/_/g, ' '),
            isConnected: true,
          });

          edges.push({
            id: `edge-this-${id}`,
            source: 'this-device',
            target: id,
            type: 'connected_to',
          });
        }
      }
    } catch (err) {
      const reason = (err as any)?.killed ? `killed (${(err as any).signal})` : ((err as Error)?.message ?? 'unknown');
      console.warn(`[WiFi] scan failed: ${reason}`);
    }

    return { nodes, edges };
  }
}
