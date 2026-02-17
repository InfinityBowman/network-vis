import { execFile } from 'child_process';
import { promisify } from 'util';
import type { BluetoothNode, NetworkEdge } from '../types';
import { BaseScanner, type ScanResult } from './base';

const execFileAsync = promisify(execFile);

export class BluetoothScanner extends BaseScanner {
  name = 'bluetooth';

  async scan(): Promise<ScanResult> {
    const nodes: BluetoothNode[] = [];
    const edges: NetworkEdge[] = [];

    try {
      const { stdout } = await execFileAsync(
        'system_profiler',
        ['SPBluetoothDataType', '-json'],
        { timeout: 15000 }
      );

      const data = JSON.parse(stdout);
      const btData = data?.SPBluetoothDataType;
      if (!Array.isArray(btData)) return { nodes, edges };

      for (const controller of btData) {
        // Look for connected/paired devices in various keys
        const deviceSections = [
          controller.device_connected,
          controller.device_not_connected,
          controller.devices_not_connected,
        ].filter(Array.isArray);

        for (const section of deviceSections) {
          for (const deviceEntry of section) {
            // Each entry is an object with device name as key
            for (const [deviceName, info] of Object.entries(deviceEntry) as [string, any][]) {
              const mac = info.device_address || '';
              const isConnected = info.device_isconnected === 'attrib_Yes' ||
                                  info.device_connected === 'attrib_Yes' ||
                                  section === controller.device_connected;

              const rssi = typeof info.device_rssi === 'number' ? info.device_rssi :
                           parseInt(info.device_rssi) || undefined;
              const signalStrength = rssi != null
                ? Math.max(0, Math.min(100, (rssi + 90) * (100 / 60)))
                : undefined;

              const batteryLevel = info.device_batteryLevel != null
                ? parseInt(String(info.device_batteryLevel))
                : info.device_batteryLevelMain != null
                ? parseInt(String(info.device_batteryLevelMain))
                : undefined;

              const id = `bt-${mac || deviceName.replace(/\s+/g, '-')}`;

              nodes.push({
                id,
                signalType: 'bluetooth',
                name: deviceName,
                status: 'active',
                firstSeen: Date.now(),
                lastSeen: Date.now(),
                mac: mac || undefined,
                signalStrength,
                minorType: info.device_minorType || info.device_minorClassOfDevice_string,
                isConnected,
                batteryLevel: Number.isNaN(batteryLevel) ? undefined : batteryLevel,
                rssi,
              });

              edges.push({
                id: `edge-this-${id}`,
                source: 'this-device',
                target: id,
                type: 'connected_to',
              });
            }
          }
        }
      }
    } catch (err) {
      const reason = (err as any)?.killed ? `killed (${(err as any).signal})` : ((err as Error)?.message ?? 'unknown');
      console.warn(`[Bluetooth] scan failed: ${reason}`);
    }

    return { nodes, edges };
  }
}
