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
    </div>
  )
}
