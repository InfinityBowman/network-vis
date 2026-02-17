import { useCallback, useRef, useState } from "react"
import type { NetworkNode, NetworkEdge, ScannerMessage } from "@/types"

export interface NetworkState {
  nodes: NetworkNode[]
  edges: NetworkEdge[]
  nodeMap: Map<string, NetworkNode>
}

export function useNetworkState() {
  const nodeMapRef = useRef(new Map<string, NetworkNode>())
  const edgeMapRef = useRef(new Map<string, NetworkEdge>())
  const [state, setState] = useState<NetworkState>({
    nodes: [],
    edges: [],
    nodeMap: new Map(),
  })

  const handleMessage = useCallback((msg: ScannerMessage) => {
    if (msg.type === "full_state") {
      nodeMapRef.current = new Map(msg.nodes.map((n) => [n.id, n]))
      edgeMapRef.current = new Map(msg.edges.map((e) => [e.id, e]))
    } else if (msg.type === "node_update") {
      for (const node of msg.nodes) {
        nodeMapRef.current.set(node.id, node)
      }
      for (const edge of msg.edges) {
        edgeMapRef.current.set(edge.id, edge)
      }
      for (const id of msg.removed) {
        nodeMapRef.current.delete(id)
        // Remove edges referencing removed nodes
        for (const [edgeId, edge] of edgeMapRef.current) {
          if (edge.source === id || edge.target === id) {
            edgeMapRef.current.delete(edgeId)
          }
        }
      }
    }

    setState({
      nodes: Array.from(nodeMapRef.current.values()),
      edges: Array.from(edgeMapRef.current.values()),
      nodeMap: new Map(nodeMapRef.current),
    })
  }, [])

  return { state, handleMessage }
}
