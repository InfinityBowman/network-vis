import type { NetworkNode, NetworkEdge, NodeStatus } from '../types';

const LIFECYCLE = {
  staleAfterMs: 30000,
  expiredAfterMs: 60000,
  removeAfterMs: 90000,
};

export class NetworkState {
  private nodes = new Map<string, NetworkNode>();
  private edges = new Map<string, NetworkEdge>();

  upsertNode(node: NetworkNode): void {
    const existing = this.nodes.get(node.id);
    if (existing) {
      this.nodes.set(node.id, {
        ...existing,
        ...node,
        firstSeen: existing.firstSeen,
        lastSeen: Date.now(),
        status: 'active',
      });
    } else {
      this.nodes.set(node.id, {
        ...node,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        status: 'active',
      });
    }
  }

  /** Merge fields into an existing node without resetting lifecycle (lastSeen/status). */
  patchNode(id: string, fields: Partial<NetworkNode>): void {
    const existing = this.nodes.get(id);
    if (!existing) return;
    this.nodes.set(id, { ...existing, ...fields } as NetworkNode);
  }

  upsertEdge(edge: NetworkEdge): void {
    this.edges.set(edge.id, edge);
  }

  removeEdgesForNode(nodeId: string): void {
    for (const [id, edge] of this.edges) {
      if (edge.source === nodeId || edge.target === nodeId) {
        this.edges.delete(id);
      }
    }
  }

  /** Update lifecycle statuses and remove expired nodes. */
  tick(): { removed: string[]; statusChanged: boolean } {
    const now = Date.now();
    const removed: string[] = [];
    let statusChanged = false;
    const { staleAfterMs, expiredAfterMs, removeAfterMs } = LIFECYCLE;

    for (const [id, node] of this.nodes) {
      if (node.signalType === 'this_device') continue;
      const age = now - node.lastSeen;

      if (age > removeAfterMs) {
        this.nodes.delete(id);
        this.removeEdgesForNode(id);
        removed.push(id);
      } else if (age > expiredAfterMs && node.status !== 'expired') {
        this.nodes.set(id, { ...node, status: 'expired' });
        statusChanged = true;
      } else if (age > staleAfterMs && node.status !== 'stale' && node.status !== 'expired') {
        this.nodes.set(id, { ...node, status: 'stale' });
        statusChanged = true;
      }
    }
    return { removed, statusChanged };
  }

  getNodes(): NetworkNode[] {
    return Array.from(this.nodes.values());
  }

  getEdges(): NetworkEdge[] {
    return Array.from(this.edges.values());
  }
}
