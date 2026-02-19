import type { OsFamily, DeviceCategory } from '../types';

export type OsSignalSource = 'ttl' | 'oui' | 'hostname' | 'bonjour' | 'bluetooth_name' | 'nmap';

export interface OsSignal {
  source: OsSignalSource;
  osFamily: OsFamily;
  confidence: number; // 0.0–1.0
  raw?: string;
}

export interface OsFingerprintResult {
  osFamily: OsFamily;
  deviceCategory: DeviceCategory;
  confidence: number;
}

const CONFIDENCE_THRESHOLD = 0.45;

/**
 * Pure inference engine: takes a flat list of weighted signals and picks the best OS match.
 * Returns null when no candidate clears the confidence threshold.
 */
export class OsFingerprintEngine {
  infer(signals: OsSignal[]): OsFingerprintResult | null {
    if (signals.length === 0) return null;

    // Sum confidence per osFamily
    const scores = new Map<OsFamily, number>();
    for (const sig of signals) {
      scores.set(sig.osFamily, (scores.get(sig.osFamily) ?? 0) + sig.confidence);
    }

    let bestFamily: OsFamily = 'unknown';
    let bestScore = 0;
    for (const [family, score] of scores) {
      if (score > bestScore) {
        bestScore = score;
        bestFamily = family;
      }
    }

    const normalizedConfidence = Math.min(1.0, bestScore);
    if (normalizedConfidence < CONFIDENCE_THRESHOLD) return null;

    return {
      osFamily: bestFamily,
      deviceCategory: 'unknown', // caller fills via deriveCategory()
      confidence: normalizedConfidence,
    };
  }

  deriveCategory(
    osFamily: OsFamily,
    deviceType?: string,
    minorType?: string
  ): DeviceCategory {
    // Bluetooth minor type takes precedence
    if (minorType) {
      const mt = minorType.toLowerCase();
      if (mt.includes('phone') || mt.includes('smartphone')) return 'mobile';
      if (mt.includes('laptop') || mt.includes('notebook')) return 'laptop';
      if (mt.includes('desktop') || mt.includes('computer')) return 'desktop';
      if (mt.includes('headphone') || mt.includes('audio') || mt.includes('speaker')) return 'iot';
    }
    // Device type from DeviceFingerprinter
    if (deviceType) {
      if (deviceType === 'computer') {
        if (osFamily === 'ios' || osFamily === 'android') return 'mobile';
        return 'desktop';
      }
      if (deviceType === 'server') return 'server';
      if (['smart-home', 'speaker', 'media-player', 'camera'].includes(deviceType)) return 'iot';
      if (deviceType === 'storage') return 'server';
      if (deviceType === 'router') return 'embedded';
    }
    // OS-level defaults
    if (osFamily === 'ios' || osFamily === 'android') return 'mobile';
    if (osFamily === 'macos') return 'desktop';
    if (osFamily === 'windows') return 'desktop';
    if (osFamily === 'linux' || osFamily === 'freebsd') return 'server';
    return 'unknown';
  }
}
