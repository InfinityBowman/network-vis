import type { LanDeviceNode, BonjourServiceNode } from '../types';
import deviceProfiles from '../../data/device-profiles.json';

interface DeviceProfile {
  id: string;
  deviceType: string;
  productName: string;
  iconKey: string;
  vendorPatterns?: string[];
  serviceTypes?: string[];
  hostnamePatterns?: string[];
}

interface FingerprintResult {
  deviceType: string;
  productName: string;
  iconKey: string;
}

const profiles = deviceProfiles as DeviceProfile[];

/**
 * Cross-references ARP-discovered LAN devices with Bonjour services and OUI vendor data
 * to classify devices by type (printer, speaker, smart-home, etc.).
 */
export class DeviceFingerprinter {
  /**
   * Enrich LAN nodes with device type metadata by matching against the profile database.
   * Returns the same nodes with deviceType/productName/iconKey fields populated where matched.
   */
  enrich(
    lanNodes: LanDeviceNode[],
    bonjourNodes: BonjourServiceNode[]
  ): LanDeviceNode[] {
    // Build IP → service types index from Bonjour data
    const servicesByIp = new Map<string, string[]>();
    const serviceNamesByIp = new Map<string, string>();
    for (const bNode of bonjourNodes) {
      if (!bNode.ip) continue;
      const existing = servicesByIp.get(bNode.ip) ?? [];
      existing.push(bNode.serviceType);
      servicesByIp.set(bNode.ip, existing);
      // Keep the first service name as a potential product name
      if (!serviceNamesByIp.has(bNode.ip)) {
        const cleanName = bNode.name.replace(/\s*\([^)]+\)\s*$/, '').trim();
        if (cleanName) serviceNamesByIp.set(bNode.ip, cleanName);
      }
    }

    return lanNodes.map((node) => {
      // Already classified — don't re-classify
      if (node.deviceType) return node;

      const serviceTypes = node.ip ? (servicesByIp.get(node.ip) ?? []) : [];
      const serviceName = node.ip ? serviceNamesByIp.get(node.ip) : undefined;

      const result = this.match(node.vendor, serviceTypes, node.name);
      if (!result) return node;

      return {
        ...node,
        deviceType: result.deviceType,
        productName: serviceName ?? result.productName,
        iconKey: result.iconKey,
      };
    });
  }

  private match(
    vendor: string | undefined,
    serviceTypes: string[],
    hostname: string
  ): FingerprintResult | null {
    let bestScore = 0;
    let bestProfile: DeviceProfile | null = null;

    for (const profile of profiles) {
      let score = 0;

      // Vendor pattern match
      if (profile.vendorPatterns && vendor) {
        const v = vendor.toLowerCase();
        for (const pattern of profile.vendorPatterns) {
          if (v.includes(pattern.toLowerCase())) {
            score += 1;
            break;
          }
        }
      }

      // Bonjour service type match
      if (profile.serviceTypes && serviceTypes.length > 0) {
        for (const svcType of profile.serviceTypes) {
          if (serviceTypes.includes(svcType)) {
            score += 1;
            break;
          }
        }
      }

      // Hostname pattern match
      if (profile.hostnamePatterns && hostname) {
        for (const pattern of profile.hostnamePatterns) {
          if (new RegExp(pattern, 'i').test(hostname)) {
            score += 1;
            break;
          }
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestProfile = profile;
      }
    }

    if (!bestProfile || bestScore === 0) return null;

    return {
      deviceType: bestProfile.deviceType,
      productName: bestProfile.productName,
      iconKey: bestProfile.iconKey,
    };
  }
}
