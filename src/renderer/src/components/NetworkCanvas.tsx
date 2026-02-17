import { forwardRef, useImperativeHandle } from "react"
import type { NetworkNode, NetworkEdge } from "@/types"
import { useD3Simulation } from "@/hooks/useD3Simulation"
import type { LayoutMode } from "@/visualization/force-layout"

interface NetworkCanvasProps {
  nodes: NetworkNode[]
  edges: NetworkEdge[]
  layoutMode: LayoutMode
  onNodeHover: (node: NetworkNode | null, x: number, y: number) => void
  onNodeClick: (node: NetworkNode | null) => void
}

export interface NetworkCanvasHandle {
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void
}

export const NetworkCanvas = forwardRef<NetworkCanvasHandle, NetworkCanvasProps>(
  function NetworkCanvas(
    { nodes, edges, layoutMode, onNodeHover, onNodeClick },
    ref
  ) {
    const { svgRef, zoomIn, zoomOut, resetZoom } = useD3Simulation({
      nodes,
      edges,
      layoutMode,
      onNodeHover,
      onNodeClick,
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
