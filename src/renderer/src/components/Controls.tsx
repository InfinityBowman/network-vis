import type { LayoutMode } from "@/visualization/force-layout"
import {
  ZoomIn,
  ZoomOut,
  Maximize,
  LayoutGrid,
  Circle,
  Pause,
  Play,
  RefreshCw,
  Radio,
  GitBranch,
  Activity,
} from "lucide-react"

interface ControlsProps {
  layoutMode: LayoutMode
  onToggleLayout: () => void
  scanning: boolean
  onToggleScanning: () => void
  onScanNow: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onResetZoom: () => void
  connected: boolean
  packetCapturing: boolean
  onToggleCapture: () => void
  showSubnetGroups: boolean
  onToggleSubnetGroups: () => void
  showTrafficFlow: boolean
  onToggleTrafficFlow: () => void
}

export function Controls({
  layoutMode,
  onToggleLayout,
  scanning,
  onToggleScanning,
  onScanNow,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  connected,
  packetCapturing,
  onToggleCapture,
  showSubnetGroups,
  onToggleSubnetGroups,
  showTrafficFlow,
  onToggleTrafficFlow,
}: ControlsProps) {
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-card/90 backdrop-blur border border-border rounded-lg px-2 py-1.5 shadow-lg">
      {/* Connection status */}
      <div className="flex items-center gap-1.5 px-2 mr-1 border-r border-border pr-3">
        <div
          className={`w-2 h-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`}
        />
        <span className="text-[10px] text-muted-foreground">
          {connected ? "Live" : "Offline"}
        </span>
      </div>

      {/* Layout toggle */}
      <button
        onClick={onToggleLayout}
        className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        title={`Switch to ${layoutMode === "force" ? "radial" : "force"} layout`}
      >
        {layoutMode === "force" ? (
          <Circle className="w-4 h-4" />
        ) : (
          <LayoutGrid className="w-4 h-4" />
        )}
      </button>

      {/* Subnet grouping toggle */}
      <button
        onClick={onToggleSubnetGroups}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors ${
          showSubnetGroups
            ? "bg-teal-500/20 text-teal-400 hover:bg-teal-500/30"
            : "text-muted-foreground hover:bg-accent hover:text-foreground"
        }`}
        title={showSubnetGroups ? "Hide subnet groups" : "Show subnet groups"}
      >
        <GitBranch className="w-3.5 h-3.5" />
        <span>Subnets</span>
      </button>

      {/* Traffic flow toggle */}
      <button
        onClick={onToggleTrafficFlow}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors ${
          showTrafficFlow
            ? "bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30"
            : "text-muted-foreground hover:bg-accent hover:text-foreground"
        }`}
        title={showTrafficFlow ? "Hide traffic flow" : "Show traffic flow"}
      >
        <Activity className="w-3.5 h-3.5" />
        <span>Traffic</span>
      </button>

      <div className="w-px h-5 bg-border mx-1" />

      {/* Zoom */}
      <button
        onClick={onZoomOut}
        className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        title="Zoom out"
      >
        <ZoomOut className="w-4 h-4" />
      </button>
      <button
        onClick={onResetZoom}
        className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        title="Reset zoom"
      >
        <Maximize className="w-4 h-4" />
      </button>
      <button
        onClick={onZoomIn}
        className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        title="Zoom in"
      >
        <ZoomIn className="w-4 h-4" />
      </button>

      <div className="w-px h-5 bg-border mx-1" />

      {/* Scan controls */}
      <button
        onClick={onToggleScanning}
        className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        title={scanning ? "Pause scanning" : "Resume scanning"}
      >
        {scanning ? (
          <Pause className="w-4 h-4" />
        ) : (
          <Play className="w-4 h-4" />
        )}
      </button>
      <button
        onClick={onScanNow}
        className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        title="Scan now"
      >
        <RefreshCw className="w-4 h-4" />
      </button>

      <div className="w-px h-5 bg-border mx-1" />

      {/* DPI capture */}
      <button
        onClick={onToggleCapture}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors ${
          packetCapturing
            ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
            : "text-muted-foreground hover:bg-accent hover:text-foreground"
        }`}
        title={packetCapturing ? "Stop packet capture" : "Start packet capture (DPI)"}
      >
        <Radio className="w-3.5 h-3.5" />
        <span>{packetCapturing ? "Stop DPI" : "DPI"}</span>
      </button>
    </div>
  )
}
