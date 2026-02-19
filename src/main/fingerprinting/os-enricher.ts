import type { NetworkNode, BonjourServiceNode, BluetoothNode, LanDeviceNode, OsFamily } from '../types';
import type { OsSignal } from './os-engine';
import { OsFingerprintEngine } from './os-engine';
import osProfiles from '../../data/os-profiles.json';

interface OsProfile {
  id: string;
  osFamily: OsFamily;
  ttlRange?: [number, number];
  ouiPatterns?: string[];
  hostnamePatterns?: string[];
  bonjourServiceTypes?: string[];
  bluetoothNamePatterns?: string[];
  nmapOsPatterns?: string[];
}

const profiles = osProfiles as OsProfile[];
const engine = new OsFingerprintEngine();

/**
 * Cross-references multiple signal sources to infer the OS family of network devices.
 * Called by the Orchestrator after device fingerprinting, enriching nodes with osFamily,
 * deviceCategory, and confidence fields.
 */
export class OsEnricher {
  enrich(
    nodes: NetworkNode[],
    ttlsByIp: Map<string, number[]>,
    bonjourNodes: BonjourServiceNode[]
  ): NetworkNode[] {
    // Build IP → bonjour service type index
    const bonjourByIp = new Map<string, string[]>();
    for (const b of bonjourNodes) {
      if (!b.ip) continue;
      const existing = bonjourByIp.get(b.ip) ?? [];
      existing.push(b.serviceType);
      bonjourByIp.set(b.ip, existing);
    }

    return nodes.map(node => {
      // Only fingerprint LAN and Bluetooth nodes
      if (node.signalType !== 'lan' && node.signalType !== 'bluetooth') {
        return node;
      }

      // Don't overwrite high-confidence results (e.g., from nmap)
      if (node.osFingerprintConfidence != null && node.osFingerprintConfidence >= 0.85) {
        return node;
      }

      const signals: OsSignal[] = [
        ...this.gatherTtlSignals(node, ttlsByIp),
        ...this.gatherOuiSignals((node as LanDeviceNode).vendor),
        ...this.gatherHostnameSignals(node.name),
        ...this.gatherBonjourSignals(node.ip, bonjourByIp),
        ...this.gatherBluetoothSignals(node),
      ];

      const result = engine.infer(signals);
      if (!result) return node;

      const deviceType = (node as LanDeviceNode).deviceType;
      const minorType = (node as BluetoothNode).minorType;
      const deviceCategory = engine.deriveCategory(result.osFamily, deviceType, minorType);

      return {
        ...node,
        osFamily: result.osFamily,
        deviceCategory,
        osFingerprintConfidence: result.confidence,
      };
    });
  }

  private gatherTtlSignals(
    node: NetworkNode,
    ttlsByIp: Map<string, number[]>
  ): OsSignal[] {
    if (!node.ip) return [];
    const ttls = ttlsByIp.get(node.ip);
    if (!ttls || ttls.length === 0) return [];

    // Use median TTL
    const sorted = [...ttls].sort((a, b) => a - b);
    const medianTtl = sorted[Math.floor(sorted.length / 2)];

    const signals: OsSignal[] = [];
    for (const profile of profiles) {
      if (!profile.ttlRange) continue;
      const [min, max] = profile.ttlRange;
      if (medianTtl >= min && medianTtl <= max) {
        signals.push({
          source: 'ttl',
          osFamily: profile.osFamily,
          confidence: 0.3, // TTL alone is weak (64 shared by Linux/macOS/iOS/Android)
          raw: String(medianTtl),
        });
      }
    }
    return signals;
  }

  private gatherOuiSignals(vendor: string | undefined): OsSignal[] {
    if (!vendor) return [];
    const v = vendor.toLowerCase();
    const signals: OsSignal[] = [];
    for (const profile of profiles) {
      if (!profile.ouiPatterns) continue;
      for (const pattern of profile.ouiPatterns) {
        if (v.includes(pattern.toLowerCase())) {
          signals.push({
            source: 'oui',
            osFamily: profile.osFamily,
            confidence: 0.4,
            raw: vendor,
          });
          break;
        }
      }
    }
    return signals;
  }

  private gatherHostnameSignals(hostname: string): OsSignal[] {
    if (!hostname) return [];
    const signals: OsSignal[] = [];
    for (const profile of profiles) {
      if (!profile.hostnamePatterns) continue;
      for (const pattern of profile.hostnamePatterns) {
        if (new RegExp(pattern, 'i').test(hostname)) {
          signals.push({
            source: 'hostname',
            osFamily: profile.osFamily,
            confidence: 0.5,
            raw: hostname,
          });
          break;
        }
      }
    }
    return signals;
  }

  private gatherBonjourSignals(
    ip: string | undefined,
    bonjourByIp: Map<string, string[]>
  ): OsSignal[] {
    if (!ip) return [];
    const serviceTypes = bonjourByIp.get(ip);
    if (!serviceTypes || serviceTypes.length === 0) return [];

    const signals: OsSignal[] = [];
    for (const profile of profiles) {
      if (!profile.bonjourServiceTypes) continue;
      for (const svcType of profile.bonjourServiceTypes) {
        if (serviceTypes.some(s => s.includes(svcType.replace(/^_/, '').replace(/\._tcp$/, '')))) {
          signals.push({
            source: 'bonjour',
            osFamily: profile.osFamily,
            confidence: 0.5,
            raw: svcType,
          });
          break;
        }
      }
    }
    return signals;
  }

  private gatherBluetoothSignals(node: NetworkNode): OsSignal[] {
    if (node.signalType !== 'bluetooth') return [];
    const name = node.name ?? '';
    if (!name) return [];

    const signals: OsSignal[] = [];
    for (const profile of profiles) {
      if (!profile.bluetoothNamePatterns) continue;
      for (const pattern of profile.bluetoothNamePatterns) {
        if (new RegExp(pattern, 'i').test(name)) {
          signals.push({
            source: 'bluetooth_name',
            osFamily: profile.osFamily,
            confidence: 0.5,
            raw: name,
          });
          break;
        }
      }
    }
    return signals;
  }
}
