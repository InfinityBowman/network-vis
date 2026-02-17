import { useState, useCallback, useRef, useEffect } from "react"
import type { NetworkNode, SignalType, PacketScannerStatus } from "@/types"
import type { LayoutMode } from "@/visualization/force-layout"
import { useScanner } from "@/hooks/useScanner"
import { useNetworkState } from "@/hooks/useNetworkState"
import { usePacketEvents } from "@/hooks/usePacketEvents"
import { useSubnetGroups } from "@/hooks/useSubnetGroups"
import { NetworkCanvas, type NetworkCanvasHandle } from "@/components/NetworkCanvas"
import { NodeTooltip } from "@/components/NodeTooltip"
import { Sidebar } from "@/components/Sidebar"
import { Controls } from "@/components/Controls"
import { Legend } from "@/components/Legend"
import { NodeDetailPanel } from "@/components/NodeDetailPanel"
import { TooltipProvider } from "@/components/ui/tooltip"

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
  const { getEventsForNode } = usePacketEvents()
  const { subnets, getSubnetForIp } = useSubnetGroups()

  const [layoutMode, setLayoutMode] = useState<LayoutMode>("force")
  const [scanning, setScanning] = useState(true)
  const [filters, setFilters] = useState<Set<SignalType>>(new Set(ALL_TYPES))
  const [selectedNode, setSelectedNode] = useState<NetworkNode | null>(null)
  const [tooltip, setTooltip] = useState<{
    node: NetworkNode | null
    x: number
    y: number
  }>({ node: null, x: 0, y: 0 })

  const [showSubnetGroups, setShowSubnetGroups] = useState(false)
  const [showTrafficFlow, setShowTrafficFlow] = useState(true)

  // Packet capture state
  const [packetCapturing, setPacketCapturing] = useState(false)
  const [captureStatus, setCaptureStatus] = useState<PacketScannerStatus | null>(null)

  // Keep selectedNode fresh when state updates (protocols may arrive later)
  const freshSelectedNode = selectedNode
    ? state.nodeMap.get(selectedNode.id) ?? selectedNode
    : null

  const filteredNodes = state.nodes.filter((n) => filters.has(n.signalType))
  const filteredEdges = state.edges.filter(
    (e) =>
      filteredNodes.some((n) => n.id === e.source) &&
      filteredNodes.some((n) => n.id === e.target)
  )

  // Fetch capture status on mount
  useEffect(() => {
    window.electron.packet.status().then((status) => {
      setCaptureStatus(status)
      setPacketCapturing(status.capturing)
    })
  }, [])

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

  const handleToggleSubnetGroups = useCallback(() => {
    setShowSubnetGroups((s) => !s)
  }, [])

  const handleToggleTrafficFlow = useCallback(() => {
    setShowTrafficFlow((s) => !s)
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

  const dismissTimer = useRef<ReturnType<typeof setTimeout>>()

  const handleNodeHover = useCallback(
    (node: NetworkNode | null, x: number, y: number) => {
      if (dismissTimer.current) {
        clearTimeout(dismissTimer.current)
        dismissTimer.current = undefined
      }
      if (node) {
        setTooltip({ node, x, y })
      } else {
        // Small delay prevents flicker when moving between adjacent nodes
        dismissTimer.current = setTimeout(() => {
          setTooltip({ node: null, x: 0, y: 0 })
        }, 150)
      }
    },
    []
  )

  const handleNodeClick = useCallback((node: NetworkNode | null) => {
    setSelectedNode(node)
  }, [])

  const handleStartCapture = useCallback(async () => {
    const result = await window.electron.packet.start()
    if (result.success) {
      setPacketCapturing(true)
      const status = await window.electron.packet.status()
      setCaptureStatus(status)
    } else {
      setCaptureStatus((prev) => prev ? { ...prev, error: result.error } : null)
    }
  }, [])

  const handleStopCapture = useCallback(async () => {
    await window.electron.packet.stop()
    setPacketCapturing(false)
    const status = await window.electron.packet.status()
    setCaptureStatus(status)
  }, [])

  const handleToggleCapture = useCallback(() => {
    if (packetCapturing) {
      handleStopCapture()
    } else {
      handleStartCapture()
    }
  }, [packetCapturing, handleStartCapture, handleStopCapture])

  return (
    <TooltipProvider delayDuration={200}>
    <div className="dark h-screen w-screen flex overflow-hidden bg-background">
      {/* Draggable titlebar region for hiddenInset window style */}
      <div className="titlebar" />

      <Sidebar
        nodes={state.nodes}
        filters={filters}
        onToggleFilter={handleToggleFilter}
        onNodeClick={(n) => setSelectedNode(n)}
        selectedNode={selectedNode}
        showSubnetGroups={showSubnetGroups}
        subnets={subnets}
        getSubnetForIp={getSubnetForIp}
      />

      <main className="flex-1 relative">
        <NetworkCanvas
          ref={canvasRef}
          nodes={filteredNodes}
          edges={filteredEdges}
          layoutMode={layoutMode}
          onNodeHover={handleNodeHover}
          onNodeClick={handleNodeClick}
          showSubnetGroups={showSubnetGroups}
          getSubnetForIp={getSubnetForIp}
          showTrafficFlow={showTrafficFlow}
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
          packetCapturing={packetCapturing}
          onToggleCapture={handleToggleCapture}
          showSubnetGroups={showSubnetGroups}
          onToggleSubnetGroups={handleToggleSubnetGroups}
          showTrafficFlow={showTrafficFlow}
          onToggleTrafficFlow={handleToggleTrafficFlow}
        />

        <NodeTooltip node={tooltip.node} x={tooltip.x} y={tooltip.y} />

        {/* Node detail panel — slides in from right when node selected */}
        {freshSelectedNode && (
          <NodeDetailPanel
            node={freshSelectedNode}
            events={getEventsForNode(freshSelectedNode.id)}
            onClose={() => setSelectedNode(null)}
            capturing={packetCapturing}
            onStartCapture={handleStartCapture}
            onStopCapture={handleStopCapture}
            captureStatus={captureStatus}
          />
        )}
      </main>
    </div>
    </TooltipProvider>
  )
}
