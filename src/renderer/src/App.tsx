import { useState, useCallback, useRef } from "react"
import type { NetworkNode, SignalType } from "@/types"
import type { LayoutMode } from "@/visualization/force-layout"
import { useScanner } from "@/hooks/useScanner"
import { useNetworkState } from "@/hooks/useNetworkState"
import { NetworkCanvas, type NetworkCanvasHandle } from "@/components/NetworkCanvas"
import { NodeTooltip } from "@/components/NodeTooltip"
import { Sidebar } from "@/components/Sidebar"
import { Controls } from "@/components/Controls"
import { Legend } from "@/components/Legend"

const ALL_TYPES: SignalType[] = [
  "this_device",
  "wifi",
  "lan",
  "bluetooth",
  "bonjour",
  "connection",
]

export default function App() {
  const canvasRef = useRef<NetworkCanvasHandle>(null)
  const { state, handleMessage } = useNetworkState()
  const { connected, pause, resume, scanNow } = useScanner(handleMessage)

  const [layoutMode, setLayoutMode] = useState<LayoutMode>("force")
  const [scanning, setScanning] = useState(true)
  const [filters, setFilters] = useState<Set<SignalType>>(new Set(ALL_TYPES))
  const [selectedNode, setSelectedNode] = useState<NetworkNode | null>(null)
  const [tooltip, setTooltip] = useState<{
    node: NetworkNode | null
    x: number
    y: number
  }>({ node: null, x: 0, y: 0 })

  const filteredNodes = state.nodes.filter((n) => filters.has(n.signalType))
  const filteredEdges = state.edges.filter(
    (e) =>
      filteredNodes.some((n) => n.id === e.source) &&
      filteredNodes.some((n) => n.id === e.target)
  )

  const handleToggleFilter = useCallback((type: SignalType) => {
    setFilters((prev) => {
      const next = new Set(prev)
      if (next.has(type)) {
        next.delete(type)
      } else {
        next.add(type)
      }
      return next
    })
  }, [])

  const handleToggleLayout = useCallback(() => {
    setLayoutMode((m) => (m === "force" ? "radial" : "force"))
  }, [])

  const handleToggleScanning = useCallback(() => {
    setScanning((s) => {
      const next = !s
      if (next) {
        resume()
      } else {
        pause()
      }
      return next
    })
  }, [pause, resume])

  const handleScanNow = useCallback(() => {
    scanNow()
  }, [scanNow])

  const handleNodeHover = useCallback(
    (node: NetworkNode | null, x: number, y: number) => {
      setTooltip({ node, x, y })
    },
    []
  )

  const handleNodeClick = useCallback((node: NetworkNode | null) => {
    setSelectedNode(node)
  }, [])

  return (
    <div className="dark h-screen w-screen flex overflow-hidden bg-background">
      {/* Draggable titlebar region for hiddenInset window style */}
      <div className="titlebar" />

      <Sidebar
        nodes={state.nodes}
        filters={filters}
        onToggleFilter={handleToggleFilter}
        onNodeClick={(n) => setSelectedNode(n)}
        selectedNode={selectedNode}
      />

      <main className="flex-1 relative">
        <NetworkCanvas
          ref={canvasRef}
          nodes={filteredNodes}
          edges={filteredEdges}
          layoutMode={layoutMode}
          onNodeHover={handleNodeHover}
          onNodeClick={handleNodeClick}
        />

        <Legend />

        <Controls
          layoutMode={layoutMode}
          onToggleLayout={handleToggleLayout}
          scanning={scanning}
          onToggleScanning={handleToggleScanning}
          onScanNow={handleScanNow}
          onZoomIn={() => canvasRef.current?.zoomIn()}
          onZoomOut={() => canvasRef.current?.zoomOut()}
          onResetZoom={() => canvasRef.current?.resetZoom()}
          connected={connected}
        />

        <NodeTooltip node={tooltip.node} x={tooltip.x} y={tooltip.y} />
      </main>
    </div>
  )
}
