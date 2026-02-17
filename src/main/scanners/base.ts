import type { NetworkNode, NetworkEdge } from '../types';

export interface ScanResult {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
}

export abstract class BaseScanner {
  abstract name: string;

  abstract scan(): Promise<ScanResult>;

  /** Override for event-driven scanners (e.g. Bonjour) */
  async start?(onUpdate: (result: ScanResult) => void): Promise<void>;

  /** Override if scanner needs cleanup */
  async stop?(): Promise<void>;
}
