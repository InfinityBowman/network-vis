import { forwardRef, useImperativeHandle } from "react"
import type { NetworkNode, NetworkEdge, SubnetInfo } from "@/types"
import { useD3Simulation } from "@/hooks/useD3Simulation"
import type { LayoutMode } from "@/visualization/force-layout"

interface NetworkCanvasProps {
  nodes: NetworkNode[]
  edges: NetworkEdge[]
  layoutMode: LayoutMode
  onNodeHover: (node: NetworkNode | null, x: number, y: number) => void
  onNodeClick: (node: NetworkNode | null) => void
  showSubnetGroups: boolean
  getSubnetForIp: (ip: string) => SubnetInfo | undefined
  showTrafficFlow: boolean
}

export interface NetworkCanvasHandle {
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void
}

export const NetworkCanvas = forwardRef<NetworkCanvasHandle, NetworkCanvasProps>(
  function NetworkCanvas(
    { nodes, edges, layoutMode, onNodeHover, onNodeClick, showSubnetGroups, getSubnetForIp, showTrafficFlow },
    ref
  ) {
    const { svgRef, zoomIn, zoomOut, resetZoom } = useD3Simulation({
      nodes,
      edges,
      layoutMode,
      onNodeHover,
      onNodeClick,
      showSubnetGroups,
      getSubnetForIp,
      showTrafficFlow,
    })

    useImperativeHandle(ref, () => ({ zoomIn, zoomOut, resetZoom }), [
      zoomIn,
      zoomOut,
      resetZoom,
    ])

    return (
      <svg
        ref={svgRef}
        className="w-full h-full"
        style={{ background: "transparent" }}
      />
    )
  }
)
